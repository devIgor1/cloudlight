import type { TransferFile } from "../shared/contracts";
import { all, id, one, run, stmt } from "./core";
import { processMail } from "./mail";
import { Storage } from "./storage";
import type { Env } from "./types";
export async function cleanup(env: Env) {
  const now = Date.now();
  await env.DB.batch([
    stmt(
      env,
      "UPDATE transfers SET status='expired' WHERE status='ready' AND expires_at<=?",
      now,
    ),
    stmt(
      env,
      "UPDATE transfers SET status='cancelled' WHERE status='uploading' AND upload_expires_at<=?",
      now,
    ),
  ]);
  const owner = id();
  const file = await one<TransferFile>(
    env,
    `UPDATE files SET lease_owner=?,lease_until=? WHERE id=(SELECT f.id FROM files f JOIN transfers t ON t.id=f.transfer_id WHERE t.status IN ('expired','revoked','cancelled') AND f.status!='deleted' AND f.lease_until<? AND f.auth_until+60000<? ORDER BY t.created_at LIMIT 1) RETURNING *`,
    owner,
    now + 120_000,
    now,
    now,
  );
  let removed = 0,
    failed = 0;
  if (file) {
    try {
      if (await new Storage(env).remove(file)) {
        await run(
          env,
          "UPDATE files SET status='deleted' WHERE id=? AND lease_owner=?",
          file.id,
          owner,
        );
        removed++;
      }
    } catch {
      failed++;
    } finally {
      // Retain the reservation and retry next tick. No secret URLs in logs.
      await run(
        env,
        "UPDATE files SET lease_until=0,lease_owner=NULL WHERE id=? AND lease_owner=?",
        file.id,
        owner,
      );
    }
  }
  await run(
    env,
    `UPDATE transfers SET status='deleted',token_cipher=NULL WHERE status IN ('expired','revoked','cancelled') AND NOT EXISTS(SELECT 1 FROM files WHERE transfer_id=transfers.id AND status!='deleted')`,
  );
  await env.DB.batch([
    stmt(
      env,
      "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 100)",
      now,
    ),
    stmt(
      env,
      "DELETE FROM challenges WHERE id IN (SELECT id FROM challenges WHERE expires_at<? LIMIT 50)",
      now - 86400_000,
    ),
    stmt(
      env,
      "DELETE FROM transfers WHERE id IN (SELECT id FROM transfers WHERE status='deleted' AND created_at<? LIMIT 5)",
      now - 30 * 86400_000,
    ),
    stmt(
      env,
      "UPDATE outbox SET payload='' WHERE expires_at<? AND payload!=''",
      now,
    ),
    stmt(env, "DELETE FROM rate_limits WHERE expires_at<?", now),
    stmt(
      env,
      "DELETE FROM daily_usage WHERE day<?",
      new Date(now - 30 * 86400_000).toISOString().slice(0, 10),
    ),
  ]);
  return { removed, failed };
}
export async function maintenance(env: Env) {
  await processMail(env);
  return cleanup(env);
}
export async function usage(env: Env) {
  const rows = await all<{ status: string; bytes: number }>(
    env,
    "SELECT status,SUM(total_bytes) bytes FROM transfers WHERE status!='deleted' GROUP BY status",
  );
  const today = await all<{ kind: string; used: number }>(
    env,
    "SELECT kind,used FROM daily_usage WHERE day=?",
    new Date().toISOString().slice(0, 10),
  );
  return {
    reserved: rows
      .filter((r) => r.status === "uploading")
      .reduce((n, r) => n + r.bytes, 0),
    occupied: rows
      .filter((r) => r.status === "ready")
      .reduce((n, r) => n + r.bytes, 0),
    pending: rows
      .filter((r) => !["ready", "uploading"].includes(r.status))
      .reduce((n, r) => n + r.bytes, 0),
    emails: today.find((r) => r.kind === "email")?.used || 0,
    operations: today.find((r) => r.kind === "storage_operations")?.used || 0,
  };
}
