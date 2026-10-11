import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { fixture } from "./helpers";

const secret = "test-secret-at-least-thirty-two-characters";
const bindings = (mode: string) => ({
  APP_ENV: "production",
  PILOT_ENABLED: mode,
  APP_ORIGIN: "http://localhost",
  AUTH_SECRET: secret,
  MAIL_FROM: "test@example.test",
});

test("closed or unknown pilot modes deny all production API access", async () => {
  for (const mode of ["false", "typo"]) {
    const f = await fixture({ bindings: bindings(mode) });
    try {
      const admin = await f.cookieFor("admin");
      assert.equal((await f.call("/health")).status, 503);
      assert.equal((await f.call("/me", "GET", undefined, admin)).status, 503);
      assert.equal(
        (await f.call("/auth/request", "POST", { email: "admin@example.test" }))
          .status,
        503,
      );
    } finally {
      await f.mf.dispose();
    }
  }
});

test("provider validation permits only administrators and keeps public links private", async () => {
  const f = await fixture({ bindings: bindings("admin") });
  try {
    const admin = await f.cookieFor("admin");
    const alice = await f.cookieFor("alice");
    assert.equal((await f.call("/me", "GET", undefined, admin)).status, 200);
    assert.equal((await f.call("/me", "GET", undefined, alice)).status, 503);
    assert.equal((await f.call("/public/validation-token")).status, 401);
    assert.equal(
      (await f.call("/public/validation-token", "GET", undefined, alice))
        .status,
      503,
    );
    assert.equal(
      (await f.call("/dev/inbox", "GET", undefined, admin)).status,
      404,
    );

    for (const email of ["alice@example.test", "unknown@example.test"]) {
      const result = await f.call("/auth/request", "POST", { email });
      assert.equal(result.status, 200);
      assert.equal(
        await f.db
          .prepare("SELECT id FROM challenges WHERE id=?")
          .bind(result.data.challengeId)
          .first(),
        null,
      );
    }
    const requested = await f.call("/auth/request", "POST", {
      email: "admin@example.test",
    });
    assert.equal(requested.status, 200);
    assert.ok(
      await f.db
        .prepare("SELECT id FROM challenges WHERE id=? AND user_id='admin'")
        .bind(requested.data.challengeId)
        .first(),
    );

    // A code issued before changing the mode cannot create a guest session.
    const challengeId = randomUUID(),
      code = "123456";
    await f.db
      .prepare(
        "INSERT INTO challenges(id,user_id,code_hash,expires_at,created_at) VALUES(?,'alice',?,?,?)",
      )
      .bind(
        challengeId,
        createHmac("sha256", secret)
          .update(`${challengeId}:${code}`)
          .digest("hex"),
        Date.now() + 600000,
        Date.now(),
      )
      .run();
    assert.equal(
      (await f.call("/auth/verify", "POST", { challengeId, code })).status,
      400,
    );
  } finally {
    await f.mf.dispose();
  }
});
