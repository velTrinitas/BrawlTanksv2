// EVENT urodziny Michala: dzingiel "Sto lat" (melodia ludowa, domena publiczna) przez OfflineAudioContext
// w Chrome (Playwright), wzorzec render-pumpkin-sfx.mjs. Uzycie: node tools/render-bday-sfx.mjs <outDir>
// Barwa: dzwoneczki/marimba (sinus + alikwoty) + miekki bas na "raz". Potem ffmpeg WAV -> MP3.
import { chromium } from 'playwright';
import fs from 'fs';
const outDir = process.argv[2] || '.';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
const samples = await p.evaluate(async () => {
    const SR = 44100, BEAT = 0.3;
    const N = { D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, C3: 130.81, G2: 98, F2: 87.31 };
    // [nuta, dlugosc w uderzeniach]
    const mel = [['G4',1],['E4',2],['G4',1],['E4',2],['G4',1],['A4',1],['G4',1],['F4',1],['E4',1],['F4',2],
                 ['F4',1],['D4',2],['F4',1],['D4',2],['F4',1],['G4',1],['F4',1],['E4',1],['D4',1],['E4',3]];
    const total = mel.reduce((s, m) => s + m[1], 0) * BEAT + 0.8;
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * total), SR);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(ctx.destination);
    const bell = (f, t0, len, vol) => {
        for (const [mul, v] of [[1, 1], [2, 0.35], [3, 0.12], [4.2, 0.06]]) {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * v, t0 + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.25, len * 1.4));
            o.connect(g).connect(comp); o.start(t0); o.stop(t0 + len * 1.5 + 0.3);
        }
    };
    let t = 0.02, beat = 0;
    for (const [n, d] of mel) {
        bell(N[n], t, d * BEAT, 0.32);
        if (beat % 3 === 0) bell(beat < 10 ? N.C3 : N.G2, t, BEAT * 2, 0.2);
        t += d * BEAT; beat += d;
    }
    bell(N.C3 * 2, t, 0.6, 0.25); bell(N.E4 * 2, t, 0.6, 0.18); bell(N.G4 * 2, t, 0.6, 0.15); // akord na koniec
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
});
const n = samples.length, data = Buffer.alloc(44 + n * 2);
data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(44100, 24);
data.writeUInt32LE(88200, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
fs.writeFileSync(`${outDir}/bday_jingle.wav`, data);
console.log('ok', (n / 44100).toFixed(2) + 's');
await b.close();
