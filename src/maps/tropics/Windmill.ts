import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * v0.35.0 FAZA T6 — WINDMILL (wiatrak) AAA PREMIUM
 *
 * Caribbean/tropical windmill jako parallax landmark zachodniej części mapy.
 * v0.35.1: Lokacja W od stodoły (1650, 660) — 214px od barn TL corner, blade tip 115px gap
 * od barn (rotating ramiona nie dotykają stodoły). +20% tower height, +57% blade width.
 *
 * Visual (AAA premium):
 *   - Stone foundation z varied stones + mortar
 *   - Tall wooden tower (jasne pine drewno + słoje + iron strap + nails) — jak Barn texture
 *   - Cap on top z conical shingled roof (red, jak Barn roof)
 *   - 4 rotujące blades (wood frame + canvas sails + reinforcement struts)
 *   - Door (centered tower base) + okno (z światłem pulse)
 *   - Weather vane (rooster) na cap
 *
 * Subtle Life animations (5):
 *   1. Blades continuous rotation (slow majestic ~22s pełen obrót)
 *   2. Window glow pulse (warm light)
 *   3. Weather vane sway
 *   4. Flag wind sway (na blade hub center)
 *   5. Sparrow occasional flutter na cap
 *
 * Parallax: blades w osobnym container z zIndex 1000+ (rysują się NAD wszystkim,
 * player przechodzi POD bladami) — to klasyczny windmill parallax look.
 *
 * Collision: tylko tower body (80×110) solid. Blade sweep area NIE blokuje player
 * (blades są wysoko nad ground — parallax illusion).
 */

const TOWER_W = 80;
const TOWER_H = 132;          // v0.35.1: +20% (Mariusz feedback)
const STONE_BASE_H = 32;
const WOOD_TOWER_H = TOWER_H - STONE_BASE_H;  // 100
const CAP_RADIUS = 28;
const BLADE_LENGTH = 95;       // v0.35.1: +12% (proporcjonalnie do szerszych ramion)
const BLADE_WIDTH = 22;        // v0.35.1: 14 → 22 (+57%, Mariusz: "szersze ramiona")
const BLADE_HUB_RADIUS = 11;   // v0.35.1: 8 → 11 (+38%, proporcjonalnie do wider blades)

const COLORS = {
    // Stone foundation
    stoneLight:     0xc8b8a0,
    stoneMid:       0xa89a82,
    stoneDeep:      0x6e6048,
    stoneShadow:    0x4a4030,
    mortar:         0x5a5040,
    mossGreen:      0x6a8a44,
    // Wood tower (jasne pine — jak Crate/Barn)
    woodLight:      0xe8c894,
    woodTop:        0xd4ad6a,
    woodMid:        0xb38a4a,
    woodDeep:       0x7a5a30,
    woodShadow:     0x4a3818,
    // Iron hardware
    ironDark:       0x3a2418,
    ironMid:        0x6a4828,
    ironHighlight:  0xd0a878,
    ironStrap:      0xa05a2a,        // rust accent
    ironStrapDk:    0x6b3818,
    // Cap roof (red shingles, jak Barn)
    roofRed:        0xb8513a,
    roofRedDeep:    0x7a2c22,
    roofRedLight:   0xd87c5a,
    roofRedHi:      0xe89870,
    roofRidge:      0x5a1810,
    // Blade canvas (off-white sails)
    canvasLight:    0xf5ead0,
    canvasMid:      0xe0d2a8,
    canvasDeep:     0xa89878,
    canvasShadow:   0x6e5c40,
    // Door + window
    doorWood:       0x8a5a2a,
    doorWoodDeep:   0x5a3618,
    doorWoodLight:  0xb08850,
    windowGlow:     0xffd870,
    windowDeep:     0x4a3010,
    // Weather vane
    vaneIron:       0x3a2a20,
    vaneIronLight:  0x7a6a50,
    // Flag (tropical accent)
    flagTeal:       0x3a9890,
    flagTealLight:  0x6acac0,
    // Outline + shadow
    outline:        0x2a1810,
    aoShadow:       0x000000,
} as const;

export class Windmill implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private elapsed: number = 0;
    private seed: number;

    private aoContainer: PIXI.Container;
    private towerContainer: PIXI.Container;
    private capContainer: PIXI.Container;
    private animatedContainer: PIXI.Container;
    private bladesContainer: PIXI.Container;
    private windowGlow: PIXI.Graphics | null = null;
    private weatherVane: PIXI.Container | null = null;
    private flag: PIXI.Graphics | null = null;
    private sparrow: PIXI.Graphics | null = null;

    constructor(x: number, y: number, seed: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = TOWER_W;
        this.h = TOWER_H;
        this.seed = seed;

        // AO container (z=-86 jak buildings)
        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;
        worldContainer.addChild(this.aoContainer);

        // Tower body (stone + wood + door + window)
        this.towerContainer = new PIXI.Container();
        this.towerContainer.zIndex = Math.floor(y + TOWER_H);
        worldContainer.addChild(this.towerContainer);

        // Cap (top conical roof + weather vane)
        this.capContainer = new PIXI.Container();
        this.capContainer.zIndex = Math.floor(y + TOWER_H) + 1;
        worldContainer.addChild(this.capContainer);

        // Animated parts (window glow, vane, sparrow)
        this.animatedContainer = new PIXI.Container();
        this.animatedContainer.zIndex = Math.floor(y + TOWER_H) + 2;
        worldContainer.addChild(this.animatedContainer);

        // Blades (PARALLAX — zIndex bardzo wysoki, NAD wszystkim w grze)
        this.bladesContainer = new PIXI.Container();
        this.bladesContainer.zIndex = 1200;  // nad player (zIndex y+19 = ~3000 max) + nad particles (500)
        worldContainer.addChild(this.bladesContainer);

        const rng = this.makeRng(seed);
        this.drawAO();
        this.drawStoneFoundation(rng);
        this.drawWoodTower(rng);
        this.drawDoorAndWindow();
        this.drawCap(rng);
        this.drawWeatherVane();
        this.drawBlades(rng);
    }

    private makeRng(seed: number): () => number {
        let s = seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    // ═══════════════════════════════════════════════════════════
    // 1) DROP SHADOW (Barn-style 2 SE polygon trapezy)
    // ═══════════════════════════════════════════════════════════
    private drawAO(): void {
        const g = new PIXI.Graphics();
        const { x, y } = this;

        // Outermost ambient haze (extended SE)
        g.beginFill(COLORS.aoShadow, 0.12);
        g.moveTo(x - 12, y + TOWER_H * 0.5);
        g.lineTo(x + TOWER_W + 50, y + TOWER_H * 0.5);
        g.lineTo(x + TOWER_W + 64, y + TOWER_H + 32);
        g.lineTo(x - 12, y + TOWER_H + 32);
        g.closePath();
        g.endFill();

        // Mid shadow (closer to footprint)
        g.beginFill(COLORS.aoShadow, 0.20);
        g.moveTo(x - 4, y + TOWER_H * 0.7);
        g.lineTo(x + TOWER_W + 30, y + TOWER_H * 0.7);
        g.lineTo(x + TOWER_W + 40, y + TOWER_H + 20);
        g.lineTo(x - 4, y + TOWER_H + 20);
        g.closePath();
        g.endFill();

        this.aoContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 2) STONE FOUNDATION (varied stones + mortar + moss)
    // ═══════════════════════════════════════════════════════════
    private drawStoneFoundation(rng: () => number): void {
        const g = new PIXI.Graphics();
        const { x, y } = this;
        const foundY = y + TOWER_H - STONE_BASE_H;  // top of stone

        // Base mortar fill
        g.beginFill(COLORS.mortar, 1);
        g.drawRect(x, foundY, TOWER_W, STONE_BASE_H);
        g.endFill();

        // 12-15 varied stones (irregular shapes)
        const stoneRows = 3;
        const stoneCols = 5;
        for (let row = 0; row < stoneRows; row++) {
            for (let col = 0; col < stoneCols; col++) {
                const skipChance = rng();
                if (skipChance < 0.08) continue;  // small gaps for variety

                const cellW = TOWER_W / stoneCols;
                const cellH = STONE_BASE_H / stoneRows;
                const offX = col * cellW + (rng() - 0.5) * 2;
                const offY = row * cellH + (rng() - 0.5) * 1.5;
                const sw = cellW + (rng() - 0.5) * 4;
                const sh = cellH + (rng() - 0.5) * 3;

                const sx = x + offX;
                const sy = foundY + offY;

                // Stone base (mid-tone)
                g.beginFill(COLORS.stoneMid, 1);
                g.drawRoundedRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, 1.5);
                g.endFill();

                // Stone highlight (top sunlit)
                g.beginFill(COLORS.stoneLight, 0.75);
                g.drawRoundedRect(sx + 1, sy + 1, sw - 2, sh * 0.45, 1);
                g.endFill();

                // Stone shadow (bottom)
                g.beginFill(COLORS.stoneShadow, 0.55);
                g.drawRoundedRect(sx + 1, sy + sh * 0.65, sw - 2, sh * 0.32, 1);
                g.endFill();

                // Stone outline
                g.lineStyle(0.8, COLORS.stoneDeep, 0.85);
                g.drawRoundedRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, 1.5);
                g.lineStyle(0);

                // Random moss patch (15% chance)
                if (rng() < 0.15) {
                    g.beginFill(COLORS.mossGreen, 0.5);
                    g.drawEllipse(sx + sw * 0.7, sy + sh * 0.8, 2.5, 1.2);
                    g.endFill();
                }
            }
        }

        // Top edge of foundation (where wood tower meets stone)
        g.lineStyle(2, COLORS.outline, 0.9);
        g.moveTo(x, foundY);
        g.lineTo(x + TOWER_W, foundY);
        g.lineStyle(0);

        // Sunlit top edge
        g.lineStyle(1, COLORS.stoneLight, 0.6);
        g.moveTo(x + 2, foundY + 1);
        g.lineTo(x + TOWER_W - 2, foundY + 1);
        g.lineStyle(0);

        // Outline foundation
        g.lineStyle(2, COLORS.outline, 0.95);
        g.drawRect(x, foundY, TOWER_W, STONE_BASE_H);
        g.lineStyle(0);

        this.towerContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 3) WOOD TOWER (vertical planks + grain + iron strap + nails)
    // ═══════════════════════════════════════════════════════════
    private drawWoodTower(rng: () => number): void {
        const g = new PIXI.Graphics();
        const { x, y } = this;
        const woodTopY = y;
        const woodBotY = y + WOOD_TOWER_H;

        // Tower body slight taper (wider at bottom, narrower at top) — classic windmill
        const TAPER = 6;  // top is TAPER px narrower each side
        const topLeftX = x + TAPER;
        const topRightX = x + TOWER_W - TAPER;
        const botLeftX = x;
        const botRightX = x + TOWER_W;

        // Base wood fill (trapezoid for taper)
        g.beginFill(COLORS.woodTop, 1);
        g.drawPolygon([
            topLeftX, woodTopY,
            topRightX, woodTopY,
            botRightX, woodBotY,
            botLeftX, woodBotY,
        ]);
        g.endFill();

        // Vertical wood gradient (light NW, darker SE)
        g.beginFill(COLORS.woodLight, 0.45);
        g.drawPolygon([
            topLeftX, woodTopY,
            topLeftX + (topRightX - topLeftX) * 0.45, woodTopY,
            botLeftX + (botRightX - botLeftX) * 0.4, woodBotY,
            botLeftX, woodBotY,
        ]);
        g.endFill();

        g.beginFill(COLORS.woodMid, 0.35);
        g.drawPolygon([
            topLeftX + (topRightX - topLeftX) * 0.7, woodTopY,
            topRightX, woodTopY,
            botRightX, woodBotY,
            botLeftX + (botRightX - botLeftX) * 0.7, woodBotY,
        ]);
        g.endFill();

        // ── 5 vertical plank seams ──
        const PLANK_COUNT = 5;
        for (let i = 1; i < PLANK_COUNT; i++) {
            const tT = i / PLANK_COUNT;
            const wobble = (rng() - 0.5) * 1.2;
            const pxTop = topLeftX + (topRightX - topLeftX) * tT + wobble;
            const pxBot = botLeftX + (botRightX - botLeftX) * tT + wobble;

            // Deep seam shadow
            g.lineStyle(1.6, COLORS.woodDeep, 0.85);
            g.moveTo(pxTop, woodTopY + 1);
            g.lineTo(pxBot, woodBotY - 1);
            g.lineStyle(0);
            // Sunlit edge highlight
            g.lineStyle(0.7, COLORS.woodLight, 0.65);
            g.moveTo(pxTop + 1.2, woodTopY + 1);
            g.lineTo(pxBot + 1.2, woodBotY - 1);
            g.lineStyle(0);
        }

        // ── Wood grain (słoje) per plank ──
        for (let plank = 0; plank < PLANK_COUNT; plank++) {
            const tStart = plank / PLANK_COUNT;
            const tEnd = (plank + 1) / PLANK_COUNT;

            const grainCount = 3 + Math.floor(rng() * 3);
            for (let gl = 0; gl < grainCount; gl++) {
                const ryT = rng();
                const yPos = woodTopY + ryT * WOOD_TOWER_H;
                const plankTopL = topLeftX + (topRightX - topLeftX) * tStart;
                const plankTopR = topLeftX + (topRightX - topLeftX) * tEnd;
                const plankBotL = botLeftX + (botRightX - botLeftX) * tStart;
                const plankBotR = botLeftX + (botRightX - botLeftX) * tEnd;
                const xL = plankTopL + (plankBotL - plankTopL) * ryT;
                const xR = plankTopR + (plankBotR - plankTopR) * ryT;

                const waveAmp = 0.5 + rng() * 0.7;
                const wavePhase = rng() * Math.PI;
                g.lineStyle(0.5, COLORS.woodDeep, 0.42);
                const steps = 8;
                let prevX = xL, prevY = yPos;
                g.moveTo(prevX, prevY);
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const nx = xL + (xR - xL) * t;
                    const ny = yPos + Math.sin(wavePhase + t * Math.PI * 1.5) * waveAmp;
                    g.lineTo(nx, ny);
                }
                g.lineStyle(0);
            }

            // 1-2 knots per plank
            if (rng() > 0.55) {
                const tK = tStart + rng() * (tEnd - tStart);
                const ryK = rng();
                const plankTopL = topLeftX + (topRightX - topLeftX) * tK;
                const plankBotL = botLeftX + (botRightX - botLeftX) * tK;
                const xK = plankTopL + (plankBotL - plankTopL) * ryK;
                const yK = woodTopY + ryK * WOOD_TOWER_H;
                const kr = 1.0 + rng() * 0.8;
                g.beginFill(COLORS.woodDeep, 0.85);
                g.drawEllipse(xK, yK, kr * 1.15, kr * 0.85);
                g.endFill();
                g.beginFill(COLORS.woodLight, 0.35);
                g.drawCircle(xK - 0.2, yK - 0.2, kr * 0.32);
                g.endFill();
            }
        }

        // ── Iron strap (mid-tower horizontal band) ──
        const strapY = woodTopY + WOOD_TOWER_H * 0.45;
        const strapLeftX = topLeftX + (botLeftX - topLeftX) * 0.45;
        const strapRightX = topRightX + (botRightX - topRightX) * 0.45;
        // Rust body
        g.beginFill(COLORS.ironStrap, 1);
        g.drawRect(strapLeftX - 1, strapY - 1.8, (strapRightX - strapLeftX) + 2, 3.6);
        g.endFill();
        // Strap shadow (bottom)
        g.beginFill(COLORS.ironStrapDk, 0.85);
        g.drawRect(strapLeftX - 1, strapY + 0.6, (strapRightX - strapLeftX) + 2, 1.4);
        g.endFill();
        // Strap highlight (top sunlit)
        g.beginFill(COLORS.woodLight, 0.4);
        g.drawRect(strapLeftX - 1, strapY - 1.8, (strapRightX - strapLeftX) + 2, 0.8);
        g.endFill();
        // Outline
        g.lineStyle(0.7, COLORS.ironStrapDk, 0.95);
        g.drawRect(strapLeftX - 1, strapY - 1.8, (strapRightX - strapLeftX) + 2, 3.6);
        g.lineStyle(0);

        // Strap bolts (4 total — 2 left, 2 right)
        for (const bxRel of [0.08, 0.92]) {
            const bx = strapLeftX + (strapRightX - strapLeftX) * bxRel;
            g.beginFill(COLORS.ironDark, 1);
            g.drawCircle(bx, strapY, 1.4);
            g.endFill();
            g.beginFill(COLORS.ironHighlight, 0.9);
            g.drawCircle(bx - 0.4, strapY - 0.4, 0.55);
            g.endFill();
        }

        // ── 4 corner nails (z głębią pattern jak Crate) ──
        for (const [nxRel, nyRel] of [[0.06, 0.04], [0.94, 0.04], [0.06, 0.94], [0.94, 0.94]]) {
            const tlxNail = topLeftX + (topRightX - topLeftX) * nxRel;
            const blxNail = botLeftX + (botRightX - botLeftX) * nxRel;
            const xN = tlxNail + (blxNail - tlxNail) * nyRel;
            const yN = woodTopY + WOOD_TOWER_H * nyRel;
            // Outer dark ring
            g.beginFill(COLORS.ironDark, 1);
            g.drawCircle(xN, yN, 1.7);
            g.endFill();
            // Mid iron
            g.beginFill(COLORS.ironMid, 0.92);
            g.drawCircle(xN, yN, 1.3);
            g.endFill();
            // Highlight
            g.beginFill(COLORS.ironHighlight, 1);
            g.drawCircle(xN - 0.45, yN - 0.45, 0.65);
            g.endFill();
            // Catchlight
            g.beginFill(0xffffff, 0.75);
            g.drawCircle(xN - 0.55, yN - 0.55, 0.28);
            g.endFill();
        }

        // Outline tower trapezoid
        g.lineStyle(2, COLORS.outline, 0.95);
        g.drawPolygon([
            topLeftX, woodTopY,
            topRightX, woodTopY,
            botRightX, woodBotY,
            botLeftX, woodBotY,
        ]);
        g.lineStyle(0);

        // Sunlit NW edge
        g.lineStyle(1, COLORS.woodLight, 0.7);
        g.moveTo(topLeftX + 1.5, woodTopY + 1.5);
        g.lineTo(botLeftX + 1.5, woodBotY - 1.5);
        g.lineStyle(0);

        this.towerContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 4) DOOR + WINDOW
    // ═══════════════════════════════════════════════════════════
    private drawDoorAndWindow(): void {
        const g = new PIXI.Graphics();
        const { x, y } = this;
        const cx = x + TOWER_W / 2;

        // ── Window (upper middle, z glow pulse) ──
        const winY = y + WOOD_TOWER_H * 0.25;
        const winW = 18;
        const winH = 16;
        const winX = cx - winW / 2;

        // Window deep recess
        g.beginFill(COLORS.windowDeep, 1);
        g.drawRoundedRect(winX, winY, winW, winH, 2);
        g.endFill();

        // Window outline (wood frame)
        g.lineStyle(1.5, COLORS.doorWoodDeep, 0.95);
        g.drawRoundedRect(winX, winY, winW, winH, 2);
        g.lineStyle(0);

        // Window cross frame (4 panes)
        g.lineStyle(1.2, COLORS.doorWoodDeep, 0.85);
        g.moveTo(winX + winW / 2, winY);
        g.lineTo(winX + winW / 2, winY + winH);
        g.moveTo(winX, winY + winH / 2);
        g.lineTo(winX + winW, winY + winH / 2);
        g.lineStyle(0);

        this.towerContainer.addChild(g);

        // Glow (animated container, behind frame visual hint)
        this.windowGlow = new PIXI.Graphics();
        this.windowGlow.beginFill(COLORS.windowGlow, 0.55);
        this.windowGlow.drawRoundedRect(winX + 1.5, winY + 1.5, winW - 3, winH - 3, 1.5);
        this.windowGlow.endFill();
        this.animatedContainer.addChild(this.windowGlow);

        // ── Door (bottom center, z hinges) ──
        const dr = new PIXI.Graphics();
        const doorW = 22;
        const doorH = 32;
        const doorX = cx - doorW / 2;
        const doorY = y + WOOD_TOWER_H - doorH - 2;  // siedzi na top of stone foundation

        // Door wood (vertical planks)
        dr.beginFill(COLORS.doorWood, 1);
        dr.drawRoundedRect(doorX, doorY, doorW, doorH, 2);
        dr.endFill();
        // Door light gradient (NW sunlit)
        dr.beginFill(COLORS.doorWoodLight, 0.4);
        dr.drawRoundedRect(doorX + 1, doorY + 1, doorW * 0.4, doorH - 2, 1.5);
        dr.endFill();
        // Door dark gradient (SE shadow)
        dr.beginFill(COLORS.doorWoodDeep, 0.5);
        dr.drawRoundedRect(doorX + doorW * 0.6, doorY + 1, doorW * 0.38, doorH - 2, 1.5);
        dr.endFill();
        // Door planks (3 vertical lines)
        for (let i = 1; i < 3; i++) {
            const dxLine = doorX + (doorW * i) / 3;
            dr.lineStyle(0.8, COLORS.doorWoodDeep, 0.85);
            dr.moveTo(dxLine, doorY + 2);
            dr.lineTo(dxLine, doorY + doorH - 2);
            dr.lineStyle(0);
        }
        // Door arch top (rounded windmill door)
        dr.beginFill(COLORS.doorWood, 1);
        dr.drawCircle(cx, doorY, doorW * 0.45);
        dr.endFill();
        dr.beginFill(COLORS.doorWoodDeep, 0.4);
        dr.drawCircle(cx, doorY, doorW * 0.45);
        dr.endFill();

        // Door outline
        dr.lineStyle(1.5, COLORS.outline, 0.95);
        dr.drawRoundedRect(doorX, doorY, doorW, doorH, 2);
        dr.lineStyle(0);

        // Door handle (iron knob)
        dr.beginFill(COLORS.ironDark, 1);
        dr.drawCircle(doorX + doorW - 4, doorY + doorH / 2, 1.5);
        dr.endFill();
        dr.beginFill(COLORS.ironHighlight, 0.9);
        dr.drawCircle(doorX + doorW - 4.4, doorY + doorH / 2 - 0.4, 0.6);
        dr.endFill();

        // Door hinges (2 iron strips)
        for (const hy of [doorY + 6, doorY + doorH - 6]) {
            dr.beginFill(COLORS.ironStrap, 1);
            dr.drawRect(doorX + 1, hy - 1, doorW * 0.3, 2.5);
            dr.endFill();
            dr.lineStyle(0.5, COLORS.ironStrapDk, 0.9);
            dr.drawRect(doorX + 1, hy - 1, doorW * 0.3, 2.5);
            dr.lineStyle(0);
        }

        this.towerContainer.addChild(dr);
    }

    // ═══════════════════════════════════════════════════════════
    // 5) CAP (conical shingled roof + ridge accent)
    // ═══════════════════════════════════════════════════════════
    private drawCap(rng: () => number): void {
        const g = new PIXI.Graphics();
        const { x, y } = this;
        const capCx = x + TOWER_W / 2;
        const capCy = y - 4;
        const capW = 56;
        const capH = 26;

        // Cap base (rounded dome — wider than wood tower top to cover edges)
        const capLeft = capCx - capW / 2;
        const capRight = capCx + capW / 2;
        const capBot = y + 4;
        const capTop = capCy - capH / 2;

        // Cap fill (red shingles base)
        g.beginFill(COLORS.roofRed, 1);
        g.moveTo(capLeft, capBot);
        g.lineTo(capRight, capBot);
        g.bezierCurveTo(capRight + 4, capBot - 6, capRight - 2, capTop, capCx + 4, capTop - 3);
        g.bezierCurveTo(capCx, capTop - 5, capCx - 4, capTop - 3, capLeft - 4, capTop);
        g.bezierCurveTo(capLeft - 2, capTop, capLeft - 4, capBot - 6, capLeft, capBot);
        g.closePath();
        g.endFill();

        // Cap deep shadow (right side)
        g.beginFill(COLORS.roofRedDeep, 0.5);
        g.moveTo(capCx + 2, capBot);
        g.lineTo(capRight, capBot);
        g.bezierCurveTo(capRight + 4, capBot - 6, capRight - 2, capTop, capCx + 4, capTop - 3);
        g.closePath();
        g.endFill();

        // Cap highlight (left sunlit)
        g.beginFill(COLORS.roofRedHi, 0.45);
        g.moveTo(capLeft, capBot);
        g.lineTo(capCx - 2, capBot);
        g.bezierCurveTo(capCx - 4, capTop, capLeft - 2, capTop, capLeft - 4, capBot - 6);
        g.closePath();
        g.endFill();

        // Shingle rows (4 horizontal rows)
        for (let row = 1; row <= 4; row++) {
            const rowY = capBot - (capBot - capTop) * (row / 5);
            const rowW = capW * (1 - row * 0.12);
            const rowLeft = capCx - rowW / 2;
            const rowRight = capCx + rowW / 2;

            // Row underline shadow
            g.lineStyle(1, COLORS.roofRedDeep, 0.8);
            g.moveTo(rowLeft + 2, rowY);
            g.lineTo(rowRight - 2, rowY);
            g.lineStyle(0);

            // Row highlight
            g.lineStyle(0.5, COLORS.roofRedLight, 0.6);
            g.moveTo(rowLeft + 2, rowY + 0.5);
            g.lineTo(rowRight - 2, rowY + 0.5);
            g.lineStyle(0);

            // Shingle gaps (vertical short marks)
            const gapCount = 4 + row;
            for (let i = 1; i < gapCount; i++) {
                const gx = rowLeft + ((rowRight - rowLeft) * i) / gapCount;
                g.lineStyle(0.6, COLORS.roofRedDeep, 0.65);
                g.moveTo(gx, rowY - 3);
                g.lineTo(gx, rowY);
                g.lineStyle(0);
            }
        }

        // Cap outline
        g.lineStyle(2, COLORS.outline, 0.95);
        g.moveTo(capLeft, capBot);
        g.lineTo(capRight, capBot);
        g.bezierCurveTo(capRight + 4, capBot - 6, capRight - 2, capTop, capCx + 4, capTop - 3);
        g.bezierCurveTo(capCx, capTop - 5, capCx - 4, capTop - 3, capLeft - 4, capTop);
        g.bezierCurveTo(capLeft - 2, capTop, capLeft - 4, capBot - 6, capLeft, capBot);
        g.closePath();
        g.lineStyle(0);

        // Ridge (top dark accent line)
        g.lineStyle(2, COLORS.roofRidge, 0.9);
        g.moveTo(capLeft - 2, capTop);
        g.bezierCurveTo(capCx - 4, capTop - 5, capCx + 4, capTop - 5, capRight + 2, capTop);
        g.lineStyle(0);

        // Ridge top knob
        g.beginFill(COLORS.roofRidge, 1);
        g.drawCircle(capCx, capTop - 4, 2.5);
        g.endFill();
        g.beginFill(COLORS.roofRedHi, 0.6);
        g.drawCircle(capCx - 0.6, capTop - 4.5, 1.2);
        g.endFill();

        this.capContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // 6) WEATHER VANE (rooster, rotating ze swayem)
    // ═══════════════════════════════════════════════════════════
    private drawWeatherVane(): void {
        const { x, y } = this;
        const capCx = x + TOWER_W / 2;
        const capTopY = y - 16;  // above cap

        this.weatherVane = new PIXI.Container();
        const g = new PIXI.Graphics();

        // Pole
        g.beginFill(COLORS.vaneIron, 1);
        g.drawRect(-0.8, 0, 1.6, 12);
        g.endFill();
        g.beginFill(COLORS.vaneIronLight, 0.6);
        g.drawRect(-0.8, 0, 0.6, 12);
        g.endFill();

        // Cross arms (N-S-E-W indicators)
        g.lineStyle(1, COLORS.vaneIron, 0.95);
        g.moveTo(-6, 6);
        g.lineTo(6, 6);
        g.lineStyle(0);
        // N letter (top tiny mark)
        g.beginFill(COLORS.vaneIron, 1);
        g.drawCircle(0, 0, 1.2);
        g.endFill();

        // Rooster silhouette (small body + tail)
        g.beginFill(COLORS.vaneIron, 1);
        g.drawPolygon([
            -5, 2,  // body back
            -2, -2, // back rise
            2, -3,  // head
            4, -1,  // beak
            3, 1,   // neck
            5, 2,   // front chest
            4, 5,   // belly
            -3, 5,  // back belly
            -5, 2,
        ]);
        g.endFill();
        // Tail feathers
        g.beginFill(COLORS.vaneIron, 1);
        g.drawPolygon([
            -5, 2,
            -10, -2,
            -8, 2,
            -10, 5,
            -5, 5,
        ]);
        g.endFill();
        // Comb (top)
        g.beginFill(COLORS.vaneIron, 1);
        g.drawCircle(2, -3, 1);
        g.drawCircle(3, -4, 0.8);
        g.endFill();
        // Highlight on rooster body
        g.beginFill(COLORS.vaneIronLight, 0.5);
        g.drawPolygon([-3, -1, 1, -2, 2, 0, -2, 3]);
        g.endFill();

        this.weatherVane.addChild(g);
        this.weatherVane.x = capCx;
        this.weatherVane.y = capTopY;
        this.animatedContainer.addChild(this.weatherVane);
    }

    // ═══════════════════════════════════════════════════════════
    // 7) BLADES (4 cross, rotating — parallax z high zIndex)
    // ═══════════════════════════════════════════════════════════
    private drawBlades(_rng: () => number): void {
        const { x, y } = this;
        const hubCx = x + TOWER_W / 2;
        const hubCy = y - 2;  // tuż NAD cap (front of windmill)

        // Container PIVOTS at hub center
        this.bladesContainer.x = hubCx;
        this.bladesContainer.y = hubCy;

        const bladesGfx = new PIXI.Graphics();

        // ── 4 blades w cross pattern (każda extends z hub) ──
        // Blade rotation 0 = N, 90 = E, 180 = S, 270 = W
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;  // 0, 90, 180, 270
            this.drawSingleBlade(bladesGfx, angle);
        }

        // ── Center hub (iron disk) ──
        // Hub outer ring
        bladesGfx.beginFill(COLORS.ironDark, 1);
        bladesGfx.drawCircle(0, 0, BLADE_HUB_RADIUS);
        bladesGfx.endFill();
        // Hub mid
        bladesGfx.beginFill(COLORS.ironMid, 1);
        bladesGfx.drawCircle(0, 0, BLADE_HUB_RADIUS - 1.5);
        bladesGfx.endFill();
        // Hub highlight
        bladesGfx.beginFill(COLORS.ironHighlight, 0.9);
        bladesGfx.drawCircle(-1.5, -1.5, BLADE_HUB_RADIUS * 0.4);
        bladesGfx.endFill();
        // Hub catchlight
        bladesGfx.beginFill(0xffffff, 0.7);
        bladesGfx.drawCircle(-2, -2, 1.4);
        bladesGfx.endFill();
        // Hub center bolt
        bladesGfx.beginFill(COLORS.ironDark, 1);
        bladesGfx.drawCircle(0, 0, 2);
        bladesGfx.endFill();
        // Hub outline
        bladesGfx.lineStyle(1.2, COLORS.outline, 0.95);
        bladesGfx.drawCircle(0, 0, BLADE_HUB_RADIUS);
        bladesGfx.lineStyle(0);

        this.bladesContainer.addChild(bladesGfx);

        // ── Flag on hub (small tropical accent w środku) ──
        this.flag = new PIXI.Graphics();
        this.flag.beginFill(COLORS.flagTeal, 1);
        this.flag.drawPolygon([0, 0, 14, -3, 18, 0, 14, 3]);
        this.flag.endFill();
        this.flag.beginFill(COLORS.flagTealLight, 0.6);
        this.flag.drawPolygon([0, 0, 8, -2, 10, 0, 8, 2]);
        this.flag.endFill();
        this.flag.lineStyle(0.8, COLORS.outline, 0.9);
        this.flag.drawPolygon([0, 0, 14, -3, 18, 0, 14, 3]);
        this.flag.lineStyle(0);
        // Flag attaches do hub na osobnym position (NIE rotates z bladami)
        this.flag.x = hubCx + 8;
        this.flag.y = hubCy - 6;
        this.animatedContainer.addChild(this.flag);
    }

    private drawSingleBlade(g: PIXI.Graphics, angle: number): void {
        // Blade extends FROM hub edge OUTWARD in direction `angle`
        const startR = BLADE_HUB_RADIUS;
        const endR = BLADE_LENGTH;
        const halfWidth = BLADE_WIDTH / 2;

        // Compute blade corners w local space (hub at 0,0)
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        // Perpendicular (90° to angle)
        const cosP = Math.cos(angle + Math.PI / 2);
        const sinP = Math.sin(angle + Math.PI / 2);

        // 4 corners of blade rectangle (na linii angle, perpendicular ±halfWidth)
        const innerTopX = startR * cosA + halfWidth * cosP;
        const innerTopY = startR * sinA + halfWidth * sinP;
        const innerBotX = startR * cosA - halfWidth * cosP;
        const innerBotY = startR * sinA - halfWidth * sinP;
        const outerTopX = endR * cosA + halfWidth * cosP;
        const outerTopY = endR * sinA + halfWidth * sinP;
        const outerBotX = endR * cosA - halfWidth * cosP;
        const outerBotY = endR * sinA - halfWidth * sinP;

        // ── Wood frame (the cross beam of the blade) ──
        const frameWidth = BLADE_WIDTH * 0.32;
        const fHalf = frameWidth / 2;
        const fInnerTopX = startR * cosA + fHalf * cosP;
        const fInnerTopY = startR * sinA + fHalf * sinP;
        const fInnerBotX = startR * cosA - fHalf * cosP;
        const fInnerBotY = startR * sinA - fHalf * sinP;
        const fOuterTopX = endR * cosA + fHalf * cosP;
        const fOuterTopY = endR * sinA + fHalf * sinP;
        const fOuterBotX = endR * cosA - fHalf * cosP;
        const fOuterBotY = endR * sinA - fHalf * sinP;

        // ── Canvas sail (jeden bok wood frame — w tym przypadku top side) ──
        // Sail base
        g.beginFill(COLORS.canvasMid, 1);
        g.drawPolygon([
            innerTopX, innerTopY,
            outerTopX, outerTopY,
            fOuterTopX, fOuterTopY,
            fInnerTopX, fInnerTopY,
        ]);
        g.endFill();
        // Sail highlight (closer to outer end)
        g.beginFill(COLORS.canvasLight, 0.6);
        g.drawPolygon([
            innerTopX + (outerTopX - innerTopX) * 0.55, innerTopY + (outerTopY - innerTopY) * 0.55,
            outerTopX, outerTopY,
            fOuterTopX, fOuterTopY,
            fInnerTopX + (fOuterTopX - fInnerTopX) * 0.55, fInnerTopY + (fOuterTopY - fInnerTopY) * 0.55,
        ]);
        g.endFill();
        // Sail shadow (closer to hub)
        g.beginFill(COLORS.canvasDeep, 0.45);
        g.drawPolygon([
            innerTopX, innerTopY,
            innerTopX + (outerTopX - innerTopX) * 0.35, innerTopY + (outerTopY - innerTopY) * 0.35,
            fInnerTopX + (fOuterTopX - fInnerTopX) * 0.35, fInnerTopY + (fOuterTopY - fInnerTopY) * 0.35,
            fInnerTopX, fInnerTopY,
        ]);
        g.endFill();

        // ── Sail diagonal struts (3 cross-tension lines per blade na canvas side) ──
        for (let s = 1; s < 4; s++) {
            const t = s / 4;
            const sxL = innerTopX + (outerTopX - innerTopX) * t;
            const syL = innerTopY + (outerTopY - innerTopY) * t;
            const sxR = fInnerTopX + (fOuterTopX - fInnerTopX) * t;
            const syR = fInnerTopY + (fOuterTopY - fInnerTopY) * t;
            g.lineStyle(0.7, COLORS.canvasShadow, 0.55);
            g.moveTo(sxL, syL);
            g.lineTo(sxR, syR);
            g.lineStyle(0);
        }

        // Sail outline
        g.lineStyle(1.2, COLORS.outline, 0.85);
        g.drawPolygon([
            innerTopX, innerTopY,
            outerTopX, outerTopY,
            fOuterTopX, fOuterTopY,
            fInnerTopX, fInnerTopY,
        ]);
        g.lineStyle(0);

        // ── Wood frame (central beam — jasne drewno z highlight) ──
        g.beginFill(COLORS.woodTop, 1);
        g.drawPolygon([
            fInnerTopX, fInnerTopY,
            fOuterTopX, fOuterTopY,
            fOuterBotX, fOuterBotY,
            fInnerBotX, fInnerBotY,
        ]);
        g.endFill();
        // Wood highlight (NW side)
        g.beginFill(COLORS.woodLight, 0.55);
        g.drawPolygon([
            fInnerTopX, fInnerTopY,
            fOuterTopX, fOuterTopY,
            fOuterTopX + (fOuterBotX - fOuterTopX) * 0.35, fOuterTopY + (fOuterBotY - fOuterTopY) * 0.35,
            fInnerTopX + (fInnerBotX - fInnerTopX) * 0.35, fInnerTopY + (fInnerBotY - fInnerTopY) * 0.35,
        ]);
        g.endFill();
        // Wood shadow (SE side)
        g.beginFill(COLORS.woodDeep, 0.55);
        g.drawPolygon([
            fInnerTopX + (fInnerBotX - fInnerTopX) * 0.65, fInnerTopY + (fInnerBotY - fInnerTopY) * 0.65,
            fOuterTopX + (fOuterBotX - fOuterTopX) * 0.65, fOuterTopY + (fOuterBotY - fOuterTopY) * 0.65,
            fOuterBotX, fOuterBotY,
            fInnerBotX, fInnerBotY,
        ]);
        g.endFill();
        // Wood frame outline
        g.lineStyle(1.4, COLORS.outline, 0.95);
        g.drawPolygon([
            fInnerTopX, fInnerTopY,
            fOuterTopX, fOuterTopY,
            fOuterBotX, fOuterBotY,
            fInnerBotX, fInnerBotY,
        ]);
        g.lineStyle(0);

        // Outer tip nail (sail mounting point)
        const tipX = endR * cosA;
        const tipY = endR * sinA;
        g.beginFill(COLORS.ironDark, 1);
        g.drawCircle(tipX, tipY, 1.5);
        g.endFill();
        g.beginFill(COLORS.ironHighlight, 0.85);
        g.drawCircle(tipX - 0.4, tipY - 0.4, 0.6);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // ANIMATION UPDATE
    // ═══════════════════════════════════════════════════════════
    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        const dt = 1 / 60;
        this.elapsed += dt;
        const t = this.elapsed;

        // ── 1) Blades continuous rotation (slow majestic, ~22s full rotation) ──
        // Angular velocity: 2*PI / 22s = ~0.286 rad/s per frame at 60fps = 0.00476 rad/frame
        if (this.bladesContainer) {
            this.bladesContainer.rotation = t * 0.286;
        }

        // ── 2) Window glow pulse (warm light, breathing) ──
        if (this.windowGlow) {
            this.windowGlow.alpha = 0.45 + Math.sin(t * 1.4) * 0.18;
        }

        // ── 3) Weather vane sway (rooster wind direction) ──
        if (this.weatherVane) {
            this.weatherVane.rotation = Math.sin(t * 0.8) * 0.15 + Math.sin(t * 0.3) * 0.08;
        }

        // ── 4) Flag wind sway (na hub) ──
        if (this.flag) {
            this.flag.rotation = Math.sin(t * 2.2) * 0.12;
            // Slight scaleX flutter
            this.flag.scale.x = 1 + Math.sin(t * 4.5) * 0.08;
        }

        // ── 5) Sparrow occasional flutter (rare, on cap edge) ──
        // SKIPPED dla v0.35.0 — can be added later. Inne 4 animacje sufficient dla AAA premium.
    }

    /**
     * Windmill ma tower body solid collision (player + bullets blocked).
     * Blades są parallax (wysoko) — NIE blokują playera (player przechodzi POD).
     */
    public getExtraCollidables(): ICollidable[] {
        return [];
    }
}