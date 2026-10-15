// PUMPKIN: render generowanego dzwieku strzalu dynia (zwykly + super "fiesta") do WAV przez OfflineAudioContext
// w Chrome (Playwright), wzorzec render-gatling-sfx.mjs. Uzycie: node tools/render-pumpkin-sfx.mjs <outDir>
// Potem ffmpeg: WAV -> MP3 + pomiar volumedetect (memory: sfx-loudness).
//
// Warstwy (zwykly, ~0.32 s): 1) gluche "THOOMP" mozdzierza (sinus 150->42 Hz), 2) "BONK" pustej dyni
// (trojkat 260->170 Hz przez bandpass 420 Hz — drewniano-dyniowy rezonans), 3) "fssst" lotu (szum, bandpass
// sweep 700->2600 Hz), 4) klik wylotu (2 ms) + krotki "plop" (sinus 900->300 Hz). Super: nizszy thump, mocniejszy
// bonk + "fiesta" (3 szybkie dzwoneczki marimby 784/988/1319 Hz) — od razu slychac, ze leci salwa 5 dyn.
import { chromium } from 'playwright';
import fs from 'fs';
const outDir = process.argv[2] || '.';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
const render = async (isSuper) => p.evaluate(async (isSuper) => {
    const SR = 44100, dur = isSuper ? 0.5 : 0.34;
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
    let a = 20261031; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const master = ctx.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.attack.value = 0.002; master.release.value = 0.08;
    master.connect(ctx.destination);
    const env = (g, t0, peak, att, decay) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + att + decay); };
    // 1. THOOMP
    const th = ctx.createOscillator(); th.type = 'sine';
    th.frequency.setValueAtTime(isSuper ? 130 : 150, 0); th.frequency.exponentialRampToValueAtTime(42, 0.16);
    const thg = ctx.createGain(); env(thg, 0, isSuper ? 0.95 : 0.85, 0.004, 0.2);
    th.connect(thg).connect(master); th.start(0); th.stop(0.26);
    // 2. BONK pustej dyni
    const bo = ctx.createOscillator(); bo.type = 'triangle';
    bo.frequency.setValueAtTime(260, 0.005); bo.frequency.exponentialRampToValueAtTime(170, 0.14);
    const bbp = ctx.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = 420; bbp.Q.value = 3;
    const bog = ctx.createGain(); env(bog, 0.005, isSuper ? 0.9 : 0.7, 0.003, 0.16);
    bo.connect(bbp).connect(bog).connect(master); bo.start(0.005); bo.stop(0.2);
    // 3. lot dyni: szum ze sweepem
    const nb = ctx.createBuffer(1, Math.floor(SR * 0.3), SR); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = nb;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.4;
    nf.frequency.setValueAtTime(700, 0.02); nf.frequency.exponentialRampToValueAtTime(2600, 0.24);
    const ng = ctx.createGain(); env(ng, 0.02, 0.22, 0.04, 0.22);
    ns.connect(nf).connect(ng).connect(master); ns.start(0.02); ns.stop(0.3);
    // 4. klik wylotu + plop
    const ck = ctx.createOscillator(); ck.type = 'square'; ck.frequency.value = 2400;
    const ckg = ctx.createGain(); ckg.gain.setValueAtTime(0.12, 0); ckg.gain.exponentialRampToValueAtTime(0.0005, 0.006);
    ck.connect(ckg).connect(master); ck.start(0); ck.stop(0.01);
    const pl = ctx.createOscillator(); pl.type = 'sine';
    pl.frequency.setValueAtTime(900, 0.01); pl.frequency.exponentialRampToValueAtTime(300, 0.07);
    const plg = ctx.createGain(); env(plg, 0.01, 0.35, 0.003, 0.07);
    pl.connect(plg).connect(master); pl.start(0.01); pl.stop(0.1);
    // 5. SUPER: fiesta — 3 dzwoneczki marimby (sinus + alikwot x4, szybki zanik)
    if (isSuper) {
        [784, 988, 1319].forEach((f, i) => {
            const t0 = 0.06 + i * 0.07;
            for (const [mul, vol] of [[1, 0.32], [4, 0.06]]) {
                const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
                const g = ctx.createGain(); env(g, t0, vol, 0.003, 0.14);
                o.connect(g).connect(master); o.start(t0); o.stop(t0 + 0.2);
            }
        });
    }
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
}, isSuper);
const wav = (samples) => {
    const n = samples.length, data = Buffer.alloc(44 + n * 2);
    data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(44100, 24);
    data.writeUInt32LE(88200, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
    samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
    return data;
};
// CALACA (cecha Pumpkina): trabka mariachi = pila przez lowpass + kwadrat oktawe wyzej, atak 15 ms, vibrato.
// summon = fanfara G4-B4-D5 + trzymane G5 z vibrato (~0.75 s); note = jeden krotki "tu!" D5 (~0.22 s).
const renderHorn = async (kind) => p.evaluate(async (kind) => {
    const SR = 44100, notes = kind === 'summon' ? [[392, 0, 0.1], [494, 0.1, 0.1], [587, 0.2, 0.1], [784, 0.3, 0.42]] : [[587, 0, 0.16]];
    const dur = kind === 'summon' ? 0.8 : 0.24;
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 2.5;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    lp.connect(comp).connect(ctx.destination);
    for (const [f, t0, len] of notes) {
        const vib = ctx.createOscillator(); vib.frequency.value = 6.5; const vg = ctx.createGain(); vg.gain.value = len > 0.2 ? f * 0.012 : 0; vib.connect(vg);
        for (const [type, mul, vol] of [['sawtooth', 1, 0.32], ['square', 2, 0.08]]) {
            const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; vg.connect(o.frequency);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
            g.gain.setValueAtTime(vol, t0 + len - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + 0.05);
            o.connect(g).connect(lp); o.start(t0); o.stop(t0 + len + 0.06);
        }
        vib.start(t0); vib.stop(t0 + len + 0.06);
    }
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
}, kind);
fs.writeFileSync(`${outDir}/calaca_summon.wav`, wav(await renderHorn('summon')));
fs.writeFileSync(`${outDir}/calaca_note.wav`, wav(await renderHorn('note')));
fs.writeFileSync(`${outDir}/shoot_pumpkin.wav`, wav(await render(false)));
fs.writeFileSync(`${outDir}/shoot_pumpkin_super.wav`, wav(await render(true)));
console.log('ok');
await b.close();
