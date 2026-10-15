// DEV: samouczek na dotyku — stan manekina kroku 2. node tools/tut-shot.mjs ktb desert
import { chromium } from 'playwright';
const [sc = 'ktb', map = 'desert'] = process.argv.slice(2);
const BASE = 'http://localhost:5181/BrawlTanksv2/';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '?cloud=0'); await p.waitForTimeout(2500);
await p.evaluate(async () => { const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); });
await p.reload(); await p.waitForTimeout(2500);
await p.evaluate(([s, m]) => window.__devStart(s, m), [sc, map]);
await p.waitForTimeout(6000); await p.keyboard.down("d"); await p.waitForTimeout(800); await p.keyboard.up("d");
for (let i = 0; i < 6; i++) { await p.waitForTimeout(2000); console.log(JSON.stringify(await p.evaluate(() => window.__tut?.()))); }
await p.screenshot({ path: `reports/tut-${sc}.png` });
console.log(errs.slice(0, 5));
await b.close();
