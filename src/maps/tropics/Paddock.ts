import * as PIXI from 'pixi.js';

/**
 * v0.40.0 FAZA T9.0 — PADDOCK (wybieg/zagroda dla koni)
 *
 * Drewniany wybieg z 4 słupami narożnymi + 3 horizontal rails między słupami +
 * gate opening na north side (connecting do stable). Wewnątrz: water trough,
 * hay bale, mud spots, tartan ground.
 *
 * Layout: 320×220 area z 4 corner posts, fence along all sides oprócz gate.
 *
 * Collision: 4 thin rects dla rails (player nie wjedzie z zewnątrz oprócz gate).
 * Konie (T9.1) NIE blokowane przez fence collision — używają state machine.
 */

const COLORS = {
    shadow:          0x000000,

    // Ground inside paddock
    groundGrass:     0x4a7028,    // base zielona trawa
    groundGrassDk:   0x2a4810,
    groundGrassLt:   0x6a9038,
    groundMud:       0x4a3018,
    groundMudDark:   0x2a1808,
    groundMudLight:  0x6a4828,

    // Fence wood (drewniane słupy + rails)
    postDark:        0x3a2010,
    postMid:         0x5a3018,
    postLight:       0x7a4828,
    postHighlight:   0x9a6038,
    postTopDark:     0x2a1808,    // dark top end

    railDark:        0x4a2810,
    railMid:         0x6a3818,
    railLight:       0x8a4828,
    railHighlight:   0xa86038,

    nailMetal:       0x2a2a2a,
    nailHighlight:   0x5a5a5a,

    // Water trough
    troughWood:      0x6a3818,
    troughWoodDark:  0x3a1808,
    troughWoodLight: 0x8a5028,
    troughWater:     0x3070a0,
    troughWaterDk:   0x1850a0,
    troughWaterLt:   0x80b8d8,
    troughSparkle:   0xffffff,

    // Hay bale
    bayBaseDark:     0x9a7820,
    bayBase:         0xc89838,
    bayHighlight:    0xf0c858,
    bayStrand:       0xffe080,
    bayRope:         0x4a2818,

    // Gate
    gateWood:        0x7a4828,
    gateMetal:       0x3a3a3a,
} as const;

interface PostDef {
    lx: number;        // local x (relative to paddock x)
    ly: number;        // local y
}

interface RailDef {
    x1: number; y1: number;
    x2: number; y2: number;
}

interface SparkleParticle {
    gfx: PIXI.Graphics;
    phase: number;
}

export class Paddock {
    public x: number;
    public y: number;
    public w: number = 320;
    public h: number = 220;
    public container: PIXI.Container;

    private time: number = 0;
    private waterGfx: PIXI.Graphics;
    private sparkles: SparkleParticle[] = [];

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + this.h - 80;  // slightly below stable (Y-sort)
        worldContainer.addChild(this.container);

        // Draw order: ground first, then objects inside, then fence on top
        this.drawGround();
        this.drawMudSpots();
        this.drawWaterTrough();
        this.drawHayBale();
        this.drawFencePosts();
        this.drawFenceRails();
        this.drawGate();
    }

    // ═══════════════════════════════════════════════════════════
    // GROUND (mud + grass blend inside paddock)
    // ═══════════════════════════════════════════════════════════
    private drawGround(): void {
        const g = new PIXI.Graphics();

        // Base — darker mud-ish trodden ground (konie zniszczyły grass)
        g.beginFill(COLORS.groundMud, 0.55);
        g.drawRect(0, 0, this.w, this.h);
        g.endFill();

        // Patches of grass (jaśniejsze plamy)
        const grassPatches = [
            { x: 0.15, y: 0.18, r: 0.15 },
            { x: 0.78, y: 0.22, r: 0.12 },
            { x: 0.55, y: 0.78, r: 0.16 },
            { x: 0.12, y: 0.82, r: 0.10 },
            { x: 0.88, y: 0.65, r: 0.11 },
        ];
        for (const p of grassPatches) {
            const cx = p.x * this.w;
            const cy = p.y * this.h;
            const cr = p.r * Math.min(this.w, this.h);
            // Outer soft (dark grass)
            g.beginFill(COLORS.groundGrassDk, 0.35);
            g.drawEllipse(cx, cy, cr, cr * 0.65);
            g.endFill();
            // Mid grass
            g.beginFill(COLORS.groundGrass, 0.45);
            g.drawEllipse(cx, cy, cr * 0.75, cr * 0.5);
            g.endFill();
            // Bright spot
            g.beginFill(COLORS.groundGrassLt, 0.3);
            g.drawEllipse(cx - cr * 0.15, cy - cr * 0.1, cr * 0.35, cr * 0.25);
            g.endFill();
        }

        // Grass blade hints (drobne pionowe creski)
        g.lineStyle(1.0, COLORS.groundGrassLt, 0.55);
        for (let i = 0; i < 30; i++) {
            const seedX = ((i * 7919) % 100) / 100;
            const seedY = ((i * 3571) % 100) / 100;
            const seedL = ((i * 2999) % 100) / 100;
            const gx = seedX * (this.w - 20) + 10;
            const gy = seedY * (this.h - 20) + 10;
            const gl = 2 + seedL * 3;
            g.moveTo(gx, gy);
            g.lineTo(gx + ((seedX * 23) % 7) / 7 - 0.5, gy - gl);
        }
        g.lineStyle(0);

        // v0.41.9: REMOVED dirt path central ellipse — Mariusz feedback "usuń ciemnozielone kółko"
        // (Wcześniej tworzylo ciemny zarys koła w środku gdzie konie wyglądały "za mgłą")

        // Hoof prints (drobne ciemne owale) — deterministic
        g.beginFill(COLORS.groundMudDark, 0.7);
        for (let i = 0; i < 18; i++) {
            const seedX = ((i * 7919) % 100) / 100;
            const seedY = ((i * 3571) % 100) / 100;
            const seedR = ((i * 2999) % 100) / 100;
            const hx = 25 + seedX * (this.w - 50);
            const hy = 25 + seedY * (this.h - 50);
            g.drawEllipse(hx, hy, 2.5 + seedR * 0.8, 1.8 + seedR * 0.6);
        }
        g.endFill();

        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // MUD SPOTS (3-5 ciemnych mokrych plam)
    // ═══════════════════════════════════════════════════════════
    private drawMudSpots(): void {
        const g = new PIXI.Graphics();

        const spots = [
            { x: 0.25, y: 0.55, r: 0.08 },
            { x: 0.70, y: 0.45, r: 0.06 },
            { x: 0.45, y: 0.30, r: 0.05 },
        ];

        for (const s of spots) {
            const cx = s.x * this.w;
            const cy = s.y * this.h;
            const cr = s.r * Math.min(this.w, this.h);

            // Outer mud (darker)
            g.beginFill(COLORS.groundMudDark, 0.7);
            g.drawEllipse(cx, cy, cr, cr * 0.6);
            g.endFill();
            // Mid mud
            g.beginFill(COLORS.groundMud, 0.85);
            g.drawEllipse(cx, cy, cr * 0.75, cr * 0.45);
            g.endFill();
            // Wet highlight (reflective sheen)
            g.beginFill(COLORS.groundMudLight, 0.55);
            g.drawEllipse(cx - cr * 0.2, cy - cr * 0.1, cr * 0.3, cr * 0.15);
            g.endFill();
        }

        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // WATER TROUGH (drewniany żłob z błękitną wodą)
    // ═══════════════════════════════════════════════════════════
    private drawWaterTrough(): void {
        const g = new PIXI.Graphics();
        const tx = this.w - 70;
        const ty = this.h - 70;
        const tw = 50;
        const th = 22;

        // Shadow
        g.beginFill(COLORS.shadow, 0.4);
        g.drawRoundedRect(tx + 2, ty + th, tw, 4, 3);
        g.endFill();

        // Wood frame (outer)
        g.beginFill(COLORS.troughWoodDark, 1.0);
        g.drawRoundedRect(tx, ty, tw, th, 3);
        g.endFill();

        // Wood frame (main wood color)
        g.beginFill(COLORS.troughWood, 1.0);
        g.drawRoundedRect(tx + 1.5, ty + 1.5, tw - 3, th - 3, 2);
        g.endFill();

        // Wood highlight strip (top edge sunlit)
        g.beginFill(COLORS.troughWoodLight, 0.65);
        g.drawRect(tx + 3, ty + 2, tw - 6, 2);
        g.endFill();

        // Wood grain (poziome linie)
        g.lineStyle(0.6, COLORS.troughWoodDark, 0.7);
        for (let i = 1; i < 4; i++) {
            const wy = ty + 2 + i * 4;
            g.moveTo(tx + 3, wy);
            g.lineTo(tx + tw - 3, wy);
        }
        g.lineStyle(0);

        // Inner water rect
        const wx = tx + 3;
        const wy = ty + 5;
        const ww = tw - 6;
        const wh = th - 8;

        // Water dark base
        g.beginFill(COLORS.troughWaterDk, 1.0);
        g.drawRoundedRect(wx, wy, ww, wh, 1.5);
        g.endFill();
        // Water main
        g.beginFill(COLORS.troughWater, 1.0);
        g.drawRoundedRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1, 1);
        g.endFill();
        // Water highlights
        g.beginFill(COLORS.troughWaterLt, 0.6);
        g.drawRoundedRect(wx + 1, wy + 1, ww * 0.4, 2.5, 1);
        g.endFill();

        // Water sparkles (tiny white dots — animated will be in update)
        this.waterGfx = new PIXI.Graphics();
        this.container.addChild(g);
        this.container.addChild(this.waterGfx);

        // Pre-spawn 4 sparkle positions (animated alpha later)
        for (let i = 0; i < 4; i++) {
            const seedX = ((i * 7919) % 100) / 100;
            const seedY = ((i * 3571) % 100) / 100;
            const sx = wx + 3 + seedX * (ww - 6);
            const sy = wy + 1 + seedY * (wh - 2);
            const sg = new PIXI.Graphics();
            sg.beginFill(COLORS.troughSparkle, 1.0);
            sg.drawCircle(0, 0, 0.7);
            sg.endFill();
            sg.x = sx;
            sg.y = sy;
            this.waterGfx.addChild(sg);
            this.sparkles.push({
                gfx: sg,
                phase: (i / 4) * Math.PI * 2,
            });
        }

        // Trough legs (4 short legs visible at corners)
        const gLegs = new PIXI.Graphics();
        gLegs.beginFill(COLORS.troughWoodDark, 1.0);
        gLegs.drawRect(tx + 3, ty + th - 2, 3, 5);
        gLegs.drawRect(tx + tw - 6, ty + th - 2, 3, 5);
        gLegs.endFill();
        this.container.addChild(gLegs);
    }

    // ═══════════════════════════════════════════════════════════
    // HAY BALE (kostka siana w rogu paddock)
    // ═══════════════════════════════════════════════════════════
    private drawHayBale(): void {
        const g = new PIXI.Graphics();
        const bx = 30;
        const by = this.h - 50;
        const bw = 50;
        const bh = 36;

        // Shadow
        g.beginFill(COLORS.shadow, 0.4);
        g.drawRoundedRect(bx + 2, by + bh, bw - 4, 5, 3);
        g.endFill();

        // Bale main body (rounded rectangle)
        g.beginFill(COLORS.bayBaseDark, 1.0);
        g.drawRoundedRect(bx, by, bw, bh, 4);
        g.endFill();
        g.beginFill(COLORS.bayBase, 1.0);
        g.drawRoundedRect(bx + 1.5, by + 1.5, bw - 3, bh - 3, 3);
        g.endFill();
        // Top highlight
        g.beginFill(COLORS.bayHighlight, 0.55);
        g.drawRoundedRect(bx + 3, by + 2, bw - 6, 4, 2);
        g.endFill();

        // Hay strands texture (poziome creski w hay)
        g.lineStyle(0.6, COLORS.bayBaseDark, 0.7);
        for (let i = 0; i < 8; i++) {
            const seedY = ((i * 7919) % 100) / 100;
            const seedL = ((i * 3571) % 100) / 100;
            const sy = by + 3 + seedY * (bh - 8);
            const sl = bw - 6 - seedL * 4;
            g.moveTo(bx + 3, sy);
            g.lineTo(bx + 3 + sl, sy);
        }
        g.lineStyle(0);

        // Pionowe wystające źdźbła (sticking out edges)
        g.lineStyle(0.7, COLORS.bayStrand, 0.85);
        for (let i = 0; i < 12; i++) {
            const seedX = ((i * 7919 + 17) % 100) / 100;
            const seedT = ((i * 3571 + 41) % 100) / 100;
            // Top sticking out
            const sx = bx + 4 + seedX * (bw - 8);
            const sl = 2 + seedT * 3;
            g.moveTo(sx, by + 1);
            g.lineTo(sx + (seedT - 0.5) * 1.5, by - sl);
        }
        g.lineStyle(0);

        // Bale ropes/binding (2 horizontal ropes wrapping bale)
        g.lineStyle(1.4, COLORS.bayRope, 1.0);
        g.moveTo(bx + 1, by + bh / 3);
        g.lineTo(bx + bw - 1, by + bh / 3);
        g.moveTo(bx + 1, by + (bh * 2) / 3);
        g.lineTo(bx + bw - 1, by + (bh * 2) / 3);
        g.lineStyle(0);

        // Rope highlight
        g.lineStyle(0.5, 0x6a3a18, 0.8);
        g.moveTo(bx + 2, by + bh / 3 + 0.5);
        g.lineTo(bx + bw - 2, by + bh / 3 + 0.5);
        g.lineStyle(0);

        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // FENCE POSTS (4 corners + 2 mid pillars on each side)
    // ═══════════════════════════════════════════════════════════
    private drawFencePosts(): void {
        const g = new PIXI.Graphics();
        const POST_W = 8;
        const POST_H = 30;

        // Posts: 4 corners + 2 mid on each long side (10 total)
        const posts: PostDef[] = [
            // Corners
            { lx: 0, ly: 0 },
            { lx: this.w - POST_W, ly: 0 },
            { lx: 0, ly: this.h - POST_H },
            { lx: this.w - POST_W, ly: this.h - POST_H },
            // Top side (avoiding gate area — gate at x 120-200)
            { lx: 60, ly: 0 },
            { lx: 220, ly: 0 },
            // Bottom side
            { lx: 70, ly: this.h - POST_H },
            { lx: 160, ly: this.h - POST_H },
            { lx: 250, ly: this.h - POST_H },
            // Left side
            { lx: 0, ly: 95 },
            // Right side
            { lx: this.w - POST_W, ly: 95 },
        ];

        for (const post of posts) {
            // Shadow below post
            g.beginFill(COLORS.shadow, 0.4);
            g.drawEllipse(post.lx + POST_W / 2, post.ly + POST_H, POST_W * 0.7, 2);
            g.endFill();

            // Post base (dark wood)
            g.beginFill(COLORS.postDark, 1.0);
            g.drawRoundedRect(post.lx, post.ly, POST_W, POST_H, 1);
            g.endFill();

            // Main wood color
            g.beginFill(COLORS.postMid, 1.0);
            g.drawRoundedRect(post.lx + 0.8, post.ly + 0.8, POST_W - 1.6, POST_H - 1.6, 0.8);
            g.endFill();

            // Light strip (sunlit left side)
            g.beginFill(COLORS.postLight, 0.85);
            g.drawRect(post.lx + 1.5, post.ly + 1, 1.5, POST_H - 2);
            g.endFill();

            // Highlight thin strip
            g.beginFill(COLORS.postHighlight, 0.65);
            g.drawRect(post.lx + 2, post.ly + 1, 0.7, POST_H - 2);
            g.endFill();

            // Top end cap (darker — wood grain end)
            g.beginFill(COLORS.postTopDark, 1.0);
            g.drawRoundedRect(post.lx, post.ly, POST_W, 2, 1);
            g.endFill();

            // Wood grain horizontal lines (subtle)
            g.lineStyle(0.5, COLORS.postDark, 0.55);
            for (let i = 1; i < 5; i++) {
                const wy = post.ly + (POST_H / 5) * i + ((i * 7) % 3);
                g.moveTo(post.lx + 1, wy);
                g.lineTo(post.lx + POST_W - 1, wy);
            }
            g.lineStyle(0);
        }

        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // FENCE RAILS (3 horizontal poziome belki na każdym side)
    // ═══════════════════════════════════════════════════════════
    private drawFenceRails(): void {
        const g = new PIXI.Graphics();
        const RAIL_H = 4;
        const POST_W = 8;
        const POST_H = 30;

        // Rail positions (3 rows at heights y=6, y=14, y=22 of post)
        const railOffsets = [6, 14, 22];

        // TOP side (with GAP for gate at x 120-200)
        // Left of gate
        for (const ry of railOffsets) {
            // Left part: from x=POST_W to gate-start
            g.beginFill(COLORS.railDark, 1.0);
            g.drawRect(POST_W, ry - 0.5, 120 - POST_W, RAIL_H + 1);
            g.endFill();
            g.beginFill(COLORS.railMid, 1.0);
            g.drawRect(POST_W, ry, 120 - POST_W, RAIL_H);
            g.endFill();
            g.beginFill(COLORS.railLight, 0.7);
            g.drawRect(POST_W, ry, 120 - POST_W, 1);
            g.endFill();
            g.beginFill(COLORS.railHighlight, 0.35);
            g.drawRect(POST_W, ry, 120 - POST_W, 0.5);
            g.endFill();

            // Right of gate: from x=200 to x=this.w-POST_W
            g.beginFill(COLORS.railDark, 1.0);
            g.drawRect(200, ry - 0.5, this.w - POST_W - 200, RAIL_H + 1);
            g.endFill();
            g.beginFill(COLORS.railMid, 1.0);
            g.drawRect(200, ry, this.w - POST_W - 200, RAIL_H);
            g.endFill();
            g.beginFill(COLORS.railLight, 0.7);
            g.drawRect(200, ry, this.w - POST_W - 200, 1);
            g.endFill();
            g.beginFill(COLORS.railHighlight, 0.35);
            g.drawRect(200, ry, this.w - POST_W - 200, 0.5);
            g.endFill();
        }

        // BOTTOM side (full width, no gate)
        for (const ry of railOffsets) {
            const railY = this.h - POST_H + ry;
            g.beginFill(COLORS.railDark, 1.0);
            g.drawRect(POST_W, railY - 0.5, this.w - POST_W * 2, RAIL_H + 1);
            g.endFill();
            g.beginFill(COLORS.railMid, 1.0);
            g.drawRect(POST_W, railY, this.w - POST_W * 2, RAIL_H);
            g.endFill();
            g.beginFill(COLORS.railLight, 0.7);
            g.drawRect(POST_W, railY, this.w - POST_W * 2, 1);
            g.endFill();
            g.beginFill(COLORS.railHighlight, 0.35);
            g.drawRect(POST_W, railY, this.w - POST_W * 2, 0.5);
            g.endFill();
        }

        // LEFT side (vertical rails)
        for (const ry of railOffsets) {
            // Rotate rail concept — vertical poles z height = paddock height
            const railX = ry - 0.5;
            g.beginFill(COLORS.railDark, 1.0);
            g.drawRect(railX, POST_H, RAIL_H + 1, this.h - POST_H * 2);
            g.endFill();
            g.beginFill(COLORS.railMid, 1.0);
            g.drawRect(railX + 0.5, POST_H, RAIL_H, this.h - POST_H * 2);
            g.endFill();
            g.beginFill(COLORS.railLight, 0.7);
            g.drawRect(railX + 0.5, POST_H, 1, this.h - POST_H * 2);
            g.endFill();
        }

        // RIGHT side (vertical rails)
        for (const ry of railOffsets) {
            const railX = this.w - POST_W + ry - 0.5;
            g.beginFill(COLORS.railDark, 1.0);
            g.drawRect(railX, POST_H, RAIL_H + 1, this.h - POST_H * 2);
            g.endFill();
            g.beginFill(COLORS.railMid, 1.0);
            g.drawRect(railX + 0.5, POST_H, RAIL_H, this.h - POST_H * 2);
            g.endFill();
            g.beginFill(COLORS.railLight, 0.7);
            g.drawRect(railX + 0.5, POST_H, 1, this.h - POST_H * 2);
            g.endFill();
        }

        // Nails on rails (small dark dots at posts)
        g.beginFill(COLORS.nailMetal, 1.0);
        // Top side nails
        for (const ry of railOffsets) {
            // Left of gate posts
            g.drawCircle(POST_W + 2, ry + 2, 0.7);
            g.drawCircle(118, ry + 2, 0.7);
            // Right of gate
            g.drawCircle(202, ry + 2, 0.7);
            g.drawCircle(this.w - POST_W - 2, ry + 2, 0.7);
        }
        // Bottom side nails
        for (const ry of railOffsets) {
            const railY = this.h - POST_H + ry;
            g.drawCircle(POST_W + 2, railY + 2, 0.7);
            g.drawCircle(this.w - POST_W - 2, railY + 2, 0.7);
            g.drawCircle(this.w / 2, railY + 2, 0.7);
        }
        g.endFill();

        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // GATE (north side, between x=120 and x=200, opening dla horses)
    // ═══════════════════════════════════════════════════════════
    private drawGate(): void {
        const g = new PIXI.Graphics();

        // Gate posts (taller niż regular)
        const GATE_POST_W = 10;
        const GATE_POST_H = 36;

        // Left gate post
        g.beginFill(COLORS.postDark, 1.0);
        g.drawRoundedRect(120 - GATE_POST_W, -6, GATE_POST_W, GATE_POST_H, 1);
        g.endFill();
        g.beginFill(COLORS.postMid, 1.0);
        g.drawRoundedRect(121 - GATE_POST_W, -5, GATE_POST_W - 2, GATE_POST_H - 2, 1);
        g.endFill();
        g.beginFill(COLORS.postLight, 0.75);
        g.drawRect(122 - GATE_POST_W, -4, 1.5, GATE_POST_H - 4);
        g.endFill();
        // Top cap
        g.beginFill(COLORS.postTopDark, 1.0);
        g.drawRoundedRect(120 - GATE_POST_W, -6, GATE_POST_W, 3, 2);
        g.endFill();

        // Right gate post
        g.beginFill(COLORS.postDark, 1.0);
        g.drawRoundedRect(200, -6, GATE_POST_W, GATE_POST_H, 1);
        g.endFill();
        g.beginFill(COLORS.postMid, 1.0);
        g.drawRoundedRect(201, -5, GATE_POST_W - 2, GATE_POST_H - 2, 1);
        g.endFill();
        g.beginFill(COLORS.postLight, 0.75);
        g.drawRect(202, -4, 1.5, GATE_POST_H - 4);
        g.endFill();
        // Top cap
        g.beginFill(COLORS.postTopDark, 1.0);
        g.drawRoundedRect(200, -6, GATE_POST_W, 3, 2);
        g.endFill();

        // Top decorative horizontal beam connecting gate posts (arch)
        g.beginFill(COLORS.postDark, 1.0);
        g.drawRoundedRect(120 - GATE_POST_W, -10, GATE_POST_W * 2 + 80, 6, 2);
        g.endFill();
        g.beginFill(COLORS.postMid, 1.0);
        g.drawRoundedRect(121 - GATE_POST_W, -9, GATE_POST_W * 2 + 78, 4, 1.5);
        g.endFill();
        g.beginFill(COLORS.postLight, 0.6);
        g.drawRect(122 - GATE_POST_W, -9, GATE_POST_W * 2 + 76, 1);
        g.endFill();

        // Horseshoe decoration centered on top beam
        const hsX = 160;
        const hsY = -7;
        g.lineStyle(2.2, COLORS.gateMetal, 1.0);
        g.beginFill(COLORS.gateMetal, 0);
        // Horseshoe U-shape
        g.moveTo(hsX - 4, hsY);
        g.bezierCurveTo(hsX - 5, hsY - 4, hsX - 2, hsY - 6, hsX, hsY - 5);
        g.bezierCurveTo(hsX + 2, hsY - 6, hsX + 5, hsY - 4, hsX + 4, hsY);
        g.endFill();
        g.lineStyle(0);
        // Horseshoe highlight
        g.beginFill(0x6a6a6a, 0.8);
        g.drawCircle(hsX - 4, hsY - 0.5, 0.5);
        g.drawCircle(hsX + 4, hsY - 0.5, 0.5);
        g.endFill();

        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — animations (water sparkles)
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;

        // Water sparkles — twinkling alpha
        for (const s of this.sparkles) {
            const tw = Math.sin(this.time * 4 + s.phase);
            s.gfx.alpha = 0.4 + (tw + 1) / 2 * 0.6;
            s.gfx.scale.set(0.8 + (tw + 1) / 2 * 0.6);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // COLLISION — 5 cienkie rects dla fence (no gate gap)
    // ═══════════════════════════════════════════════════════════
    public getCollisionRects(): Array<{ x: number, y: number, w: number, h: number, update: () => void }> {
        const rects: Array<{ x: number, y: number, w: number, h: number, update: () => void }> = [];
        const RAIL_THICK = 6;
        const noop = () => {};

        // Top side — split przy gate (gap 120-200)
        rects.push({ x: this.x, y: this.y, w: 120, h: RAIL_THICK, update: noop });
        rects.push({ x: this.x + 200, y: this.y, w: this.w - 200, h: RAIL_THICK, update: noop });

        // Bottom side
        rects.push({ x: this.x, y: this.y + this.h - RAIL_THICK, w: this.w, h: RAIL_THICK, update: noop });

        // Left side
        rects.push({ x: this.x, y: this.y, w: RAIL_THICK, h: this.h, update: noop });

        // Right side
        rects.push({ x: this.x + this.w - RAIL_THICK, y: this.y, w: RAIL_THICK, h: this.h, update: noop });

        return rects;
    }
}