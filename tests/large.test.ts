import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture } from "./helpers";
import { LIMITS } from "../shared/contracts";
for (const size of [50_000_000, 1_000_000_000])
  test(
    `stream ${size} bytes, resume and compare full SHA-256`,
    {
      skip: size > 50_000_000 && process.env.LARGE_TEST !== "1",
      timeout: 300_000,
    },
    async () => {
      const f = await fixture();
      try {
        const cookie = await f.cookieFor(),
          t = await f.transfer(cookie, size),
          fid = t.files[0].id;
        assert.equal(
          (await f.call(`/files/${fid}/start`, "POST", {}, cookie)).status,
          200,
        );
        const expected = createHash("sha256");
        const chunk = Buffer.alloc(LIMITS.part, 0x63);
        const count = Math.ceil(size / LIMITS.part);
        for (let number = 1; number <= count; number++) {
          const bytes = chunk.subarray(
            0,
            Math.min(LIMITS.part, size - (number - 1) * LIMITS.part),
          );
          expected.update(bytes);
          const md5 = createHash("md5").update(bytes).digest("base64");
          const signed = await f.call(
            `/files/${fid}/authorize`,
            "POST",
            { number, md5 },
            cookie,
          );
          assert.equal(signed.status, 200);
          const put = await f.mf.dispatchFetch(
            `http://localhost${signed.data.url}`,
            {
              method: "PUT",
              headers: {
                origin: "http://localhost",
                ...signed.data.headers,
                "content-length": String(bytes.length),
              },
              body: bytes,
            },
          );
          assert.equal(put.status, 200);
          await put.text();
          if (number === 2) {
            const newSession = await f.cookieFor();
            const resumed = await f.call(
              `/files/${fid}/parts`,
              "GET",
              undefined,
              newSession,
            );
            assert.equal(resumed.data.parts.length, 2);
            assert.equal(resumed.data.parts[0].size, LIMITS.part);
          }
        }
        assert.equal(
          (await f.call(`/files/${fid}/finish`, "POST", {}, cookie)).status,
          200,
        );
        const ready = await f.call(
          `/transfers/${t.id}/finish`,
          "POST",
          {},
          cookie,
        );
        assert.equal(ready.status, 200);
        const token = ready.data.link.split("/").at(-1);
        const response = await f.mf.dispatchFetch(
          `http://localhost/api/public/${token}/files/${fid}`,
        );
        assert.equal(response.status, 200);
        const actual = createHash("sha256");
        let received = 0;
        for await (const bytes of response.body!) {
          received += bytes.length;
          actual.update(bytes);
        }
        assert.equal(received, size);
        assert.equal(actual.digest("hex"), expected.digest("hex"));
      } finally {
        await f.mf.dispose();
      }
    },
  );
