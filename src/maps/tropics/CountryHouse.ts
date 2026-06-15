import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { fillGradientPolygon, makeRng, type Pt } from './FarmBuildingTextures';

/**
 * v0.33.0 FAZA T5 — COUNTRY HOUSE (Caribbean cottage) AAA PREMIUM
 *
 * Karaibski domek jednorodzinny. Footprint 160×140.
 * Color palette parameter — 3 wariants (teal/yellow/pink) dla varied skyline.
 *
 * 5 Subtle Life animations:
 *   1. Chimney smoke (puffs spawn ~8s, drift up + fade)
 *   2. Window glow pulse (2 windows, intensity oscillates phase)
 *   3. Shutters wind sway (lekka rotacja oscillating)
 *   4. Door subtle creak (random sway co ~15s)
 *   5. Roof bird occasional flutter (sparrow na ridge)
 *
 * CONTAINER STACK:
 *   -86: aoContainer
 *   -85: groundContainer (dirt path, flowers around)
 *   y+h: staticContainer
 *   y+h: animatedContainer
 *   y+h+2: particleContainer (smoke)
 */

// ─── Color palettes (3 variants) ───
export type CottagePalette = {
    wall: number;
    wallDeep: number;
    wallLight: number;
    wallSeam: number;
    shutter: number;
    shutterDeep: number;
    shutterLight: number;
    door: number;
    doorDeep: number;
    doorLight: number;
    roofTop: number;
    roofBot: number;
    roofLight: number;
    roofHighlight: number;
    roofRidge: number;
    chimney: number;
    chimneyTop: number;
};

export const PALETTE_TEAL: CottagePalette = {
    wall:           0x4a8a7c,
    wallDeep:       0x2d544c,
    wallLight:      0x6dab9d,
    wallSeam:       0x1d3a32,
    shutter:        0xc04c2a,
    shutterDeep:    0x7a2814,
    shutterLight:   0xe06a40,
    door:           0x6e4423,
    doorDeep:       0x3e2510,
    doorLight:      0x9c6a40,
    roofTop:        0x5a4326,
    roofBot:        0x2e2010,
    roofLight:      0x7e5e3c,
    roofHighlight:  0xb38556,
    roofRidge:      0x2a1a0a,
    chimney:        0x6b6058,
    chimneyTop:     0x453b34,
};

export const PALETTE_YELLOW: CottagePalette = {
    wall:           0xe6c460,
    wallDeep:       0xb89540,
    wallLight:      0xf5dd84,
    wallSeam:       0x7a6020,
    shutter:        0x4a8a7c,
    shutterDeep:    0x2d544c,
    shutterLight:   0x6dab9d,
    door:           0x6e4423,
    doorDeep:       0x3e2510,
    doorLight:      0x9c6a40,
    roofTop:        0x8a5a3a,
    roofBot:        0x4a2818,
    roofLight:      0xb38556,
    roofHighlight:  0xd9a878,
    roofRidge:      0x3a1a0a,
    chimney:        0x6b6058,
    chimneyTop:     0x453b34,
};

export const PALETTE_PINK: CottagePalette = {
    wall:           0xd97a96,
    wallDeep:       0xa84a62,
    wallLight:      0xf0a8b9,
    wallSeam:       0x6a2030,
    shutter:        0x5a4a8a,
    shutterDeep:    0x342850,
    shutterLight:   0x7d6dab,
    door:           0x6e4423,
    doorDeep:       0x3e2510,
    doorLight:      0x9c6a40,
    roofTop:        0x6a4326,
    roofBot:        0x3a2010,
    roofLight:      0x8e5e3c,
    roofHighlight:  0xc38566,
    roofRidge:      0x2a1a0a,
    chimney:        0x6b6058,
    chimneyTop:     0x453b34,
};

// ─── Shared colors ───
const SHARED = {
    aoShadow:       0x000000,
    foundation:     0x6b6058,
    foundationLight: 0x8c8279,
    foundationShadow: 0x453b34,
    foundationStone: 0x5a504a,
    fascia:         0x3a1c0c,
    fasciaOutline:  0x140803,
    windowGlow:     0xfff4c0,
    windowGlowOut:  0xffd070,
    windowFrame:    0xf0e6c9,
    windowHole:     0x0a0501,
    chimneySmoke:   0xefefef,
    chimneySmokeDk: 0xc0bfbf,
    sparrowBody:    0x7a5a3a,
    sparrowBodyLt:  0x9c7a50,
    sparrowBeak:    0xd9a040,
    sparrowEye:     0x1a1a1a,
    nailRust:       0x6b3818,
    nailRustLt:     0xc7794a,
    rustAccent:     0xa05a2a,
    grassDirtPatch: 0x6e5a3a,
    flowerPink:     0xf0a8b9,
    flowerYellow:   0xe6c460,
    flowerRed:      0xc04030,
    leafGreen:      0x4a7a3a,
    leafGreenLt:    0x6e9c50,
    fencePost:      0x6e4423,
    pathStone:      0x8c8279,
    cobble:         0x6b6058,
} as const;

// Layout constants
const ISO_RISE = 16;
const RIGHT_DEPTH = 24;
const FOUNDATION_H = 8;
const PORCH_H = 20;       // front porch overhang depth
const PORCH_POST_W = 8;
const FRONT_DOOR_W = 26;
const FRONT_DOOR_H = 50;
const WINDOW_SIZE = 22;  // FIX v0.33.1: 18 → 22 (+25%)
const SHUTTER_W = 6;
const CHIMNEY_W = 12;
const CHIMNEY_H = 14;  // FIX v0.33.1: skrócone z 28 do 14 (połowa)

export class CountryHouse implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private palette: CottagePalette;
    private aoContainer: PIXI.Container;
    private groundContainer: PIXI.Container;
    private staticContainer: PIXI.Container;
    private animatedContainer: PIXI.Container;
    private particleContainer: PIXI.Container;
    private worldContainer: PIXI.Container;

    // Animation state
    private elapsed = 0;
    private smokeTimer = 0;
    private smokePuffs: Array<{ g: PIXI.Graphics, age: number, vx: number, vy: number, size: number }> = [];

    // Animated refs
    private windowGlowL: PIXI.Graphics | null = null;
    private windowGlowR: PIXI.Graphics | null = null;
    private shutterLContainer: PIXI.Container | null = null;
    private shutterRContainer: PIXI.Container | null = null;
    private shutterLContainer2: PIXI.Container | null = null;
    private shutterRContainer2: PIXI.Container | null = null;
    private doorContainer: PIXI.Container | null = null;
    private sparrowContainer: PIXI.Container | null = null;
    private chimneyTopPos: { x: number, y: number } = { x: 0, y: 0 };

    constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        seed: number,
        palette: CottagePalette,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.palette = palette;
        this.worldContainer = worldContainer;

        const rng = makeRng(seed);

        // Containers
        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;
        worldContainer.addChild(this.aoContainer);

        this.groundContainer = new PIXI.Container();
        this.groundContainer.zIndex = -85;
        worldContainer.addChild(this.groundContainer);

        this.staticContainer = new PIXI.Container();
        this.staticContainer.zIndex = Math.floor(y + h);
        worldContainer.addChild(this.staticContainer);

        this.animatedContainer = new PIXI.Container();
        this.animatedContainer.zIndex = Math.floor(y + h);
        worldContainer.addChild(this.animatedContainer);

        this.particleContainer = new PIXI.Container();
        this.particleContainer.zIndex = Math.floor(y + h) + 2;
        worldContainer.addChild(this.particleContainer);

        // Render
        this.drawAO();
        this.drawGround(rng);
        this.drawStaticParts(rng);
        this.drawAnimatedParts(rng);
    }

    // ═══════════════════════════════════════════════════════════
    // 1) DROP SHADOW — copied z BarnBuilding.drawAO (Mariusz: "skopiuj cień ze stodoły")
    // 2 SE polygon trapezy (outermost haze + mid shadow). Bez ellipses, bez parallelogram.
    // Scaled do cottage size (160x140 vs barn 260x220 ~62%).
    // ═══════════════════════════════════════════════════════════
    private drawAO(): void {
        const g = new PIXI.Graphics();
        const { x, y, w, h } = this;

        // Outermost ambient haze (extended SE)
        g.beginFill(SHARED.aoShadow, 0.10);
        g.moveTo(x - 8, y + h * 0.55);
        g.lineTo(x + w + 44, y + h * 0.55);
        g.lineTo(x + w + 54, y + h + 28);
        g.lineTo(x - 8, y + h + 28);
        g.closePath();
        g.endFill();

        // Mid shadow (closer to footprint)
        g.beginFill(SHARED.aoShadow, 0.18);
        g.moveTo(x - 3, y + h * 0.72);
        g.lineTo(x + w + 26, y + h * 0.72);
        g.lineTo(x + w + 34, y + h + 18);
        g.lineTo(x - 3, y + h + 18);
        g.closePath();
        g.endFill();

        this.aoContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 2) GROUND DETAILS — flowers, path stones, dirt patches
    // ═══════════════════════════════════════════════════════════
    private drawGround(rng: () => number): void {
        const { x, y, w, h } = this;
        const groundY = y + h;
        const g = new PIXI.Graphics();

        // FIX v0.33.5: usunięte dirt patches (wyglądały jak fake shadow)
        // Cień teraz tylko z drawAO (Barn-style 2 SE polygon trapezy)

        // Path stones from front door towards road (subtle, małe kamienie)
        const pathCx = x + w * 0.5;
        for (let i = 0; i < 4; i++) {
            const px = pathCx + (rng() - 0.5) * 8;
            const py = groundY + 14 + i * 6;
            g.beginFill(SHARED.pathStone, 0.7);
            g.drawCircle(px, py, 2.5 + rng() * 0.8);
            g.endFill();
            g.beginFill(SHARED.cobble, 0.5);
            g.drawCircle(px - 0.5, py - 0.3, 1.4);
            g.endFill();
        }

        // Flowers around perimeter (8 small clusters)
        const flowerColors = [SHARED.flowerPink, SHARED.flowerYellow, SHARED.flowerRed];
        for (let i = 0; i < 8; i++) {
            const side = Math.floor(rng() * 4);
            let fx = x, fy = y;
            if (side === 0) { // S
                fx = x + rng() * w;
                fy = groundY + 4 + rng() * 6;
            } else if (side === 1) { // E
                fx = x + w + 2 + rng() * 6;
                fy = y + 20 + rng() * (h - 30);
            } else if (side === 2) { // W
                fx = x - 2 - rng() * 6;
                fy = y + 20 + rng() * (h - 30);
            } else { // N
                fx = x + rng() * w;
                fy = y - 4 - rng() * 4;
            }
            // Leaf base
            g.beginFill(SHARED.leafGreen, 0.85);
            g.drawEllipse(fx, fy, 3, 1.5);
            g.endFill();
            g.beginFill(SHARED.leafGreenLt, 0.7);
            g.drawCircle(fx - 1.5, fy - 0.5, 0.8);
            g.drawCircle(fx + 1.5, fy - 0.5, 0.8);
            g.endFill();
            // Flower petals (3 small)
            const fColor = flowerColors[Math.floor(rng() * flowerColors.length)];
            g.beginFill(fColor, 0.95);
            g.drawCircle(fx, fy - 1, 1.4);
            g.drawCircle(fx - 1, fy, 1.2);
            g.drawCircle(fx + 1, fy, 1.2);
            g.endFill();
            // Flower center
            g.beginFill(0xfff4c0, 1);
            g.drawCircle(fx, fy - 0.3, 0.5);
            g.endFill();
        }

        // Trodden grass marks (small dots)
        for (let i = 0; i < 5; i++) {
            const gx = x + w * 0.3 + rng() * w * 0.4;
            const gy = groundY + 20 + rng() * 10;
            g.beginFill(SHARED.grassDirtPatch, 0.4);
            g.drawCircle(gx, gy, 1.5 + rng());
            g.endFill();
        }

        this.groundContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 3) STATIC PARTS — foundation, walls, roof, chimney, porch
    // ═══════════════════════════════════════════════════════════
    private drawStaticParts(rng: () => number): void {
        const { x, y, w, h } = this;
        const p = this.palette;
        const wallY = y + 22;
        const foundY = y + h - FOUNDATION_H - PORCH_H;
        const porchFloorY = y + h - FOUNDATION_H;
        const groundY = y + h;

        // FIX v0.33.3: ganek + fence usunięte (Mariusz feedback)
        // Zamiast tego: main wall extending do porchFloorY (full facade) + mały schodek przy drzwiach + 2 doniczki z kwiatami
        this.drawFoundation(rng, foundY, groundY);
        this.drawMainWall(rng, wallY, porchFloorY);              // FIX: extend do porchFloorY (full facade)
        this.drawLeftSideWall(wallY, porchFloorY);
        this.drawRightSideStrip(wallY, porchFloorY);
        this.drawRightSideParallelogram(wallY, porchFloorY);     // FIX: bottom do porchFloorY (no luka)
        this.drawFrontFacade(rng, wallY, foundY);                // Drzwi+okna na full wall
        this.drawDoorStep(porchFloorY);                          // NEW: mały drewniany schodek pod drzwiami
        this.drawFlowerPots(rng, porchFloorY);                   // NEW: 2 doniczki z kwiatami po bokach schodka
        this.drawChimney(wallY);
        this.drawRoof(wallY);
        this.drawFrontOutline(wallY, foundY, porchFloorY);
    }

    private drawFoundation(rng: () => number, foundY: number, groundY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();

        // Foundation strip — entire bottom z porch
        // Note: foundY = top of main building foundation (above porch)
        // porchFloorY = top of porch floor = groundY - FOUNDATION_H
        // Foundation actually spans porchFloorY to groundY (below porch)
        const porchFloorY = groundY - FOUNDATION_H;

        const points: Pt[] = [
            { x: x - 2, y: porchFloorY },
            { x: x + w + 2, y: porchFloorY },
            { x: x + w + 2, y: groundY },
            { x: x - 2, y: groundY },
        ];
        fillGradientPolygon(g, points, SHARED.foundationLight, SHARED.foundationShadow);

        // Top edge highlight
        g.beginFill(SHARED.foundationLight, 0.9);
        g.drawRect(x - 2, porchFloorY, w + 4, 1.2);
        g.endFill();

        // 5 stones
        for (let i = 0; i < 5; i++) {
            const sx = x + 4 + rng() * (w - 8);
            const sy = porchFloorY + 1.5 + rng() * (FOUNDATION_H - 3);
            const sr = 1.2 + rng() * 1.4;
            const dark = rng() > 0.5;
            g.beginFill(dark ? SHARED.foundationShadow : SHARED.foundationStone, 0.85);
            g.drawCircle(sx, sy, sr);
            g.endFill();
            g.beginFill(SHARED.foundationLight, 0.6);
            g.drawCircle(sx - 0.2, sy - 0.3, sr * 0.4);
            g.endFill();
        }

        // 2 cracks
        for (let i = 0; i < 2; i++) {
            const cx = x + 8 + rng() * (w - 16);
            const cy = porchFloorY + 2 + rng() * (FOUNDATION_H - 4);
            g.lineStyle(0.5, SHARED.foundationShadow, 0.7);
            g.moveTo(cx, cy);
            g.lineTo(cx + (rng() - 0.5) * 4, cy + 1.5 + rng() * 2);
            g.lineStyle(0);
        }

        // Outline
        g.lineStyle(0.9, SHARED.foundationShadow, 0.9);
        g.drawRect(x - 2, porchFloorY, w + 4, FOUNDATION_H);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawMainWall(rng: () => number, wallY: number, foundY: number): void {
        // Main wall = obszar back portion of facade — od wallY do foundY (top wall area)
        // Front facade z drzwi/oknami będzie drawn osobno PRZED tym
        // Ten metod rysuje samo back wall (visible przez gable + side walls)
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();
        const wallH = foundY - wallY;

        // Wall (full width gradient z palette)
        const points: Pt[] = [
            { x, y: wallY },
            { x: x + w, y: wallY },
            { x: x + w, y: foundY },
            { x, y: foundY },
        ];
        fillGradientPolygon(g, points, p.wallLight, p.wallDeep);

        // Plank seams (6 vertical)
        for (let i = 1; i < 6; i++) {
            const px = x + (w * i) / 6;
            const jitter = (rng() - 0.5) * 0.8;
            g.lineStyle(0.9, p.wallSeam, 0.8);
            g.moveTo(px + jitter, wallY);
            g.lineTo(px + jitter, foundY);
            g.lineStyle(0);
            // Nails
            this.drawNail(g, px + jitter, wallY + 3);
            this.drawNail(g, px + jitter, foundY - 3);
        }

        // Knots (2)
        for (let i = 0; i < 2; i++) {
            const dx = x + 8 + rng() * (w - 16);
            const dy = wallY + 6 + rng() * (wallH - 12);
            const dr = 1 + rng() * 1.4;
            g.beginFill(p.wallDeep, 0.85);
            g.drawEllipse(dx, dy, dr * 1.2, dr * 0.8);
            g.endFill();
        }

        // Top edge highlight
        g.beginFill(p.wallLight, 0.6);
        g.drawRect(x, wallY, w, 1.5);
        g.endFill();
        // Outline
        g.lineStyle(1, p.wallDeep, 0.9);
        g.drawRect(x, wallY, w, wallH);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawLeftSideWall(wallY: number, foundY: number): void {
        const { x } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();
        const sideW = 4;
        const points: Pt[] = [
            { x, y: wallY },
            { x: x + sideW, y: wallY },
            { x: x + sideW, y: foundY },
            { x, y: foundY },
        ];
        fillGradientPolygon(g, points, p.wallDeep, p.wallLight);
        g.lineStyle(0.8, p.wallDeep, 0.9);
        g.drawRect(x, wallY, sideW, foundY - wallY);
        g.lineStyle(0);
        this.staticContainer.addChild(g);
    }

    // FIX v0.33.1: Right side narrow strip (4px) — zakrywa porch row gap E side
    private drawRightSideStrip(wallY: number, bottomY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();
        const sideW = 4;
        const points: Pt[] = [
            { x: x + w - sideW, y: wallY },
            { x: x + w, y: wallY },
            { x: x + w, y: bottomY },
            { x: x + w - sideW, y: bottomY },
        ];
        fillGradientPolygon(g, points, p.wallLight, p.wallDeep);
        g.lineStyle(0.8, p.wallDeep, 0.9);
        g.drawRect(x + w - sideW, wallY, sideW, bottomY - wallY);
        g.lineStyle(0);
        this.staticContainer.addChild(g);
    }

    // FIX v0.33.1: Chunky front outline (brawl-stars style) — solid 3px obrys
    private drawFrontOutline(wallY: number, _foundY: number, porchFloorY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();
        // Front facade outline (od wallY do porchFloorY, full width)
        g.lineStyle(3, p.wallDeep, 0.95);
        g.moveTo(x, wallY);
        g.lineTo(x + w, wallY);
        g.lineTo(x + w, porchFloorY);
        g.lineTo(x, porchFloorY);
        g.lineTo(x, wallY);
        g.lineStyle(0);
        this.staticContainer.addChild(g);
    }

    // FIX v0.33.3: Mały drewniany schodek pod drzwiami (zamiast pełnego ganku)
    private drawDoorStep(porchFloorY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();

        const stepW = 38;
        const stepH = 5;
        const stepX = x + w * 0.5 - stepW / 2;
        const stepY = porchFloorY - 1;  // top of step just below porch floor level

        // Step body (drewniany gradient)
        const points: Pt[] = [
            { x: stepX, y: stepY },
            { x: stepX + stepW, y: stepY },
            { x: stepX + stepW, y: stepY + stepH },
            { x: stepX, y: stepY + stepH },
        ];
        fillGradientPolygon(g, points, p.doorLight, p.doorDeep);

        // Top edge highlight
        g.beginFill(p.doorLight, 0.7);
        g.drawRect(stepX, stepY, stepW, 1);
        g.endFill();

        // Front shadow strip
        g.beginFill(p.doorDeep, 0.5);
        g.drawRect(stepX, stepY + stepH - 1.2, stepW, 1.2);
        g.endFill();

        // 2 plank seams (vertical)
        for (let i = 1; i < 3; i++) {
            const sx = stepX + (stepW * i) / 3;
            g.lineStyle(0.6, p.doorDeep, 0.75);
            g.moveTo(sx, stepY + 0.5);
            g.lineTo(sx, stepY + stepH - 0.5);
            g.lineStyle(0);
        }

        // Outline
        g.lineStyle(0.9, p.doorDeep, 0.9);
        g.drawRect(stepX, stepY, stepW, stepH);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    // FIX v0.33.3: 2 doniczki z kwiatami po bokach drzwi (Caribbean cottage style)
    private drawFlowerPots(rng: () => number, porchFloorY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();

        const potW = 16;
        const potH = 14;
        const doorCx = x + w * 0.5;

        // 2 doniczki: lewa + prawa od schodka
        const positions = [
            { cx: doorCx - 36, flowerColors: [SHARED.flowerRed, SHARED.flowerYellow, SHARED.flowerRed] },
            { cx: doorCx + 36, flowerColors: [SHARED.flowerPink, SHARED.flowerYellow, SHARED.flowerPink] },
        ];

        for (const pos of positions) {
            const potX = pos.cx - potW / 2;
            const potTopY = porchFloorY - potH * 0.45;  // doniczka stoi częściowo na foundation
            const potBotY = potTopY + potH;

            // Doniczka body (terra cotta trapezoid - wider top)
            const potPoints: Pt[] = [
                { x: potX - 1.5, y: potTopY },
                { x: potX + potW + 1.5, y: potTopY },
                { x: potX + potW - 1, y: potBotY },
                { x: potX + 1, y: potBotY },
            ];
            fillGradientPolygon(g, potPoints, SHARED.rustAccent, 0x5a2818);

            // Pot rim (darker top edge band)
            g.beginFill(0x4a2410, 1);
            g.drawRect(potX - 1.5, potTopY, potW + 3, 2);
            g.endFill();
            g.beginFill(SHARED.nailRustLt, 0.55);
            g.drawRect(potX - 1.5, potTopY, potW + 3, 0.7);
            g.endFill();

            // Pot outline
            g.lineStyle(0.8, 0x2a1408, 0.9);
            g.moveTo(potX - 1.5, potTopY);
            g.lineTo(potX + potW + 1.5, potTopY);
            g.lineTo(potX + potW - 1, potBotY);
            g.lineTo(potX + 1, potBotY);
            g.closePath();
            g.lineStyle(0);

            // ── ROŚLINY w doniczce ──
            // Soil (dark top)
            g.beginFill(0x2a1810, 0.85);
            g.drawEllipse(pos.cx, potTopY + 1, potW / 2 - 0.5, 1.2);
            g.endFill();

            // Leaves base (3-4 zielone listki różnych odcieni)
            const leafCx = pos.cx;
            const leafBaseY = potTopY - 1;
            // Center tall leaf
            g.beginFill(SHARED.leafGreen, 1);
            g.moveTo(leafCx, leafBaseY);
            g.bezierCurveTo(leafCx - 3, leafBaseY - 4, leafCx - 4, leafBaseY - 8, leafCx, leafBaseY - 11);
            g.bezierCurveTo(leafCx + 4, leafBaseY - 8, leafCx + 3, leafBaseY - 4, leafCx, leafBaseY);
            g.closePath();
            g.endFill();
            g.beginFill(SHARED.leafGreenLt, 0.6);
            g.drawEllipse(leafCx, leafBaseY - 6, 2, 4);
            g.endFill();

            // Side leaves (2 mniejsze)
            for (let s = -1; s <= 1; s += 2) {
                const slx = leafCx + s * 4;
                const sly = leafBaseY - 2;
                g.beginFill(SHARED.leafGreen, 0.95);
                g.moveTo(slx, sly);
                g.bezierCurveTo(slx + s * 4, sly - 3, slx + s * 5, sly - 6, slx + s * 3, sly - 7);
                g.bezierCurveTo(slx - s * 1, sly - 5, slx + s * 1, sly - 2, slx, sly);
                g.closePath();
                g.endFill();
                g.beginFill(SHARED.leafGreenLt, 0.5);
                g.drawEllipse(slx + s * 2.5, sly - 4, 1.5, 2.5);
                g.endFill();
            }

            // Kwiaty (3 kolorowe na top of leaves)
            const flowerPositions = [
                { fx: leafCx, fy: leafBaseY - 11 },
                { fx: leafCx - 5, fy: leafBaseY - 7 },
                { fx: leafCx + 5, fy: leafBaseY - 8 },
            ];
            flowerPositions.forEach((fp, idx) => {
                const color = pos.flowerColors[idx];
                // Petals (3 small circles)
                g.beginFill(color, 1);
                g.drawCircle(fp.fx, fp.fy - 1, 1.6);
                g.drawCircle(fp.fx - 1.3, fp.fy + 0.5, 1.4);
                g.drawCircle(fp.fx + 1.3, fp.fy + 0.5, 1.4);
                g.drawCircle(fp.fx, fp.fy + 1.5, 1.4);
                g.endFill();
                // Center
                g.beginFill(0xfff4c0, 1);
                g.drawCircle(fp.fx, fp.fy, 0.7);
                g.endFill();
            });
        }

        this.staticContainer.addChild(g);
    }

    private drawRightSideParallelogram(wallY: number, bottomY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();

        // Parallelogram side (3D depth) — extending od wallY do bottomY (porchFloorY w v0.33.3)
        const topL = { x: x + w, y: wallY };
        const topR = { x: x + w + RIGHT_DEPTH, y: wallY - ISO_RISE };
        const botR = { x: x + w + RIGHT_DEPTH, y: bottomY - ISO_RISE };
        const botL = { x: x + w, y: bottomY };
        fillGradientPolygon(g, [topL, topR, botR, botL], p.wallLight, p.wallDeep);

        // Plank seams (2 diagonals)
        for (let i = 1; i < 3; i++) {
            const t = i / 3;
            const sx = topL.x + (topR.x - topL.x) * t;
            const sy = topL.y + (topR.y - topL.y) * t;
            const ex = botL.x + (botR.x - botL.x) * t;
            const ey = botL.y + (botR.y - botL.y) * t;
            g.lineStyle(0.7, p.wallSeam, 0.75);
            g.moveTo(sx, sy);
            g.lineTo(ex, ey);
            g.lineStyle(0);
        }

        // Foundation continuation (small ISO foundation strip extends E by RIGHT_DEPTH)
        const fStickPoints: Pt[] = [
            { x: x + w, y: bottomY },
            { x: x + w + RIGHT_DEPTH, y: bottomY - ISO_RISE },
            { x: x + w + RIGHT_DEPTH, y: bottomY - ISO_RISE + FOUNDATION_H },
            { x: x + w, y: bottomY + FOUNDATION_H },
        ];
        fillGradientPolygon(g, fStickPoints, SHARED.foundationLight, SHARED.foundationShadow);

        g.lineStyle(1, p.wallDeep, 0.9);
        g.moveTo(topL.x, topL.y);
        g.lineTo(topR.x, topR.y);
        g.lineTo(botR.x, botR.y);
        g.lineTo(botL.x, botL.y);
        g.closePath();
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawFrontFacade(rng: () => number, wallY: number, foundY: number): void {
        const { x, y, w, h } = this;
        const porchFloorY = y + h - FOUNDATION_H;
        // FIX v0.33.1: drzwi siedzą na porch floor (bottom = porchFloorY, nie foundY)
        // Wcześniej drzwi "wisiały w powietrzu" nad porch row
        const doorX = x + w * 0.5 - FRONT_DOOR_W / 2;
        const doorY = porchFloorY - FRONT_DOOR_H;
        this.drawDoor(doorX, doorY);

        // FIX v0.33.2: WINDOWS — niżej (winY z wallY+16 do wallY+28)
        const winY = wallY + 28;
        const winLeftX = x + w * 0.16;
        const winRightX = x + w * 0.71;
        this.drawWindow(winLeftX, winY, true);
        this.drawWindow(winRightX, winY, false);
    }

    private drawDoor(dx: number, dy: number): void {
        const p = this.palette;
        // Door container (subtle creak animation)
        this.doorContainer = new PIXI.Container();
        this.doorContainer.x = dx + FRONT_DOOR_W * 0.5;
        this.doorContainer.y = dy;
        this.staticContainer.addChild(this.doorContainer);

        const g = new PIXI.Graphics();

        // Door frame (slightly larger background)
        g.beginFill(p.doorDeep, 1);
        g.drawRect(-FRONT_DOOR_W * 0.55, -1, FRONT_DOOR_W * 1.1, FRONT_DOOR_H + 2);
        g.endFill();

        // Door body
        const points: Pt[] = [
            { x: -FRONT_DOOR_W * 0.5, y: 0 },
            { x: FRONT_DOOR_W * 0.5, y: 0 },
            { x: FRONT_DOOR_W * 0.5, y: FRONT_DOOR_H },
            { x: -FRONT_DOOR_W * 0.5, y: FRONT_DOOR_H },
        ];
        fillGradientPolygon(g, points, p.doorLight, p.doorDeep);

        // Vertical planks (3)
        for (let i = 1; i < 3; i++) {
            const sx = -FRONT_DOOR_W * 0.5 + (FRONT_DOOR_W * i) / 3;
            g.lineStyle(0.8, p.doorDeep, 0.85);
            g.moveTo(sx, 2);
            g.lineTo(sx, FRONT_DOOR_H - 2);
            g.lineStyle(0);
        }

        // Door window (top, mała szybka with cross divider)
        const dwSize = 10;
        const dwY = 6;
        g.beginFill(SHARED.windowGlow, 0.85);
        g.drawRect(-dwSize / 2, dwY, dwSize, dwSize);
        g.endFill();
        g.beginFill(SHARED.windowGlowOut, 0.55);
        g.drawCircle(0, dwY + dwSize / 2, 3);
        g.endFill();
        // Window frame
        g.lineStyle(1.2, SHARED.windowFrame, 1);
        g.drawRect(-dwSize / 2, dwY, dwSize, dwSize);
        // Cross divider
        g.moveTo(0, dwY);
        g.lineTo(0, dwY + dwSize);
        g.moveTo(-dwSize / 2, dwY + dwSize / 2);
        g.lineTo(dwSize / 2, dwY + dwSize / 2);
        g.lineStyle(0);

        // Horizontal cross-brace (decorative)
        g.beginFill(p.doorDeep, 0.85);
        g.drawRect(-FRONT_DOOR_W * 0.5, FRONT_DOOR_H * 0.6, FRONT_DOOR_W, 3);
        g.endFill();

        // Door handle (round, brass)
        g.beginFill(SHARED.rustAccent, 1);
        g.drawCircle(FRONT_DOOR_W * 0.32, FRONT_DOOR_H * 0.55, 1.5);
        g.endFill();
        g.beginFill(SHARED.nailRustLt, 0.7);
        g.drawCircle(FRONT_DOOR_W * 0.32 - 0.3, FRONT_DOOR_H * 0.55 - 0.3, 0.5);
        g.endFill();

        // Door hinges (left side, 2 rust strips)
        for (let i = 0; i < 2; i++) {
            const hy = i === 0 ? 5 : FRONT_DOOR_H - 8;
            g.beginFill(SHARED.nailRust, 1);
            g.drawRect(-FRONT_DOOR_W * 0.5, hy, 5, 3);
            g.endFill();
            g.beginFill(SHARED.nailRustLt, 0.6);
            g.drawRect(-FRONT_DOOR_W * 0.5, hy, 5, 1);
            g.endFill();
        }

        // Door outline
        g.lineStyle(1, p.doorDeep, 0.95);
        g.drawRect(-FRONT_DOOR_W * 0.5, 0, FRONT_DOOR_W, FRONT_DOOR_H);
        g.lineStyle(0);

        // Highlight on left side (sunlit edge)
        g.beginFill(p.doorLight, 0.4);
        g.drawRect(-FRONT_DOOR_W * 0.5 + 0.5, 1, 1.5, FRONT_DOOR_H - 2);
        g.endFill();

        // FIX v0.33.1: Step usunięty (Mariusz: "po co drewniana deska?")
        // Drzwi teraz siedzą bezpośrednio na porch wood floor

        this.doorContainer.addChild(g);
    }

    private drawWindow(wx: number, wy: number, isLeft: boolean): void {
        const p = this.palette;
        const g = new PIXI.Graphics();

        // Window hole (recessed dark background)
        g.beginFill(SHARED.windowHole, 1);
        g.drawRect(wx, wy, WINDOW_SIZE, WINDOW_SIZE);
        g.endFill();

        // Window glow (warm interior light) — separate graphics dla animation
        const glowG = new PIXI.Graphics();
        glowG.beginFill(SHARED.windowGlow, 0.92);
        glowG.drawRect(wx + 1, wy + 1, WINDOW_SIZE - 2, WINDOW_SIZE - 2);
        glowG.endFill();
        glowG.beginFill(SHARED.windowGlowOut, 0.7);
        glowG.drawCircle(wx + WINDOW_SIZE / 2, wy + WINDOW_SIZE / 2, WINDOW_SIZE * 0.4);
        glowG.endFill();
        // Glow halo (subtle outside)
        glowG.beginFill(SHARED.windowGlow, 0.12);
        glowG.drawCircle(wx + WINDOW_SIZE / 2, wy + WINDOW_SIZE / 2, WINDOW_SIZE * 0.9);
        glowG.endFill();
        if (isLeft) this.windowGlowL = glowG;
        else this.windowGlowR = glowG;
        this.animatedContainer.addChild(glowG);

        // Window frame (cream color)
        g.lineStyle(2, SHARED.windowFrame, 1);
        g.drawRect(wx, wy, WINDOW_SIZE, WINDOW_SIZE);
        // Cross divider
        g.moveTo(wx + WINDOW_SIZE / 2, wy);
        g.lineTo(wx + WINDOW_SIZE / 2, wy + WINDOW_SIZE);
        g.moveTo(wx, wy + WINDOW_SIZE / 2);
        g.lineTo(wx + WINDOW_SIZE, wy + WINDOW_SIZE / 2);
        g.lineStyle(0);

        // Frame outer rim (rust accent below)
        g.beginFill(SHARED.rustAccent, 0.85);
        g.drawRect(wx - 1, wy + WINDOW_SIZE, WINDOW_SIZE + 2, 1.5);
        g.endFill();

        // Windowsill (sticking out below)
        g.beginFill(p.wallDeep, 1);
        g.drawRect(wx - 2, wy + WINDOW_SIZE + 1.5, WINDOW_SIZE + 4, 2.5);
        g.endFill();
        g.beginFill(p.wallLight, 0.5);
        g.drawRect(wx - 2, wy + WINDOW_SIZE + 1.5, WINDOW_SIZE + 4, 0.8);
        g.endFill();

        this.staticContainer.addChild(g);

        // ── SHUTTERS — separate containers for wind sway animation ──
        // Left shutter
        const shutLContainer = new PIXI.Container();
        shutLContainer.x = wx - SHUTTER_W * 0.5;
        shutLContainer.y = wy + WINDOW_SIZE / 2;
        this.staticContainer.addChild(shutLContainer);
        const shutLG = new PIXI.Graphics();
        const shutPoints: Pt[] = [
            { x: -SHUTTER_W * 0.5, y: -WINDOW_SIZE / 2 },
            { x: SHUTTER_W * 0.5, y: -WINDOW_SIZE / 2 },
            { x: SHUTTER_W * 0.5, y: WINDOW_SIZE / 2 },
            { x: -SHUTTER_W * 0.5, y: WINDOW_SIZE / 2 },
        ];
        fillGradientPolygon(shutLG, shutPoints, p.shutterLight, p.shutterDeep);
        // Vertical slats (3)
        for (let i = 0; i < 3; i++) {
            const sy = -WINDOW_SIZE / 2 + (WINDOW_SIZE * (i + 0.5)) / 3;
            shutLG.lineStyle(0.5, p.shutterDeep, 0.85);
            shutLG.moveTo(-SHUTTER_W * 0.5, sy);
            shutLG.lineTo(SHUTTER_W * 0.5, sy);
            shutLG.lineStyle(0);
        }
        shutLG.lineStyle(0.8, p.shutterDeep, 0.95);
        shutLG.drawRect(-SHUTTER_W * 0.5, -WINDOW_SIZE / 2, SHUTTER_W, WINDOW_SIZE);
        shutLG.lineStyle(0);
        shutLContainer.addChild(shutLG);

        // Right shutter
        const shutRContainer = new PIXI.Container();
        shutRContainer.x = wx + WINDOW_SIZE + SHUTTER_W * 0.5;
        shutRContainer.y = wy + WINDOW_SIZE / 2;
        this.staticContainer.addChild(shutRContainer);
        const shutRG = new PIXI.Graphics();
        fillGradientPolygon(shutRG, shutPoints, p.shutterLight, p.shutterDeep);
        for (let i = 0; i < 3; i++) {
            const sy = -WINDOW_SIZE / 2 + (WINDOW_SIZE * (i + 0.5)) / 3;
            shutRG.lineStyle(0.5, p.shutterDeep, 0.85);
            shutRG.moveTo(-SHUTTER_W * 0.5, sy);
            shutRG.lineTo(SHUTTER_W * 0.5, sy);
            shutRG.lineStyle(0);
        }
        shutRG.lineStyle(0.8, p.shutterDeep, 0.95);
        shutRG.drawRect(-SHUTTER_W * 0.5, -WINDOW_SIZE / 2, SHUTTER_W, WINDOW_SIZE);
        shutRG.lineStyle(0);
        shutRContainer.addChild(shutRG);

        // Store refs for animation
        if (isLeft) {
            this.shutterLContainer = shutLContainer;
            this.shutterRContainer = shutRContainer;
        } else {
            this.shutterLContainer2 = shutLContainer;
            this.shutterRContainer2 = shutRContainer;
        }
    }

    private drawPorch(foundY: number, porchFloorY: number, _groundY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();

        // Porch overhang (mały daszek nad porch) — drawn from main wall y forwards
        // Visual hint of porch roof (subtle line + shadow)
        g.beginFill(p.wallDeep, 0.55);
        g.drawRect(x + 4, foundY - 2, w - 8, 2);
        g.endFill();
        g.beginFill(p.wallLight, 0.5);
        g.drawRect(x + 4, foundY - 2, w - 8, 0.5);
        g.endFill();

        // Porch floor — wooden planks
        const porchPoints: Pt[] = [
            { x: x + 4, y: foundY },
            { x: x + w - 4, y: foundY },
            { x: x + w - 4, y: porchFloorY },
            { x: x + 4, y: porchFloorY },
        ];
        fillGradientPolygon(g, porchPoints, p.door, p.doorDeep);

        // Horizontal plank seams (2)
        for (let i = 1; i < 3; i++) {
            const sy = foundY + (PORCH_H * i) / 3;
            g.lineStyle(0.7, p.doorDeep, 0.8);
            g.moveTo(x + 4, sy);
            g.lineTo(x + w - 4, sy);
            g.lineStyle(0);
        }

        // Porch posts (2 corners, supporting daszek)
        const postPositions = [x + 6, x + w - 6 - PORCH_POST_W];
        for (const px of postPositions) {
            // Post body
            g.beginFill(p.doorLight, 1);
            g.drawRect(px, foundY - 2, PORCH_POST_W, PORCH_H + 2);
            g.endFill();
            g.beginFill(p.doorDeep, 0.5);
            g.drawRect(px + PORCH_POST_W - 1.5, foundY - 2, 1.5, PORCH_H + 2);
            g.endFill();
            g.beginFill(p.doorLight, 0.7);
            g.drawRect(px + 0.5, foundY - 1, 1.2, PORCH_H);
            g.endFill();
            // Post outline
            g.lineStyle(0.8, p.doorDeep, 0.9);
            g.drawRect(px, foundY - 2, PORCH_POST_W, PORCH_H + 2);
            g.lineStyle(0);

            // Decorative top cap
            g.beginFill(p.doorDeep, 1);
            g.drawRect(px - 1, foundY - 3, PORCH_POST_W + 2, 1.5);
            g.endFill();
        }

        // Porch front edge highlight
        g.beginFill(p.doorLight, 0.65);
        g.drawRect(x + 4, porchFloorY - 1, w - 8, 1);
        g.endFill();
        // Porch outline
        g.lineStyle(0.9, p.doorDeep, 0.9);
        g.drawRect(x + 4, foundY, w - 8, PORCH_H);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawPorchFence(porchFloorY: number, groundY: number): void {
        const { x, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();

        // Small decorative fence segments (extending W and E from porch edges)
        const fenceH = 10;
        const fenceY = groundY - fenceH;
        const numPosts = 3;

        // LEFT segment
        const lStartX = x - 8;
        const lWidth = 12;
        g.beginFill(p.doorLight, 1);
        g.drawRect(lStartX, fenceY, lWidth, 1.5);
        g.drawRect(lStartX, fenceY + fenceH - 2, lWidth, 1.5);
        g.endFill();
        for (let i = 0; i < numPosts; i++) {
            const px = lStartX + (lWidth * i) / (numPosts - 1) - 0.5;
            g.beginFill(p.doorDeep, 1);
            g.drawRect(px, fenceY, 1, fenceH);
            g.endFill();
        }

        // RIGHT segment
        const rStartX = x + w - 4;
        const rWidth = 12;
        g.beginFill(p.doorLight, 1);
        g.drawRect(rStartX, fenceY, rWidth, 1.5);
        g.drawRect(rStartX, fenceY + fenceH - 2, rWidth, 1.5);
        g.endFill();
        for (let i = 0; i < numPosts; i++) {
            const px = rStartX + (rWidth * i) / (numPosts - 1) - 0.5;
            g.beginFill(p.doorDeep, 1);
            g.drawRect(px, fenceY, 1, fenceH);
            g.endFill();
        }

        this.staticContainer.addChild(g);
    }

    private drawRoof(wallY: number): void {
        const { x, y, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();
        const apexY = y - 4;
        const apexX = x + w * 0.5;
        const eaveOverhang = 8;

        // Single apex (jak Cowshed T4c)
        const rFrontL: Pt = { x: x - eaveOverhang, y: wallY };
        const rFrontR: Pt = { x: x + w + eaveOverhang, y: wallY };
        const rSideBack: Pt = { x: x + w + RIGHT_DEPTH + eaveOverhang / 2, y: wallY - ISO_RISE };
        const rApex: Pt = { x: apexX, y: apexY };

        // Right slope (triangle)
        fillGradientPolygon(g, [rApex, rFrontR, rSideBack], p.roofTop, p.roofBot);
        this.drawIsoRoofTilesTriangle(g, rApex, rFrontR, rSideBack);

        // Front slope (triangle)
        fillGradientPolygon(g, [rFrontL, rFrontR, rApex], p.roofHighlight, p.roofBot);
        this.drawFrontShingles(g, rFrontL, rFrontR, rApex);

        // Ridge stub
        const ridgeEndX = rApex.x + RIGHT_DEPTH * 0.4;
        const ridgeEndY = rApex.y - ISO_RISE * 0.6;
        g.lineStyle(2.5, p.roofRidge, 1);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(ridgeEndX, ridgeEndY);
        g.lineStyle(0);
        g.lineStyle(0.9, p.roofHighlight, 0.85);
        g.moveTo(rApex.x - 1, rApex.y - 1.5);
        g.lineTo(ridgeEndX - 1, ridgeEndY - 1.5);
        g.lineStyle(0);

        // Fascia front
        const FASCIA_H = 4;
        g.beginFill(SHARED.fascia, 1);
        g.drawRect(rFrontL.x, rFrontL.y - 1, rFrontR.x - rFrontL.x, FASCIA_H);
        g.endFill();
        g.beginFill(p.roofLight, 0.4);
        g.drawRect(rFrontL.x, rFrontL.y - 1, rFrontR.x - rFrontL.x, 1);
        g.endFill();
        g.lineStyle(0.7, SHARED.fasciaOutline, 0.95);
        g.drawRect(rFrontL.x, rFrontL.y - 1, rFrontR.x - rFrontL.x, FASCIA_H);
        g.lineStyle(0);

        // Fascia side (skewed)
        g.beginFill(SHARED.fascia, 1);
        g.drawPolygon([
            rFrontR.x, rFrontR.y - 1,
            rSideBack.x, rSideBack.y - 1,
            rSideBack.x, rSideBack.y - 1 + FASCIA_H,
            rFrontR.x, rFrontR.y - 1 + FASCIA_H,
        ]);
        g.endFill();
        g.lineStyle(0.7, SHARED.fasciaOutline, 0.95);
        g.moveTo(rFrontR.x, rFrontR.y - 1 + FASCIA_H);
        g.lineTo(rSideBack.x, rSideBack.y - 1 + FASCIA_H);
        g.lineStyle(0);

        // Fascia bolts (5)
        for (let i = 0; i < 5; i++) {
            const bx = rFrontL.x + ((rFrontR.x - rFrontL.x) * (i + 0.5)) / 5;
            const by = rFrontL.y + 0.8;
            g.beginFill(SHARED.rustAccent, 1);
            g.drawCircle(bx, by, 0.8);
            g.endFill();
        }

        // Roof outline
        g.lineStyle(2, p.roofRidge, 0.95);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(rSideBack.x, rSideBack.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(0);

        // Rim light front-left (sunlit edge)
        g.lineStyle(2, p.roofHighlight, 0.85);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawFrontShingles(g: PIXI.Graphics, pL: Pt, pR: Pt, apex: Pt): void {
        const p = this.palette;
        const rows = 4;
        for (let row = 0; row < rows; row++) {
            const t1 = row / rows;
            const t2 = (row + 1) / rows;
            const leftStart: Pt = { x: pL.x + (apex.x - pL.x) * t1, y: pL.y + (apex.y - pL.y) * t1 };
            const leftEnd: Pt = { x: pL.x + (apex.x - pL.x) * t2, y: pL.y + (apex.y - pL.y) * t2 };
            const rightStart: Pt = { x: pR.x + (apex.x - pR.x) * t1, y: pR.y + (apex.y - pR.y) * t1 };
            const rightEnd: Pt = { x: pR.x + (apex.x - pR.x) * t2, y: pR.y + (apex.y - pR.y) * t2 };

            const rowWidth = rightStart.x - leftStart.x;
            const shingleW = 18;
            const numShingles = Math.max(2, Math.ceil(rowWidth / shingleW));
            const tShingle = 1.0 / numShingles;
            const tOffset = (row % 2 === 0) ? 0 : tShingle * 0.5;

            for (let s = 0; s <= numShingles; s++) {
                const ta = s * tShingle - tOffset;
                const tb = ta + tShingle;
                if (tb < 0 || ta > 1) continue;
                const tc1 = Math.max(0, ta);
                const tc2 = Math.min(1, tb);
                if (tc2 - tc1 < 0.02) continue;

                const sx1 = leftStart.x + (rightStart.x - leftStart.x) * tc1;
                const sy1 = leftStart.y + (rightStart.y - leftStart.y) * tc1;
                const sx2 = leftStart.x + (rightStart.x - leftStart.x) * tc2;
                const sy2 = leftStart.y + (rightStart.y - leftStart.y) * tc2;
                const sx1b = leftEnd.x + (rightEnd.x - leftEnd.x) * tc1;
                const sy1b = leftEnd.y + (rightEnd.y - leftEnd.y) * tc1;
                const sx2b = leftEnd.x + (rightEnd.x - leftEnd.x) * tc2;
                const sy2b = leftEnd.y + (rightEnd.y - leftEnd.y) * tc2;

                const variant = (row + s * 3) % 4;
                const color = variant === 0 ? p.roofTop :
                    variant === 1 ? p.roofBot :
                    variant === 2 ? p.roofLight :
                    p.roofHighlight;

                g.lineStyle(0.5, p.roofRidge, 0.7);
                g.beginFill(color, 1);
                g.moveTo(sx1, sy1);
                g.lineTo(sx2, sy2);
                g.lineTo(sx2b, sy2b);
                g.lineTo(sx1b, sy1b);
                g.closePath();
                g.endFill();
                g.lineStyle(0);
            }
        }

        // Sunlit highlights
        const rng = makeRng(5555);
        for (let i = 0; i < 5; i++) {
            const tu = rng();
            const tv = rng() * 0.9;
            const baseX = pL.x + (pR.x - pL.x) * tu;
            const sx = baseX + (apex.x - baseX) * tv;
            const sy = pL.y + (apex.y - pL.y) * tv;
            g.beginFill(p.roofHighlight, 0.5);
            g.drawEllipse(sx, sy, 4, 1.6);
            g.endFill();
        }
    }

    private drawIsoRoofTilesTriangle(g: PIXI.Graphics, apex: Pt, frontR: Pt, sideBack: Pt): void {
        const p = this.palette;
        const ROWS = 3;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            const lerpLeftX = frontR.x + (apex.x - frontR.x) * t;
            const lerpLeftY = frontR.y + (apex.y - frontR.y) * t;
            const lerpRightX = sideBack.x + (apex.x - sideBack.x) * t;
            const lerpRightY = sideBack.y + (apex.y - sideBack.y) * t;
            g.lineStyle(2, p.roofRidge, 0.45);
            g.moveTo(lerpLeftX, lerpLeftY + 1.5);
            g.lineTo(lerpRightX, lerpRightY + 1.5);
            g.lineStyle(0);
            g.lineStyle(1.2, p.roofRidge, 0.7);
            g.moveTo(lerpLeftX, lerpLeftY);
            g.lineTo(lerpRightX, lerpRightY);
            g.lineStyle(0);
            g.lineStyle(0.9, p.roofHighlight, 0.7);
            g.moveTo(lerpLeftX, lerpLeftY - 1);
            g.lineTo(lerpRightX, lerpRightY - 1);
            g.lineStyle(0);
        }
    }

    private drawChimney(wallY: number): void {
        const { x, y, w } = this;
        const p = this.palette;
        const g = new PIXI.Graphics();

        // FIX v0.33.3: chimney 10px wyżej (Mariusz feedback — bardziej widoczny)
        // chimneyBaseY z y+12 do y+2
        const chimneyX = x + w * 0.62 + RIGHT_DEPTH * 0.35;
        const chimneyBaseY = y + 2;
        const chimneyTopY = chimneyBaseY - CHIMNEY_H;

        // Chimney body (brick gradient)
        const points: Pt[] = [
            { x: chimneyX, y: chimneyTopY },
            { x: chimneyX + CHIMNEY_W, y: chimneyTopY },
            { x: chimneyX + CHIMNEY_W, y: chimneyBaseY },
            { x: chimneyX, y: chimneyBaseY },
        ];
        fillGradientPolygon(g, points, p.chimney, p.chimneyTop);

        // Brick texture (2 rows × 3 col — short chimney)
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) {
                const bx = chimneyX + 1 + col * (CHIMNEY_W / 3) + (row % 2 === 0 ? 0 : 1.5);
                const by = chimneyTopY + 3 + row * (CHIMNEY_H / 2);
                if (bx + 2 < chimneyX + CHIMNEY_W) {
                    g.lineStyle(0.4, p.chimneyTop, 0.65);
                    g.moveTo(bx, by);
                    g.lineTo(bx + 2, by);
                    g.lineStyle(0);
                }
            }
        }

        // Chimney cap (wider top)
        g.beginFill(p.chimneyTop, 1);
        g.drawRect(chimneyX - 2, chimneyTopY - 2.5, CHIMNEY_W + 4, 3);
        g.endFill();
        g.beginFill(SHARED.foundationLight, 0.5);
        g.drawRect(chimneyX - 2, chimneyTopY - 2.5, CHIMNEY_W + 4, 1);
        g.endFill();

        // Outline
        g.lineStyle(0.9, p.chimneyTop, 0.95);
        g.drawRect(chimneyX, chimneyTopY, CHIMNEY_W, CHIMNEY_H);
        g.drawRect(chimneyX - 2, chimneyTopY - 2.5, CHIMNEY_W + 4, 3);
        g.lineStyle(0);

        // Smoke hole
        g.beginFill(SHARED.windowHole, 0.85);
        g.drawEllipse(chimneyX + CHIMNEY_W / 2, chimneyTopY - 1, CHIMNEY_W * 0.3, 1);
        g.endFill();

        this.staticContainer.addChild(g);

        // Smoke spawn position (top of chimney cap)
        this.chimneyTopPos = { x: chimneyX + CHIMNEY_W / 2, y: chimneyTopY - 3 };
    }

    // ═══════════════════════════════════════════════════════════
    // 4) ANIMATED PARTS — sparrow na ridge
    // ═══════════════════════════════════════════════════════════
    private drawAnimatedParts(_rng: () => number): void {
        const { x, y, w } = this;
        // Sparrow na N ridge end (small detail)
        const sparrowX = x + w * 0.7;
        const sparrowY = y + 4;
        this.drawSparrow(sparrowX, sparrowY);
    }

    private drawSparrow(px: number, py: number): void {
        this.sparrowContainer = new PIXI.Container();
        this.sparrowContainer.x = px;
        this.sparrowContainer.y = py;
        this.staticContainer.addChild(this.sparrowContainer);

        const g = new PIXI.Graphics();
        g.beginFill(SHARED.sparrowBody, 1);
        g.moveTo(-3, 0);
        g.lineTo(-6, -1);
        g.lineTo(-6, 1);
        g.closePath();
        g.endFill();
        g.beginFill(SHARED.sparrowBodyLt, 1);
        g.drawEllipse(0, 0, 3.5, 2.5);
        g.endFill();
        g.beginFill(SHARED.sparrowBody, 1);
        g.drawEllipse(-1.2, 0, 2, 1.6);
        g.endFill();
        g.beginFill(SHARED.sparrowBodyLt, 1);
        g.drawCircle(2.5, -1.2, 1.8);
        g.endFill();
        g.beginFill(SHARED.sparrowBeak, 1);
        g.moveTo(4, -1.2);
        g.lineTo(5.5, -0.8);
        g.lineTo(4, -0.5);
        g.closePath();
        g.endFill();
        g.beginFill(SHARED.sparrowEye, 1);
        g.drawCircle(3, -1.5, 0.4);
        g.endFill();
        g.lineStyle(0.5, 0x2a1810, 0.75);
        g.drawEllipse(0, 0, 3.5, 2.5);
        g.drawCircle(2.5, -1.2, 1.8);
        g.lineStyle(0);
        // Legs
        g.lineStyle(0.5, SHARED.sparrowBeak, 1);
        g.moveTo(-0.8, 1.5);
        g.lineTo(-0.8, 3);
        g.moveTo(0.8, 1.5);
        g.lineTo(0.8, 3);
        g.lineStyle(0);

        this.sparrowContainer.addChild(g);
    }

    private drawNail(g: PIXI.Graphics, nx: number, ny: number): void {
        g.beginFill(SHARED.nailRust, 1);
        g.drawCircle(nx, ny, 0.7);
        g.endFill();
        g.beginFill(SHARED.nailRustLt, 0.55);
        g.drawCircle(nx - 0.2, ny - 0.2, 0.3);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // 5) UPDATE — 5 animations
    // ═══════════════════════════════════════════════════════════
    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        const dt = 1 / 60;
        this.elapsed += dt;
        const t = this.elapsed;

        // ── 1) CHIMNEY SMOKE — spawn + drift ──
        this.smokeTimer += dt;
        if (this.smokeTimer > 7 + Math.random() * 3) {
            this.smokeTimer = 0;
            const g = new PIXI.Graphics();
            const baseSize = 2.5 + Math.random() * 1.5;
            g.beginFill(SHARED.chimneySmoke, 0.7);
            g.drawCircle(0, 0, baseSize);
            g.endFill();
            g.beginFill(SHARED.chimneySmokeDk, 0.4);
            g.drawCircle(-0.8, -0.3, baseSize * 0.7);
            g.endFill();
            g.beginFill(SHARED.chimneySmoke, 0.5);
            g.drawCircle(0.7, -0.5, baseSize * 0.6);
            g.endFill();
            g.x = this.chimneyTopPos.x + (Math.random() - 0.5) * 2;
            g.y = this.chimneyTopPos.y;
            this.particleContainer.addChild(g);
            this.smokePuffs.push({
                g,
                age: 0,
                vx: (Math.random() - 0.3) * 0.25,
                vy: -0.5 - Math.random() * 0.3,
                size: baseSize,
            });
        }
        for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
            const p = this.smokePuffs[i];
            p.age += dt;
            p.g.x += p.vx;
            p.g.y += p.vy;
            p.vy *= 0.992;  // decelerate gradually
            p.g.alpha = Math.max(0, 0.8 - p.age / 4);
            p.g.scale.set(1 + p.age * 0.5);
            if (p.age > 4) {
                this.particleContainer.removeChild(p.g);
                p.g.destroy();
                this.smokePuffs.splice(i, 1);
            }
        }

        // ── 2) WINDOW GLOW pulse (2 okna z różnym phase) ──
        if (this.windowGlowL) {
            this.windowGlowL.alpha = 0.85 + Math.sin(t * 1.2) * 0.12;
        }
        if (this.windowGlowR) {
            this.windowGlowR.alpha = 0.82 + Math.sin(t * 1.4 + 1.5) * 0.14;
        }

        // ── 3) SHUTTERS WIND sway (subtle rotation) ──
        if (this.shutterLContainer) {
            this.shutterLContainer.rotation = Math.sin(t * 0.9) * 0.025;
        }
        if (this.shutterRContainer) {
            this.shutterRContainer.rotation = -Math.sin(t * 0.9 + 0.3) * 0.025;
        }
        if (this.shutterLContainer2) {
            this.shutterLContainer2.rotation = Math.sin(t * 1.1 + 0.8) * 0.022;
        }
        if (this.shutterRContainer2) {
            this.shutterRContainer2.rotation = -Math.sin(t * 1.1 + 1.1) * 0.022;
        }

        // ── 4) DOOR creak (subtle sway, very occasional) ──
        if (this.doorContainer) {
            const creakPhase = (t % 18) / 18;
            if (creakPhase < 0.025) {
                const cp = creakPhase / 0.025;
                this.doorContainer.rotation = Math.sin(cp * Math.PI) * 0.018;
            } else {
                this.doorContainer.rotation = 0;
            }
        }

        // ── 5) SPARROW occasional Y bump ──
        if (this.sparrowContainer) {
            const sBob = (t % 8.3) / 8.3;
            this.sparrowContainer.y = (this.y + 4) + (sBob < 0.07 ? -Math.sin(sBob * 45) * 1.5 : 0);
        }
    }

    public getExtraCollidables(): ICollidable[] {
        const PAD = 8;
        const { x, y, w, h } = this;
        const wallY = y + 22;
        const foundY = y + h - FOUNDATION_H - PORCH_H;

        return [
            // (1) Main padded
            {
                x: x - PAD,
                y: y - PAD,
                w: w + PAD * 2,
                h: h + PAD * 2,
                update: () => {},
            },
            // (2) Side parallelogram E
            {
                x: x + w,
                y: wallY - ISO_RISE - PAD,
                w: RIGHT_DEPTH + PAD,
                h: (foundY - wallY) + ISO_RISE + FOUNDATION_H + PORCH_H + PAD * 2,
                update: () => {},
            },
            // (3) N roof overhang (apex + chimney)
            {
                x: x - 8,
                y: y - 38,  // chimney top extends y - 34
                w: w + RIGHT_DEPTH + 8,
                h: 30,
                update: () => {},
            },
        ];
    }
}