// Renders docs/media/social-preview.html to social-preview.png (1280×640) and the logo to logo.png (512×512).
//   node docs/media/render-social.mjs        (CHROME=/path/to/chromium to use an installed browser)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--headless=new'] } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(pathToFileURL(`${dir}social-preview.html`).href);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${dir}social-preview.png` });
await page.setViewportSize({ width: 512, height: 512 });
await page.goto(pathToFileURL(`${dir}logo.svg`).href);
await page.screenshot({ path: `${dir}logo.png`, omitBackground: true });
await browser.close();
console.log('social-preview.png, logo.png');
