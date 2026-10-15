// PUMPKIN ETAP 3 — CALACA w meczu (?pumpkin=1): wezwanie klawiszem E, zrzuty jazdy/nut + ikona HUD. Dev-only, vite 5181.
// Uzycie: node tools/pumpkin-calaca.mjs [szer] [wys]
import { chromium } from 'playwright';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 768);
const BASE = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.stack || e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '?cloud=0&pumpkin=1');
await p.waitForTimeout(2500);
await p.evaluate(async () => {
    const m = await import('/BrawlTanksv2/src/services/ProfileService.ts');
    const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' });
    m.ProfileService.setActiveProfile(pr.id);
    for (const k of Object.keys(localStorage)) if (/tutorial|_tut_/i.test(k)) localStorage.setItem(k, '1');
});
await p.reload();
await p.waitForTimeout(2500);
await p.evaluate(() => window.__devStart?.('ktb', 'desert', 'pumpkin'));
await p.waitForTimeout(12000); // wrogowie dojezdzaja
const tag = W < 1000 ? '-mobile' : '';
await p.screenshot({ path: `reports/calaca${tag}-0.png` });
await p.keyboard.press('e');
await p.waitForTimeout(700);
await p.screenshot({ path: `reports/calaca${tag}-1.png` });
await p.waitForTimeout(2200);
await p.screenshot({ path: `reports/calaca${tag}-2.png` });
await p.waitForTimeout(3000);
await p.screenshot({ path: `reports/calaca${tag}-3.png` });
console.log(JSON.stringify({ errs: errs.slice(0, 8) }, null, 1));
await b.close();
