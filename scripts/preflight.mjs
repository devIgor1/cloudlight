import { readFile } from "node:fs/promises";
import { parse } from "jsonc-parser";
const config = parse(
  await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);
const failures = [];
if (config.vars.APP_ENV !== "production")
  failures.push("APP_ENV deve ser production.");
if (!/^[0-9a-f-]{36}$/i.test(config.d1_databases[0].database_id))
  failures.push("Configure o ID real do D1.");
if (
  !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(
    config.vars.APP_ORIGIN,
  )
)
  failures.push("Configure o endereço workers.dev real em APP_ORIGIN.");
if (
  !/^https:\/\/s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(
    config.vars.B2_ENDPOINT,
  ) ||
  !config.vars.B2_REGION ||
  !config.vars.B2_BUCKET
)
  failures.push("Configure endpoint, região e bucket privado do B2.");
const secretNames = [
  "AUTH_SECRET",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "BREVO_API_KEY",
  "MAIL_FROM",
];
if (secretNames.some((name) => name in config.vars))
  failures.push(
    "Credenciais e remetente devem usar wrangler secret, nunca vars.",
  );
for (const name of secretNames)
  if (!config.secrets?.required?.includes(name))
    failures.push(
      `Declare ${name} em secrets.required; o Wrangler verificará o secret no deploy.`,
    );
if (config.vars.PILOT_ENABLED === "true") {
  let evidence;
  try {
    evidence = JSON.parse(
      await readFile(
        new URL("../pilot-readiness.json", import.meta.url),
        "utf8",
      ),
    );
  } catch {}
  for (const name of [
    "freeAccounts",
    "providerCaps",
    "privateBucket",
    "corsAndSignedRestrictions",
    "real50MBAnd1GB",
    "cloudflareEgress",
    "brevoSender",
    "workerCpu",
    "secretsConfigured",
    "lifecycleRules",
  ])
    if (evidence?.checks?.[name] !== true)
      failures.push(`Falta validação real: ${name}.`);
  if (
    !evidence?.validatedAt ||
    Date.now() - Date.parse(evidence.validatedAt) > 30 * 86400_000 ||
    !Number.isFinite(Date.parse(evidence.validatedAt))
  )
    failures.push(
      "Registre uma validação de produção realizada nos últimos 30 dias.",
    );
}
if (failures.length) {
  console.error(
    "Publicação bloqueada:\n" + failures.map((x) => `- ${x}`).join("\n"),
  );
  process.exit(1);
}
console.log(
  config.vars.PILOT_ENABLED === "true"
    ? "Configuração pronta para publicar o piloto validado."
    : "Configuração pronta; a API permanecerá fechada enquanto PILOT_ENABLED=false.",
);
