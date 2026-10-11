import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Transfer } from "../shared/contracts";
export async function fixture(options: Record<string, unknown> = {}) {
  const script = (
    await build({
      entryPoints: ["worker/index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
    })
  ).outputFiles[0].text;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      r2Buckets: ["LOCAL_BUCKET"],
      bindings: {
        APP_ENV: "local",
        PILOT_ENABLED: "true",
        APP_ORIGIN: "http://localhost",
        AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
        MAIL_FROM: "test@example.test",
      },
      ...options,
    }),
  );
  const db = await mf.getD1Database("DB");
  const migration = (
    await Promise.all(
      (await readdir("migrations"))
        .sort()
        .map((name) => readFile(`migrations/${name}`, "utf8")),
    )
  ).join("\n");
  const statements = migration
    .replace(/^--.*$/gm, "")
    .split(/;\s*(?=(?:CREATE|ALTER|PRAGMA)|$)/)
    .filter((x) => x.trim());
  for (const sql of statements) await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO users(id,email,name,role,created_at) VALUES('admin','admin@example.test','Admin','admin',0),('alice','alice@example.test','Alice','user',0),('bob','bob@example.test','Bob','user',0)",
    )
    .run();
  const cookieFor = async (user = "alice") => {
    const token = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      )
      .bind(
        createHash("sha256").update(token).digest("hex"),
        user,
        Date.now() + 86400_000,
      )
      .run();
    return `cloudlight_session=${token}`;
  };
  const call = async (
    path: string,
    method = "GET",
    data?: unknown,
    cookie?: string,
    extra: Record<string, string> = {},
  ) => {
    const response = await mf.dispatchFetch(`http://localhost/api${path}`, {
      method,
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const result = (await response.json()) as any;
    return { status: response.status, data: result, headers: response.headers };
  };
  const transfer = async (cookie: string, size = 100, name = "sample.bin") => {
    const r = await call(
      "/transfers",
      "POST",
      {
        requestId: crypto.randomUUID(),
        recipient: "friend@example.test",
        message: "Olá!",
        files: [
          { name, size, lastModified: 123, type: "application/octet-stream" },
        ],
      },
      cookie,
    );
    if (r.status !== 201) throw new Error(JSON.stringify(r));
    return r.data as Transfer;
  };
  return { mf, db, call, cookieFor, transfer };
}
