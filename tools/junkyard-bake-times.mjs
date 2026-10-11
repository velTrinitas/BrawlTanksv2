// ZLOMOWISKO: os czasu startu meczu (znaczniki bt:start:* z main.ts + long tasks) przy dlawieniu CPU.
// node tools/junkyard-bake-times.mjs [port] [cpuThrottle=6] [map=junkyard]
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5173', CPU = Number(process.argv[3] || 6), MAP = process.argv[4] || 'junkyard', EXTRA = process.argv[5] ? '&' + process.argv[5] : ''; // argv[5]: extra query, e.g. groundtiles=0
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage(); p.on('console', m => { if (/TankSpriteBaker] timing|EnemySpriteBaker] timing/.test(m.text())) console.log('  ' + m.text()); });
await p.goto(`http://localhost:${PORT}/BrawlTanksv2/?${MAP === 'junkyard' ? 'junkyard=1&' : ''}bot=1${EXTRA}`); await p.waitForTimeout(2200);
await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
await p.reload(); await p.waitForTimeout(2200);
await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.evaluate(() => { window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); performance.mark('bt:t0');
  // texImage2D probe: when and how long each GPU upload took (ground = 3000x3000 or 750x750 tiles)
  const fr = document.createElement('iframe'); fr.style.display = 'none'; document.body.appendChild(fr); const NOW = fr.contentWindow.performance.now.bind(fr.contentWindow.performance); window.__realNow = NOW; window.__realT0 = NOW(); window.__tex = []; for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) { const o = P.texImage2D; P.texImage2D = function (...args) { const t = NOW(); const r = o.apply(this, args); const src = args[args.length - 1]; const w = src && src.width ? src.width : args[3], h = src && src.height ? src.height : args[4]; window.__tex.push([t - window.__realT0, NOW() - t, w, h]); return r; }; } });
const PROFILE = process.argv[6] === 'profile'; let profStartReal = 0;
if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); profStartReal = await p.evaluate(() => window.__realNow() - window.__realT0); }
await p.evaluate(async (map) => { await window.__sigmaTest.control.start({ map, brawler: 'pancerny', difficulty: 'normal' }); }, MAP);
await p.waitForTimeout(6000);
const r = await p.evaluate(() => {
  const t0 = performance.getEntriesByName('bt:t0')[0].startTime;
  const marks = performance.getEntriesByType('mark').filter(m => m.name.startsWith('bt:start:')).map(m => [m.name.slice(9), m.startTime - t0]);
  return { marks, lt: window.__lt.map(([s, d]) => [s - t0, d]), bakes: window.__jyBakeTimes ? window.__jyBakeTimes().length : 0, ground: window.__groundBuildMs ? window.__groundBuildMs() : -1, slice: window.__groundSliceMs ? window.__groundSliceMs() : -1, tex: window.__tex };
});
console.log(`CPU x${CPU} map ${MAP} | ground build ${r.ground.toFixed(0)} ms slice ${r.slice.toFixed(0)} ms | bakes ${r.bakes}`);
let prev = 0; for (const [n, t] of r.marks) { console.log(`${t.toFixed(0).padStart(6)} ms  ${n.padEnd(12)} (+${(t - prev).toFixed(0)})`); prev = t; }
const big = r.tex.filter(([, d, w, h]) => d >= 8 || (w >= 750 && h >= 750)); console.log(`texImage2D: ${r.tex.length} calls, ${r.tex.reduce((a, [, d]) => a + d, 0).toFixed(0)} ms total; >=8 ms or ground-sized:`); for (const [t, d, w, h] of big) console.log(`  ${t.toFixed(0).padStart(6)}  ${d.toFixed(0).padStart(5)} ms  ${w}x${h}`);
console.log('long tasks (start ms, dur ms):'); for (const [s, d] of r.lt) if (d >= 50) console.log(`  ${s.toFixed(0).padStart(6)}  ${d.toFixed(0).padStart(5)}`);
if (PROFILE) {
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  // sample i time (ms, relative to real t0) = profStartReal + cumulative deltas / 1000
  let tAcc = 0; const samples = profile.samples.map((id, i) => { tAcc += profile.timeDeltas[i] / 1000; return [profStartReal + tAcc, id, profile.timeDeltas[i] / 1000]; });
  const label = n => { const cf = n.callFrame; return (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').slice(-1)[0] + ':' + cf.lineNumber; };
  const agg = (from, to, title) => {
    const self = new Map(); let tot = 0;
    for (const [t, id, d] of samples) { if (t < from || t > to) continue; const l = label(byId.get(id)); self.set(l, (self.get(l) || 0) + d); tot += d; }
    console.log('profile ' + title + ' [' + from.toFixed(0) + '..' + to.toFixed(0) + '] sampled ' + tot.toFixed(0) + ' ms, top self-time:');
    for (const [l, d] of [...self].sort((x, y) => y[1] - x[1]).slice(0, 22)) console.log('  ' + d.toFixed(0).padStart(6) + '  ' + l);
  };
  const longest = r.lt.slice().sort((x, y) => y[1] - x[1])[0]; if (longest) agg(longest[0], longest[0] + longest[1], 'longest task');
  const m = Object.fromEntries(r.marks); if (m.map !== undefined && m.mapDone !== undefined) agg(m.map, m.mapDone, 'map build');
  if (m.bakersDone !== undefined && m.uploaded !== undefined) agg(m.bakersDone, m.uploaded, 'upload phase');
}
await b.close();
