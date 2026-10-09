// ZLOMOWISKO J6a: trace zdarzen (lawina kolpakow + wyprzedaz) i lawety + zrzuty paralaksy (prasa z kamera przesunieta).
// Uruchom z katalogu projektu; dev server na 5173 (arg = port). Zrzuty w reports/.
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5173';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage(); const logs = [];
p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
p.on('console', m => { const tx = m.text(); if (m.type() === 'error' || /rror|Junkyard|TowTruck|Hubcap/i.test(tx)) logs.push(m.type() + ': ' + tx.slice(0, 300)); });
const boot = async (extra) => {
    await p.goto(`http://localhost:${PORT}/BrawlTanksv2/?junkyard=1&bot=1${extra}`); await p.waitForTimeout(2200);
    await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
    await p.reload(); await p.waitForTimeout(2200);
    await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
    await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
    await p.evaluate(async () => { await window.__sigmaTest.control.start({ map: 'junkyard', brawler: 'pancerny', difficulty: 'normal' }); });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { window.__sigmaTest.control.god(true); });
    await p.waitForTimeout(4500); // loading screen (min visible) must be gone before screenshots
};
const snap = () => p.evaluate(() => { const s = window.__sigmaTest.snapshot(); const z = window.zlom?.(); return { fr: s.frame, hp: s.player?.hp, x: Math.round(s.player?.x), y: Math.round(s.player?.y), ev: z?.phaseName, fired: z?.eventsFired, caps: z?.activeHubcaps, cap0: z?.hubcapPos, en: s.enemies.filter(e => e.active).length, gems: s.gems?.length ?? s.pickups?.gems, gs: s.gameState }; });
const step = (n) => p.evaluate((n) => window.__sigmaTest.control.step(n), n);

await boot('');
// 1) parallax: press seen from the SW (camera centre away from the press) and from the NE
await p.evaluate(() => window.__sigmaTest.control.teleport(1150, 1750)); await step(10); await p.waitForTimeout(300);
await p.screenshot({ path: 'reports/jy6-parallax-sw.png' });
await p.evaluate(() => window.__sigmaTest.control.teleport(1850, 1250)); await step(10); await p.waitForTimeout(300);
await p.screenshot({ path: 'reports/jy6-parallax-ne.png' });
await p.evaluate(() => window.__sigmaTest.control.teleport(2450, 1300)); await step(10); await p.waitForTimeout(300);
await p.screenshot({ path: 'reports/jy6-crusher-teeth.png' });
// 2) hubcap avalanche forced: player near the NW inner stack
await p.evaluate(() => window.__sigmaTest.control.teleport(1350, 1150)); await step(5);
await p.evaluate(() => window.zlom().force('hubcaps'));
const rows = [];
for (let i = 0; i < 8; i++) { await step(30); rows.push('hub ' + JSON.stringify(await snap())); if (i === 4) { await p.waitForTimeout(200); await p.screenshot({ path: 'reports/jy6-hubcaps.png' }); } if (i === 5) await p.screenshot({ path: 'reports/jy6-hubcaps2.png' }); }
// 3) parts sale forced: player by the office
await p.evaluate(() => window.__sigmaTest.control.teleport(750, 2600)); await step(5);
await p.evaluate(() => window.zlom().force('sale'));
for (let i = 0; i < 3; i++) { await step(20); rows.push('sale ' + JSON.stringify(await snap())); }
await p.screenshot({ path: 'reports/jy6-sale.png' });
// 3b) tyre jump: drive onto the S tyre -> flight over the press -> landing N
await p.evaluate(() => window.__sigmaTest.control.teleport(1430, 1810));
const jumpRows = [];
for (let i = 0; i < 6; i++) { await step(15); jumpRows.push(JSON.stringify(await p.evaluate(() => { const s = window.__sigmaTest.snapshot(); return { fr: s.frame, x: Math.round(s.player?.x), y: Math.round(s.player?.y), air: window.opona?.()?.isAirborne() }; }))); if (i === 2) await p.screenshot({ path: 'reports/jy6b-jump.png' }); }
rows.push('jump ' + jumpRows.join(' | '));
// 3c) ambient: dog by the office, cat on the container
await p.evaluate(() => window.__sigmaTest.control.teleport(760, 2250)); await step(60); await p.waitForTimeout(300); await p.screenshot({ path: 'reports/jy6b-dog.png' });
await p.evaluate(() => window.__sigmaTest.control.teleport(2300, 560)); await step(10); await p.waitForTimeout(300); await p.screenshot({ path: 'reports/jy6b-cat.png' });
// 4) tow truck: south lane near start
await p.evaluate(() => { const t = window.laweta().pos; window.__sigmaTest.control.teleport(t.x, t.y - 120); }); await step(10); await p.waitForTimeout(300);
await p.screenshot({ path: 'reports/jy6-towtruck.png' });
console.log(rows.join('\n')); console.log(logs.join('\n') || 'no errors');
await b.close();
