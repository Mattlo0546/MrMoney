// DRAFT: to update for chat-first (D20). Written against the old onboarding form + sentence composer.
import { expect, test } from "@playwright/test";
import { fundsPence, say, startDemo, summaryText, toPence, freshStart } from "./helpers";

test.describe.configure({ mode: "serial" });

// One continuous journey (R-demo). Assertions are soft so one failure does not hide the rest.
test("R-demo full journey", async ({ page }) => {
  test.setTimeout(180_000);
  const viewportName = test.info().project.name;

  await test.step("1 onboarding -> Try a demo student -> /plan with today's figure", async () => {
    await startDemo(page);
    await expect.soft(page).toHaveURL(/\/plan/);
    const allowance = page.getByTestId("allowance");
    await expect.soft(allowance).toHaveText("£25.84");
    await expect.soft(page.getByText(/demo/i).first()).toBeVisible();
  });

  const funds0 = await fundsPence(page);

  await test.step("2 £35 expense: explanation + Undo visible, funds drop £35", async () => {
    await say(page, "I spent £35 on a shower filter today");
    await expect.soft(page.getByRole("button", { name: "Undo" })).toBeVisible({ timeout: 15_000 });
    await expect.soft(page.getByText(/Added your £35/i)).toBeVisible();
    await expect.soft(page.getByText(/Rent and your (emergency |minimum )?reserve are unchanged/i)).toBeVisible();
    expect.soft(await fundsPence(page)).toBe(funds0 - 3500);
  });
  const funds1 = await fundsPence(page);

  await test.step("3 £20 dinner: preview fits, summary unchanged before Apply, then Apply", async () => {
    const before = await summaryText(page);
    await say(page, "Can I spend £20 on dinner tomorrow?");
    await expect.soft(page.getByText("Fits", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.soft(page.getByText(/not applied/i).first()).toBeVisible();
    expect.soft(await summaryText(page), "summary changed before Apply (R-preview)").toBe(before);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect.soft(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  await test.step("4 £60 concert: shortfall + options, choose one, Apply", async () => {
    await say(page, "can i afford a £60 concert ticket on saturday");
    await expect.soft(page.getByText(/£\d+\.\d\d short/)).toBeVisible({ timeout: 15_000 });
    const options = page.getByRole("radio");
    await expect.soft(options.first()).toBeVisible();
    expect.soft(await options.count()).toBeGreaterThanOrEqual(2);
    const apply = page.getByRole("button", { name: "Apply", exact: true });
    await expect.soft(apply, "Apply disabled until an option is chosen").toBeDisabled();
    await options.first().check();
    await expect.soft(apply).toBeEnabled();
    await apply.click();
    await expect.soft(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  const funds2 = await fundsPence(page);
  await test.step("5 £200 income: funds increase", async () => {
    await say(page, "I received an extra £200");
    await expect.soft(page.getByRole("button", { name: "Undo" })).toBeVisible({ timeout: 15_000 });
    expect.soft(await fundsPence(page)).toBe(funds2 + 20000);
  });

  await test.step("6 Undo: funds restored", async () => {
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.soft(page.getByText(/Undone/i)).toBeVisible();
    expect.soft(await fundsPence(page)).toBe(funds2);
  });

  await test.step("7 reload persists", async () => {
    await page.reload();
    await expect.soft(page).toHaveURL(/\/plan/);
    await expect.soft(page.getByTestId("allowance")).toBeVisible({ timeout: 10_000 });
    expect.soft(await fundsPence(page)).toBe(funds2);
    expect.soft(funds2).toBeLessThan(funds0);
    expect.soft(funds1).toBe(funds0 - 3500);
  });

  await test.step("8 '$20 lunch': clarification, nothing changes", async () => {
    const before = await summaryText(page);
    await say(page, "I spent $20 on lunch");
    await expect.soft(page.getByText("Question", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.soft(page.getByText(/pounds|£|GBP|currency/i).first()).toBeVisible();
    expect.soft(await summaryText(page)).toBe(before);
    expect.soft(await fundsPence(page)).toBe(funds2);
  });

  await test.step("9 /projections empty state", async () => {
    await page.goto("/projections");
    await expect.soft(page.getByTestId("empty")).toBeVisible({ timeout: 10_000 });
    await expect.soft(page.getByText(/not advice|guarantee/i).first()).toBeVisible();
  });

  await test.step("10 /settings reset -> onboarding", async () => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Reset StudentPlan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /reset/i }).click();
    await expect.soft(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
    await expect.soft(page.getByRole("button", { name: "Try a demo student" }).first()).toBeVisible();
  });
  void viewportName; void toPence; void freshStart;
});
