// Records the README animations from a running demo instance (fresh database with the demo data).
//
//   rm -rf /tmp/wk-record && PGLITE_DIR=/tmp/wk-record API_PORT=3012 SEED_DEMO=1 npm start   # in one terminal (after npm run build)
//   BASE=http://localhost:3012 node docs/media/record.mjs                      # in another
//
// Needs Chromium (npx playwright install chromium, or CHROME=/path/to/chromium) and ffmpeg. Writes docs/media/*.gif.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:3012';
const OUT = fileURLToPath(new URL('.', import.meta.url));
const PASSWORD = 'zivilschutz';
const only = process.argv.slice(2);

const pause = (page, ms) => page.waitForTimeout(ms);
// CHROME=/path/to/Chromium uses an installed browser instead of the Playwright download.
const LAUNCH = process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--headless=new'] } : {};

/** A visible pointer (videos show none) that grows on click. */
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(0,122,255,.35);border:2px solid rgba(255,255,255,.95);box-shadow:0 1px 6px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transition:transform .12s';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => (c.style.transform = 'scale(.7)'), true);
    addEventListener('mouseup', () => (c.style.transform = 'scale(1)'), true);
  });`;

async function record(name, { viewport, email }, flow) {
  if (only.length && !only.includes(name)) return;
  const dir = mkdtempSync(join(tmpdir(), 'wk-rec-'));
  const browser = await chromium.launch(LAUNCH);
  const context = await browser.newContext({ viewport, locale: 'de-CH', colorScheme: 'light', serviceWorkers: 'block' });
  await context.addInitScript(CURSOR);
  if (email) {
    const r = await context.request.post(`${BASE}/api/auth/login`, { data: { email, password: PASSWORD } });
    if (!r.ok()) throw new Error(`Login ${email}: ${r.status()}`);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const started = Date.now();
  // Frames of the page as the browser paints them (screencast), with their time.
  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: viewport.width, maxHeight: viewport.height });
  await withTimeout(flow(page, context), 90_000, name);
  await pause(page, 300);
  await cdp.send('Page.stopScreencast');
  await context.close();
  await browser.close();
  // Each frame stays until the next one; skip the blank start while the page loads.
  const shown = frames.filter((f, i) => i > 0 || frames.length === 1);
  const list = shown
    .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.02, ((shown[i + 1]?.t ?? f.t + 1.2) - f.t)).toFixed(3)}`)
    .join('\n');
  writeFileSync(join(dir, 'frames.txt'), `${list}\nfile '${shown[shown.length - 1].file}'\n`);
  const width = Math.min(viewport.width, 960);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'),
    '-vf', `fps=12,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    join(OUT, `${name}.gif`),
  ]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}.gif (${Math.round((Date.now() - started) / 1000)} s)`);
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no progress for ${ms / 1000} s`)), ms))]);
const log = (...a) => process.env.DEBUG && console.log(...a);

/** Moves the pointer smoothly onto an element and clicks it. */
async function click(page, locator, opts = {}) {
  log('click', String(locator));
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(page, 150);
  await page.mouse.down({ button: opts.button ?? 'left' });
  await page.mouse.up({ button: opts.button ?? 'left' });
  await pause(page, opts.after ?? 450);
}
async function drag(page, from, to, steps = 25) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 15 });
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  await pause(page, 200);
  await page.mouse.up();
  await pause(page, 500);
}
async function typeInto(page, locator, text) {
  await click(page, locator, { after: 150 });
  await locator.pressSequentially(text, { delay: 70 });
}

const api = async (context, path, init = {}) => {
  const r = await context.request.fetch(`${BASE}/api${path}`, init);
  if (!r.ok()) throw new Error(`${path}: ${r.status()}`);
  return r.json();
};
const piWk = async (context) => (await api(context, '/wks')).find((w) => w.title.includes('Pi Kp'));

// ---- 1. QR check-in on the phone ----
await record('checkin', { viewport: { width: 390, height: 780 } }, async (page) => {
  // The Kp Kdt opens the check-in of the first WK day (otherwise only open on that day).
  const kdt = await (await chromium.launch(LAUNCH)).newContext();
  await kdt.request.post(`${BASE}/api/auth/login`, { data: { email: 'kpkdt@demo.ch', password: PASSWORD } });
  const wk = await piWk(kdt);
  const day = (await api(kdt, `/wks/${wk.id}/checkin-days`)).find((d) => d.date === wk.startDate);
  await api(kdt, `/wks/${wk.id}/checkin-days/${day.date}`, { method: 'PUT', data: { mode: 'OPEN' } });
  await kdt.close();

  await page.goto(`${BASE}/checkin/${day.token}`);
  await page.getByText('Sanitarische Eintrittsbefragung', { exact: false }).first().waitFor();
  await pause(page, 900);
  const inputs = page.locator('form input.cell-input');
  await typeInto(page, inputs.nth(0), 'Lea');
  await typeInto(page, inputs.nth(1), 'Brunner');
  await click(page, page.getByRole('radio', { name: 'Pi Z 2' }));
  await click(page, page.getByRole('radio', { name: 'Vegetarisch' }));
  await page.mouse.wheel(0, 600);
  await pause(page, 900);
  await click(page, page.getByRole('button', { name: /gesund einchecken/ }), { after: 2200 });
});

// ---- 2. Jahresplanung: month view by rank, plan days by dragging ----
await record('jahresplanung', { viewport: { width: 1280, height: 860 }, email: 'bat@demo.ch' }, async (page, context) => {
  const wk = await piWk(context);
  const year = Number(wk.startDate.slice(0, 4));
  await page.goto(`${BASE}/jahresplanung`);
  await page.getByRole('button', { name: 'Monat' }).waitFor();
  while (Number(await page.locator('span.tabular-nums.font-semibold').first().textContent()) < year)
    await page.getByRole('button', { name: 'Nächstes Jahr' }).click();
  await click(page, page.getByRole('button', { name: 'Monat' }));
  await page.locator('select[aria-label=Monat]').selectOption(String(Number(wk.startDate.slice(5, 7)) - 1));
  await pause(page, 600);
  await click(page, page.getByLabel(/Nach Funktion/), { after: 900 });
  const table = page.locator('table').first();
  const pi = table.locator('tbody', { hasText: 'Pi Kp' });
  // The date header stays in view, so one sees which days are planned.
  await table.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await pause(page, 900);
  // Zugführer of Pi Z 1 two days earlier in the KVK.
  const zfhr = pi.locator('tr').nth(2);
  const first = Number(wk.kvkDays[0].slice(8)) - 1; // day index of the KVK day in the month
  await drag(page, zfhr.locator(`td[data-c="${first - 4}"]`), zfhr.locator(`td[data-c="${first - 3}"]`));
  await click(page, page.getByRole('menuitem', { name: /KVK/ }), { after: 1400 });
  // Soldaten of Pi Z 2 not on the first WK day.
  const sdt = pi.locator('tr').nth(8);
  await drag(page, sdt.locator(`td[data-c="${first + 1}"]`), sdt.locator(`td[data-c="${first + 1}"]`), 5);
  await click(page, page.getByRole('menuitem', { name: 'Kein Dienst' }), { after: 2000 });
});

// ---- 3. Arbeitsprogramm: move a block, copy it with the right-click menu ----
await record('arbeitsprogramm', { viewport: { width: 1280, height: 760 }, email: 'kpkdt@demo.ch' }, async (page, context) => {
  const wk = await piWk(context);
  const detail = await api(context, `/wks/${wk.id}`);
  const block = detail.blocks.find((b) => b.type === 'AUSBILDUNG' && !b.locked && b.zugIds.length === 1 && b.date === wk.startDate) ?? detail.blocks.find((b) => !b.locked);
  await page.goto(`${BASE}/wk/${wk.id}`);
  const el = page.locator(`[data-block-id="${block.id}"]`);
  await el.waitFor();
  await pause(page, 900);
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 14, { steps: 18 });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 14 + 70, { steps: 25 });
  await page.mouse.up();
  await pause(page, 1200);
  await click(page, el, { button: 'right', after: 900 });
  await click(page, page.getByRole('menuitem', { name: /Kopie am/ }), { after: 2000 });
});

// ---- 4. Ressourcenplanung: approve a request and assign the vehicles ----
await record('ressourcen', { viewport: { width: 1280, height: 760 }, email: 'kpkdt@demo.ch' }, async (page, context) => {
  const wk = await piWk(context);
  await page.goto(`${BASE}/wk/${wk.id}/ressourcen`);
  await page.getByRole('button', { name: 'Liste' }).waitFor();
  await pause(page, 1500);
  await click(page, page.getByRole('button', { name: 'Liste' }), { after: 900 });
  const row = page.locator('tr', { hasText: 'Pickup' }).first();
  await click(page, row.getByRole('button', { name: 'Bewilligen' }), { after: 800 });
  const dialog = page.getByRole('dialog');
  const boxes = dialog.locator('input[type=checkbox]');
  // Free vehicles may already be ticked; tick the rest.
  for (let i = 0; i < Math.min(2, await boxes.count()); i++) if (!(await boxes.nth(i).isChecked())) await click(page, boxes.nth(i), { after: 300 });
  await pause(page, 600);
  await click(page, dialog.getByRole('button', { name: 'Bewilligen' }), { after: 1200 });
  await click(page, page.getByRole('button', { name: 'Belegungsplan' }), { after: 2200 });
});
