/**
 * gatlingSfx.ts — ENIGMA ETAP 1: generowany dzwiek gatlinga (WebAudio, tylko podglad enigma-preview.html).
 *
 * Strzal ~45 ms = trzask szumu (pasmo ~2,4 kHz) + niski "thump" (sinus 90 -> 50 Hz) + metaliczny klik
 * (kwadrat 3,2 kHz, 8 ms). Jitter wysokosci +-6% (anti-fatigue jak safePlayVaried). Super = nizszy i grubszy.
 * Osobno: rozpedzanie luf (rosnacy jek 200 -> 900 Hz) i hamowanie (900 -> 150 Hz).
 * Throttle: max ~12 odtworzen/s — gatling nie moze zatkac miksu (w grze: Howler + ten sam limit).
 * Po akceptacji brzmienia: render do public/sfx/shoot_gatling.mp3 (ffmpeg + pomiar glosnosci).
 */
export class GatlingSfx {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private lastShot = 0;
    private noiseBuf: AudioBuffer | null = null;
    enabled = true;
    volume = 0.6;
    /** 'file' = wyrenderowane MP3 (public/sfx/shoot_gatling*.mp3), 'synth' = synteza na zywo. */
    mode: 'file' | 'synth' = 'file';
    private samples: { normal: AudioBuffer | null; super: AudioBuffer | null } = { normal: null, super: null };

    /** Dekoduje MP3 raz (po unlock). Bledy logowane — wtedy zostaje synteza. */
    async loadSamples(normalUrl: string, superUrl: string): Promise<void> {
        if (!this.ctx) return;
        const load = async (url: string): Promise<AudioBuffer | null> => {
            try {
                const r = await fetch(url);
                return await this.ctx!.decodeAudioData(await r.arrayBuffer());
            } catch (e) {
                console.warn('[GatlingSfx] decode failed', url, (e as Error).stack);
                return null;
            }
        };
        this.samples.normal = await load(normalUrl);
        this.samples.super = await load(superUrl);
    }

    get samplesReady(): boolean { return !!this.samples.normal; }

    /** Wywolac z gestu uzytkownika (polityka autoplay). */
    unlock(): void {
        try {
            if (!this.ctx) {
                this.ctx = new AudioContext();
                this.master = this.ctx.createGain();
                this.master.connect(this.ctx.destination);
                const n = Math.floor(this.ctx.sampleRate * 0.08);
                this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
                const d = this.noiseBuf.getChannelData(0);
                for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            }
            if (this.ctx.state === 'suspended') void this.ctx.resume();
        } catch (e) {
            console.warn('[GatlingSfx] unlock failed', (e as Error).stack);
        }
    }

    private ready(): AudioContext | null {
        if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
        this.master.gain.value = this.volume;
        return this.ctx;
    }

    shot(isSuper: boolean): void {
        const ctx = this.ready(); if (!ctx || !this.noiseBuf) return;
        const nowMs = performance.now();
        if (nowMs - this.lastShot < 1000 / 12) return; // max ~12/s
        this.lastShot = nowMs;
        const sample = this.mode === 'file' ? (isSuper ? this.samples.super : this.samples.normal) : null;
        if (sample) {
            try {
                // plik MP3 + jitter wysokosci +-6% (jak safePlayVaried w grze)
                const src = ctx.createBufferSource(); src.buffer = sample;
                src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.06;
                const g = ctx.createGain(); g.gain.value = 0.9;
                src.connect(g).connect(this.master!); src.start();
            } catch (e) {
                console.warn('[GatlingSfx] sample play failed', (e as Error).stack);
            }
            return;
        }
        try {
            const t = ctx.currentTime;
            const j = 1 + (Math.random() * 2 - 1) * 0.06;
            // 1) trzask szumu
            const ns = ctx.createBufferSource(); ns.buffer = this.noiseBuf; ns.playbackRate.value = j;
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = (isSuper ? 1600 : 2400) * j; bp.Q.value = 0.9;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(isSuper ? 0.55 : 0.45, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
            ns.connect(bp).connect(ng).connect(this.master!); ns.start(t); ns.stop(t + 0.06);
            // 2) niski thump
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime((isSuper ? 75 : 95) * j, t); o.frequency.exponentialRampToValueAtTime(isSuper ? 40 : 52, t + 0.06);
            const og = ctx.createGain();
            og.gain.setValueAtTime(isSuper ? 0.6 : 0.42, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
            o.connect(og).connect(this.master!); o.start(t); o.stop(t + 0.08);
            // 3) metaliczny klik (mechanizm)
            const k = ctx.createOscillator(); k.type = 'square'; k.frequency.value = (isSuper ? 2600 : 3200) * j;
            const kg = ctx.createGain();
            kg.gain.setValueAtTime(0.06, t + 0.004); kg.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
            k.connect(kg).connect(this.master!); k.start(t); k.stop(t + 0.015);
        } catch (e) {
            console.warn('[GatlingSfx] shot failed', (e as Error).stack);
        }
    }

    private whine(f0: number, f1: number, dur: number, vol: number): void {
        const ctx = this.ready(); if (!ctx) return;
        try {
            const t = ctx.currentTime;
            const o = ctx.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(lp).connect(g).connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
        } catch (e) {
            console.warn('[GatlingSfx] whine failed', (e as Error).stack);
        }
    }

    spinUp(): void { this.whine(200, 900, 0.25, 0.08); }
    spinDown(): void { this.whine(900, 150, 0.4, 0.06); }
}
