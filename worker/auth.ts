import { z } from "zod";
import { emailSchema, type User } from "../shared/contracts";
import type { Env } from "./types";
import {
  assert,
  body,
  hash,
  id,
  json,
  local,
  one,
  random,
  rate,
  run,
  stmt,
} from "./core";
import { encryptedMail } from "./mail";
export async function session(request: Request, env: Env): Promise<User> {
  const cookie = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)cloudlight_session=([^;]+)/)?.[1];
  assert(cookie, 401, "Entre para continuar.", "UNAUTHENTICATED");
  const user = await one<User>(
    env,
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
    await hash(cookie),
    Date.now(),
  );
  assert(user, 401, "Sua sessão expirou. Entre novamente.", "UNAUTHENTICATED");
  return user;
}
export const cookie = (env: Env, value: string, age: number) =>
  `cloudlight_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local(env) ? "" : "; Secure"}`;
export async function requestCode(request: Request, env: Env) {
  const { email } = z.object({ email: emailSchema }).parse(await body(request));
  await rate(
    env,
    `login-ip:${await hash(request.headers.get("cf-connecting-ip") || "local", env.AUTH_SECRET)}`,
    30,
    3600_000,
  );
  await rate(
    env,
    `login-email:${await hash(email, env.AUTH_SECRET)}`,
    1,
    60_000,
  );
  const usage = await one<{ used: number }>(
    env,
    "SELECT used FROM daily_usage WHERE day=? AND kind='email'",
    new Date().toISOString().slice(0, 10),
  );
  assert(
    !usage || usage.used < 250,
    429,
    "A cota diária de e-mails foi atingida. Tente novamente amanhã.",
    "DAILY_QUOTA",
  );
  const user = await one<User>(
    env,
    "SELECT * FROM users WHERE email=? AND active=1",
    email,
  );
  const challengeId = id(),
    now = Date.now();
  if (user && (env.PILOT_ENABLED !== "admin" || user.role === "admin")) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    const code = String(value % 1_000_000).padStart(6, "0");
    const payload = await encryptedMail(
      env,
      "Seu código de acesso ao Cloudlight",
      `Seu código é ${code}. Ele expira em 10 minutos e só pode ser usado uma vez. Se você não solicitou este acesso, ignore este e-mail.`,
    );
    try {
      await env.DB.batch([
        stmt(
          env,
          "UPDATE challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
          now,
          user.id,
        ),
        stmt(
          env,
          "INSERT INTO challenges(id,user_id,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
          challengeId,
          user.id,
          await hash(`${challengeId}:${code}`, env.AUTH_SECRET),
          now + 600_000,
          now,
        ),
        stmt(
          env,
          "INSERT INTO outbox(id,challenge_id,recipient,payload,next_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
          id(),
          challengeId,
          email,
          payload,
          now,
          now,
          now + 600_000,
        ),
      ]);
    } catch (error) {
      assert(
        !String(error).includes("LOGIN_COOLDOWN"),
        429,
        "Aguarde um minuto antes de solicitar outro código.",
        "RATE_LIMIT",
      );
      throw error;
    }
  }
  return json({
    challengeId,
    message:
      "Se este e-mail estiver na lista de convidados, você receberá um código. Aguarde até um minuto antes de reenviar.",
    local: local(env),
  });
}
export async function verifyCode(request: Request, env: Env) {
  const { challengeId, code } = z
    .object({
      challengeId: z.string().uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .parse(await body(request));
  await rate(
    env,
    `verify-ip:${await hash(request.headers.get("cf-connecting-ip") || "local", env.AUTH_SECRET)}`,
    60,
    600_000,
  );
  const nonce = random(),
    now = Date.now(),
    codeHash = await hash(`${challengeId}:${code}`, env.AUTH_SECRET);
  const challenge = await one<{
    user_id: string;
    consumed_nonce: string | null;
  }>(
    env,
    `UPDATE challenges SET attempts=attempts+1, consumed_at=CASE WHEN code_hash=? THEN ? ELSE NULL END, consumed_nonce=CASE WHEN code_hash=? THEN ? ELSE NULL END WHERE id=? AND consumed_at IS NULL AND expires_at>? AND attempts<5 AND EXISTS(SELECT 1 FROM users WHERE users.id=challenges.user_id AND active=1 AND (?!='admin' OR role='admin')) RETURNING user_id,consumed_nonce`,
    codeHash,
    now,
    codeHash,
    nonce,
    challengeId,
    now,
    env.PILOT_ENABLED,
  );
  assert(
    challenge && challenge.consumed_nonce === nonce,
    400,
    "Código inválido, expirado ou já utilizado. Solicite um novo código.",
    "INVALID_CODE",
  );
  const token = random();
  await run(
    env,
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    await hash(token),
    challenge.user_id,
    now + 7 * 86400_000,
  );
  return json({ ok: true }, 200, {
    "set-cookie": cookie(env, token, 7 * 86400),
  });
}
export async function logout(request: Request, env: Env) {
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)cloudlight_session=([^;]+)/)?.[1];
  if (token)
    await run(
      env,
      "DELETE FROM sessions WHERE token_hash=?",
      await hash(token),
    );
  return json({ ok: true }, 200, { "set-cookie": cookie(env, "", 0) });
}
