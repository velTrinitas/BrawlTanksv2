// ZLOMOWISKO: render SFX mapy (OfflineAudioContext w Chrome przez Playwright) -> WAV, potem ffmpeg -> MP3.
// Uzycie: node tools/render-junkyard-sfx.mjs <outDir>   (patrz memory sfx-loudness: zmierz, nie zgaduj)
// Dzwieki: press_beep (pip telegrafu, 2 warianty), press_slam (huk + brzek + pyl), press_rise (syk hydrauliki),
//          press_crush (chrupniecie zgniatanej blachy), stun_ring (ogluszenie bossa).
import { chromium } from 'playwright';
import fs from 'fs';
const outDir = process.argv[2] || '.';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();

const render = async (name) => p.evaluate(async (name) => {
    const SR = 44100;
    const dur = { press_beep: 0.16, press_beep_hi: 0.14, press_slam: 1.4, press_rise: 2.6, press_crush: 0.7, stun_ring: 1.2, crane_motor: 1.6, magnet_clank: 0.6, crane_whistle: 0.7, crane_thud: 1.2, console_armed: 0.5, crusher_chomp: 0.9, crusher_spit: 0.6, hubcap_clang: 0.7, megaphone_promo: 1.1, towtruck_horn: 0.8, dog_bark: 0.5 }[name];
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
    let a = 20261008; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const noise = (sec, shape) => { const nb = ctx.createBuffer(1, Math.floor(SR * sec), SR); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * shape(i / d.length); return nb; };
    const t = 0;
    const out = ctx.destination;
    if (name === 'press_beep' || name === 'press_beep_hi') {
        const hi = name === 'press_beep_hi';
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hi ? 1245 : 932;
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = (hi ? 1245 : 932) * 2;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
        g.gain.setValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        const g2 = ctx.createGain(); g2.gain.value = 0.12;
        o.connect(lp).connect(g).connect(out); o2.connect(g2).connect(g); o.start(t); o2.start(t); o.stop(t + 0.14); o2.stop(t + 0.14);
    }
    if (name === 'press_slam') {
        // 1) sub thump
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.0, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.62);
        // 2) metal clang: short noise burst through two resonant bandpasses (1.6k + 3.1k) with pitch fall
        for (const [f0, f1, q, gain, len] of [[1700, 650, 2.4, 0.7, 0.5], [3100, 1400, 5, 0.35, 0.35]]) {
            const ns = ctx.createBufferSource(); ns.buffer = noise(len, (p) => Math.pow(1 - p, 2.4));
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + len); bp.Q.value = q;
            const ng = ctx.createGain(); ng.gain.value = gain;
            ns.connect(bp).connect(ng).connect(out); ns.start(t);
        }
        // 3) ring of the plate (two detuned metallic partials)
        for (const [f, gain, len] of [[412, 0.16, 0.9], [617, 0.1, 0.7], [1234, 0.05, 0.5]]) {
            const r = ctx.createOscillator(); r.type = 'triangle'; r.frequency.value = f;
            const rg = ctx.createGain(); rg.gain.setValueAtTime(0.0001, t + 0.01); rg.gain.exponentialRampToValueAtTime(gain, t + 0.02); rg.gain.exponentialRampToValueAtTime(0.001, t + len);
            r.connect(rg).connect(out); r.start(t + 0.01); r.stop(t + len + 0.02);
        }
        // 4) debris rattle: sparse clicks 0.15..0.9 s
        for (let i = 0; i < 18; i++) {
            const st = 0.12 + rnd() * 0.8;
            const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 1800 + rnd() * 2600;
            const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, st); cg.gain.exponentialRampToValueAtTime(0.05 + rnd() * 0.06, st + 0.002); cg.gain.exponentialRampToValueAtTime(0.0005, st + 0.02 + rnd() * 0.03);
            c.connect(cg).connect(out); c.start(st); c.stop(st + 0.06);
        }
        // 5) dust whoosh
        const ds = ctx.createBufferSource(); ds.buffer = noise(1.0, (p) => Math.sin(Math.PI * Math.min(1, p * 1.2)) * (1 - p));
        const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.setValueAtTime(900, t + 0.05); dl.frequency.exponentialRampToValueAtTime(250, t + 1.0);
        const dg = ctx.createGain(); dg.gain.value = 0.22;
        ds.connect(dl).connect(dg).connect(out); ds.start(t + 0.05);
    }
    if (name === 'press_rise') {
        // hydraulic hiss: filtered noise swelling then fading + low motor hum + end clunk
        const ns = ctx.createBufferSource(); ns.buffer = noise(2.4, (p) => Math.sin(Math.PI * Math.min(1, p * 1.15)));
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 2.2); bp.Q.value = 0.8;
        const ng = ctx.createGain(); ng.gain.value = 0.28;
        ns.connect(bp).connect(ng).connect(out); ns.start(t);
        const h = ctx.createOscillator(); h.type = 'sawtooth'; h.frequency.setValueAtTime(58, t); h.frequency.linearRampToValueAtTime(66, t + 2.2);
        const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 220;
        const hg = ctx.createGain(); hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.3, t + 0.2); hg.gain.setValueAtTime(0.3, t + 2.0); hg.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
        h.connect(hl).connect(hg).connect(out); h.start(t); h.stop(t + 2.45);
        const k = ctx.createOscillator(); k.type = 'sine'; k.frequency.setValueAtTime(220, t + 2.3); k.frequency.exponentialRampToValueAtTime(90, t + 2.45);
        const kg = ctx.createGain(); kg.gain.setValueAtTime(0.0001, t + 2.3); kg.gain.exponentialRampToValueAtTime(0.5, t + 2.31); kg.gain.exponentialRampToValueAtTime(0.001, t + 2.55);
        k.connect(kg).connect(out); k.start(t + 2.3); k.stop(t + 2.56);
    }
    if (name === 'press_crush') {
        // crumpling sheet metal: dense random clicks with pitch bends + low crunch
        for (let i = 0; i < 40; i++) {
            const st = rnd() * 0.5;
            const c = ctx.createOscillator(); c.type = 'sawtooth'; c.frequency.setValueAtTime(400 + rnd() * 1800, st); c.frequency.exponentialRampToValueAtTime(120 + rnd() * 400, st + 0.04);
            const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, st); cg.gain.exponentialRampToValueAtTime(0.08 + rnd() * 0.1, st + 0.003); cg.gain.exponentialRampToValueAtTime(0.0005, st + 0.03 + rnd() * 0.04);
            c.connect(cg).connect(out); c.start(st); c.stop(st + 0.09);
        }
        const ns = ctx.createBufferSource(); ns.buffer = noise(0.6, (p) => Math.pow(1 - p, 1.6));
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        const ng = ctx.createGain(); ng.gain.value = 0.5;
        ns.connect(lp).connect(ng).connect(out); ns.start(t);
    }
    if (name === 'stun_ring') {
        // cartoon "dizzy" ring: descending bell arpeggio with vibrato
        for (const [i, f] of [1046, 880, 698, 587].entries()) {
            const st = i * 0.14;
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
            const v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 12; v.connect(vg).connect(o.frequency);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.35, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + 0.6);
            o.connect(g).connect(out); o.start(st); v.start(st); o.stop(st + 0.62); v.stop(st + 0.62);
        }
    }
    if (name === 'crane_motor') {
        // electric slewing motor: two detuned saws through a lowpass, slow swell + gear tick
        for (const [f, g] of [[92, 0.22], [138, 0.14], [276, 0.06]]) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.9, t); o.frequency.linearRampToValueAtTime(f, t + 0.4);
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
            const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(g, t + 0.25); og.gain.setValueAtTime(g, t + 1.2); og.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
            o.connect(lp).connect(og).connect(out); o.start(t); o.stop(t + 1.6);
        }
        for (let i = 0; i < 14; i++) { const st = 0.1 + i * 0.1; const c2 = ctx.createOscillator(); c2.type = 'square'; c2.frequency.value = 1400; const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, st); cg.gain.exponentialRampToValueAtTime(0.04, st + 0.002); cg.gain.exponentialRampToValueAtTime(0.0005, st + 0.015); c2.connect(cg).connect(out); c2.start(st); c2.stop(st + 0.02); }
    }
    if (name === 'magnet_clank') {
        // steel on steel: bright noise burst + ringing partials
        const ns = ctx.createBufferSource(); ns.buffer = noise(0.25, (p) => Math.pow(1 - p, 3));
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 1.5;
        const ng = ctx.createGain(); ng.gain.value = 0.6; ns.connect(bp).connect(ng).connect(out); ns.start(t);
        for (const [f, g, len] of [[523, 0.3, 0.55], [1046, 0.18, 0.4], [1570, 0.1, 0.3]]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(g, t + 0.008); og.gain.exponentialRampToValueAtTime(0.001, t + len); o.connect(og).connect(out); o.start(t); o.stop(t + len + 0.02); }
    }
    if (name === 'crane_whistle') {
        // cartoon falling whistle: sine sweeping down with vibrato
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1900, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.65);
        const v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 18; const vg = ctx.createGain(); vg.gain.value = 40; v.connect(vg).connect(o.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05); g.gain.setValueAtTime(0.5, t + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + 0.68);
        o.connect(g).connect(out); o.start(t); v.start(t); o.stop(t + 0.7); v.stop(t + 0.7);
    }
    if (name === 'crane_thud') {
        // heavy wreck landing: sub thump + crunch noise + a few metal bounces
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.0, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
        const ns = ctx.createBufferSource(); ns.buffer = noise(0.6, (p) => Math.pow(1 - p, 2));
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
        const ng = ctx.createGain(); ng.gain.value = 0.7; ns.connect(lp).connect(ng).connect(out); ns.start(t);
        for (const [st, f] of [[0.25, 700], [0.42, 520], [0.55, 900]]) { const c2 = ctx.createOscillator(); c2.type = 'triangle'; c2.frequency.value = f; const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, st); cg.gain.exponentialRampToValueAtTime(0.18, st + 0.005); cg.gain.exponentialRampToValueAtTime(0.001, st + 0.25); c2.connect(cg).connect(out); c2.start(st); c2.stop(st + 0.3); }
    }
    if (name === 'console_armed') {
        // two-note confirm + relay click
        for (const [st, f] of [[0, 660], [0.14, 990]]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.4, st + 0.01); g.gain.setValueAtTime(0.4, st + 0.1); g.gain.exponentialRampToValueAtTime(0.001, st + 0.16); o.connect(lp).connect(g).connect(out); o.start(st); o.stop(st + 0.17); }
        const ns = ctx.createBufferSource(); ns.buffer = noise(0.05, (p) => 1 - p); const ng = ctx.createGain(); ng.gain.value = 0.5; ns.connect(ng).connect(out); ns.start(0.3);
    }
    if (name === 'crusher_chomp') {
        // steel jaws: two fast metallic snaps (bandpassed noise, pitch fall) + crunch of sheet metal + low thud
        for (const [st, f0, f1, len] of [[0, 2600, 900, 0.18], [0.11, 2100, 700, 0.22]]) {
            const ns = ctx.createBufferSource(); ns.buffer = noise(len, (p) => Math.pow(1 - p, 2.0));
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f0, st); bp.frequency.exponentialRampToValueAtTime(f1, st + len); bp.Q.value = 3;
            const g = ctx.createGain(); g.gain.value = 0.7; ns.connect(bp).connect(g).connect(out); ns.start(st);
        }
        const cr = ctx.createBufferSource(); cr.buffer = noise(0.6, (p) => (p < 0.1 ? p * 10 : Math.pow(1 - (p - 0.1) / 0.9, 1.6)) * (0.6 + 0.4 * Math.sin(p * 140)));
        const cl = ctx.createBiquadFilter(); cl.type = 'lowpass'; cl.frequency.setValueAtTime(1800, 0.2); cl.frequency.exponentialRampToValueAtTime(500, 0.8);
        const cg = ctx.createGain(); cg.gain.value = 0.4; cr.connect(cl).connect(cg).connect(out); cr.start(0.2);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, 0.1); o.frequency.exponentialRampToValueAtTime(38, 0.5);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, 0.1); og.gain.exponentialRampToValueAtTime(0.8, 0.115); og.gain.exponentialRampToValueAtTime(0.001, 0.6);
        o.connect(og).connect(out); o.start(0.1); o.stop(0.62);
    }
    if (name === 'crusher_spit') {
        // "ptui": short pressure pop + rising whoosh + cartoon boing
        const ns = ctx.createBufferSource(); ns.buffer = noise(0.08, (p) => 1 - p); const ng = ctx.createGain(); ng.gain.value = 0.7; ns.connect(ng).connect(out); ns.start(0);
        const ws = ctx.createBufferSource(); ws.buffer = noise(0.4, (p) => Math.sin(Math.PI * p)); const wl = ctx.createBiquadFilter(); wl.type = 'bandpass'; wl.frequency.setValueAtTime(600, 0.05); wl.frequency.exponentialRampToValueAtTime(3200, 0.4); wl.Q.value = 1.2;
        const wg = ctx.createGain(); wg.gain.value = 0.35; ws.connect(wl).connect(wg).connect(out); ws.start(0.05);
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, 0.08); o.frequency.exponentialRampToValueAtTime(660, 0.3); o.frequency.exponentialRampToValueAtTime(440, 0.5);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, 0.08); og.gain.exponentialRampToValueAtTime(0.35, 0.1); og.gain.exponentialRampToValueAtTime(0.001, 0.55);
        o.connect(og).connect(out); o.start(0.08); o.stop(0.56);
    }
    if (name === 'hubcap_clang') {
        // thin steel disc: bright ringing partials with a wobble (hubcap spinning down) + short hit
        const ns = ctx.createBufferSource(); ns.buffer = noise(0.06, (p) => 1 - p); const ng = ctx.createGain(); ng.gain.value = 0.5; ns.connect(ng).connect(out); ns.start(0);
        for (const [f, gain, len] of [[1860, 0.3, 0.6], [2790, 0.18, 0.45], [4120, 0.1, 0.3]]) {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
            const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 22; lfo.connect(lg).connect(o.frequency);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0.005); g.gain.exponentialRampToValueAtTime(gain, 0.012); g.gain.exponentialRampToValueAtTime(0.001, len);
            o.connect(g).connect(out); o.start(0.005); o.stop(len + 0.02); lfo.start(0); lfo.stop(len + 0.02);
        }
    }
    if (name === 'megaphone_promo') {
        // megaphone jingle: 3 rising square notes through a tinny bandpass + crackle
        for (const [st, f] of [[0, 523], [0.18, 659], [0.36, 784], [0.54, 1046]]) {
            const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.9;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.35, st + 0.01); g.gain.setValueAtTime(0.35, st + 0.13); g.gain.exponentialRampToValueAtTime(0.001, st + 0.2);
            o.connect(bp).connect(g).connect(out); o.start(st); o.stop(st + 0.22);
        }
        const cr = ctx.createBufferSource(); cr.buffer = noise(1.0, (p) => 0.35 * (0.5 + 0.5 * Math.sin(p * 400)) * (1 - p * 0.5));
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const cg = ctx.createGain(); cg.gain.value = 0.12; cr.connect(hp).connect(cg).connect(out); cr.start(0);
    }
    if (name === 'towtruck_horn') {
        // two-tone truck horn (sawtooth pair, slight detune) with a soft attack
        for (const f of [311, 392]) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
            const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.006;
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.3, 0.04); g.gain.setValueAtTime(0.3, 0.5); g.gain.exponentialRampToValueAtTime(0.001, 0.75);
            o.connect(lp).connect(g).connect(out); o2.connect(lp); o.start(0); o2.start(0); o.stop(0.78); o2.stop(0.78);
        }
    }
    if (name === 'dog_bark') {
        // small dog: two yaps — pitch-bent sawtooth through a formant bandpass + breath noise
        for (const st of [0, 0.22]) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(520, st); o.frequency.exponentialRampToValueAtTime(880, st + 0.04); o.frequency.exponentialRampToValueAtTime(430, st + 0.14);
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(1400, st); bp.frequency.exponentialRampToValueAtTime(900, st + 0.14); bp.Q.value = 1.6;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.6, st + 0.012); g.gain.exponentialRampToValueAtTime(0.001, st + 0.16);
            o.connect(bp).connect(g).connect(out); o.start(st); o.stop(st + 0.18);
            const ns = ctx.createBufferSource(); ns.buffer = noise(0.08, (p) => 1 - p); const ng = ctx.createGain(); ng.gain.value = 0.15; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000; ns.connect(hp).connect(ng).connect(out); ns.start(st);
        }
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
for (const name of (process.argv[3] ? process.argv[3].split(',') : ['press_beep', 'press_beep_hi', 'press_slam', 'press_rise', 'press_crush', 'stun_ring', 'crane_motor', 'magnet_clank', 'crane_whistle', 'crane_thud', 'console_armed', 'crusher_chomp', 'crusher_spit', 'hubcap_clang', 'megaphone_promo', 'towtruck_horn', 'dog_bark'])) {
    const s = await render(name);
    const peak = Math.max(...s.map(Math.abs)) || 1;
    fs.writeFileSync(`${outDir}/${name}.wav`, wav(s.map(v => v / peak * 0.95))); // peak-normalised; final loudness w ffmpeg
    console.log(name, 'peak', peak.toFixed(3), 'len', (s.length / 44100).toFixed(2));
}
await b.close();
