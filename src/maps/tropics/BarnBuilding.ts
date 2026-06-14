import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * v0.32.0 FAZA T4 — BARN BUILDING (stodoła) AAA PREMIUM
 *
 * Rewrite z najlepszymi mikro-detalami AAA + naprawą wszystkich bugów:
 * - Natywny gradient (Canvas API → PIXI.Texture, shared cache)
 * - Stone foundation (kamienny pas pod walls)
 * - Sliding door rail + X-braces (autentyczne wrota stodoły)
 * - Hayloft door + animowana lina z hakiem (Pulley)
 * - Ridge beam (gruba belka kalenicy)
 * - Iso roof tiles na obu płatach dachu
 * - Cast shadows pod overhangami
 * - Soczysta paleta #de5135 (Brawl Stars saturation)
 * - Subtle Life: vane rotation, window glow pulse, hay sway, ROPE SWAY
 *
 * CONTAINER STACK (zIndex bottom-up):
 *   -86: aoContainer       — drop shadows + AO
 *   y+h: staticContainer   — foundation, walls (gradient), roof (tiles), drzwi, cupola
 *   y+h: animatedContainer — kogut (rot), okna glow (alpha), hay (skew), rope (clear+redraw)
 *
 * Texture cache: static Map shared across all instances (key: colorTop-colorBot-height).
 * Wymusza zero memory leak przy spawnowaniu wielu stodół (przyszłe T4b/T4c).
 */

const COLORS = {
    aoShadow:           0x000000,
    // Walls — soczysta brawl-stars paleta
    wallRedTop:         0xde5135,
    wallRedBot:         0x962817,
    wallRedLight:       0xf06f56,
    wallRedDeep:        0x451009,
    wallSideTop:        0x701f13,
    wallSideBot:        0x3d0e07,
    // Foundation kamienna
    foundation:         0x6b6058,
    foundationLight:    0x8c8279,
    foundationShadow:   0x453b34,
    // Cast shadows pod overhangami
    castShadow:         0x360c06,
    // Trim
    trim:               0xffe8cf,
    trimShadow:         0xcca785,
    trimDark:           0x806349,
    // Roof tiles
    tileN:              0x824222,
    tileNLight:         0xab5830,
    tileNHighlight:     0xd17447,
    tileNOutline:       0x2e1205,
    roofRidge:          0x542914,
    roofThickness:      0x401b0b,
    // Door
    doorHole:           0x1a0d04,
    doorRail:           0x292929,
    doorDark:           0x472916,
    doorLight:          0x6b442a,
    doorHighlight:      0x8c5e40,
    // Iron
    ironHardware:       0x212121,
    ironHighlight:      0x5e5e5e,
    // Window
    windowHole:         0x0a0501,
    windowFrame:        0xffe8cf,
    windowGlow:         0xffe866,
    windowGlowOuter:    0xffbc2b,
    // Cupola
    cupolaWood:         0x593d2b,
    // Pulley & rope
    pulleyWood:         0x593d2b,
    rope:               0xcca27c,
    // Vane
    weatherVane:        0x212121,
    weatherVaneGold:    0xd0a040,
    // Hay
    hayMain:            0xeabf46,
    hayDark:            0xad8621,
    hayLight:           0xffdf70,
    // v0.32.3: Silo (metallic grain silo za barn)
    siloMain:           0x9ea7ad,
    siloDark:           0x6a7177,
    siloLight:          0xc4cad0,
    siloRib:            0x4f5559,
    siloDome:           0x787f85,
    siloDomeLight:      0xa5acb1,
    siloDomeDark:       0x4d5256,
    siloLadder:         0x2f2f2f,
    siloDarkOutline:    0x363c41,
};

interface WindowGlowGfx {
    gfx: PIXI.Graphics;
    phaseOffset: number;
}

interface Pt {
    x: number;
    y: number;
}

export class BarnBuilding implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private aoContainer: PIXI.Container;
    private staticContainer: PIXI.Container;
    private animatedContainer: PIXI.Container;
    private siloContainer: PIXI.Container;  // v0.32.3: silos za barn
    private _frontW: number;  // v0.32.8: original front wall width (this.w = hitbox extended)

    private vaneGfx!: PIXI.Container;
    private windowGlows: WindowGlowGfx[] = [];
    private hayGfx!: PIXI.Container;
    private ropeGfx!: PIXI.Graphics;
    private ropeAnchorX: number = 0;
    private ropeAnchorY: number = 0;

    private time: number = 0;

    // Static gradient texture cache — shared across instances (zero memory leak)
    private static gradientCache: Map<string, PIXI.Texture> = new Map();

    constructor(
        x: number, y: number,
        w: number, h: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        // v0.32.8: hitbox extension (right side wall sticking out 32px)
        // _frontW = original front wall width dla drawing, this.w = hitbox dla collision
        this._frontW = w;
        this.x = x;
        this.y = y;
        this.w = w + 32;  // hitbox covers right side wall sticking out (Mariusz feedback - "mogę wjechać w dom")
        this.h = h;

        const rng = makeRng(seed);

        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;
        this.drawAO();
        worldContainer.addChild(this.aoContainer);

        // v0.32.8: 3 silosy (silos1 lewy + 2 nowe w miejscu drzewa)
        this.siloContainer = new PIXI.Container();
        this.siloContainer.zIndex = Math.floor(y + h) - 60;
        // silos1 — istniejący po lewej
        this.drawSilo(x + 35, 32, y - 8);
        // silos2 i silos3 — w miejscu drzewa, na prawo od koguta (kogut x≈x+140.4)
        this.drawSilo(x + 165, 22, y - 5);
        this.drawSilo(x + 215, 22, y - 5);
        worldContainer.addChild(this.siloContainer);

        this.staticContainer = new PIXI.Container();
        this.staticContainer.zIndex = Math.floor(y + h);
        this.drawStaticParts(rng);
        worldContainer.addChild(this.staticContainer);

        this.animatedContainer = new PIXI.Container();
        this.animatedContainer.zIndex = Math.floor(y + h);
        this.drawAnimatedParts(rng);
        worldContainer.addChild(this.animatedContainer);
    }

    // ═══════════════════════════════════════════════════════════
    // GRADIENT TEXTURE — Canvas API → PIXI.Texture, shared cache
    // ═══════════════════════════════════════════════════════════
    private static getGradientTexture(colorTop: number, colorBot: number, height: number): PIXI.Texture {
        const key = `${colorTop.toString(16)}-${colorBot.toString(16)}-${height}`;
        const cached = BarnBuilding.gradientCache.get(key);
        if (cached) return cached;

        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = Math.max(1, Math.ceil(height));
        const ctx = canvas.getContext('2d')!;
        const grd = ctx.createLinearGradient(0, 0, 0, height);
        grd.addColorStop(0, '#' + colorTop.toString(16).padStart(6, '0'));
        grd.addColorStop(1, '#' + colorBot.toString(16).padStart(6, '0'));
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 1, height);

        const tex = PIXI.Texture.from(canvas);
        BarnBuilding.gradientCache.set(key, tex);
        return tex;
    }

    private fillGradientPolygon(g: PIXI.Graphics, points: Pt[], colorTop: number, colorBot: number): void {
        const minY = Math.min(...points.map(p => p.y));
        const maxY = Math.max(...points.map(p => p.y));
        const height = maxY - minY;

        const texture = BarnBuilding.getGradientTexture(colorTop, colorBot, height);
        const matrix = new PIXI.Matrix();
        matrix.translate(0, minY);

        g.beginTextureFill({ texture, matrix });
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.closePath();
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // AO — Extended SE drop shadow + contact shadow
    // ═══════════════════════════════════════════════════════════
    private drawAO(): void {
        const g = new PIXI.Graphics();
        const x = this.x, y = this.y, h = this.h;
        const w = this._frontW;  // v0.32.8: front wall width

        // Outermost ambient haze (extended SE)
        g.beginFill(COLORS.aoShadow, 0.10);
        g.moveTo(x - 12, y + h * 0.55);
        g.lineTo(x + w + 70, y + h * 0.55);
        g.lineTo(x + w + 85, y + h + 45);
        g.lineTo(x - 12, y + h + 45);
        g.closePath();
        g.endFill();

        // Mid shadow (closer to footprint)
        g.beginFill(COLORS.aoShadow, 0.18);
        g.moveTo(x - 4, y + h * 0.72);
        g.lineTo(x + w + 42, y + h * 0.72);
        g.lineTo(x + w + 55, y + h + 30);
        g.lineTo(x - 4, y + h + 30);
        g.closePath();
        g.endFill();

        // v0.32.1: usunięte owale (Mariusz feedback) — tylko SE polygon shadow

        this.aoContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // STATIC PARTS — foundation, walls, roof, drzwi, hayloft
    // ═══════════════════════════════════════════════════════════
    private drawStaticParts(rng: () => number): void {
        const g = new PIXI.Graphics();
        const x = this.x, y = this.y, h = this.h;
        const w = this._frontW;  // v0.32.8: front wall width (hitbox this.w extended)

        // Proporcje
        const roofH = h * 0.45;
        const wallH = h - roofH;
        const wallY = y + roofH;
        const cx = x + w / 2;
        const FOUNDATION_H = 20;  // v0.32.3: większy dla widoczności
        const foundY = wallY + wallH - FOUNDATION_H;

        // 3D profile
        const RIGHT_DEPTH = 32;
        const LEFT_DEPTH = 0;  // v0.32.2: usunięta (Mariusz: wystawała za roof outline)
        const ISO_RISE = 18;

        // Ridge apex offset (asymetria 3D)
        const ridgeApexX = cx + w * 0.04;
        const ridgeApexY = y + h * 0.04;

        // Wall corners (front) — v0.32.5 BUGFIX: fBL/fBR.y = foundY (nie y+h)
        // Front wall kończy się na TOP foundation, foundation jest WIDOCZNYM pasem pod
        // (dotąd: front wall sięgała do y+h = ground i POKRYWAŁA foundation w całości)
        const fBL: Pt = { x, y: foundY };
        const fBR: Pt = { x: x + w, y: foundY };
        const fTL: Pt = { x, y: wallY };
        const fTR: Pt = { x: x + w, y: wallY };

        // Right side wall corners (iso depth)
        const sBL: Pt = { ...fBR };
        const sTL: Pt = { ...fTR };
        const sBR: Pt = { x: fBR.x + RIGHT_DEPTH, y: fBR.y - ISO_RISE };  // v0.32.6 BUGFIX: pełny ISO_RISE = parallelogram
        const sTR: Pt = { x: fTR.x + RIGHT_DEPTH, y: fTR.y - ISO_RISE };

        // ── 1. FOUNDATION v0.32.2 (kamienny pas TYLKO na froncie) ──
        // Side foundation usunięta — degenerate polygon tworzył dziwne cienie (Mariusz feedback)
        // v0.32.4: Foundation FULL WIDTH (Mariusz feedback - "znowu nie ma podmurówki")
        // Bez break pod drzwiami — drzwi zostaną narysowane PÓŹNIEJ i pokryją środkową część
        // Plus side foundation pod right sticking-out wall (2.5D bonus)
        const FOUND_STICK = 3;

        // Drop shadow pod foundation (subtle contact shadow na ground)
        g.beginFill(0x000000, 0.25);
        g.drawRect(x - FOUND_STICK + 2, foundY + FOUNDATION_H, w + FOUND_STICK * 2 - 4, 3);
        g.endFill();

        // Front foundation - PEŁNA szerokość (Mariusz: podmurówka ciągła)
        const frontFoundPoly: Pt[] = [
            { x: x - FOUND_STICK, y: foundY - 2 },
            { x: x + w + FOUND_STICK, y: foundY - 2 },
            { x: x + w + FOUND_STICK, y: foundY + FOUNDATION_H },
            { x: x - FOUND_STICK, y: foundY + FOUNDATION_H },
        ];
        this.fillGradientPolygon(g, frontFoundPoly, COLORS.foundationLight, COLORS.foundationShadow);

        // v0.32.6: Side foundation z PEŁNYM ISO_RISE (parallelogram matching side wall)
        const sFndPoly: Pt[] = [
            { x: x + w, y: foundY },
            { x: x + w + RIGHT_DEPTH, y: foundY - ISO_RISE },
            { x: x + w + RIGHT_DEPTH, y: (y + h) - ISO_RISE },
            { x: x + w, y: y + h },
        ];
        this.fillGradientPolygon(g, sFndPoly, COLORS.foundationShadow, COLORS.foundationShadow);

        // Side foundation outlines (parallelogram = consistent slope)
        g.lineStyle(1.5, COLORS.foundationShadow, 0.9);
        g.moveTo(x + w, foundY);
        g.lineTo(x + w + RIGHT_DEPTH, foundY - ISO_RISE);
        g.lineStyle(0);
        g.lineStyle(2, 0x000000, 0.55);
        g.moveTo(x + w + RIGHT_DEPTH, foundY - ISO_RISE);
        g.lineTo(x + w + RIGHT_DEPTH, (y + h) - ISO_RISE);
        g.lineStyle(0);
        // Side foundation BOTTOM edge (krawędź na trawie - same slope co wall bottom)
        g.lineStyle(1.5, COLORS.foundationShadow, 0.9);
        g.moveTo(x + w, y + h);
        g.lineTo(x + w + RIGHT_DEPTH, (y + h) - ISO_RISE);
        g.lineStyle(0);

        // Top edge highlight (chunky sunlit edge na całej długości)
        g.lineStyle(3, COLORS.foundationLight, 1.0);
        g.moveTo(x - FOUND_STICK, foundY - 1);
        g.lineTo(x + w + FOUND_STICK, foundY - 1);
        g.lineStyle(0);

        // Bottom shadow line
        g.lineStyle(2, COLORS.foundationShadow, 1.0);
        g.moveTo(x - FOUND_STICK, foundY + FOUNDATION_H);
        g.lineTo(x + w + FOUND_STICK, foundY + FOUNDATION_H);
        g.lineStyle(0);

        // Side outlines
        g.lineStyle(1.5, COLORS.foundationShadow, 0.9);
        g.moveTo(x - FOUND_STICK, foundY - 2);
        g.lineTo(x - FOUND_STICK, foundY + FOUNDATION_H);
        g.moveTo(x + w + FOUND_STICK, foundY - 2);
        g.lineTo(x + w + FOUND_STICK, foundY + FOUNDATION_H);
        g.lineStyle(0);

        // Stone separators (8 across full width)
        const stoneCount = 8;
        const fullW = w + FOUND_STICK * 2;
        g.lineStyle(2, COLORS.foundationShadow, 0.85);
        for (let i = 1; i < stoneCount; i++) {
            const sx = (x - FOUND_STICK) + (fullW * i) / stoneCount + (rng() - 0.5) * 3;
            g.moveTo(sx, foundY + 1);
            g.lineTo(sx, foundY + FOUNDATION_H - 1);
        }
        g.lineStyle(0);

        // Stone highlights (top sunlit edge per stone)
        g.lineStyle(1.2, COLORS.foundationLight, 0.85);
        for (let i = 0; i < stoneCount; i++) {
            const sx1 = (x - FOUND_STICK) + (fullW * i) / stoneCount + 3;
            const sx2 = (x - FOUND_STICK) + (fullW * (i + 1)) / stoneCount - 3;
            g.moveTo(sx1, foundY + 2);
            g.lineTo(sx2, foundY + 2);
        }
        g.lineStyle(0);

        // v0.32.2: LEFT SIDE WALL usunięta (wystawała za roof outline)

        // ── 3. RIGHT SIDE WALL (E, sunlit, gradient sticking out 32px) ──
        const sideWallPoly: Pt[] = [
            { x: sBL.x, y: foundY },
            { x: sBR.x, y: sBR.y },  // v0.32.6: użyj sBR.y (pełny rise, parallelogram)
            { x: sTR.x, y: sTR.y },
            { x: sTL.x, y: sTL.y },
        ];
        this.fillGradientPolygon(g, sideWallPoly, COLORS.wallSideTop, COLORS.wallSideBot);

        // Side wall outline
        g.lineStyle(2, COLORS.wallRedDeep, 1.0);
        g.moveTo(sBR.x, sBR.y - ISO_RISE * 0.0);
        g.lineTo(sTR.x, sTR.y);
        g.moveTo(sTR.x, sTR.y);
        g.lineTo(sTL.x, sTL.y);
        g.moveTo(sBR.x, sBR.y);
        g.lineTo(sBL.x, sBL.y);
        g.lineStyle(0);

        // Side wall planks
        g.lineStyle(1.2, COLORS.wallRedDeep, 0.55);
        for (let i = 1; i <= 3; i++) {
            const t = i / 4;
            const bx = sBL.x + (sBR.x - sBL.x) * t;
            const by = sBL.y + (sBR.y - sBL.y) * t;
            const tx = sTL.x + (sTR.x - sTL.x) * t;
            const ty = sTL.y + (sTR.y - sTL.y) * t;
            g.moveTo(bx, by);
            g.lineTo(tx, ty);
        }
        g.lineStyle(0);

        // ── 4. FRONT WALL — natywny gradient ──
        const frontPoly: Pt[] = [fTL, fTR, fBR, fBL];
        this.fillGradientPolygon(g, frontPoly, COLORS.wallRedTop, COLORS.wallRedBot);

        // Front wall planks z gwoździami + wyłamaniami
        const PLANK_COUNT = 9;
        for (let i = 1; i < PLANK_COUNT; i++) {
            const t = i / PLANK_COUNT;
            const wobble = (rng() - 0.5) * 2;
            const px = fTL.x + (fTR.x - fTL.x) * t + wobble;

            // Plank shadow (deep)
            g.lineStyle(2, COLORS.wallRedDeep, 0.75);
            g.moveTo(px, fTL.y + 2);
            g.lineTo(px, foundY - 1);
            g.lineStyle(0);

            // Plank highlight (sunlit left edge)
            g.lineStyle(1, COLORS.wallRedLight, 0.7);
            g.moveTo(px + 1.5, fTL.y + 2);
            g.lineTo(px + 1.5, foundY - 1);
            g.lineStyle(0);

            // Nails (góra + dół deski)
            this.drawNail(g, px - 2, fTL.y + 5);
            this.drawNail(g, px - 2, foundY - 5);

            // Random wyłamanie u dołu (25% chance)
            if (rng() > 0.75) {
                g.beginFill(COLORS.wallRedDeep, 1.0);
                const damageH = 4 + rng() * 4;
                g.drawPolygon([
                    px - 3, foundY,
                    px + 2, foundY,
                    px - 1, foundY - damageH,
                ]);
                g.endFill();
            }
        }

        // Front wall left edge rim light (subtle)
        g.lineStyle(2, COLORS.wallRedLight, 0.7);
        g.moveTo(fTL.x + 1, fTL.y);
        g.lineTo(fTL.x + 1, foundY);
        g.lineStyle(0);

        // ── 5. WALL TRIM (białe paski) ──
        // Top trim sill
        g.beginFill(COLORS.trim, 0.95);
        g.drawRect(x - LEFT_DEPTH - 1, wallY - 3, w + LEFT_DEPTH + RIGHT_DEPTH + 2, 5);
        g.endFill();
        g.lineStyle(1, COLORS.trimShadow, 0.75);
        g.moveTo(x - LEFT_DEPTH - 1, wallY + 2);
        g.lineTo(x + w + RIGHT_DEPTH + 1, wallY + 2);
        g.lineStyle(0);

        // Vertical corner trim
        const CORNER_TRIM_W = 7;
        g.beginFill(COLORS.trim, 0.95);
        g.drawRect(x, wallY, CORNER_TRIM_W, wallH - FOUNDATION_H);
        g.drawRect(x + w - CORNER_TRIM_W, wallY, CORNER_TRIM_W, wallH - FOUNDATION_H);
        g.endFill();
        // Corner trim shadow (right edge)
        g.lineStyle(1, COLORS.trimShadow, 0.65);
        g.moveTo(x + CORNER_TRIM_W - 1, wallY);
        g.lineTo(x + CORNER_TRIM_W - 1, foundY);
        g.moveTo(x + w - CORNER_TRIM_W + 1, wallY);
        g.lineTo(x + w - CORNER_TRIM_W + 1, foundY);
        g.lineStyle(0);

        // ── 6. HAYLOFT DOOR (mały, na środku górnej połowy front wall) ──
        const loftW = 26;
        const loftH = 30;
        const loftX = cx - loftW / 2;
        const loftY = wallY + 6;

        // Hayloft drop shadow
        g.beginFill(COLORS.castShadow, 0.55);
        g.drawRect(loftX - 2, loftY + loftH, loftW + 4, 5);
        g.endFill();

        // Hayloft hole (recessed)
        g.beginFill(COLORS.doorHole, 1.0);
        g.drawRect(loftX - 3, loftY - 3, loftW + 6, loftH + 5);
        g.endFill();

        // Hayloft door panels (drewniane)
        g.beginFill(COLORS.doorDark, 1.0);
        g.drawRect(loftX, loftY, loftW, loftH);
        g.endFill();

        // Plank divisions w door
        g.lineStyle(1, COLORS.doorHole, 0.8);
        g.moveTo(loftX + loftW / 2, loftY + 2);
        g.lineTo(loftX + loftW / 2, loftY + loftH - 2);
        g.lineStyle(0);

        // Z-brace (klasyczny old barn style)
        g.lineStyle(2, COLORS.doorLight, 0.95);
        g.moveTo(loftX + 2, loftY + 3);
        g.lineTo(loftX + loftW - 2, loftY + 3);
        g.moveTo(loftX + 2, loftY + loftH - 3);
        g.lineTo(loftX + loftW - 2, loftY + loftH - 3);
        g.moveTo(loftX + loftW - 2, loftY + 3);
        g.lineTo(loftX + 2, loftY + loftH - 3);
        g.lineStyle(0);

        // Door outline
        g.lineStyle(1.5, COLORS.doorHole, 1.0);
        g.drawRect(loftX, loftY, loftW, loftH);
        g.lineStyle(0);

        // ── 7. PULLEY BEAM (wystaje z gable end, nad hayloft door) ──
        const pulleyY = loftY - 18;
        // Beam shadow
        g.beginFill(COLORS.castShadow, 0.7);
        g.drawRect(cx - 4, pulleyY + 8, 8, 18);
        g.endFill();
        // Beam wood
        g.beginFill(COLORS.pulleyWood, 1.0);
        g.drawRect(cx - 5, pulleyY, 10, 16);
        g.endFill();
        // Beam top highlight
        g.lineStyle(1.5, COLORS.doorHighlight, 0.85);
        g.moveTo(cx - 5, pulleyY + 1);
        g.lineTo(cx + 5, pulleyY + 1);
        g.lineStyle(0);
        // Beam outline
        g.lineStyle(1, 0x000000, 0.7);
        g.drawRect(cx - 5, pulleyY, 10, 16);
        g.lineStyle(0);

        // Pulley wheel (metalowe koło)
        g.beginFill(COLORS.ironHardware, 1.0);
        g.drawCircle(cx, pulleyY + 12, 4.5);
        g.endFill();
        g.beginFill(COLORS.ironHighlight, 1.0);
        g.drawCircle(cx - 1.2, pulleyY + 11, 1.5);
        g.endFill();
        g.lineStyle(0.8, 0x000000, 0.8);
        g.drawCircle(cx, pulleyY + 12, 4.5);
        g.lineStyle(0);
        // Store rope anchor pozycja (do animowanego container)
        this.ropeAnchorX = cx;
        this.ropeAnchorY = pulleyY + 12;

        // ── 8. SLIDING DOOR RAIL (metalowa szyna nad drzwiami) ──
        // v0.32.2: drzwi sięgają do GROUND (y+h), nie tylko do top of foundation (Mariusz feedback)
        const doorW = w * 0.40;
        const doorH = wallH * 0.55;  // wyższe drzwi
        const doorX = cx - doorW / 2;
        const doorY = (y + h) - doorH;  // bottom = ground level
        const railY = doorY - 14;

        // Rail shadow
        g.beginFill(COLORS.castShadow, 0.55);
        g.drawRect(doorX - 14, railY + 7, doorW + 28, 5);
        g.endFill();
        // Rail bracket
        g.beginFill(COLORS.ironHardware, 1.0);
        g.drawRect(doorX - 16, railY, doorW + 32, 7);
        g.endFill();
        // Rail highlight (sunlit top)
        g.lineStyle(1.2, COLORS.ironHighlight, 0.85);
        g.moveTo(doorX - 16, railY + 1);
        g.lineTo(doorX + doorW + 16, railY + 1);
        g.lineStyle(0);
        // Rail wheels (rolki)
        g.beginFill(COLORS.ironHighlight, 1.0);
        g.drawCircle(doorX + 6, railY + 9, 4);
        g.drawCircle(doorX + doorW - 6, railY + 9, 4);
        g.endFill();
        g.lineStyle(1, COLORS.ironHardware, 1.0);
        g.drawCircle(doorX + 6, railY + 9, 4);
        g.drawCircle(doorX + doorW - 6, railY + 9, 4);
        g.lineStyle(0);

        // ── 9. SLIDING DOORS (X-brace, podwójne) ──
        // Door hole (recessed)
        g.beginFill(COLORS.doorHole, 1.0);
        g.drawRect(doorX - 2, doorY, doorW + 4, doorH);
        g.endFill();

        // Door panels (lewy + prawy)
        const dGap = 3;
        const panelW = (doorW - dGap) / 2;
        g.beginFill(COLORS.doorDark, 1.0);
        g.drawRect(doorX, doorY, panelW, doorH);
        g.drawRect(doorX + panelW + dGap, doorY, panelW, doorH);
        g.endFill();

        // Horizontal planks (poziome deski)
        g.lineStyle(0.8, COLORS.doorHole, 0.7);
        for (let dy = 8; dy < doorH - 4; dy += 10) {
            g.moveTo(doorX, doorY + dy);
            g.lineTo(doorX + panelW, doorY + dy);
            g.moveTo(doorX + panelW + dGap, doorY + dy);
            g.lineTo(doorX + doorW, doorY + dy);
        }
        g.lineStyle(0);

        // X-BRACES (klasyczny barn detail)
        g.lineStyle(3, COLORS.doorLight, 0.95);
        // Left panel X
        g.moveTo(doorX + 2, doorY + 4);
        g.lineTo(doorX + panelW - 2, doorY + doorH - 2);
        g.moveTo(doorX + panelW - 2, doorY + 4);
        g.lineTo(doorX + 2, doorY + doorH - 2);
        // Right panel X
        g.moveTo(doorX + panelW + dGap + 2, doorY + 4);
        g.lineTo(doorX + doorW - 2, doorY + doorH - 2);
        g.lineTo(doorX + panelW + dGap + 2, doorY + 4);
        g.moveTo(doorX + doorW - 2, doorY + 4);
        g.lineTo(doorX + panelW + dGap + 2, doorY + doorH - 2);
        g.lineStyle(0);

        // Door highlights (top-left bevel per panel)
        g.lineStyle(1.5, COLORS.doorHighlight, 0.7);
        g.moveTo(doorX + 1, doorY + 1);
        g.lineTo(doorX + panelW - 1, doorY + 1);
        g.moveTo(doorX + panelW + dGap + 1, doorY + 1);
        g.lineTo(doorX + doorW - 1, doorY + 1);
        g.lineStyle(0);

        // Door handles (metalowe)
        const handleY = doorY + doorH / 2;
        g.beginFill(COLORS.ironHardware, 1.0);
        g.drawRect(doorX + panelW - 5, handleY, 3, 7);
        g.drawRect(doorX + panelW + dGap + 2, handleY, 3, 7);
        g.endFill();
        g.beginFill(COLORS.ironHighlight, 1.0);
        g.drawRect(doorX + panelW - 5, handleY, 1, 7);
        g.drawRect(doorX + panelW + dGap + 2, handleY, 1, 7);
        g.endFill();

        // ── 10. WINDOWS (po obu stronach drzwi + side window) ──
        const winSize = 28;
        const winY = wallY + 34;  // v0.32.3: okna niżej (Mariusz feedback)
        const winLeftX = x + 18;
        const winRightX = x + w - winSize - 18;
        this.drawWindowFrame(g, winLeftX, winY, winSize, false);
        this.drawWindowFrame(g, winRightX, winY, winSize, false);

        // v0.32.2: Side window - mniejszy + safer pozycja (Mariusz feedback)
        // Frame outline 4px + skew → bezpieczny margin od wall edges
        const sideWinSize = 14;
        const sideWinX = x + w + 16;  // 16px od wall left edge → frame +size+skew kończy się na ~x+w+28 (4px margin od x+w+32 right)
        const sideWinY = wallY + 32;  // niżej w wall — bardziej w środku
        this.drawWindowFrame(g, sideWinX, sideWinY, sideWinSize, true);

        // ── 11. ROOF v0.32.1 — SINGLE APEX, trójkątne połowy (stabilne kąty) ──
        const OVERHANG = 14;
        const rFrontL: Pt = { x: x - LEFT_DEPTH - OVERHANG, y: wallY + 2 };
        const rFrontR: Pt = { x: x + w + OVERHANG, y: wallY + 2 };
        const rSideBack: Pt = { x: sTR.x + OVERHANG / 2, y: sTR.y + 2 };
        const rApex: Pt = { x: ridgeApexX, y: ridgeApexY };
        // NIE ma rApexBack - single apex, prawa połać = trójkąt apex/rFrontR/rSideBack

        // v0.32.4: Roof thickness polygon USUNIĘTY (Mariusz feedback - cień pod dachem)

        // v0.32.3: Cast shadow z eave USUNIĘTY (Mariusz feedback)

        // Right roof slope — TRÓJKĄT (single apex, single back point)
        this.fillGradientPolygon(g, [rApex, rFrontR, rSideBack], COLORS.tileN, COLORS.roofThickness);
        // Iso tiles na right slope (trójkątna interpolacja)
        this.drawIsoRoofTilesTriangle(g, rApex, rFrontR, rSideBack);

        // Front roof slope (sunlit, jasniejszy)
        g.beginFill(COLORS.tileN, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.closePath();
        g.endFill();

        // Front tiles
        this.drawFrontRoofTiles(g, rFrontL, rFrontR, rApex);

        // ── 11b. FASCIA v0.32.7: dopasowana do eave bottom (bez prześwitu, Mariusz feedback) ──
        const FASCIA_H = 6;
        // Front fascia — top edge stykać się DOKŁADNIE z eave bottom (rFrontL.y = wallY+2)
        g.beginFill(COLORS.roofRidge, 1.0);
        g.drawRect(rFrontL.x, rFrontL.y, rFrontR.x - rFrontL.x, FASCIA_H);
        g.endFill();
        // Front fascia bottom outline
        g.lineStyle(1.5, 0x1a0a04, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y + FASCIA_H);
        g.lineTo(rFrontR.x, rFrontR.y + FASCIA_H);
        g.lineStyle(0);
        // Front fascia top highlight (subtle wood grain hint)
        g.lineStyle(1, COLORS.tileNHighlight, 0.45);
        g.moveTo(rFrontL.x + 2, rFrontL.y + 1);
        g.lineTo(rFrontR.x - 2, rFrontR.y + 1);
        g.lineStyle(0);

        // Side fascia — top edge na rFrontR.y / rSideBack.y (matching iso slope)
        g.beginFill(COLORS.roofRidge, 1.0);
        g.drawPolygon([
            rFrontR.x, rFrontR.y,
            rSideBack.x, rSideBack.y,
            rSideBack.x, rSideBack.y + FASCIA_H,
            rFrontR.x, rFrontR.y + FASCIA_H,
        ]);
        g.endFill();
        // Side fascia outlines
        g.lineStyle(1.5, 0x1a0a04, 1.0);
        g.moveTo(rFrontR.x, rFrontR.y + FASCIA_H);
        g.lineTo(rSideBack.x, rSideBack.y + FASCIA_H);
        g.lineStyle(0);

        // ── 12. RIDGE BEAM v0.32.1: belka biegnie od apex w stronę back wall ──
        const ridgeEndX = rApex.x + ISO_RISE * 0.4;  // krótszy stub
        const ridgeEndY = rApex.y - ISO_RISE * 0.6;
        g.lineStyle(5, COLORS.roofRidge, 1.0);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(ridgeEndX, ridgeEndY);
        g.lineStyle(0);
        g.lineStyle(1.5, COLORS.tileNHighlight, 0.85);
        g.moveTo(rApex.x - 1, rApex.y - 2);
        g.lineTo(ridgeEndX - 1, ridgeEndY - 2);
        g.lineStyle(0);

        // ── 13. ROOF EDGE OUTLINES + RIM LIGHTS ──
        // Front-left edge rim light
        g.lineStyle(4, COLORS.tileNHighlight, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineStyle(0);
        // Front-right edge mid highlight
        g.lineStyle(3, COLORS.tileNLight, 0.85);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(0);
        // Bottom outlines (brawl-stars chunky)
        g.lineStyle(3, COLORS.tileNOutline, 1.0);
        g.moveTo(rFrontL.x, rFrontL.y);
        g.lineTo(rApex.x, rApex.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(3, COLORS.tileNOutline, 1.0);
        g.moveTo(rApex.x, rApex.y);
        g.lineTo(rSideBack.x, rSideBack.y);
        g.lineTo(rFrontR.x, rFrontR.y);
        g.lineStyle(0);

        // ── 14. CUPOLA na ridge ──
        this.drawCupola(g, rApex.x, rApex.y);

        // ── 15. HAY drop shadow (animowane elementy w separate container) ──
        const hayX = x + 16;
        const hayY = foundY - 18;
        g.beginFill(0x000000, 0.40);
        g.drawEllipse(hayX + 8, hayY + 18, 14, 4);
        g.endFill();

        this.staticContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // FRONT ROOF TILES — 5 rzędów z brick pattern
    // ═══════════════════════════════════════════════════════════
    private drawFrontRoofTiles(g: PIXI.Graphics, pL: Pt, pR: Pt, apex: Pt): void {
        const ROWS = 5;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            const lerpY = pL.y + (apex.y - pL.y) * t;
            const lerpXL = pL.x + (apex.x - pL.x) * t;
            const lerpXR = pR.x + (apex.x - pR.x) * t;
            const rowW = lerpXR - lerpXL;

            // Cast shadow pod rzędem (głębia)
            g.lineStyle(4, COLORS.roofThickness, 0.35);
            g.moveTo(lerpXL, lerpY + 3);
            g.lineTo(lerpXR, lerpY + 3);
            g.lineStyle(0);

            // Vertical tile separators (brick offset co drugi)
            const COLS = Math.max(3, Math.floor(rowW / 22));
            const brickOff = r % 2 === 0 ? 0 : 0.5;
            g.lineStyle(1.5, COLORS.tileNOutline, 0.50);
            for (let c = 1; c < COLS; c++) {
                const tx = lerpXL + rowW * ((c - brickOff) / COLS);
                if (tx < lerpXL || tx > lerpXR) continue;
                g.moveTo(tx, lerpY);
                g.lineTo(tx, lerpY - 9);
            }
            g.lineStyle(0);

            // Row bottom edge (gruby outline)
            g.lineStyle(2.5, COLORS.tileNOutline, 0.70);
            g.moveTo(lerpXL, lerpY);
            g.lineTo(lerpXR, lerpY);
            g.lineStyle(0);

            // Row top highlight (sunlit eave per row)
            g.lineStyle(2, COLORS.tileNLight, 0.90);
            g.moveTo(lerpXL + 2, lerpY - 2);
            g.lineTo(lerpXR - 2, lerpY - 2);
            g.lineStyle(0);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ISO ROOF TILES — right slope (isometric perspective)
    // ═══════════════════════════════════════════════════════════
    private drawIsoRoofTilesTriangle(g: PIXI.Graphics, apex: Pt, frontR: Pt, sideBack: Pt): void {
        // Trójkątne tiles dla right slope: rzędy od front-back edge ku apex
        const ROWS = 4;
        for (let r = 1; r < ROWS; r++) {
            const t = r / ROWS;
            // Lerp od front-edge baseline (frontR -> sideBack) ku apex
            const lerpLeftX = frontR.x + (apex.x - frontR.x) * t;
            const lerpLeftY = frontR.y + (apex.y - frontR.y) * t;
            const lerpRightX = sideBack.x + (apex.x - sideBack.x) * t;
            const lerpRightY = sideBack.y + (apex.y - sideBack.y) * t;

            // Shadow
            g.lineStyle(3, COLORS.roofThickness, 0.35);
            g.moveTo(lerpLeftX, lerpLeftY + 2);
            g.lineTo(lerpRightX, lerpRightY + 2);
            g.lineStyle(0);

            // Row outline
            g.lineStyle(2, COLORS.tileNOutline, 0.65);
            g.moveTo(lerpLeftX, lerpLeftY);
            g.lineTo(lerpRightX, lerpRightY);
            g.lineStyle(0);

            // Row highlight
            g.lineStyle(1.5, COLORS.tileNLight, 0.75);
            g.moveTo(lerpLeftX, lerpLeftY - 1.5);
            g.lineTo(lerpRightX, lerpRightY - 1.5);
            g.lineStyle(0);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // WINDOW FRAME (with optional iso skew dla side wall)
    // ═══════════════════════════════════════════════════════════
    private drawWindowFrame(g: PIXI.Graphics, wx: number, wy: number, size: number, isoSkewed: boolean): void {
        // v0.32.1: skew matchuje right side wall iso ratio (ISO_RISE/RIGHT_DEPTH = 18/32 = 0.5625)
        const skewY = isoSkewed ? -size * 0.5625 : 0;
        const skewX = 0;  // right side wall ma sides PIONOWE, nie horizontal skew

        // Hole (recessed)
        g.beginFill(COLORS.windowHole, 1.0);
        if (isoSkewed) {
            g.drawPolygon([
                wx, wy,
                wx + size + skewX, wy + skewY,
                wx + size + skewX, wy + size + skewY,
                wx, wy + size,
            ]);
        } else {
            g.drawRect(wx, wy, size, size);
        }
        g.endFill();

        // Chunky frame outline
        g.lineStyle(4, COLORS.windowFrame, 1.0);
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

        // Frame drop shadow (bottom edge)
        g.lineStyle(3, COLORS.castShadow, 0.45);
        g.moveTo(wx - 2, wy + size + 3);
        g.lineTo(wx + size + skewX + 2, wy + size + skewY + 3);
        g.lineStyle(0);

        // Window cross (mullion)
        const midX = wx + size / 2 + skewX / 2;
        const midY = wy + size / 2 + skewY / 2;
        g.lineStyle(2.5, COLORS.windowFrame, 1.0);
        // Vertical
        g.moveTo(midX, wy + skewY * 0.5);
        g.lineTo(midX, wy + size + skewY * 0.5);
        // Horizontal
        g.moveTo(wx, midY);
        g.lineTo(wx + size + skewX, midY + skewY);
        g.lineStyle(0);
    }

    // ═══════════════════════════════════════════════════════════
    // CUPOLA — mały domek na szczycie ridge
    // ═══════════════════════════════════════════════════════════
    private drawCupola(g: PIXI.Graphics, apexX: number, apexY: number): void {
        const cw = 24;
        const ch = 22;
        const cx = apexX - cw / 2;
        const cy = apexY - ch - 4;

        // Body
        g.beginFill(COLORS.cupolaWood, 1.0);
        g.drawRect(cx, cy, cw, ch);
        g.endFill();
        // Body outline
        g.lineStyle(1.5, 0x000000, 0.7);
        g.drawRect(cx, cy, cw, ch);
        g.lineStyle(0);

        // Cupola window (warm glow)
        g.beginFill(COLORS.windowGlow, 0.92);
        g.drawRect(cx + 4, cy + 4, cw - 8, ch - 8);
        g.endFill();
        // Window outline
        g.lineStyle(1, COLORS.windowFrame, 0.9);
        g.drawRect(cx + 4, cy + 4, cw - 8, ch - 8);
        g.lineStyle(0);

        // Cupola roof (mały daszek z tile)
        g.beginFill(COLORS.tileN, 1.0);
        g.moveTo(cx - 5, cy);
        g.lineTo(apexX, cy - 10);
        g.lineTo(cx + cw + 5, cy);
        g.closePath();
        g.endFill();
        // Cupola roof outline + highlight
        g.lineStyle(2, COLORS.tileNOutline, 1.0);
        g.moveTo(cx - 5, cy);
        g.lineTo(apexX, cy - 10);
        g.lineTo(cx + cw + 5, cy);
        g.lineStyle(0);
        g.lineStyle(1, COLORS.tileNHighlight, 0.85);
        g.moveTo(cx - 4, cy - 1);
        g.lineTo(apexX, cy - 10);
        g.lineStyle(0);
    }

    // ═══════════════════════════════════════════════════════════
    // NAIL — mikro-detal (gwóźdź)
    // ═══════════════════════════════════════════════════════════
    private drawNail(g: PIXI.Graphics, x: number, y: number): void {
        g.beginFill(COLORS.ironHardware, 1.0);
        g.drawCircle(x, y, 1.4);
        g.endFill();
        g.beginFill(COLORS.ironHighlight, 1.0);
        g.drawCircle(x - 0.4, y - 0.4, 0.6);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // ANIMATED PARTS — vane, glows, hay, ROPE
    // ═══════════════════════════════════════════════════════════
    private drawAnimatedParts(rng: () => number): void {
        const x = this.x, y = this.y, h = this.h;
        const w = this._frontW;  // v0.32.8: front wall width
        const cx = x + w / 2;
        const roofH = h * 0.45;
        const wallH = h - roofH;
        const wallY = y + roofH;
        const FOUNDATION_H = 20;  // v0.32.3: większy dla widoczności
        const foundY = wallY + wallH - FOUNDATION_H;
        const ridgeApexX = cx + w * 0.04;
        const ridgeApexY = y + h * 0.04;

        // ── 1. WINDOW GLOWS (alpha-pulsed) ──
        // Front windows
        const winSize = 28;
        const winY = wallY + 34;  // v0.32.3: okna niżej (Mariusz feedback)
        const winLeftX = x + 18;
        const winRightX = x + w - winSize - 18;

        for (const [i, wx] of [winLeftX, winRightX].entries()) {
            const gfx = new PIXI.Graphics();
            // Outer warm halo
            gfx.beginFill(COLORS.windowGlowOuter, 0.45);
            gfx.drawCircle(wx + winSize / 2, winY + winSize / 2, winSize * 0.9);
            gfx.endFill();
            // Inner warm glass
            gfx.beginFill(COLORS.windowGlow, 0.95);
            gfx.drawRect(wx + 2, winY + 2, winSize - 4, winSize - 4);
            gfx.endFill();
            // Specular top-left
            gfx.beginFill(0xffffff, 0.55);
            gfx.drawRect(wx + 3, winY + 3, winSize * 0.3, winSize * 0.18);
            gfx.endFill();

            this.animatedContainer.addChild(gfx);
            this.windowGlows.push({ gfx, phaseOffset: i * Math.PI });
        }

        // v0.32.2: Side window glow — bez halo (wystawała poza wall), tylko inner glass
        const sideWinSize = 14;
        const sideWinX = x + w + 16;
        const sideWinY = wallY + 32;
        const sSkewY = -sideWinSize * 0.5625;
        const sSkewX = 0;

        const sideGfx = new PIXI.Graphics();
        // Inner warm glass (z iso skew polygon - bez halo)
        sideGfx.beginFill(COLORS.windowGlow, 0.92);
        sideGfx.drawPolygon([
            sideWinX + 2, sideWinY + 2,
            sideWinX + sideWinSize + sSkewX - 2, sideWinY + sSkewY + 2,
            sideWinX + sideWinSize + sSkewX - 2, sideWinY + sideWinSize + sSkewY - 2,
            sideWinX + 2, sideWinY + sideWinSize - 2,
        ]);
        sideGfx.endFill();
        this.animatedContainer.addChild(sideGfx);
        this.windowGlows.push({ gfx: sideGfx, phaseOffset: Math.PI / 2 });

        // ── 2. WEATHER VANE (rotation pivot) ──
        // v0.32.1: mast krótszy (10 vs 18) + grubszy (3.5 vs 2.5) — kogut bliżej cupoli
        const cupolaH = 22 + 4;
        const mastTopY = ridgeApexY - cupolaH - 10;

        const mastG = new PIXI.Graphics();
        mastG.lineStyle(3.5, COLORS.weatherVane, 1.0);
        mastG.moveTo(ridgeApexX, ridgeApexY - cupolaH);
        mastG.lineTo(ridgeApexX, mastTopY);
        mastG.lineStyle(0);
        this.animatedContainer.addChild(mastG);

        // Vane gfx (rotation)
        this.vaneGfx = new PIXI.Container();
        const vaneG = new PIXI.Graphics();
        // Arrow line
        vaneG.lineStyle(2.5, COLORS.weatherVane, 1.0);
        vaneG.moveTo(-10, 0);
        vaneG.lineTo(10, 0);
        vaneG.lineStyle(0);
        // Arrow head (E)
        vaneG.beginFill(COLORS.weatherVane, 1.0);
        vaneG.moveTo(10, 0);
        vaneG.lineTo(14, 3);
        vaneG.lineTo(14, -3);
        vaneG.closePath();
        vaneG.endFill();
        // Tail (W)
        vaneG.beginFill(COLORS.weatherVane, 1.0);
        vaneG.moveTo(-10, 0);
        vaneG.lineTo(-13, 2);
        vaneG.lineTo(-13, -2);
        vaneG.closePath();
        vaneG.endFill();
        // Rooster (golden silhouette na arrow head)
        vaneG.beginFill(COLORS.weatherVaneGold, 1.0);
        // Body
        vaneG.drawEllipse(0, -7, 4, 3);
        // Tail feathers
        vaneG.moveTo(-4, -7);
        vaneG.lineTo(-8, -10);
        vaneG.lineTo(-4, -4);
        vaneG.closePath();
        // Head
        vaneG.drawCircle(3, -10, 2);
        vaneG.endFill();
        // Beak
        vaneG.beginFill(COLORS.weatherVaneGold, 1.0);
        vaneG.moveTo(5, -10);
        vaneG.lineTo(7, -9.5);
        vaneG.lineTo(5, -9);
        vaneG.closePath();
        vaneG.endFill();
        // Comb (red)
        vaneG.beginFill(0xc02020, 1.0);
        vaneG.drawCircle(3, -12, 1.1);
        vaneG.endFill();

        this.vaneGfx.addChild(vaneG);
        this.vaneGfx.position.set(ridgeApexX, mastTopY);
        this.animatedContainer.addChild(this.vaneGfx);

        // ── 3. ROPE (lina z pulley, anchor stored w static) ──
        this.ropeGfx = new PIXI.Graphics();
        this.ropeGfx.position.set(this.ropeAnchorX, this.ropeAnchorY);
        this.animatedContainer.addChild(this.ropeGfx);

        // ── 4. HAY BALE v0.32.3 — 50% większy + PRZED budynkiem na ground (Mariusz feedback) ──
        this.hayGfx = new PIXI.Container();
        const hayG = new PIXI.Graphics();
        const BALE_W = 42;  // +50% z 28
        const BALE_H = 27;  // +50% z 18

        // v0.32.4: drop shadow lżejszy + ground contact line (Mariusz: nie lewituje)
        hayG.beginFill(0x000000, 0.25);
        hayG.drawEllipse(3, BALE_H / 2 + 3, BALE_W * 0.50, 4);
        hayG.endFill();
        // Ground contact line (subtle line gdzie bala styka się z ziemią)
        hayG.lineStyle(2, 0x3a2a10, 0.55);
        hayG.moveTo(-BALE_W / 2 + 3, BALE_H / 2 + 1);
        hayG.lineTo(BALE_W / 2 - 3, BALE_H / 2 + 1);
        hayG.lineStyle(0);

        // Dark base (rounded rectangle - typowy square bale shape)
        hayG.beginFill(COLORS.hayDark, 1.0);
        hayG.drawRoundedRect(-BALE_W / 2, -BALE_H / 2, BALE_W, BALE_H, 3);
        hayG.endFill();

        // Main body (lighter, inset)
        hayG.beginFill(COLORS.hayMain, 1.0);
        hayG.drawRoundedRect(-BALE_W / 2 + 1, -BALE_H / 2 + 1, BALE_W - 2, BALE_H - 3, 2);
        hayG.endFill();

        // Top highlight (sunlit upper edge - 4px strip)
        hayG.beginFill(COLORS.hayLight, 0.85);
        hayG.drawRoundedRect(-BALE_W / 2 + 1, -BALE_H / 2 + 1, BALE_W - 2, 5, 2);
        hayG.endFill();

        // Binding ropes (2 horizontal lines - kluczowy detail!)
        hayG.lineStyle(2, COLORS.hayDark, 0.95);
        hayG.moveTo(-BALE_W / 2 + 1, -BALE_H / 5);
        hayG.lineTo(BALE_W / 2 - 1, -BALE_H / 5);
        hayG.moveTo(-BALE_W / 2 + 1, BALE_H / 5);
        hayG.lineTo(BALE_W / 2 - 1, BALE_H / 5);
        hayG.lineStyle(0);

        // Rope shadow (under each rope)
        hayG.lineStyle(0.8, 0x000000, 0.4);
        hayG.moveTo(-BALE_W / 2 + 1, -BALE_H / 5 + 1.5);
        hayG.lineTo(BALE_W / 2 - 1, -BALE_H / 5 + 1.5);
        hayG.moveTo(-BALE_W / 2 + 1, BALE_H / 5 + 1.5);
        hayG.lineTo(BALE_W / 2 - 1, BALE_H / 5 + 1.5);
        hayG.lineStyle(0);

        // Strand texture (więcej dla większej beli)
        hayG.lineStyle(0.7, COLORS.hayDark, 0.75);
        for (let i = 0; i < 24; i++) {
            const sx = -BALE_W / 2 + 3 + rng() * (BALE_W - 6);
            const sy = -BALE_H / 2 + 3 + rng() * (BALE_H - 6);
            const angle = rng() * Math.PI;
            const len = 1.5 + rng() * 2.5;
            hayG.moveTo(sx, sy);
            hayG.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
        }
        hayG.lineStyle(0);

        // Outline
        hayG.lineStyle(1.2, COLORS.hayDark, 0.85);
        hayG.drawRoundedRect(-BALE_W / 2, -BALE_H / 2, BALE_W, BALE_H, 3);
        hayG.lineStyle(0);

        this.hayGfx.addChild(hayG);
        this.hayGfx.position.set(x + 45, y + h + 15);  // v0.32.4: NIŻEJ w trawie (Mariusz feedback - "siano lewituje")
        this.animatedContainer.addChild(this.hayGfx);
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — Subtle Life animations (vane, glows, hay, rope)
    // ═══════════════════════════════════════════════════════════
    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        this.time += 1 / 60;

        // v0.32.1: 2x amplitudy dla widoczności animacji (Mariusz feedback)
        // 1. Weather vane oscillation (±0.8 rad = ~46° max)
        this.vaneGfx.rotation = Math.sin(this.time * 0.5) * 0.8 + Math.sin(this.time * 0.18) * 0.3;

        // 2. Window glow pulse (0.56-1.00 alpha = wyraźne breathing)
        for (const w of this.windowGlows) {
            w.gfx.alpha = 0.78 + Math.sin(this.time * 2.2 + w.phaseOffset) * 0.22;
        }

        // 3. Hay bale squash + sway (2x wzmocnione)
        this.hayGfx.skew.x = Math.sin(this.time * 1.4) * 0.07;
        this.hayGfx.scale.y = 1.0 + Math.sin(this.time * 2.8) * 0.06;

        // 4. ROPE SWAY (lina kołysze się dramatycznie z wiatrem)
        const ropeSway = Math.sin(this.time * 1.0) * 0.35;
        const ropeLen = 24;
        this.ropeGfx.clear();
        // Rope itself
        this.ropeGfx.lineStyle(2, COLORS.rope, 1.0);
        this.ropeGfx.moveTo(0, 0);
        // Bezier curve dla natural rope physics
        const endX = Math.sin(ropeSway) * ropeLen * 0.4;
        const endY = ropeLen;
        const ctrl1X = endX * 0.25;
        const ctrl1Y = ropeLen * 0.45;
        const ctrl2X = endX * 0.75;
        const ctrl2Y = ropeLen * 0.80;
        this.ropeGfx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY);
        this.ropeGfx.lineStyle(0);
        // Hook na końcu (J-shape)
        this.ropeGfx.lineStyle(2, COLORS.ironHardware, 1.0);
        this.ropeGfx.moveTo(endX, endY);
        this.ropeGfx.lineTo(endX + 2, endY + 4);
        this.ropeGfx.lineTo(endX - 2, endY + 5);
        this.ropeGfx.lineTo(endX, endY + 3);
        this.ropeGfx.lineStyle(0);
        // Hook highlight
        this.ropeGfx.beginFill(COLORS.ironHighlight, 1.0);
        this.ropeGfx.drawCircle(endX + 1, endY + 4, 0.8);
        this.ropeGfx.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // SILO v0.32.4 — 2.5D thicker, na wysokości okna, lepsze oświetlenie
    // ═══════════════════════════════════════════════════════════
    private static horizontalGradientCache: Map<string, PIXI.Texture> = new Map();

    private getHorizontalGradientTexture(width: number): PIXI.Texture {
        const key = `silo-h-${width}`;
        const cached = BarnBuilding.horizontalGradientCache.get(key);
        if (cached) return cached;

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.ceil(width));
        canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const grd = ctx.createLinearGradient(0, 0, width, 0);
        // 5-stop smooth gradient: dark left → mid → light right (N-W sun)
        grd.addColorStop(0, '#363c41');
        grd.addColorStop(0.18, '#6a7177');
        grd.addColorStop(0.55, '#9ea7ad');
        grd.addColorStop(0.85, '#c4cad0');
        grd.addColorStop(1.0, '#c4cad0');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, 1);

        const tex = PIXI.Texture.from(canvas);
        BarnBuilding.horizontalGradientCache.set(key, tex);
        return tex;
    }

    private drawSilo(siloCx: number, siloRadius: number, siloTop: number): void {
        const y = this.y, h = this.h;

        // v0.32.8: refactor — silos pozycja + rozmiar jako parametry (3 silosy total)
        const siloBot = y + h - 5;
        const domeH = Math.round(siloRadius * 0.69);  // proporcjonalnie do radius (~22 dla r=32, ~15 dla r=22)

        const g = new PIXI.Graphics();

        // === Drop shadow (2.5D ground contact) ===
        g.beginFill(0x000000, 0.35);
        g.drawEllipse(siloCx + 6, siloBot + 3, siloRadius + 8, 6);
        g.endFill();
        g.beginFill(0x000000, 0.18);
        g.drawEllipse(siloCx + 4, siloBot + 7, siloRadius + 16, 5);
        g.endFill();

        // === Body (cylindrical 2.5D) ===
        const bodyTop = siloTop + domeH;
        const bodyBot = siloBot - 3;

        // Horizontal gradient texture (left dark → right light)
        const gradTex = this.getHorizontalGradientTexture(siloRadius * 2);
        const gradMatrix = new PIXI.Matrix();
        gradMatrix.translate(siloCx - siloRadius, 0);
        g.beginTextureFill({ texture: gradTex, matrix: gradMatrix });
        g.drawRect(siloCx - siloRadius, bodyTop, siloRadius * 2, bodyBot - bodyTop);
        g.endFill();

        // === Top edge curved (2.5D top of cylinder seen from slight angle) ===
        // Dark top edge (shadow side of top ellipse - back of cylinder visible)
        g.beginFill(COLORS.siloDarkOutline, 0.9);
        g.drawEllipse(siloCx, bodyTop, siloRadius, 5);
        g.endFill();
        // Light front edge of top
        g.lineStyle(2, COLORS.siloLight, 0.85);
        g.moveTo(siloCx - siloRadius + 4, bodyTop + 3);
        g.bezierCurveTo(
            siloCx - siloRadius / 2, bodyTop + 5,
            siloCx + siloRadius / 2, bodyTop + 5,
            siloCx + siloRadius - 4, bodyTop + 3
        );
        g.lineStyle(0);

        // === Bottom edge curved (2.5D bottom of cylinder) ===
        g.beginFill(COLORS.siloDarkOutline, 1.0);
        g.drawEllipse(siloCx, bodyBot, siloRadius, 6);
        g.endFill();

        // === Specular highlight strip on right side (mocniejszy sun-side highlight) ===
        g.beginFill(0xffffff, 0.22);
        g.drawRect(siloCx + siloRadius - 4, bodyTop + 6, 2, bodyBot - bodyTop - 12);
        g.endFill();

        // === Inner shadow strip on left (deep shadow) ===
        g.beginFill(0x000000, 0.30);
        g.drawRect(siloCx - siloRadius, bodyTop + 4, 5, bodyBot - bodyTop - 8);
        g.endFill();

        // === Vertical ribs (corrugated panels - 5 ribs) ===
        g.lineStyle(1.3, COLORS.siloRib, 0.45);
        for (let i = 1; i < 6; i++) {
            const rx = siloCx - siloRadius + (siloRadius * 2 * i) / 6;
            g.moveTo(rx, bodyTop + 4);
            g.lineTo(rx, bodyBot - 4);
        }
        g.lineStyle(0);

        // === Horizontal steel rings (3 z layered shading) ===
        const ringYs = [bodyTop + 16, bodyTop + (bodyBot - bodyTop) * 0.5, bodyTop + (bodyBot - bodyTop) * 0.82];
        for (const ry of ringYs) {
            // Shadow below ring
            g.lineStyle(3, COLORS.siloDarkOutline, 0.9);
            g.moveTo(siloCx - siloRadius, ry + 1);
            g.lineTo(siloCx + siloRadius, ry + 1);
            g.lineStyle(0);
            // Main ring
            g.lineStyle(2, COLORS.siloRib, 1.0);
            g.moveTo(siloCx - siloRadius, ry);
            g.lineTo(siloCx + siloRadius, ry);
            g.lineStyle(0);
            // Sunlit top edge
            g.lineStyle(1.2, COLORS.siloLight, 0.75);
            g.moveTo(siloCx - siloRadius + 6, ry - 1.5);
            g.lineTo(siloCx + siloRadius - 4, ry - 1.5);
            g.lineStyle(0);
        }

        // === Body side outlines (chunky brawl-stars) ===
        g.lineStyle(2, COLORS.siloDarkOutline, 1.0);
        g.moveTo(siloCx - siloRadius, bodyTop);
        g.lineTo(siloCx - siloRadius, bodyBot);
        g.moveTo(siloCx + siloRadius, bodyTop);
        g.lineTo(siloCx + siloRadius, bodyBot);
        g.lineStyle(0);

        // === Dome (półsfera 2.5D via bezier) ===
        // Left half (shadow side)
        g.beginFill(COLORS.siloDomeDark, 1.0);
        g.moveTo(siloCx - siloRadius - 2, bodyTop);
        g.bezierCurveTo(
            siloCx - siloRadius - 2, siloTop + 4,
            siloCx - 4, siloTop - 4,
            siloCx, siloTop - 2
        );
        g.lineTo(siloCx, bodyTop);
        g.closePath();
        g.endFill();

        // Right half (sun side)
        g.beginFill(COLORS.siloDome, 1.0);
        g.moveTo(siloCx, siloTop - 2);
        g.bezierCurveTo(
            siloCx + 4, siloTop - 4,
            siloCx + siloRadius + 2, siloTop + 4,
            siloCx + siloRadius + 2, bodyTop
        );
        g.lineTo(siloCx, bodyTop);
        g.closePath();
        g.endFill();

        // Dome apex highlight (sunlit upper-right peak)
        g.lineStyle(3, COLORS.siloDomeLight, 0.95);
        g.moveTo(siloCx + 1, siloTop + 2);
        g.bezierCurveTo(
            siloCx + 4, siloTop - 3,
            siloCx + siloRadius * 0.5, siloTop + 1,
            siloCx + siloRadius * 0.7, siloTop + 8
        );
        g.lineStyle(0);

        // Dome bottom rim (curved separator z body)
        g.lineStyle(2, COLORS.siloDarkOutline, 1.0);
        g.moveTo(siloCx - siloRadius - 2, bodyTop);
        g.bezierCurveTo(
            siloCx - siloRadius - 2, bodyTop + 4,
            siloCx + siloRadius + 2, bodyTop + 4,
            siloCx + siloRadius + 2, bodyTop
        );
        g.lineStyle(0);

        // Dome outline (left + right)
        g.lineStyle(2.5, COLORS.siloDarkOutline, 1.0);
        g.moveTo(siloCx - siloRadius - 2, bodyTop);
        g.bezierCurveTo(
            siloCx - siloRadius - 2, siloTop + 4,
            siloCx - 4, siloTop - 4,
            siloCx, siloTop - 2
        );
        g.bezierCurveTo(
            siloCx + 4, siloTop - 4,
            siloCx + siloRadius + 2, siloTop + 4,
            siloCx + siloRadius + 2, bodyTop
        );
        g.lineStyle(0);

        // === Top vent (proporcjonalne do radius) ===
        const ventW = Math.max(4, Math.round(siloRadius * 0.19));
        const ventH = Math.max(3, Math.round(siloRadius * 0.16));
        const ventX = siloCx - ventW / 2;
        const ventY = siloTop - ventH;
        g.beginFill(COLORS.siloRib, 1.0);
        g.drawRect(ventX, ventY, ventW, ventH);
        g.endFill();
        g.beginFill(COLORS.siloLight, 0.7);
        g.drawRect(ventX, ventY, ventW, ventH * 0.3);
        g.endFill();
        g.lineStyle(1, 0x000000, 0.9);
        g.drawRect(ventX, ventY, ventW, ventH);
        g.lineStyle(0);

        // === Side ladder ===
        const ladderX = siloCx + siloRadius - 8;
        g.lineStyle(1.5, COLORS.siloLadder, 1.0);
        g.moveTo(ladderX, bodyTop + 8);
        g.lineTo(ladderX, bodyBot - 4);
        g.moveTo(ladderX + 6, bodyTop + 8);
        g.lineTo(ladderX + 6, bodyBot - 4);
        for (let ly = bodyTop + 12; ly < bodyBot - 4; ly += 11) {
            g.moveTo(ladderX, ly);
            g.lineTo(ladderX + 6, ly);
        }
        g.lineStyle(0);

        // === Base ring ===
        g.beginFill(COLORS.siloDarkOutline, 1.0);
        g.drawRect(siloCx - siloRadius - 3, bodyBot - 2, siloRadius * 2 + 6, 8);
        g.endFill();
        g.lineStyle(1, COLORS.siloLight, 0.7);
        g.moveTo(siloCx - siloRadius - 3, bodyBot - 1);
        g.lineTo(siloCx + siloRadius + 3, bodyBot - 1);
        g.lineStyle(0);
        g.lineStyle(1, 0x000000, 0.85);
        g.drawRect(siloCx - siloRadius - 3, bodyBot - 2, siloRadius * 2 + 6, 8);
        g.lineStyle(0);

        this.siloContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // EXTRA COLLIDABLES v0.32.8 — Mariusz: "dom z silosami musi mieć granicę kolizji"
    // ═══════════════════════════════════════════════════════════
    public getExtraCollidables(): ICollidable[] {
        // Side wall sticking-out (32px na prawo od barn front, tank wjeżdżał tam = image 1)
        // Silosy są wewnątrz barn x range — pokryte przez barn hitbox
        const sideWallExtra: ICollidable = {
            x: this.x + this.w,
            y: this.y + this.h * 0.45,
            w: 32,
            h: this.h * 0.55,
            update: () => {}
        };
        return [sideWallExtra];
    }
}

function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}