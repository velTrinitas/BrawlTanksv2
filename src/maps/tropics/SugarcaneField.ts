import * as PIXI from 'pixi.js';
import type { IFarmField } from './IFarmField';

/**
 * v0.36.0 FAZA T7.1 — SUGARCANE FIELD (trzcina cukrowa)
 *
 * Caribbean sugar cane field — tropical staple crop, denser + taller than corn.
 *
 * KLUCZOWE RÓŻNICE vs CornField:
 *   1. Wyższe łodygi (~75-80px vs corn 34-38px) — sugar cane jest naprawdę wysoka
 *   2. GĘSTSZY grid (spacing 16x16 vs corn 20x18) — sugar cane rośnie w kępach
 *   3. Fluffy WHITE plume na top (zamiast yellow corn ear) — kwiat trzciny cukrowej
 *   4. Stalks z bambusowymi węzłami (segmenty co ~10-12px wzdłuż łodygi)
 *   5. Wąskie spiczaste liście (długie, ostro zakończone)
 *
 * Mechanika gameplay:
 *   - Gracz w polu → stealth (10s, identycznie jak corn)
 *   - isPointInside() → rectangle check
 *   - Sok rozchylania (taller bend dla "feel")
 */

const COLORS = {
    // Łodyga (cane stalk — bardziej yellow-green niż corn)
    stemDark:       0x2a3a10,
    stemMid:        0x6a8a30,    // żółto-zielony cane
    stemLight:      0xa8c850,    // jasny highlight
    stemNode:       0x4a6020,    // ciemniejszy node (segment ring)
    // Liście (wąskie ostre)
    leafDark:       0x2e5a20,
    leafMid:        0x4a8030,    // jaśniejszy zielony niż corn
    leafLight:      0x70b048,
    // Plume (kwiatostan na top — fluffy white/cream)
    plumeShadow:    0xb8a878,
    plumeMid:       0xf0e0b8,
    plumeLight:     0xfff8e0,
    plumeBright:    0xffffff,
    // Gleba (taka sama jak corn)
    soilDark:       0x4a3010,
    soilMid:        0x6a4a20,
    soilLight:      0x8a6830,
    // Particles (sugar pollen — drobny biały dryf)
    pollen:         0xf8f0d0,
} as const;

interface CanePlant {
    sprite: PIXI.Sprite;
    baseX: number;
    baseY: number;
    phaseOffset: number;
    baseSwayAmp: number;
    bendAmount: number;
}

interface FloatParticle {
    gfx: PIXI.Graphics;
    baseX: number;
    baseY: number;
    phase: number;
    driftAmp: number;
}

function makeRng(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

export class SugarcaneField implements IFarmField {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private static plantTextures: PIXI.Texture[] = [];
    private groundContainer: PIXI.Container;
    private plants: CanePlant[] = [];
    private particles: FloatParticle[] = [];
    private time: number = 0;

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

        const rng = makeRng(seed);

        // Generate textures once (cached static)
        if (SugarcaneField.plantTextures.length === 0) {
            SugarcaneField.plantTextures = generatePlantTextures();
        }

        // Ground patch
        this.groundContainer = new PIXI.Container();
        this.groundContainer.zIndex = -80;
        worldContainer.addChild(this.groundContainer);
        this.drawGroundPatch(rng);

        // Plants grid
        this.spawnPlants(rng, worldContainer);

        // Particles (white sugar pollen)
        this.spawnParticles(rng, worldContainer);
    }

    // ═══════════════════════════════════════════════════════════
    // GROUND PATCH
    // ═══════════════════════════════════════════════════════════
    private drawGroundPatch(rng: () => number): void {
        const g = new PIXI.Graphics();
        const RADIUS = 18;

        // Drop shadow
        g.beginFill(0x000000, 0.10);
        g.drawRoundedRect(this.x + 6, this.y + 8, this.w, this.h, RADIUS);
        g.endFill();

        // Główna gleba
        g.beginFill(0x7a5a30, 0.45);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);
        g.endFill();

        // Subtle soil texture
        g.beginFill(COLORS.soilMid, 0.25);
        for (let i = 0; i < 50; i++) {
            const rx = this.x + rng() * this.w;
            const ry = this.y + rng() * this.h;
            g.drawCircle(rx, ry, 1 + rng() * 2);
        }
        g.endFill();

        // Rzędy zaorane (tighter spacing dla sugarcane)
        g.lineStyle(1, COLORS.soilDark, 0.40);
        for (let yLine = this.y + 12; yLine < this.y + this.h - 6; yLine += 18) {
            const inset = 14;
            g.moveTo(this.x + inset, yLine);
            g.lineTo(this.x + this.w - inset, yLine);
        }

        // Małe kępki trawy (jak w corn dla mapa-flora flavor)
        const TUFT_COUNT = Math.floor((this.w * this.h) / 1500);
        for (let i = 0; i < TUFT_COUNT; i++) {
            const margin = 14;
            const tx = this.x + margin + rng() * (this.w - margin * 2);
            const ty = this.y + margin + rng() * (this.h - margin * 2);
            g.beginFill(0x000000, 0.15);
            g.drawEllipse(tx, ty + 1, 4, 1.2);
            g.endFill();
            const bladeCount = 3 + Math.floor(rng() * 3);
            for (let b = 0; b < bladeCount; b++) {
                const bx = tx + (rng() - 0.5) * 4;
                const h = 3 + rng() * 4;
                const tilt = (rng() - 0.5) * 0.6;
                const col = rng() < 0.45 ? COLORS.leafLight : COLORS.leafMid;
                g.lineStyle(1.4, col, 0.92);
                g.moveTo(bx, ty);
                g.lineTo(bx + Math.sin(tilt) * h, ty - Math.cos(tilt) * h);
            }
        }

        // Cartoon outline
        g.lineStyle(2, 0x4a2818, 0.55);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);

        this.groundContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // PLANTS — gęstszy grid, taller stalks, varied textures
    // ═══════════════════════════════════════════════════════════
    private spawnPlants(rng: () => number, worldContainer: PIXI.Container): void {
        // GĘSTSZE niż corn (20x18) — sugarcane spacing 16x14
        const SPACING_X = 16;
        const SPACING_Y = 14;
        const cols = Math.floor((this.w - 12) / SPACING_X);
        const rows = Math.floor((this.h - 12) / SPACING_Y);

        const startX = this.x + (this.w - cols * SPACING_X) / 2 + SPACING_X / 2;
        const startY = this.y + (this.h - rows * SPACING_Y) / 2 + SPACING_Y / 2;

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                const jitterX = (rng() - 0.5) * 4;
                const jitterY = (rng() - 0.5) * 3;
                const px = startX + col * SPACING_X + jitterX;
                const py = startY + row * SPACING_Y + jitterY;

                const variant = Math.floor(rng() * SugarcaneField.plantTextures.length);
                const sprite = new PIXI.Sprite(SugarcaneField.plantTextures[variant]);
                sprite.anchor.set(0.5, 1.0);  // bottom-center anchor (stalk root)
                sprite.x = px;
                sprite.y = py;
                sprite.zIndex = Math.floor(py);  // Y-sort z tankami
                // Subtle scale jitter per plant
                const scale = 0.95 + rng() * 0.15;
                sprite.scale.set(scale);
                worldContainer.addChild(sprite);

                const phaseOffset = (px * 0.012 + py * 0.018);
                // v0.36.1: ekstra bujanie się (2x amplitude od poprzedniego)
                const baseSwayAmp = 0.10 + rng() * 0.08;

                this.plants.push({
                    sprite, baseX: px, baseY: py,
                    phaseOffset, baseSwayAmp,
                    bendAmount: 0,
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PARTICLES — biały pyłek cukrowy
    // ═══════════════════════════════════════════════════════════
    private spawnParticles(rng: () => number, worldContainer: PIXI.Container): void {
        const COUNT = Math.floor((this.w * this.h) / 6000);
        for (let i = 0; i < COUNT; i++) {
            const baseX = this.x + 10 + rng() * (this.w - 20);
            const baseY = this.y + 20 + rng() * (this.h - 30);
            const gfx = new PIXI.Graphics();
            gfx.beginFill(COLORS.pollen, 0.7);
            gfx.drawCircle(0, 0, 1.0 + rng() * 0.4);
            gfx.endFill();
            gfx.x = baseX;
            gfx.y = baseY;
            gfx.zIndex = 9999;  // unosi się nad wszystkim
            worldContainer.addChild(gfx);
            this.particles.push({
                gfx, baseX, baseY,
                phase: rng() * Math.PI * 2,
                driftAmp: 6 + rng() * 6,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — wave wind + bend recovery + particle drift
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;

        for (const p of this.plants) {
            p.bendAmount *= 0.92;
            if (Math.abs(p.bendAmount) < 0.005) p.bendAmount = 0;
            // v0.36.1: ekstra bujanie się — frequency 1.4 → 1.8 + amplitude 2x (już w baseSwayAmp)
            const wave = Math.sin(this.time * 1.8 + p.phaseOffset) * p.baseSwayAmp;
            p.sprite.skew.x = wave + p.bendAmount;
        }

        for (const p of this.particles) {
            const cyclePhase = ((this.time * 0.22) + p.phase / (Math.PI * 2)) % 1.0;
            p.gfx.y = p.baseY - cyclePhase * 30;
            p.gfx.x = p.baseX + Math.sin(cyclePhase * Math.PI * 2 + p.phase) * (p.driftAmp / 2);
            let alpha = 0.75;
            if (cyclePhase < 0.2) alpha = (cyclePhase / 0.2) * 0.75;
            else if (cyclePhase > 0.7) alpha = ((1.0 - cyclePhase) / 0.3) * 0.75;
            p.gfx.alpha = alpha;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STEALTH CHECK
    // ═══════════════════════════════════════════════════════════
    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w
            && py >= this.y && py <= this.y + this.h;
    }

    // ═══════════════════════════════════════════════════════════
    // TANK INTERACTION — trzcina rozchyla się przy przejeździe
    // ═══════════════════════════════════════════════════════════
    public onTankEnter(tankX: number, tankY: number): void {
        const MARGIN = 60;
        if (tankX < this.x - MARGIN || tankX > this.x + this.w + MARGIN
            || tankY < this.y - MARGIN || tankY > this.y + this.h + MARGIN) {
            return;
        }

        const IMPACT_RADIUS = 55;
        const MAX_BEND = 0.60;  // taller stalks → larger bend (vs corn 0.55)

        for (const p of this.plants) {
            const dx = p.sprite.x - tankX;
            const dy = p.sprite.y - tankY;
            const distSq = dx * dx + dy * dy;
            const radiusSq = IMPACT_RADIUS * IMPACT_RADIUS;
            if (distSq > radiusSq) continue;

            const dist = Math.sqrt(distSq);
            const intensity = 1.0 - (dist / IMPACT_RADIUS);
            const direction = dx >= 0 ? 1 : -1;
            const newBend = MAX_BEND * intensity * direction;

            if (Math.abs(newBend) > Math.abs(p.bendAmount)) {
                p.bendAmount = newBend;
            }
        }
    }
}

// ───────────────────────────────────────────────────────────────
// PLANT TEXTURE GENERATION — 3 warianty (canvas → PIXI.Texture)
// ───────────────────────────────────────────────────────────────

function generatePlantTextures(): PIXI.Texture[] {
    const textures: PIXI.Texture[] = [];

    // v0.36.1: stalk h /2 (Mariusz: zbyt wysokie). Plus canvas H smaller proporcjonalnie.
    const variants = [
        { stalkH: 34, plumeR: 4.0, scale: 1.0  },   // standardowa (z 68)
        { stalkH: 38, plumeR: 4.5, scale: 1.05 },   // wyższa (z 76)
        { stalkH: 31, plumeR: 3.5, scale: 0.95 },   // niższa (z 62)
    ];

    for (const v of variants) {
        const W = 30;
        const H = 56;  // v0.36.1: z 90 → 56 (proporcjonalne do half stalkH)
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const c = cv.getContext('2d')!;
        const cx = W / 2;
        const baseY = H - 4;
        const topY = baseY - v.stalkH;

        // ── 1. Drop shadow ──
        c.fillStyle = 'rgba(0,0,0,0.32)';
        c.beginPath();
        c.ellipse(cx, baseY - 1, 6, 2.2, 0, 0, Math.PI * 2);
        c.fill();

        // ── 2. Stalk: outline thick + inner ──
        c.strokeStyle = '#' + COLORS.stemDark.toString(16).padStart(6, '0');
        c.lineWidth = 4;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(cx, baseY);
        c.lineTo(cx, topY);
        c.stroke();
        c.strokeStyle = '#' + COLORS.stemMid.toString(16).padStart(6, '0');
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(cx, baseY);
        c.lineTo(cx, topY);
        c.stroke();
        // Sunlit side
        c.strokeStyle = '#' + COLORS.stemLight.toString(16).padStart(6, '0');
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx - 0.8, baseY);
        c.lineTo(cx - 0.8, topY);
        c.stroke();

        // ── 3. Bambusowe węzły (segment rings — v0.36.1: spacing /2 = 6) ──
        const SEGMENT_PX = 6;
        for (let segY = baseY - SEGMENT_PX; segY > topY + 3; segY -= SEGMENT_PX) {
            // Ciemny pierścień
            c.strokeStyle = '#' + COLORS.stemNode.toString(16).padStart(6, '0');
            c.lineWidth = 3.2;
            c.beginPath();
            c.moveTo(cx - 2, segY);
            c.lineTo(cx + 2, segY);
            c.stroke();
            // Tiny highlight
            c.strokeStyle = '#' + COLORS.stemLight.toString(16).padStart(6, '0');
            c.lineWidth = 0.8;
            c.beginPath();
            c.moveTo(cx - 1.5, segY - 0.5);
            c.lineTo(cx + 1.5, segY - 0.5);
            c.stroke();
        }

        // ── 4. Wąskie ostre liście — v0.36.1: lengths /2 ──
        const leafPositions = [
            { yRatio: 0.25, dirR: 1,  len: 7 },
            { yRatio: 0.30, dirR: -1, len: 6.5 },
            { yRatio: 0.45, dirR: 1,  len: 6 },
            { yRatio: 0.50, dirR: -1, len: 7 },
            { yRatio: 0.65, dirR: 1,  len: 5.5 },
            { yRatio: 0.70, dirR: -1, len: 5 },
            { yRatio: 0.82, dirR: 1,  len: 4.5 },
            { yRatio: 0.88, dirR: -1, len: 4 },
        ];
        for (const lp of leafPositions) {
            const ly = baseY - v.stalkH * lp.yRatio;
            const tipX = cx + lp.dirR * lp.len;
            const tipY = ly - lp.len * 0.45;  // skierowane lekko w górę

            // Outline leaf (curved triangle)
            c.fillStyle = '#' + COLORS.leafDark.toString(16).padStart(6, '0');
            c.beginPath();
            c.moveTo(cx, ly);
            c.quadraticCurveTo(cx + lp.dirR * lp.len * 0.5, ly - 2, tipX, tipY);
            c.quadraticCurveTo(cx + lp.dirR * lp.len * 0.4, ly + 2, cx, ly + 1);
            c.closePath();
            c.fill();

            // Inner leaf
            c.fillStyle = '#' + COLORS.leafMid.toString(16).padStart(6, '0');
            c.beginPath();
            c.moveTo(cx + lp.dirR * 1, ly);
            c.quadraticCurveTo(cx + lp.dirR * lp.len * 0.45, ly - 1.5, tipX - lp.dirR * 0.5, tipY + 0.5);
            c.quadraticCurveTo(cx + lp.dirR * lp.len * 0.35, ly + 1, cx + lp.dirR * 1, ly + 0.5);
            c.closePath();
            c.fill();

            // Highlight (sunlit edge)
            c.strokeStyle = '#' + COLORS.leafLight.toString(16).padStart(6, '0');
            c.lineWidth = 0.7;
            c.beginPath();
            c.moveTo(cx + lp.dirR * 1, ly - 0.5);
            c.quadraticCurveTo(cx + lp.dirR * lp.len * 0.5, ly - 2, tipX, tipY - 0.3);
            c.stroke();
        }

        // ── 5. PLUME (fluffy white plume na top — sugar cane signature!) ──
        // Multiple overlapping cloud-like circles for fluffy texture
        const plumeBaseY = topY;
        const plumeTopY = topY - v.plumeR * 3;

        // Shadow base
        c.fillStyle = '#' + COLORS.plumeShadow.toString(16).padStart(6, '0');
        for (let i = 0; i < 6; i++) {
            const py = plumeBaseY - i * v.plumeR * 0.5;
            const px = cx + (i % 2 === 0 ? -1 : 1) * 1;
            const r = v.plumeR * (1 - i * 0.12);
            c.beginPath();
            c.arc(px, py, r, 0, Math.PI * 2);
            c.fill();
        }

        // Mid layer
        c.fillStyle = '#' + COLORS.plumeMid.toString(16).padStart(6, '0');
        for (let i = 0; i < 5; i++) {
            const py = plumeBaseY - i * v.plumeR * 0.55 - 1;
            const px = cx + (i % 2 === 0 ? -0.6 : 0.6);
            const r = v.plumeR * 0.85 * (1 - i * 0.10);
            c.beginPath();
            c.arc(px, py, r, 0, Math.PI * 2);
            c.fill();
        }

        // Highlight layer
        c.fillStyle = '#' + COLORS.plumeLight.toString(16).padStart(6, '0');
        for (let i = 0; i < 4; i++) {
            const py = plumeBaseY - i * v.plumeR * 0.55 - 1.5;
            const px = cx - 0.8 + (i % 2 === 0 ? -0.4 : 0.4);
            const r = v.plumeR * 0.65 * (1 - i * 0.08);
            c.beginPath();
            c.arc(px, py, r, 0, Math.PI * 2);
            c.fill();
        }

        // Bright catchlights (4 tiny dots)
        c.fillStyle = '#' + COLORS.plumeBright.toString(16).padStart(6, '0');
        c.beginPath();
        c.arc(cx - 1.5, plumeBaseY - v.plumeR * 1.2, 1.2, 0, Math.PI * 2);
        c.arc(cx + 0.8, plumeBaseY - v.plumeR * 2.0, 0.9, 0, Math.PI * 2);
        c.arc(cx - 0.5, plumeBaseY - v.plumeR * 2.4, 0.7, 0, Math.PI * 2);
        c.arc(cx + 0.3, plumeBaseY - v.plumeR * 0.6, 0.6, 0, Math.PI * 2);
        c.fill();

        // Tiny tip extension (kwiatostan)
        c.strokeStyle = '#' + COLORS.plumeMid.toString(16).padStart(6, '0');
        c.lineWidth = 0.8;
        c.lineCap = 'round';
        for (let strand = 0; strand < 5; strand++) {
            const sx = cx - 2 + strand;
            const tipY = plumeTopY - 2 + (strand % 2) * 1;
            c.beginPath();
            c.moveTo(sx, plumeBaseY - v.plumeR * 2.5);
            c.lineTo(sx + (strand - 2) * 0.5, tipY);
            c.stroke();
        }

        // Apply variant scale
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