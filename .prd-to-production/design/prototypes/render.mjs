// Render prototypes to PNG. Usage: PW=<path to playwright index.mjs> node render.mjs [filter]
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PW || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'images');
fs.mkdirSync(out, { recursive: true });
const D = { width: 1440, height: 1000 }, M = { width: 390, height: 844 };
const jobs = JSON.parse(fs.readFileSync(path.join(here, 'renders.json'), 'utf8'));
const filter = process.argv[2];
const browser = await chromium.launch();
let bad = 0;
for (const j of jobs) {
  if (filter && !j.out.includes(filter)) continue;
  const vp = j.mobile ? M : D;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: j.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(here, j.html + '.html') + (j.hash || ''));
  await page.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
  const fonts = await page.evaluate(() => document.documentElement.dataset.fonts);
  if (fonts !== 'loaded') { console.error('FONTS MISSING', j.html); bad++; }
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (ovf) console.error('H-OVERFLOW', j.out);
  const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  if (j.full !== false && h > vp.height) { await page.setViewportSize({ width: vp.width, height: h }); await page.waitForTimeout(50); }
  await page.screenshot({ path: path.join(out, j.out + '.png'), fullPage: j.full !== false });
  console.log('ok', j.out, h);
  await ctx.close();
}
await browser.close();
if (bad) process.exit(1);
