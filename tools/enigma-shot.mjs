// ENIGMA ETAP 1 — zrzuty symulatora (dev-only). Wymaga dzialajacego dev-servera.
// Uzycie: node tools/enigma-shot.mjs [katalog_wyjsciowy]   (BT_URL nadpisuje adres)
import { chromium } from 'playwright';
const out = process.argv[2] || 'reports';
const url = process.env.BT_URL || 'http://localhost:5175/BrawlTanksv2/enigma-preview.html';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1140, height: 1150 }, deviceScaleFactor: 1 })).newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
// obrotnica: 3 katy + skorka
for (const [i, a] of [[0, 31], [1, 0], [2, 18]]) {
    await p.evaluate(v => { const S = window.__enigma.S; S.autoRotate = false; S.angleIdx = v; }, a);
    await p.waitForTimeout(150);
    await (await p.$('#turn')).screenshot({ path: `${out}/enigma-turn-${i}.png` });
}
// skorki jak w sklepie: wzor (retro) + czysta paleta (desert)
for (const name of ['retro', 'desert']) {
    const v = await p.$eval('#palette', (el, n) => [...el.options].find(o => o.text.includes(n)).value, name);
    await p.selectOption('#palette', v); await p.waitForTimeout(150);
    await (await p.$('#turn')).screenshot({ path: `${out}/enigma-skin-${name}.png` });
}
await p.selectOption('#palette', '0');
// strzelnica: celowanie w cel i seria
const box = await (await p.$('#range')).boundingBox();
await p.mouse.move(box.x + 812, box.y + 250);
await p.mouse.down(); await p.waitForTimeout(700);
await (await p.$('#range')).screenshot({ path: `${out}/enigma-fire.png` });
await p.waitForTimeout(1500); await p.mouse.up();
await p.keyboard.press('Space'); await p.mouse.down(); await p.waitForTimeout(700);
await (await p.$('#range')).screenshot({ path: `${out}/enigma-super.png` });
await p.mouse.up();
console.log(await p.$eval('#stats', e => e.innerText));
console.log(errs.length ? errs.join('\n') : 'brak bledow konsoli');
await b.close();
