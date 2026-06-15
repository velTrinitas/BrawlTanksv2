import * as PIXI from 'pixi.js';
import type { IFarmField } from './IFarmField';

/**
 * v0.36.0 FAZA T7.1 — LETTUCE FIELD (pole sałaty / warzyw liściastych)
 *
 * Plowed field z widocznymi rzędami (rabatki) i gęsto zasadzonymi sałatami.
 *
 * KLUCZOWE CECHY (vs CornField/SugarcaneField):
 *   1. Brak stealth (low growth, player tank widoczny)
 *   2. Brak kolizji (player przejeżdża)
 *   3. PER-SPRITE CRUSH STATE — gdy player AABB hit sprite → sprite zmienia się
 *      na "splat" (płaska brązowa plama z resztkami zielonego)
 *   4. PERMANENT crushed state dla session (no regrowth) — Mariusz spec
 *   5. Brown plowed soil bardziej widoczna niż w corn (rzędy dominują visual)
 *   6. Sałata = low rosette shape (NIE tall stalk)
 *
 * Mechanika gameplay:
 *   - Visual decoration tylko (no stealth, no collision)
 *   - Trail damage permanent (player widzi swoja trase przez pole)
 */

const COLORS = {
    // Gleba (bardziej brązowa, plowed look)
    soilDark:       0x3a2410,
    soilMid:        0x5a3820,
    soilLight:      0x7a5430,
    soilHighlight:  0x9a7048,
    soilRowShadow:  0x2a1808,    // very dark między rzędami
    // Sałata (lettuce leaves — saturated green)
    lettuceDark:    0x2e5a18,
    lettuceMid:     0x5a9028,    // dominant green
    lettuceLight:   0x88c050,    // jasny highlight
    lettuceVein:    0x3a6818,    // żyłki na liściu
    lettuceWhite:   0xe8f4c0,    // środek (jasniejszy core)
    // Crushed splat (rozjechana sałata)
    splatBrown:     0x4a3820,    // wzgnieciony grunt
    splatGreen:     0x4a6828,    // resztki zielone
    splatDark:      0x2a1810,    // outline splat
    // Particles (sok zielony przy rozjechaniu — TODO future)
} as const;

interface LettuceSprite {
    sprite: PIXI.Sprite;
    baseX: number;
    baseY: number;
    crushed: boolean;
    crushedSprite?: PIXI.Sprite;  // splat sprite (visible po crush)
    phaseOffset: number;          // dla subtle sway
    baseSwayAmp: number;
}

function makeRng(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

export class LettuceField implements IFarmField {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private static lettuceTextures: PIXI.Texture[] = [];
    private static splatTexture: PIXI.Texture | null = null;
    private groundContainer: PIXI.Container;
    private plants: LettuceSprite[] = [];
    private time: number = 0;
    private worldContainer: PIXI.Container;

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

        // Generate textures once
        if (LettuceField.lettuceTextures.length === 0) {
            LettuceField.lettuceTextures = generateLettuceTextures();
            LettuceField.splatTexture = generateSplatTexture();
        }

        this.groundContainer = new PIXI.Container();
        this.groundContainer.zIndex = -80;
        worldContainer.addChild(this.groundContainer);
        this.drawPlowedGround(rng);

        this.spawnLettuces(rng, worldContainer);
    }

    // ═══════════════════════════════════════════════════════════
    // PLOWED GROUND — wyraźne rzędy rabatek
    // ═══════════════════════════════════════════════════════════
    private drawPlowedGround(rng: () => number): void {
        const g = new PIXI.Graphics();
        const RADIUS = 18;

        // Drop shadow
        g.beginFill(0x000000, 0.12);
        g.drawRoundedRect(this.x + 6, this.y + 8, this.w, this.h, RADIUS);
        g.endFill();

        // Główna brązowa gleba
        g.beginFill(COLORS.soilMid, 0.85);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);
        g.endFill();

        // Soil mid texture variations
        g.beginFill(COLORS.soilLight, 0.35);
        for (let i = 0; i < 80; i++) {
            const rx = this.x + rng() * this.w;
            const ry = this.y + rng() * this.h;
            g.drawCircle(rx, ry, 0.8 + rng() * 1.8);
        }
        g.endFill();

        // Tiny darker grudki
        g.beginFill(COLORS.soilDark, 0.45);
        for (let i = 0; i < 40; i++) {
            const rx = this.x + rng() * this.w;
            const ry = this.y + rng() * this.h;
            g.drawCircle(rx, ry, 0.6 + rng() * 1.2);
        }
        g.endFill();

        // ── RZĘDY (rabatki) — dominujący visual element ──
        // Każdy rząd: ciemna linia zaorana (głęboka) + jasny grzbiet (sunlit)
        const ROW_SPACING = 22;
        const inset = 16;

        for (let yLine = this.y + 18; yLine < this.y + this.h - 8; yLine += ROW_SPACING) {
            // Wide brown shadow strip (rabatka między rzędami)
            g.beginFill(COLORS.soilRowShadow, 0.55);
            g.drawRect(this.x + inset, yLine - 1.5, this.w - inset * 2, 3);
            g.endFill();

            // Sunlit ridge (above shadow)
            g.lineStyle(1.2, COLORS.soilHighlight, 0.65);
            g.moveTo(this.x + inset, yLine - 2.5);
            g.lineTo(this.x + this.w - inset, yLine - 2.5);
            g.lineStyle(0);

            // Deep crack
            g.lineStyle(0.7, COLORS.soilDark, 0.85);
            g.moveTo(this.x + inset, yLine);
            g.lineTo(this.x + this.w - inset, yLine);
            g.lineStyle(0);
        }

        // Outline
        g.lineStyle(2, 0x4a2818, 0.55);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);

        this.groundContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // LETTUCES — gęste rzędy, na linii rzędu
    // ═══════════════════════════════════════════════════════════
    private spawnLettuces(rng: () => number, worldContainer: PIXI.Container): void {
        const ROW_SPACING = 22;     // matching ridge spacing
        const PLANT_SPACING = 14;   // gęsto w rzędzie
        const inset = 18;

        // Liczba sałat per rząd
        const rowCount = Math.floor((this.h - 24) / ROW_SPACING);
        const colCount = Math.floor((this.w - inset * 2) / PLANT_SPACING);

        for (let row = 0; row < rowCount; row++) {
            const rowY = this.y + 24 + row * ROW_SPACING;
            for (let col = 0; col < colCount; col++) {
                const baseColX = this.x + inset + col * PLANT_SPACING + PLANT_SPACING / 2;
                // Jitter w obrębie rzędu (max ±2px Y zeby zostac na grzbiecie)
                const jitterX = (rng() - 0.5) * 4;
                const jitterY = (rng() - 0.5) * 3;
                const px = baseColX + jitterX;
                const py = rowY + jitterY;

                const variant = Math.floor(rng() * LettuceField.lettuceTextures.length);
                const sprite = new PIXI.Sprite(LettuceField.lettuceTextures[variant]);
                sprite.anchor.set(0.5, 0.6);  // anchor near bottom-center (rosette base)
                sprite.x = px;
                sprite.y = py;
                sprite.zIndex = Math.floor(py);
                const scale = 0.88 + rng() * 0.22;
                sprite.scale.set(scale);
                worldContainer.addChild(sprite);

                this.plants.push({
                    sprite,
                    baseX: px, baseY: py,
                    crushed: false,
                    phaseOffset: rng() * Math.PI * 2,
                    baseSwayAmp: 0.02 + rng() * 0.025,
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — subtle wind sway (tylko non-crushed)
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;

        for (const p of this.plants) {
            if (p.crushed) continue;
            // Bardzo subtle sway (sałata jest low growth)
            const wave = Math.sin(this.time * 1.8 + p.phaseOffset) * p.baseSwayAmp;
            p.sprite.skew.x = wave;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STEALTH — NIE oferuje (low growth)
    // ═══════════════════════════════════════════════════════════
    public isPointInside(_px: number, _py: number): boolean {
        return false;  // sałata NIE daje stealth
    }

    // ═══════════════════════════════════════════════════════════
    // TANK INTERACTION — CRUSH detection
    // Player AABB (40x40 centered at tankX/Y) hits sprite → crush
    // ═══════════════════════════════════════════════════════════
    public onTankEnter(tankX: number, tankY: number): void {
        // Quick reject — czołg poza polem
        const MARGIN = 30;
        if (tankX < this.x - MARGIN || tankX > this.x + this.w + MARGIN
            || tankY < this.y - MARGIN || tankY > this.y + this.h + MARGIN) {
            return;
        }

        // Tank AABB (center ±20)
        const TANK_HALF = 22;  // mały excess dla generosity
        const taLeft = tankX - TANK_HALF;
        const taRight = tankX + TANK_HALF;
        const taTop = tankY - TANK_HALF;
        const taBot = tankY + TANK_HALF;

        for (const p of this.plants) {
            if (p.crushed) continue;
            // AABB hit check
            if (p.baseX >= taLeft && p.baseX <= taRight
                && p.baseY >= taTop && p.baseY <= taBot) {
                this.crushPlant(p);
            }
        }
    }

    private crushPlant(p: LettuceSprite): void {
        p.crushed = true;
        // Hide original sprite
        p.sprite.visible = false;

        // Spawn splat sprite at same position
        if (!LettuceField.splatTexture) return;
        const splat = new PIXI.Sprite(LettuceField.splatTexture);
        splat.anchor.set(0.5, 0.5);
        splat.x = p.baseX;
        splat.y = p.baseY + 2;  // lekko niżej (płaska plama na ziemi)
        splat.zIndex = Math.floor(p.baseY) - 1;  // pod tankami
        splat.rotation = (Math.random() - 0.5) * Math.PI * 2;  // random rotation dla variety
        splat.scale.set(0.85 + Math.random() * 0.3);
        this.worldContainer.addChild(splat);
        p.crushedSprite = splat;
    }
}

// ───────────────────────────────────────────────────────────────
// LETTUCE TEXTURE GENERATION — 3 warianty rosette
// ───────────────────────────────────────────────────────────────

function generateLettuceTextures(): PIXI.Texture[] {
    const textures: PIXI.Texture[] = [];

    // v0.36.1: 3-layer rosette dla głębi (outer + mid + inner) — Mariusz: "bardziej z głębią"
    const variants = [
        { radius: 10,   outerLeaves: 12, midLeaves: 8, innerLeaves: 5, scale: 1.0  },
        { radius: 11.5, outerLeaves: 14, midLeaves: 9, innerLeaves: 6, scale: 1.05 },
        { radius: 8.5,  outerLeaves: 10, midLeaves: 7, innerLeaves: 5, scale: 0.95 },
    ];

    for (const v of variants) {
        const W = 36;
        const H = 36;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const c = cv.getContext('2d')!;
        const cx = W / 2;
        const cy = H / 2;

        // ─── 1. DROP SHADOW (większy + soft fade — głębia "unoszenia") ───
        // Outer wide haze
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.beginPath();
        c.ellipse(cx + 1.5, cy + v.radius * 0.85, v.radius * 1.4, v.radius * 0.55, 0, 0, Math.PI * 2);
        c.fill();
        // Inner darker shadow (bliżej ground)
        c.fillStyle = 'rgba(0,0,0,0.42)';
        c.beginPath();
        c.ellipse(cx + 1, cy + v.radius * 0.7, v.radius * 1.05, v.radius * 0.38, 0, 0, Math.PI * 2);
        c.fill();

        // ─── 2. OUTER DARK BASE (deep shadow rosette form) ───
        c.fillStyle = '#' + COLORS.lettuceDark.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx, cy, v.radius * 1.15, v.radius * 0.92, 0, 0, Math.PI * 2);
        c.fill();

        // ─── 3. MID GREEN BASE (intermediate shadow) ───
        c.fillStyle = '#' + COLORS.lettuceMid.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx, cy, v.radius * 1.0, v.radius * 0.80, 0, 0, Math.PI * 2);
        c.fill();

        // ─── 4. OUTER LEAVES (najszersza warstwa, dark shadow side dla głębi) ───
        for (let i = 0; i < v.outerLeaves; i++) {
            const angle = (i / v.outerLeaves) * Math.PI * 2;
            const leafCx = cx + Math.cos(angle) * v.radius * 0.75;
            const leafCy = cy + Math.sin(angle) * v.radius * 0.60;
            const leafR = v.radius * 0.48;

            // Cast shadow side (na liściu poniżej)
            c.fillStyle = '#' + COLORS.lettuceVein.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(leafCx + Math.cos(angle) * 0.4, leafCy + Math.sin(angle) * 0.4 + 0.5,
                     leafR * 1.05, leafR * 0.78, angle, 0, Math.PI * 2);
            c.fill();

            // Mid green body
            c.fillStyle = '#' + COLORS.lettuceMid.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(leafCx, leafCy, leafR, leafR * 0.72, angle, 0, Math.PI * 2);
            c.fill();

            // Sunlit edge (NW)
            const hiX = leafCx - Math.cos(angle + 0.4) * leafR * 0.45;
            const hiY = leafCy - Math.sin(angle + 0.4) * leafR * 0.45;
            c.fillStyle = '#' + COLORS.lettuceLight.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(hiX, hiY, leafR * 0.58, leafR * 0.36, angle, 0, Math.PI * 2);
            c.fill();

            // Vein (od środka do brzegu)
            c.strokeStyle = '#' + COLORS.lettuceVein.toString(16).padStart(6, '0');
            c.lineWidth = 0.8;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(cx + Math.cos(angle) * 1.5, cy + Math.sin(angle) * 1.2);
            c.lineTo(cx + Math.cos(angle) * v.radius * 0.95, cy + Math.sin(angle) * v.radius * 0.78);
            c.stroke();
        }

        // ─── 5. MID LEAVES (środkowa warstwa, rotated half-step dla "kaczkowania") ───
        const midOffset = Math.PI / v.outerLeaves;  // offset by half-angle
        for (let i = 0; i < v.midLeaves; i++) {
            const angle = (i / v.midLeaves) * Math.PI * 2 + midOffset;
            const leafCx = cx + Math.cos(angle) * v.radius * 0.50;
            const leafCy = cy + Math.sin(angle) * v.radius * 0.40;
            const leafR = v.radius * 0.36;

            // Shadow side
            c.fillStyle = '#' + COLORS.lettuceVein.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(leafCx + Math.cos(angle) * 0.3, leafCy + Math.sin(angle) * 0.3 + 0.4,
                     leafR * 1.05, leafR * 0.78, angle, 0, Math.PI * 2);
            c.fill();

            // Body (lighter green dla mid ring)
            c.fillStyle = '#' + COLORS.lettuceMid.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(leafCx, leafCy, leafR, leafR * 0.72, angle, 0, Math.PI * 2);
            c.fill();

            // Highlight
            const hiX = leafCx - Math.cos(angle + 0.4) * leafR * 0.4;
            const hiY = leafCy - Math.sin(angle + 0.4) * leafR * 0.4;
            c.fillStyle = '#' + COLORS.lettuceLight.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(hiX, hiY, leafR * 0.62, leafR * 0.38, angle, 0, Math.PI * 2);
            c.fill();
        }

        // ─── 6. INNER LEAVES (środek rosette, najjaśniejsza warstwa) ───
        for (let i = 0; i < v.innerLeaves; i++) {
            const angle = (i / v.innerLeaves) * Math.PI * 2 + Math.PI / v.innerLeaves;
            const leafCx = cx + Math.cos(angle) * v.radius * 0.25;
            const leafCy = cy + Math.sin(angle) * v.radius * 0.20;
            const leafR = v.radius * 0.26;

            // Mid shadow
            c.fillStyle = '#' + COLORS.lettuceMid.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(leafCx, leafCy + 0.3, leafR * 1.1, leafR * 0.78, angle, 0, Math.PI * 2);
            c.fill();

            // Light body
            c.fillStyle = '#' + COLORS.lettuceLight.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(leafCx, leafCy, leafR, leafR * 0.72, angle, 0, Math.PI * 2);
            c.fill();
        }

        // ─── 7. CENTER CORE (bright dome z catchlight) ───
        // Mid green base
        c.fillStyle = '#' + COLORS.lettuceLight.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx, cy, v.radius * 0.30, v.radius * 0.24, 0, 0, Math.PI * 2);
        c.fill();

        // Bright white center
        c.fillStyle = '#' + COLORS.lettuceWhite.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx - 0.5, cy - 0.5, v.radius * 0.17, v.radius * 0.13, 0, 0, Math.PI * 2);
        c.fill();

        // Tiny specular catchlight (najbright punkt)
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.beginPath();
        c.ellipse(cx - 1.2, cy - 1.0, v.radius * 0.08, v.radius * 0.05, 0, 0, Math.PI * 2);
        c.fill();

        // ─── 8. SUBTLE OUTLINE (chunky cartoon-style dla edge definition) ───
        c.strokeStyle = '#' + COLORS.lettuceDark.toString(16).padStart(6, '0');
        c.lineWidth = 1.4;
        c.beginPath();
        c.ellipse(cx, cy, v.radius * 1.12, v.radius * 0.88, 0, 0, Math.PI * 2);
        c.stroke();

        if (v.scale !== 1.0) {
            const sCv = document.createElement('canvas');
            sCv.width = Math.ceil(W * v.scale);
            sCv.height = Math.ceil(H * v.scale);
            const sC = sCv.getContext('2d')!;
            sC.imageSmoothingEnabled = false;
            sC.drawImage(cv, 0, 0, sCv.width, sCv.height);
            textures.push(PIXI.Texture.from(sCv));
        } else {
            textures.push(PIXI.Texture.from(cv));
        }
    }

    return textures;
}

// ───────────────────────────────────────────────────────────────
// SPLAT TEXTURE — rozjechana sałata (płaska brązowo-zielona plama)
// ───────────────────────────────────────────────────────────────

function generateSplatTexture(): PIXI.Texture {
    const W = 32;
    const H = 24;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d')!;
    const cx = W / 2;
    const cy = H / 2;

    // ── Outer ragged brown stain ──
    c.fillStyle = '#' + COLORS.splatBrown.toString(16).padStart(6, '0');
    c.beginPath();
    // Irregular ellipse z 8 random vertices dla "splat" look
    const points: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = 9 + Math.random() * 4;
        points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.65]);
    }
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        c.lineTo(points[i][0], points[i][1]);
    }
    c.closePath();
    c.fill();

    // ── Inner dark contour (głębsze "splat") ──
    c.fillStyle = '#' + COLORS.splatDark.toString(16).padStart(6, '0');
    c.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const r = 5 + Math.random() * 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.55;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();

    // ── Green resztki (splat-out leaf fragments) ──
    c.fillStyle = '#' + COLORS.splatGreen.toString(16).padStart(6, '0');
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 5;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.6;
        c.beginPath();
        c.ellipse(px, py, 1.2 + Math.random() * 1.4, 0.7 + Math.random() * 0.8, Math.random() * Math.PI, 0, Math.PI * 2);
        c.fill();
    }

    // ── Tiny brighter green dabs (resztki sałaty) ──
    c.fillStyle = '#' + COLORS.lettuceMid.toString(16).padStart(6, '0');
    for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 3;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.6;
        c.beginPath();
        c.arc(px, py, 0.8 + Math.random() * 0.5, 0, Math.PI * 2);
        c.fill();
    }

    return PIXI.Texture.from(cv);
}