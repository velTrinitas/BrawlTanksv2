// PUMPKIN ETAP 2 — mecz KTB Pumpkinem za ?pumpkin=1: strzal, plamy na wrogach i scianach, super 5 dyn. Dev-only.
// Uzycie: node tools/pumpkin-match.mjs [szer] [wys]   (vite na 5181; domyslnie 1366x768, mobile: 812 375)
import { chromium } from 'playwright';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 768);
const BASE = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
const p = await ctx.newPage();
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
await p.waitForTimeout(6000);
const tag = W < 1000 ? '-mobile' : '';
await p.screenshot({ path: `reports/pumpkin-match${tag}-start.png` });
// ogien w strone srodka-prawo przez 4 s
await p.mouse.move(W * 0.75, H * 0.45);
await p.mouse.down(); await p.waitForTimeout(4000);
await p.screenshot({ path: `reports/pumpkin-match${tag}-fire.png` });
await p.mouse.up();
await p.evaluate(() => window.__devSuper?.());
await p.mouse.move(W * 0.8, H * 0.5);
await p.mouse.down(); await p.waitForTimeout(350);
await p.screenshot({ path: `reports/pumpkin-match${tag}-super.png` });
await p.waitForTimeout(1500);
await p.screenshot({ path: `reports/pumpkin-match${tag}-super2.png` });
await p.mouse.up();
console.log(JSON.stringify({ errs: errs.slice(0, 8) }, null, 1));
await b.close();
