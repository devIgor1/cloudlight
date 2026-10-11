import { z, ZodError } from "zod";
import {
  LIMITS,
  emailSchema,
  type Transfer,
  type TransferFile,
} from "../shared/contracts";
import type { Env } from "./types";
import {
  ApiError,
  all,
  assert,
  body,
  hash,
  id,
  json,
  local,
  one,
  rate,
  run,
  spend,
  stmt,
} from "./core";
import { logout, requestCode, session, verifyCode } from "./auth";
import { inbox, processMail } from "./mail";
import { maintenance, usage } from "./maintenance";
import {
  authorizePart,
  completeFile,
  createTransfer,
  details,
  fileFor,
  finalize,
  localUpload,
  listTransfers,
  owned,
  publicTransfer,
  revoke,
  startFile,
} from "./transfers";
import { Storage } from "./storage";
async function api(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (local(env))
    assert(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      503,
      "O ambiente local só aceita conexões locais.",
    );
  assert(
    env.AUTH_SECRET?.length >= 32,
    503,
    "Configure os secrets do aplicativo.",
  );
  if (!local(env))
    assert(
      env.PILOT_ENABLED === "true",
      503,
      "O piloto ainda está em preparação.",
    );
  if (!["GET", "HEAD"].includes(method))
    assert(
      request.headers.get("origin") === env.APP_ORIGIN,
      403,
      "Origem não permitida.",
      "CSRF",
    );
  if (path === "/api/health") return json({ ok: true, local: local(env) });
  if (path === "/api/dev/inbox" && local(env) && method === "GET")
    return json(await inbox(env));
  const localPart = path.match(/^\/api\/local\/parts\/([\w-]+)\/(\d+)$/);
  if (localPart && method === "PUT")
    return localUpload(request, env, localPart[1], Number(localPart[2]));
  await spend(env, "api_requests", 10_000);
  // A single IP cannot exhaust the API without first reaching this conservative application cap.
  await rate(
    env,
    `api:${await hash(request.headers.get("cf-connecting-ip") || "local", env.AUTH_SECRET)}`,
    1500,
    3600_000,
  );
  if (path === "/api/auth/request" && method === "POST") {
    const r = await requestCode(request, env);
    ctx.waitUntil(processMail(env));
    return r;
  }
  if (path === "/api/auth/verify" && method === "POST")
    return verifyCode(request, env);
  if (path === "/api/auth/logout" && method === "POST")
    return logout(request, env);
  const pub = path.match(/^\/api\/public\/([\w-]+)(?:\/files\/([\w-]+))?$/);
  if (pub && method === "GET") {
    const t = await publicTransfer(env, pub[1]);
    const files = await all<TransferFile>(
      env,
      "SELECT * FROM files WHERE transfer_id=? AND status='complete'",
      t.id,
    );
    if (!pub[2])
      return json({
        sender: t.sender,
        message: t.message,
        expires_at: t.expires_at,
        total_bytes: t.total_bytes,
        files: files.map((f) => ({ id: f.id, name: f.name, size: f.size })),
      });
    const file = files.find((f) => f.id === pub[2]);
    assert(file, 404, "Arquivo não encontrado.");
    const range = request.headers.get("range");
    assert(
      !range || /^bytes=(\d+-\d*|-\d+)$/.test(range),
      416,
      "Intervalo inválido.",
    );
    const upstream = await new Storage(env).download(file, range);
    assert(
      [200, 206, 416].includes(upstream.status),
      503,
      "Arquivo temporariamente indisponível.",
    );
    const headers = new Headers({
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="arquivo"; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", "%27")}`,
      "accept-ranges": "bytes",
    });
    for (const name of ["content-length", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (upstream.ok)
      ctx.waitUntil(
        run(env, "UPDATE transfers SET requests=requests+1 WHERE id=?", t.id),
      );
    return new Response(upstream.body, { status: upstream.status, headers });
  }
  const user = await session(request, env);
  if (path === "/api/me" && method === "GET")
    return json({ user, limits: LIMITS, local: local(env) });
  if (path === "/api/transfers" && method === "POST")
    return createTransfer(request, env, user);
  if (path === "/api/transfers" && method === "GET") {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100_000)
      .parse(url.searchParams.get("offset") || 0);
    return json(await listTransfers(env, user.id, offset));
  }
  const transfer = path.match(
    /^\/api\/transfers\/([\w-]+)(?:\/(finish|revoke))?$/,
  );
  if (transfer) {
    const t = await owned(env, transfer[1], user);
    if (method === "GET" && !transfer[2]) return json(await details(env, t));
    if (method === "POST" && transfer[2] === "finish") {
      const r = await finalize(env, t, user);
      ctx.waitUntil(processMail(env));
      return r;
    }
    if (method === "POST" && transfer[2] === "revoke") return revoke(env, t);
  }
  const file = path.match(
    /^\/api\/files\/([\w-]+)\/(start|parts|authorize|finish)$/,
  );
  if (file) {
    const f = await fileFor(env, file[1], user);
    if (method === "POST" && file[2] === "start") return startFile(env, f);
    if (method === "GET" && file[2] === "parts")
      return json(
        f.status === "complete"
          ? { complete: true, parts: [] }
          : {
              complete: false,
              parts: f.upload_id ? await new Storage(env).parts(f) : [],
            },
      );
    if (method === "POST" && file[2] === "authorize")
      return authorizePart(request, env, f);
    if (method === "POST" && file[2] === "finish") return completeFile(env, f);
  }
  if (path.startsWith("/api/admin/")) {
    assert(
      user.role === "admin",
      403,
      "Esta área é restrita ao administrador.",
    );
    if (path === "/api/admin/overview" && method === "GET") {
      const transfers = await listTransfers(env);
      return json({
        usage: await usage(env),
        users: await all(
          env,
          "SELECT id,email,name,role,active FROM users ORDER BY created_at",
        ),
        transfers,
        pendingMail: await all(
          env,
          "SELECT id,recipient,status,attempts,last_error FROM outbox WHERE status IN ('pending','failed','sending') ORDER BY created_at LIMIT 100",
        ),
      });
    }
    if (path === "/api/admin/invites" && method === "POST") {
      const data = z
        .object({ email: emailSchema, name: z.string().trim().min(1).max(80) })
        .parse(await body(request));
      try {
        await run(
          env,
          "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'user',?)",
          id(),
          data.email,
          data.name,
          Date.now(),
        );
      } catch (e) {
        assert(
          !String(e).includes("USER_LIMIT"),
          409,
          "O grupo já tem 100 convidados.",
        );
        assert(
          !String(e).includes("UNIQUE"),
          409,
          "Este e-mail já está no grupo.",
        );
        throw e;
      }
      return json({ ok: true }, 201);
    }
    const update = path.match(/^\/api\/admin\/users\/([\w-]+)$/);
    if (update && method === "PATCH") {
      assert(
        update[1] !== user.id,
        400,
        "Você não pode desativar sua própria conta.",
      );
      const data = z.object({ active: z.boolean() }).parse(await body(request));
      await env.DB.batch([
        stmt(
          env,
          "UPDATE users SET active=? WHERE id=?",
          data.active ? 1 : 0,
          update[1],
        ),
        stmt(env, "DELETE FROM sessions WHERE user_id=?", update[1]),
      ]);
      return json({ ok: true });
    }
    if (path === "/api/admin/maintenance" && method === "POST")
      return json(await maintenance(env));
    const retry = path.match(/^\/api\/admin\/mail\/([\w-]+)\/retry$/);
    if (retry && method === "POST") {
      await run(
        env,
        "UPDATE outbox SET status='pending',attempts=0,next_at=?,last_error=NULL WHERE id=? AND status='failed' AND expires_at>?",
        Date.now(),
        retry[1],
        Date.now(),
      );
      ctx.waitUntil(processMail(env));
      return json({ ok: true });
    }
  }
  throw new ApiError(404, "Não encontrado.");
}
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith("/api/"))
      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response("Use o Vite em http://127.0.0.1:5173");
    let response: Response;
    try {
      response = await api(request, env, ctx);
    } catch (error) {
      response =
        error instanceof ZodError
          ? json(
              { error: "Confira os campos informados.", code: "VALIDATION" },
              400,
            )
          : error instanceof ApiError
            ? json({ error: error.message, code: error.code }, error.status)
            : json(
                {
                  error:
                    "Não foi possível concluir a operação. Tente novamente.",
                  code: "INTERNAL_ERROR",
                },
                500,
              );
    }
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, private");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(maintenance(env));
  },
} satisfies ExportedHandler<Env>;
