import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { MARS_HEX, MARS_BASE_LAYOUT } from '../MarsMap';

/**
 * MarsBase — abandoned research station: two habitat modules joined by a raised
 * service passage. The map's LANDMARK (grammar layer 3).
 *
 * FAZA MARS M3, reworked in M5d after playtest:
 *   - "bazy zrobilbym bardziej kwadratowe z zaokraglonymi rogami" -> the domes
 *     are gone; modules are rounded-corner boxes, which read as built structures
 *     instead of igloos and give flat roof area to decorate.
 *   - "bardziej juicy — wiecej anten, fotowoltaika na dachu, cos miga, jakies
 *     charakterystyczne oznaczenia" -> roof solar arrays, antenna farm, dish,
 *     hazard striping, module numbers, blinking beacons and window rows.
 *   - "taki sam przejazd zrobilbym pod pasazem laczacym 2 bazy" -> the passage
 *     is now a CARPORT: no collision, lifted, with its own cast shadow, exactly
 *     like the solar farm rows.
 *
 * Architecture unchanged: layer-shift parallax (kit default), ONE shift factor
 * per layer so the two modules never drift apart (A10), shadows pinned to the
 * ground outside the moving layer (A9). Hitboxes come straight from the verified
 * layout; visuals are inset so the tank stops AT the hull (B2).
 *
 * Colour discipline: white hull, cyan ONLY as window/tech detail (F1).
 */

const A = MARS_BASE_LAYOUT.domeA;
const T = MARS_BASE_LAYOUT.tunnel;
const B = MARS_BASE_LAYOUT.domeB;

const UNION_X = Math.min(A.x, T.x, B.x);
const UNION_Y = Math.min(A.y, T.y, B.y);
const UNION_R = Math.max(A.x + A.w, T.x + T.w, B.x + B.w);
const UNION_B = Math.max(A.y + A.h, T.y + T.h, B.y + B.h);
const CENTER_X = (UNION_X + UNION_R) / 2;
const CENTER_Y = (UNION_Y + UNION_B) / 2;

/** Tank-body compensation inset per side (B2). */
const VISUAL_INSET = 50;
/** Passage lift — same "carport" language as the solar rows. */
const PASSAGE_H = 17;

interface Module {
    lx: number; ly: number;     // local centre
    w: number; h: number;       // drawn size
    label: string;
}

const MOD_A: Module = {
    lx: A.x + A.w / 2 - CENTER_X,
    ly: A.y + A.h / 2 - CENTER_Y,
    w: A.w - VISUAL_INSET * 2,
    h: A.h - VISUAL_INSET * 2,
    label: 'M-01',
};
const MOD_B: Module = {
    lx: B.x + B.w / 2 - CENTER_X,
    ly: B.y + B.h / 2 - CENTER_Y,
    w: B.w - VISUAL_INSET * 2,
    h: B.h - VISUAL_INSET * 2,
    label: 'M-02',
};
const PASSAGE = {
    ly: T.y + T.h / 2 - CENTER_Y,
    halfH: T.h / 2 - 13,
    x0: MOD_A.lx + MOD_A.w * 0.35,
    x1: MOD_B.lx - MOD_B.w * 0.35,
};

/** Channel-wise blend of two 0xRRGGBB colours. */
function lerpHex(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return (Math.round(ar + (br - ar) * t) << 16)
         | (Math.round(ag + (bg - ag) * t) << 8)
         | Math.round(ab + (bb - ab) * t);
}

export class MarsBase implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private visualX: number;
    private visualY: number;

    private container: PIXI.Container;
    private gfxGround: PIXI.Graphics;   // shadows + apron — NO parallax (A9)
    private gfxWalls: PIXI.Container;   // hull skirts + passage posts (slow shift)
    private gfxTop: PIXI.Container;     // module bodies, roofs, masts (faster shift)
    private gfxBlink: PIXI.Graphics;    // per-frame: beacons, window flicker, dish

    private static readonly WALL_SHIFT = 0.020;
    private static readonly TOP_SHIFT = 0.055;

    constructor(worldContainer: PIXI.Container) {
        this.x = A.x;
        this.y = A.y;
        this.w = A.w;
        this.h = A.h;

        this.visualX = CENTER_X;
        this.visualY = CENTER_Y;

        this.container = new PIXI.Container();
        this.container.x = CENTER_X;
        this.container.y = CENTER_Y;
        this.container.zIndex = UNION_B;
        worldContainer.addChild(this.container);

        // ALL Graphics created here, before any drawX (E1)
        this.gfxGround = new PIXI.Graphics();
        this.gfxWalls = new PIXI.Container();
        this.gfxTop = new PIXI.Container();
        this.gfxBlink = new PIXI.Graphics();

        this.container.addChild(this.gfxGround);
        this.container.addChild(this.gfxWalls);
        this.container.addChild(this.gfxTop);

        const wallDraw = new PIXI.Graphics();
        this.gfxWalls.addChild(wallDraw);
        const topDraw = new PIXI.Graphics();
        this.gfxTop.addChild(topDraw);
        this.gfxTop.addChild(this.gfxBlink);

        this.drawGround();
        this.drawWalls(wallDraw);
        this.drawTop(topDraw);
    }

    /**
     * Only MODULE B is an extra solid — the passage is now driveable (M5d), so it
     * is deliberately NOT in the collision list.
     */
    public getExtraCollidables(): ICollidable[] {
        return [{ x: B.x, y: B.y, w: B.w, h: B.h, update: () => {} }];
    }

    /** Cast shadows + swept apron. Double shadow on big masses (token T2). */
    private drawGround(): void {
        const g = this.gfxGround;
        for (const m of [MOD_A, MOD_B]) {
            g.beginFill(MARS_HEX.duneLight, 0.10);       // swept apron
            g.drawRoundedRect(m.lx - m.w * 0.62, m.ly - m.h * 0.58, m.w * 1.24, m.h * 1.3, 26);
            g.endFill();
            g.beginFill(MARS_HEX.depth, 0.15);           // wide soft
            g.drawRoundedRect(m.lx - m.w / 2 + 16, m.ly - m.h / 2 + 14, m.w + 8, m.h + 10, 22);
            g.endFill();
            g.beginFill(MARS_HEX.depth, 0.30);           // tight contact
            g.drawRoundedRect(m.lx - m.w / 2 + 7, m.ly - m.h / 2 + 7, m.w, m.h, 20);
            g.endFill();
        }
        // passage cast shadow — offset like the solar carports
        g.beginFill(MARS_HEX.depth, 0.28);
        g.drawRoundedRect(PASSAGE.x0 + PASSAGE_H * 0.55, PASSAGE.ly - PASSAGE.halfH + PASSAGE_H * 1.15,
                          PASSAGE.x1 - PASSAGE.x0, PASSAGE.halfH * 1.7, 8);
        g.endFill();
    }

    /** Skirts under each module + the passage support posts. */
    private drawWalls(g: PIXI.Graphics): void {
        for (const m of [MOD_A, MOD_B]) {
            g.beginFill(MARS_HEX.baseSteel, 0.95);
            g.drawRoundedRect(m.lx - m.w / 2 - 4, m.ly - m.h / 2 + 6, m.w + 8, m.h, 22);
            g.endFill();
        }
        // passage posts: foot on the ground, rising to the deck (carport read)
        for (let px = PASSAGE.x0 + 20; px < PASSAGE.x1 - 10; px += 56) {
            g.beginFill(0x3e352f, 0.5);
            g.drawEllipse(px + 3, PASSAGE.ly + PASSAGE.halfH + 8, 7, 3);
            g.endFill();
            g.beginFill(0x51463e, 1);
            g.drawRect(px + 3, PASSAGE.ly - 2, 6, PASSAGE.halfH + 10);
            g.endFill();
            g.beginFill(0x8a7d70, 1);
            g.drawRect(px, PASSAGE.ly - 2, 4, PASSAGE.halfH + 10);
            g.endFill();
        }
    }

    private drawTop(g: PIXI.Graphics): void {
        this.drawPassage(g);
        this.drawModule(g, MOD_A, true);
        this.drawModule(g, MOD_B, false);
    }

    /** Raised corrugated passage — drawn above the tank so you drive under it. */
    private drawPassage(g: PIXI.Graphics): void {
        const y0 = PASSAGE.ly - PASSAGE.halfH - PASSAGE_H;
        const hh = PASSAGE.halfH * 2;
        const wdt = PASSAGE.x1 - PASSAGE.x0;

        g.beginFill(MARS_HEX.baseShade);
        g.drawRoundedRect(PASSAGE.x0, y0, wdt, hh, 9);
        g.endFill();
        g.beginFill(MARS_HEX.baseWhite, 0.92);
        g.drawRoundedRect(PASSAGE.x0 + 3, y0 + 3, wdt - 6, hh * 0.44, 7);
        g.endFill();
        g.lineStyle(1.5, MARS_HEX.baseSteel, 0.5);
        for (let rx = PASSAGE.x0 + 14; rx < PASSAGE.x1 - 6; rx += 15) {
            g.moveTo(rx, y0 + 2);
            g.lineTo(rx, y0 + hh - 2);
        }
        g.lineStyle(0);
        // hazard chevrons on the passage roof — reads as "structure", not a pipe
        g.beginFill(0xe8a33d, 0.30);
        for (let cx = PASSAGE.x0 + 22; cx < PASSAGE.x1 - 22; cx += 44) {
            g.drawPolygon([cx, y0 + hh - 5, cx + 9, y0 + 4, cx + 14, y0 + 4, cx + 5, y0 + hh - 5]);
        }
        g.endFill();
    }

    /**
     * Habitat module: rounded-corner box with a layered 2.5D hull, a roof solar
     * array, antenna farm, hazard striping, module number and window row.
     */
    private drawModule(g: PIXI.Graphics, m: Module, withAirlock: boolean): void {
        const hw = m.w / 2, hh = m.h / 2;
        const R = 22;

        // ── hull: stacked insets stepping shade -> white = a boxy 2.5D volume
        const STEPS = 5;
        for (let i = 0; i < STEPS; i++) {
            const t = i / (STEPS - 1);
            const k = 1 - t * 0.10;
            const drift = t * 5;
            g.beginFill(lerpHex(MARS_HEX.baseShade, MARS_HEX.baseWhite, t * t));
            g.drawRoundedRect(m.lx - hw * k - drift, m.ly - hh * k - drift,
                              m.w * k, m.h * k, R * k);
            g.endFill();
        }
        // panel seams
        g.lineStyle(1.6, MARS_HEX.baseSteel, 0.4);
        g.moveTo(m.lx - hw + 8, m.ly - hh * 0.15); g.lineTo(m.lx + hw - 8, m.ly - hh * 0.15);
        g.moveTo(m.lx - hw * 0.2, m.ly - hh + 10); g.lineTo(m.lx - hw * 0.2, m.ly + hh - 10);
        g.lineStyle(0);

        // ── ROOF SOLAR ARRAY (the base powers itself too) ──
        const ax = m.lx - hw * 0.62, ay = m.ly - hh * 0.66;
        const aw = m.w * 0.58, ah = m.h * 0.40;
        g.beginFill(MARS_HEX.depth, 0.22);
        g.drawRoundedRect(ax + 4, ay + 5, aw, ah, 4);
        g.endFill();
        g.beginFill(0x2b2f52, 1);
        g.drawRoundedRect(ax, ay, aw, ah, 4);
        g.endFill();
        g.lineStyle(1, 0x4a5080, 0.6);
        for (let cx = ax + 12; cx < ax + aw - 4; cx += 12) { g.moveTo(cx, ay + 2); g.lineTo(cx, ay + ah - 2); }
        g.moveTo(ax + 2, ay + ah / 2); g.lineTo(ax + aw - 2, ay + ah / 2);
        g.lineStyle(0);
        g.beginFill(0xffe8c8, 0.16);                 // sun glare band
        g.drawRoundedRect(ax + aw * 0.15, ay + 2, aw * 0.3, ah - 4, 3);
        g.endFill();
        g.lineStyle(2, 0x9aa6b2, 0.85);
        g.drawRoundedRect(ax, ay, aw, ah, 4);
        g.lineStyle(0);

        // ── ANTENNA FARM: masts of different heights + a dish ──
        const mx = m.lx + hw * 0.42;
        for (let i = 0; i < 3; i++) {
            const px = mx + i * 13;
            const ht = 26 + i * 11;
            g.lineStyle(2.2, MARS_HEX.baseSteel, 1);
            g.moveTo(px, m.ly - hh * 0.2);
            g.lineTo(px, m.ly - hh * 0.2 - ht);
            g.lineStyle(1.2, MARS_HEX.baseSteel, 0.7);       // guy wires
            g.moveTo(px, m.ly - hh * 0.2 - ht * 0.7);
            g.lineTo(px - 8, m.ly - hh * 0.2);
            g.lineStyle(0);
            g.beginFill(MARS_HEX.baseSteel, 0.9);
            g.drawCircle(px, m.ly - hh * 0.2 - ht, 2.2);
            g.endFill();
        }
        // dish on a short pylon
        const dx = m.lx + hw * 0.16, dy = m.ly + hh * 0.30;
        g.lineStyle(2.6, MARS_HEX.baseSteel, 1);
        g.moveTo(dx, dy + 10); g.lineTo(dx + 4, dy - 8);
        g.lineStyle(0);
        g.beginFill(MARS_HEX.baseWhite, 0.95);
        g.drawEllipse(dx + 6, dy - 12, 13, 8);
        g.endFill();
        g.beginFill(MARS_HEX.baseShade, 0.9);
        g.drawEllipse(dx + 7, dy - 11, 8, 5);
        g.endFill();

        // ── WINDOW ROW (cyan detail only — F1) ──
        for (let i = 0; i < 4; i++) {
            const wx = m.lx - hw * 0.52 + i * (m.w * 0.17);
            g.beginFill(MARS_HEX.baseSteel, 0.8);
            g.drawRoundedRect(wx - 1, m.ly + hh * 0.06 - 1, 16, 11, 3);
            g.endFill();
            g.beginFill(MARS_HEX.baseCyan, 0.42);
            g.drawRoundedRect(wx, m.ly + hh * 0.06, 14, 9, 2);
            g.endFill();
        }

        // ── MARKINGS: hazard stripe + module number plate ──
        g.beginFill(0xe8a33d, 0.35);
        for (let i = 0; i < 6; i++) {
            const sx = m.lx - hw + 14 + i * 13;
            g.drawPolygon([sx, m.ly + hh - 8, sx + 7, m.ly + hh - 17, sx + 11, m.ly + hh - 17, sx + 4, m.ly + hh - 8]);
        }
        g.endFill();
        g.beginFill(0x3a4048, 0.9);
        g.drawRoundedRect(m.lx + hw * 0.18, m.ly - hh + 8, 40, 15, 3);
        g.endFill();
        g.beginFill(MARS_HEX.baseWhite, 0.85);       // stencil bars = "M-01"
        for (let i = 0; i < 4; i++) g.drawRect(m.lx + hw * 0.18 + 6 + i * 8, m.ly - hh + 13, 4, 6);
        g.endFill();

        // ── AIRLOCK on the south face ──
        if (withAirlock) {
            const hx = m.lx - hw * 0.05, hy = m.ly + hh - 4;
            g.beginFill(MARS_HEX.baseSteel);
            g.drawRoundedRect(hx - 19, hy - 13, 38, 22, 5);
            g.endFill();
            g.beginFill(MARS_HEX.depth, 0.55);
            g.drawRoundedRect(hx - 14, hy - 9, 28, 15, 4);
            g.endFill();
            g.beginFill(MARS_HEX.baseCyan, 0.55);
            g.drawCircle(hx + 13, hy - 2, 2.4);
            g.endFill();
        }

        // corner bolts — the box reads as bolted panels
        g.beginFill(0x5c666f, 0.85);
        for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
            g.drawCircle(m.lx + bx * (hw - 13), m.ly + by * (hh - 13), 3);
        }
        g.endFill();
    }

    /**
     * Per-frame: layer shift + everything that blinks. Kept to ONE small redraw —
     * roof beacons, mast strobes, dish sweep and a flickering window.
     */
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        const dx = this.visualX - (camX + screenW / 2);
        const dy = this.visualY - (camY + screenH / 2);

        this.gfxWalls.x = -dx * MarsBase.WALL_SHIFT;
        this.gfxWalls.y = -dy * MarsBase.WALL_SHIFT;
        this.gfxTop.x = -dx * MarsBase.TOP_SHIFT;
        this.gfxTop.y = -dy * MarsBase.TOP_SHIFT;

        const now = Date.now();
        const g = this.gfxBlink;
        g.clear();

        for (const m of [MOD_A, MOD_B]) {
            const hw = m.w / 2, hh = m.h / 2;

            // roof corner beacons — alternating chase
            for (let i = 0; i < 4; i++) {
                const bx = m.lx + (i % 2 ? 1 : -1) * (hw - 13);
                const by = m.ly + (i < 2 ? -1 : 1) * (hh - 13);
                const on = Math.sin(now / 380 + i * 1.6) > 0.35;
                g.beginFill(0xff9a3d, (on ? 0.85 : 0.18));
                g.drawCircle(bx, by, 2.6);
                g.endFill();
                if (on) {
                    g.beginFill(0xff9a3d, 0.20);
                    g.drawCircle(bx, by, 7);
                    g.endFill();
                }
            }

            // mast strobes
            const mx = m.lx + hw * 0.42;
            for (let i = 0; i < 3; i++) {
                const px = mx + i * 13;
                const ht = 26 + i * 11;
                const on = Math.sin(now / 210 + i * 2.1) > 0.72;
                g.beginFill(0xff5e6a, on ? 0.95 : 0.25);
                g.drawCircle(px, m.ly - hh * 0.2 - ht, on ? 3 : 2);
                g.endFill();
                if (on) {
                    g.beginFill(0xff5e6a, 0.22);
                    g.drawCircle(px, m.ly - hh * 0.2 - ht, 8);
                    g.endFill();
                }
            }

            // one window flickers — the station is not entirely dead
            const flick = (Math.sin(now / 90 + m.lx) > 0.6) ? 0.75 : 0.30;
            const wx = m.lx - hw * 0.52 + (m.lx > 0 ? 2 : 1) * (m.w * 0.17);
            g.beginFill(MARS_HEX.baseCyan, flick);
            g.drawRoundedRect(wx, m.ly + hh * 0.06, 14, 9, 2);
            g.endFill();

            // dish sweep highlight
            const dxp = m.lx + hw * 0.16 + 6, dyp = m.ly + hh * 0.30 - 12;
            const sweep = 0.3 + 0.3 * Math.sin(now / 900 + m.lx * 0.01);
            g.beginFill(MARS_HEX.baseCyan, sweep * 0.35);
            g.drawEllipse(dxp, dyp, 6, 3.5);
            g.endFill();
        }
    }
}
