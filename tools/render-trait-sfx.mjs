// v0.246.0 CECHY + SPRAY: render NOWYCH SFX (OfflineAudioContext w Chrome przez Playwright) -> WAV -> ffmpeg MP3.
// Uzycie: node tools/render-trait-sfx.mjs <outDir> [nazwa1,nazwa2]
// Potem: ffmpeg (sciezka w memory sfx-loudness) -> public/sfx/traits/<nazwa>.mp3 (libmp3lame q4, mono 44.1k).
// Kazdy dzwiek zaprojektowany pod JEDEN efekt (Sensoryka: kazda akcja ma wlasny, rozpoznawalny glos):
//   spray_paint     — klik kulki w puszce x2 + "psssssst" z kolorowanym szumem (ruch reki = wobble filtra)
//   trait_ready     — jasny, krotki "ding" z polyskiem (cecha gotowa)
//   trait_denied    — matowy podwojny "bonk" w dol (brak miejsca / cooldown)
//   sandbag_build   — 3 gluche "fump" workow ukladanych jeden na drugim + piasek
//   ram_charge      — narastajacy ryk silnika + whoosh (Pancerny rusza)
//   ram_impact      — ciezki metaliczny "KRUNCH" taranu
//   invis_on        — opadajacy shimmer + "fsss" znikania (Zwiad)
//   invis_off       — odwrocony shimmer w gore (pojawienie)
//   teleport_out    — zassanie: szybki sweep w gore + click
//   teleport_in     — "pop" materializacji: sweep w dol + iskry
//   fence_up        — elektryczne zbudzenie: brzeczenie 100 Hz + trzaski iskier
//   fence_zap       — krotki trzask porazenia wroga
//   jump_launch     — sprezyna + whoosh w gore (Shadow wybija sie)
//   jump_land       — glebokie uderzenie + fala ogluszenia (dzwonienie w uszach)
//   smoke_puff      — (v0.246.1) duchowy wydech: szum z echem + eteryczny shimmer z vibrato
//   ceasefire       — krolewska fanfara 3 nut (trabka) + dzwonek
//   repair_charge   — cieply narastajacy akord z migotaniem (Enigma, 1,6 s, gra na starcie naprawy)
import { chromium } from 'playwright';
import fs from 'fs';

const outDir = process.argv[2] || '.';
const ALL = ['spray_paint', 'trait_ready', 'trait_denied', 'sandbag_build', 'ram_charge', 'ram_impact', 'invis_on', 'invis_off',
    'teleport_out', 'teleport_in', 'fence_up', 'fence_zap', 'jump_launch', 'jump_land', 'smoke_puff', 'ceasefire', 'repair_charge'];
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();

const render = async (name) => p.evaluate(async (name) => {
    const SR = 44100;
    const dur = {
        spray_paint: 1.0, trait_ready: 0.5, trait_denied: 0.35, sandbag_build: 0.9, ram_charge: 0.8, ram_impact: 0.9,
        invis_on: 0.8, invis_off: 0.6, teleport_out: 0.45, teleport_in: 0.6, fence_up: 0.9, fence_zap: 0.25,
        jump_launch: 0.7, jump_land: 1.3, smoke_puff: 2.2, ceasefire: 1.3, repair_charge: 1.6,
    }[name];
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
    let a = 20261011; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const noise = (sec, shape) => { const nb = ctx.createBuffer(1, Math.max(1, Math.floor(SR * sec)), SR); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * shape(i / d.length); return nb; };
    const out = ctx.destination;
    const env = (g, at, peak, atk, len) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + atk); g.gain.exponentialRampToValueAtTime(0.0005, at + len); };
    const tone = (type, f0, f1, at, len, peak, atk = 0.005, dest = out) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + len);
        const g = ctx.createGain(); env(g, at, peak, atk, len); o.connect(g).connect(dest); o.start(at); o.stop(at + len + 0.02); return o;
    };
    const nz = (at, len, shape, type, f0, f1, q, gain) => {
        const s = ctx.createBufferSource(); s.buffer = noise(len, shape);
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, at); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, at + len); f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(out); s.start(at); return f;
    };
    const clicks = (from, to, n, fLo, fHi, gLo, gHi) => {
        for (let i = 0; i < n; i++) { const st = from + rnd() * (to - from); tone('square', fLo + rnd() * (fHi - fLo), fLo + rnd() * (fHi - fLo), st, 0.012 + rnd() * 0.02, gLo + rnd() * (gHi - gLo), 0.001); }
    };

    if (name === 'spray_paint') {
        // kulka mieszajaca w puszce: 2 metaliczne klik-klak
        for (const st of [0, 0.09]) { tone('triangle', 2900, 2400, st, 0.05, 0.35, 0.001); tone('sine', 5200, 4700, st, 0.03, 0.12, 0.001); }
        // psssssst: szum przez bandpass ~6 kHz z "wobble" reki (LFO na czestotliwosci)
        const f = nz(0.2, 0.75, (q) => Math.min(1, q * 12) * Math.pow(1 - q, 0.6), 'bandpass', 5200, 6800, 0.9, 0.9);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 900; lfo.connect(lg).connect(f.frequency); lfo.start(0.2); lfo.stop(0.95);
        nz(0.2, 0.75, (q) => Math.min(1, q * 12) * Math.pow(1 - q, 0.8), 'highpass', 9000, 9000, 0.7, 0.25); // syk powietrza
    }
    if (name === 'trait_ready') {
        tone('sine', 1568, 1568, 0, 0.35, 0.45, 0.004); tone('sine', 2349, 2349, 0.06, 0.4, 0.3, 0.004); tone('triangle', 3136, 3136, 0.06, 0.25, 0.08);
        nz(0.05, 0.3, (q) => 1 - q, 'highpass', 7000, 7000, 0.7, 0.05); // polysk
    }
    if (name === 'trait_denied') {
        tone('square', 260, 200, 0, 0.12, 0.25, 0.003); tone('square', 210, 150, 0.15, 0.16, 0.25, 0.003);
    }
    if (name === 'sandbag_build') {
        for (const st of [0, 0.22, 0.44]) {
            tone('sine', 140, 60, st, 0.18, 0.9, 0.004);                                       // gluche "fump"
            nz(st, 0.16, (q) => Math.pow(1 - q, 2), 'lowpass', 900, 300, 0.8, 0.6);            // jutowy szelest
            nz(st + 0.03, 0.22, (q) => Math.pow(1 - q, 1.5), 'bandpass', 3000, 2000, 1.2, 0.12); // osypujacy sie piasek
        }
    }
    if (name === 'ram_charge') {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, 0); o.frequency.exponentialRampToValueAtTime(150, 0.6);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, 0); lp.frequency.exponentialRampToValueAtTime(1400, 0.6);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, 0.15); g.gain.setValueAtTime(0.7, 0.55); g.gain.exponentialRampToValueAtTime(0.001, 0.78);
        o.connect(lp).connect(g).connect(out); o.start(0); o.stop(0.8);
        nz(0.1, 0.65, (q) => Math.sin(Math.PI * q), 'bandpass', 600, 2400, 0.8, 0.5); // whoosh
    }
    if (name === 'ram_impact') {
        tone('sine', 110, 32, 0, 0.5, 1.0, 0.005);
        nz(0, 0.45, (q) => Math.pow(1 - q, 2.2), 'bandpass', 1600, 500, 2.2, 0.8);
        nz(0, 0.3, (q) => Math.pow(1 - q, 3), 'bandpass', 3400, 1800, 5, 0.35);
        for (const [f, gg, l] of [[380, 0.14, 0.7], [571, 0.09, 0.6]]) tone('triangle', f, f * 0.97, 0.01, l, gg);
        clicks(0.08, 0.6, 14, 1500, 4000, 0.03, 0.08);
    }
    if (name === 'invis_on' || name === 'invis_off') {
        const down = name === 'invis_on', L = down ? 0.7 : 0.5;
        for (let i = 0; i < 6; i++) { const f = 900 * Math.pow(1.26, i); tone('sine', down ? f * 2 : f, down ? f : f * 2, i * 0.04, L - i * 0.04, 0.12, 0.01); }
        nz(0, L, (q) => down ? Math.pow(1 - q, 1.2) : q * (1 - q) * 4, 'highpass', down ? 6000 : 3000, down ? 2000 : 7000, 0.7, 0.3);
    }
    if (name === 'teleport_out') {
        tone('sawtooth', 180, 2400, 0, 0.3, 0.35, 0.01);
        nz(0, 0.32, (q) => q, 'bandpass', 800, 7000, 2, 0.5);
        tone('square', 4200, 4200, 0.31, 0.02, 0.3, 0.001);
    }
    if (name === 'teleport_in') {
        tone('sine', 2600, 220, 0, 0.25, 0.55, 0.002);
        tone('sine', 90, 50, 0, 0.2, 0.6, 0.003); // "pop" z masa
        nz(0, 0.12, (q) => 1 - q, 'highpass', 4000, 4000, 0.7, 0.35);
        clicks(0.05, 0.45, 10, 3500, 7000, 0.04, 0.1); // iskry
    }
    if (name === 'fence_up') {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
        const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 201;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.55, 0.12); g.gain.setValueAtTime(0.55, 0.6); g.gain.exponentialRampToValueAtTime(0.001, 0.88);
        const g2 = ctx.createGain(); g2.gain.value = 0.3;
        o.connect(bp); o2.connect(g2).connect(bp); bp.connect(g).connect(out); o.start(0); o2.start(0); o.stop(0.9); o2.stop(0.9);
        clicks(0.02, 0.8, 22, 2500, 8000, 0.08, 0.2); // trzaski lukow
    }
    if (name === 'fence_zap') {
        nz(0, 0.2, (q) => Math.pow(1 - q, 1.5) * (0.5 + 0.5 * Math.sign(Math.sin(q * 140))), 'highpass', 1800, 1800, 0.9, 0.8);
        tone('square', 120, 90, 0, 0.18, 0.3, 0.002);
    }
    if (name === 'jump_launch') {
        // sprezyna: szybkie "boing" (sinus z vibrato w gore) + whoosh
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, 0); o.frequency.exponentialRampToValueAtTime(620, 0.32);
        const vib = ctx.createOscillator(); vib.frequency.value = 28; const vg = ctx.createGain(); vg.gain.value = 40; vib.connect(vg).connect(o.frequency);
        const g = ctx.createGain(); env(g, 0, 0.6, 0.006, 0.36); o.connect(g).connect(out); o.start(0); vib.start(0); o.stop(0.4); vib.stop(0.4);
        nz(0.05, 0.6, (q) => Math.sin(Math.PI * q), 'bandpass', 500, 2600, 0.7, 0.55);
    }
    if (name === 'jump_land') {
        tone('sine', 95, 28, 0, 0.7, 1.0, 0.004);
        nz(0, 0.6, (q) => Math.pow(1 - q, 2), 'lowpass', 1200, 200, 0.7, 0.9);
        // ogluszenie: dzwonienie w uszach (dwie bliskie sinusoidy = dudnienie)
        tone('sine', 2793, 2793, 0.12, 1.1, 0.12, 0.05); tone('sine', 2805, 2805, 0.12, 1.1, 0.12, 0.05);
        clicks(0.05, 0.5, 12, 800, 2500, 0.04, 0.1); // gruz
    }
    if (name === 'smoke_puff') {
        // v0.246.1 (Mariusz: "bardziej duchowy"): wydech ducha — miekki szum z dlugim ogonem + echo (delay z
        // feedbackiem), eteryczny shimmer (2 sinusy z wolnym vibrato, opadajace), bez "wybuchowego" ataku.
        const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.23;
        const fb = ctx.createGain(); fb.gain.value = 0.42;
        const wet = ctx.createGain(); wet.gain.value = 0.55;
        dl.connect(fb).connect(dl); dl.connect(wet).connect(out);
        const s1 = ctx.createBufferSource(); s1.buffer = noise(1.5, (q) => Math.min(1, q * 3) * Math.pow(1 - q, 1.8));
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(1400, 0); bp.frequency.exponentialRampToValueAtTime(380, 1.5); bp.Q.value = 1.4;
        const ng = ctx.createGain(); ng.gain.value = 0.75;
        s1.connect(bp).connect(ng); ng.connect(out); ng.connect(dl); s1.start(0);
        for (const [f0, f1, gg] of [[880, 520, 0.16], [1318, 784, 0.1]]) {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, 0.05); o.frequency.exponentialRampToValueAtTime(f1, 1.6);
            const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 14; vib.connect(vg).connect(o.frequency);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0.05); g.gain.exponentialRampToValueAtTime(gg, 0.45); g.gain.exponentialRampToValueAtTime(0.0005, 1.75);
            o.connect(g); g.connect(out); g.connect(dl); o.start(0.05); vib.start(0.05); o.stop(1.8); vib.stop(1.8);
        }
    }
    if (name === 'ceasefire') {
        // trabka: piloksztaltny przez formant, 3 nuty G-C-E (krolewski sygnal) + dzwonek na koncu
        const notes = [[392, 0, 0.18], [523, 0.2, 0.18], [659, 0.4, 0.55]];
        for (const [f, st, l] of notes) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 1.1;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.6, st + 0.03); g.gain.setValueAtTime(0.55, st + l - 0.05); g.gain.exponentialRampToValueAtTime(0.001, st + l);
            o.connect(bp).connect(g).connect(out); o.start(st); o.stop(st + l + 0.02);
        }
        for (const [f, gg] of [[1976, 0.25], [2637, 0.15], [3951, 0.07]]) tone('sine', f, f, 0.6, 0.7, gg, 0.002);
    }
    if (name === 'repair_charge') {
        // cieply narastajacy akord C-E-G-C + migotanie (tremolo) — naprawa trwa, dzwiek "laduje"
        for (const [f, gg] of [[262, 0.22], [330, 0.18], [392, 0.16], [523, 0.12]]) {
            const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f * 0.94, 0); o.frequency.exponentialRampToValueAtTime(f, 0.5);
            const trem = ctx.createOscillator(); trem.frequency.value = 9; const tg = ctx.createGain(); tg.gain.value = gg * 0.35;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(gg, 0.6); g.gain.setValueAtTime(gg, 1.2); g.gain.exponentialRampToValueAtTime(0.0005, 1.58);
            trem.connect(tg).connect(g.gain); o.connect(g).connect(out); o.start(0); trem.start(0); o.stop(1.6); trem.stop(1.6);
        }
        for (let i = 0; i < 8; i++) { const st = 0.2 + i * 0.16; tone('sine', 1800 + i * 160, 1800 + i * 160, st, 0.12, 0.08, 0.003); } // iskierki
    }
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
}, name);

const wav = (samples) => {
    const n = samples.length, data = Buffer.alloc(44 + n * 2);
    data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(44100, 24);
    data.writeUInt32LE(88200, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
    samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
    return data;
};
for (const name of (process.argv[3] ? process.argv[3].split(',') : ALL)) {
    const s = await render(name);
    const peak = Math.max(...s.map(Math.abs)) || 1;
    fs.writeFileSync(`${outDir}/${name}.wav`, wav(s.map(v => v / peak * 0.95))); // peak-normalised; poziom docelowy = volume w AudioSys
    console.log(name, 'peak', peak.toFixed(3), 'len', (s.length / 44100).toFixed(2));
}
await b.close();
