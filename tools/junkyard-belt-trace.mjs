// ZLOMOWISKO J5: trace tasmy + kruszarki (gracz niesiony na E, wypluty; wrog pozarty). Uruchom z katalogu projektu; dev server na 5173.
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5173';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage(); const logs = [];
p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
p.on('console', m => { const tx = m.text(); if (m.type() === 'error' || /rror|Conveyor|crusher/i.test(tx)) logs.push(m.type() + ': ' + tx.slice(0, 300)); });
await p.goto(`http://localhost:${PORT}/BrawlTanksv2/?junkyard=1&bot=1`); await p.waitForTimeout(2200);
await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
await p.reload(); await p.waitForTimeout(2200);
await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
await p.evaluate(async () => { await window.__sigmaTest.control.start({ map: 'junkyard', brawler: 'pancerny', difficulty: 'normal' }); });
await p.waitForTimeout(1500);
await p.evaluate(() => { window.__sigmaTest.control.god(true); window.__sigmaTest.control.teleport(2300, 1500); }); await p.waitForTimeout(2500);
const rows = [];
for (let i = 0; i < 16; i++) {
    await p.evaluate(() => window.__sigmaTest.control.step(30));
    const r = await p.evaluate(() => { const s = window.__sigmaTest.snapshot(); const t = window.tasma?.(); return { fr: s.frame, hp: s.player?.hp, x: Math.round(s.player?.x), y: Math.round(s.player?.y), eaten: t?.eatenCount, gs: s.gameState }; });
    rows.push(JSON.stringify(r));
    if (i === 4) { await p.waitForTimeout(300); await p.screenshot({ path: 'reports/jy5-belt.png' }); } if (i === 7) await p.screenshot({ path: 'reports/jy5-belt-mouth.png' });
}
// office: screenshot of the portakabin with the tank just north of it
await p.evaluate(() => window.__sigmaTest.control.teleport(750, 2330)); await p.evaluate(() => window.__sigmaTest.control.step(10)); await p.waitForTimeout(200);
await p.screenshot({ path: 'reports/jy5-office.png' });
console.log(rows.join('\n')); console.log(logs.join('\n'));
await b.close();
