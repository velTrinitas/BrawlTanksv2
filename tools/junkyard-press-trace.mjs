import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage(); const logs = [];
p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
await p.goto('http://localhost:5175/BrawlTanksv2/?junkyard=1&bot=1'); await p.waitForTimeout(2200);
await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
await p.reload(); await p.waitForTimeout(2200);
await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
await p.evaluate(async () => { await window.__sigmaTest.control.start({ map: 'junkyard', brawler: 'pancerny', difficulty: 'normal' }); });
await p.waitForTimeout(1500);
await p.evaluate(() => { window.__sigmaTest.control.god(true); window.__sigmaTest.control.teleport(1500, 1500); });
const t0 = Date.now(); const rows = [];
let shotT=false, shotS=false; for (let i = 0; i < 40; i++) {
    await p.evaluate(() => window.__sigmaTest.control.step(30));
    const r = await p.evaluate(() => { const s = window.__sigmaTest.snapshot(); const pr = window.prasa?.(); return { ph: pr?.phaseName, hp: s.player?.hp, x: s.player?.x, y: s.player?.y, en: s.enemies.filter(e => e.active).length }; });
    rows.push(((Date.now() - t0) / 1000).toFixed(1) + ' ' + JSON.stringify(r));
    if (r.ph === 'telegraph' && !shotT) { shotT = true; await p.waitForTimeout(1800); await p.screenshot({ path: 'reports/jy3-press-telegraph.png' }); }
    if ((r.ph === 'slam' || r.ph === 'rise') && !shotS) { shotS = true; await p.screenshot({ path: 'reports/jy3-press-slam.png' }); await p.waitForTimeout(400); await p.screenshot({ path: 'reports/jy3-press-after.png' }); }
}
console.log(rows.filter((r, i) => i % 2 === 0).join('\n')); console.log(logs.join('\n'));
await b.close();
