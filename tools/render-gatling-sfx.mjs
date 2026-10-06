// ENIGMA: render generowanego dzwieku gatlinga (synteza 1:1 z src/experimental/tank25d/gatlingSfx.ts, bez jittera)
// do WAV przez OfflineAudioContext w Chrome (Playwright). Uzycie: node tools/render-gatling-sfx.mjs <outDir>
// Potem ffmpeg: WAV -> MP3 + wyrownanie glosnosci (memory: sfx-loudness).
import { chromium } from 'playwright';
import fs from 'fs';
const outDir = process.argv[2] || '.';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
const render = async (isSuper) => p.evaluate(async (isSuper) => {
    const SR = 44100, dur = 0.12;
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
    // szum deterministyczny (mulberry32) — ten sam plik przy kazdym renderze
    let a = 20261006; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nb = ctx.createBuffer(1, Math.floor(SR * 0.08), SR); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    const t = 0;
    const ns = ctx.createBufferSource(); ns.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = isSuper ? 1600 : 2400; bp.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(isSuper ? 0.55 : 0.45, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    ns.connect(bp).connect(ng).connect(ctx.destination); ns.start(t); ns.stop(t + 0.06);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(isSuper ? 75 : 95, t); o.frequency.exponentialRampToValueAtTime(isSuper ? 40 : 52, t + 0.06);
    const og = ctx.createGain(); og.gain.setValueAtTime(isSuper ? 0.6 : 0.42, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og).connect(ctx.destination); o.start(t); o.stop(t + 0.08);
    const k = ctx.createOscillator(); k.type = 'square'; k.frequency.value = isSuper ? 2600 : 3200;
    const kg = ctx.createGain(); kg.gain.setValueAtTime(0, t); kg.gain.setValueAtTime(0.06, t + 0.004); kg.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
    k.connect(kg).connect(ctx.destination); k.start(t); k.stop(t + 0.015);
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
fs.writeFileSync(`${outDir}/shoot_gatling.wav`, wav(await render(false)));
fs.writeFileSync(`${outDir}/shoot_gatling_super.wav`, wav(await render(true)));
console.log('ok');
await b.close();
