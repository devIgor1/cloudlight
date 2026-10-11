import { LIMITS } from "../shared/contracts";
import {
  all,
  assert,
  local,
  one,
  run,
  seal,
  spend,
  unseal,
  ApiError,
} from "./core";
import type { Env } from "./types";
export type Mail = { subject: string; text: string };
type Job = {
  id: string;
  recipient: string;
  payload: string;
  attempts: number;
  expires_at: number;
  transfer_id: string | null;
  challenge_id: string | null;
};
export const encryptedMail = (env: Env, subject: string, text: string) =>
  seal(env, { subject, text });
export async function processMail(env: Env, batchSize = 2) {
  for (let i = 0; i < batchSize; i++) {
    const now = Date.now();
    const job = await one<Job>(
      env,
      `UPDATE outbox SET status='sending', lease_until=?, attempts=attempts+1 WHERE id=(SELECT id FROM outbox WHERE ((status='pending' AND next_at<=?) OR (status='sending' AND lease_until<?)) AND attempts<5 AND expires_at>? ORDER BY (challenge_id IS NOT NULL) DESC, next_at LIMIT 1) RETURNING *`,
      now + 60_000,
      now,
      now,
      now,
    );
    if (!job) break;
    try {
      if (job.transfer_id) {
        const t = await one<{ status: string; expires_at: number }>(
          env,
          "SELECT status,expires_at FROM transfers WHERE id=?",
          job.transfer_id,
        );
        if (!t || t.status !== "ready" || t.expires_at <= now) {
          await run(
            env,
            "UPDATE outbox SET status='cancelled' WHERE id=?",
            job.id,
          );
          continue;
        }
      }
      if (job.challenge_id) {
        const c = await one<{ consumed_at: number | null }>(
          env,
          "SELECT consumed_at FROM challenges WHERE id=?",
          job.challenge_id,
        );
        if (!c || c.consumed_at) {
          await run(
            env,
            "UPDATE outbox SET status='cancelled' WHERE id=?",
            job.id,
          );
          continue;
        }
      }
      await spend(env, "email", LIMITS.emails);
      const payload = await unseal<Mail>(env, job.payload);
      if (!local(env)) {
        assert(
          env.BREVO_API_KEY && env.MAIL_FROM,
          503,
          "O serviço de e-mail ainda não foi configurado.",
        );
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": env.BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: {
              name: env.MAIL_FROM_NAME || "Cloudlight",
              email: env.MAIL_FROM,
            },
            to: [{ email: job.recipient }],
            subject: payload.subject,
            textContent: payload.text,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new ApiError(
            response.status,
            response.status === 429 || response.status >= 500
              ? "MAIL_TEMPORARY"
              : "MAIL_REJECTED",
          );
        }
        await response.body?.cancel();
      }
      await run(
        env,
        "UPDATE outbox SET status='sent', lease_until=0, last_error=NULL WHERE id=?",
        job.id,
      );
    } catch (error) {
      const quota = error instanceof ApiError && error.code === "DAILY_QUOTA";
      const permanent =
        error instanceof ApiError && error.message === "MAIL_REJECTED";
      const next = quota
        ? Date.parse(new Date(now + 86400_000).toISOString().slice(0, 10))
        : now + Math.min(3600_000, 30_000 * 2 ** job.attempts);
      await run(
        env,
        `UPDATE outbox SET status=?, attempts=attempts-?, lease_until=0, next_at=?, last_error=? WHERE id=?`,
        permanent || (!quota && job.attempts >= 5) ? "failed" : "pending",
        quota ? 1 : 0,
        next,
        quota ? "DAILY_QUOTA" : permanent ? "MAIL_REJECTED" : "MAIL_TEMPORARY",
        job.id,
      );
    }
  }
  await run(
    env,
    "UPDATE outbox SET status='failed', last_error='MAIL_TEMPORARY' WHERE status='sending' AND lease_until<? AND attempts>=5",
    Date.now(),
  );
  await run(
    env,
    "UPDATE outbox SET status='expired', payload='' WHERE expires_at<=? AND status IN ('pending','sending')",
    Date.now(),
  );
}
export async function inbox(env: Env) {
  assert(local(env), 404, "Não encontrado.");
  const messages = await all<Job & { created_at: number; status: string }>(
    env,
    "SELECT * FROM outbox WHERE status='sent' AND expires_at>? ORDER BY created_at DESC LIMIT 20",
    Date.now(),
  );
  return Promise.all(
    messages
      .filter((m) => m.payload)
      .map(async (m) => ({
        id: m.id,
        recipient: m.recipient,
        created_at: m.created_at,
        ...(await unseal<Mail>(env, m.payload)),
      })),
  );
}
