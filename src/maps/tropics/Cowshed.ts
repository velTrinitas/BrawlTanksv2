import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { fillGradientPolygon, makeRng, type Pt } from './FarmBuildingTextures';

/**
 * v0.32.0 FAZA T4c — COWSHED (obora) AAA PREMIUM
 *
 * Caribbean farmstead — aged wood + rust accent (vs henhouse teal, barn deep red).
 * Footprint 240×200 (większy od kurnika 130×110, mniejszy od barn 260×220).
 * Open front facing S — visible interior z krową, sianem, water trough, milk cans.
 *
 * 8 Subtle Life animations (vs 4 barn / 6 kurnik):
 *   1. Cow head sway (slow N-S motion)
 *   2. Cow tail flick (occasional sharp swing)
 *   3. Cow ear twitch (random both ears)
 *   4. Cow eye blink (very rare)
 *   5. Moo puff particle (~10s interval, fades up)
 *   6. Water trough ripples (continuous concentric)
 *   7. Bell sway na ridge (lekki wind motion)
 *   8. Fly buzzing wokół krowy (3-4 dots orbiting)
 *
 * CONTAINER STACK (zIndex bottom-up):
 *   -86: aoContainer        — extended SE drop shadow + contact ellipse
 *   -85: groundContainer    — cow tracks, dirt patches around base
 *   y+h-5: interiorContainer — wnętrze visible przez open front (hay, milk cans, water trough)
 *   y+h: staticContainer    — foundation, walls, roof, fascia, side posts, fences
 *   y+h: animatedContainer  — cow, sparrow, bell sway
 *   y+h+2: particleContainer — moo puffs, flies, hay drift
 */

const COLORS = {
    aoShadow:           0x000000,
    // Walls — aged darker wood (older than henhouse)
    wallWoodTop:        0xb8966a,
    wallWoodBot:        0x8a6534,
    wallWoodLight:      0xd4b287,
    wallWoodDeep:       0x4a3018,
    wallPlankSeam:      0x3a2410,
    // Rust accent (oxidized metal — farm hardware vibe)
    accentRust:         0xa05a2a,
    accentRustDk:       0x6b3818,
    accentRustLt:       0xc7794a,
    accentRustDeep:     0x4a2410,
    // Roof shingles (darker cedar than kurnik)
    shingleTop:         0x5a4326,
    shingleBot:         0x2e2010,
    shingleLight:       0x7e5e3c,
    shingleHighlight:   0xb38556,
    shingleOutline:     0x1a100a,
    // Foundation (shared style z barn/kurnik)
    foundation:         0x6b6058,
    foundationLight:    0x8c8279,
    foundationShadow:   0x453b34,
    foundationStone:    0x5a504a,
    // Fascia + ridge
    fascia:             0x3a1c0c,
    fasciaOutline:      0x140803,
    roofRidge:          0x2a1a0a,
    // Door (E side, drewniana z rust hinges)
    doorMain:           0x6e4423,
    doorDark:           0x3e2510,
    doorLight:          0x9c6a40,
    doorBrace:          0x4a2a14,
    doorHinge:          0x2a1a14,
    // Window (E side, mała)
    windowFrame:        0xc7794a,  // rust trim
    windowGlow:         0xfff4c0,
    windowGlowOuter:    0xffd070,
    windowHole:         0x0a0501,
    // Interior dim background
    interiorDim:        0x3a2818,
    interiorDimLt:      0x4e3820,
    interiorDimDk:      0x261810,
    // Hay piles
    hayBright:          0xe5b840,
    hayMid:             0xc89a30,
    hayShadow:          0xa07820,
    hayDeep:            0x6e5418,
    // Water trough
    troughWood:         0x6e4423,
    troughWoodLt:       0x9c6a40,
    troughWoodShadow:   0x3a2410,
    waterBlue:          0x5a8aaa,
    waterDark:          0x2a4a6a,
    waterHighlight:     0xa8c8e0,
    waterRipple:        0xc8dcec,
    // Milk cans (steel)
    milkCanBody:        0x9aa5b0,
    milkCanShadow:      0x5a6570,
    milkCanHighlight:   0xc8d5e0,
    milkCanDeep:        0x3a4550,
    milkCanRim:         0x7a8590,
    // Bell (copper, aged)
    bellCopper:         0xa8612a,
    bellCopperLt:       0xd48450,
    bellCopperDk:       0x6a3a14,
    bellRope:           0x5a3818,
    // Weather vane (rooster shape, dark iron)
    vaneIron:           0x2a2018,
    vaneIronLt:         0x4a3a2a,
    // Cow (Holstein-style, classic black & white spots)
    cowWhite:           0xf5f0e3,
    cowWhiteDeep:       0xd4cfc2,
    cowSpots:           0x2a1810,
    cowSpotsLt:         0x4a2818,
    cowHorns:           0xd9c5a0,
    cowHornsTip:        0x8a7050,
    cowEye:             0x1a0e05,
    cowEyeWhite:        0xf0e8d4,
    cowNose:            0xc26a5a,
    cowNoseDeep:        0x7a3838,
    cowMouth:           0x4a1818,
    cowEar:             0xebe2d0,
    cowEarInner:        0xc26a5a,
    cowHoof:            0x1a0e05,
    cowHoofLt:          0x3a2a1a,
    cowUdder:           0xe8b8a0,
    cowUdderTeat:       0xa86858,
    cowTongue:          0xd49888,
    // Sparrow na roof
    sparrowBody:        0x7a5a3a,
    sparrowBodyLt:      0x9c7a50,
    sparrowBeak:        0xd9a040,
    sparrowEye:         0x1a1a1a,
    // Particle moo (white puff)
    mooPuffWhite:       0xfffaf0,
    mooPuffEdge:        0xd4d0c0,
    // Fly (dark dots)
    flyDark:            0x1a1010,
    // Cow tracks na ground
    cowTrack:           0x4a3820,
    cowTrackLt:         0x6e5430,
    grassDirtPatch:     0x6e5a3a,
    // Hay scatter na floor
    haySrtaw:           0xd4a020,
    haySrtawDk:         0x8a6a14,
} as const;

// Layout constants
const ISO_RISE = 22;        // top side wall rise (proporcjonalne do 240 width)
const RIGHT_DEPTH = 36;     // side wall depth (3D look)
const FOUNDATION_H = 12;
const FOUNDATION_STICK = 3;
const FRONT_OPEN_H = 95;    // wysokość front opening (z 130 całkowite wall above foundation)
const FRONT_POST_W = 14;    // szerokość side post przy open front
const FRONT_CROSS_H = 18;   // wysokość cross beam over opening

export class Cowshed implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private aoContainer: PIXI.Container;
    private groundContainer: PIXI.Container;
    private interiorContainer: PIXI.Container;
    private staticContainer: PIXI.Container;
    private animatedContainer: PIXI.Container;
    private particleContainer: PIXI.Container;
    private worldContainer: PIXI.Container;

    // Animation state
    private elapsed = 0;
    private mooPuffTimer = 0;
    private mooPuffs: Array<{ g: PIXI.Graphics, age: number, vx: number, vy: number }> = [];
    private flies: Array<{ g: PIXI.Graphics, angle: number, radius: number, speed: number, cx: number, cy: number, dyOff: number }> = [];

    // Animated references (for per-frame updates)
    private cowHeadContainer: PIXI.Container | null = null;
    private cowTailContainer: PIXI.Container | null = null;
    private cowEarLContainer: PIXI.Container | null = null;
    private cowEarRContainer: PIXI.Container | null = null;
    private cowEyeContainer: PIXI.Container | null = null;
    private cowJawContainer: PIXI.Container | null = null;
    private cowMouthPos: { x: number, y: number } = { x: 0, y: 0 };
    private waterRippleG: PIXI.Graphics | null = null;
    private waterTroughPos: { x: number, y: number, w: number, h: number } = { x: 0, y: 0, w: 0, h: 0 };
    private bellContainer: PIXI.Container | null = null;
    private sparrowContainer: PIXI.Container | null = null;
    private hayFlutterG: PIXI.Graphics | null = null;
    private hayFlutterPos: Array<{ x: number, y: number, phase: number, len: number }> = [];

    constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.worldContainer = worldContainer;

        const rng = makeRng(seed);

        // ═══════════════════════════════════════════════════════════
        // CONTAINER SETUP — zIndex hierarchy
        // ═══════════════════════════════════════════════════════════
        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;
        worldContainer.addChild(this.aoContainer);

        this.groundContainer = new PIXI.Container();
        this.groundContainer.zIndex = -85;
        worldContainer.addChild(this.groundContainer);

        this.interiorContainer = new PIXI.Container();
        this.interiorContainer.zIndex = Math.floor(y + h) - 5;
        worldContainer.addChild(this.interiorContainer);

        this.staticContainer = new PIXI.Container();
        this.staticContainer.zIndex = Math.floor(y + h);
        worldContainer.addChild(this.staticContainer);

        this.animatedContainer = new PIXI.Container();
        this.animatedContainer.zIndex = Math.floor(y + h);
        worldContainer.addChild(this.animatedContainer);

        this.particleContainer = new PIXI.Container();
        this.particleContainer.zIndex = Math.floor(y + h) + 2;
        worldContainer.addChild(this.particleContainer);

        // ═══════════════════════════════════════════════════════════
        // RENDER ORDER (kolejność warstw)
        // ═══════════════════════════════════════════════════════════
        this.drawAO();
        this.drawGround(rng);
        this.drawInteriorBackground();
        this.drawInteriorContents(rng);
        this.drawStaticParts(rng);
        this.drawAnimatedParts(rng);
        this.initParticleSystems(rng);
    }

    // ═══════════════════════════════════════════════════════════
    // 1) DROP SHADOW (AO) — extended SE blob + contact ellipse
    // ═══════════════════════════════════════════════════════════
    private drawAO(): void {
        const { x, y, w, h } = this;
        const g = new PIXI.Graphics();
        const groundY = y + h;

        // Extended SE drop shadow (matches roof apex direction)
        g.beginFill(COLORS.aoShadow, 0.22);
        g.drawEllipse(x + w * 0.55, groundY + 4, w * 0.62, 22);
        g.endFill();

        // Soft inner shadow (broader, weaker)
        g.beginFill(COLORS.aoShadow, 0.12);
        g.drawEllipse(x + w * 0.5, groundY + 8, w * 0.72, 30);
        g.endFill();

        // Contact ellipse (tight under building)
        g.beginFill(COLORS.aoShadow, 0.35);
        g.drawEllipse(x + w * 0.5, groundY + 1, w * 0.5, 8);
        g.endFill();

        this.aoContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 2) GROUND DETAILS — cow tracks, dirt patches around base
    // ═══════════════════════════════════════════════════════════
    private drawGround(rng: () => number): void {
        const { x, y, w, h } = this;
        const groundY = y + h;
        const g = new PIXI.Graphics();

        // Worn dirt patch S front (path do open front - heavy traffic)
        g.beginFill(COLORS.grassDirtPatch, 0.55);
        g.drawEllipse(x + w * 0.5, groundY + 10, w * 0.42, 16);
        g.endFill();

        g.beginFill(COLORS.grassDirtPatch, 0.35);
        g.drawEllipse(x + w * 0.5, groundY + 18, w * 0.55, 22);
        g.endFill();

        // Cow tracks (małe owalne odciski racic - skupione na S front)
        const numTracks = 14;
        for (let i = 0; i < numTracks; i++) {
            const tx = x + w * 0.15 + rng() * w * 0.7;
            const ty = groundY + 8 + rng() * 32;
            const angle = rng() * Math.PI * 2;

            g.beginFill(COLORS.cowTrack, 0.4);
            g.drawEllipse(tx, ty, 4, 2.4);
            g.endFill();
        }

        // Trodden grass edge marks
        for (let i = 0; i < 6; i++) {
            const tx = x + w * 0.2 + rng() * w * 0.6;
            const ty = groundY + 24 + rng() * 12;
            g.beginFill(COLORS.cowTrackLt, 0.5);
            g.drawCircle(tx, ty, 2 + rng() * 1.5);
            g.endFill();
        }

        this.groundContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 3) INTERIOR BACKGROUND — dim wood visible przez open front
    // ═══════════════════════════════════════════════════════════
    private drawInteriorBackground(): void {
        const { x, y, w, h } = this;
        const foundY = y + h - FOUNDATION_H;
        const wallTopY = y + 30;
        const openTopY = foundY - FRONT_OPEN_H;

        const g = new PIXI.Graphics();

        // FIX v0.32.2: FULL facade backdrop — cover wszystkie ewentualne luki
        // (cross beam pas, między posts, etc.) — zlikwiduje zielony prześwit
        g.beginFill(COLORS.interiorDimDk, 1);
        g.drawRect(x, wallTopY, w, foundY - wallTopY);
        g.endFill();

        // Interior visible przez open front (extended X+Y range — sięga ZA cross beam)
        // X: x+4 (od side wall right edge) do x+w-4
        // Y: openTopY-4 (sięga do back wall bottom, no gap) do foundY
        const xL = x + 4;
        const xR = x + w - 4;
        const yT = openTopY - 4;
        const yB = foundY;

        // Inner interior gradient (dim wood)
        const points: Pt[] = [
            { x: xL, y: yT },
            { x: xR, y: yT },
            { x: xR, y: yB },
            { x: xL, y: yB },
        ];
        fillGradientPolygon(g, points, COLORS.interiorDim, COLORS.interiorDimDk);

        // Horizontal plank seams (4)
        for (let i = 1; i < 5; i++) {
            const ly = yT + (yB - yT) * (i / 5);
            g.lineStyle(1, COLORS.interiorDimDk, 0.6);
            g.moveTo(xL, ly);
            g.lineTo(xR, ly);
        }

        // Ambient light shaft from open front
        g.lineStyle(0);
        g.beginFill(COLORS.shingleHighlight, 0.06);
        g.drawRect(xL, yT, xR - xL, (yB - yT) * 0.35);
        g.endFill();

        // Floor patch (hay scatter)
        g.beginFill(COLORS.haySrtaw, 0.42);
        g.drawRect(xL, yB - 5, xR - xL, 5);
        g.endFill();

        this.interiorContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 4) INTERIOR CONTENTS — hay piles, water trough, milk cans, hay scatter
    // ═══════════════════════════════════════════════════════════
    private drawInteriorContents(rng: () => number): void {
        const { x, y, w, h } = this;
        const foundY = y + h - FOUNDATION_H;
        const openTopY = foundY - FRONT_OPEN_H;

        // Visible inner range
        const xL = x + FRONT_POST_W;
        const xR = x + w - FRONT_POST_W;
        const yB = foundY;

        // --- HAY PILES (2 sterty: lewa duża, prawa mniejsza) ---
        this.drawHayPile(rng, x + w * 0.18, yB - 4, 38, 26);
        this.drawHayPile(rng, x + w * 0.86, yB - 4, 24, 18);

        // --- WATER TROUGH (środek, przed krową) ---
        const troughCx = x + w * 0.32;
        const troughCy = yB - 8;
        const troughW = 58;
        const troughH = 16;
        this.drawWaterTrough(rng, troughCx, troughCy, troughW, troughH);
        this.waterTroughPos = { x: troughCx, y: troughCy, w: troughW, h: troughH };

        // --- MILK CANS (3, right back, varied heights) ---
        this.drawMilkCan(x + w * 0.78, yB - 10, 11);
        this.drawMilkCan(x + w * 0.88, yB - 8, 9);
        this.drawMilkCan(x + w * 0.72, yB - 6, 7); // smaller front

        // --- HAY SCATTER on floor (random strands) ---
        this.hayFlutterPos = [];
        const g = new PIXI.Graphics();
        for (let i = 0; i < 18; i++) {
            const sx = xL + rng() * (xR - xL);
            const sy = yB - 3 - rng() * 6;
            const angle = (rng() - 0.5) * 0.8;
            const len = 4 + rng() * 4;
            const color = rng() > 0.5 ? COLORS.haySrtaw : COLORS.haySrtawDk;
            g.lineStyle(0.8, color, 0.85);
            g.moveTo(sx, sy);
            g.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);

            // Track 5 strands for flutter animation
            if (i < 5) {
                this.hayFlutterPos.push({ x: sx, y: sy, phase: rng() * Math.PI * 2, len });
            }
        }
        g.lineStyle(0);

        // Pitchfork leaning against right side (small detail)
        this.drawPitchfork(g, x + w * 0.92, yB - 24, 18);

        this.interiorContainer.addChild(g);

        // Separate graphics dla hay flutter (will redraw per frame)
        this.hayFlutterG = new PIXI.Graphics();
        this.interiorContainer.addChild(this.hayFlutterG);
    }

    private drawHayPile(rng: () => number, cx: number, cy: number, hwidth: number, hheight: number): void {
        const g = new PIXI.Graphics();

        // Base pile (dome shape, gradient)
        const points: Pt[] = [];
        const seg = 16;
        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            const ang = Math.PI * (1 - t);
            const px = cx + Math.cos(ang) * hwidth;
            const py = cy - Math.sin(ang) * hheight;
            points.push({ x: px, y: py });
        }
        points.push({ x: cx + hwidth, y: cy });
        points.push({ x: cx - hwidth, y: cy });
        fillGradientPolygon(g, points, COLORS.hayBright, COLORS.hayShadow);

        // Highlight on top
        g.beginFill(COLORS.hayMid, 0.5);
        g.drawEllipse(cx, cy - hheight * 0.55, hwidth * 0.55, hheight * 0.18);
        g.endFill();

        // Random hay strands sticking out
        for (let i = 0; i < 14; i++) {
            const t = rng();
            const baseAng = Math.PI * (0.1 + t * 0.8);
            const baseR = hwidth * (0.65 + rng() * 0.3);
            const sx = cx + Math.cos(baseAng) * baseR;
            const sy = cy - Math.sin(baseAng) * hheight * (0.65 + rng() * 0.3);
            const tipAng = baseAng + (rng() - 0.5) * 0.5;
            const tipLen = 3 + rng() * 5;
            const tx = sx + Math.cos(tipAng) * tipLen;
            const ty = sy - Math.sin(tipAng) * tipLen;
            const color = rng() > 0.4 ? COLORS.haySrtaw : COLORS.hayDeep;
            g.lineStyle(1, color, 0.85);
            g.moveTo(sx, sy);
            g.lineTo(tx, ty);
        }
        g.lineStyle(0);

        // Outline
        g.lineStyle(1.2, COLORS.hayDeep, 0.7);
        g.moveTo(cx - hwidth, cy);
        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            const ang = Math.PI * (1 - t);
            const px = cx + Math.cos(ang) * hwidth;
            const py = cy - Math.sin(ang) * hheight;
            g.lineTo(px, py);
        }
        g.lineStyle(0);

        this.interiorContainer.addChild(g);
    }

    private drawWaterTrough(rng: () => number, cx: number, cy: number, tw: number, th: number): void {
        const g = new PIXI.Graphics();
        const halfW = tw / 2;
        const halfH = th / 2;

        // Trough wood frame (3D box, side perspective)
        const frontBL = { x: cx - halfW, y: cy + halfH };
        const frontBR = { x: cx + halfW, y: cy + halfH };
        const frontTL = { x: cx - halfW, y: cy - halfH };
        const frontTR = { x: cx + halfW, y: cy - halfH };
        const backTL = { x: cx - halfW * 0.95, y: cy - halfH - 2 };
        const backTR = { x: cx + halfW * 0.95, y: cy - halfH - 2 };

        // Back wall (visible top edge)
        const backPoints: Pt[] = [frontTL, backTL, backTR, frontTR];
        fillGradientPolygon(g, backPoints, COLORS.troughWoodLt, COLORS.troughWood);

        // Front wall
        const frontPoints: Pt[] = [frontTL, frontTR, frontBR, frontBL];
        fillGradientPolygon(g, frontPoints, COLORS.troughWood, COLORS.troughWoodShadow);

        // Water surface (inside, between back top edge and front top edge)
        const waterCenterY = cy - halfH + 1;
        const waterPoints: Pt[] = [
            { x: cx - halfW * 0.92, y: waterCenterY },
            { x: cx + halfW * 0.92, y: waterCenterY },
            { x: cx + halfW * 0.88, y: waterCenterY - 1 },
            { x: cx - halfW * 0.88, y: waterCenterY - 1 },
        ];
        fillGradientPolygon(g, waterPoints, COLORS.waterDark, COLORS.waterBlue);

        // Water surface highlight (top edge)
        g.lineStyle(1, COLORS.waterHighlight, 0.75);
        g.moveTo(cx - halfW * 0.85, waterCenterY - 0.8);
        g.lineTo(cx + halfW * 0.85, waterCenterY - 0.8);
        g.lineStyle(0);

        // Wood plank seams (3 vertical lines on front)
        for (let i = 1; i <= 3; i++) {
            const sx = cx - halfW + (tw * i) / 4;
            g.lineStyle(0.8, COLORS.troughWoodShadow, 0.7);
            g.moveTo(sx, cy - halfH);
            g.lineTo(sx, cy + halfH);
        }
        g.lineStyle(0);

        // Iron straps (2 horizontal, rust color)
        g.beginFill(COLORS.accentRust, 1);
        g.drawRect(cx - halfW, cy - halfH + 1, tw, 1.5);
        g.drawRect(cx - halfW, cy + halfH - 2.5, tw, 1.5);
        g.endFill();

        // Iron strap highlight (lighter top)
        g.beginFill(COLORS.accentRustLt, 0.5);
        g.drawRect(cx - halfW, cy - halfH + 0.8, tw, 0.5);
        g.endFill();

        // Outline
        g.lineStyle(1, COLORS.troughWoodShadow, 0.95);
        g.drawRect(cx - halfW, cy - halfH, tw, th);
        g.lineStyle(0);

        this.interiorContainer.addChild(g);

        // Separate graphics dla water ripples animation
        this.waterRippleG = new PIXI.Graphics();
        this.interiorContainer.addChild(this.waterRippleG);
    }

    private drawMilkCan(cx: number, cy: number, scale: number): void {
        const g = new PIXI.Graphics();
        const bodyW = scale * 1.4;
        const bodyH = scale * 2.2;
        const neckW = scale * 0.7;
        const neckH = scale * 0.5;
        const lidH = scale * 0.3;

        // Body (gradient cylinder)
        const bodyTL = { x: cx - bodyW / 2, y: cy - bodyH / 2 };
        const bodyTR = { x: cx + bodyW / 2, y: cy - bodyH / 2 };
        const bodyBL = { x: cx - bodyW / 2, y: cy + bodyH / 2 };
        const bodyBR = { x: cx + bodyW / 2, y: cy + bodyH / 2 };

        fillGradientPolygon(g, [bodyTL, bodyTR, bodyBR, bodyBL], COLORS.milkCanHighlight, COLORS.milkCanShadow);

        // Highlight strip (left side, vertical)
        g.beginFill(COLORS.milkCanHighlight, 0.6);
        g.drawRect(cx - bodyW / 2 + 0.5, cy - bodyH / 2 + 0.5, 1.2, bodyH - 1);
        g.endFill();

        // Shadow strip (right side, vertical)
        g.beginFill(COLORS.milkCanDeep, 0.5);
        g.drawRect(cx + bodyW / 2 - 1.5, cy - bodyH / 2 + 0.5, 1, bodyH - 1);
        g.endFill();

        // Neck (smaller cylinder above body)
        g.beginFill(COLORS.milkCanBody, 1);
        g.drawRect(cx - neckW / 2, cy - bodyH / 2 - neckH, neckW, neckH);
        g.endFill();

        // Lid (rounded top)
        g.beginFill(COLORS.milkCanRim, 1);
        g.drawEllipse(cx, cy - bodyH / 2 - neckH, neckW / 2 + 0.5, lidH);
        g.endFill();
        g.beginFill(COLORS.milkCanHighlight, 0.7);
        g.drawEllipse(cx - 0.3, cy - bodyH / 2 - neckH - 0.3, neckW / 2 - 0.5, lidH * 0.6);
        g.endFill();

        // Body horizontal stripes (rim decoration - rust accent)
        g.beginFill(COLORS.accentRust, 1);
        g.drawRect(cx - bodyW / 2, cy - bodyH * 0.2, bodyW, 0.8);
        g.drawRect(cx - bodyW / 2, cy + bodyH * 0.2, bodyW, 0.8);
        g.endFill();

        // Outline
        g.lineStyle(1, COLORS.milkCanDeep, 0.85);
        g.drawRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH);
        g.lineStyle(0);

        this.interiorContainer.addChild(g);
    }

    private drawPitchfork(g: PIXI.Graphics, cx: number, cy: number, height: number): void {
        const tineColor = COLORS.accentRust;

        // Handle (diagonal leaning)
        g.lineStyle(2, 0x7a5a2c, 1);
        g.moveTo(cx, cy);
        g.lineTo(cx - height * 0.3, cy - height);
        g.lineStyle(0);

        // 3 tines at top
        const tipX = cx - height * 0.3;
        const tipY = cy - height;
        g.lineStyle(1, tineColor, 1);
        for (let i = -1; i <= 1; i++) {
            g.moveTo(tipX + i * 0.5, tipY);
            g.lineTo(tipX + i * 2.5, tipY - 5);
        }
        g.lineStyle(0);
    }

    // ═══════════════════════════════════════════════════════════
    // 5) STATIC PARTS — foundation, walls, roof, side posts, bell, vane
    // ═══════════════════════════════════════════════════════════
    private drawStaticParts(rng: () => number): void {
        const { y, h } = this;
        const wallY = y + 30;
        const foundY = y + h - FOUNDATION_H;
        const groundY = y + h;
        const openTopY = foundY - FRONT_OPEN_H;

        this.drawFoundation(rng);
        this.drawBackWall(rng, wallY, foundY);
        this.drawLeftSideWall(wallY, foundY);
        this.drawRightSideWall(wallY, foundY);
        this.drawSideStickingOut(wallY, foundY);
        this.drawFrontPosts(openTopY, foundY);
        this.drawFrontCrossBeam(openTopY);
        this.drawSideFence(foundY, groundY);
        this.drawRoof(wallY);
        this.drawBellPost();
        this.drawWeatherVane();
        this.drawDecorations(wallY, foundY);
    }

    private drawFoundation(rng: () => number): void {
        const { x, y, w, h } = this;
        const foundY = y + h - FOUNDATION_H;
        const g = new PIXI.Graphics();

        const points: Pt[] = [
            { x: x - FOUNDATION_STICK, y: foundY },
            { x: x + w + FOUNDATION_STICK, y: foundY },
            { x: x + w + FOUNDATION_STICK, y: y + h },
            { x: x - FOUNDATION_STICK, y: y + h },
        ];
        fillGradientPolygon(g, points, COLORS.foundationLight, COLORS.foundationShadow);

        g.beginFill(COLORS.foundationLight, 0.9);
        g.drawRect(x - FOUNDATION_STICK, foundY, w + FOUNDATION_STICK * 2, 1.5);
        g.endFill();

        // 8 random stones
        for (let i = 0; i < 8; i++) {
            const sx = x + 6 + rng() * (w - 12);
            const sy = foundY + 2 + rng() * (FOUNDATION_H - 4);
            const sr = 1.6 + rng() * 1.8;
            const dark = rng() > 0.5;
            g.beginFill(dark ? COLORS.foundationShadow : COLORS.foundationStone, 0.85);
            g.drawCircle(sx, sy, sr);
            g.endFill();
            g.beginFill(COLORS.foundationLight, 0.6);
            g.drawCircle(sx - 0.3, sy - 0.4, sr * 0.4);
            g.endFill();
        }

        // 3 hairline cracks
        for (let i = 0; i < 3; i++) {
            const cx = x + 12 + rng() * (w - 24);
            const cy = foundY + 4 + rng() * (FOUNDATION_H - 6);
            g.lineStyle(0.6, COLORS.foundationShadow, 0.7);
            g.moveTo(cx, cy);
            g.lineTo(cx + (rng() - 0.5) * 6, cy + 2 + rng() * 3);
            g.lineStyle(0);
        }

        g.lineStyle(1, COLORS.foundationShadow, 0.9);
        g.drawRect(x - FOUNDATION_STICK, foundY, w + FOUNDATION_STICK * 2, FOUNDATION_H);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawBackWall(rng: () => number, wallY: number, foundY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();
        // CRITICAL: Back wall rysuje TYLKO TOP PART (powyżej open front)
        // Pełen wall zakrywał interior — bug v0.32.0
        const openTopY = foundY - FRONT_OPEN_H;
        const wallBottomY = openTopY; // wall kończy się na top of opening
        const wallH = wallBottomY - wallY;

        const points: Pt[] = [
            { x, y: wallY },
            { x: x + w, y: wallY },
            { x: x + w, y: wallBottomY },
            { x, y: wallBottomY },
        ];
        fillGradientPolygon(g, points, COLORS.wallWoodTop, COLORS.wallWoodBot);

        // 10 vertical plank seams + nails (krótsze teraz)
        for (let i = 1; i < 10; i++) {
            const px = x + (w * i) / 10;
            const jitter = (rng() - 0.5) * 1.2;
            g.lineStyle(1, COLORS.wallPlankSeam, 0.85);
            g.moveTo(px + jitter, wallY);
            g.lineTo(px + jitter, wallBottomY);
            g.lineStyle(0);
            this.drawNail(g, px + jitter, wallY + 3);
            this.drawNail(g, px + jitter, wallBottomY - 3);
        }

        // Knots (3 dla mniejszej powierzchni)
        for (let i = 0; i < 3; i++) {
            const dx = x + 8 + rng() * (w - 16);
            const dy = wallY + 6 + rng() * (wallH - 12);
            const dr = 1.2 + rng() * 1.8;
            g.beginFill(COLORS.wallWoodDeep, 0.9);
            g.drawEllipse(dx, dy, dr * 1.2, dr * 0.8);
            g.endFill();
            g.lineStyle(0.6, COLORS.wallPlankSeam, 0.7);
            g.drawEllipse(dx, dy, dr * 0.7, dr * 0.4);
            g.lineStyle(0);
        }

        // Cross-brace (decoracyjny — 1 across middle of TOP wall)
        g.beginFill(COLORS.wallWoodDeep, 0.85);
        g.drawRect(x + 4, wallY + wallH * 0.5, w - 8, 3.5);
        g.endFill();
        g.beginFill(COLORS.wallWoodLight, 0.5);
        g.drawRect(x + 4, wallY + wallH * 0.5, w - 8, 1);
        g.endFill();
        // 5 iron bolts
        for (let i = 0; i < 5; i++) {
            const bx = x + 8 + (w - 16) * (i / 4);
            const by = wallY + wallH * 0.5 + 1.5;
            g.beginFill(COLORS.accentRust, 1);
            g.drawCircle(bx, by, 1.5);
            g.endFill();
            g.beginFill(COLORS.accentRustLt, 0.7);
            g.drawCircle(bx - 0.3, by - 0.3, 0.6);
            g.endFill();
        }

        g.beginFill(COLORS.wallWoodLight, 0.55);
        g.drawRect(x, wallY, w, 2);
        g.endFill();
        g.lineStyle(1.2, COLORS.wallWoodDeep, 0.9);
        g.drawRect(x, wallY, w, wallH);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawLeftSideWall(wallY: number, foundY: number): void {
        const { x } = this;
        const g = new PIXI.Graphics();
        const sideW = 6;
        const points: Pt[] = [
            { x, y: wallY },
            { x: x + sideW, y: wallY },
            { x: x + sideW, y: foundY },
            { x, y: foundY },
        ];
        fillGradientPolygon(g, points, COLORS.wallWoodDeep, COLORS.wallWoodTop);
        g.lineStyle(1, COLORS.wallWoodDeep, 0.9);
        g.drawRect(x, wallY, sideW, foundY - wallY);
        g.lineStyle(0);
        this.staticContainer.addChild(g);
    }

    private drawRightSideWall(wallY: number, foundY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();
        const sideW = 6;
        const points: Pt[] = [
            { x: x + w - sideW, y: wallY },
            { x: x + w, y: wallY },
            { x: x + w, y: foundY },
            { x: x + w - sideW, y: foundY },
        ];
        fillGradientPolygon(g, points, COLORS.wallWoodTop, COLORS.wallWoodDeep);
        g.lineStyle(1, COLORS.wallWoodDeep, 0.9);
        g.drawRect(x + w - sideW, wallY, sideW, foundY - wallY);
        g.lineStyle(0);
        this.staticContainer.addChild(g);
    }

    private drawSideStickingOut(wallY: number, foundY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();
        const topL = { x: x + w, y: wallY };
        const topR = { x: x + w + RIGHT_DEPTH, y: wallY - ISO_RISE };
        const botR = { x: x + w + RIGHT_DEPTH, y: foundY - ISO_RISE };
        const botL = { x: x + w, y: foundY };
        fillGradientPolygon(g, [topL, topR, botR, botL], COLORS.wallWoodTop, COLORS.wallWoodBot);

        for (let i = 1; i < 4; i++) {
            const t = i / 4;
            const sx = topL.x + (topR.x - topL.x) * t;
            const sy = topL.y + (topR.y - topL.y) * t;
            const ex = botL.x + (botR.x - botL.x) * t;
            const ey = botL.y + (botR.y - botL.y) * t;
            g.lineStyle(0.8, COLORS.wallPlankSeam, 0.8);
            g.moveTo(sx, sy);
            g.lineTo(ex, ey);
            g.lineStyle(0);
        }

        const stickFoundPoints: Pt[] = [
            { x: x + w, y: foundY },
            { x: x + w + RIGHT_DEPTH, y: foundY - ISO_RISE },
            { x: x + w + RIGHT_DEPTH, y: foundY - ISO_RISE + FOUNDATION_H },
            { x: x + w, y: foundY + FOUNDATION_H },
        ];
        fillGradientPolygon(g, stickFoundPoints, COLORS.foundationLight, COLORS.foundationShadow);

        g.lineStyle(1.2, COLORS.wallWoodDeep, 0.9);
        g.moveTo(topL.x, topL.y);
        g.lineTo(topR.x, topR.y);
        g.lineTo(botR.x, botR.y);
        g.lineTo(botL.x, botL.y);
        g.closePath();
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawFrontPosts(openTopY: number, foundY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();
        const postH = foundY - openTopY;

        const lPostX = x + 6;
        const rPostX = x + w - 6 - FRONT_POST_W;

        for (const px of [lPostX, rPostX]) {
            const points: Pt[] = [
                { x: px, y: openTopY },
                { x: px + FRONT_POST_W, y: openTopY },
                { x: px + FRONT_POST_W, y: foundY },
                { x: px, y: foundY },
            ];
            fillGradientPolygon(g, points, COLORS.wallWoodLight, COLORS.wallWoodDeep);

            // 3 iron straps
            for (let i = 0; i < 3; i++) {
                const sy = openTopY + (postH * (i + 1)) / 4;
                g.beginFill(COLORS.accentRust, 1);
                g.drawRect(px, sy - 1, FRONT_POST_W, 2);
                g.endFill();
                g.beginFill(COLORS.accentRustLt, 0.6);
                g.drawRect(px, sy - 1, FRONT_POST_W, 0.6);
                g.endFill();
                g.beginFill(COLORS.accentRustDeep, 1);
                g.drawCircle(px + 3, sy, 0.9);
                g.drawCircle(px + FRONT_POST_W - 3, sy, 0.9);
                g.endFill();
            }

            g.lineStyle(1.2, COLORS.wallWoodDeep, 0.9);
            g.drawRect(px, openTopY, FRONT_POST_W, postH);
            g.lineStyle(0);

            g.beginFill(COLORS.wallWoodLight, 0.7);
            g.drawRect(px + 0.5, openTopY + 1, 1.5, postH - 2);
            g.endFill();
        }

        this.staticContainer.addChild(g);
    }

    private drawFrontCrossBeam(openTopY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();
        const beamY = openTopY - 2;

        const points: Pt[] = [
            { x: x + 4, y: beamY },
            { x: x + w - 4, y: beamY },
            { x: x + w - 4, y: beamY + FRONT_CROSS_H },
            { x: x + 4, y: beamY + FRONT_CROSS_H },
        ];
        fillGradientPolygon(g, points, COLORS.wallWoodLight, COLORS.wallWoodDeep);

        // Wood grain
        for (let i = 0; i < 3; i++) {
            const sy = beamY + 3 + i * 4;
            g.lineStyle(0.6, COLORS.wallWoodDeep, 0.45);
            g.moveTo(x + 6, sy);
            g.lineTo(x + w - 6, sy);
            g.lineStyle(0);
        }

        // Iron corner brackets
        const bracketW = 12;
        const bracketH = 8;
        for (const cx of [x + 6, x + w - 6 - bracketW]) {
            g.beginFill(COLORS.accentRust, 1);
            g.drawRect(cx, beamY, bracketW, bracketH);
            g.endFill();
            g.beginFill(COLORS.accentRustLt, 0.5);
            g.drawRect(cx, beamY, bracketW, 2);
            g.endFill();
            for (let i = 0; i < 4; i++) {
                const bx = cx + 2 + (i % 2) * (bracketW - 4);
                const by = beamY + 1.5 + Math.floor(i / 2) * 4;
                g.beginFill(COLORS.accentRustDeep, 1);
                g.drawCircle(bx, by, 0.9);
                g.endFill();
            }
        }

        g.lineStyle(1.2, COLORS.wallWoodDeep, 0.9);
        g.drawRect(x + 4, beamY, w - 8, FRONT_CROSS_H);
        g.lineStyle(0);

        // Decorative carved notches (3 triangles)
        for (let i = 0; i < 3; i++) {
            const nx = x + w * (0.3 + i * 0.2);
            const ny = beamY + FRONT_CROSS_H;
            g.beginFill(COLORS.wallWoodDeep, 0.95);
            g.moveTo(nx - 3, ny);
            g.lineTo(nx + 3, ny);
            g.lineTo(nx, ny + 3);
            g.closePath();
            g.endFill();
        }

        this.staticContainer.addChild(g);
    }

    private drawSideFence(foundY: number, groundY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();
        const fenceH = 16;
        const fenceTopY = groundY - fenceH;
        const numPosts = 4;

        // LEFT segment
        const lStartX = x - 8;
        const lWidth = 12;
        // Top + bottom rails
        g.beginFill(COLORS.wallWoodTop, 1);
        g.drawRect(lStartX, fenceTopY, lWidth, 2);
        g.drawRect(lStartX, fenceTopY + fenceH - 3, lWidth, 2);
        g.endFill();
        for (let i = 0; i < numPosts; i++) {
            const px = lStartX + (lWidth * i) / (numPosts - 1) - 0.5;
            g.beginFill(COLORS.wallWoodDeep, 1);
            g.drawRect(px, fenceTopY, 1.5, fenceH);
            g.endFill();
        }

        // RIGHT segment
        const rStartX = x + w - 4;
        const rWidth = 12;
        g.beginFill(COLORS.wallWoodTop, 1);
        g.drawRect(rStartX, fenceTopY, rWidth, 2);
        g.drawRect(rStartX, fenceTopY + fenceH - 3, rWidth, 2);
        g.endFill();
        for (let i = 0; i < numPosts; i++) {
            const px = rStartX + (rWidth * i) / (numPosts - 1) - 0.5;
            g.beginFill(COLORS.wallWoodDeep, 1);
            g.drawRect(px, fenceTopY, 1.5, fenceH);
            g.endFill();
        }

        g.lineStyle(0.8, COLORS.wallWoodDeep, 0.8);
        g.drawRect(lStartX, fenceTopY, lWidth, 2);
        g.drawRect(rStartX, fenceTopY, rWidth, 2);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawRoof(wallY: number): void {
        const { x, y, w } = this;
        const g = new PIXI.Graphics();
        const apexY = y - 5;
        const apexX = x + w * 0.5;
        const eaveOverhang = 10;

        // FIX v0.32.2: SINGLE APEX approach (jak BarnBuilding) — 2 trójkątne połowy
        // Stare 4-point back slope (rBackL/rBackR/apexBack) wyglądało nienaturalnie
        const rFrontL: Pt = { x: x - eaveOverhang, y: wallY };
        const rFrontR: Pt = { x: x + w + eaveOverhang, y: wallY };
        // rSideBack = top-back point of sticking-out side wall (matches parallelogram exactly)
        const rSideBack: Pt = { x: x + w + RIGHT_DEPTH + eaveOverhang / 2, y: wallY - ISO_RISE };
        const rApex: Pt = { x: apexX, y: apexY };

        // === RIGHT SLOPE — TRÓJKĄT (apex / frontR / sideBack) ===
        fillGradientPolygon(g, [rApex, rFrontR, rSideBack], COLORS.shingleTop, COLORS.shingleBot);
        this.drawIsoRoofTilesTriangle(g, rApex, rFrontR, rSideBack);

        // === FRONT SLOPE — TRÓJKĄT (frontL / apex / frontR) ===
        fillGradientPolygon(g, [rFrontL, rFrontR, rApex], COLORS.shingleHighlight, COLORS.shingleBot);
        this.drawShingles(g, rFrontL, rFrontR, rApex);

        // === RIDGE BEAM — krótki stub od apex w stronę back ===
        const ridgeEndX = rApex.x + RIGHT_DEPTH * 0.4;
        const ridgeEndY = rApex.y - ISO_RISE * 0.6;
        g.lineStyle(3, COLORS.roofRidge, 1);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(ridgeEndX, ridgeEndY);
        g.lineStyle(0);
        g.lineStyle(1, COLORS.shingleHighlight, 0.85);
        g.moveTo(rApex.x - 1, rApex.y - 2);
        g.lineTo(ridgeEndX - 1, ridgeEndY - 2);
        g.lineStyle(0);

        // === FASCIA — front + side (matching iso slope) ===
        const FASCIA_H = 5;
        // Front fascia
        g.beginFill(COLORS.fascia, 1);
        g.drawRect(rFrontL.x, rFrontL.y - 1, rFrontR.x - rFrontL.x, FASCIA_H);
        g.endFill();
        g.beginFill(COLORS.shingleLight, 0.4);
        g.drawRect(rFrontL.x, rFrontL.y - 1, rFrontR.x - rFrontL.x, 1.2);
        g.endFill();
        g.lineStyle(0.8, COLORS.fasciaOutline, 0.95);
        g.drawRect(rFrontL.x, rFrontL.y - 1, rFrontR.x - rFrontL.x, FASCIA_H);
        g.lineStyle(0);

        // Side fascia (skewed parallelogram matching iso slope)
        g.beginFill(COLORS.fascia, 1);
        g.drawPolygon([
            rFrontR.x, rFrontR.y - 1,
            rSideBack.x, rSideBack.y - 1,
            rSideBack.x, rSideBack.y - 1 + FASCIA_H,
            rFrontR.x, rFrontR.y - 1 + FASCIA_H,
        ]);
        g.endFill();
        g.lineStyle(0.8, COLORS.fasciaOutline, 0.95);
        g.moveTo(rFrontR.x, rFrontR.y - 1 + FASCIA_H);
        g.lineTo(rSideBack.x, rSideBack.y - 1 + FASCIA_H);
        g.lineStyle(0);

        // Fascia bolts (front only)
        for (let i = 0; i < 8; i++) {
            const bx = rFrontL.x + ((rFrontR.x - rFrontL.x) * (i + 0.5)) / 8;
            const by = rFrontL.y + 1.5;
            g.beginFill(COLORS.accentRust, 1);
            g.drawCircle(bx, by, 1);
            g.endFill();
            g.beginFill(COLORS.accentRustLt, 0.6);
            g.drawCircle(bx - 0.3, by - 0.3, 0.35);
            g.endFill();
        }

        // === ROOF EDGE OUTLINES + RIM LIGHT ===
        // Front-left edge rim light (sun catches)
        g.lineStyle(2.5, COLORS.shingleHighlight, 0.9);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineStyle(0);
        // Apex → frontR
        g.lineStyle(2, COLORS.shingleLight, 0.8);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(0);
        // Bottom outlines (chunky brawl-style)
        g.lineStyle(2, COLORS.shingleOutline, 0.95);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        // Right slope outlines
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(rSideBack.x, rSideBack.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawIsoRoofTilesTriangle(g: PIXI.Graphics, apex: Pt, frontR: Pt, sideBack: Pt): void {
        // Trójkątne tiles na right slope: rzędy od front-back edge ku apex (jak Barn)
        const ROWS = 4;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            const lerpLeftX = frontR.x + (apex.x - frontR.x) * t;
            const lerpLeftY = frontR.y + (apex.y - frontR.y) * t;
            const lerpRightX = sideBack.x + (apex.x - sideBack.x) * t;
            const lerpRightY = sideBack.y + (apex.y - sideBack.y) * t;

            // Shadow under row
            g.lineStyle(2.5, COLORS.shingleOutline, 0.4);
            g.moveTo(lerpLeftX, lerpLeftY + 2);
            g.lineTo(lerpRightX, lerpRightY + 2);
            g.lineStyle(0);

            // Row outline
            g.lineStyle(1.5, COLORS.shingleOutline, 0.7);
            g.moveTo(lerpLeftX, lerpLeftY);
            g.lineTo(lerpRightX, lerpRightY);
            g.lineStyle(0);

            // Row highlight
            g.lineStyle(1.2, COLORS.shingleHighlight, 0.7);
            g.moveTo(lerpLeftX, lerpLeftY - 1.5);
            g.lineTo(lerpRightX, lerpRightY - 1.5);
            g.lineStyle(0);
        }
    }

    private drawShingles(g: PIXI.Graphics, pL: Pt, pR: Pt, apex: Pt): void {
        const rows = 6;
        // FIX v0.32.1: T-parameter trapezoidal slabs (X-clipping wystawały poza slope)
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

                // Bottom edge interpolation (leftStart-rightStart line)
                const sx1 = leftStart.x + (rightStart.x - leftStart.x) * tc1;
                const sy1 = leftStart.y + (rightStart.y - leftStart.y) * tc1;
                const sx2 = leftStart.x + (rightStart.x - leftStart.x) * tc2;
                const sy2 = leftStart.y + (rightStart.y - leftStart.y) * tc2;
                // Top edge interpolation (leftEnd-rightEnd line)
                const sx1b = leftEnd.x + (rightEnd.x - leftEnd.x) * tc1;
                const sy1b = leftEnd.y + (rightEnd.y - leftEnd.y) * tc1;
                const sx2b = leftEnd.x + (rightEnd.x - leftEnd.x) * tc2;
                const sy2b = leftEnd.y + (rightEnd.y - leftEnd.y) * tc2;

                const variant = (row + s * 3) % 4;
                const color = variant === 0 ? COLORS.shingleTop :
                    variant === 1 ? COLORS.shingleBot :
                    variant === 2 ? COLORS.shingleLight :
                    COLORS.shingleHighlight;

                g.lineStyle(0.6, COLORS.shingleOutline, 0.75);
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
        const rng = makeRng(7777);
        for (let i = 0; i < 8; i++) {
            const tu = rng();
            const tv = rng() * 0.95;
            const baseX = pL.x + (pR.x - pL.x) * tu;
            const sx = baseX + (apex.x - baseX) * tv;
            const sy = pL.y + (apex.y - pL.y) * tv;
            g.beginFill(COLORS.shingleHighlight, 0.55);
            g.drawEllipse(sx, sy, 5, 2);
            g.endFill();
        }
    }

    private drawBellPost(): void {
        const { x, w, y } = this;
        const apexY = y - 5;
        const apexX = x + w * 0.5;
        const postX = apexX - 1;
        const postTopY = apexY - 14;
        const postH = 14;

        const g = new PIXI.Graphics();
        g.beginFill(COLORS.wallWoodDeep, 1);
        g.drawRect(postX, postTopY, 2, postH);
        g.endFill();
        g.lineStyle(0.6, COLORS.fasciaOutline, 0.9);
        g.drawRect(postX, postTopY, 2, postH);
        g.lineStyle(0);

        // Cross piece (T-bar)
        g.beginFill(COLORS.wallWoodDeep, 1);
        g.drawRect(postX - 5, postTopY - 1, 12, 2);
        g.endFill();
        g.lineStyle(0.6, COLORS.fasciaOutline, 0.9);
        g.drawRect(postX - 5, postTopY - 1, 12, 2);
        g.lineStyle(0);

        // Iron clamp
        g.beginFill(COLORS.accentRust, 1);
        g.drawRect(postX - 1, postTopY - 0.5, 4, 1);
        g.endFill();

        this.staticContainer.addChild(g);

        // BELL — separate container for swing animation
        this.bellContainer = new PIXI.Container();
        this.bellContainer.x = apexX;
        this.bellContainer.y = postTopY + 1;
        this.staticContainer.addChild(this.bellContainer);

        const bellG = new PIXI.Graphics();
        const bellW = 9;
        const bellH = 11;

        // Rope
        bellG.lineStyle(1, COLORS.bellRope, 0.9);
        bellG.moveTo(0, 0);
        bellG.lineTo(0, 2);
        bellG.lineStyle(0);

        // Bell body (trapezoid gradient)
        const bellPoints: Pt[] = [
            { x: -bellW * 0.35, y: 2 },
            { x: bellW * 0.35, y: 2 },
            { x: bellW * 0.5, y: 2 + bellH },
            { x: -bellW * 0.5, y: 2 + bellH },
        ];
        fillGradientPolygon(bellG, bellPoints, COLORS.bellCopperLt, COLORS.bellCopperDk);

        // Highlight strip
        bellG.beginFill(COLORS.bellCopperLt, 0.7);
        bellG.drawRect(-bellW * 0.4, 3, 1.2, bellH - 2);
        bellG.endFill();
        // Shadow strip
        bellG.beginFill(COLORS.bellCopperDk, 0.5);
        bellG.drawRect(bellW * 0.3, 3, 1.5, bellH - 2);
        bellG.endFill();
        // Rim (bottom flare)
        bellG.beginFill(COLORS.bellCopperDk, 1);
        bellG.drawEllipse(0, 2 + bellH, bellW * 0.55, 1.4);
        bellG.endFill();
        bellG.beginFill(COLORS.bellCopper, 1);
        bellG.drawEllipse(0, 2 + bellH - 0.4, bellW * 0.5, 1);
        bellG.endFill();
        // Inner hollow
        bellG.beginFill(COLORS.bellCopperDk, 0.85);
        bellG.drawEllipse(0, 2 + bellH, bellW * 0.32, 0.8);
        bellG.endFill();
        // Clapper
        bellG.beginFill(COLORS.bellCopperDk, 1);
        bellG.drawCircle(0, 2 + bellH * 0.7, 0.9);
        bellG.endFill();
        // Outline
        bellG.lineStyle(0.8, COLORS.bellCopperDk, 0.9);
        bellG.moveTo(-bellW * 0.35, 2);
        bellG.lineTo(bellW * 0.35, 2);
        bellG.lineTo(bellW * 0.5, 2 + bellH);
        bellG.lineTo(-bellW * 0.5, 2 + bellH);
        bellG.closePath();
        bellG.lineStyle(0);
        // Top mount
        bellG.beginFill(COLORS.bellCopperDk, 1);
        bellG.drawRect(-1.5, 1, 3, 2);
        bellG.endFill();

        this.bellContainer.addChild(bellG);
    }

    private drawWeatherVane(): void {
        const { x, w, y } = this;
        const apexY = y - 5;
        const apexX = x + w * 0.5;
        // FIX v0.32.2: vane na ridge END stub (apex + RIGHT_DEPTH*0.4, apex - ISO_RISE*0.6)
        const vaneX = apexX + RIGHT_DEPTH * 0.4 + 2;
        const vaneY = apexY - ISO_RISE * 0.6 - 14;

        const g = new PIXI.Graphics();

        // Vertical post
        g.lineStyle(2, COLORS.vaneIron, 1);
        g.moveTo(vaneX, vaneY);
        g.lineTo(vaneX, vaneY + 18);
        g.lineStyle(0);

        // Ball on top
        g.beginFill(COLORS.vaneIron, 1);
        g.drawCircle(vaneX, vaneY - 1, 1.8);
        g.endFill();
        g.beginFill(COLORS.vaneIronLt, 0.6);
        g.drawCircle(vaneX - 0.5, vaneY - 1.5, 0.7);
        g.endFill();

        // N indicator bar
        g.beginFill(COLORS.vaneIron, 1);
        g.drawRect(vaneX - 3, vaneY + 4, 6, 1);
        g.endFill();

        // Rooster silhouette (sideways)
        const rX = vaneX + 2;
        const rY = vaneY + 8;
        g.beginFill(COLORS.vaneIron, 1);
        g.drawEllipse(rX, rY, 5, 3);
        // Tail fan
        g.moveTo(rX - 4, rY);
        g.lineTo(rX - 8, rY - 4);
        g.lineTo(rX - 6, rY - 1);
        g.lineTo(rX - 8, rY);
        g.lineTo(rX - 6, rY + 1);
        g.lineTo(rX - 8, rY + 4);
        g.lineTo(rX - 4, rY);
        g.closePath();
        g.endFill();
        // Head
        g.beginFill(COLORS.vaneIron, 1);
        g.drawCircle(rX + 4, rY - 1.5, 1.8);
        g.endFill();
        // Comb spikes
        for (let i = 0; i < 3; i++) {
            g.moveTo(rX + 3 + i, rY - 3);
            g.lineTo(rX + 3.5 + i, rY - 4.5);
            g.lineTo(rX + 4 + i, rY - 3);
            g.closePath();
        }
        // Beak
        g.beginFill(COLORS.vaneIron, 1);
        g.moveTo(rX + 5.5, rY - 1.5);
        g.lineTo(rX + 7.5, rY - 1);
        g.lineTo(rX + 5.5, rY - 0.5);
        g.closePath();
        g.endFill();

        this.staticContainer.addChild(g);
    }

    private drawDecorations(wallY: number, foundY: number): void {
        const { x, w } = this;
        const g = new PIXI.Graphics();

        // Rope coiled on left post
        const ropeX = x + 8;
        const ropeY = foundY - 30;
        g.lineStyle(1.5, COLORS.bellRope, 0.95);
        for (let i = 0; i < 3; i++) {
            g.drawEllipse(ropeX, ropeY + i * 2, 4, 1.2);
        }
        g.lineStyle(0);
        g.beginFill(COLORS.bellRope, 1);
        g.drawCircle(ropeX, ropeY + 7, 1.2);
        g.endFill();

        // Hanging lantern na cross beam (BIGGER v0.32.1 — 2× scale)
        const lanternX = x + w * 0.5 - 32;
        const lanternY = wallY + 28;
        // Chain z linkami (3 ovals)
        g.lineStyle(0.8, COLORS.accentRustDk, 1);
        g.moveTo(lanternX, lanternY - 16);
        g.lineTo(lanternX, lanternY);
        g.lineStyle(0);
        for (let li = 0; li < 3; li++) {
            g.lineStyle(0.8, COLORS.accentRustLt, 0.95);
            g.drawEllipse(lanternX, lanternY - 12 + li * 4, 1.3, 1.5);
            g.lineStyle(0);
        }
        // Top cap (larger)
        g.beginFill(COLORS.accentRustDk, 1);
        g.drawRect(lanternX - 8, lanternY - 2, 16, 3);
        g.endFill();
        g.beginFill(COLORS.accentRustLt, 0.5);
        g.drawRect(lanternX - 8, lanternY - 2, 16, 1);
        g.endFill();
        // Frame (BIGGER 14×16)
        g.beginFill(COLORS.accentRustDk, 1);
        g.drawRect(lanternX - 7, lanternY, 14, 16);
        g.endFill();
        // Glass body (inner glow space 10×12)
        g.beginFill(COLORS.windowGlow, 0.95);
        g.drawRect(lanternX - 5, lanternY + 2, 10, 12);
        g.endFill();
        // Inner bright flame core
        g.beginFill(COLORS.windowGlowOuter, 1);
        g.drawCircle(lanternX, lanternY + 8, 3);
        g.endFill();
        g.beginFill(COLORS.windowGlow, 1);
        g.drawCircle(lanternX, lanternY + 7, 1.8);
        g.endFill();
        // Frame outline + 4 vertical bars (decorative)
        g.lineStyle(0.6, COLORS.accentRustDeep, 0.95);
        g.drawRect(lanternX - 7, lanternY, 14, 16);
        g.moveTo(lanternX - 4, lanternY); g.lineTo(lanternX - 4, lanternY + 16);
        g.moveTo(lanternX, lanternY); g.lineTo(lanternX, lanternY + 16);
        g.moveTo(lanternX + 4, lanternY); g.lineTo(lanternX + 4, lanternY + 16);
        g.lineStyle(0);
        // Bottom cap
        g.beginFill(COLORS.accentRustDk, 1);
        g.drawRect(lanternX - 8, lanternY + 16, 16, 3);
        g.endFill();
        // Bigger glow halo
        g.beginFill(COLORS.windowGlow, 0.22);
        g.drawCircle(lanternX, lanternY + 8, 18);
        g.endFill();
        g.beginFill(COLORS.windowGlow, 0.12);
        g.drawCircle(lanternX, lanternY + 8, 28);
        g.endFill();

        // Wooden sign na right post
        const signX = x + w - 12;
        const signY = foundY - 35;
        g.beginFill(COLORS.wallWoodTop, 1);
        g.drawRect(signX - 6, signY, 12, 8);
        g.endFill();
        g.beginFill(COLORS.wallWoodLight, 0.5);
        g.drawRect(signX - 6, signY, 12, 2);
        g.endFill();
        g.beginFill(COLORS.accentRustDeep, 1);
        g.drawCircle(signX - 4, signY + 2, 0.6);
        g.drawCircle(signX + 4, signY + 2, 0.6);
        g.drawCircle(signX - 4, signY + 6, 0.6);
        g.drawCircle(signX + 4, signY + 6, 0.6);
        g.endFill();
        g.lineStyle(0.8, COLORS.bellRope, 0.95);
        g.moveTo(signX - 4, signY);
        g.lineTo(signX - 4, signY - 4);
        g.moveTo(signX + 4, signY);
        g.lineTo(signX + 4, signY - 4);
        g.lineStyle(0);
        // Cow icon
        g.beginFill(COLORS.cowSpots, 1);
        g.drawEllipse(signX, signY + 4, 3.5, 1.8);
        g.endFill();
        g.beginFill(COLORS.cowWhite, 1);
        g.drawEllipse(signX, signY + 4, 2.5, 1.2);
        g.endFill();
        g.lineStyle(0.8, COLORS.wallWoodDeep, 0.9);
        g.drawRect(signX - 6, signY, 12, 8);
        g.lineStyle(0);

        this.staticContainer.addChild(g);
    }

    private drawNail(g: PIXI.Graphics, nx: number, ny: number): void {
        g.beginFill(COLORS.accentRustDk, 1);
        g.drawCircle(nx, ny, 0.9);
        g.endFill();
        g.beginFill(COLORS.accentRustLt, 0.55);
        g.drawCircle(nx - 0.25, ny - 0.25, 0.35);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // 6) ANIMATED PARTS — cow (centerpiece), sparrow
    // ═══════════════════════════════════════════════════════════
    private drawAnimatedParts(rng: () => number): void {
        const { x, y, w, h } = this;
        const foundY = y + h - FOUNDATION_H;

        // Cow positioned middle-right of front opening (offset slightly z right of trough)
        const cowBodyCx = x + w * 0.62;
        const cowBodyCy = foundY - 22;
        this.drawCow(cowBodyCx, cowBodyCy);

        // Sparrow na fascia
        const sparrowX = x + w * 0.18;
        const sparrowY = y + 30 - 4; // na top of fascia
        this.drawSparrow(sparrowX, sparrowY);
    }

    // ─── COW — Holstein style, white z black spots ───
    private drawCow(cx: number, cy: number): void {
        // Cow proportions: body w=60, h=38, head 22w x 18h
        const bodyW = 62;
        const bodyH = 36;

        // ── LEGS (4 visible, behind body) ──
        const legsG = new PIXI.Graphics();
        const legW = 5;
        const legH = 15;
        const legBaseY = cy + bodyH * 0.4 + legH;
        // 4 legs: 2 front (closer), 2 back (further), legs visible from front-side view
        const legPositions = [
            { lx: cx - bodyW * 0.34, ly: cy + bodyH * 0.3, scale: 1.0 },   // FL
            { lx: cx + bodyW * 0.34, ly: cy + bodyH * 0.3, scale: 1.0 },   // FR
            { lx: cx - bodyW * 0.18, ly: cy + bodyH * 0.32, scale: 0.92 }, // BL
            { lx: cx + bodyW * 0.18, ly: cy + bodyH * 0.32, scale: 0.92 }, // BR
        ];
        for (const lp of legPositions) {
            const lH = legH * lp.scale;
            // Leg body (gradient)
            const lPoints: Pt[] = [
                { x: lp.lx - legW / 2, y: lp.ly },
                { x: lp.lx + legW / 2, y: lp.ly },
                { x: lp.lx + legW / 2 + 0.5, y: lp.ly + lH },
                { x: lp.lx - legW / 2 - 0.5, y: lp.ly + lH },
            ];
            fillGradientPolygon(legsG, lPoints, COLORS.cowWhite, COLORS.cowWhiteDeep);

            // Hoof (small dark wedge)
            legsG.beginFill(COLORS.cowHoof, 1);
            legsG.drawEllipse(lp.lx, lp.ly + lH, legW * 0.7, 1.6);
            legsG.endFill();
            legsG.beginFill(COLORS.cowHoofLt, 0.7);
            legsG.drawEllipse(lp.lx - 0.3, lp.ly + lH - 0.3, legW * 0.55, 1);
            legsG.endFill();

            // Outline
            legsG.lineStyle(1, COLORS.cowSpots, 0.85);
            legsG.moveTo(lp.lx - legW / 2, lp.ly);
            legsG.lineTo(lp.lx - legW / 2 - 0.5, lp.ly + lH);
            legsG.lineTo(lp.lx + legW / 2 + 0.5, lp.ly + lH);
            legsG.lineTo(lp.lx + legW / 2, lp.ly);
            legsG.lineStyle(0);
        }
        this.animatedContainer.addChild(legsG);

        // ── UDDER (pink, between back legs) ──
        const udderG = new PIXI.Graphics();
        const udderX = cx - 2;
        const udderY = cy + bodyH * 0.35;
        udderG.beginFill(COLORS.cowUdder, 1);
        udderG.drawEllipse(udderX, udderY, 8, 6);
        udderG.endFill();
        // Highlight
        udderG.beginFill(COLORS.cowEyeWhite, 0.4);
        udderG.drawEllipse(udderX - 1.5, udderY - 1.5, 4, 2.5);
        udderG.endFill();
        // 4 teats (small pink protrusions)
        for (let i = 0; i < 4; i++) {
            const tx = udderX + (i - 1.5) * 2.5;
            const ty = udderY + 5;
            udderG.beginFill(COLORS.cowUdderTeat, 1);
            udderG.drawCircle(tx, ty, 0.9);
            udderG.endFill();
        }
        udderG.lineStyle(0.6, COLORS.cowNoseDeep, 0.7);
        udderG.drawEllipse(udderX, udderY, 8, 6);
        udderG.lineStyle(0);
        this.animatedContainer.addChild(udderG);

        // ── BODY (large rounded shape, white z gradient) ──
        const bodyG = new PIXI.Graphics();
        // Body shape (ellipse + slight angular)
        bodyG.beginFill(COLORS.cowWhite, 1);
        bodyG.drawEllipse(cx, cy, bodyW * 0.5, bodyH * 0.5);
        bodyG.endFill();

        // Body gradient overlay (lighter top, darker bottom)
        bodyG.beginFill(COLORS.cowWhiteDeep, 0.4);
        bodyG.drawEllipse(cx, cy + bodyH * 0.18, bodyW * 0.48, bodyH * 0.35);
        bodyG.endFill();
        // Highlight top
        bodyG.beginFill(COLORS.cowEyeWhite, 0.55);
        bodyG.drawEllipse(cx - bodyW * 0.1, cy - bodyH * 0.22, bodyW * 0.32, bodyH * 0.18);
        bodyG.endFill();

        // BLACK SPOTS (4-5 random Holstein pattern)
        const spotRng = makeRng(43);
        const spotConfigs = [
            { ox: -0.28, oy: -0.18, sx: 0.18, sy: 0.13 },
            { ox: 0.22, oy: -0.05, sx: 0.21, sy: 0.16 },
            { ox: -0.05, oy: 0.18, sx: 0.16, sy: 0.11 },
            { ox: 0.32, oy: 0.22, sx: 0.13, sy: 0.10 },
            { ox: -0.32, oy: 0.15, sx: 0.14, sy: 0.10 },
        ];
        for (const s of spotConfigs) {
            const spotX = cx + bodyW * s.ox + (spotRng() - 0.5) * 2;
            const spotY = cy + bodyH * s.oy + (spotRng() - 0.5) * 1.5;
            const sW = bodyW * s.sx;
            const sH = bodyH * s.sy;

            // Spot with irregular outline (3 overlapping ellipses)
            bodyG.beginFill(COLORS.cowSpots, 1);
            bodyG.drawEllipse(spotX, spotY, sW, sH);
            bodyG.endFill();
            bodyG.beginFill(COLORS.cowSpots, 1);
            bodyG.drawEllipse(spotX + sW * 0.5, spotY + sH * 0.2, sW * 0.7, sH * 0.6);
            bodyG.endFill();
            bodyG.beginFill(COLORS.cowSpots, 1);
            bodyG.drawEllipse(spotX - sW * 0.4, spotY - sH * 0.1, sW * 0.6, sH * 0.55);
            bodyG.endFill();

            // Edge texture (small highlight)
            bodyG.beginFill(COLORS.cowSpotsLt, 0.5);
            bodyG.drawEllipse(spotX - sW * 0.3, spotY - sH * 0.3, sW * 0.25, sH * 0.18);
            bodyG.endFill();
        }

        // Belly band (slightly darker bottom edge)
        bodyG.beginFill(COLORS.cowWhiteDeep, 0.45);
        bodyG.drawEllipse(cx, cy + bodyH * 0.35, bodyW * 0.45, bodyH * 0.1);
        bodyG.endFill();

        // Body outline
        bodyG.lineStyle(1.4, COLORS.cowSpots, 0.92);
        bodyG.drawEllipse(cx, cy, bodyW * 0.5, bodyH * 0.5);
        bodyG.lineStyle(0);

        this.animatedContainer.addChild(bodyG);

        // ── TAIL (separate container for flick animation) ──
        this.cowTailContainer = new PIXI.Container();
        this.cowTailContainer.x = cx - bodyW * 0.48;
        this.cowTailContainer.y = cy - 2;
        this.animatedContainer.addChild(this.cowTailContainer);

        const tailG = new PIXI.Graphics();
        // Tail base (curved line)
        tailG.lineStyle(2.4, COLORS.cowWhite, 1);
        tailG.moveTo(0, 0);
        tailG.bezierCurveTo(-4, 4, -6, 10, -8, 16);
        tailG.lineStyle(0);
        // Tail outline
        tailG.lineStyle(0.6, COLORS.cowSpots, 0.7);
        tailG.moveTo(0, 0);
        tailG.bezierCurveTo(-4, 4, -6, 10, -8, 16);
        tailG.lineStyle(0);
        // Tail tuft (puff at end)
        tailG.beginFill(COLORS.cowSpots, 1);
        tailG.drawCircle(-8, 16, 2.4);
        tailG.drawCircle(-9, 18, 1.8);
        tailG.drawCircle(-7, 18.5, 1.6);
        tailG.endFill();
        tailG.beginFill(COLORS.cowSpotsLt, 0.5);
        tailG.drawCircle(-9, 17, 1.2);
        tailG.endFill();
        this.cowTailContainer.addChild(tailG);

        // ── HEAD CONTAINER (separate for sway animation) ──
        this.cowHeadContainer = new PIXI.Container();
        this.cowHeadContainer.x = cx + bodyW * 0.42;
        this.cowHeadContainer.y = cy - 4;
        this.animatedContainer.addChild(this.cowHeadContainer);
        this.cowMouthPos = { x: cx + bodyW * 0.42 + 10, y: cy - 4 + 6 };

        // Head shape (smaller ellipse forward)
        const headG = new PIXI.Graphics();
        const headW = 22;
        const headH = 18;
        headG.beginFill(COLORS.cowWhite, 1);
        headG.drawEllipse(0, 0, headW * 0.5, headH * 0.5);
        headG.endFill();
        // Spot on forehead (random small)
        headG.beginFill(COLORS.cowSpots, 1);
        headG.drawEllipse(-2, -3, 3, 2);
        headG.endFill();
        // Snout area (lighter pink)
        headG.beginFill(COLORS.cowNose, 0.55);
        headG.drawEllipse(7, 4, 6, 4);
        headG.endFill();
        // Nostrils
        headG.beginFill(COLORS.cowNoseDeep, 1);
        headG.drawEllipse(8, 4, 1.2, 0.8);
        headG.drawEllipse(10, 4, 1.2, 0.8);
        headG.endFill();
        // Mouth (subtle horizontal line)
        headG.lineStyle(0.8, COLORS.cowMouth, 0.85);
        headG.moveTo(7, 6.5);
        headG.lineTo(11, 6.5);
        headG.lineStyle(0);
        // Forehead highlight
        headG.beginFill(COLORS.cowEyeWhite, 0.55);
        headG.drawEllipse(-3, -3, 4, 2.5);
        headG.endFill();
        // Outline
        headG.lineStyle(1.2, COLORS.cowSpots, 0.9);
        headG.drawEllipse(0, 0, headW * 0.5, headH * 0.5);
        headG.lineStyle(0);
        this.cowHeadContainer.addChild(headG);

        // ── HORNS (small triangular, top) ──
        const hornsG = new PIXI.Graphics();
        // Left horn
        hornsG.beginFill(COLORS.cowHorns, 1);
        hornsG.moveTo(-6, -8);
        hornsG.lineTo(-9, -12);
        hornsG.lineTo(-4, -7);
        hornsG.closePath();
        hornsG.endFill();
        hornsG.beginFill(COLORS.cowHornsTip, 1);
        hornsG.drawCircle(-9, -12, 0.6);
        hornsG.endFill();
        // Right horn
        hornsG.beginFill(COLORS.cowHorns, 1);
        hornsG.moveTo(4, -8);
        hornsG.lineTo(7, -12);
        hornsG.lineTo(2, -7);
        hornsG.closePath();
        hornsG.endFill();
        hornsG.beginFill(COLORS.cowHornsTip, 1);
        hornsG.drawCircle(7, -12, 0.6);
        hornsG.endFill();
        // Outlines
        hornsG.lineStyle(0.8, COLORS.cowHornsTip, 0.9);
        hornsG.moveTo(-6, -8);
        hornsG.lineTo(-9, -12);
        hornsG.lineTo(-4, -7);
        hornsG.moveTo(4, -8);
        hornsG.lineTo(7, -12);
        hornsG.lineTo(2, -7);
        hornsG.lineStyle(0);
        this.cowHeadContainer.addChild(hornsG);

        // ── EARS (separate containers for twitch) ──
        // Left ear
        this.cowEarLContainer = new PIXI.Container();
        this.cowEarLContainer.x = -7;
        this.cowEarLContainer.y = -5;
        this.cowHeadContainer.addChild(this.cowEarLContainer);
        const earLG = new PIXI.Graphics();
        earLG.beginFill(COLORS.cowEar, 1);
        earLG.moveTo(0, 0);
        earLG.lineTo(-5, -3);
        earLG.lineTo(-3, 3);
        earLG.closePath();
        earLG.endFill();
        earLG.beginFill(COLORS.cowEarInner, 0.7);
        earLG.moveTo(-1, 0);
        earLG.lineTo(-4, -2);
        earLG.lineTo(-2.5, 2);
        earLG.closePath();
        earLG.endFill();
        earLG.lineStyle(0.6, COLORS.cowSpots, 0.85);
        earLG.moveTo(0, 0);
        earLG.lineTo(-5, -3);
        earLG.lineTo(-3, 3);
        earLG.closePath();
        earLG.lineStyle(0);
        this.cowEarLContainer.addChild(earLG);

        // Right ear
        this.cowEarRContainer = new PIXI.Container();
        this.cowEarRContainer.x = 5;
        this.cowEarRContainer.y = -5;
        this.cowHeadContainer.addChild(this.cowEarRContainer);
        const earRG = new PIXI.Graphics();
        earRG.beginFill(COLORS.cowEar, 1);
        earRG.moveTo(0, 0);
        earRG.lineTo(5, -3);
        earRG.lineTo(3, 3);
        earRG.closePath();
        earRG.endFill();
        earRG.beginFill(COLORS.cowEarInner, 0.7);
        earRG.moveTo(1, 0);
        earRG.lineTo(4, -2);
        earRG.lineTo(2.5, 2);
        earRG.closePath();
        earRG.endFill();
        earRG.lineStyle(0.6, COLORS.cowSpots, 0.85);
        earRG.moveTo(0, 0);
        earRG.lineTo(5, -3);
        earRG.lineTo(3, 3);
        earRG.closePath();
        earRG.lineStyle(0);
        this.cowEarRContainer.addChild(earRG);

        // ── EYES (separate container for blink) ──
        this.cowEyeContainer = new PIXI.Container();
        this.cowHeadContainer.addChild(this.cowEyeContainer);
        const eyesG = new PIXI.Graphics();
        // Left eye
        eyesG.beginFill(COLORS.cowEyeWhite, 1);
        eyesG.drawEllipse(-3, -1, 2, 1.5);
        eyesG.endFill();
        eyesG.beginFill(COLORS.cowEye, 1);
        eyesG.drawCircle(-3, -1, 1);
        eyesG.endFill();
        eyesG.beginFill(COLORS.cowEyeWhite, 1);
        eyesG.drawCircle(-2.7, -1.3, 0.35);
        eyesG.endFill();
        // Right eye
        eyesG.beginFill(COLORS.cowEyeWhite, 1);
        eyesG.drawEllipse(3, -1, 2, 1.5);
        eyesG.endFill();
        eyesG.beginFill(COLORS.cowEye, 1);
        eyesG.drawCircle(3, -1, 1);
        eyesG.endFill();
        eyesG.beginFill(COLORS.cowEyeWhite, 1);
        eyesG.drawCircle(3.3, -1.3, 0.35);
        eyesG.endFill();
        // Eyelashes (subtle)
        eyesG.lineStyle(0.5, COLORS.cowSpots, 0.85);
        eyesG.moveTo(-4.5, -2);
        eyesG.lineTo(-5, -2.6);
        eyesG.moveTo(-3.5, -2.3);
        eyesG.lineTo(-3.8, -3);
        eyesG.moveTo(4.5, -2);
        eyesG.lineTo(5, -2.6);
        eyesG.moveTo(3.5, -2.3);
        eyesG.lineTo(3.8, -3);
        eyesG.lineStyle(0);
        this.cowEyeContainer.addChild(eyesG);

        // ── JAW for chewing (small container for subtle motion) ──
        this.cowJawContainer = new PIXI.Container();
        this.cowJawContainer.x = 0;
        this.cowJawContainer.y = 0;
        this.cowHeadContainer.addChild(this.cowJawContainer);
        // Jaw is just a subtle small triangle below mouth (cow chewing motion)
        const jawG = new PIXI.Graphics();
        jawG.beginFill(COLORS.cowWhiteDeep, 0.3);
        jawG.drawEllipse(9, 7.5, 3, 1.5);
        jawG.endFill();
        this.cowJawContainer.addChild(jawG);
    }

    // ─── SPARROW na fascia (small bird, perched) ───
    private drawSparrow(px: number, py: number): void {
        this.sparrowContainer = new PIXI.Container();
        this.sparrowContainer.x = px;
        this.sparrowContainer.y = py;
        this.staticContainer.addChild(this.sparrowContainer);

        const g = new PIXI.Graphics();

        // Tail
        g.beginFill(COLORS.sparrowBody, 1);
        g.moveTo(-3, 0);
        g.lineTo(-7, -1);
        g.lineTo(-7, 1);
        g.closePath();
        g.endFill();

        // Body
        g.beginFill(COLORS.sparrowBodyLt, 1);
        g.drawEllipse(0, 0, 4, 3);
        g.endFill();
        // Wing
        g.beginFill(COLORS.sparrowBody, 1);
        g.drawEllipse(-1.5, 0, 2.5, 2);
        g.endFill();

        // Head
        g.beginFill(COLORS.sparrowBodyLt, 1);
        g.drawCircle(3, -1.5, 2.2);
        g.endFill();

        // Beak
        g.beginFill(COLORS.sparrowBeak, 1);
        g.moveTo(5, -1.5);
        g.lineTo(6.5, -1);
        g.lineTo(5, -0.5);
        g.closePath();
        g.endFill();

        // Eye
        g.beginFill(COLORS.sparrowEye, 1);
        g.drawCircle(3.5, -2, 0.5);
        g.endFill();

        // Outline
        g.lineStyle(0.6, COLORS.cowSpots, 0.8);
        g.drawEllipse(0, 0, 4, 3);
        g.drawCircle(3, -1.5, 2.2);
        g.lineStyle(0);

        // Legs
        g.lineStyle(0.6, COLORS.sparrowBeak, 1);
        g.moveTo(-1, 2);
        g.lineTo(-1, 4);
        g.moveTo(1, 2);
        g.lineTo(1, 4);
        g.lineStyle(0);

        this.sparrowContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 7) PARTICLE SYSTEMS — moo puffs, flies orbiting cow
    // ═══════════════════════════════════════════════════════════
    private initParticleSystems(rng: () => number): void {
        const { x, y, w, h } = this;
        const foundY = y + h - FOUNDATION_H;

        // Cow position (matched z drawCow)
        const cowCx = x + w * 0.62;
        const cowCy = foundY - 22;

        // Init 4 flies orbiting cow at different speeds/radii
        for (let i = 0; i < 4; i++) {
            const g = new PIXI.Graphics();
            g.beginFill(COLORS.flyDark, 0.85);
            g.drawCircle(0, 0, 0.8);
            g.endFill();
            this.particleContainer.addChild(g);

            this.flies.push({
                g,
                angle: rng() * Math.PI * 2,
                radius: 12 + rng() * 18,
                speed: 0.8 + rng() * 1.4,
                cx: cowCx,
                cy: cowCy - 10,
                dyOff: (rng() - 0.5) * 6,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 8) UPDATE — per-frame 8 Subtle Life animations
    // ═══════════════════════════════════════════════════════════
    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        const dt = 1 / 60;
        this.elapsed += dt;
        const t = this.elapsed;

        // ── 1) COW HEAD SWAY (slow N-S rotation + Y bob) ──
        if (this.cowHeadContainer) {
            this.cowHeadContainer.rotation = Math.sin(t * 0.7) * 0.045;
            // Y bob (very subtle) - origin Y of head was cy-4
            // Use position.y offset relative to original
        }

        // ── 2) COW TAIL FLICK (occasional sharp swing) ──
        if (this.cowTailContainer) {
            // Base slow sway
            const baseSway = Math.sin(t * 1.1) * 0.08;
            // Occasional flick: triggers every ~4-6s, lasts ~0.5s
            const flickPhase = (t % 5.3) / 5.3;
            let flickRot = 0;
            if (flickPhase < 0.12) {
                // Quick flick out + back
                const fp = flickPhase / 0.12;
                flickRot = Math.sin(fp * Math.PI * 2) * 0.55;
            }
            this.cowTailContainer.rotation = baseSway + flickRot;
        }

        // ── 3) COW EAR TWITCH (random per ear, rare) ──
        if (this.cowEarLContainer) {
            const earLPhase = (t % 7.2) / 7.2;
            this.cowEarLContainer.rotation = earLPhase < 0.04 ? Math.sin(earLPhase * 80) * 0.2 : 0;
        }
        if (this.cowEarRContainer) {
            const earRPhase = ((t + 3.1) % 8.5) / 8.5;
            this.cowEarRContainer.rotation = earRPhase < 0.035 ? Math.sin(earRPhase * 90) * 0.18 : 0;
        }

        // ── 4) COW EYE BLINK (very rare, fast) ──
        if (this.cowEyeContainer) {
            const blinkPhase = (t % 9.4) / 9.4;
            if (blinkPhase < 0.025) {
                const bp = blinkPhase / 0.025;
                this.cowEyeContainer.scale.y = Math.max(0.1, 1 - Math.sin(bp * Math.PI) * 0.9);
            } else {
                this.cowEyeContainer.scale.y = 1;
            }
        }

        // ── COW JAW CHEW (subtle continuous motion) ──
        if (this.cowJawContainer) {
            this.cowJawContainer.scale.y = 1 + Math.sin(t * 3.2) * 0.08;
        }

        // ── 5) MOO PUFF spawn + update ──
        this.mooPuffTimer += dt;
        if (this.mooPuffTimer > 10 + Math.random() * 4) {
            this.mooPuffTimer = 0;
            // Spawn new puff at cow mouth
            const g = new PIXI.Graphics();
            g.beginFill(COLORS.mooPuffWhite, 0.85);
            g.drawCircle(0, 0, 3);
            g.endFill();
            g.beginFill(COLORS.mooPuffEdge, 0.5);
            g.drawCircle(-1.5, -0.5, 1.8);
            g.drawCircle(1.5, 0.5, 1.6);
            g.endFill();
            g.x = this.cowMouthPos.x + 10;
            g.y = this.cowMouthPos.y;
            this.particleContainer.addChild(g);
            this.mooPuffs.push({
                g,
                age: 0,
                vx: 0.3 + Math.random() * 0.2,
                vy: -0.4 - Math.random() * 0.2,
            });
        }
        // Update existing puffs
        for (let i = this.mooPuffs.length - 1; i >= 0; i--) {
            const p = this.mooPuffs[i];
            p.age += dt;
            p.g.x += p.vx;
            p.g.y += p.vy;
            p.g.alpha = Math.max(0, 1 - p.age / 2);
            p.g.scale.set(1 + p.age * 0.4);
            if (p.age > 2) {
                this.particleContainer.removeChild(p.g);
                p.g.destroy();
                this.mooPuffs.splice(i, 1);
            }
        }

        // ── 6) WATER TROUGH RIPPLES (continuous concentric) ──
        if (this.waterRippleG) {
            this.waterRippleG.clear();
            const wp = this.waterTroughPos;
            const waterY = wp.y - wp.h / 2 + 1;
            for (let i = 0; i < 3; i++) {
                const phase = (t * 0.8 + i * 0.33) % 1;
                const rW = wp.w * 0.42 * phase;
                const rH = 1.2 * phase;
                this.waterRippleG.lineStyle(0.6, COLORS.waterRipple, (1 - phase) * 0.65);
                this.waterRippleG.drawEllipse(wp.x, waterY, rW, rH);
                this.waterRippleG.lineStyle(0);
            }
        }

        // ── 7) BELL SWAY (lekki wind motion na ridge) ──
        if (this.bellContainer) {
            this.bellContainer.rotation = Math.sin(t * 0.55) * 0.035 + Math.sin(t * 1.7) * 0.012;
        }

        // ── 8) FLY BUZZING wokół krowy ──
        for (const f of this.flies) {
            f.angle += f.speed * dt;
            f.g.x = f.cx + Math.cos(f.angle) * f.radius;
            f.g.y = f.cy + Math.sin(f.angle) * f.radius * 0.55 + f.dyOff + Math.sin(t * 6 + f.angle) * 1.5;
        }

        // ── Sparrow occasional Y bump ──
        if (this.sparrowContainer) {
            const sBob = (t % 6.8) / 6.8;
            this.sparrowContainer.y = (this.y + 30 - 4) + (sBob < 0.08 ? -Math.sin(sBob * 40) * 1.5 : 0);
        }

        // ── HAY FLUTTER (5 tracked strands redraw z phase) ──
        if (this.hayFlutterG) {
            this.hayFlutterG.clear();
            for (const s of this.hayFlutterPos) {
                const flutter = Math.sin(t * 1.8 + s.phase) * 0.18;
                const angle = (-0.3 + flutter);
                this.hayFlutterG.lineStyle(0.9, COLORS.haySrtaw, 0.9);
                this.hayFlutterG.moveTo(s.x, s.y);
                this.hayFlutterG.lineTo(s.x + Math.cos(angle) * s.len, s.y + Math.sin(angle) * s.len);
                this.hayFlutterG.lineStyle(0);
            }
        }
    }

    public getExtraCollidables(): ICollidable[] {
        const PAD = 10;
        const { x, y, w, h } = this;
        const wallY = y + 30;
        const foundY = y + h - FOUNDATION_H;

        // FIX v0.32.1: 3 extra hitboxes
        //   1. Main building PAD=10
        //   2. Side sticking-out E parallelogram (x+w..x+w+RIGHT_DEPTH, wallY-ISO_RISE..foundY)
        //   3. N roof overhang (apex extends up Y-5-ISO_RISE = y-27 plus eaveOverhang horizontal)
        return [
            // (1) Main padded
            {
                x: x - PAD,
                y: y - PAD,
                w: w + PAD * 2,
                h: h + PAD * 2,
                update: () => {},
            },
            // (2) Side sticking-out E wall
            {
                x: x + w,
                y: wallY - ISO_RISE - PAD,
                w: RIGHT_DEPTH + PAD,
                h: (foundY - wallY) + ISO_RISE + FOUNDATION_H + PAD * 2,
                update: () => {},
            },
            // (3) Roof N overhang (single apex + weather vane sięgają y-33)
            {
                x: x - 10,
                y: y - 33,
                w: w + RIGHT_DEPTH + 10,
                h: 23,
                update: () => {},
            },
        ];
    }
}