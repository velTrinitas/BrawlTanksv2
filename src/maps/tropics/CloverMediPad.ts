import * as PIXI from 'pixi.js';

/**
 * v0.38.1 FAZA T7.x — CLOVER MEDI PAD ("Ogródek Koniczyny")
 *
 * Hybrid:
 *   - Visual + animations: Mariusz design (soil + stones 2.5D + heart bezier + petals)
 *   - API: drop-in z HoverRepairPad/DesertHeartPad (range check + cooldown + progress + isMoving)
 *
 * Visual AAA premium (Mariusz wizja):
 *   - Drop shadow + soil ellipse (dark + mid)
 *   - 12 stones ring z 2.5D thickness (outline + side + top)
 *   - Heart bezier shape z chunky outline + plastelinowy highlight
 *   - Pink petals particles unoszące się + breath pulse + squash & stretch
 *   - Heart hidden when on cooldown (visual "collected" state)
 *
 * Mechanika:
 *   - Player range 60px + isMoving=false + hp<maxHp → 2.25s hold-to-heal
 *   - 60s cooldown auto-respawn
 *   - Result: { healed: boolean }
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 60;
const REPAIR_TIME_MS = 2250;
const COOLDOWN_MS = 60000;

const COLORS = {
    dropShadow:     0x000000,
    // v0.38.3: jasny brąz (sienna/tan zamiast dark brown)
    soilDark:       0x8a6428,    // outline / głębia poletka
    soilMid:        0xa07840,    // główny jasny brąz
    soilLight:      0xc09058,    // catchlight pale wheat
    // v0.38.3: grass tufts zamiast kamyczków — 4 odcienie soczystej zieleni
    grassDark:      0x1a4818,    // outline / shadow
    grassDeep:      0x2a6028,    // background blade
    grassMid:       0x4a9038,    // main green
    grassLight:     0x7ac048,    // sunlit
    grassBright:    0xa8e068,    // tip catchlight (najsoczystsza)
    grassLime:      0x88d040,    // varied tint (lime)
    grassSage:      0x6a9e58,    // varied tint (sage)
    // Heart (legacy — zachowane dla referencji, NOT używane w v0.38.4)
    heartGlow:      0xff8096,
    heartMain:      0xe62545,
    heartDark:      0x8a1024,
    heartLight:     0xff6b84,
    // v0.38.4: GEAR (zębatka) — steel gray gradient z 2.5D głębia
    gearDeep:       0x2a2e34,    // outline / najgłębsza tonacja
    gearDark:       0x4a5060,    // shadow side
    gearMid:        0x7080a0,    // body main steel
    gearLight:      0xa8b8c8,    // sunlit
    gearBright:     0xd8e0e8,    // catchlight pale steel
    gearGlow:       0xc0d0e0,    // jasno szary glow (silver-blue tint)
    progressGreen:  0x2ecc71,
} as const;

export interface PadInteractionResult {
    healed: boolean;
}

interface FloatParticle {
    gfx: PIXI.Graphics;
    baseX: number;
    phase: number;
    speed: number;
    driftAmp: number;
    life: number;
    maxLife: number;
}

export class CloverMediPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    public repairProgress: number = 0;
    private _repairStart: number | null = null;

    public container: PIXI.Container;
    private innerContainer: PIXI.Container;  // centered (PAD_SIZE/2, PAD_SIZE/2) — Mariusz visuals
    private baseContainer: PIXI.Container;
    private particlesContainer: PIXI.Container;
    private heartContainer: PIXI.Container;
    private heartGlowGfx: PIXI.Graphics;
    private heartHeight: number = 12;

    private particles: FloatParticle[] = [];
    private radius: number = 36;       // v0.38.2: +50% (z 24)
    private heartW: number = 25;       // v0.38.3: +100% (z 12.5)
    private heartH: number = 30;       // v0.38.3: +100% (z 15)
    private lastTime: number = 0;
    private ringPulses: Array<{ progress: number; phase: number }> = [];
    private lastRingSpawn: number = 0;
    // v0.38.3: grass tufts (zamiast kamyczków) z wave wind sway
    private grassTufts: Array<{ container: PIXI.Container; basePhase: number; swayAmp: number }> = [];

    private progressBarBg: PIXI.Graphics;
    private progressBarFill: PIXI.Graphics;
    private progressLabel: PIXI.Text;
    private cooldownLabel: PIXI.Text;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        // Top-level container at top-left (drop-in compat z HoverRepairPad convention)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 50;
        worldContainer.addChild(this.container);

        // Inner container centered at (PAD_SIZE/2, PAD_SIZE/2) — Mariusz visuals draw relative to (0,0)
        this.innerContainer = new PIXI.Container();
        this.innerContainer.x = PAD_SIZE / 2;
        this.innerContainer.y = PAD_SIZE / 2;
        this.container.addChild(this.innerContainer);

        // Base (soil + stones)
        this.baseContainer = new PIXI.Container();
        this.innerContainer.addChild(this.baseContainer);
        this.drawSoilAndStones();

        // Particles container (under heart)
        this.particlesContainer = new PIXI.Container();
        this.innerContainer.addChild(this.particlesContainer);

        // Heart (floating above soil)
        this.heartContainer = new PIXI.Container();
        this.innerContainer.addChild(this.heartContainer);
        this.heartGlowGfx = new PIXI.Graphics();
        this.heartContainer.addChild(this.heartGlowGfx);
        this.drawHeartGlow();
        this.drawHeart();

        // Progress bar UI (relative to top container, not innerContainer)
        this.progressBarBg = new PIXI.Graphics();
        this.progressBarBg.beginFill(0x000000, 0.6);
        this.progressBarBg.drawRoundedRect(10, PAD_SIZE - 18, PAD_SIZE - 20, 10, 5);
        this.progressBarBg.endFill();
        this.container.addChild(this.progressBarBg);
        this.progressBarBg.visible = false;

        this.progressBarFill = new PIXI.Graphics();
        this.container.addChild(this.progressBarFill);

        this.progressLabel = new PIXI.Text('NAPRAWA', {
            fontFamily: 'Arial Black, sans-serif',
            fontSize: 12,
            fill: 0xd0d8e0,
            stroke: 0x2a2e34,
            strokeThickness: 2,
            align: 'center',
        });
        this.progressLabel.anchor.set(0.5, 0);
        this.progressLabel.x = PAD_SIZE / 2;
        this.progressLabel.y = PAD_SIZE + 4;
        this.container.addChild(this.progressLabel);
        this.progressLabel.visible = false;

        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial Black, sans-serif',
            fontSize: 11,
            fill: 0xa0a0a0,
            stroke: 0x101010,
            strokeThickness: 2,
            align: 'center',
        });
        this.cooldownLabel.anchor.set(0.5, 0);
        this.cooldownLabel.x = PAD_SIZE / 2;
        this.cooldownLabel.y = PAD_SIZE + 4;
        this.container.addChild(this.cooldownLabel);
        this.cooldownLabel.visible = false;
    }

    // ═══════════════════════════════════════════════════════════
    // SOIL (jasny brąz) + GRASS TUFTS (zamiast kamyczków, AAA premium)
    // v0.38.3: Soczyste trawiaste kępki z wave wind sway w square perimeter
    // ═══════════════════════════════════════════════════════════
    private drawSoilAndStones(): void {
        const g = new PIXI.Graphics();
        const HALF = 48;

        // 1. Drop shadow
        g.beginFill(COLORS.dropShadow, 0.22);
        g.drawRoundedRect(-HALF + 4, -HALF + 6, HALF * 2, HALF * 2 + 4, 16);
        g.endFill();

        // 2. Jasny brąz soil base (sienna → tan gradient)
        g.beginFill(COLORS.soilDark, 1.0);
        g.drawRoundedRect(-HALF, -HALF, HALF * 2, HALF * 2, 18);
        g.endFill();
        g.beginFill(COLORS.soilMid, 1.0);
        g.drawRoundedRect(-HALF + 3, -HALF + 1, HALF * 2 - 6, HALF * 2 - 5, 15);
        g.endFill();
        // Highlight strip (sunlit NW dla głębi)
        g.beginFill(COLORS.soilLight, 0.6);
        g.drawRoundedRect(-HALF + 6, -HALF + 4, HALF * 1.4, HALF * 0.3, 12);
        g.endFill();

        // Subtle soil texture (mottling)
        for (let i = 0; i < 18; i++) {
            const seedX = ((i * 7919) % 100) / 100 - 0.5;
            const seedY = ((i * 3571) % 100) / 100 - 0.5;
            const seedR = ((i * 2999) % 100) / 100;
            const sx = seedX * HALF * 1.6;
            const sy = seedY * HALF * 1.4;
            const sr = 1.5 + seedR * 2.5;
            // Darker spots (deeper soil bits)
            g.beginFill(COLORS.soilDark, 0.35);
            g.drawEllipse(sx, sy, sr, sr * 0.6);
            g.endFill();
            // Lighter sand bits
            if (i % 3 === 0) {
                g.beginFill(COLORS.soilLight, 0.4);
                g.drawEllipse(sx + 1, sy - 1, sr * 0.5, sr * 0.35);
                g.endFill();
            }
        }

        this.baseContainer.addChild(g);

        // 3. Grass tufts w square perimeter — 16 kępek (4 corners + 3 per edge)
        // Each tuft = own container (pivot at bottom dla sway animation)
        const tuftPositions: Array<{ tx: number; ty: number; tintVariant: number; sizeMul: number }> = [];

        const cornerOffset = HALF - 4;

        // 4 corner tufts (większe)
        for (let ci = 0; ci < 4; ci++) {
            const cx = ci === 0 || ci === 3 ? -cornerOffset : cornerOffset;
            const cy = ci === 0 || ci === 1 ? -cornerOffset : cornerOffset;
            const seedT = ((ci * 7919) % 100) / 100;
            tuftPositions.push({ tx: cx, ty: cy, tintVariant: ci % 4, sizeMul: 1.15 + seedT * 0.15 });
        }

        // Edge tufts (3 per side, 4 sides)
        for (let edge = 0; edge < 4; edge++) {
            const isHoriz = edge < 2;
            const edgePos = (edge === 0 || edge === 2) ? -cornerOffset : cornerOffset;
            for (let i = 0; i < 3; i++) {
                const t = (i + 1) / 4;
                const along = -cornerOffset + t * cornerOffset * 2;
                const seedT = ((i * 7919 + edge * 41) % 100) / 100;
                const seedJ = ((i * 3571 + edge * 23) % 100) / 100 - 0.5;
                const tx = isHoriz ? along + seedJ * 4 : edgePos + seedJ * 4;
                const ty = isHoriz ? edgePos + seedJ * 4 : along + seedJ * 4;
                tuftPositions.push({
                    tx, ty,
                    tintVariant: (i + edge) % 4,
                    sizeMul: 0.85 + seedT * 0.25,
                });
            }
        }

        // Draw each tuft jako separate container (dla per-tuft sway animation)
        for (let i = 0; i < tuftPositions.length; i++) {
            const t = tuftPositions[i];
            const tuftContainer = new PIXI.Container();
            tuftContainer.position.set(t.tx, t.ty);
            // Pivot at bottom dla sway (jak roślina kołysana wiatrem)
            tuftContainer.pivot.set(0, 0);

            this.drawSingleTuft(tuftContainer, t.tintVariant, t.sizeMul, i);
            this.baseContainer.addChild(tuftContainer);

            // Save dla animation
            const phaseSeed = ((i * 7919 + 137) % 100) / 100;
            const ampSeed = ((i * 3571 + 91) % 100) / 100;
            this.grassTufts.push({
                container: tuftContainer,
                basePhase: phaseSeed * Math.PI * 2,
                swayAmp: 0.06 + ampSeed * 0.05,  // 0.06-0.11 rad
            });
        }
    }

    /**
     * Single grass tuft — 3-5 blades różnej długości z 3-layer głębia.
     * AAA premium: każda klingla z shadow + body + highlight + tip catchlight.
     */
    private drawSingleTuft(container: PIXI.Container, tintVariant: number, sizeMul: number, seed: number): void {
        const g = new PIXI.Graphics();

        // 4 odcienie zielonego — varied per tuft (1 z 4 wariantów)
        const tintMap = [
            { dark: COLORS.grassDeep, mid: COLORS.grassMid,  light: COLORS.grassLight,  bright: COLORS.grassBright },
            { dark: COLORS.grassDeep, mid: COLORS.grassLime, light: COLORS.grassBright, bright: 0xc8f088 },
            { dark: COLORS.grassDeep, mid: COLORS.grassSage, light: COLORS.grassMid,    bright: COLORS.grassLight },
            { dark: COLORS.grassDeep, mid: COLORS.grassMid,  light: COLORS.grassBright, bright: 0xb8e878 },
        ];
        const pal = tintMap[tintVariant];

        // Drop shadow pod kępką (mała ellipse)
        g.beginFill(COLORS.dropShadow, 0.30);
        g.drawEllipse(0.5, 1.5, 7 * sizeMul, 2.2);
        g.endFill();

        // Base mound (mały bump zielonej gleby pod blade — głębia)
        g.beginFill(pal.dark, 1.0);
        g.drawEllipse(0, 0.5, 6 * sizeMul, 2.5);
        g.endFill();

        // 4-6 blades różnej długości (mniejsze tufty mają 3-4, większe 5-6)
        const bladeCount = sizeMul > 1.0 ? 5 + Math.floor(((seed * 7) % 100) / 50) : 4;
        for (let b = 0; b < bladeCount; b++) {
            const bSeed = ((b * 7919 + seed * 41) % 100) / 100;
            const bSeedT = ((b * 3571 + seed * 23) % 100) / 100;

            // Blade pozycja & długość
            const bx = -5 * sizeMul + (b / Math.max(1, bladeCount - 1)) * 10 * sizeMul + (bSeed - 0.5) * 1.5;
            const blen = (7 + bSeed * 4) * sizeMul;            // 7-11px
            const blean = (bSeedT - 0.5) * 0.4;                 // ±0.2 rad lean
            const bwidth = 1.4 + bSeed * 0.6;

            // Tip endpoint (zaginany w prawo/lewo z lean)
            const tipX = bx + Math.sin(blean) * blen;
            const tipY = -blen * Math.cos(blean);

            // Mid control point dla curve (slight bend)
            const ctrlX = (bx + tipX) / 2 + (bSeedT - 0.5) * 1.5;
            const ctrlY = -blen * 0.5 - 0.5;

            // ── Layer 1: shadow outline (dark) ──
            g.lineStyle(bwidth + 1.0, COLORS.grassDark, 0.95);
            g.moveTo(bx, 0);
            g.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
            g.lineStyle(0);

            // ── Layer 2: blade body (varied green) ──
            g.lineStyle(bwidth, pal.mid, 1.0);
            g.moveTo(bx, 0);
            g.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
            g.lineStyle(0);

            // ── Layer 3: highlight (lighter strip on top half) ──
            g.lineStyle(bwidth * 0.55, pal.light, 0.85);
            g.moveTo(bx, -0.3);
            g.quadraticCurveTo(ctrlX, ctrlY * 0.95, tipX * 0.95, tipY * 0.95);
            g.lineStyle(0);

            // ── Layer 4: tip catchlight (najsoczystszy bright) ──
            g.beginFill(pal.bright, 0.95);
            g.drawCircle(tipX, tipY, bwidth * 0.55);
            g.endFill();

            // ── Layer 5: tiny white catchlight on tip (1/3 of blades) ──
            if (b % 3 === 0) {
                g.beginFill(0xffffff, 0.55);
                g.drawCircle(tipX - 0.3, tipY - 0.3, bwidth * 0.25);
                g.endFill();
            }
        }

        container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // GEAR (zębatka 2.5D z głębią + cień + silver glow)
    // v0.38.4: zastąpiło serce — pad to teraz WARSZTAT NAPRAWCZY, NIE healing pickup
    // Wizualne rozróżnienie od heart pickup (serce = pickup item, gear = repair station)
    // ═══════════════════════════════════════════════════════════
    private drawHeartGlow(): void {
        const g = this.heartGlowGfx;
        // v0.38.4: Silver-gray glow puddle (zamiast pink)
        // Layer 1: outer soft haze
        g.beginFill(COLORS.gearGlow, 0.25);
        g.drawEllipse(0, 4, 48, 24);
        g.endFill();
        // Layer 2: mid glow
        g.beginFill(COLORS.gearGlow, 0.38);
        g.drawEllipse(0, 3, 34, 18);
        g.endFill();
        // Layer 3: bright silver center (puddle pod zębatką)
        g.beginFill(COLORS.gearBright, 0.55);
        g.drawEllipse(0, 2, 22, 12);
        g.endFill();
    }

    private drawHeart(): void {
        const g = new PIXI.Graphics();

        // v0.38.4: GEAR (zębatka) — 10 teeth, 2.5D thickness
        const TEETH = 10;
        const OUTER_R = 22;       // tip radius (tooth tip)
        const VALLEY_R = 17;      // base radius (between teeth)
        const INNER_R = 12;       // gear body inner ring
        const HOLE_R = 5;         // center hole
        const DEPTH_OFFSET = 2;   // 2.5D thickness Y offset (głębia)

        // Generate gear polygon points (16 points: 8 valleys + 8 tips alternating)
        const polyPoints = (radiusOffset: number, depthOffset: number = 0): number[] => {
            const pts: number[] = [];
            for (let i = 0; i < TEETH * 2; i++) {
                const a = (i / (TEETH * 2)) * Math.PI * 2 - Math.PI / 2;
                const r = (i % 2 === 0 ? OUTER_R : VALLEY_R) + radiusOffset;
                pts.push(Math.cos(a) * r);
                pts.push(Math.sin(a) * r + depthOffset);
            }
            return pts;
        };

        // ── Layer 1: 2.5D Bottom shadow (deepest dark below gear) ──
        g.beginFill(COLORS.dropShadow, 0.45);
        g.drawPolygon(polyPoints(0, 4));
        g.endFill();

        // ── Layer 2: Side thickness (dark gray ring offset down — daje 2.5D feel) ──
        g.beginFill(COLORS.gearDeep, 1.0);
        g.drawPolygon(polyPoints(0, DEPTH_OFFSET));
        g.endFill();

        // ── Layer 3: Outline (chunky dark) ──
        g.beginFill(COLORS.gearDeep, 1.0);
        g.drawPolygon(polyPoints(0.5));
        g.endFill();

        // ── Layer 4: Main body (mid steel) ──
        g.beginFill(COLORS.gearMid, 1.0);
        g.drawPolygon(polyPoints(-0.5));
        g.endFill();

        // ── Layer 5: Top sunlit (light steel) ──
        g.beginFill(COLORS.gearLight, 0.85);
        g.drawPolygon(polyPoints(-2));
        g.endFill();

        // ── Layer 6: Per-tooth catchlight (sunlit NW corner of each tooth) ──
        for (let i = 0; i < TEETH; i++) {
            const a = (i / TEETH) * Math.PI * 2 - Math.PI / 2;
            // Catchlight only on NW-facing teeth (rough hemisphere)
            const isNW = Math.cos(a + Math.PI / 4) > 0.3;
            if (isNW) {
                const tipX = Math.cos(a) * (OUTER_R - 2);
                const tipY = Math.sin(a) * (OUTER_R - 2);
                g.beginFill(COLORS.gearBright, 0.85);
                g.drawCircle(tipX, tipY, 1.8);
                g.endFill();
            }
        }

        // ── Layer 7: Inner ring (concentric circle inside teeth dla mechanical feel) ──
        g.lineStyle(1.5, COLORS.gearDeep, 0.85);
        g.drawCircle(0, 0, INNER_R);
        g.lineStyle(0);
        g.beginFill(COLORS.gearMid, 0.5);
        g.drawCircle(0, 0, INNER_R - 1.5);
        g.endFill();

        // ── Layer 8: Center hole (dark through-hole) ──
        g.beginFill(COLORS.gearDeep, 1.0);
        g.drawCircle(0, 0, HOLE_R + 0.5);
        g.endFill();
        g.beginFill(0x000000, 0.85);
        g.drawCircle(0, 0.4, HOLE_R - 0.5);
        g.endFill();
        // Tiny rim catchlight on hole edge (NW)
        g.beginFill(COLORS.gearBright, 0.6);
        g.drawCircle(-HOLE_R * 0.4, -HOLE_R * 0.4, 1.0);
        g.endFill();

        // ── Layer 9: 3 spokes (subtle radial lines for mechanical detail) ──
        g.lineStyle(1.2, COLORS.gearDark, 0.65);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            const x1 = Math.cos(a) * (HOLE_R + 1.5);
            const y1 = Math.sin(a) * (HOLE_R + 1.5);
            const x2 = Math.cos(a) * (INNER_R - 1.5);
            const y2 = Math.sin(a) * (INNER_R - 1.5);
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
        }
        g.lineStyle(0);

        this.heartContainer.addChild(g);
        // v0.38.4: pivot at gear center (0, 0) — gear leży płasko na ziemi, no squash & stretch
        this.heartContainer.pivot.set(0, 0);
        this.heartHeight = OUTER_R;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — drop-in compat z HoverRepairPad
    // ═══════════════════════════════════════════════════════════
    update(
        playerX: number,
        playerY: number,
        isPlayerMoving: boolean,
        playerHp: number,
        playerMaxHp: number,
        time: number,
    ): PadInteractionResult {
        const now = Date.now();
        const isActive = now >= this.cooldownEnd;
        let healed = false;
        let justHealed = false;

        if (isActive) {
            // v0.38.2: AABB check — cały kwadrat 100×100 aktywny (zamiast circle 60px)
            // 8px padding buffer dla player tank rozmiar
            const padding = 8;
            const inside = playerX >= this.x - padding
                        && playerX <= this.x + PAD_SIZE + padding
                        && playerY >= this.y - padding
                        && playerY <= this.y + PAD_SIZE + padding;

            if (inside && playerHp < playerMaxHp) {
                if (!isPlayerMoving) {
                    if (!this._repairStart) this._repairStart = now;
                    this.repairProgress = Math.min(1, (now - this._repairStart) / REPAIR_TIME_MS);
                    if (this.repairProgress >= 1) {
                        healed = true;
                        justHealed = true;
                        this.cooldownEnd = now + COOLDOWN_MS;
                        this.repairProgress = 0;
                        this._repairStart = null;
                    }
                } else {
                    this.repairProgress = 0;
                    this._repairStart = null;
                }
            } else {
                this.repairProgress = 0;
                this._repairStart = null;
            }
        } else {
            this.repairProgress = 0;
        }

        // Burst petal particles when healed
        if (justHealed) {
            for (let i = 0; i < 12; i++) {
                this.spawnPetalParticle(true);
            }
            // Plus 3 burst rings dla heal completion
            for (let i = 0; i < 3; i++) {
                this.ringPulses.push({ progress: i * -0.15, phase: i * 0.4 });
            }
        }

        this.drawVisuals(isActive, time);
        return { healed };
    }

    private drawVisuals(isActive: boolean, time: number): void {
        const isHealing = this.repairProgress > 0;
        const now = Date.now();

        // Delta computation
        const delta = this.lastTime === 0 ? 1 / 60 : Math.min(0.1, time - this.lastTime);
        this.lastTime = time;

        // ── Gear visibility (visual collected state when on cooldown) ──
        if (isActive) {
            this.heartContainer.visible = true;
            this.heartGlowGfx.visible = true;

            // v0.38.4: GEAR — slow rotation + subtle scale pulse (mechanical)
            // No squash & stretch — gear nie jest organic. To machinery.
            const rotSpeed = isHealing ? 0.5 : 0.2;
            this.heartContainer.rotation = time * rotSpeed;

            // Subtle scale pulse (machinery breathing)
            const pulseScale = isHealing ? 0.06 : 0.03;
            const scale = 1.0 + Math.sin(time * 2.5) * pulseScale;
            this.heartContainer.scale.set(scale);

            // Gear leży na ziemi — no float
            this.heartContainer.y = 0;

            // Silver-gray glow PULSING (lekko pulsuje jasno szary)
            const glowBase = isHealing ? 0.80 : 0.55;
            const glowAmp = isHealing ? 0.20 : 0.15;
            this.heartGlowGfx.alpha = glowBase + Math.sin(time * 3) * glowAmp;
            const glowScale = isHealing ? 1.10 : 1.0;
            this.heartGlowGfx.scale.set(glowScale + Math.sin(time * 2.5) * 0.06);

            // Spawn silver particles (faster when repairing)
            const spawnChance = isHealing ? 0.18 : 0.06;
            if (Math.random() < spawnChance && this.particles.length < 12) {
                this.spawnPetalParticle(false);
            }

            // Repair rings — emanują z gear center co heartbeat
            const ringInterval = isHealing ? 0.55 : 1.10;
            if (now - this.lastRingSpawn > ringInterval * 1000) {
                this.lastRingSpawn = now;
                this.ringPulses.push({ progress: 0, phase: 0 });
            }

            // Spawn cross "+" symbols floating up (repair indicator)
            if (isHealing && Math.random() < 0.10 && this.particles.length < 14) {
                this.spawnHealCross();
            }
        } else {
            this.heartContainer.visible = false;
            this.heartGlowGfx.visible = false;
        }

        // ── Update petal particles + heal crosses ──
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            if (p.life <= 0) {
                this.particlesContainer.removeChild(p.gfx);
                p.gfx.destroy();
                this.particles.splice(i, 1);
                continue;
            }
            p.gfx.y -= p.speed * delta;
            p.gfx.x = p.baseX + Math.sin(time * 4 + p.phase) * p.driftAmp;
            // Fade out
            if (p.life < 1.0) p.gfx.alpha = p.life;
        }

        // ── Update healing rings (drawn na particles container) ──
        this.drawHealingRings(delta);

        // ── v0.38.3: Grass tufts wave wind sway (zawsze, even when on cooldown) ──
        for (const tuft of this.grassTufts) {
            // Each tuft sways z own phase + amp (organic group movement)
            tuft.container.rotation = Math.sin(time * 1.6 + tuft.basePhase) * tuft.swayAmp;
        }

        // ── Progress bar ──
        if (isHealing) {
            this.progressBarBg.visible = true;
            this.progressLabel.visible = true;
            this.progressBarFill.clear();
            this.progressBarFill.beginFill(COLORS.gearLight, 0.95);
            this.progressBarFill.drawRoundedRect(12, PAD_SIZE - 16, (PAD_SIZE - 24) * this.repairProgress, 6, 3);
            this.progressBarFill.endFill();
        } else {
            this.progressBarBg.visible = false;
            this.progressBarFill.clear();
            this.progressLabel.visible = false;
        }

        // ── Cooldown label ──
        if (!isActive) {
            this.cooldownLabel.visible = true;
            const remaining = Math.ceil((this.cooldownEnd - now) / 1000);
            this.cooldownLabel.text = `⚙ ${remaining}s`;
        } else {
            this.cooldownLabel.visible = false;
        }
    }

    /**
     * Healing rings — expanding sparkle circles emanujące z heart center.
     * Cyrkulujące zielono-różowe pierścienie z fading alpha.
     */
    private healingRingGfx: PIXI.Graphics | null = null;
    private drawHealingRings(delta: number): void {
        if (!this.healingRingGfx) {
            this.healingRingGfx = new PIXI.Graphics();
            this.particlesContainer.addChild(this.healingRingGfx);
        }
        const g = this.healingRingGfx;
        g.clear();

        for (let i = this.ringPulses.length - 1; i >= 0; i--) {
            const r = this.ringPulses[i];
            r.progress += delta * 1.2;  // 1.2s lifetime per ring
            if (r.progress > 1.0) {
                this.ringPulses.splice(i, 1);
                continue;
            }
            if (r.progress < 0) continue;  // delay phase
            const radius = 10 + r.progress * 40;
            const alpha = (1 - r.progress) * 0.7;
            // Outer green ring (heal color)
            g.lineStyle(2.5, COLORS.progressGreen, alpha * 0.8);
            g.drawEllipse(0, 2, radius, radius * 0.6);
            g.lineStyle(0);
            // Inner pink ring (heart color)
            g.lineStyle(1.5, COLORS.gearLight, alpha);
            g.drawEllipse(0, 2, radius * 0.85, radius * 0.85 * 0.6);
            g.lineStyle(0);
        }
    }

    private spawnHealCross(): void {
        const gfx = new PIXI.Graphics();
        // White "+" cross na heal indicator
        gfx.beginFill(COLORS.progressGreen, 0.9);
        // Vertical bar
        gfx.drawRoundedRect(-1, -3, 2, 6, 0.5);
        // Horizontal bar
        gfx.drawRoundedRect(-3, -1, 6, 2, 0.5);
        gfx.endFill();
        // White outline dla pop
        gfx.lineStyle(0.5, 0xffffff, 0.8);
        gfx.drawRoundedRect(-1, -3, 2, 6, 0.5);
        gfx.drawRoundedRect(-3, -1, 6, 2, 0.5);
        gfx.lineStyle(0);

        const pX = (Math.random() - 0.5) * 16;
        const pY = -2 + (Math.random() - 0.5) * 6;
        gfx.position.set(pX, pY);

        this.particlesContainer.addChild(gfx);
        this.particles.push({
            gfx,
            baseX: pX,
            phase: Math.random() * Math.PI * 2,
            speed: 28 + Math.random() * 12,
            driftAmp: 3 + Math.random() * 3,
            life: 1.2 + Math.random() * 0.4,
            maxLife: 1.4,
        });
    }

    private spawnPetalParticle(burst: boolean): void {
        const gfx = new PIXI.Graphics();
        // v0.38.4: silver spark particles (zamiast pink petals)
        gfx.beginFill(COLORS.gearBright, 0.85);
        gfx.drawEllipse(0, 0, 2.0, 1.2);
        gfx.endFill();
        // White catchlight (na ~30%)
        if (Math.random() < 0.4) {
            gfx.beginFill(0xffffff, 0.7);
            gfx.drawCircle(-0.5, -0.3, 0.6);
            gfx.endFill();
        }
        gfx.rotation = Math.random() * Math.PI;

        const pX = (Math.random() - 0.5) * 20;
        const pY = (Math.random() - 0.5) * 10 - 5;
        gfx.position.set(pX, pY);

        this.particlesContainer.addChild(gfx);

        this.particles.push({
            gfx,
            baseX: pX,
            phase: Math.random() * Math.PI * 2,
            speed: burst ? 40 + Math.random() * 25 : 15 + Math.random() * 10,
            driftAmp: burst ? 8 + Math.random() * 8 : 4 + Math.random() * 6,
            life: burst ? 1.0 + Math.random() * 0.5 : 1.5 + Math.random(),
            maxLife: burst ? 1.25 : 2.0,
        });
    }
}