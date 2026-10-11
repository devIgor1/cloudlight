import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
test("landing responsive, themes, tabs, FAQ, keyboard and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("qa", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390])
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/");
      if (
        Boolean(
          (await page.locator("html").getAttribute("class"))?.includes("dark"),
        ) !== dark
      )
        await page
          .getByRole("button", {
            name: dark ? "Usar tema escuro" : "Usar tema claro",
          })
          .first()
          .click();
      await expect(
        page.getByRole("heading", {
          name: "Arquivos grandes. Caminhos curtos.",
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `qa/landing-${width}-${dark ? "dark" : "light"}.png`,
        fullPage: true,
      });
    }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const firstTab = page.getByRole("tab").first();
  await firstTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab").nth(1)).toBeFocused();
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByText("Qual é o tamanho máximo?", { exact: true }).click();
  await expect(
    page.getByText(
      "Você pode enviar até 1 GB no total por transferência, em até 20 arquivos.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
  await page.getByRole("navigation").focus();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Entrar", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(errors).toEqual([]);
});
test("invited login, actual browser multipart upload, recipient download, history and admin", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/entrar");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("admin@cloudlight.test");
  test.setTimeout(120_000);
  const loginResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/auth/request",
  );
  await page.getByRole("button", { name: "Receber código" }).click();
  if ((await loginResponse).status() === 429) {
    // Repeated local runs honor the real one-minute resend interval.
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    await page.getByRole("button", { name: "Receber código" }).click();
  }
  await expect(page.getByLabel("Código de acesso")).toBeVisible();
  let code = "";
  await expect
    .poll(async () => {
      const messages = await (await page.request.get("/api/dev/inbox")).json();
      code =
        messages
          .find(
            (m: any) =>
              m.recipient === "admin@cloudlight.test" &&
              /\b\d{6}\b/.test(m.text),
          )
          ?.text.match(/\b\d{6}\b/)[0] || "";
      return code;
    })
    .toMatch(/^\d{6}$/);
  await page.getByLabel("Código de acesso").fill(code);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que vamos compartilhar?" }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "memorias.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Boas memórias merecem viajar.\n".repeat(1000)),
  });
  await page.getByLabel("E-mail do destinatário").fill("amigo@example.test");
  await page
    .getByLabel("Uma mensagem")
    .fill("Um teste completo, enviado pelo navegador.");
  await page
    .getByRole("button", { name: "Enviar arquivos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Seus arquivos já têm destino." }),
  ).toBeVisible();
  const link = await page.getByLabel("Link da transferência").inputValue();
  await page.screenshot({ path: "qa/app-success.png", fullPage: true });
  await page.getByRole("link", { name: "Ver transferências" }).click();
  await expect(page.getByText("memorias.txt").first()).toBeVisible();
  await page.getByRole("link", { name: "Administração" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão do grupo." }),
  ).toBeVisible();
  await page.screenshot({ path: "qa/admin-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Novo envio" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "qa/app-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await page.screenshot({ path: "qa/app-mobile-dark.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: "qa/app-desktop-dark.png", fullPage: true });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Usar tema claro" }).click();
  await page.screenshot({ path: "qa/app-desktop-light.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  // Pause after one confirmed part, reload, reselect the original, and resume without reuploading it.
  await writeFile("qa/resume.bin", Buffer.alloc(20_000_000, 37));
  await page.locator("input[type=file]").setInputFiles("qa/resume.bin");
  await page.getByLabel("E-mail do destinatário").fill("retomada@example.test");
  const held: Array<() => void> = [];
  let released = false;
  await page.route("**/api/local/parts/**", async (route) => {
    const n = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    if (n === 1) await route.continue();
    else {
      if (!released) await new Promise<void>((r) => held.push(r));
      await route.abort().catch(() => {});
    }
  });
  const firstPart = page.waitForResponse(
    (r) =>
      r.url().includes("/api/local/parts/") &&
      new URL(r.url()).pathname.endsWith("/1") &&
      r.status() === 200,
  );
  await page
    .getByRole("button", { name: "Enviar arquivos", exact: true })
    .click();
  await firstPart;
  await page.getByRole("button", { name: "Pausar envio" }).click();
  released = true;
  held.forEach((r) => r());
  await expect(
    page.getByRole("button", { name: "Retomar envio" }),
  ).toBeVisible();
  await page.unroute("**/api/local/parts/**");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Selecionar originais" }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles("qa/resume.bin");
  const resumedParts: number[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/api/local/parts/"))
      resumedParts.push(Number(new URL(r.url()).pathname.split("/").at(-1)));
  });
  await page.getByRole("button", { name: "Retomar envio" }).click();
  await expect(
    page.getByRole("heading", { name: "Seus arquivos já têm destino." }),
  ).toBeVisible({ timeout: 20_000 });
  expect(resumedParts).not.toContain(1);
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Administrador local enviou arquivos." }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar memorias.txt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("memorias.txt");
  await page.screenshot({ path: "qa/download-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
