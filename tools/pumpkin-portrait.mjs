// PUMPKIN — portrety 200x200 z prawdziwego paintera (render2dV2): galeria (jpg) i karta rosteru (png, biale tlo).
// Uzycie: node tools/pumpkin-portrait.mjs   (wymaga dev-servera; BT_URL nadpisuje adres)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const url = process.env.BT_URL || 'http://localhost:5181/BrawlTanksv2/pumpkin-preview.html';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext()).newPage();
await p.goto(url, { waitUntil: 'networkidle' });
for (const [kind, path] of [['jpg', 'public/assets/tanks/Pumpkin.jpg'], ['png', 'public/assets/tanks/tanks_200/Pumpkin_200.png']]) {
    const data = await p.evaluate(k => window.__pumpkin.portrait(k), kind);
    writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
    console.log('zapisano', path);
}
await b.close();
