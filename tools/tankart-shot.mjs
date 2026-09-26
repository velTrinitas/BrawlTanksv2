/**
 * tankart-shot.mjs — zrzuty strony podgladu Tank Art v2 (dev; dev-server musi chodzic).
 *   node tools/tankart-shot.mjs [out.png] [mode]   mode: grid | fire | poligon | super
 * Narzedzie dev — brak wplywu na symulacje.
 */
import { chromium } from 'playwright';
const url = process.env.BT_URL || 'http://localhost:5173/BrawlTanksv2/tankart-preview.html';
const out = process.argv[2] || 'docs/reports/ui/tankart-preview.png';
const mode = process.argv[3] || 'grid';
let browser; try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch({ channel: 'msedge' }); }
const page = await browser.newPage({ viewport: { width: 1100, height: 1500 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
if (mode === 'fire') { await page.click('#fire'); await page.waitForTimeout(120); }
if (mode === 'poligon' || mode === 'super') {
    const tank = process.env.TANK || 'twardy';
    await page.click(`[data-ptank="${tank}"]`);
    if (mode === 'super') await page.click('#p-super');
    const box = await page.locator('#poligon').boundingBox();
    await page.mouse.move(box.x + 700, box.y + 210);
    await page.mouse.down();
    await page.waitForTimeout(parseInt(process.env.HOLD || '650', 10));
    await page.screenshot({ path: out, clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    await page.mouse.up();
} else {
    await page.screenshot({ path: out, fullPage: true });
}
console.log('saved', out, 'errors:', errors.length); errors.forEach(e => console.log(e));
await browser.close();
