// Takes the README screenshots (light and dark) from a running demo instance, like record.mjs:
//
//   rm -rf /tmp/wk-record && DATABASE_URL= PGLITE_DIR=/tmp/wk-record API_PORT=3012 SEED_DEMO=1 npm start
//   BASE=http://localhost:3012 node docs/media/screenshots.mjs
//
// Writes docs/media/<name>-light.png and <name>-dark.png (then: cwebp -q 82 x.png -o x.webp).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:3012';
const OUT = fileURLToPath(new URL('.', import.meta.url));
const LAUNCH = process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--headless=new'] } : {};

const browser = await chromium.launch(LAUNCH);

async function shot(name, { email, viewport, scale = 2 }, open) {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'de-CH', colorScheme, serviceWorkers: 'block' });
    if (email) {
      const r = await context.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'zivilschutz' } });
      if (!r.ok()) throw new Error(`Login ${email}: ${r.status()}`);
    }
    const page = await context.newPage();
    await open(page, context);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}${name}-${colorScheme}.png` });
    await context.close();
    console.log(`${name}-${colorScheme}.png`);
  }
}

const piWk = async (context) => (await (await context.request.get(`${BASE}/api/wks`)).json()).find((w) => w.title.includes('Pi Kp'));

// The Arbeitsprogramm of the demo WK: the hero image at the top of the README.
await shot('arbeitsprogramm', { email: 'kpkdt@demo.ch', viewport: { width: 1440, height: 810 } }, async (page, context) => {
  const wk = await piWk(context);
  // The first two WK days, a little narrower than the default.
  const next = new Date(Date.parse(wk.startDate) + 86_400_000).toISOString().slice(0, 10);
  await page.addInitScript(([key, days]) => {
    localStorage.setItem(key, JSON.stringify(days));
    localStorage.setItem('ap-zoom', JSON.stringify({ colW: 112, ppm: 1.05 }));
  }, [`days:ap:${wk.id}`, [wk.startDate, next]]);
  await page.goto(`${BASE}/wk/${wk.id}`);
  // A selected block shows its details in the side panel.
  const detail = await (await context.request.get(`${BASE}/api/wks/${wk.id}`)).json();
  const block = detail.blocks.find((b) => b.date === wk.startDate && b.type === 'AUSBILDUNG' && b.zugIds.length === 1);
  if (block) await page.locator(`[data-block-id="${block.id}"]`).click();
});

await browser.close();
