import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { fillGradientPolygon, makeRng, type Pt } from './FarmBuildingTextures';

/**
 * v0.31.0 FAZA T4b — HENHOUSE (kurnik) AAA PREMIUM
 *
 * Caribbean wood + teal accent style (vs barn deep red).
 * 3.5× density per pixel vs barn (small footprint 130×110, ~22 elements).
 *
 * 6 Subtle Life animations (vs 4 w barn):
 *   1. Cock head bobbing (peck pattern) na ridge
 *   2. Window glow pulse
 *   3. Chicken peek z pop hole (4s cycle)
 *   4. Door subtle creak (wind)
 *   5. Feather puff z pop hole (~6s interval)
 *   6. Ramp sway hint (kura wbiegająca)
 *
 * CONTAINER STACK (zIndex bottom-up):
 *   -86: aoContainer       — extended SE drop shadow + contact ellipse
 *   y+h: staticContainer   — foundation, walls, roof, fascia, pop hole, ramp, occlusion
 *   y+h: animatedContainer — cock, window glow, chicken peek, door (creak)
 *   y+h+1: featherContainer — feather puffs (drift up, fade out)
 */

const COLORS = {
    aoShadow:           0x000000,
    // Walls — light caribbean wood
    wallWoodTop:        0xc9a778,
    wallWoodBot:        0xa5824a,
    wallWoodLight:      0xe2c599,
    wallWoodDeep:       0x3e2a13,
    // Teal accent (caribbean signature)
    accentTeal:         0x4a8a7c,
    accentTealDk:       0x2d544c,
    accentTealLt:       0x6dab9d,
    // Roof shingles (cedar)
    shingleTop:         0x6b5230,
    shingleBot:         0x3e2d18,
    shingleLight:       0x916c47,
    shingleHighlight:   0xbf9466,
    shingleOutline:     0x1d130a,
    // Foundation
    foundation:         0x6b6058,
    foundationLight:    0x8c8279,
    foundationShadow:   0x453b34,
    // Fascia + ridge
    fascia:             0x4a2510,
    fasciaOutline:      0x1a0a04,
    roofRidge:          0x361f0a,
    // Window
    windowFrame:        0xf0e6c9,
    windowGlow:         0xffe866,
    windowGlowOuter:    0xffbc2b,
    windowHole:         0x0a0501,
    // Door (drewniany z teal trim)
    doorMain:           0x6e4423,
    doorDark:           0x3e2510,
    doorLight:          0x9c6a40,
    doorBrace:          0x4a2a14,
    // Pop hole (otwór dla kur)
    popHoleDark:        0x050300,
    popHoleMid:         0x1e1408,
    // Ramp
    rampWood:           0x7a5a2c,
    rampWoodLight:      0xa07d4a,
    rampWoodDk:         0x3a2818,
    rampStraw:          0xd9b04a,
    // Cock na ridge (small)
    cockBody:           0x9d3a20,
    cockBodyLight:      0xc04c2a,
    cockComb:           0xc02020,
    cockTail:           0x4a2510,
    cockTailLight:      0x6e3a20,
    cockBeak:           0xd9a040,
    cockEye:            0x1a1a1a,
    // Chicken peek (głowa kury, biała)
    chickenBody:        0xebd5b8,
    chickenBodyDk:      0xb09576,
    chickenComb:        0xc02020,
    chickenBeak:        0xd9a040,
    chickenEye:         0x1a1a1a,
    chickenWattle:      0xa02020,
    // Iron hardware (drzwi, pop hole rim)
    ironHardware:       0x212121,
    ironHighlight:      0x5e5e5e,
    // Dust puffs przy ramp
    dustPuff:           0xc4a87c,
    // Feather puff (białe piórka z pop hole)
    featherWhite:       0xffffff,
};

interface WindowGlowGfx {
    gfx: PIXI.Graphics;
    phaseOffset: number;
}

interface FeatherPuff {
    gfx: PIXI.Graphics;
    spawnTime: number;
    driftX: number;
}

export class Henhouse implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private aoContainer: PIXI.Container;
    private staticContainer: PIXI.Container;
    private animatedContainer: PIXI.Container;
    private featherContainer: PIXI.Container;
    private worldContainer: PIXI.Container;

    private cockGfx!: PIXI.Container;
    private windowGlow!: WindowGlowGfx;
    private chickenPeekGfx!: PIXI.Container;
    private doorGfx!: PIXI.Container;
    private rampGfx!: PIXI.Container;
    private featherPuffs: FeatherPuff[] = [];

    private time: number = 0;
    private lastFeatherSpawn: number = -10;

    constructor(
        x: number, y: number,
        w: number, h: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.worldContainer = worldContainer;

        const rng = makeRng(seed);

        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;
        this.drawAO();
        worldContainer.addChild(this.aoContainer);

        this.staticContainer = new PIXI.Container();
        this.staticContainer.zIndex = Math.floor(y + h);
        this.drawStaticParts(rng);
        worldContainer.addChild(this.staticContainer);

        this.animatedContainer = new PIXI.Container();
        this.animatedContainer.zIndex = Math.floor(y + h);
        this.drawAnimatedParts(rng);
        worldContainer.addChild(this.animatedContainer);

        this.featherContainer = new PIXI.Container();
        this.featherContainer.zIndex = Math.floor(y + h) + 1;
        worldContainer.addChild(this.featherContainer);
    }

    // ═══════════════════════════════════════════════════════════
    // AO — drop shadow SE + contact ellipse (mniejszy niż barn)
    // ═══════════════════════════════════════════════════════════
    private drawAO(): void {
        const g = new PIXI.Graphics();
        const x = this.x, y = this.y, w = this.w, h = this.h;

        // Outer ambient SE polygon
        g.beginFill(COLORS.aoShadow, 0.10);
        g.moveTo(x - 5, y + h * 0.55);
        g.lineTo(x + w + 35, y + h * 0.55);
        g.lineTo(x + w + 42, y + h + 22);
        g.lineTo(x - 5, y + h + 22);
        g.closePath();
        g.endFill();

        // Mid shadow
        g.beginFill(COLORS.aoShadow, 0.18);
        g.moveTo(x - 2, y + h * 0.72);
        g.lineTo(x + w + 20, y + h * 0.72);
        g.lineTo(x + w + 28, y + h + 15);
        g.lineTo(x - 2, y + h + 15);
        g.closePath();
        g.endFill();

        // Contact under building (subtle, nie owalny — Mariusz feedback z barn)
        g.beginFill(COLORS.aoShadow, 0.25);
        g.drawRect(x + 4, y + h - 1, w - 8, 4);
        g.endFill();

        this.aoContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // STATIC PARTS — foundation, walls, roof, fascia, pop hole, ramp
    // ═══════════════════════════════════════════════════════════
    private drawStaticParts(rng: () => number): void {
        const g = new PIXI.Graphics();
        const x = this.x, y = this.y, w = this.w, h = this.h;

        // Proporcje
        const roofH = h * 0.45;
        const wallH = h - roofH;
        const wallY = y + roofH;
        const cx = x + w / 2;
        const FOUNDATION_H = 10;
        const foundY = wallY + wallH - FOUNDATION_H;
        const FOUND_STICK = 2;

        // Front wall corners
        const fBL: Pt = { x, y: foundY };
        const fBR: Pt = { x: x + w, y: foundY };
        const fTL: Pt = { x, y: wallY };
        const fTR: Pt = { x: x + w, y: wallY };

        // ── 1. FOUNDATION — gradient depth (light top → dark bottom) ──
        // Drop shadow pod foundation
        g.beginFill(0x000000, 0.25);
        g.drawRect(x - FOUND_STICK + 1, foundY + FOUNDATION_H, w + FOUND_STICK * 2 - 2, 2);
        g.endFill();

        // Front foundation gradient
        const foundPoly: Pt[] = [
            { x: x - FOUND_STICK, y: foundY - 1 },
            { x: x + w + FOUND_STICK, y: foundY - 1 },
            { x: x + w + FOUND_STICK, y: foundY + FOUNDATION_H },
            { x: x - FOUND_STICK, y: foundY + FOUNDATION_H },
        ];
        fillGradientPolygon(g, foundPoly, COLORS.foundationLight, COLORS.foundationShadow);

        // Top edge highlight (sunlit)
        g.lineStyle(2, COLORS.foundationLight, 1.0);
        g.moveTo(x - FOUND_STICK, foundY - 1);
        g.lineTo(x + w + FOUND_STICK, foundY - 1);
        g.lineStyle(0);
        // Bottom shadow
        g.lineStyle(1.5, COLORS.foundationShadow, 1.0);
        g.moveTo(x - FOUND_STICK, foundY + FOUNDATION_H);
        g.lineTo(x + w + FOUND_STICK, foundY + FOUNDATION_H);
        g.lineStyle(0);
        // Side outlines
        g.lineStyle(1, COLORS.foundationShadow, 0.85);
        g.moveTo(x - FOUND_STICK, foundY - 1);
        g.lineTo(x - FOUND_STICK, foundY + FOUNDATION_H);
        g.moveTo(x + w + FOUND_STICK, foundY - 1);
        g.lineTo(x + w + FOUND_STICK, foundY + FOUNDATION_H);
        g.lineStyle(0);

        // Stone separators (5 across z wobble)
        const stoneCount = 5;
        const fullW = w + FOUND_STICK * 2;
        g.lineStyle(1.5, COLORS.foundationShadow, 0.85);
        for (let i = 1; i < stoneCount; i++) {
            const sx = (x - FOUND_STICK) + (fullW * i) / stoneCount + (rng() - 0.5) * 2;
            g.moveTo(sx, foundY + 1);
            g.lineTo(sx, foundY + FOUNDATION_H - 1);
        }
        g.lineStyle(0);
        // Stone top highlights
        g.lineStyle(0.8, COLORS.foundationLight, 0.7);
        for (let i = 0; i < stoneCount; i++) {
            const sx1 = (x - FOUND_STICK) + (fullW * i) / stoneCount + 2;
            const sx2 = (x - FOUND_STICK) + (fullW * (i + 1)) / stoneCount - 2;
            g.moveTo(sx1, foundY + 1);
            g.lineTo(sx2, foundY + 1);
        }
        g.lineStyle(0);

        // ── 2. FRONT WALL — gradient caribbean wood ──
        const wallPoly: Pt[] = [fTL, fTR, fBR, fBL];
        fillGradientPolygon(g, wallPoly, COLORS.wallWoodTop, COLORS.wallWoodBot);

        // 6 vertical planks z gwoździami i rng wyłamania
        const PLANK_COUNT = 6;
        for (let i = 1; i < PLANK_COUNT; i++) {
            const t = i / PLANK_COUNT;
            const wobble = (rng() - 0.5) * 1.5;
            const px = fTL.x + (fTR.x - fTL.x) * t + wobble;

            // Plank shadow
            g.lineStyle(1.8, COLORS.wallWoodDeep, 0.75);
            g.moveTo(px, fTL.y + 2);
            g.lineTo(px, foundY - 1);
            g.lineStyle(0);
            // Plank highlight (sunlit edge)
            g.lineStyle(1, COLORS.wallWoodLight, 0.7);
            g.moveTo(px + 1.2, fTL.y + 2);
            g.lineTo(px + 1.2, foundY - 1);
            g.lineStyle(0);

            // Gwoździe (top + bottom)
            this.drawNail(g, px - 2, fTL.y + 4);
            this.drawNail(g, px - 2, foundY - 5);
        }

        // 2 random wyłamania na bottom desek
        for (let i = 0; i < 2; i++) {
            const px = fTL.x + 8 + rng() * (w - 16);
            const damageH = 3 + rng() * 3;
            g.beginFill(COLORS.wallWoodDeep, 1.0);
            g.drawPolygon([
                px - 2, foundY,
                px + 2, foundY,
                px, foundY - damageH,
            ]);
            g.endFill();
        }

        // Left edge rim light
        g.lineStyle(1.5, COLORS.wallWoodLight, 0.7);
        g.moveTo(fTL.x + 1, fTL.y);
        g.lineTo(fTL.x + 1, foundY);
        g.lineStyle(0);

        // ── 3. TEAL ACCENT TRIM (caribbean signature) — top sill + corner pillars ──
        // Top sill (teal pas)
        g.beginFill(COLORS.accentTeal, 1.0);
        g.drawRect(x - 1, wallY - 3, w + 2, 5);
        g.endFill();
        // Top sill shadow
        g.lineStyle(1, COLORS.accentTealDk, 0.85);
        g.moveTo(x - 1, wallY + 2);
        g.lineTo(x + w + 1, wallY + 2);
        g.lineStyle(0);
        // Top sill highlight (sunlit top)
        g.lineStyle(1, COLORS.accentTealLt, 0.85);
        g.moveTo(x, wallY - 2);
        g.lineTo(x + w, wallY - 2);
        g.lineStyle(0);

        // Corner pillars (teal pionowe)
        const CORNER_W = 6;
        g.beginFill(COLORS.accentTeal, 1.0);
        g.drawRect(x, wallY, CORNER_W, wallH - FOUNDATION_H);
        g.drawRect(x + w - CORNER_W, wallY, CORNER_W, wallH - FOUNDATION_H);
        g.endFill();
        // Corner pillar highlights
        g.lineStyle(1, COLORS.accentTealLt, 0.75);
        g.moveTo(x + 1, wallY);
        g.lineTo(x + 1, foundY);
        g.moveTo(x + w - CORNER_W + 1, wallY);
        g.lineTo(x + w - CORNER_W + 1, foundY);
        g.lineStyle(0);
        // Corner pillar shadows
        g.lineStyle(1, COLORS.accentTealDk, 0.85);
        g.moveTo(x + CORNER_W - 1, wallY);
        g.lineTo(x + CORNER_W - 1, foundY);
        g.moveTo(x + w - 1, wallY);
        g.lineTo(x + w - 1, foundY);
        g.lineStyle(0);

        // ── 4. POP HOLE (otwór dla kur, owalny w lewej-dolnej części wall) ──
        const popCx = x + 22;
        const popCy = foundY - 10;
        const popW = 12;
        const popH = 14;

        // Pop hole drop shadow
        g.beginFill(0x000000, 0.55);
        g.drawEllipse(popCx + 1, popCy + popH / 2 + 2, popW / 2 + 1, 3);
        g.endFill();

        // Pop hole dark inner (deepest)
        g.beginFill(COLORS.popHoleDark, 1.0);
        g.drawEllipse(popCx, popCy, popW / 2, popH / 2);
        g.endFill();
        // Pop hole mid (subtle gradient inside via inset ellipse)
        g.beginFill(COLORS.popHoleMid, 0.7);
        g.drawEllipse(popCx + 1, popCy - 2, popW / 2 - 3, popH / 2 - 3);
        g.endFill();

        // Pop hole rim (iron hardware)
        g.lineStyle(2.5, COLORS.ironHardware, 1.0);
        g.drawEllipse(popCx, popCy, popW / 2, popH / 2);
        g.lineStyle(0);
        // Iron highlight (sunlit top-right of rim)
        g.lineStyle(1.2, COLORS.ironHighlight, 0.85);
        g.moveTo(popCx + 1, popCy - popH / 2 + 1);
        g.lineTo(popCx + popW / 2 - 1, popCy - 1);
        g.lineStyle(0);

        // Wood frame around pop hole (rectangular plate)
        g.lineStyle(1.5, COLORS.doorBrace, 0.85);
        g.drawRect(popCx - popW / 2 - 3, popCy - popH / 2 - 2, popW + 6, popH + 4);
        g.lineStyle(0);

        // ── 5. WINDOW (po prawej od centrum, teal frame + warm glow under) ──
        const winSize = 16;
        const winX = x + w - 35;
        const winY = wallY + 12;

        // Window hole
        g.beginFill(COLORS.windowHole, 1.0);
        g.drawRect(winX, winY, winSize, winSize);
        g.endFill();

        // Window frame (teal chunky)
        g.lineStyle(3, COLORS.accentTeal, 1.0);
        g.drawRect(winX - 1, winY - 1, winSize + 2, winSize + 2);
        g.lineStyle(0);
        // Frame highlight (top edge sunlit)
        g.lineStyle(1, COLORS.accentTealLt, 0.85);
        g.moveTo(winX - 1, winY - 1);
        g.lineTo(winX + winSize + 1, winY - 1);
        g.lineStyle(0);
        // Frame bottom shadow
        g.lineStyle(1.2, COLORS.accentTealDk, 0.85);
        g.moveTo(winX - 1, winY + winSize + 1);
        g.lineTo(winX + winSize + 1, winY + winSize + 1);
        g.lineStyle(0);

        // Window cross (mullion)
        g.lineStyle(2, COLORS.windowFrame, 1.0);
        g.moveTo(winX + winSize / 2, winY);
        g.lineTo(winX + winSize / 2, winY + winSize);
        g.moveTo(winX, winY + winSize / 2);
        g.lineTo(winX + winSize, winY + winSize / 2);
        g.lineStyle(0);

        // Window drop shadow under frame
        g.lineStyle(2, 0x000000, 0.40);
        g.moveTo(winX - 1, winY + winSize + 2);
        g.lineTo(winX + winSize + 1, winY + winSize + 2);
        g.lineStyle(0);

        // ── 6. ROOF — single apex gable z 3 rzędy cedar shingles ──
        const OVERHANG = 8;
        const ridgeApexX = cx + w * 0.04;
        const ridgeApexY = y + h * 0.04;

        const rFrontL: Pt = { x: x - OVERHANG, y: wallY };
        const rFrontR: Pt = { x: x + w + OVERHANG, y: wallY };
        const rApex: Pt = { x: ridgeApexX, y: ridgeApexY };

        // Roof gradient fill
        g.beginFill(COLORS.shingleTop, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.closePath();
        g.endFill();

        // Cedar shingles (3 rzędy z brick pattern)
        this.drawShingles(g, rFrontL, rFrontR, rApex);

        // Roof edge outlines (chunky brawl-stars)
        g.lineStyle(2.5, COLORS.shingleOutline, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(0);
        // Rim light na lewym edge (sunlit)
        g.lineStyle(2, COLORS.shingleHighlight, 0.9);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineStyle(0);

        // Ridge beam (cienka belka kalenicy)
        const ridgeEndX = rApex.x + 6;
        const ridgeEndY = rApex.y - 6;
        g.lineStyle(3, COLORS.roofRidge, 1.0);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(ridgeEndX, ridgeEndY);
        g.lineStyle(0);

        // ── 7. FASCIA pod eave (4px ciemnobrązowa, DOPASOWANA do eave bottom) ──
        const FASCIA_H = 4;
        g.beginFill(COLORS.fascia, 1.0);
        g.drawRect(rFrontL.x, rFrontL.y, rFrontR.x - rFrontL.x, FASCIA_H);
        g.endFill();
        // Fascia bottom outline
        g.lineStyle(1.2, COLORS.fasciaOutline, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y + FASCIA_H);
        g.lineTo(rFrontR.x, rFrontR.y + FASCIA_H);
        g.lineStyle(0);
        // Fascia top highlight (wood grain hint)
        g.lineStyle(0.8, COLORS.shingleLight, 0.55);
        g.moveTo(rFrontL.x + 2, rFrontL.y + 1);
        g.lineTo(rFrontR.x - 2, rFrontR.y + 1);
        g.lineStyle(0);

        // ── 8. RAMP (pochylnia z pop hole do ground) ──
        // Ramp shape: trapezoidal pochylnia od pop hole bottom do ground
        this.drawRampStatic(g, popCx, popCy + popH / 2, foundY + FOUNDATION_H, rng);

        // ── 9. DUST PUFFS na ground koło rampy (2-3 random kępki kurzu) ──
        const puffCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < puffCount; i++) {
            const pX = popCx + (rng() - 0.3) * 18;
            const pY = foundY + FOUNDATION_H + 6 + rng() * 4;
            const pR = 2 + rng() * 1.5;
            g.beginFill(COLORS.dustPuff, 0.4);
            g.drawEllipse(pX, pY, pR, pR * 0.5);
            g.endFill();
        }

        // ── 10. Straw scattered around pop hole entry ──
        g.lineStyle(0.8, COLORS.rampStraw, 0.7);
        for (let i = 0; i < 5; i++) {
            const sx = popCx + (rng() - 0.5) * 22;
            const sy = foundY + FOUNDATION_H + 8 + rng() * 3;
            const len = 2 + rng() * 2;
            const angle = rng() * Math.PI;
            g.moveTo(sx, sy);
            g.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
        }
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // SHINGLES — 3 rzędy z brick pattern (cedar style)
    // ═══════════════════════════════════════════════════════════
    private drawShingles(g: PIXI.Graphics, pL: Pt, pR: Pt, apex: Pt): void {
        const ROWS = 3;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            const lerpY = pL.y + (apex.y - pL.y) * t;
            const lerpXL = pL.x + (apex.x - pL.x) * t;
            const lerpXR = pR.x + (apex.x - pR.x) * t;
            const rowW = lerpXR - lerpXL;

            // Row shadow (below row line)
            g.lineStyle(3, COLORS.shingleOutline, 0.45);
            g.moveTo(lerpXL, lerpY + 2);
            g.lineTo(lerpXR, lerpY + 2);
            g.lineStyle(0);

            // Vertical shingle separators (brick offset co drugi rząd)
            const COLS = Math.max(3, Math.floor(rowW / 14));
            const brickOff = r % 2 === 0 ? 0 : 0.5;
            g.lineStyle(1.2, COLORS.shingleOutline, 0.55);
            for (let c = 1; c < COLS; c++) {
                const tx = lerpXL + rowW * ((c - brickOff) / COLS);
                if (tx < lerpXL || tx > lerpXR) continue;
                g.moveTo(tx, lerpY);
                g.lineTo(tx, lerpY - 6);
            }
            g.lineStyle(0);

            // Row bottom outline (chunky)
            g.lineStyle(2, COLORS.shingleOutline, 0.7);
            g.moveTo(lerpXL, lerpY);
            g.lineTo(lerpXR, lerpY);
            g.lineStyle(0);

            // Row top sunlit highlight
            g.lineStyle(1.5, COLORS.shingleLight, 0.85);
            g.moveTo(lerpXL + 2, lerpY - 2);
            g.lineTo(lerpXR - 2, lerpY - 2);
            g.lineStyle(0);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RAMP STATIC — drewniana pochylnia z poziomymi pręcikami
    // ═══════════════════════════════════════════════════════════
    private drawRampStatic(
        g: PIXI.Graphics,
        popBotX: number,
        popBotY: number,
        groundY: number,
        rng: () => number,
    ): void {
        // Ramp wymiary: od pop hole bottom do ground (~20px niżej, ~24px na prawo)
        const rampW = 26;
        const rampH = groundY - popBotY + 6;
        const rampTopX = popBotX - rampW / 2;
        const rampTopY = popBotY;
        const rampBotX = popBotX - rampW / 2 + 3;
        const rampBotY = groundY + 4;
        const rampBotRX = rampBotX + rampW;
        const rampTopRX = rampTopX + rampW;

        // Drop shadow pod ramp
        g.beginFill(0x000000, 0.35);
        g.drawPolygon([
            rampTopX + 1, rampTopY + 2,
            rampTopRX + 1, rampTopY + 2,
            rampBotRX + 2, rampBotY + 2,
            rampBotX + 2, rampBotY + 2,
        ]);
        g.endFill();

        // Ramp main wood plate (gradient ciemny top → light bottom, lekko skewed)
        const rampPoly: Pt[] = [
            { x: rampTopX, y: rampTopY },
            { x: rampTopRX, y: rampTopY },
            { x: rampBotRX, y: rampBotY },
            { x: rampBotX, y: rampBotY },
        ];
        fillGradientPolygon(g, rampPoly, COLORS.rampWoodDk, COLORS.rampWoodLight);

        // Ramp side rails (teal akcent)
        g.lineStyle(2, COLORS.accentTeal, 1.0);
        g.moveTo(rampTopX, rampTopY);
        g.lineTo(rampBotX, rampBotY);
        g.moveTo(rampTopRX, rampTopY);
        g.lineTo(rampBotRX, rampBotY);
        g.lineStyle(0);

        // Ramp rungs (5 poziomych pręcików)
        g.lineStyle(1.5, COLORS.rampWoodDk, 1.0);
        for (let i = 1; i < 6; i++) {
            const t = i / 6;
            const rxL = rampTopX + (rampBotX - rampTopX) * t;
            const ryL = rampTopY + (rampBotY - rampTopY) * t;
            const rxR = rampTopRX + (rampBotRX - rampTopRX) * t;
            const ryR = rampTopY + (rampBotY - rampTopY) * t;
            g.moveTo(rxL, ryL);
            g.lineTo(rxR, ryR);
        }
        g.lineStyle(0);

        // Rung highlights
        g.lineStyle(0.8, COLORS.rampWoodLight, 0.7);
        for (let i = 1; i < 6; i++) {
            const t = i / 6;
            const rxL = rampTopX + (rampBotX - rampTopX) * t;
            const ryL = rampTopY + (rampBotY - rampTopY) * t - 1;
            const rxR = rampTopRX + (rampBotRX - rampTopRX) * t;
            const ryR = rampTopY + (rampBotY - rampTopY) * t - 1;
            g.moveTo(rxL + 1, ryL);
            g.lineTo(rxR - 1, ryR);
        }
        g.lineStyle(0);

        // Ramp outline (chunky)
        g.lineStyle(2, COLORS.rampWoodDk, 1.0);
        g.moveTo(rampTopX, rampTopY);
        g.lineTo(rampBotX, rampBotY);
        g.lineTo(rampBotRX, rampBotY);
        g.lineTo(rampTopRX, rampTopY);
        g.lineStyle(0);

        // Straw scattered on ramp (4 random źdźbła)
        g.lineStyle(0.7, COLORS.rampStraw, 0.85);
        for (let i = 0; i < 4; i++) {
            const t = 0.2 + rng() * 0.6;
            const xCenter = rampTopX + (rampBotX - rampTopX) * t + 4 + rng() * (rampW - 8);
            const yCenter = rampTopY + (rampBotY - rampTopY) * t;
            const len = 2 + rng() * 1.5;
            const angle = rng() * Math.PI - Math.PI / 2;
            g.moveTo(xCenter, yCenter);
            g.lineTo(xCenter + Math.cos(angle) * len, yCenter + Math.sin(angle) * len);
        }
        g.lineStyle(0);
    }

    // ═══════════════════════════════════════════════════════════
    // ANIMATED PARTS — cock, window glow, chicken peek, door
    // ═══════════════════════════════════════════════════════════
    private drawAnimatedParts(rng: () => number): void {
        const x = this.x, y = this.y, w = this.w, h = this.h;
        const roofH = h * 0.45;
        const wallH = h - roofH;
        const wallY = y + roofH;
        const cx = x + w / 2;
        const FOUNDATION_H = 10;
        const foundY = wallY + wallH - FOUNDATION_H;
        const ridgeApexX = cx + w * 0.04;
        const ridgeApexY = y + h * 0.04;

        // ── 1. WINDOW GLOW (animated alpha pulse) ──
        const winSize = 16;
        const winX = x + w - 35;
        const winY = wallY + 12;
        const gfx = new PIXI.Graphics();
        // Outer warm halo
        gfx.beginFill(COLORS.windowGlowOuter, 0.40);
        gfx.drawCircle(winX + winSize / 2, winY + winSize / 2, winSize * 0.7);
        gfx.endFill();
        // Inner warm glass
        gfx.beginFill(COLORS.windowGlow, 0.92);
        gfx.drawRect(winX + 2, winY + 2, winSize - 4, winSize - 4);
        gfx.endFill();
        // Specular spec top-left
        gfx.beginFill(0xffffff, 0.5);
        gfx.drawRect(winX + 3, winY + 3, winSize * 0.3, winSize * 0.18);
        gfx.endFill();
        this.animatedContainer.addChild(gfx);
        this.windowGlow = { gfx, phaseOffset: 0 };

        // ── 2. COCK ON RIDGE (mały, na apex z head bobbing) ──
        this.cockGfx = new PIXI.Container();
        this.drawCock(this.cockGfx);
        this.cockGfx.position.set(ridgeApexX + 2, ridgeApexY - 6);
        this.animatedContainer.addChild(this.cockGfx);

        // ── 3. CHICKEN PEEK z pop hole ──
        const popCx = x + 22;
        const popCy = foundY - 10;
        this.chickenPeekGfx = new PIXI.Container();
        this.drawChickenHead(this.chickenPeekGfx);
        this.chickenPeekGfx.position.set(popCx, popCy);
        this.chickenPeekGfx.alpha = 0;
        this.chickenPeekGfx.scale.set(0.85);
        this.animatedContainer.addChild(this.chickenPeekGfx);

        // ── 4. DOOR (animated z subtle creak rotation) ──
        // Drzwi pozycja: środek wall, foundY-doorH
        const doorW = 24;
        const doorH = 44;
        const doorX = cx - doorW / 2 + 8;  // lekko od centrum w prawo (pop hole jest po lewej)
        const doorY = foundY - doorH;

        this.doorGfx = new PIXI.Container();
        this.drawDoor(this.doorGfx, doorW, doorH);
        // Anchor na bottom-left dla rotation creak
        this.doorGfx.position.set(doorX, doorY);
        this.doorGfx.pivot.set(0, doorH);  // pivot bottom-left
        this.doorGfx.position.set(doorX, doorY + doorH);
        this.animatedContainer.addChild(this.doorGfx);
    }

    // ═══════════════════════════════════════════════════════════
    // DRAW COCK — mały kogut na ridge (peck animation w update)
    // ═══════════════════════════════════════════════════════════
    private drawCock(container: PIXI.Container): void {
        const g = new PIXI.Graphics();

        // Body (ellipse rounded)
        g.beginFill(COLORS.cockBody, 1.0);
        g.drawEllipse(0, 0, 6, 5);
        g.endFill();
        // Body highlight (sunlit right)
        g.beginFill(COLORS.cockBodyLight, 1.0);
        g.drawEllipse(1.5, -1, 3, 2.5);
        g.endFill();

        // Tail feathers (3 zakrzywione w lewo)
        g.beginFill(COLORS.cockTail, 1.0);
        g.moveTo(-5, -1);
        g.lineTo(-10, -5);
        g.lineTo(-9, -2);
        g.lineTo(-5, 0);
        g.closePath();
        g.moveTo(-5, -2);
        g.lineTo(-11, -3);
        g.lineTo(-9, -1);
        g.lineTo(-5, -1);
        g.closePath();
        g.endFill();
        // Tail highlight
        g.beginFill(COLORS.cockTailLight, 0.8);
        g.moveTo(-6, -2);
        g.lineTo(-9, -4);
        g.lineTo(-7, -2);
        g.closePath();
        g.endFill();

        // Head (small ellipse, na prawo od body)
        g.beginFill(COLORS.cockBody, 1.0);
        g.drawEllipse(5, -4, 3, 3.5);
        g.endFill();
        // Head highlight
        g.beginFill(COLORS.cockBodyLight, 1.0);
        g.drawEllipse(5.5, -5, 1.5, 2);
        g.endFill();

        // Comb (3 trójkątne kawałki na górze głowy)
        g.beginFill(COLORS.cockComb, 1.0);
        g.moveTo(4, -7);
        g.lineTo(4.5, -9);
        g.lineTo(5, -7);
        g.closePath();
        g.moveTo(5, -7);
        g.lineTo(5.5, -9.5);
        g.lineTo(6, -7);
        g.closePath();
        g.moveTo(6, -7);
        g.lineTo(6.5, -8.5);
        g.lineTo(7, -7);
        g.closePath();
        g.endFill();

        // Beak (orange triangle)
        g.beginFill(COLORS.cockBeak, 1.0);
        g.moveTo(7.5, -3.5);
        g.lineTo(9.5, -3);
        g.lineTo(7.5, -2.5);
        g.closePath();
        g.endFill();

        // Eye (czarny punkcik)
        g.beginFill(COLORS.cockEye, 1.0);
        g.drawCircle(6, -4.5, 0.6);
        g.endFill();
        // Eye highlight (white)
        g.beginFill(0xffffff, 0.9);
        g.drawCircle(6.2, -4.7, 0.25);
        g.endFill();

        // Wattle (czerwona zwisająca skórka pod beak)
        g.beginFill(COLORS.cockComb, 1.0);
        g.moveTo(6, -2);
        g.lineTo(6.5, -0.5);
        g.lineTo(5.5, -1);
        g.closePath();
        g.endFill();

        // Legs (krótkie, dark)
        g.lineStyle(1.5, COLORS.cockEye, 1.0);
        g.moveTo(-1, 4);
        g.lineTo(-1, 7);
        g.moveTo(2, 4);
        g.lineTo(2, 7);
        g.lineStyle(0);

        // Body outline (chunky brawl-stars)
        g.lineStyle(1.5, COLORS.cockEye, 0.85);
        g.drawEllipse(0, 0, 6, 5);
        g.drawEllipse(5, -4, 3, 3.5);
        g.lineStyle(0);

        container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // DRAW CHICKEN HEAD — głowa kury (chicken peek z pop hole)
    // ═══════════════════════════════════════════════════════════
    private drawChickenHead(container: PIXI.Container): void {
        const g = new PIXI.Graphics();

        // Head body (white ellipse)
        g.beginFill(COLORS.chickenBody, 1.0);
        g.drawEllipse(0, 0, 4, 4.5);
        g.endFill();
        // Head shadow (left side dark)
        g.beginFill(COLORS.chickenBodyDk, 1.0);
        g.drawEllipse(-1.5, 0.5, 2, 3);
        g.endFill();

        // Comb (mały czerwony trójkąt)
        g.beginFill(COLORS.chickenComb, 1.0);
        g.moveTo(-1, -4);
        g.lineTo(0, -6);
        g.lineTo(1, -4);
        g.closePath();
        g.moveTo(1, -4);
        g.lineTo(2, -5.5);
        g.lineTo(2.5, -4);
        g.closePath();
        g.endFill();

        // Beak
        g.beginFill(COLORS.chickenBeak, 1.0);
        g.moveTo(3.5, -0.5);
        g.lineTo(6, 0);
        g.lineTo(3.5, 0.5);
        g.closePath();
        g.endFill();

        // Eye
        g.beginFill(COLORS.chickenEye, 1.0);
        g.drawCircle(2, -1, 0.7);
        g.endFill();
        g.beginFill(0xffffff, 0.9);
        g.drawCircle(2.2, -1.2, 0.3);
        g.endFill();

        // Wattle (czerwona skórka)
        g.beginFill(COLORS.chickenWattle, 1.0);
        g.moveTo(2.5, 1);
        g.lineTo(3, 2.5);
        g.lineTo(1.5, 2);
        g.closePath();
        g.endFill();

        // Outline (chunky)
        g.lineStyle(1.2, COLORS.chickenEye, 0.85);
        g.drawEllipse(0, 0, 4, 4.5);
        g.lineStyle(0);

        container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // DRAW DOOR — drewniane drzwi z Z-brace + teal trim
    // ═══════════════════════════════════════════════════════════
    private drawDoor(container: PIXI.Container, dW: number, dH: number): void {
        const g = new PIXI.Graphics();

        // Door hole (recessed)
        g.beginFill(0x0a0501, 1.0);
        g.drawRect(-1, -1, dW + 2, dH + 1);
        g.endFill();

        // Door main (drewniany z gradient)
        const doorPoly: Pt[] = [
            { x: 0, y: 0 },
            { x: dW, y: 0 },
            { x: dW, y: dH },
            { x: 0, y: dH },
        ];
        fillGradientPolygon(g, doorPoly, COLORS.doorLight, COLORS.doorDark);

        // Horizontal planks (3 poziome desk)
        g.lineStyle(0.8, COLORS.doorDark, 0.7);
        for (let py = dH / 4; py < dH; py += dH / 4) {
            g.moveTo(0, py);
            g.lineTo(dW, py);
        }
        g.lineStyle(0);

        // Z-BRACE (klasyczny barn detail)
        g.lineStyle(2.5, COLORS.doorBrace, 0.95);
        g.moveTo(2, 3);
        g.lineTo(dW - 2, 3);
        g.moveTo(2, dH - 3);
        g.lineTo(dW - 2, dH - 3);
        g.moveTo(2, dH - 3);
        g.lineTo(dW - 2, 3);
        g.lineStyle(0);

        // Top-left highlight (sunlit bevel)
        g.lineStyle(1.2, COLORS.doorLight, 0.75);
        g.moveTo(1, 1);
        g.lineTo(dW - 1, 1);
        g.lineStyle(0);

        // Door handle (iron knob na prawej strony)
        g.beginFill(COLORS.ironHardware, 1.0);
        g.drawCircle(dW - 3, dH / 2, 1.5);
        g.endFill();
        g.beginFill(COLORS.ironHighlight, 1.0);
        g.drawCircle(dW - 3.4, dH / 2 - 0.4, 0.6);
        g.endFill();

        // Door teal trim (caribbean accent — left + right edges)
        g.lineStyle(2, COLORS.accentTeal, 1.0);
        g.moveTo(0, 0);
        g.lineTo(0, dH);
        g.moveTo(dW, 0);
        g.lineTo(dW, dH);
        g.lineStyle(0);
        // Trim shadow
        g.lineStyle(0.8, COLORS.accentTealDk, 0.85);
        g.moveTo(1.5, 1);
        g.lineTo(1.5, dH - 1);
        g.moveTo(dW - 1.5, 1);
        g.lineTo(dW - 1.5, dH - 1);
        g.lineStyle(0);

        // Door outline (chunky brawl-stars)
        g.lineStyle(1.5, COLORS.doorDark, 1.0);
        g.drawRect(0, 0, dW, dH);
        g.lineStyle(0);

        // Drop shadow under door
        g.lineStyle(2, 0x000000, 0.45);
        g.moveTo(-1, dH + 1);
        g.lineTo(dW + 1, dH + 1);
        g.lineStyle(0);

        container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // NAIL — mikro-detal
    // ═══════════════════════════════════════════════════════════
    private drawNail(g: PIXI.Graphics, x: number, y: number): void {
        g.beginFill(COLORS.ironHardware, 1.0);
        g.drawCircle(x, y, 1);
        g.endFill();
        g.beginFill(COLORS.ironHighlight, 1.0);
        g.drawCircle(x - 0.3, y - 0.3, 0.4);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // SPAWN FEATHER PUFF — particle leaving pop hole
    // ═══════════════════════════════════════════════════════════
    private spawnFeatherPuff(): void {
        const x = this.x, w = this.w, h = this.h;
        const roofH = h * 0.45;
        const wallH = h - roofH;
        const wallY = this.y + roofH;
        const foundY = wallY + wallH - 10;
        const popCx = x + 22;
        const popCy = foundY - 10;

        const gfx = new PIXI.Graphics();
        // Mały białek (3-warstwowy: cien + main + highlight)
        gfx.beginFill(0x000000, 0.25);
        gfx.drawEllipse(0.5, 0.5, 2, 1);
        gfx.endFill();
        gfx.beginFill(COLORS.featherWhite, 0.95);
        gfx.drawEllipse(0, 0, 2.2, 1.2);
        gfx.endFill();
        gfx.beginFill(0xffffff, 1.0);
        gfx.drawEllipse(-0.4, -0.3, 1, 0.6);
        gfx.endFill();
        // Feather quill (drobna kreska)
        gfx.lineStyle(0.5, 0xd0c8b0, 0.85);
        gfx.moveTo(-1.5, 0);
        gfx.lineTo(2, 0);
        gfx.lineStyle(0);

        gfx.position.set(popCx, popCy);
        this.featherContainer.addChild(gfx);

        const driftX = (Math.random() - 0.5) * 0.3 + 0.2;  // drift lekko w prawo
        this.featherPuffs.push({
            gfx,
            spawnTime: this.time,
            driftX,
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — 6 Subtle Life animations
    // ═══════════════════════════════════════════════════════════
    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        this.time += 1 / 60;

        // 1. COCK HEAD BOBBING (peck pattern: fast down + slow recovery)
        const peckCycle = (this.time * 1.2) % (Math.PI * 2);
        const peckIntensity = peckCycle < Math.PI ? Math.sin(peckCycle) * 0.18 : 0;
        this.cockGfx.rotation = peckIntensity + Math.sin(this.time * 0.4) * 0.05;
        // Slight horizontal head sway
        this.cockGfx.skew.x = Math.sin(this.time * 0.7) * 0.04;

        // 2. WINDOW GLOW PULSE
        this.windowGlow.gfx.alpha = 0.78 + Math.sin(this.time * 2.0) * 0.22;

        // 3. CHICKEN PEEK Z POP HOLE (4s cycle: 2.5s pusto → 1.5s peek)
        const chickenCycle = (this.time + 1.8) % 4.0;
        if (chickenCycle < 2.5) {
            this.chickenPeekGfx.alpha = 0;
        } else if (chickenCycle < 3.1) {
            // Emerge (0.6s)
            const t = (chickenCycle - 2.5) / 0.6;
            const eased = 1 - Math.pow(1 - t, 2);  // ease-out quad
            this.chickenPeekGfx.alpha = eased;
            this.chickenPeekGfx.scale.set(0.85 + eased * 0.15);
        } else if (chickenCycle < 3.6) {
            // Visible steady z subtle bobbing (0.5s)
            this.chickenPeekGfx.alpha = 1;
            this.chickenPeekGfx.scale.set(1.0 + Math.sin(this.time * 8) * 0.04);
            this.chickenPeekGfx.rotation = Math.sin(this.time * 6) * 0.08;
        } else {
            // Retreat (0.4s)
            const t = (chickenCycle - 3.6) / 0.4;
            const eased = Math.pow(t, 2);  // ease-in quad
            this.chickenPeekGfx.alpha = 1 - eased;
            this.chickenPeekGfx.scale.set(1.0 - eased * 0.15);
        }

        // 4. DOOR CREAK (subtle wind sway)
        this.doorGfx.rotation = Math.sin(this.time * 0.3) * 0.012;

        // 5. FEATHER PUFF spawning (~6s interval, after chicken peeks)
        if (this.time - this.lastFeatherSpawn > 6 && Math.random() > 0.985) {
            this.spawnFeatherPuff();
            this.lastFeatherSpawn = this.time;
        }
        // Update existing feathers (drift up + fade)
        for (let i = this.featherPuffs.length - 1; i >= 0; i--) {
            const f = this.featherPuffs[i];
            const age = this.time - f.spawnTime;
            if (age > 3.5) {
                this.featherContainer.removeChild(f.gfx);
                f.gfx.destroy();
                this.featherPuffs.splice(i, 1);
                continue;
            }
            // Drift up + sideway
            f.gfx.y -= 0.25;
            f.gfx.x += f.driftX;
            // Fade (after 2s start fading)
            if (age > 2) {
                f.gfx.alpha = 1 - (age - 2) / 1.5;
            }
            // Rotation drift
            f.gfx.rotation += 0.02;
        }

        // 6. RAMP SWAY HINT (subtle, kura biegnąca)
        // Aktualnie ramp jest w staticContainer (NIE animowane). Subtle juice via skew na completa
        // ramp w animatedContainer wymagałby refactor — pominę dla v0.31.0, można dodać w polish
    }

    // ═══════════════════════════════════════════════════════════
    // EXTRA COLLIDABLES v0.31.1 — collision padding (tank wjeżdżał za mocno)
    // ═══════════════════════════════════════════════════════════
    public getExtraCollidables(): ICollidable[] {
        // Visual radius tank (~26px z TANK_CANVAS_SCALE 1.75) > collision padding 20px
        // Bez extras tank visualnie wchodzi 6px w hitbox.
        // Extra hitbox z PAD=10 wokół visual → tank stops 10px przed visual edge.
        const PAD = 10;
        return [{
            x: this.x - PAD,
            y: this.y - PAD,
            w: this.w + PAD * 2,
            h: this.h + PAD * 2,
            update: () => {},
        }];
    }
}