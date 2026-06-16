import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * v0.40.1 FAZA T9.0 — STABLE (stajnia AAA premium, BARN-STYLE ISO PROJECTION)
 *
 * Rewrite z v0.40.0 flat top-down NA iso projection identyczną z BarnBuilding.ts.
 * Widoczna FRONT wall + SIDE wall (skewed iso depth) + 2-slope gable roof
 * (front trapezoid sunlit + side triangle darker iso tiles).
 *
 * Geometric constants (matching BarnBuilding):
 *   RIGHT_DEPTH = 32 px       — głębokość bocznej ściany w iso
 *   ISO_RISE    = 18 px       — wzniesienie tylnej krawędzi (parallelogram)
 *   ridgeApexX  = cx + w*0.04 — asymetryczny apex w prawą stronę
 *   roofH/wallH = 0.45/0.55   — proporcje dach:ściana
 *
 * Stable różni się od Barn:
 *   - PALETA: brown wood (zamiast czerwonego barn red)
 *   - ROOF: drewniane shingles (zamiast red tile)
 *   - FRONT: stable doors (2 skrzydła z metal hinges + horseshoe symbol)
 *   - HAYLOFT: door na górze z widocznymi snopkami siana
 *   - SIDE WALL: drewniane vertical planks + okno boczne
 *   - DETAILS: weather vane (horse silhouette), latarnia z migoczącym płomieniem,
 *     drewniane wiadro przed wejściem
 *
 * Layout: 320×200 (matching old Stable hitbox)
 * Y-sort: zIndex = y + h
 * Collision: front wall + side wall rectangle (frontW + RIGHT_DEPTH)
 */

type Pt = { x: number; y: number };

const COLORS = {
    // Ambient occlusion
    aoShadow:           0x000000,

    // Walls — wood brown (Stable distinct from Barn red)
    wallBrownTop:       0xa06834,
    wallBrownBot:       0x6e4220,
    wallBrownLight:     0xc88a4e,
    wallBrownDeep:      0x4a2c14,
    wallSideTop:        0x6a4020,
    wallSideBot:        0x3a2410,
    wallSideLight:      0x8a5a30,

    // Foundation kamienna (matching Barn)
    foundation:         0x6b6058,
    foundationLight:    0x8c8279,
    foundationShadow:   0x453b34,

    // Cast shadows
    castShadow:         0x2a1a08,

    // Trim (jasny drewniany)
    trim:               0xffe8cf,
    trimShadow:         0xcca785,
    trimDark:           0x806349,

    // Roof — wood shingles (brown)
    tileN:              0x5a3818,
    tileNLight:         0x7a4e24,
    tileNHighlight:     0xa06834,
    tileNOutline:       0x2a1808,
    roofThickness:      0x1f1208,
    roofRidge:          0x1a0e04,

    // Vertical wood planks (front wall texture)
    plankDark:          0x6e4220,
    plankLight:         0xb47a44,
    plankSeam:          0x3a2010,

    // Stable doors (darker wood, prominent)
    doorWood:           0x4a3018,
    doorWoodDark:       0x2a1808,
    doorWoodLight:      0x7a5028,
    doorMetal:          0x202020,
    doorMetalLight:     0x4a4a4a,
    doorHinge:          0x303030,
    horseshoe:          0xb0b0b0,
    horseshoeLight:     0xe0e0e0,

    // Shutters RED (kontrast z brown wall = AAA)
    shutterRed:         0xa01818,
    shutterRedDark:     0x701010,
    shutterRedLight:    0xc82828,

    // Window glass
    windowHole:         0x1a1408,
    windowGlass:        0xa8c8d8,
    windowGlassDark:    0x586878,
    windowGlassLight:   0xd0e0e8,
    windowFrame:        0x281408,

    // Hayloft hay
    hayMain:            0xd8b048,
    hayDark:            0x9a7820,
    hayLight:           0xf0d068,
    hayHighlight:       0xfff0a0,

    // Weather vane (horse silhouette)
    vanePole:           0x303030,
    vanePoleLight:      0x6a6a6a,
    vaneHorse:          0x101010,
    vaneHorseLight:     0x4a4a4a,
    vaneArrow:          0x202020,

    // Lantern (z migoczącym płomieniem)
    lanternBlack:       0x101010,
    lanternGold:        0x806020,
    lanternGoldLight:   0xb88830,
    lanternGlass:       0xffd060,
    flameOrange:        0xff8020,
    flameYellow:        0xffe040,
    flameWhite:         0xfff8c0,
    flameGlow:          0xffc040,

    // Bucket
    bucketWood:         0x7a4a28,
    bucketDark:         0x4a2818,
    bucketBand:         0x2a2a2a,
    bucketBandLight:    0x6a6a6a,
    bucketWater:        0x4080a0,
    bucketWaterLight:   0x80c0e0,
} as const;

interface FlameParticle {
    gfx: PIXI.Graphics;
    age: number;
    maxAge: number;
    baseY: number;
    baseX: number;
    seed: number;
}

export class Stable implements ICollidable {
    public x: number;
    public y: number;
    public w: number = 320;
    public h: number = 200;
    public container: PIXI.Container;

    // Animated parts
    private animatedContainer: PIXI.Container;
    private windowGlowGfx: PIXI.Graphics;
    private flameContainer: PIXI.Container;
    private flameMainGfx: PIXI.Graphics;
    private flameParticles: FlameParticle[] = [];
    private lanternX: number = 0;     // world coords for flame particle spawn
    private lanternY: number = 0;
    private weatherVaneGfx: PIXI.Graphics;
    private vaneRotation: number = 0;
    private vaneTargetRot: number = 0;
    private haySwayGfx: PIXI.Graphics;
    private hayBaseY: number = 0;

    private time: number = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        this.container = new PIXI.Container();
        this.container.zIndex = y + this.h;  // Y-sort dla naturalnego depth
        worldContainer.addChild(this.container);

        // AO container (najnizszy zIndex)
        const aoContainer = new PIXI.Container();
        this.container.addChild(aoContainer);
        this.drawAO(aoContainer);

        // Static parts (main rendering)
        const staticContainer = new PIXI.Container();
        this.container.addChild(staticContainer);
        this.drawStaticParts(staticContainer);

        // Animated container (last, top)
        this.animatedContainer = new PIXI.Container();
        this.container.addChild(this.animatedContainer);

        this.windowGlowGfx = new PIXI.Graphics();
        this.animatedContainer.addChild(this.windowGlowGfx);

        this.haySwayGfx = new PIXI.Graphics();
        this.animatedContainer.addChild(this.haySwayGfx);

        this.weatherVaneGfx = new PIXI.Graphics();
        this.animatedContainer.addChild(this.weatherVaneGfx);

        this.flameContainer = new PIXI.Container();
        this.animatedContainer.addChild(this.flameContainer);

        this.flameMainGfx = new PIXI.Graphics();
        this.flameContainer.addChild(this.flameMainGfx);
    }

    // ═══════════════════════════════════════════════════════════
    // AO — ambient occlusion drop shadow SE
    // ═══════════════════════════════════════════════════════════
    private drawAO(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();
        const x = this.x, y = this.y, h = this.h, w = this.w;

        // Outer haze (extended SE)
        g.beginFill(COLORS.aoShadow, 0.10);
        g.moveTo(x - 10, y + h * 0.55);
        g.lineTo(x + w + 60, y + h * 0.55);
        g.lineTo(x + w + 70, y + h + 40);
        g.lineTo(x - 10, y + h + 40);
        g.closePath();
        g.endFill();

        // Mid shadow
        g.beginFill(COLORS.aoShadow, 0.18);
        g.moveTo(x - 4, y + h * 0.72);
        g.lineTo(x + w + 38, y + h * 0.72);
        g.lineTo(x + w + 48, y + h + 26);
        g.lineTo(x - 4, y + h + 26);
        g.closePath();
        g.endFill();

        parent.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // STATIC PARTS — foundation, walls, roof, doors, hayloft, details
    // ═══════════════════════════════════════════════════════════
    private drawStaticParts(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();
        const x = this.x, y = this.y, h = this.h, w = this.w;

        // Proporcje (matching Barn)
        const roofH = h * 0.45;
        const wallH = h - roofH;
        const wallY = y + roofH;
        const cx = x + w / 2;
        const FOUNDATION_H = 18;
        const foundY = wallY + wallH - FOUNDATION_H;

        // 3D iso profile
        const RIGHT_DEPTH = 32;
        const ISO_RISE = 18;

        // Ridge apex (asymetria 3D)
        const ridgeApexX = cx + w * 0.04;
        const ridgeApexY = y + h * 0.04;

        // Wall corners (FRONT — rectangle)
        const fBL: Pt = { x, y: foundY };
        const fBR: Pt = { x: x + w, y: foundY };
        const fTL: Pt = { x, y: wallY };
        const fTR: Pt = { x: x + w, y: wallY };

        // SIDE wall corners (iso depth, parallelogram skewed)
        const sBL: Pt = { ...fBR };
        const sTL: Pt = { ...fTR };
        const sBR: Pt = { x: fBR.x + RIGHT_DEPTH, y: fBR.y - ISO_RISE };
        const sTR: Pt = { x: fTR.x + RIGHT_DEPTH, y: fTR.y - ISO_RISE };

        // ── 1. FOUNDATION (kamienny pas pod front wall) ──
        const FOUND_STICK = 3;

        // Drop shadow pod foundation
        g.beginFill(0x000000, 0.25);
        g.drawRect(x - FOUND_STICK + 2, foundY + FOUNDATION_H, w + FOUND_STICK * 2 - 4, 3);
        g.endFill();

        // Foundation front face
        g.beginFill(COLORS.foundation, 1);
        g.drawRect(x - FOUND_STICK, foundY, w + FOUND_STICK * 2, FOUNDATION_H);
        g.endFill();

        // Foundation light strip (top)
        g.beginFill(COLORS.foundationLight, 0.85);
        g.drawRect(x - FOUND_STICK, foundY, w + FOUND_STICK * 2, 3);
        g.endFill();

        // Foundation shadow strip (bottom)
        g.beginFill(COLORS.foundationShadow, 0.75);
        g.drawRect(x - FOUND_STICK, foundY + FOUNDATION_H - 4, w + FOUND_STICK * 2, 4);
        g.endFill();

        // Stone texture lines
        g.lineStyle(1, COLORS.foundationShadow, 0.5);
        for (let i = 0; i < 6; i++) {
            const sx = x + (w / 6) * i + ((i * 3137) % 20);
            const seedH = ((i * 7919) % 30) / 100 + 0.4;
            g.moveTo(sx, foundY + 4);
            g.lineTo(sx, foundY + 4 + FOUNDATION_H * seedH);
        }
        g.lineStyle(0);

        // Side foundation (sticking out behind)
        g.beginFill(COLORS.foundationShadow, 1);
        g.drawPolygon([
            x + w, foundY,
            x + w + RIGHT_DEPTH, foundY - ISO_RISE,
            x + w + RIGHT_DEPTH, foundY - ISO_RISE + FOUNDATION_H,
            x + w, foundY + FOUNDATION_H,
        ]);
        g.endFill();

        // ── 2. SIDE WALL (parallelogram iso — DARKER) ──
        // Drawn FIRST tak żeby front wall przykrywała ją
        g.beginFill(COLORS.wallSideBot, 1);
        g.drawPolygon([sTL.x, sTL.y, sTR.x, sTR.y, sBR.x, sBR.y, sBL.x, sBL.y]);
        g.endFill();

        // Side wall gradient overlay (top → bot darker)
        g.beginFill(COLORS.wallSideTop, 0.55);
        g.drawPolygon([
            sTL.x, sTL.y,
            sTR.x, sTR.y,
            sTR.x, sTR.y + (sBR.y - sTR.y) * 0.4,
            sTL.x, sTL.y + (sBL.y - sTL.y) * 0.4,
        ]);
        g.endFill();

        // Side wall vertical plank seams (iso skewed dla głębi)
        const SIDE_PLANKS = 4;
        g.lineStyle(1.5, COLORS.plankSeam, 0.65);
        for (let p = 1; p < SIDE_PLANKS; p++) {
            const t = p / SIDE_PLANKS;
            const topX = sTL.x + (sTR.x - sTL.x) * t;
            const topY = sTL.y + (sTR.y - sTL.y) * t;
            const botX = sBL.x + (sBR.x - sBL.x) * t;
            const botY = sBL.y + (sBR.y - sBL.y) * t;
            g.moveTo(topX, topY);
            g.lineTo(botX, botY);
        }
        g.lineStyle(0);

        // Side wall outline
        g.lineStyle(2, COLORS.wallBrownDeep, 0.85);
        g.moveTo(sTL.x, sTL.y);
        g.lineTo(sTR.x, sTR.y);
        g.lineTo(sBR.x, sBR.y);
        g.lineTo(sBL.x, sBL.y);
        g.lineStyle(0);

        // ── 3. SIDE WINDOW (na side wall iso) ──
        const SIDE_WIN_SIZE = 20;
        const swCenterX = sTL.x + (sTR.x - sTL.x) * 0.5;
        const swCenterY = sTL.y + (sTR.y - sTL.y) * 0.5 + 8;
        this.drawWindowFrame(g, swCenterX - SIDE_WIN_SIZE / 2, swCenterY - SIDE_WIN_SIZE / 2, SIDE_WIN_SIZE, true);

        // Side window glass z reflection
        const skewY = -SIDE_WIN_SIZE * 0.5625;
        g.beginFill(COLORS.windowGlassDark, 1);
        g.drawPolygon([
            swCenterX - SIDE_WIN_SIZE / 2, swCenterY - SIDE_WIN_SIZE / 2,
            swCenterX + SIDE_WIN_SIZE / 2, swCenterY - SIDE_WIN_SIZE / 2 + skewY,
            swCenterX + SIDE_WIN_SIZE / 2, swCenterY + SIDE_WIN_SIZE / 2 + skewY,
            swCenterX - SIDE_WIN_SIZE / 2, swCenterY + SIDE_WIN_SIZE / 2,
        ]);
        g.endFill();
        g.beginFill(COLORS.windowGlass, 0.7);
        g.drawPolygon([
            swCenterX - SIDE_WIN_SIZE / 2 + 2, swCenterY - SIDE_WIN_SIZE / 2 + 2,
            swCenterX + SIDE_WIN_SIZE / 2 - 2, swCenterY - SIDE_WIN_SIZE / 2 + skewY + 2,
            swCenterX + SIDE_WIN_SIZE / 2 - 2, swCenterY + SIDE_WIN_SIZE / 2 + skewY - 2,
            swCenterX - SIDE_WIN_SIZE / 2 + 2, swCenterY + SIDE_WIN_SIZE / 2 - 2,
        ]);
        g.endFill();
        // Glass diagonal shine
        g.beginFill(COLORS.windowGlassLight, 0.55);
        g.drawPolygon([
            swCenterX - SIDE_WIN_SIZE / 2 + 3, swCenterY - SIDE_WIN_SIZE / 2 + 3,
            swCenterX - SIDE_WIN_SIZE / 2 + 8, swCenterY - SIDE_WIN_SIZE / 2 + 3,
            swCenterX - SIDE_WIN_SIZE / 2 + 3, swCenterY - SIDE_WIN_SIZE / 2 + 8,
        ]);
        g.endFill();

        // ── 4. FRONT WALL (rectangle z vertical planks) ──
        // Main fill
        g.beginFill(COLORS.wallBrownBot, 1);
        g.drawRect(x, wallY, w, foundY - wallY);
        g.endFill();

        // Gradient overlay (sunlit top)
        g.beginFill(COLORS.wallBrownTop, 1);
        g.drawRect(x, wallY, w, (foundY - wallY) * 0.6);
        g.endFill();

        // Vertical planks texture (subtle width variation)
        const FRONT_PLANKS = 12;
        const plankW = w / FRONT_PLANKS;
        for (let p = 0; p < FRONT_PLANKS; p++) {
            const px = x + p * plankW;
            // Plank highlight (left edge sunlit)
            g.beginFill(COLORS.plankLight, 0.18);
            g.drawRect(px, wallY, plankW * 0.15, foundY - wallY);
            g.endFill();
            // Plank seam (right edge shadow)
            g.lineStyle(1.2, COLORS.plankSeam, 0.65);
            g.moveTo(px + plankW, wallY);
            g.lineTo(px + plankW, foundY);
            g.lineStyle(0);
        }

        // Wall outline
        g.lineStyle(2.5, COLORS.wallBrownDeep, 0.9);
        g.drawRect(x, wallY, w, foundY - wallY);
        g.lineStyle(0);

        // ── 5. FRONT DOORS (double, central) ──
        const doorW = 70;
        const doorH = (foundY - wallY) * 0.78;
        const doorX = cx - doorW;  // 2 skrzydła = 2x doorW total
        const doorY = foundY - doorH;

        // Door recess shadow (dark behind)
        g.beginFill(COLORS.castShadow, 0.85);
        g.drawRect(doorX - 2, doorY - 2, doorW * 2 + 4, doorH + 4);
        g.endFill();

        // LEFT door
        g.beginFill(COLORS.doorWood, 1);
        g.drawRect(doorX, doorY, doorW, doorH);
        g.endFill();
        g.beginFill(COLORS.doorWoodLight, 0.55);
        g.drawRect(doorX, doorY, doorW, doorH * 0.4);
        g.endFill();
        // Vertical planks on left door
        for (let dp = 1; dp < 5; dp++) {
            g.lineStyle(1.5, COLORS.doorWoodDark, 0.7);
            g.moveTo(doorX + (doorW / 5) * dp, doorY);
            g.lineTo(doorX + (doorW / 5) * dp, doorY + doorH);
            g.lineStyle(0);
        }
        // X-brace (autentyczne stable doors)
        g.lineStyle(3.5, COLORS.doorWoodDark, 0.9);
        g.moveTo(doorX + 4, doorY + 4);
        g.lineTo(doorX + doorW - 4, doorY + doorH - 4);
        g.moveTo(doorX + doorW - 4, doorY + 4);
        g.lineTo(doorX + 4, doorY + doorH - 4);
        g.lineStyle(0);

        // RIGHT door
        const doorRX = doorX + doorW;
        g.beginFill(COLORS.doorWood, 1);
        g.drawRect(doorRX, doorY, doorW, doorH);
        g.endFill();
        g.beginFill(COLORS.doorWoodLight, 0.55);
        g.drawRect(doorRX, doorY, doorW, doorH * 0.4);
        g.endFill();
        for (let dp = 1; dp < 5; dp++) {
            g.lineStyle(1.5, COLORS.doorWoodDark, 0.7);
            g.moveTo(doorRX + (doorW / 5) * dp, doorY);
            g.lineTo(doorRX + (doorW / 5) * dp, doorY + doorH);
            g.lineStyle(0);
        }
        g.lineStyle(3.5, COLORS.doorWoodDark, 0.9);
        g.moveTo(doorRX + 4, doorY + 4);
        g.lineTo(doorRX + doorW - 4, doorY + doorH - 4);
        g.moveTo(doorRX + doorW - 4, doorY + 4);
        g.lineTo(doorRX + 4, doorY + doorH - 4);
        g.lineStyle(0);

        // Door outlines + central seam
        g.lineStyle(3, COLORS.doorWoodDark, 1);
        g.drawRect(doorX, doorY, doorW * 2, doorH);
        g.moveTo(doorRX, doorY);
        g.lineTo(doorRX, doorY + doorH);
        g.lineStyle(0);

        // Metal hinges (3 per door)
        for (let side = 0; side < 2; side++) {
            const sideX = side === 0 ? doorX + 3 : doorRX + doorW - 17;
            for (let hi = 0; hi < 3; hi++) {
                const hy = doorY + 8 + hi * (doorH - 16) / 2;
                g.beginFill(COLORS.doorMetal, 1);
                g.drawRoundedRect(sideX, hy, 14, 8, 2);
                g.endFill();
                g.beginFill(COLORS.doorMetalLight, 0.85);
                g.drawRoundedRect(sideX + 1, hy + 1, 12, 2, 1);
                g.endFill();
                // Bolt
                g.beginFill(COLORS.doorMetalLight, 1);
                g.drawCircle(sideX + 11, hy + 4, 1.4);
                g.endFill();
            }
        }

        // Horseshoe (centered top na drzwiach — symbol stable!)
        const hsX = cx;
        const hsY = doorY + 18;
        const hsR = 9;
        g.lineStyle(3, COLORS.horseshoe, 1);
        g.arc(hsX, hsY, hsR, Math.PI * 0.2, Math.PI * 0.8);
        g.lineStyle(0);
        g.lineStyle(1.5, COLORS.horseshoeLight, 0.85);
        g.arc(hsX, hsY, hsR - 1.5, Math.PI * 0.2, Math.PI * 0.8);
        g.lineStyle(0);
        // Nail holes
        g.beginFill(COLORS.doorWoodDark, 1);
        g.drawCircle(hsX - hsR * 0.7, hsY - 1, 0.8);
        g.drawCircle(hsX + hsR * 0.7, hsY - 1, 0.8);
        g.drawCircle(hsX - hsR * 0.3, hsY - hsR * 0.6, 0.8);
        g.drawCircle(hsX + hsR * 0.3, hsY - hsR * 0.6, 0.8);
        g.endFill();

        // ── 6. FRONT WINDOWS (2 sztuki, flanking doors, z czerwonymi shutters) ──
        const WIN_SIZE = 22;
        const win1X = x + w * 0.12;
        const win2X = x + w * 0.88 - WIN_SIZE;
        const winY = wallY + (foundY - wallY) * 0.22;
        this.drawFrontWindowWithShutters(g, win1X, winY, WIN_SIZE);
        this.drawFrontWindowWithShutters(g, win2X, winY, WIN_SIZE);

        // ── 7. HAYLOFT DOOR (na górze, w gable) ──
        // Drawn ON front roof slope area
        const hayDoorW = 36;
        const hayDoorH = 28;
        const hayDoorX = cx - hayDoorW / 2;
        const hayDoorY = y + roofH * 0.55;  // w gable triangle area

        // Background dark recess
        g.beginFill(COLORS.castShadow, 1);
        g.drawRect(hayDoorX - 2, hayDoorY - 2, hayDoorW + 4, hayDoorH + 4);
        g.endFill();

        // Door open (visible hay inside, animated z hayloft sway gfx)
        g.beginFill(COLORS.hayDark, 1);
        g.drawRect(hayDoorX, hayDoorY, hayDoorW, hayDoorH);
        g.endFill();

        // Static hay base (animated sway will be overlay)
        this.hayBaseY = hayDoorY + hayDoorH * 0.4;
        g.beginFill(COLORS.hayMain, 1);
        g.drawRect(hayDoorX, hayDoorY + hayDoorH * 0.35, hayDoorW, hayDoorH * 0.65);
        g.endFill();
        g.beginFill(COLORS.hayLight, 0.75);
        g.drawRect(hayDoorX, hayDoorY + hayDoorH * 0.35, hayDoorW, hayDoorH * 0.25);
        g.endFill();

        // Hay strands
        g.lineStyle(1.2, COLORS.hayHighlight, 0.85);
        for (let hs = 0; hs < 6; hs++) {
            const hx = hayDoorX + (hayDoorW / 7) * (hs + 1) + ((hs * 1933) % 4 - 2);
            const hy1 = hayDoorY + hayDoorH * 0.3 + ((hs * 3137) % 3);
            const hy2 = hayDoorY + hayDoorH - 2;
            g.moveTo(hx, hy1);
            g.lineTo(hx + ((hs * 7919) % 6 - 3), hy2);
        }
        g.lineStyle(0);

        // Hayloft door FRAME (open doors hung to sides)
        g.beginFill(COLORS.doorWood, 1);
        g.drawRect(hayDoorX - 5, hayDoorY, 4, hayDoorH);    // left flap
        g.drawRect(hayDoorX + hayDoorW + 1, hayDoorY, 4, hayDoorH);  // right flap
        g.endFill();
        g.lineStyle(1.5, COLORS.doorWoodDark, 0.9);
        g.drawRect(hayDoorX - 5, hayDoorY, 4, hayDoorH);
        g.drawRect(hayDoorX + hayDoorW + 1, hayDoorY, 4, hayDoorH);
        g.lineStyle(0);

        // Hayloft door outline
        g.lineStyle(2, COLORS.doorWoodDark, 1);
        g.drawRect(hayDoorX, hayDoorY, hayDoorW, hayDoorH);
        g.lineStyle(0);

        // ── 8. ROOF (2-slope gable z iso side) ──
        const OVERHANG = 8;
        const rFrontL: Pt = { x: x - OVERHANG, y: wallY + 2 };
        const rFrontR: Pt = { x: x + w + OVERHANG, y: wallY + 2 };
        const rSideBack: Pt = { x: sTR.x + OVERHANG / 2, y: sTR.y + 2 };
        const rApex: Pt = { x: ridgeApexX, y: ridgeApexY };

        // Right roof slope (TRIANGLE, darker iso side)
        g.beginFill(COLORS.tileN, 1);
        g.drawPolygon([rApex.x, rApex.y, rFrontR.x, rFrontR.y, rSideBack.x, rSideBack.y]);
        g.endFill();
        // Iso tiles on right slope
        this.drawIsoRoofTilesTriangle(g, rApex, rFrontR, rSideBack);

        // Front roof slope (TRAPEZOID, sunlit lighter)
        g.beginFill(COLORS.tileNLight, 1);
        g.drawPolygon([rFrontL.x, rFrontL.y, rApex.x, rApex.y, rFrontR.x, rFrontR.y]);
        g.endFill();
        // Front roof tiles (rows of shingles)
        this.drawFrontRoofTiles(g, rFrontL, rFrontR, rApex);

        // ── 9. FASCIA (front + side eave bottom edges) ──
        const FASCIA_H = 6;
        g.beginFill(COLORS.roofRidge, 1);
        g.drawRect(rFrontL.x, rFrontL.y, rFrontR.x - rFrontL.x, FASCIA_H);
        g.endFill();
        g.lineStyle(1.5, 0x0a0402, 1);
        g.moveTo(rFrontL.x, rFrontL.y + FASCIA_H);
        g.lineTo(rFrontR.x, rFrontR.y + FASCIA_H);
        g.lineStyle(0);
        // Highlight wood grain on fascia
        g.lineStyle(1, COLORS.tileNHighlight, 0.45);
        g.moveTo(rFrontL.x + 2, rFrontL.y + 1);
        g.lineTo(rFrontR.x - 2, rFrontR.y + 1);
        g.lineStyle(0);

        // Side fascia (iso skewed)
        g.beginFill(COLORS.roofRidge, 1);
        g.drawPolygon([
            rFrontR.x, rFrontR.y,
            rSideBack.x, rSideBack.y,
            rSideBack.x, rSideBack.y + FASCIA_H,
            rFrontR.x, rFrontR.y + FASCIA_H,
        ]);
        g.endFill();

        // ── 10. RIDGE BEAM (ciemna belka na apex) ──
        g.lineStyle(4, COLORS.roofRidge, 1);
        g.moveTo(rApex.x - 2, rApex.y + 1);
        g.lineTo(rApex.x + 8, rApex.y - 2);
        g.lineStyle(0);

        // ── 11. WEATHER VANE base pole (animated horse rotation later) ──
        const vanePoleX = rApex.x + 4;
        const vanePoleY = rApex.y;
        const vanePoleTop = rApex.y - 26;
        g.beginFill(COLORS.vanePole, 1);
        g.drawRect(vanePoleX - 1, vanePoleTop, 2, vanePoleY - vanePoleTop);
        g.endFill();
        g.beginFill(COLORS.vanePoleLight, 0.85);
        g.drawRect(vanePoleX - 0.5, vanePoleTop, 0.7, vanePoleY - vanePoleTop);
        g.endFill();
        // Ball joint
        g.beginFill(COLORS.vanePole, 1);
        g.drawCircle(vanePoleX, vanePoleTop, 2.5);
        g.endFill();
        g.beginFill(COLORS.vanePoleLight, 0.85);
        g.drawCircle(vanePoleX - 1, vanePoleTop - 1, 1.2);
        g.endFill();

        // Cardinal letters (N, S, E, W around joint)
        const cardSize = 4;
        g.beginFill(COLORS.vanePole, 1);
        // N (up)
        g.drawCircle(vanePoleX, vanePoleTop - 6, 1.2);
        g.endFill();

        // ── 12. LANTERN (z migoczącym płomieniem — drawn statically, flame anim later) ──
        const lantX = x + w * 0.08;
        const lantY = wallY + (foundY - wallY) * 0.30;
        this.lanternX = lantX;
        this.lanternY = lantY;
        this.drawLanternStatic(g, lantX, lantY);

        // ── 13. BUCKET (wooden, near front doors) ──
        const buckX = doorX - 30;
        const buckY = foundY - 8;
        this.drawBucketStatic(g, buckX, buckY);

        // Save weather vane horse position (drawn animated later)
        this.vaneRotation = 0;
        this.vaneTargetRot = 0;
        // Store for animation
        (this as any)._vaneX = vanePoleX;
        (this as any)._vaneY = vanePoleTop - 3;

        // Save hayloft hay sway position
        (this as any)._hayX = hayDoorX;
        (this as any)._hayY = hayDoorY;
        (this as any)._hayW = hayDoorW;
        (this as any)._hayH = hayDoorH;

        // Save window glow positions for pulse
        (this as any)._winPositions = [
            { x: win1X + WIN_SIZE / 2, y: winY + WIN_SIZE / 2, size: WIN_SIZE },
            { x: win2X + WIN_SIZE / 2, y: winY + WIN_SIZE / 2, size: WIN_SIZE },
            { x: swCenterX, y: swCenterY, size: SIDE_WIN_SIZE },
        ];

        parent.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // Front window with red shutters
    // ═══════════════════════════════════════════════════════════
    private drawFrontWindowWithShutters(g: PIXI.Graphics, wx: number, wy: number, size: number): void {
        // Open shutters on sides (rotated 90° out)
        const shutW = size * 0.42;
        const shutH = size;

        // Left shutter (folded out left)
        g.beginFill(COLORS.shutterRedDark, 1);
        g.drawRect(wx - shutW - 1, wy, shutW, shutH);
        g.endFill();
        g.beginFill(COLORS.shutterRed, 1);
        g.drawRect(wx - shutW, wy, shutW - 1, shutH);
        g.endFill();
        // Vertical slats
        g.lineStyle(1, COLORS.shutterRedDark, 0.85);
        for (let s = 1; s < 3; s++) {
            g.moveTo(wx - shutW + (shutW / 3) * s, wy + 2);
            g.lineTo(wx - shutW + (shutW / 3) * s, wy + shutH - 2);
        }
        g.lineStyle(0);

        // Right shutter
        g.beginFill(COLORS.shutterRedDark, 1);
        g.drawRect(wx + size + 1, wy, shutW, shutH);
        g.endFill();
        g.beginFill(COLORS.shutterRed, 1);
        g.drawRect(wx + size + 1, wy, shutW - 1, shutH);
        g.endFill();
        g.lineStyle(1, COLORS.shutterRedDark, 0.85);
        for (let s = 1; s < 3; s++) {
            g.moveTo(wx + size + 1 + (shutW / 3) * s, wy + 2);
            g.lineTo(wx + size + 1 + (shutW / 3) * s, wy + shutH - 2);
        }
        g.lineStyle(0);

        // Shutter outlines
        g.lineStyle(1.5, COLORS.castShadow, 0.85);
        g.drawRect(wx - shutW - 1, wy, shutW, shutH);
        g.drawRect(wx + size + 1, wy, shutW, shutH);
        g.lineStyle(0);

        // Window frame + glass
        this.drawWindowFrame(g, wx, wy, size, false);

        // Glass fill
        g.beginFill(COLORS.windowGlassDark, 1);
        g.drawRect(wx, wy, size, size);
        g.endFill();
        g.beginFill(COLORS.windowGlass, 0.85);
        g.drawRect(wx + 1, wy + 1, size - 2, size - 2);
        g.endFill();
        // Diagonal shine
        g.beginFill(COLORS.windowGlassLight, 0.65);
        g.drawPolygon([
            wx + 2, wy + 2,
            wx + 8, wy + 2,
            wx + 2, wy + 8,
        ]);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // Window frame (with optional iso skew dla side wall)
    // ═══════════════════════════════════════════════════════════
    private drawWindowFrame(g: PIXI.Graphics, wx: number, wy: number, size: number, isoSkewed: boolean): void {
        const skewY = isoSkewed ? -size * 0.5625 : 0;
        const skewX = 0;

        // Frame (chunky outline)
        g.lineStyle(4, COLORS.windowFrame, 1);
        if (isoSkewed) {
            g.drawPolygon([
                wx - 2, wy - 2,
                wx + size + skewX + 2, wy + skewY - 2,
                wx + size + skewX + 2, wy + size + skewY + 2,
                wx - 2, wy + size + 2,
            ]);
        } else {
            g.drawRect(wx - 2, wy - 2, size + 4, size + 4);
        }
        g.lineStyle(0);

        // Drop shadow (bottom edge)
        g.lineStyle(3, COLORS.castShadow, 0.45);
        if (isoSkewed) {
            g.moveTo(wx - 2, wy + size + 3);
            g.lineTo(wx + size + skewX + 2, wy + size + skewY + 3);
        } else {
            g.moveTo(wx - 2, wy + size + 3);
            g.lineTo(wx + size + 2, wy + size + 3);
        }
        g.lineStyle(0);

        // Mullion (cross)
        const midX = wx + size / 2 + skewX / 2;
        const midY = wy + size / 2 + skewY / 2;
        g.lineStyle(2.5, COLORS.windowFrame, 1);
        g.moveTo(midX, wy + skewY * 0.5);
        g.lineTo(midX, wy + size + skewY * 0.5);
        g.moveTo(wx, midY);
        g.lineTo(wx + size + skewX, midY + skewY);
        g.lineStyle(0);
    }

    // ═══════════════════════════════════════════════════════════
    // Front roof tiles (horizontal shingles rows)
    // ═══════════════════════════════════════════════════════════
    private drawFrontRoofTiles(g: PIXI.Graphics, pL: Pt, pR: Pt, apex: Pt): void {
        const ROWS = 5;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            const lerpY = pL.y + (apex.y - pL.y) * t;
            const lerpXL = pL.x + (apex.x - pL.x) * t;
            const lerpXR = pR.x + (apex.x - pR.x) * t;

            // Shadow under each shingle row
            g.lineStyle(3, COLORS.roofThickness, 0.32);
            g.moveTo(lerpXL, lerpY + 2);
            g.lineTo(lerpXR, lerpY + 2);
            g.lineStyle(0);

            // Outline (tile bottom edge)
            g.lineStyle(2, COLORS.tileNOutline, 0.7);
            g.moveTo(lerpXL, lerpY);
            g.lineTo(lerpXR, lerpY);
            g.lineStyle(0);

            // Highlight (sunlit top of shingle)
            g.lineStyle(1.5, COLORS.tileNHighlight, 0.75);
            g.moveTo(lerpXL, lerpY - 1.5);
            g.lineTo(lerpXR, lerpY - 1.5);
            g.lineStyle(0);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Iso roof tiles (side triangle slope)
    // ═══════════════════════════════════════════════════════════
    private drawIsoRoofTilesTriangle(g: PIXI.Graphics, apex: Pt, frontR: Pt, sideBack: Pt): void {
        const ROWS = 4;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            const lerpLeftX = frontR.x + (apex.x - frontR.x) * t;
            const lerpLeftY = frontR.y + (apex.y - frontR.y) * t;
            const lerpRightX = sideBack.x + (apex.x - sideBack.x) * t;
            const lerpRightY = sideBack.y + (apex.y - sideBack.y) * t;

            g.lineStyle(3, COLORS.roofThickness, 0.35);
            g.moveTo(lerpLeftX, lerpLeftY + 2);
            g.lineTo(lerpRightX, lerpRightY + 2);
            g.lineStyle(0);

            g.lineStyle(2, COLORS.tileNOutline, 0.65);
            g.moveTo(lerpLeftX, lerpLeftY);
            g.lineTo(lerpRightX, lerpRightY);
            g.lineStyle(0);

            g.lineStyle(1.5, COLORS.tileNLight, 0.75);
            g.moveTo(lerpLeftX, lerpLeftY - 1.5);
            g.lineTo(lerpRightX, lerpRightY - 1.5);
            g.lineStyle(0);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Lantern (static body, flame animated later)
    // ═══════════════════════════════════════════════════════════
    private drawLanternStatic(g: PIXI.Graphics, lx: number, ly: number): void {
        // Hanging rope (krótka)
        g.lineStyle(1.5, COLORS.lanternBlack, 0.85);
        g.moveTo(lx, ly - 8);
        g.lineTo(lx, ly);
        g.lineStyle(0);

        // Top cap (czarny daszek)
        g.beginFill(COLORS.lanternBlack, 1);
        g.moveTo(lx - 6, ly);
        g.lineTo(lx + 6, ly);
        g.lineTo(lx + 4, ly + 3);
        g.lineTo(lx - 4, ly + 3);
        g.closePath();
        g.endFill();
        g.beginFill(COLORS.lanternGoldLight, 0.7);
        g.drawRect(lx - 5, ly + 1, 10, 1);
        g.endFill();

        // Lantern body (glass z gold frame)
        g.beginFill(COLORS.lanternGold, 1);
        g.drawRect(lx - 5, ly + 3, 10, 12);
        g.endFill();
        // Inner glass (will glow)
        g.beginFill(COLORS.lanternGlass, 0.65);
        g.drawRect(lx - 4, ly + 4, 8, 10);
        g.endFill();
        // Gold frame outline
        g.lineStyle(1.5, COLORS.lanternBlack, 1);
        g.drawRect(lx - 5, ly + 3, 10, 12);
        g.lineStyle(0);
        // Mullion vertical
        g.lineStyle(1, COLORS.lanternGold, 0.85);
        g.moveTo(lx, ly + 4);
        g.lineTo(lx, ly + 14);
        g.lineStyle(0);

        // Bottom cap
        g.beginFill(COLORS.lanternBlack, 1);
        g.drawRect(lx - 6, ly + 14, 12, 2);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // Bucket (drewniane wiadro)
    // ═══════════════════════════════════════════════════════════
    private drawBucketStatic(g: PIXI.Graphics, bx: number, by: number): void {
        const bw = 16;
        const bh = 14;

        // Shadow
        g.beginFill(0x000000, 0.32);
        g.drawEllipse(bx + bw / 2, by + bh + 2, bw / 2 + 2, 3);
        g.endFill();

        // Body (trapezoid taper)
        g.beginFill(COLORS.bucketWood, 1);
        g.drawPolygon([
            bx + 1, by,
            bx + bw - 1, by,
            bx + bw - 2, by + bh,
            bx + 2, by + bh,
        ]);
        g.endFill();
        // Highlight (left side sunlit)
        g.beginFill(COLORS.bucketBandLight, 0.4);
        g.drawPolygon([
            bx + 1, by,
            bx + 4, by,
            bx + 4, by + bh,
            bx + 2, by + bh,
        ]);
        g.endFill();
        // Vertical staves (3 lines)
        g.lineStyle(1, COLORS.bucketDark, 0.85);
        for (let s = 1; s < 4; s++) {
            const sx = bx + (bw / 4) * s;
            g.moveTo(sx, by);
            g.lineTo(sx - 0.3, by + bh);
        }
        g.lineStyle(0);

        // Water inside
        g.beginFill(COLORS.bucketWater, 1);
        g.drawEllipse(bx + bw / 2, by + 1, bw / 2 - 2, 1.5);
        g.endFill();
        g.beginFill(COLORS.bucketWaterLight, 0.85);
        g.drawEllipse(bx + bw / 2 - 1, by + 0.5, 2.5, 0.6);
        g.endFill();

        // Metal bands (top + middle)
        g.beginFill(COLORS.bucketBand, 1);
        g.drawRect(bx, by + 0, bw, 1.5);
        g.drawRect(bx + 1, by + bh / 2, bw - 2, 1);
        g.drawRect(bx + 2, by + bh - 1.5, bw - 4, 1.5);
        g.endFill();
        g.beginFill(COLORS.bucketBandLight, 0.85);
        g.drawRect(bx + 1, by + 0.3, bw - 2, 0.5);
        g.endFill();

        // Handle (bałąk)
        g.lineStyle(1.5, COLORS.bucketBand, 1);
        g.moveTo(bx + 2, by);
        g.bezierCurveTo(bx + 2, by - 5, bx + bw - 2, by - 5, bx + bw - 2, by);
        g.lineStyle(0);

        // Outline
        g.lineStyle(1.5, COLORS.bucketDark, 1);
        g.drawPolygon([
            bx + 1, by,
            bx + bw - 1, by,
            bx + bw - 2, by + bh,
            bx + 2, by + bh,
        ]);
        g.lineStyle(0);
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — animated parts (window glow pulse, lantern flame, hay sway, vane)
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;

        // 1. Window glow pulse (3 okien)
        const winPositions = (this as any)._winPositions as Array<{ x: number, y: number, size: number }> | undefined;
        if (winPositions) {
            this.windowGlowGfx.clear();
            const glowAlpha = 0.45 + Math.sin(this.time * 1.4) * 0.18;
            for (const wp of winPositions) {
                this.windowGlowGfx.beginFill(COLORS.lanternGlass, glowAlpha * 0.45);
                this.windowGlowGfx.drawRect(wp.x - wp.size / 2, wp.y - wp.size / 2, wp.size, wp.size);
                this.windowGlowGfx.endFill();
                this.windowGlowGfx.beginFill(COLORS.flameYellow, glowAlpha * 0.25);
                this.windowGlowGfx.drawCircle(wp.x, wp.y, wp.size * 0.45);
                this.windowGlowGfx.endFill();
            }
        }

        // 2. Hay sway w hayloft (subtle horizontal wave)
        const hayX = (this as any)._hayX as number | undefined;
        if (hayX !== undefined) {
            const hayY = (this as any)._hayY as number;
            const hayW = (this as any)._hayW as number;
            const hayH = (this as any)._hayH as number;
            this.haySwayGfx.clear();
            const sway = Math.sin(this.time * 1.2) * 1.5;
            this.haySwayGfx.lineStyle(1, COLORS.hayHighlight, 0.85);
            for (let hs = 0; hs < 4; hs++) {
                const hx = hayX + (hayW / 5) * (hs + 1);
                const phase = hs * 0.5;
                const wave = Math.sin(this.time * 1.5 + phase) * 1.2 + sway;
                this.haySwayGfx.moveTo(hx, hayY + hayH * 0.35);
                this.haySwayGfx.lineTo(hx + wave, hayY + hayH - 4);
            }
            this.haySwayGfx.lineStyle(0);
        }

        // 3. Lantern flame (migoczący)
        this.flameMainGfx.clear();
        const lx = this.lanternX;
        const ly = this.lanternY;
        const flameY = ly + 9;  // center of lantern glass
        const flicker = Math.sin(this.time * 9) * 0.15 + Math.sin(this.time * 17) * 0.1;
        const flameScale = 1.0 + flicker;

        // Outer glow halo
        this.flameMainGfx.beginFill(COLORS.flameGlow, 0.35);
        this.flameMainGfx.drawCircle(lx, flameY, 14 * flameScale);
        this.flameMainGfx.endFill();
        this.flameMainGfx.beginFill(COLORS.flameYellow, 0.55);
        this.flameMainGfx.drawCircle(lx, flameY, 8 * flameScale);
        this.flameMainGfx.endFill();

        // Flame shape (teardrop)
        this.flameMainGfx.beginFill(COLORS.flameOrange, 1);
        this.flameMainGfx.drawEllipse(lx, flameY, 2.2 * flameScale, 4 * flameScale);
        this.flameMainGfx.endFill();
        this.flameMainGfx.beginFill(COLORS.flameYellow, 1);
        this.flameMainGfx.drawEllipse(lx, flameY - 0.5, 1.6 * flameScale, 3 * flameScale);
        this.flameMainGfx.endFill();
        this.flameMainGfx.beginFill(COLORS.flameWhite, 0.85);
        this.flameMainGfx.drawEllipse(lx, flameY - 1, 0.9 * flameScale, 2 * flameScale);
        this.flameMainGfx.endFill();

        // Spawn flame spark particles (rare)
        if (Math.random() < 0.08 && this.flameParticles.length < 6) {
            const gfx = new PIXI.Graphics();
            gfx.beginFill(COLORS.flameYellow, 0.85);
            gfx.drawCircle(0, 0, 0.7);
            gfx.endFill();
            gfx.x = lx + (Math.random() - 0.5) * 2;
            gfx.y = flameY - 3;
            this.flameContainer.addChild(gfx);
            this.flameParticles.push({
                gfx,
                age: 0,
                maxAge: 0.6 + Math.random() * 0.3,
                baseY: gfx.y,
                baseX: gfx.x,
                seed: Math.random(),
            });
        }
        // Update particles
        for (let i = this.flameParticles.length - 1; i >= 0; i--) {
            const p = this.flameParticles[i];
            p.age += 1 / 60;
            if (p.age >= p.maxAge) {
                this.flameContainer.removeChild(p.gfx);
                p.gfx.destroy();
                this.flameParticles.splice(i, 1);
                continue;
            }
            const t = p.age / p.maxAge;
            p.gfx.y = p.baseY - t * 12;
            p.gfx.x = p.baseX + Math.sin(this.time * 8 + p.seed * 10) * 1.5;
            p.gfx.alpha = (1 - t) * 0.85;
            p.gfx.scale.set(1 + t * 0.5);
        }

        // 4. Weather vane horse silhouette (rotation with subtle wind sway)
        const vx = (this as any)._vaneX as number | undefined;
        if (vx !== undefined) {
            const vy = (this as any)._vaneY as number;
            this.weatherVaneGfx.clear();
            // Slow wind change every 8s
            if (Math.floor(this.time / 8) !== Math.floor((this.time - 1 / 60) / 8)) {
                this.vaneTargetRot = (Math.random() - 0.5) * 0.6;
            }
            this.vaneRotation += (this.vaneTargetRot - this.vaneRotation) * 0.02;
            const sway = Math.sin(this.time * 1.8) * 0.05;
            const rot = this.vaneRotation + sway;

            // Arrow tail (behind horse)
            const cosR = Math.cos(rot);
            const sinR = Math.sin(rot);
            const arrowTailX = vx - 9 * cosR;
            const arrowTailY = vy - 9 * sinR;
            this.weatherVaneGfx.beginFill(COLORS.vaneArrow, 1);
            this.weatherVaneGfx.moveTo(arrowTailX - 3 * sinR, arrowTailY + 3 * cosR);
            this.weatherVaneGfx.lineTo(arrowTailX + 3 * sinR, arrowTailY - 3 * cosR);
            this.weatherVaneGfx.lineTo(vx - 5 * cosR, vy - 5 * sinR);
            this.weatherVaneGfx.closePath();
            this.weatherVaneGfx.endFill();

            // Horse silhouette (simplified side-view, ~12x8)
            const hcX = vx + 4 * cosR;
            const hcY = vy + 4 * sinR;
            const horseW = 12;
            const horseH = 7;
            // Body
            this.weatherVaneGfx.beginFill(COLORS.vaneHorse, 1);
            // Rotate the horse shape: we'll draw a simple silhouette using transformed points
            // For simplicity: draw approximate horse facing direction of rot
            this.weatherVaneGfx.drawEllipse(hcX, hcY, horseW * 0.5 * Math.abs(cosR) + 2, horseH * 0.5);
            this.weatherVaneGfx.endFill();
            // Neck/head bump (in front)
            this.weatherVaneGfx.beginFill(COLORS.vaneHorse, 1);
            this.weatherVaneGfx.drawEllipse(hcX + 5 * cosR, hcY + 5 * sinR - 1, 2.5, 2);
            this.weatherVaneGfx.endFill();
            // Highlight
            this.weatherVaneGfx.beginFill(COLORS.vaneHorseLight, 0.55);
            this.weatherVaneGfx.drawEllipse(hcX - 1, hcY - 1, 3, 1);
            this.weatherVaneGfx.endFill();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // COLLISION — front rectangle + side iso footprint extends right
    // ═══════════════════════════════════════════════════════════
    public getCollisionRect(): { x: number, y: number, w: number, h: number, update: () => void } {
        // Footprint: front wall + side wall depth
        const RIGHT_DEPTH = 32;
        const ISO_RISE = 18;
        const roofH = this.h * 0.45;
        const wallY = this.y + roofH;
        const wallH = this.h - roofH;
        const FOUNDATION_H = 18;
        const collY = wallY - 4;  // include a bit above wall top
        const collH = wallH - 4;  // exclude foundation (player can walk in front)
        return {
            x: this.x,
            y: collY,
            w: this.w + RIGHT_DEPTH,
            h: collH + FOUNDATION_H * 0.4,
            update: () => {},
        };
    }
}