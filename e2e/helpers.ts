import { expect, type Page } from "@playwright/test";

/** Parse "£1,234.56" into pence. */
export const toPence = (s: string): number => {
  const m = s.replace(/,/g, "").match(/£\s*(-?\d+(?:\.\d{1,2})?)/);
  if (!m) throw new Error(`No amount in "${s}"`);
  return Math.round(parseFloat(m[1]) * 100);
};

export async function freshStart(page: Page) {
  await page.goto("/onboarding");
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  });
  await page.goto("/onboarding");
}

export async function startDemo(page: Page) {
  await freshStart(page);
  await page.getByRole("button", { name: "Try a demo student" }).first().click();
  await page.waitForURL("**/plan");
}

export const composer = (page: Page) => page.getByPlaceholder("Tell me what changed…").locator("visible=true").first();

export async function say(page: Page, text: string) {
  const box = composer(page);
  await box.fill(text);
  await box.press("Enter");
}

/** Read the "Funds left" tile as pence (reads DOM text, so it works behind the mobile sheet). */
export async function fundsPence(page: Page): Promise<number> {
  const dd = page.locator("dt", { hasText: "Funds left" }).locator("xpath=following-sibling::dd").first();
  await expect(dd).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
  return toPence((await dd.textContent()) ?? "");
}

export async function summaryText(page: Page): Promise<string> {
  return (await page.getByLabel("Summary").first().textContent()) ?? "";
}
