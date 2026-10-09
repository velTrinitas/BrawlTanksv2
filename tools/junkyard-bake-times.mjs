// ZLOMOWISKO: os czasu startu meczu (znaczniki bt:start:* z main.ts + long tasks) przy dlawieniu CPU.
// node tools/junkyard-bake-times.mjs [port] [cpuThrottle=6] [map=junkyard]
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5173', CPU = Number(process.argv[3] || 6), MAP = process.argv[4] || 'junkyard';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage(); p.on('console', m => { if (/TankSpriteBaker] timing|EnemySpriteBaker] timing/.test(m.text())) console.log('  ' + m.text()); });
await p.goto(`http://localhost:${PORT}/BrawlTanksv2/?${MAP === 'junkyard' ? 'junkyard=1&' : ''}bot=1`); await p.waitForTimeout(2200);
await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
await p.reload(); await p.waitForTimeout(2200);
await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.evaluate(() => { window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); performance.mark('bt:t0'); });
await p.evaluate(async (map) => { await window.__sigmaTest.control.start({ map, brawler: 'pancerny', difficulty: 'normal' }); }, MAP);
await p.waitForTimeout(6000);
const r = await p.evaluate(() => {
  const t0 = performance.getEntriesByName('bt:t0')[0].startTime;
  const marks = performance.getEntriesByType('mark').filter(m => m.name.startsWith('bt:start:')).map(m => [m.name.slice(9), m.startTime - t0]);
  return { marks, lt: window.__lt.map(([s, d]) => [s - t0, d]), bakes: window.__jyBakeTimes ? window.__jyBakeTimes().length : 0, ground: window.__groundBuildMs ? window.__groundBuildMs() : -1 };
});
console.log(`CPU x${CPU} map ${MAP} | ground build ${r.ground.toFixed(0)} ms | bakes ${r.bakes}`);
let prev = 0; for (const [n, t] of r.marks) { console.log(`${t.toFixed(0).padStart(6)} ms  ${n.padEnd(12)} (+${(t - prev).toFixed(0)})`); prev = t; }
console.log('long tasks (start ms, dur ms):'); for (const [s, d] of r.lt) if (d >= 50) console.log(`  ${s.toFixed(0).padStart(6)}  ${d.toFixed(0).padStart(5)}`);
await b.close();
