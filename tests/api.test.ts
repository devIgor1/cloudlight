import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture } from "./helpers";
import { LIMITS } from "../shared/contracts";
let f: Awaited<ReturnType<typeof fixture>>,
  alice: string,
  bob: string,
  admin: string;
before(async () => {
  f = await fixture();
  alice = await f.cookieFor();
  bob = await f.cookieFor("bob");
  admin = await f.cookieFor("admin");
});
after(async () => {
  await f.mf.dispose();
});
async function reset() {
  await f.db.prepare("DELETE FROM rate_limits").run();
  await f.db.prepare("DELETE FROM daily_usage").run();
}
async function loginChallenge() {
  await reset();
  await f.db.prepare("UPDATE challenges SET created_at=0").run();
  const r = await f.call("/auth/request", "POST", {
    email: "alice@example.test",
  });
  assert.equal(r.status, 200);
  await f.mf.getBindings();
  for (let n = 0; n < 100; n++) {
    const inbox = await f.call("/dev/inbox");
    const message = inbox.data.find(
      (m: any) => m.recipient === "alice@example.test" && m.id,
    );
    if (message) {
      const row = await f.db
        .prepare("SELECT id FROM outbox WHERE challenge_id=? AND status='sent'")
        .bind(r.data.challengeId)
        .first<{ id: string }>();
      const current = inbox.data.find((m: any) => m.id === row?.id);
      if (current)
        return {
          id: r.data.challengeId,
          code: current.text.match(/\b\d{6}\b/)[0],
        };
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Mailbox did not receive OTP");
}
async function upload(t: any, data: Uint8Array) {
  const fid = t.files[0].id;
  assert.equal(
    (await f.call(`/files/${fid}/start`, "POST", {}, alice)).status,
    200,
  );
  const md5 = createHash("md5").update(data).digest("base64");
  const a = await f.call(
    `/files/${fid}/authorize`,
    "POST",
    { number: 1, md5 },
    alice,
  );
  assert.equal(a.status, 200);
  const r = await f.mf.dispatchFetch(`http://localhost${a.data.url}`, {
    method: "PUT",
    headers: {
      origin: "http://localhost",
      ...a.data.headers,
      "content-length": String(data.length),
    },
    body: data,
  });
  assert.equal(r.status, 200);
  const complete = await f.call(`/files/${fid}/finish`, "POST", {}, alice);
  assert.equal(complete.status, 200, JSON.stringify(complete));
  return f.call(`/transfers/${t.id}/finish`, "POST", {}, alice);
}
test("private API, CSRF and admin roles are enforced", async () => {
  assert.equal((await f.call("/me")).status, 401);
  assert.equal(
    (await f.call("/admin/overview", "GET", undefined, alice)).status,
    403,
  );
  assert.equal(
    (
      await f.call("/auth/logout", "POST", {}, alice, {
        origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal((await f.call("/me", "GET", undefined, alice)).status, 200);
});
test("unknown email is not invited and sends no mail", async () => {
  await reset();
  const r = await f.call("/auth/request", "POST", {
    email: "stranger@example.test",
  });
  assert.equal(r.status, 200);
  assert.ok(r.data.challengeId);
  assert.equal(
    await f.db
      .prepare("SELECT id FROM challenges WHERE id=?")
      .bind(r.data.challengeId)
      .first(),
    null,
  );
});
test("OTP is hashed, consumed once, and sets protected cookies", async () => {
  const c = await loginChallenge();
  const raw = await f.db
    .prepare("SELECT code_hash FROM challenges WHERE id=?")
    .bind(c.id)
    .first<{ code_hash: string }>();
  assert.notEqual(raw!.code_hash, c.code);
  const out = await f.db
    .prepare("SELECT payload FROM outbox WHERE challenge_id=?")
    .bind(c.id)
    .first<{ payload: string }>();
  assert.ok(!out!.payload.includes(c.code));
  const results = await Promise.all([
    f.call("/auth/verify", "POST", { challengeId: c.id, code: c.code }),
    f.call("/auth/verify", "POST", { challengeId: c.id, code: c.code }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const cookie = results
    .find((r) => r.status === 200)!
    .headers.get("set-cookie");
  assert.match(cookie!, /HttpOnly/);
  assert.match(cookie!, /SameSite=Lax/);
});
test("expired OTP and the sixth attempt cannot authenticate", async () => {
  const c = await loginChallenge();
  await f.db
    .prepare("UPDATE challenges SET expires_at=0 WHERE id=?")
    .bind(c.id)
    .run();
  assert.equal(
    (await f.call("/auth/verify", "POST", { challengeId: c.id, code: c.code }))
      .status,
    400,
  );
  const d = await loginChallenge();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await f.call("/auth/verify", "POST", {
          challengeId: d.id,
          code: d.code === "000000" ? "111111" : "000000",
        })
      ).status,
      400,
    );
  assert.equal(
    (await f.call("/auth/verify", "POST", { challengeId: d.id, code: d.code }))
      .status,
    400,
  );
});
test("login resend cooldown and invalid email validation", async () => {
  await reset();
  await f.db.prepare("UPDATE challenges SET created_at=0").run();
  assert.equal(
    (await f.call("/auth/request", "POST", { email: "alice@example.test" }))
      .status,
    200,
  );
  assert.equal(
    (await f.call("/auth/request", "POST", { email: "alice@example.test" }))
      .status,
    429,
  );
  assert.equal(
    (await f.call("/auth/request", "POST", { email: "bad" })).status,
    400,
  );
});
test("1 GB limit is checked across all files", async () => {
  const r = await f.call(
    "/transfers",
    "POST",
    {
      requestId: crypto.randomUUID(),
      recipient: "x@example.test",
      message: "",
      files: [
        { name: "a", size: 600_000_000, lastModified: 0 },
        { name: "b", size: 500_000_000, lastModified: 0 },
      ],
    },
    alice,
  );
  assert.equal(r.status, 413);
  assert.equal(
    (
      await f.call(
        "/transfers",
        "POST",
        {
          requestId: crypto.randomUUID(),
          recipient: "invalid",
          message: "",
          files: [{ name: "a", size: 10, lastModified: 0 }],
        },
        alice,
      )
    ).status,
    400,
  );
});
test("creation is idempotent, and another user cannot inspect, upload or revoke it", async () => {
  const payload = {
    requestId: crypto.randomUUID(),
    recipient: "x@example.test",
    message: "",
    files: [{ name: "a", size: 100, lastModified: 0 }],
  };
  const [a, b] = await Promise.all([
    f.call("/transfers", "POST", payload, alice),
    f.call("/transfers", "POST", payload, alice),
  ]);
  assert.equal(a.data.id, b.data.id);
  const changed = await f.call(
    "/transfers",
    "POST",
    { ...payload, recipient: "different@example.test" },
    alice,
  );
  assert.equal(changed.status, 409);
  assert.equal(changed.data.code, "REQUEST_CONFLICT");
  assert.equal(
    (await f.call(`/transfers/${a.data.id}`, "GET", undefined, bob)).status,
    404,
  );
  assert.equal(
    (await f.call(`/files/${a.data.files[0].id}/start`, "POST", {}, bob))
      .status,
    404,
  );
  assert.equal(
    (await f.call(`/transfers/${a.data.id}/revoke`, "POST", {}, bob)).status,
    404,
  );
});
test("simultaneous reservations cannot exceed shared 8 GB cap", async () => {
  await f.db.prepare("UPDATE transfers SET status='deleted'").run();
  for (let n = 0; n < 7; n++) await f.transfer(alice, LIMITS.transfer);
  const payload = (n: number) => ({
    requestId: crypto.randomUUID(),
    recipient: "x@example.test",
    message: "",
    files: [{ name: String(n), size: LIMITS.transfer, lastModified: 0 }],
  });
  const results = await Promise.all([
    f.call("/transfers", "POST", payload(1), alice),
    f.call("/transfers", "POST", payload(2), bob),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const row = await f.db
    .prepare("SELECT SUM(total_bytes) n FROM transfers WHERE status!='deleted'")
    .first<{ n: number }>();
  assert.equal(row!.n, 8_000_000_000);
  await f.db.prepare("UPDATE transfers SET status='deleted'").run();
});
test("upload rejects altered checksums, missing parts and invalid part numbers", async () => {
  const t = await f.transfer(alice, 100);
  const fid = t.files[0].id;
  await f.call(`/files/${fid}/start`, "POST", {}, alice);
  const md5 = createHash("md5").update(new Uint8Array(100)).digest("base64");
  const signed = await f.call(
    `/files/${fid}/authorize`,
    "POST",
    { number: 1, md5 },
    alice,
  );
  assert.equal(
    (await f.call(`/files/${fid}/authorize`, "POST", { number: 2, md5 }, alice))
      .status,
    400,
  );
  assert.equal(
    (
      await f.call(
        `/files/${fid}/authorize`,
        "POST",
        {
          number: 1,
          md5: createHash("md5").update("changed").digest("base64"),
        },
        alice,
      )
    ).status,
    409,
  );
  const bad = await f.mf.dispatchFetch(`http://localhost${signed.data.url}`, {
    method: "PUT",
    headers: {
      origin: "http://localhost",
      ...signed.data.headers,
      "content-length": "100",
    },
    body: new Uint8Array(100).fill(1),
  });
  assert.equal(bad.status, 400);
  assert.equal(
    (await f.call(`/files/${fid}/finish`, "POST", {}, alice)).status,
    409,
  );
  assert.equal(
    (await f.call(`/transfers/${t.id}/finish`, "POST", {}, alice)).status,
    409,
  );
});
test("complete upload, resumed parts, repeated completion, ranged download and revocation", async () => {
  const data = crypto.getRandomValues(new Uint8Array(2048)),
    t = await f.transfer(alice, data.length);
  const result = await upload(t, data);
  assert.equal(result.status, 200);
  assert.equal(result.data.status, "ready");
  assert.ok(result.data.expires_at - Date.now() > 47 * 3600_000);
  const token = result.data.link.split("/").at(-1);
  const again = await f.call(`/transfers/${t.id}/finish`, "POST", {}, alice);
  assert.equal(again.data.link, result.data.link);
  const jobs = await f.db
    .prepare("SELECT COUNT(*) n FROM outbox WHERE transfer_id=?")
    .bind(t.id)
    .first<{ n: number }>();
  assert.equal(jobs!.n, 1);
  const d = await f.mf.dispatchFetch(
    `http://localhost/api/public/${token}/files/${t.files[0].id}`,
  );
  assert.equal(d.status, 200);
  assert.deepEqual(new Uint8Array(await d.arrayBuffer()), data);
  assert.equal(d.headers.get("cache-control"), "no-store, private");
  const range = await f.mf.dispatchFetch(
    `http://localhost/api/public/${token}/files/${t.files[0].id}`,
    { headers: { range: "bytes=10-29" } },
  );
  assert.equal(range.status, 206);
  assert.deepEqual(
    new Uint8Array(await range.arrayBuffer()),
    data.slice(10, 30),
  );
  const suffix = await f.mf.dispatchFetch(
    `http://localhost/api/public/${token}/files/${t.files[0].id}`,
    { headers: { range: "bytes=-10" } },
  );
  assert.deepEqual(new Uint8Array(await suffix.arrayBuffer()), data.slice(-10));
  await f.call(`/transfers/${t.id}/revoke`, "POST", {}, alice);
  assert.equal((await f.call(`/public/${token}`)).status, 410);
  const usage = await f.call("/admin/overview", "GET", undefined, admin);
  assert.ok(usage.data.usage.pending >= data.length);
});
test("expiry blocks download independently of cleanup", async () => {
  const t = await f.transfer(alice, 30);
  const r = await upload(t, new Uint8Array(30));
  const token = r.data.link.split("/").at(-1);
  await f.db
    .prepare("UPDATE transfers SET expires_at=? WHERE id=?")
    .bind(Date.now() - 1, t.id)
    .run();
  assert.equal((await f.call(`/public/${token}`)).status, 410);
  assert.equal(
    (
      await f.mf.dispatchFetch(
        `http://localhost/api/public/${token}/files/${t.files[0].id}`,
      )
    ).status,
    410,
  );
  assert.equal((await f.call("/public/invalid")).status, 404);
});
test("cleanup waits for authorization expiry and then releases bytes after storage deletion", async () => {
  await f.db.prepare("UPDATE transfers SET status='deleted'").run();
  const t = await f.transfer(alice, 50);
  await upload(t, new Uint8Array(50));
  await f.call(`/transfers/${t.id}/revoke`, "POST", {}, alice);
  await f.call("/admin/maintenance", "POST", {}, admin);
  assert.equal(
    (await f.db
      .prepare("SELECT status FROM transfers WHERE id=?")
      .bind(t.id)
      .first<{ status: string }>())!.status,
    "revoked",
  );
  await f.db
    .prepare("UPDATE files SET auth_until=0 WHERE transfer_id=?")
    .bind(t.id)
    .run();
  const r = await f.call("/admin/maintenance", "POST", {}, admin);
  assert.equal(r.status, 200);
  assert.equal(r.data.removed, 1);
  assert.equal(
    (await f.db
      .prepare("SELECT status FROM transfers WHERE id=?")
      .bind(t.id)
      .first<{ status: string }>())!.status,
    "deleted",
  );
  assert.equal(
    await (await f.mf.getR2Bucket("LOCAL_BUCKET")).head(t.files[0].object_key),
    null,
  );
});
test("email quota is atomic and retry leaves files intact", async () => {
  await reset();
  await f.db
    .prepare("INSERT INTO daily_usage(day,kind,used) VALUES(?,?,250)")
    .bind(new Date().toISOString().slice(0, 10), "email")
    .run();
  const t = await f.transfer(alice, 50);
  await upload(t, new Uint8Array(50));
  await f.call("/admin/maintenance", "POST", {}, admin);
  const row = await f.db
    .prepare("SELECT status,last_error FROM outbox WHERE transfer_id=?")
    .bind(t.id)
    .first<{ status: string; last_error: string }>();
  assert.equal(row!.status, "pending");
  assert.equal(row!.last_error, "DAILY_QUOTA");
  assert.equal(
    (await f.db
      .prepare("SELECT used FROM daily_usage WHERE kind='email'")
      .first<{ used: number }>())!.used,
    250,
  );
  assert.equal(
    (await f.db
      .prepare("SELECT status FROM transfers WHERE id=?")
      .bind(t.id)
      .first<{ status: string }>())!.status,
    "ready",
  );
});
test("deactivating a user blocks existing sessions; 100 invite limit is enforced", async () => {
  await reset();
  assert.equal(
    (await f.call("/admin/users/bob", "PATCH", { active: false }, admin))
      .status,
    200,
  );
  assert.equal((await f.call("/me", "GET", undefined, bob)).status, 401);
  assert.equal(
    (await f.call("/admin/users/admin", "PATCH", { active: false }, admin))
      .status,
    400,
  );
  for (let n = 3; n < 100; n++)
    await f.db
      .prepare(
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'user',0)",
      )
      .bind(String(n), `u${n}@example.test`, String(n))
      .run();
  const r = await f.call(
    "/admin/invites",
    "POST",
    { name: "Too many", email: "extra@example.test" },
    admin,
  );
  assert.equal(r.status, 409);
});
test("API quota blocks without charging another unit", async () => {
  await reset();
  const today = new Date().toISOString().slice(0, 10);
  await f.db
    .prepare(
      "INSERT INTO daily_usage(day,kind,used) VALUES(?,'api_requests',10000)",
    )
    .bind(today)
    .run();
  assert.equal((await f.call("/me", "GET", undefined, alice)).status, 429);
  assert.equal(
    (await f.db
      .prepare("SELECT used FROM daily_usage WHERE kind='api_requests'")
      .first<{ used: number }>())!.used,
    10000,
  );
});
