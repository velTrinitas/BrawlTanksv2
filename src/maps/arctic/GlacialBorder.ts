import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { ARCTIC_PALETTE } from '../ArcticMap';

/**
 * GlacialBorder.ts v2 — granica mapy Arktyka: "Pressure Ridge".
 *
 * KONCEPCJA (Mariusz: krawedzie maja byc SPOJNE, nie ciezkie ciala obce):
 *   Krawedz to NIE doklejony klif/scena z obca paleta. To TA SAMA tafla, ktora ku
 *   brzegowi zamarza w narastajacy grzbiet spietrzonego lodu (jak realny lod morski
 *   napierajacy na brzeg). Malowane na PRZEZROCZYSTYM plotnie -> floor przeswituje,
 *   detal jest ADDYTYWNY, krawedz "wtapia sie" w tafle.
 *
 * Paleta: WYLACZNIE kolory tafli (ARCTIC_PALETTE) — zero "border-only" hexow.
 *   - Pile-up: albedo / midtint (jasne dla sun-side, chlodne dla shadow-side).
 *   - Crest rim: bialy/albedo (lit NW) lub lazur (shadow SE) = czytelny sygnal "koniec areny".
 *   - Crevices/shadow: depth + lazur (oba juz w tafli).
 *   - Sun NW -> TOP + LEFT oswietlone (lit). Cienie SE -> BOTTOM + RIGHT zacienione.
 *
 * Kontrakt identyczny jak TropicalBorder / CyberpunkBorder:
 *   - konstruktor buduje wizual (static-baked) + dodaje do worldContainer
 *   - getCollisionRects(): ICollidable[] -> buildings + solidBuildings
 *   - update(): no-op (FAZA A); destroy() dla porzadku
 *
 * Czytelnosc gate: cast shadow w arene alpha<=0.18 (nie chowa wrogow). Kolizja = 4
 * prostokaty T=130, x/y = TOP-LEFT (bez zmian).
 *
 * Mobile: 4 strip-sprite'y bake'owane RAZ (~8-12ms total), per-frame koszt = 0.
 *   Przezroczyste tla = brak dodatkowego overdraw poza pasem krawedzi. Zero filtrow.
 */

const COLLISION_T = 130;        // grubosc kolizji (playable inner = [T, WORLD-T])
const INNER_BLEND = 30;         // ile wizual wchodzi w arene (passable cast shadow)
const TOTAL = COLLISION_T + INNER_BLEND; // 160
const BORDER_Z = -50;           // nad podloga (-100), pod padami/encjami

const PAL = ARCTIC_PALETTE;

function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Statyczny prostokat kolizji (ICollidable). x/y = TOP-LEFT, update() = no-op. */
class StaticRect implements ICollidable {
    constructor(
        public x: number,
        public y: number,
        public w: number,
        public h: number,
    ) {}
    update(): void {
        /* granica statyczna — brak pracy per-frame */
    }
}

function seg(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    ang: number,
    len: number,
): void {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
}

export class GlacialBorder {
    private rects: ICollidable[];
    private sprites: PIXI.Sprite[] = [];

    constructor(worldW: number, worldH: number, container: PIXI.Container) {
        const rng = makeRng(0x00c0ffee);

        // ── Kolizja: 4 prostokaty (TOP-LEFT origin), T=130 (bez zmian vs v1) ──
        this.rects = [
            new StaticRect(0, 0, worldW, COLLISION_T),                    // TOP
            new StaticRect(0, worldH - COLLISION_T, worldW, COLLISION_T), // BOTTOM
            new StaticRect(0, 0, COLLISION_T, worldH),                    // LEFT
            new StaticRect(worldW - COLLISION_T, 0, COLLISION_T, worldH), // RIGHT
        ];

        // ── Wizual: 4 baked pressure-ridge stripy (przezroczyste tlo) ──
        // Sun NW: TOP + LEFT = lit; BOTTOM + RIGHT = shadow.
        const top = this.makeHorizontalRidge(worldW, false, true, rng);
        top.x = 0;
        top.y = 0;
        top.zIndex = BORDER_Z;

        const bottom = this.makeHorizontalRidge(worldW, true, false, rng);
        bottom.x = 0;
        bottom.y = worldH - TOTAL;
        bottom.zIndex = BORDER_Z;

        const left = this.makeVerticalRidge(worldH, false, true, rng);
        left.x = 0;
        left.y = 0;
        left.zIndex = BORDER_Z;

        const right = this.makeVerticalRidge(worldH, true, false, rng);
        right.x = worldW - TOTAL;
        right.y = 0;
        right.zIndex = BORDER_Z;

        // sciany boczne najpierw, potem gora/dol -> grzbiet nakrywa narozniki
        this.sprites = [left, right, top, bottom];
        for (const s of this.sprites) container.addChild(s);
    }

    getCollisionRects(): ICollidable[] {
        return this.rects;
    }

    update(): void {
        /* FAZA A: granica statyczna. (Pyl lodowy w arenie przyjdzie w FAZIE D.) */
    }

    destroy(): void {
        for (const s of this.sprites) {
            if (s.parent) s.parent.removeChild(s);
            s.destroy();
        }
        this.sprites = [];
    }

    // =============================================================
    // Pressure-ridge bakes (Canvas 2D, przezroczyste tlo)
    //   d = "depth" od zewnetrznej granicy swiata w glab areny (0..TOTAL).
    //   localY/localX mapuje d na piksel zaleznie od krawedzi (isBottom/isRight).
    // =============================================================

    private makeHorizontalRidge(
        worldW: number,
        isBottom: boolean,
        lit: boolean,
        rng: () => number,
    ): PIXI.Sprite {
        const cv = document.createElement('canvas');
        cv.width = worldW;
        cv.height = TOTAL;
        const c = cv.getContext('2d')!;
        const ly = (d: number): number => (isBottom ? TOTAL - d : d);

        // 1. Pile-up brightening band (grzbiet) — addytywny, ganie ku arenie.
        {
            const yOuter = ly(0);
            const yFade = ly(115);
            const g = c.createLinearGradient(0, yOuter, 0, yFade);
            if (lit) {
                g.addColorStop(0.0, 'rgba(255,255,255,0.40)');  // crest pile (bright)
                g.addColorStop(0.35, 'rgba(232,244,248,0.22)'); // albedo
                g.addColorStop(1.0, 'rgba(232,244,248,0)');
            } else {
                g.addColorStop(0.0, 'rgba(188,223,236,0.26)');  // midtint (cooler)
                g.addColorStop(0.4, 'rgba(74,111,165,0.14)');   // lazur tint
                g.addColorStop(1.0, 'rgba(74,111,165,0)');
            }
            c.fillStyle = g;
            c.fillRect(0, Math.min(yOuter, yFade), worldW, Math.abs(yFade - yOuter));
        }

        // 2. Fractures w grzbiecie — krotkie jagged smugi (d 6..96).
        const fcount = Math.floor(worldW / 26);
        for (let i = 0; i < fcount; i++) {
            const x = rng() * worldW;
            const d = 6 + rng() * 90;
            const y = ly(d);
            const len = 8 + rng() * 26;
            const ang = (rng() - 0.5) * 0.8 + (rng() < 0.5 ? 0 : Math.PI);
            c.save();
            c.lineCap = 'round';
            // hairline (depth/granat)
            c.globalAlpha = 0.16 + rng() * 0.18;
            c.strokeStyle = lit ? PAL.crackShadow : PAL.depth;
            c.lineWidth = 1 + rng() * 1.3;
            seg(c, x, y, ang, len);
            // highlight lip
            c.globalAlpha = (lit ? 0.30 : 0.16) + rng() * (lit ? 0.30 : 0.16);
            c.strokeStyle = lit ? '#ffffff' : PAL.midtint;
            c.lineWidth = 1;
            seg(c, x - 1.4, y - 1.4, ang, len * 0.8);
            c.restore();
        }

        // 3. Crest rim — ostra jagged linia (d~14): czytelny sygnal "koniec areny".
        {
            const yCrest = ly(14);
            c.save();
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.beginPath();
            const step = 42;
            for (let x = 0; x <= worldW; x += step) {
                const y = yCrest + (rng() - 0.5) * 8;
                if (x === 0) c.moveTo(0, y);
                else c.lineTo(x, y);
            }
            c.globalAlpha = lit ? 0.85 : 0.55;
            c.strokeStyle = lit ? '#ffffff' : PAL.shadow; // bright vs lazur
            c.lineWidth = lit ? 3 : 2.5;
            c.stroke();
            if (lit) {
                c.globalAlpha = 0.40;
                c.strokeStyle = PAL.crackSun;
                c.lineWidth = 1.5;
                c.stroke();
            }
            c.restore();
        }

        // 4. Gold sun-sparkle na grzbiecie (tylko lit) — male statyczne glinty,
        //    NIE krzyzyki/pickup. Wbudowane w rim, <=2.4px, sparse.
        if (lit) {
            const sc = Math.floor(worldW / 120);
            for (let i = 0; i < sc; i++) {
                const x = rng() * worldW;
                const y = ly(8 + rng() * 12);
                c.save();
                c.globalAlpha = 0.40 + rng() * 0.40;
                c.fillStyle = PAL.gold;
                c.beginPath();
                c.arc(x, y, 1 + rng() * 1.4, 0, Math.PI * 2);
                c.fill();
                c.restore();
            }
        }

        // 5. Cast shadow w arene (lazur), mocniejszy dla shadow-side. alpha<=0.18.
        {
            const yS = ly(108);
            const yE = ly(TOTAL);
            const g = c.createLinearGradient(0, yS, 0, yE);
            const a = lit ? 0.10 : 0.18;
            g.addColorStop(0, `rgba(74,111,165,${a})`);
            g.addColorStop(1, 'rgba(74,111,165,0)');
            c.fillStyle = g;
            c.fillRect(0, Math.min(yS, yE), worldW, Math.abs(yE - yS));
        }

        return new PIXI.Sprite(PIXI.Texture.from(cv));
    }

    private makeVerticalRidge(
        worldH: number,
        isRight: boolean,
        lit: boolean,
        rng: () => number,
    ): PIXI.Sprite {
        const cv = document.createElement('canvas');
        cv.width = TOTAL;
        cv.height = worldH;
        const c = cv.getContext('2d')!;
        const lx = (d: number): number => (isRight ? TOTAL - d : d);

        // 1. Pile-up brightening band (poziomy gradient).
        {
            const xOuter = lx(0);
            const xFade = lx(115);
            const g = c.createLinearGradient(xOuter, 0, xFade, 0);
            if (lit) {
                g.addColorStop(0.0, 'rgba(255,255,255,0.40)');
                g.addColorStop(0.35, 'rgba(232,244,248,0.22)');
                g.addColorStop(1.0, 'rgba(232,244,248,0)');
            } else {
                g.addColorStop(0.0, 'rgba(188,223,236,0.26)');
                g.addColorStop(0.4, 'rgba(74,111,165,0.14)');
                g.addColorStop(1.0, 'rgba(74,111,165,0)');
            }
            c.fillStyle = g;
            c.fillRect(Math.min(xOuter, xFade), 0, Math.abs(xFade - xOuter), worldH);
        }

        // 2. Fractures w grzbiecie.
        const fcount = Math.floor(worldH / 26);
        for (let i = 0; i < fcount; i++) {
            const y = rng() * worldH;
            const d = 6 + rng() * 90;
            const x = lx(d);
            const len = 8 + rng() * 26;
            const ang = Math.PI / 2 + (rng() - 0.5) * 0.8 + (rng() < 0.5 ? 0 : Math.PI);
            c.save();
            c.lineCap = 'round';
            c.globalAlpha = 0.16 + rng() * 0.18;
            c.strokeStyle = lit ? PAL.crackShadow : PAL.depth;
            c.lineWidth = 1 + rng() * 1.3;
            seg(c, x, y, ang, len);
            c.globalAlpha = (lit ? 0.30 : 0.16) + rng() * (lit ? 0.30 : 0.16);
            c.strokeStyle = lit ? '#ffffff' : PAL.midtint;
            c.lineWidth = 1;
            seg(c, x - 1.4, y - 1.4, ang, len * 0.8);
            c.restore();
        }

        // 3. Crest rim — pionowa jagged linia (d~14).
        {
            const xCrest = lx(14);
            c.save();
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.beginPath();
            const step = 42;
            for (let y = 0; y <= worldH; y += step) {
                const x = xCrest + (rng() - 0.5) * 8;
                if (y === 0) c.moveTo(x, 0);
                else c.lineTo(x, y);
            }
            c.globalAlpha = lit ? 0.85 : 0.55;
            c.strokeStyle = lit ? '#ffffff' : PAL.shadow;
            c.lineWidth = lit ? 3 : 2.5;
            c.stroke();
            if (lit) {
                c.globalAlpha = 0.40;
                c.strokeStyle = PAL.crackSun;
                c.lineWidth = 1.5;
                c.stroke();
            }
            c.restore();
        }

        // 4. Gold sun-sparkle (tylko lit).
        if (lit) {
            const sc = Math.floor(worldH / 120);
            for (let i = 0; i < sc; i++) {
                const y = rng() * worldH;
                const x = lx(8 + rng() * 12);
                c.save();
                c.globalAlpha = 0.40 + rng() * 0.40;
                c.fillStyle = PAL.gold;
                c.beginPath();
                c.arc(x, y, 1 + rng() * 1.4, 0, Math.PI * 2);
                c.fill();
                c.restore();
            }
        }

        // 5. Cast shadow w arene (lazur).
        {
            const xS = lx(108);
            const xE = lx(TOTAL);
            const g = c.createLinearGradient(xS, 0, xE, 0);
            const a = lit ? 0.10 : 0.18;
            g.addColorStop(0, `rgba(74,111,165,${a})`);
            g.addColorStop(1, 'rgba(74,111,165,0)');
            c.fillStyle = g;
            c.fillRect(Math.min(xS, xE), 0, Math.abs(xE - xS), worldH);
        }

        return new PIXI.Sprite(PIXI.Texture.from(cv));
    }
}