import { z } from "zod";
import SparkMD5 from "spark-md5";
import {
  createSchema,
  LIMITS,
  type Part,
  type Transfer,
  type TransferFile,
  type User,
} from "../shared/contracts";
import type { Env } from "./types";
import {
  all,
  assert,
  body,
  hash,
  id,
  json,
  local,
  one,
  random,
  run,
  seal,
  stmt,
  unseal,
} from "./core";
import { encryptedMail } from "./mail";
import { cleanEtag, multipartEtag, Storage } from "./storage";
export async function owned(env: Env, transferId: string, user: User) {
  const t = await one<Transfer>(
    env,
    "SELECT * FROM transfers WHERE id=?",
    transferId,
  );
  assert(
    t && (t.user_id === user.id || user.role === "admin"),
    404,
    "Transferência não encontrada.",
  );
  return t;
}
export async function details(env: Env, t: Transfer) {
  const files = await all<TransferFile>(
    env,
    "SELECT * FROM files WHERE transfer_id=? ORDER BY rowid",
    t.id,
  );
  const mail = await one<{ status: string }>(
    env,
    "SELECT status FROM outbox WHERE transfer_id=?",
    t.id,
  );
  const row = t as Transfer & { token_cipher?: string; token_hash?: string };
  const link =
    t.status === "ready" && t.expires_at! > Date.now() && row.token_cipher
      ? `${env.APP_ORIGIN}/t/${await unseal<string>(env, row.token_cipher)}`
      : undefined;
  const { token_cipher: _, token_hash: __, ...safe } = row;
  return {
    ...safe,
    status:
      t.status === "ready" && t.expires_at! <= Date.now()
        ? "expired"
        : t.status,
    files,
    mail_status: mail?.status,
    link,
  };
}
export async function createTransfer(request: Request, env: Env, user: User) {
  const data = createSchema.parse(await body(request));
  const total = data.files.reduce((n, f) => n + f.size, 0);
  assert(
    total <= LIMITS.transfer,
    413,
    "O limite é de 1 GB na soma de todos os arquivos.",
    "TRANSFER_LIMIT",
  );
  async function recover(existing: Transfer) {
    const saved = await details(env, existing);
    assert(
      saved.recipient === data.recipient &&
        saved.message === data.message &&
        saved.files.length === data.files.length &&
        saved.files.every((file, index) => {
          const input = data.files[index];
          return (
            file.name === input.name &&
            file.size === input.size &&
            file.type === input.type &&
            file.last_modified === input.lastModified
          );
        }),
      409,
      "Esta tentativa já criou uma transferência com outros dados. Retome ou revogue o envio pelo histórico.",
      "REQUEST_CONFLICT",
    );
    return json(saved);
  }
  const existing = await one<Transfer>(
    env,
    "SELECT * FROM transfers WHERE user_id=? AND request_id=?",
    user.id,
    data.requestId,
  );
  if (existing) return recover(existing);
  const tid = id(),
    now = Date.now();
  try {
    await env.DB.batch([
      stmt(
        env,
        "INSERT INTO transfers(id,request_id,user_id,recipient,message,total_bytes,created_at,upload_expires_at) VALUES(?,?,?,?,?,?,?,?)",
        tid,
        data.requestId,
        user.id,
        data.recipient,
        data.message,
        total,
        now,
        now + LIMITS.uploadLifetime,
      ),
      ...data.files.map((f) => {
        const fid = id();
        return stmt(
          env,
          "INSERT INTO files(id,transfer_id,name,size,type,last_modified,object_key) VALUES(?,?,?,?,?,?,?)",
          fid,
          tid,
          f.name,
          f.size,
          f.type,
          f.lastModified,
          `transfers/${tid}/${fid}`,
        );
      }),
    ]);
  } catch (e) {
    const repeated = await one<Transfer>(
      env,
      "SELECT * FROM transfers WHERE user_id=? AND request_id=?",
      user.id,
      data.requestId,
    );
    if (repeated) return recover(repeated);
    assert(
      !String(e).includes("STORAGE_LIMIT"),
      409,
      "O espaço do grupo está cheio. Aguarde a liberação de arquivos.",
      "STORAGE_LIMIT",
    );
    throw e;
  }
  return json(await details(env, await owned(env, tid, user)), 201);
}
export async function fileFor(
  env: Env,
  fid: string,
  user: User,
  requireUploading = true,
) {
  const file = await one<TransferFile>(
    env,
    "SELECT * FROM files WHERE id=?",
    fid,
  );
  assert(file, 404, "Arquivo não encontrado.");
  const t = await owned(env, file.transfer_id, user);
  if (requireUploading)
    assert(
      t.status === "uploading" && t.upload_expires_at > Date.now(),
      409,
      "Este envio não aceita mais alterações.",
    );
  return file;
}
async function lease<T>(
  env: Env,
  file: TransferFile,
  fn: (f: TransferFile) => Promise<T>,
): Promise<T> {
  const owner = id(),
    now = Date.now();
  const locked = await one<TransferFile>(
    env,
    "UPDATE files SET lease_until=?,lease_owner=? WHERE id=? AND lease_until<? RETURNING *",
    now + 120_000,
    owner,
    file.id,
    now,
  );
  assert(
    locked,
    409,
    "Este arquivo está sendo processado. Tente novamente em instantes.",
    "FILE_BUSY",
  );
  try {
    return await fn(locked);
  } finally {
    await run(
      env,
      "UPDATE files SET lease_until=0,lease_owner=NULL WHERE id=? AND lease_owner=?",
      file.id,
      owner,
    );
  }
}
export async function startFile(env: Env, file: TransferFile) {
  return lease(env, file, async (f) => {
    if (f.status === "complete") return json({ complete: true });
    if (!f.upload_id) {
      const uploadId = await new Storage(env).start(f);
      await run(
        env,
        "UPDATE files SET upload_id=?,status='uploading' WHERE id=?",
        uploadId,
        f.id,
      );
    }
    return json({ ok: true, partSize: LIMITS.part });
  });
}
export async function authorizePart(
  request: Request,
  env: Env,
  file: TransferFile,
) {
  const { number, md5 } = z
    .object({
      number: z.number().int().min(1),
      md5: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
    })
    .parse(await body(request));
  assert(
    file.upload_id && file.status === "uploading",
    409,
    "Inicie o arquivo antes de enviar as partes.",
  );
  const size = Math.min(LIMITS.part, file.size - (number - 1) * LIMITS.part);
  assert(size > 0, 400, "Número de parte inválido.");
  await run(
    env,
    "INSERT OR IGNORE INTO parts(file_id,number,size,md5) VALUES(?,?,?,?)",
    file.id,
    number,
    size,
    md5,
  );
  const part = await one<Part>(
    env,
    "SELECT * FROM parts WHERE file_id=? AND number=?",
    file.id,
    number,
  );
  assert(
    part?.md5 === md5 && part.size === size,
    409,
    "O arquivo selecionado é diferente do original. Cancele e inicie outro envio.",
    "FILE_CHANGED",
  );
  const expires = Date.now() + LIMITS.signedUrl;
  // Persist the last usable authorization before releasing a URL to the browser.
  const row = await one(
    env,
    `UPDATE files SET auth_until=MAX(auth_until,?) WHERE id=? AND status='uploading' AND EXISTS(SELECT 1 FROM transfers WHERE id=files.transfer_id AND status='uploading' AND upload_expires_at>?) RETURNING id`,
    expires,
    file.id,
    Date.now(),
  );
  assert(row, 409, "Este envio foi cancelado ou expirou.");
  return json(
    await new Storage(env).authorize(file, number, size, md5, expires),
  );
}
export async function completeFile(env: Env, file: TransferFile) {
  return lease(env, file, async (f) => {
    if (f.status === "complete") return json({ ok: true });
    assert(f.upload_id, 409, "Upload não iniciado.");
    const storage = new Storage(env);
    const claims = await all<Part>(
      env,
      "SELECT number,size,md5,etag FROM parts WHERE file_id=? ORDER BY number",
      f.id,
    );
    assert(
      claims.length === Math.ceil(f.size / LIMITS.part),
      409,
      "Ainda há partes para enviar.",
    );
    const expected = claims.map((p) => ({
      ...p,
      etag: [...atob(p.md5!)]
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    }));
    let head = await storage.head(f);
    if (!head) {
      const actual = await storage.parts(f);
      assert(
        actual.length === expected.length &&
          actual.every(
            (p, i) =>
              p.number === i + 1 &&
              p.size === expected[i].size &&
              cleanEtag(p.etag) === expected[i].etag,
          ),
        409,
        "As partes não passaram na verificação de integridade. Retome o envio.",
        "INTEGRITY",
      );
      await storage.complete(f, actual);
      head = await storage.head(f);
    }
    assert(
      head && head.size === f.size && head.etag === multipartEtag(expected),
      409,
      "O arquivo não passou na verificação de integridade.",
      "INTEGRITY",
    );
    await run(env, "UPDATE files SET status='complete' WHERE id=?", f.id);
    return json({ ok: true });
  });
}
export async function finalize(env: Env, t: Transfer, user: User) {
  if (t.status === "ready") return json(await details(env, t));
  assert(
    t.status === "uploading" && t.upload_expires_at > Date.now(),
    409,
    "Este envio não pode ser finalizado.",
  );
  const pending = await one<{ n: number }>(
    env,
    "SELECT COUNT(*) n FROM files WHERE transfer_id=? AND status!='complete'",
    t.id,
  );
  assert(
    pending?.n === 0,
    409,
    "Conclua todos os arquivos antes de finalizar.",
  );
  const token = random(),
    tokenHash = await hash(token),
    now = Date.now(),
    expires = now + LIMITS.lifetime;
  const link = `${env.APP_ORIGIN}/t/${token}`;
  const payload = await encryptedMail(
    env,
    `${user.name} enviou arquivos pelo Cloudlight`,
    `${user.name} compartilhou arquivos com você.\n\n${t.message}\n\nBaixe até ${new Date(expires).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília):\n${link}\n\nQuem tiver este link poderá baixar os arquivos enquanto ele estiver válido.`,
  );
  await env.DB.batch([
    stmt(
      env,
      "UPDATE transfers SET status='ready',expires_at=?,token_hash=?,token_cipher=? WHERE id=? AND status='uploading' AND upload_expires_at>?",
      expires,
      tokenHash,
      await seal(env, token),
      t.id,
      now,
    ),
    stmt(
      env,
      "INSERT OR IGNORE INTO outbox(id,transfer_id,recipient,payload,next_at,created_at,expires_at) SELECT ?,id,recipient,?,?,?,? FROM transfers WHERE id=? AND token_hash=?",
      id(),
      payload,
      now,
      now,
      expires,
      t.id,
      tokenHash,
    ),
  ]);
  return json(await details(env, await owned(env, t.id, user)));
}
export async function revoke(env: Env, t: Transfer) {
  await env.DB.batch([
    stmt(
      env,
      "UPDATE transfers SET status=CASE WHEN status='uploading' THEN 'cancelled' ELSE 'revoked' END WHERE id=? AND status IN ('uploading','ready')",
      t.id,
    ),
    stmt(
      env,
      "UPDATE outbox SET status='cancelled' WHERE transfer_id=? AND status='pending'",
      t.id,
    ),
  ]);
  return json({ ok: true });
}
export async function publicTransfer(env: Env, token: string) {
  assert(/^[\w-]{43}$/.test(token), 404, "Link não encontrado.");
  const t = await one<Transfer>(
    env,
    "SELECT t.*,u.name AS sender FROM transfers t JOIN users u ON u.id=t.user_id WHERE token_hash=?",
    await hash(token),
  );
  assert(t, 404, "Link não encontrado.");
  assert(
    t.status === "ready" && t.expires_at! > Date.now(),
    410,
    "Este link expirou ou foi revogado. Peça um novo envio.",
    "LINK_EXPIRED",
  );
  return t;
}
export async function localUpload(
  request: Request,
  env: Env,
  fid: string,
  number: number,
) {
  assert(local(env), 404, "Não encontrado.");
  const url = new URL(request.url),
    expires = Number(url.searchParams.get("expires"));
  const f = await one<TransferFile>(env, "SELECT * FROM files WHERE id=?", fid);
  const p = await one<Part>(
    env,
    "SELECT * FROM parts WHERE file_id=? AND number=?",
    fid,
    number,
  );
  assert(
    f && p && f.status === "uploading" && expires > Date.now(),
    403,
    "Autorização inválida.",
  );
  assert(
    url.searchParams.get("signature") ===
      (await hash(
        `${fid}:${number}:${p.size}:${p.md5}:${expires}`,
        env.AUTH_SECRET,
      )),
    403,
    "Autorização inválida.",
  );
  assert(
    request.headers.get("content-md5") === p.md5 &&
      Number(request.headers.get("content-length")) === p.size,
    400,
    "Parte inválida.",
  );
  const t = await one<Transfer>(
    env,
    "SELECT * FROM transfers WHERE id=?",
    f.transfer_id,
  );
  assert(
    t?.status === "uploading" && t.upload_expires_at > Date.now(),
    409,
    "Envio encerrado.",
  );
  const bytes = await request.arrayBuffer();
  assert(
    bytes.byteLength === p.size &&
      btoa(SparkMD5.ArrayBuffer.hash(bytes, true)) === p.md5,
    400,
    "Parte corrompida.",
  );
  const uploaded = await env
    .LOCAL_BUCKET!.resumeMultipartUpload(f.object_key, f.upload_id!)
    .uploadPart(number, bytes);
  await run(
    env,
    "UPDATE parts SET etag=? WHERE file_id=? AND number=?",
    uploaded.etag,
    fid,
    number,
  );
  return new Response(null, { headers: { etag: uploaded.etag } });
}
export async function listTransfers(env: Env, userId?: string, offset = 0) {
  const records = await all<Transfer>(
    env,
    `SELECT t.*,o.status AS mail_status FROM transfers t LEFT JOIN outbox o ON o.transfer_id=t.id ${userId ? "WHERE t.user_id=?" : ""} ORDER BY t.created_at DESC,t.id DESC LIMIT 20 OFFSET ?`,
    ...(userId ? [userId, offset] : [offset]),
  );
  if (!records.length) return [];
  const files = await all<TransferFile>(
    env,
    `SELECT * FROM files WHERE transfer_id IN (${records.map(() => "?").join(",")}) ORDER BY rowid`,
    ...records.map((t) => t.id),
  );
  return Promise.all(
    records.map(async (t) => {
      const {
        token_cipher,
        token_hash: _,
        ...safe
      } = t as Transfer & {
        token_cipher: string | null;
        token_hash: string | null;
      };
      const valid = t.status === "ready" && t.expires_at! > Date.now();
      return {
        ...safe,
        status: t.status === "ready" && !valid ? "expired" : t.status,
        files: files.filter((f) => f.transfer_id === t.id),
        link:
          valid && token_cipher
            ? `${env.APP_ORIGIN}/t/${await unseal<string>(env, token_cipher)}`
            : undefined,
      };
    }),
  );
}
