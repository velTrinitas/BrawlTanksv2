import * as PIXI from 'pixi.js';
import { MARS_HEX } from '../MarsMap';

/**
 * HydroGarden — pressurised greenhouse the crew left running (grammar layer 6).
 * The map's STEALTH zone: drive inside and enemies lose you.
 *
 * M4b (playtest: "zielone poletka na marsie wygladaja dziwnie podejrzanie — moze
 * by je jakos obudowac przezroczysta marsjanska szklarnia"): bare crops on the
 * open surface were physically wrong — nothing grows in that atmosphere — and
 * the eye reads the wrongness even when it cannot name it. The plot is now
 * enclosed: a steel frame, glazing panels with sky glint, an entry gap on the
 * south side, and internal ribs. The glass is drawn ABOVE the tank (a thin,
 * high-alpha layer) so you visibly disappear UNDER the roof — cover you can see
 * yourself using, instead of a floor decal you have to trust.
 *
 * FAZA MARS M4. Why plants and not "dome shadow": a dark tonal patch as a
 * hiding place is exactly the mistake lesson F4 records (horses "behind fog",
 * fake shadow under buildings) — dark ground reads as a rendering artefact, not
 * as cover. Tall vegetation is the language the game already uses for stealth
 * (corn, sugarcane, bushes), and on a dead world the ONLY green on the map is
 * an unmistakable signal (F2: one symbol, one mechanic).
 *
 * Render pattern borrowed from RuinsBush: the plot is horizontal ROWS, each row
 * an independent sprite whose zIndex is its own world-Y — so the tank sorts
 * BETWEEN rows (rows in front hide it, rows behind sit back). Rows are baked to
 * a texture once (module-level cache) because live vectors shimmer on mobile
 * with antialias off (lesson C1/F4.1d).
 */

const ROW_H = 26;          // vertical spacing between planting rows
const BAKE_RES = 2;        // supersample for crisp edges at zoom 0.6

/** One baked row texture, reused by every row of every plot. */
let _rowTex: PIXI.Texture | null = null;
let _trayTex: PIXI.Texture | null = null;

/** Baked row of plants: dark green mass + lit tips + a few pale alien blooms. */
function getRowTexture(): PIXI.Texture {
    if (_rowTex) return _rowTex;
    const W = 120, H = 40;
    const cv = document.createElement('canvas');
    cv.width = W * BAKE_RES;
    cv.height = H * BAKE_RES;
    const c = cv.getContext('2d')!;
    c.scale(BAKE_RES, BAKE_RES);

    let s = 0x9a71;
    const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    for (let i = 0; i < 46; i++) {
        const x = 3 + rng() * (W - 6);
        const baseY = H - 4;
        const hgt = 16 + rng() * 20;
        const lean = (rng() - 0.5) * 7;

        // stalk — muted greens: this is dusty Martian hydroponics, not plastic turf
        c.strokeStyle = '#2a6340';
        c.lineWidth = 1.6 + rng() * 1.3;
        c.globalAlpha = 0.82;
        c.beginPath();
        c.moveTo(x, baseY);
        c.quadraticCurveTo(x + lean * 0.5, baseY - hgt * 0.6, x + lean, baseY - hgt);
        c.stroke();

        // leaf mass
        c.globalAlpha = 0.8;
        c.fillStyle = rng() < 0.5 ? '#3a8256' : '#2d6b47';
        c.beginPath();
        c.ellipse(x + lean, baseY - hgt, 5 + rng() * 4, 3.5 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2);
        c.fill();

        // sunlit tip (NW light)
        c.globalAlpha = 0.5;
        c.fillStyle = '#79c092';
        c.beginPath();
        c.ellipse(x + lean - 1.6, baseY - hgt - 1.6, 2.6, 1.8, 0, 0, Math.PI * 2);
        c.fill();

        // rare pale bloom — the "still alive" detail
        if (rng() < 0.12) {
            c.globalAlpha = 0.8;
            c.fillStyle = '#dff5c8';
            c.beginPath();
            c.arc(x + lean, baseY - hgt - 4, 1.8, 0, Math.PI * 2);
            c.fill();
        }
    }
    _rowTex = PIXI.Texture.from(cv);
    return _rowTex;
}

/** Baked grow-tray: steel channel the rows sit in (ground layer). */
function getTrayTexture(): PIXI.Texture {
    if (_trayTex) return _trayTex;
    const W = 120, H = 14;
    const cv = document.createElement('canvas');
    cv.width = W * BAKE_RES;
    cv.height = H * BAKE_RES;
    const c = cv.getContext('2d')!;
    c.scale(BAKE_RES, BAKE_RES);

    c.fillStyle = '#7d8894';
    c.fillRect(0, 3, W, H - 6);
    c.fillStyle = '#9aa6b2';
    c.fillRect(0, 3, W, 3);           // sunlit NW lip
    c.fillStyle = '#3f2a2e';
    c.fillRect(0, H - 4, W, 3);       // shaded SE lip
    c.globalAlpha = 0.35;
    c.fillStyle = '#37d0e6';          // nutrient water glint (cyan DETAIL only, F1)
    for (let x = 6; x < W - 6; x += 17) c.fillRect(x, 6, 7, 1.6);
    _trayTex = PIXI.Texture.from(cv);
    return _trayTex;
}

interface Row {
    spr: PIXI.TilingSprite;
    phase: number;
    amp: number;
}

export class HydroGarden {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private rows: Row[] = [];
    private gfxGlass: PIXI.Graphics;   // roof glazing, drawn OVER the tank
    private gfxFloor: PIXI.Graphics;   // slab + frame footing, under everything

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        // ALL Graphics up front (E1)
        this.gfxFloor = new PIXI.Graphics();
        this.gfxGlass = new PIXI.Graphics();

        this.gfxFloor.zIndex = y - 12;          // slab sits under the tank
        worldContainer.addChild(this.gfxFloor);
        this.drawFloor();

        const rowTex = getRowTexture();
        const trayTex = getTrayTexture();
        const rowCount = Math.max(2, Math.floor(h / ROW_H));

        // TilingSprite, not a stretched Sprite: stretching one 120 px row across
        // a 260 px plot smears the plants into a barcode. Tiling keeps them at
        // true scale, and a per-row tilePosition offset breaks the repetition so
        // the rows do not look stamped.
        let s = (x * 2654435761) >>> 0;
        const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

        for (let i = 0; i < rowCount; i++) {
            const rowY = y + 10 + i * ROW_H;

            // tray first (ground), then plants sorted at their own world-Y
            const tray = new PIXI.TilingSprite(trayTex, w, 14);
            tray.tilePosition.x = -rng() * 120;
            tray.x = x;
            tray.y = rowY;
            tray.zIndex = rowY - 6;      // under the tank
            worldContainer.addChild(tray);

            const spr = new PIXI.TilingSprite(rowTex, w, 40);
            spr.tilePosition.x = -rng() * 120;
            spr.x = x;
            spr.y = rowY - 30;
            // Y-sort against the tank: rows in front of it occlude it (this is
            // what makes the zone read as cover rather than as a floor decal).
            spr.zIndex = rowY + 8;
            worldContainer.addChild(spr);

            this.rows.push({ spr, phase: x * 0.011 + i * 0.7, amp: 0.014 + (i % 3) * 0.004 });
        }

        // glazing goes on LAST and highest: the tank drives under the roof.
        this.gfxGlass.zIndex = y + h + 60;
        worldContainer.addChild(this.gfxGlass);
        this.drawGlass();
    }

    /** Concrete slab + frame footing the greenhouse stands on. */
    private drawFloor(): void {
        const g = this.gfxFloor;
        const { x, y, w, h } = this;
        g.beginFill(MARS_HEX.depth, 0.22);
        g.drawRoundedRect(x + 6, y + 8, w, h, 10);
        g.endFill();
        g.beginFill(0x9a8a80, 0.85);
        g.drawRoundedRect(x - 8, y - 8, w + 16, h + 16, 10);
        g.endFill();
        g.beginFill(0x7d6f66, 0.9);
        g.drawRoundedRect(x - 4, y - 4, w + 8, h + 8, 8);
        g.endFill();
    }

    /**
     * Glazing: frame posts, translucent panels with a sky glint, ridge beam and
     * a south entry gap. Alpha is deliberately low so the plants stay readable
     * through the roof — you must still SEE that this is cover.
     */
    private drawGlass(): void {
        const g = this.gfxGlass;
        const { x, y, w, h } = this;
        const GAP_W = 74;                       // south entry, centred
        const gapX0 = x + w / 2 - GAP_W / 2;
        const gapX1 = x + w / 2 + GAP_W / 2;

        // translucent roof
        g.beginFill(0xbfe4f2, 0.16);
        g.drawRoundedRect(x - 6, y - 6, w + 12, h + 12, 10);
        g.endFill();
        // panel glints — diagonal bands catching the low sun
        g.beginFill(0xffffff, 0.10);
        for (let bx = x - 6; bx < x + w + 12; bx += 46) {
            g.drawPolygon([bx, y + h + 6, bx + 20, y + h + 6, bx + 46, y - 6, bx + 26, y - 6]);
        }
        g.endFill();

        // frame: ridge + posts
        g.lineStyle(3, 0xcfd8de, 0.9);
        g.drawRoundedRect(x - 6, y - 6, w + 12, h + 12, 10);
        g.lineStyle(2, 0xcfd8de, 0.6);
        g.moveTo(x - 6, y + h / 2); g.lineTo(x + w + 6, y + h / 2);   // ridge beam
        for (let px = x + 40; px < x + w; px += 60) {
            g.moveTo(px, y - 6); g.lineTo(px, y + h + 6);              // rafters
        }
        g.lineStyle(0);

        // south entry: cut the frame and mark the threshold (this is the way in)
        g.beginFill(0x000000, 0);
        g.drawRect(gapX0, y + h - 4, GAP_W, 14);
        g.endFill();
        g.lineStyle(3, MARS_HEX.baseCyan, 0.55);
        g.moveTo(gapX0, y + h + 6); g.lineTo(gapX0, y + h - 12);
        g.moveTo(gapX1, y + h + 6); g.lineTo(gapX1, y + h - 12);
        g.lineStyle(0);
        // airlock chevrons on the threshold — "drive in here"
        g.beginFill(MARS_HEX.baseCyan, 0.30);
        for (let i = 0; i < 3; i++) {
            const cx = gapX0 + 12 + i * 20;
            g.drawPolygon([cx, y + h + 4, cx + 8, y + h - 3, cx + 12, y + h - 3, cx + 4, y + h + 4]);
        }
        g.endFill();

        // corner posts, drawn solid so the box reads as a structure
        g.beginFill(0xa8b3bf, 0.95);
        for (const [px, py] of [[x - 8, y - 8], [x + w - 2, y - 8], [x - 8, y + h - 2], [x + w - 2, y + h - 2]]) {
            g.drawRoundedRect(px, py, 10, 10, 2);
        }
        g.endFill();
    }

    /** Rect point test — matches the planted footprint (B5). */
    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w
            && py >= this.y && py <= this.y + this.h;
    }

    /** Cheap sway: skew per row, zero redraw (RuinsBush trick). */
    public update(): void {
        const t = Date.now();
        for (const r of this.rows) {
            r.spr.skew.x = Math.sin(t / 1100 + r.phase) * r.amp;
        }
    }
}
