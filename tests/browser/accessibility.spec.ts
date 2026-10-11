import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const dark of [false, true])
  test(`public screens meet automated WCAG AA checks (${dark ? "dark" : "light"})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(
      (dark) =>
        localStorage.setItem("cloudlight-theme", dark ? "dark" : "light"),
      dark,
    );
    for (const path of ["/", "/entrar", "/t/invalid"]) {
      await page.goto(path);
      await page.getByRole("heading").first().waitFor();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
  });
