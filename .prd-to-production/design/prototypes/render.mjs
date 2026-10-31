// Render prototypes to PNG. Usage: PW=<path to playwright> node render.mjs [filter]
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PW || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'images');
fs.mkdirSync(out, { recursive: true });
const D = { width: 1440, height: 1000 }, M = { width: 390, height: 844 };
const jobs = JSON.parse(fs.readFileSync(path.join(here, 'renders.json'), 'utf8'));
const filter = process.argv[2];
const browser = await chromium.launch();
for (const j of jobs) {
  if (filter && !j.out.includes(filter)) continue;
  const ctx = await browser.newContext({ viewport: j.mobile ? M : D, deviceScaleFactor: 1, reducedMotion: j.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(here, j.html + '.html') + (j.hash || ''));
  await page.waitForSelector('html[data-ready="1"]', { timeout: 20000 });
  const fonts = await page.evaluate(() => document.documentElement.dataset.fonts);
  if (fonts !== 'loaded') console.error('FONTS MISSING', j.html);
  if (j.full !== false) {
    // grow the viewport to the full document so sticky/fixed docks land at the true bottom
    const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    const vp = j.mobile ? M : D;
    if (h > vp.height) { await page.setViewportSize({ width: vp.width, height: h }); await page.waitForTimeout(50); }
  }
  await page.screenshot({ path: path.join(out, j.out + '.png'), fullPage: j.full !== false });
  console.log('ok', j.out);
  await ctx.close();
}
await browser.close();
