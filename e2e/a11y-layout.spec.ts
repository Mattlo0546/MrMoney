import { expect, test } from "@playwright/test";
import { composer, freshStart, startDemo } from "./helpers";

const hasHScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));

test.describe("layout and focus", () => {
  test("no horizontal scroll on the 4 pages", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "390px check");
    const results: string[] = [];
    await freshStart(page);
    let m = await hasHScroll(page);
    if (m.sw > m.cw) results.push(`/onboarding ${m.sw}>${m.cw}`);
    await startDemo(page);
    for (const path of ["/plan", "/projections", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      m = await hasHScroll(page);
      if (m.sw > m.cw) results.push(`${path} ${m.sw}>${m.cw}`);
    }
    expect(results, "pages wider than the 390px viewport").toEqual([]);
  });

  test("composer shows a visible focus indicator", async ({ page }) => {
    await startDemo(page);
    const box = composer(page);
    await box.focus();
    await expect(box).toBeFocused();
    // the focus ring may sit on the input or its wrapper (focus-within)
    const styles = await box.evaluate((el) => {
      const own = getComputedStyle(el);
      const wrap = getComputedStyle(el.parentElement!);
      return {
        ownOutline: own.outlineStyle !== "none" && parseFloat(own.outlineWidth) > 0,
        ownShadow: own.boxShadow !== "none",
        wrapBorder: wrap.borderColor,
        wrapShadow: wrap.boxShadow !== "none",
        wrapOutline: wrap.outlineStyle !== "none" && parseFloat(wrap.outlineWidth) > 0,
      };
    });
    await box.blur();
    const blurWrap = await box.evaluate((el) => getComputedStyle(el.parentElement!).borderColor);
    const visible = styles.ownOutline || styles.ownShadow || styles.wrapShadow || styles.wrapOutline || styles.wrapBorder !== blurWrap;
    expect(visible, `no focus style found: ${JSON.stringify(styles)}`).toBe(true);
  });
});
