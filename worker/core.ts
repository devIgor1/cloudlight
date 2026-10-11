import type { Env } from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export const assert: (
  condition: unknown,
  status: number,
  message: string,
  code?: string,
) => asserts condition = (condition, status, message, code) => {
  if (!condition) throw new ApiError(status, message, code);
};
export const local = (env: Env) => env.APP_ENV === "local";
export const id = () => crypto.randomUUID();
export const random = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export const stmt = (env: Env, sql: string, ...values: unknown[]) =>
  env.DB.prepare(sql).bind(...values);
export const one = <T>(env: Env, sql: string, ...values: unknown[]) =>
  stmt(env, sql, ...values).first<T>();
export const all = async <T>(env: Env, sql: string, ...values: unknown[]) =>
  (await stmt(env, sql, ...values).all<T>()).results;
export const run = (env: Env, sql: string, ...values: unknown[]) =>
  stmt(env, sql, ...values).run();
export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers });
const enc = new TextEncoder();
export async function hash(value: string, secret?: string) {
  const raw = secret
    ? await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey(
          "raw",
          enc.encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        ),
        enc.encode(value),
      )
    : await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(raw)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function cipherKey(env: Env) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode(env.AUTH_SECRET)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(env: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await cipherKey(env),
      enc.encode(JSON.stringify(value)),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...encrypted));
}
export async function unseal<T>(env: Env, value: string): Promise<T> {
  const raw = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: raw.slice(0, 12) },
        await cipherKey(env),
        raw.slice(12),
      ),
    ),
  );
}
export async function rate(
  env: Env,
  key: string,
  limit: number,
  interval: number,
) {
  const window = Math.floor(Date.now() / interval);
  const result = await one(
    env,
    `INSERT INTO rate_limits(key,window,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window, expires_at=excluded.expires_at WHERE window!=excluded.window OR count<? RETURNING key`,
    key,
    window,
    Date.now() + interval * 2,
    limit,
  );
  assert(
    result,
    429,
    "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "RATE_LIMIT",
  );
}
export async function spend(env: Env, kind: string, limit: number) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await one(
    env,
    `INSERT INTO daily_usage(day,kind,used) VALUES(?,?,1) ON CONFLICT(day,kind) DO UPDATE SET used=used+1 WHERE used<? RETURNING used`,
    day,
    kind,
    limit,
  );
  assert(
    row,
    429,
    "A cota diária foi atingida. Tente novamente amanhã.",
    "DAILY_QUOTA",
  );
}
export async function body(request: Request) {
  assert(
    Number(request.headers.get("content-length") || 0) <= 32_768,
    413,
    "Solicitação muito grande.",
  );
  const reader = request.body?.getReader();
  if (!reader) return {};
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.length;
    if (total > 32_768) {
      await reader.cancel();
      throw new ApiError(413, "Solicitação muito grande.");
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "JSON inválido.");
  }
}
