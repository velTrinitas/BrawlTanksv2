// PUMPKIN — Pumpkin.jpg (200x200, biale tlo) z ilustracji Mariusza Pumpkin_500.png. Dev-only, vite 5181.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:5181/BrawlTanksv2/pumpkin-preview.html');
const data = await p.evaluate(async () => {
    const img = new Image(); img.src = '/BrawlTanksv2/assets/tanks/Pumpkin_500.png'; await img.decode();
    const c = document.createElement('canvas'); c.width = 200; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, 200, 200);
    return c.toDataURL('image/jpeg', 0.9);
});
writeFileSync('public/assets/tanks/Pumpkin.jpg', Buffer.from(data.split(',')[1], 'base64'));
await b.close();
