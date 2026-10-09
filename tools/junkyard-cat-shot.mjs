// ZLOMOWISKO J6b: zrzuty kota na dachu kontenera (chod / siad / sen / przeciaganie). Uruchom z katalogu projektu, dev server 5173.
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5173';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const logs = [];
p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await p.goto(`http://localhost:${PORT}/BrawlTanksv2/?junkyard=1&bot=1`); await p.waitForTimeout(2200);
await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
await p.reload(); await p.waitForTimeout(2200);
await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
await p.evaluate(async () => { await window.__sigmaTest.control.start({ map: 'junkyard', brawler: 'pancerny', difficulty: 'normal' }); });
await p.waitForTimeout(1500); await p.evaluate(() => { window.__sigmaTest.control.god(true); });
await p.waitForTimeout(4500);
await p.evaluate(() => window.__sigmaTest.control.teleport(2300, 620));
const step = (n) => p.evaluate((n) => window.__sigmaTest.control.step(n), n);
for (let i = 0; i < 6; i++) { await step(90); await p.waitForTimeout(250); await p.screenshot({ path: `reports/jy6b-cat-${i}.png`, clip: { x: 683 - 160, y: 384 - 260, width: 320, height: 200 } }); }
console.log(logs.join('\n') || 'no errors');
await b.close();
