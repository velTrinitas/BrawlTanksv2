import * as PIXI from 'pixi.js';
import { worldRng } from '../../systems/Rng'; // Z0.1: seeded RNG

/**
 * Blizzard — cykliczna sniezyca na Arktyce (ARC-R3, podejscie zaakceptowane przez
 * Mariusza: KLIMAT, NIE KARA).
 *
 * Mobile-safe z definicji: WYLACZNIE particles (~70 platkow ze wspoldzielonej
 * tekstury + 6 smug wiatru w 1 gfx) — ZERO pelnoekranowej mgly/winiety
 * (full-screen overdraw = zakaz mobile-first; ograniczanie widocznosci = ryzyko
 * Czytelnosci #1). Poza zadymka: container hidden, koszt/frame ~= 0 (sam timer).
 *
 * Cykl: idle ~100-150s -> ramp-in 3s -> peak 24s -> fade-out 3s -> idle.
 * Platki dryfuja ukosnie przez viewport (world-space, recykling na krawedziach).
 */

const IDLE_MIN_MS = 100_000;
const IDLE_MAX_MS = 150_000;
const FIRST_IDLE_MIN_MS = 6_000;    // fix2: pierwsza zadymka po ~6-10s (test bez czekania)
const RAMP_MS = 3_000;
const PEAK_MS = 24_000;
const FLAKE_COUNT = 130;            // fix2: gesto — sniezyca ma byc ODCZUWALNA (design: dramatycznie, nie subtelnie)
const STREAK_COUNT = 9;
const MARGIN = 60;                  // recykling poza krawedzia viewportu

type Phase = 'idle' | 'ramp' | 'peak' | 'fade';

interface Flake {
    sprite: PIXI.Sprite;
    vx: number;
    vy: number;
    baseAlpha: number;
    wobblePhase: number;
}

export class Blizzard {
    private container: PIXI.Container;
    private streakGfx: PIXI.Graphics;
    private flakes: Flake[] = [];

    private phase: Phase = 'idle';
    private phaseAt = 0;
    private idleDuration: number;
    private intensity = 0;
    private onStart: (() => void) | null;

    private static _flakeTexture: PIXI.Texture | null = null;

    constructor(worldContainer: PIXI.Container, onStart?: () => void) {
        this.onStart = onStart ?? null;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        // fix2 (BUG): bylo zIndex=2000 — w swiecie Y-sort (zIndex = y+h, do ~3100!) polowa
        // mapy PRZYKRYWALA snieg. Pogoda = warstwa NAD calym swiatem (wciaz pod HUD-canvasem).
        this.container.zIndex = 1_000_000;
        this.container.visible = false;
        worldContainer.addChild(this.container);

        this.streakGfx = new PIXI.Graphics();
        this.container.addChild(this.streakGfx);

        const tex = this.getFlakeTexture();
        for (let i = 0; i < FLAKE_COUNT; i++) {
            const sprite = new PIXI.Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.scale.set(0.4 + Math.random() * 0.7);     // fix2: wyraznie wieksze platki
            this.container.addChild(sprite);
            this.flakes.push({
                sprite,
                vx: -(7 + Math.random() * 4),      // fix2: WIATR — ruch robi czytelnosc sniezycy
                vy: 2 + Math.random() * 1.5,
                baseAlpha: 0.6 + Math.random() * 0.3,
                wobblePhase: Math.random() * Math.PI * 2,
            });
        }

        this.phaseAt = Date.now();
        // Z0.2 AUDIT: WORLD RNG (timing pierwszej zamieci = wspolne zdarzenie swiata) — SEEDED w Z0.1 (worldRng)
        this.idleDuration = FIRST_IDLE_MIN_MS + worldRng.next() * 4_000;
    }

    /** Debug/test: wymus natychmiastowy start zadymki (konsola: snieg()). */
    public forceStart(): void {
        if (this.phase === 'idle') this.idleDuration = 0;
    }

    /** Per-frame. camX/camY/viewW/viewH = viewport world-space (jak buildings.forEach). */
    public update(camX: number, camY: number, viewW: number, viewH: number, delta: number): void {
        const now = Date.now();

        // ── maszyna cyklu ──
        switch (this.phase) {
            case 'idle':
                if (now - this.phaseAt >= this.idleDuration) {
                    this.phase = 'ramp';
                    this.phaseAt = now;
                    this.container.visible = true;
                    // rozsyp platki po CALYM viewporcie na start
                    for (const f of this.flakes) {
                        f.sprite.x = camX - MARGIN + Math.random() * (viewW + MARGIN * 2);
                        f.sprite.y = camY - MARGIN + Math.random() * (viewH + MARGIN * 2);
                    }
                    console.log('[Blizzard] START zadymki (ramp 3s -> peak 24s)');
                    this.onStart?.();
                }
                if (!this.container.visible) return; // zero pracy poza zadymka
                break;
            case 'ramp': {
                this.intensity = Math.min(1, (now - this.phaseAt) / RAMP_MS);
                if (this.intensity >= 1) { this.phase = 'peak'; this.phaseAt = now; }
                break;
            }
            case 'peak':
                this.intensity = 1;
                if (now - this.phaseAt >= PEAK_MS) { this.phase = 'fade'; this.phaseAt = now; }
                break;
            case 'fade': {
                this.intensity = Math.max(0, 1 - (now - this.phaseAt) / RAMP_MS);
                if (this.intensity <= 0) {
                    this.phase = 'idle';
                    this.phaseAt = now;
                    // Z0.2 AUDIT: WORLD RNG (timing kolejnej zamieci) — SEEDED w Z0.1 (worldRng)
                    this.idleDuration = IDLE_MIN_MS + worldRng.next() * (IDLE_MAX_MS - IDLE_MIN_MS);
                    this.container.visible = false;
                    return;
                }
                break;
            }
        }

        // ── platki: dryf + wobble + recykling na krawedziach viewportu ──
        const left = camX - MARGIN, right = camX + viewW + MARGIN;
        const top = camY - MARGIN, bottom = camY + viewH + MARGIN;
        const t = now / 1000;
        for (const f of this.flakes) {
            f.sprite.x += f.vx * delta;
            f.sprite.y += (f.vy + Math.sin(t * 2 + f.wobblePhase) * 0.5) * delta;
            f.sprite.alpha = f.baseAlpha * this.intensity;

            // fix2 (BUG): recykling byl tylko 2-stronny (x<left, y>bottom). Gdy KAMERA
            // jechala na zachod/poludnie, platki "uciekaly" za prawa/gorna krawedz i NIE
            // wracaly — po paru sekundach jazdy viewport byl pusty ("nie widze sniezycy").
            // Pelny 4-stronny wrap => stala gestosc niezaleznie od ruchu kamery.
            const spanX = right - left;
            const spanY = bottom - top;
            if (f.sprite.x < left) f.sprite.x += spanX;
            else if (f.sprite.x > right) f.sprite.x -= spanX;
            if (f.sprite.y > bottom) f.sprite.y -= spanY;
            else if (f.sprite.y < top) f.sprite.y += spanY;
        }

        // ── smugi wiatru (6 cienkich kresek — pedza szybciej niz platki) ──
        const g = this.streakGfx;
        g.clear();
        g.lineStyle(2, 0xeef5f8, 0.30 * this.intensity);
        for (let i = 0; i < STREAK_COUNT; i++) {
            const prog = ((t * 1.2 + i / STREAK_COUNT) % 1);
            const sx = right - prog * (viewW + MARGIN * 2);
            const sy = top + ((i * 0.618 + 0.2) % 1) * (bottom - top) + Math.sin(t * 3 + i) * 8;
            g.moveTo(sx, sy);
            g.lineTo(sx + 70, sy - 18); // ukosna smuga zgodna z wiatrem
        }
        g.lineStyle(0);
    }

    private getFlakeTexture(): PIXI.Texture {
        if (Blizzard._flakeTexture) return Blizzard._flakeTexture;
        const size = 20;
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext('2d')!;
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        // fix2: zimny niebieskawy rabek — czysto biale platki znikaly na BIALYM lodzie
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.45, 'rgba(235,245,252,0.55)');
        grad.addColorStop(0.75, 'rgba(150,185,210,0.30)');
        grad.addColorStop(1, 'rgba(130,170,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        Blizzard._flakeTexture = PIXI.Texture.from(cv);
        return Blizzard._flakeTexture;
    }
}
