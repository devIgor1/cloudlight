import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Response as MockResponse } from "miniflare";
import { fixture } from "./helpers";
import { unseal } from "../worker/core";
import type { Env } from "../worker/types";
const secret = "production-test-secret-at-least-32-characters";
const bindings = {
  APP_ENV: "production",
  PILOT_ENABLED: "true",
  APP_ORIGIN: "http://localhost",
  AUTH_SECRET: secret,
  B2_ENDPOINT: "https://s3.test.backblazeb2.com",
  B2_REGION: "test",
  B2_BUCKET: "private",
  B2_KEY_ID: "test-key-id",
  B2_APPLICATION_KEY: "test-key-secret",
  MAIL_FROM: "sender@example.test",
  BREVO_API_KEY: "test-mail-key",
};
test("Brevo transient failure retries encrypted OTP, permanent error is visible, secure cookie and no production inbox", async () => {
  let mailStatus = 503,
    attempts = 0;
  const f = await fixture({
    bindings,
    outboundService: async () => {
      attempts++;
      return new MockResponse("{}", { status: mailStatus });
    },
  });
  try {
    const requested = await f.call("/auth/request", "POST", {
      email: "alice@example.test",
    });
    assert.equal(requested.status, 200);
    let row: any;
    for (let i = 0; i < 100; i++) {
      row = await f.db
        .prepare("SELECT * FROM outbox WHERE challenge_id=?")
        .bind(requested.data.challengeId)
        .first();
      if (row?.last_error) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(row.status, "pending");
    assert.equal(row.last_error, "MAIL_TEMPORARY");
    assert.equal(attempts, 1);
    mailStatus = 201;
    await f.db
      .prepare("UPDATE outbox SET next_at=0 WHERE id=?")
      .bind(row.id)
      .run();
    const admin = await f.cookieFor("admin");
    await f.call("/admin/maintenance", "POST", {}, admin);
    assert.equal(
      (
        await f.db
          .prepare("SELECT status FROM outbox WHERE id=?")
          .bind(row.id)
          .first<any>()
      ).status,
      "sent",
    );
    assert.equal(attempts, 2);
    const mail = await unseal<{ text: string }>(
      { AUTH_SECRET: secret } as Env,
      row.payload,
    );
    const code = mail.text.match(/\b\d{6}\b/)![0];
    const verified = await f.call("/auth/verify", "POST", {
      challengeId: requested.data.challengeId,
      code,
    });
    assert.equal(verified.status, 200);
    assert.match(verified.headers.get("set-cookie")!, /; Secure/);
    assert.notEqual(
      (await f.call("/dev/inbox", "GET", undefined, admin)).status,
      200,
    );
    await f.db.prepare("UPDATE challenges SET created_at=0").run();
    await f.db.prepare("DELETE FROM rate_limits").run();
    mailStatus = 400;
    const rejected = await f.call("/auth/request", "POST", {
      email: "alice@example.test",
    });
    for (let i = 0; i < 100; i++) {
      row = await f.db
        .prepare("SELECT * FROM outbox WHERE challenge_id=?")
        .bind(rejected.data.challengeId)
        .first();
      if (row?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(row.status, "failed");
    assert.equal(row.last_error, "MAIL_REJECTED");
  } finally {
    await f.mf.dispose();
  }
});
test("S3 signatures bind key, multipart ID, number, length and checksum; cleanup failure retains reservation", async () => {
  let failDeletion = false;
  const f = await fixture({
    bindings,
    outboundService: async (request: Request) => {
      const url = new URL(request.url);
      assert.equal(url.hostname, "s3.test.backblazeb2.com");
      if (failDeletion) return new MockResponse("temporary", { status: 503 });
      if (request.method === "POST")
        return new MockResponse(
          "<InitiateMultipartUploadResult><UploadId>upload-only-this-file</UploadId></InitiateMultipartUploadResult>",
        );
      if (url.searchParams.has("versions"))
        return new MockResponse(
          "<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>",
        );
      return new MockResponse(
        "<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>",
      );
    },
  });
  try {
    const alice = await f.cookieFor(),
      admin = await f.cookieFor("admin"),
      t = await f.transfer(alice, 100),
      fid = t.files[0].id;
    assert.equal(
      (await f.call(`/files/${fid}/start`, "POST", {}, alice)).status,
      200,
    );
    const md5 = createHash("md5").update(new Uint8Array(100)).digest("base64");
    const result = await f.call(
      `/files/${fid}/authorize`,
      "POST",
      { number: 1, md5 },
      alice,
    );
    assert.equal(result.status, 200);
    const url = new URL(result.data.url);
    assert.equal(url.searchParams.get("uploadId"), "upload-only-this-file");
    assert.equal(url.searchParams.get("partNumber"), "1");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.match(url.pathname, new RegExp(`${fid}$`));
    assert.match(
      url.searchParams.get("X-Amz-SignedHeaders")!,
      /content-length/,
    );
    assert.match(url.searchParams.get("X-Amz-SignedHeaders")!, /content-md5/);
    assert.equal(result.data.headers["Content-MD5"], md5);
    assert.ok(
      !JSON.stringify(result.data).includes(bindings.B2_APPLICATION_KEY),
    );
    await f.db
      .prepare(
        "UPDATE daily_usage SET used=1800 WHERE kind='storage_operations'",
      )
      .run();
    assert.equal(
      (
        await f.call(
          `/files/${fid}/authorize`,
          "POST",
          { number: 1, md5 },
          alice,
        )
      ).status,
      429,
    );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT used FROM daily_usage WHERE kind='storage_operations'",
          )
          .first<any>()
      ).used,
      1800,
    );
    await f.db
      .prepare("UPDATE daily_usage SET used=0 WHERE kind='storage_operations'")
      .run();
    await f.call(`/transfers/${t.id}/revoke`, "POST", {}, alice);
    await f.db
      .prepare("UPDATE files SET auth_until=0 WHERE id=?")
      .bind(fid)
      .run();
    failDeletion = true;
    const first = await f.call("/admin/maintenance", "POST", {}, admin);
    assert.equal(first.data.failed, 1);
    assert.equal(
      (
        await f.db
          .prepare("SELECT status FROM transfers WHERE id=?")
          .bind(t.id)
          .first<any>()
      ).status,
      "cancelled",
    );
    failDeletion = false;
    const second = await f.call("/admin/maintenance", "POST", {}, admin);
    assert.equal(second.data.removed, 1);
    assert.equal(
      (
        await f.db
          .prepare("SELECT status FROM transfers WHERE id=?")
          .bind(t.id)
          .first<any>()
      ).status,
      "deleted",
    );
  } finally {
    await f.mf.dispose();
  }
});

test("resume reconciles an upstream completion after the final HEAD failed", async () => {
  const raw = Buffer.alloc(65536, 73);
  const md5 = createHash("md5").update(raw).digest("hex");
  const etag =
    createHash("md5").update(Buffer.from(md5, "hex")).digest("hex") + "-1";
  let completed = false,
    failHead = true,
    completionCalls = 0;
  const f = await fixture({
    bindings,
    outboundService: async (request: Request) => {
      const url = new URL(request.url);
      if (request.method === "HEAD") {
        if (!completed) return new MockResponse(null, { status: 404 });
        if (failHead) {
          failHead = false;
          return new MockResponse(null, { status: 503 });
        }
        return new MockResponse(null, {
          headers: { "content-length": String(raw.length), etag },
        });
      }
      if (url.searchParams.has("uploads"))
        return new MockResponse("<ListMultipartUploadsResult/>");
      if (request.method === "POST") {
        completed = true;
        completionCalls++;
        return new MockResponse(
          `<CompleteMultipartUploadResult><ETag>${etag}</ETag></CompleteMultipartUploadResult>`,
        );
      }
      if (completed)
        return new MockResponse("<Error><Code>NoSuchUpload</Code></Error>", {
          status: 404,
        });
      return new MockResponse(
        `<ListPartsResult><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><Size>${raw.length}</Size><ETag>${md5}</ETag></Part></ListPartsResult>`,
      );
    },
  });
  try {
    const cookie = await f.cookieFor();
    const transfer = await f.transfer(cookie, raw.length);
    const id = transfer.files[0].id;
    await f.db
      .prepare(
        "UPDATE files SET status='uploading',upload_id='completed-upstream' WHERE id=?",
      )
      .bind(id)
      .run();
    await f.db
      .prepare("INSERT INTO parts(file_id,number,size,md5) VALUES(?,1,?,?)")
      .bind(id, raw.length, createHash("md5").update(raw).digest("base64"))
      .run();
    assert.equal(
      (await f.call(`/files/${id}/finish`, "POST", {}, cookie)).status,
      500,
    );
    const resumed = await f.call(
      `/files/${id}/parts`,
      "GET",
      undefined,
      cookie,
    );
    assert.equal(resumed.status, 200);
    assert.deepEqual(resumed.data, { complete: true, parts: [] });
    assert.equal(completionCalls, 1);
    assert.equal(
      (
        await f.db
          .prepare("SELECT status FROM files WHERE id=?")
          .bind(id)
          .first<any>()
      ).status,
      "complete",
    );
  } finally {
    await f.mf.dispose();
  }
});
