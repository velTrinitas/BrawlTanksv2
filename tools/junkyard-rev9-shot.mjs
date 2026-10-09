// ZLOMOWISKO REV 9: zrzuty prasy z prostopadloscianow + paszczy kruszarki na scianie W. Z katalogu projektu, dev server 5173.
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5173';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const logs = [];
p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') logs.push('error: ' + m.text().slice(0, 300)); });
await p.goto(`http://localhost:${PORT}/BrawlTanksv2/?junkyard=1&bot=1`); await p.waitForTimeout(2200);
await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
await p.reload(); await p.waitForTimeout(2200);
await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
await p.evaluate(async () => { await window.__sigmaTest.control.start({ map: 'junkyard', brawler: 'pancerny', difficulty: 'normal' }); });
await p.waitForTimeout(1500); await p.evaluate(() => { window.__sigmaTest.control.god(true); });
await p.waitForTimeout(4500);
const step = (n) => p.evaluate((n) => window.__sigmaTest.control.step(n), n);
const clip = { x: 683 - 400, y: 384 - 300, width: 800, height: 600 };
const shot = async (x, y, name, n = 14) => { await p.evaluate(([x, y]) => window.__sigmaTest.control.teleport(x, y), [x, y]); await step(n); await p.waitForTimeout(250); await p.screenshot({ path: `reports/${name}.png`, clip }); };
await shot(1500, 1500, 'jy9-press-over');
await shot(1760, 1740, 'jy9-press-se-0', 10); for (let i = 1; i <= 6; i++) { await step(90); await p.waitForTimeout(120); await p.screenshot({ path: `reports/jy9-press-se-${i}.png`, clip }); }
await shot(1240, 1300, 'jy9-press-nw-0', 10); for (let i = 1; i <= 6; i++) { await step(90); await p.waitForTimeout(120); await p.screenshot({ path: `reports/jy9-press-nw-${i}.png`, clip }); }
await shot(1180, 1760, 'jy9-press-sw');
await shot(1500, 1150, 'jy9-press-n');
await shot(2350, 1500, 'jy9-crusher-w');
await shot(2680, 1250, 'jy9-crusher-over');
await shot(2900, 1600, 'jy9-crusher-e');
await shot(2540, 1500, 'jy9-crusher-mouth', 40);
console.log(logs.join('\n') || 'no errors');
await b.close();
