import * as PIXI from 'pixi.js';
import { MARS_HEX } from '../MarsMap';

/**
 * DustStorm — cyclic Martian dust storm (grammar layer P, weather).
 *
 * FAZA MARS M5. Built on the Blizzard contract, with its scars already applied:
 *
 *  - CLIMATE, NOT PUNISHMENT (lesson H1). The storm never blinds the player:
 *    no full-screen fog, no vignette, no visibility penalty. It is particles and
 *    haze streaks, nothing that hides a threat.
 *  - GATED (lesson D7): long idle, short peak, and while idle the whole thing
 *    early-returns with `visible = false` — cost ~0. This is what lets a class-C
 *    effect live on a map that also has to run the 18-power layer.
 *  - 4-SIDED WRAP (lesson D1/L2): particles live in VIEWPORT space and recycle on
 *    all four edges. Blizzard originally wrapped only two, so driving N/S emptied
 *    the field of flakes.
 *  - OVERLAY SUB-SLOT (token T15): the 1e6 band is shared with air-strike shadows
 *    and the laser column, and three of those sit on EXACTLY 1e6 with no
 *    tie-break — an unstable sort waiting to flicker. This storm deliberately
 *    takes the first FREE slot below them: 1e6 - 4.
 */

const Z_OVERLAY_SUBSLOT = 1_000_000 - 4;   // free sub-slot (see header / T15)

const IDLE_MIN_MS = 100_000;
const IDLE_MAX_MS = 150_000;
const RAMP_MS = 4_000;        // fade in / fade out shoulders
const PEAK_MS = 20_000;       // full-strength stretch

const PARTICLE_COUNT = 110;   // capped: fill-rate is what kills mobile, not count
const STREAK_COUNT = 7;

interface Mote {
    x: number;      // viewport space
    y: number;
    vx: number;
    vy: number;
    r: number;
    alpha: number;
    tone: number;
}

interface Streak {
    x: number;
    y: number;
    len: number;
    speed: number;
    alpha: number;
    wob: number;
}

type Phase = 'idle' | 'rampUp' | 'peak' | 'rampDown';

export class DustStorm {
    private container: PIXI.Container;
    private gfx: PIXI.Graphics;
    private motes: Mote[] = [];
    private streaks: Streak[] = [];

    private phase: Phase = 'idle';
    private phaseEndsAt: number;
    private intensity = 0;          // 0..1, drives alpha of everything
    private onStart: () => void;

    private viewW = 1280;
    private viewH = 720;

    constructor(worldContainer: PIXI.Container, onStart: () => void) {
        this.onStart = onStart;

        // ALL Graphics up front (E1)
        this.container = new PIXI.Container();
        this.gfx = new PIXI.Graphics();
        this.container.addChild(this.gfx);
        this.container.zIndex = Z_OVERLAY_SUBSLOT;
        this.container.visible = false;
        worldContainer.addChild(this.container);

        // Z0.2 AUDIT: WORLD RNG (timing startu burzy = wspolne zdarzenie swiata) -> seed w Z0.1
        this.phaseEndsAt = Date.now() + IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);

        for (let i = 0; i < PARTICLE_COUNT; i++) this.motes.push(this.makeMote(true));
        for (let i = 0; i < STREAK_COUNT; i++) this.streaks.push(this.makeStreak(true));
    }

    private makeMote(spread: boolean): Mote {
        const drift = 2.6 + Math.random() * 3.4;
        return {
            x: spread ? Math.random() * this.viewW : -20,
            y: Math.random() * this.viewH,
            vx: drift,
            vy: (Math.random() - 0.5) * 1.1,
            r: 1.1 + Math.random() * 2.6,
            alpha: 0.25 + Math.random() * 0.45,
            tone: Math.random() < 0.6 ? MARS_HEX.duneLight : MARS_HEX.craterRim,
        };
    }

    private makeStreak(spread: boolean): Streak {
        return {
            x: spread ? Math.random() * this.viewW : -140,
            y: Math.random() * this.viewH,
            len: 90 + Math.random() * 150,
            speed: 6 + Math.random() * 5,
            alpha: 0.05 + Math.random() * 0.07,
            wob: Math.random() * Math.PI * 2,
        };
    }

    /** Debug hook — window.burza() in main.ts, mirrors Blizzard's forceStart. */
    public forceStart(): void {
        if (this.phase !== 'idle') return;
        this.phase = 'rampUp';
        this.phaseEndsAt = Date.now() + RAMP_MS;
        this.container.visible = true;
        this.onStart();
    }

    /**
     * @param viewW/viewH viewport in WORLD units (hud.screenW / ZOOM) — the storm
     *        is drawn in screen space and pinned to the camera, so it must know
     *        how big the visible world rectangle is.
     * @param delta frame scale. Particle motion MUST be delta-scaled or the storm
     *        blows 2.4x faster on a 144 Hz screen than on 60 Hz (lesson D4).
     */
    public update(camX: number, camY: number, viewW: number, viewH: number, delta: number): void {
        const now = Date.now();
        this.viewW = viewW;
        this.viewH = viewH;

        // ── phase machine ──
        if (now >= this.phaseEndsAt) {
            switch (this.phase) {
                case 'idle':
                    this.phase = 'rampUp';
                    this.phaseEndsAt = now + RAMP_MS;
                    this.container.visible = true;
                    this.onStart();
                    break;
                case 'rampUp':
                    this.phase = 'peak';
                    this.phaseEndsAt = now + PEAK_MS;
                    break;
                case 'peak':
                    this.phase = 'rampDown';
                    this.phaseEndsAt = now + RAMP_MS;
                    break;
                case 'rampDown':
                    this.phase = 'idle';
                    // Z0.2 AUDIT: WORLD RNG (timing kolejnej burzy) -> seed w Z0.1
                    this.phaseEndsAt = now + IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
                    this.container.visible = false;
                    this.intensity = 0;
                    break;
            }
        }

        // ── IDLE EARLY-RETURN (D7): hidden storm costs nothing ──
        if (this.phase === 'idle') return;

        const left = this.phaseEndsAt - now;
        if (this.phase === 'rampUp') this.intensity = 1 - left / RAMP_MS;
        else if (this.phase === 'rampDown') this.intensity = left / RAMP_MS;
        else this.intensity = 1;

        // storm is pinned to the camera: draw in screen space, move the container
        this.container.x = camX;
        this.container.y = camY;

        const g = this.gfx;
        g.clear();

        // wind gusts in slow waves so the storm breathes instead of streaming flat
        const gust = 0.75 + 0.25 * Math.sin(now / 1700);
        const k = this.intensity * gust;

        // ── haze streaks (long, faint, behind the motes) ──
        for (const s of this.streaks) {
            s.x += s.speed * gust * delta;
            s.wob += 0.02 * delta;
            s.y += Math.sin(s.wob) * 0.5 * delta;
            if (s.x - s.len > viewW) { s.x = -s.len; s.y = Math.random() * viewH; }
            if (s.y < -30) s.y = viewH + 20;
            if (s.y > viewH + 30) s.y = -20;

            g.lineStyle(2 + s.len * 0.01, MARS_HEX.duneLight, s.alpha * k);
            g.moveTo(s.x - s.len, s.y);
            g.lineTo(s.x, s.y + Math.sin(s.wob) * 6);
        }
        g.lineStyle(0);

        // ── dust motes, 4-SIDED wrap (D1) ──
        for (const m of this.motes) {
            m.x += m.vx * gust * delta;
            m.y += (m.vy + Math.sin((m.x + m.y) * 0.01) * 0.25) * delta;

            if (m.x > viewW + 20) { m.x = -20; m.y = Math.random() * viewH; }
            else if (m.x < -20) { m.x = viewW + 20; m.y = Math.random() * viewH; }
            if (m.y > viewH + 20) { m.y = -20; m.x = Math.random() * viewW; }
            else if (m.y < -20) { m.y = viewH + 20; m.x = Math.random() * viewW; }

            g.beginFill(m.tone, m.alpha * k);
            g.drawEllipse(m.x, m.y, m.r * 1.6, m.r);
            g.endFill();
        }

        // ── thin ground-level dust sheet: a couple of soft bands drifting across.
        // Deliberately only bands, never a full-screen wash — H1/H5 forbid the
        // screen-covering fog that would hide a threat.
        for (let i = 0; i < 2; i++) {
            const bandY = ((now / 26 + i * viewH * 0.55) % (viewH + 260)) - 130;
            g.beginFill(MARS_HEX.duneLight, 0.05 * k);
            g.drawEllipse(viewW / 2, bandY, viewW * 0.75, 62);
            g.endFill();
        }
    }
}
