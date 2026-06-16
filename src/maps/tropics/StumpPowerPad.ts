import * as PIXI from 'pixi.js';

/**
 * v0.38.1 FAZA T7.x — STUMP POWER PAD ("Nienaładowany Pień z Błyskawicą")
 *
 * Hybrid:
 *   - Visual + animations: Mariusz design (stump 2.5D + Brawl Stars bolt + burned inactive state)
 *   - API: drop-in z PowerHoverPad/DesertStormPad (range check + cooldown + result object)
 *
 * Visual AAA premium (Mariusz wizja):
 *   - Drop shadow + tree stump z thickness 2.5D
 *   - Wood top (jasne dąb) + 2 koncentryczne wood rings (słoje)
 *   - Bark side z pionowymi linia textury kory
 *   - Brawl Stars bolt polygon (7-point ostre kąty) z chunky cutout z pnia
 *   - Active state: glow yellow + neon white center + sparks
 *   - Inactive state (cooldown): burned dark bolt (carved into wood)
 *   - Squash animation on activation
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 50;
const TURBO_DURATION_MS = 5000;
const COOLDOWN_MS = 20000;
const TURBO_MULT = 2.0;

const COLORS = {
    dropShadow:     0x000000,
    barkDark:       0x362114,
    barkLight:      0x4a2e1c,
    barkTexture:    0x22140a,
    woodMain:       0xc2996b,
    woodRings:      0xa37b52,
    // v0.38.5: wood grain texture colors
    woodGrain:      0x8a6034,    // darker grain streaks
    woodHighlight:  0xe0b888,    // lighter grain accent (sunlit wood)
    boltGlowOuter:  0xd4b81c,
    boltGlowInner:  0xffea4d,
    boltMain:       0xffea4d,
    boltDark:       0x36321f,
    neonWhite:      0xffffff,
} as const;

export interface PowerPadInteractionResult {
    activated: boolean;
    durationMs: number;
    multiplier: number;
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

export class StumpPowerPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;

    public container: PIXI.Container;
    private innerContainer: PIXI.Container;  // centered (PAD_SIZE/2, PAD_SIZE/2)
    private baseContainer: PIXI.Container;   // stump body (z squash animation)
    private inactiveBoltGfx: PIXI.Graphics;
    private glowContainer: PIXI.Container;
    private particlesContainer: PIXI.Container;
    private cooldownLabel: PIXI.Text;

    private particles: FloatParticle[] = [];
    private radius: number = 42;          // v0.38.2: +50% (z 28)
    private boltScale: number = 1.65;     // v0.38.5: +65% (proporcjonalnie do 100×100 pad)
    private outerGlowGfx: PIXI.Graphics;  // v0.38.2: delikatny pulsujący glow wokół pnia
    private squashTimer: number = 0;
    private lastTime: number = 0;
    private wasActive: boolean = true;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 50;
        worldContainer.addChild(this.container);

        // Inner container centered
        this.innerContainer = new PIXI.Container();
        this.innerContainer.x = PAD_SIZE / 2;
        this.innerContainer.y = PAD_SIZE / 2;
        this.container.addChild(this.innerContainer);

        // Outer delikatny glow (wokół pnia, pulsujący) — DODAJ PRZED stump
        this.outerGlowGfx = new PIXI.Graphics();
        this.drawOuterGlow();
        this.innerContainer.addChild(this.outerGlowGfx);

        // Stump base (z squash anim)
        this.baseContainer = new PIXI.Container();
        this.innerContainer.addChild(this.baseContainer);
        this.drawStump();

        // Inactive (burned) bolt — visible only when on cooldown
        this.inactiveBoltGfx = this.createBoltGfx(COLORS.boltDark, false);
        this.inactiveBoltGfx.scale.set(this.boltScale);
        // v0.38.3: Match position with active bolt (top-down disc center na 0, 0)
        this.inactiveBoltGfx.y = 0;
        this.innerContainer.addChild(this.inactiveBoltGfx);
        this.inactiveBoltGfx.visible = false;

        // Active glow bolt — visible when active
        this.glowContainer = new PIXI.Container();
        this.innerContainer.addChild(this.glowContainer);
        this.drawActiveBolt();

        // Particles (sparks)
        this.particlesContainer = new PIXI.Container();
        this.innerContainer.addChild(this.particlesContainer);

        // Cooldown label
        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial Black, sans-serif',
            fontSize: 11,
            fill: 0xc0a060,
            stroke: 0x201810,
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
    // OUTER GLOW (delikatny pulsujący halo wokół pnia)
    // ═══════════════════════════════════════════════════════════
    private drawOuterGlow(): void {
        const g = this.outerGlowGfx;
        // v0.38.5: Halo dla 100×100 pad — większy żółty glow
        const halfW = 56;   // 50 + 6 padding
        const halfH = 56;
        // Outer (most diffuse)
        g.beginFill(COLORS.boltGlowOuter, 0.14);
        g.drawRoundedRect(-halfW, -halfH, halfW * 2, halfH * 2, 22);
        g.endFill();
        // Mid layer
        g.beginFill(COLORS.boltGlowOuter, 0.20);
        g.drawRoundedRect(-halfW + 5, -halfH + 5, halfW * 2 - 10, halfH * 2 - 10, 20);
        g.endFill();
        // Inner tight (najjaśniejszy żółty)
        g.beginFill(COLORS.boltGlowInner, 0.18);
        g.drawRoundedRect(-halfW + 10, -halfH + 10, halfW * 2 - 20, halfH * 2 - 20, 18);
        g.endFill();
    }

    // ═══════════════════════════════════════════════════════════
    // STUMP (PERFECT SQUARE 100×100, grubość 10px frame, wood grain + 3 rings)
    // v0.38.5: 100×100 z zaokrąglonymi rogami, bark frame 10px, drewno + słoje
    // ═══════════════════════════════════════════════════════════
    private drawStump(): void {
        const g = new PIXI.Graphics();

        const SQ_W = 100;                   // v0.38.5: pełen kwadrat 100x100
        const SQ_H = 100;
        const CORNER_R = 20;                // zaokrąglone rogi (większe dla soft cartoon look)
        const FRAME_THICKNESS = 10;         // v0.38.5: 10px dark bark border

        // 1. Drop shadow (większa pod kwadratem 100×100)
        g.beginFill(COLORS.dropShadow, 0.32);
        g.drawRoundedRect(-SQ_W / 2 + 4, SQ_H / 2 + 2, SQ_W, 10, CORNER_R);
        g.endFill();

        // 2. Dark bark frame (outer ring — 10px szeroki)
        g.beginFill(COLORS.barkDark, 1.0);
        g.drawRoundedRect(-SQ_W / 2, -SQ_H / 2, SQ_W, SQ_H, CORNER_R);
        g.endFill();

        // 3. Bark texture (drobne kreski na bottom edge — głębia kory)
        g.lineStyle(1.5, COLORS.barkTexture, 0.6);
        let idx = 0;
        for (let i = -SQ_W / 2 + 8; i < SQ_W / 2 - 8; i += 7, idx++) {
            const seedH = ((idx * 7919) % 100) / 100;
            const seedY = ((idx * 3571) % 100) / 100;
            // Top edge
            g.moveTo(i, -SQ_H / 2 + 2);
            g.lineTo(i, -SQ_H / 2 + 4 + seedH * 2);
            // Bottom edge
            g.moveTo(i + seedY * 2, SQ_H / 2 - 4);
            g.lineTo(i + seedY * 2, SQ_H / 2 - 2 + seedH * 1.5);
        }
        // Side edges
        for (let j = -SQ_H / 2 + 12; j < SQ_H / 2 - 12; j += 7, idx++) {
            const seedH = ((idx * 7919) % 100) / 100;
            g.moveTo(-SQ_W / 2 + 2, j);
            g.lineTo(-SQ_W / 2 + 4 + seedH * 2, j);
            g.moveTo(SQ_W / 2 - 4, j);
            g.lineTo(SQ_W / 2 - 2 + seedH * 1.5, j);
        }
        g.lineStyle(0);

        // 4. Inner bark light border (2.5D depth — between dark frame and wood top)
        g.beginFill(COLORS.barkLight, 1.0);
        g.drawRoundedRect(
            -SQ_W / 2 + FRAME_THICKNESS / 2,
            -SQ_H / 2 + FRAME_THICKNESS / 2,
            SQ_W - FRAME_THICKNESS,
            SQ_H - FRAME_THICKNESS,
            CORNER_R - 4,
        );
        g.endFill();

        // 5. Wood top (jasny dąb — główna powierzchnia ścięcia)
        g.beginFill(COLORS.woodMain, 1.0);
        g.drawRoundedRect(
            -SQ_W / 2 + FRAME_THICKNESS,
            -SQ_H / 2 + FRAME_THICKNESS,
            SQ_W - FRAME_THICKNESS * 2,
            SQ_H - FRAME_THICKNESS * 2,
            CORNER_R - 8,
        );
        g.endFill();

        // 6. WOOD GRAIN (curved bezier lines — naturalna tekstura drewna)
        const grainCount = 6;
        for (let gi = 0; gi < grainCount; gi++) {
            const seedX = ((gi * 7919) % 100) / 100;
            const seedC = ((gi * 3571) % 100) / 100;
            const offsetY = (gi / (grainCount - 1) - 0.5) * (SQ_H - FRAME_THICKNESS * 2 - 8);

            // Darker grain stripe (subtle horizontal flow z slight bend)
            const startX = -SQ_W / 2 + FRAME_THICKNESS + 4;
            const endX = SQ_W / 2 - FRAME_THICKNESS - 4;
            const midX = (startX + endX) / 2 + (seedX - 0.5) * 8;
            const midY = offsetY + (seedC - 0.5) * 4;

            // Dark grain (główny strumień drewna)
            g.lineStyle(1.2, COLORS.woodGrain, 0.45);
            g.moveTo(startX, offsetY);
            g.quadraticCurveTo(midX, midY, endX, offsetY + (seedC - 0.5) * 2);
            g.lineStyle(0);

            // Lighter grain accent obok (co drugi grain)
            if (gi % 2 === 0) {
                g.lineStyle(0.7, COLORS.woodHighlight, 0.40);
                g.moveTo(startX, offsetY + 1.5);
                g.quadraticCurveTo(midX, midY + 1.5, endX, offsetY + (seedC - 0.5) * 2 + 1.5);
                g.lineStyle(0);
            }
        }

        // 7. Tree rings (słoje — 3 koncentryczne rounded rects)
        g.lineStyle(1.8, COLORS.woodRings, 0.7);
        // Outer ring
        const r1W = SQ_W * 0.72;
        const r1H = SQ_H * 0.72;
        g.drawRoundedRect(-r1W / 2, -r1H / 2, r1W, r1H, 14);
        // Mid ring
        const r2W = SQ_W * 0.52;
        const r2H = SQ_H * 0.52;
        g.drawRoundedRect(-r2W / 2, -r2H / 2, r2W, r2H, 10);
        // Inner ring
        const r3W = SQ_W * 0.30;
        const r3H = SQ_H * 0.30;
        g.drawRoundedRect(-r3W / 2, -r3H / 2, r3W, r3H, 6);
        g.lineStyle(0);

        // 8. Wood center (subtle glow spot — bolt context)
        g.beginFill(COLORS.boltGlowInner, 0.12);
        g.drawCircle(0, 0, 8);
        g.endFill();

        // 9. NW catchlight (sunlit upper-left corner dla 2.5D głębia)
        g.beginFill(0xffffff, 0.22);
        g.drawRoundedRect(
            -SQ_W / 2 + 8,
            -SQ_H / 2 + 6,
            SQ_W * 0.32,
            SQ_H * 0.22,
            10,
        );
        g.endFill();

        // 10. Subtle dark spots (drewniane wypukłości — extra wood detail)
        for (let s = 0; s < 4; s++) {
            const seedX = ((s * 7919 + 41) % 100) / 100 - 0.5;
            const seedY = ((s * 3571 + 17) % 100) / 100 - 0.5;
            const seedR = ((s * 2999) % 100) / 100;
            const sx = seedX * (SQ_W - FRAME_THICKNESS * 2 - 20);
            const sy = seedY * (SQ_H - FRAME_THICKNESS * 2 - 20);
            const sr = 1.2 + seedR * 1.2;
            // Dark knot
            g.beginFill(COLORS.woodGrain, 0.55);
            g.drawCircle(sx, sy, sr);
            g.endFill();
            // Tiny highlight
            g.beginFill(COLORS.woodHighlight, 0.45);
            g.drawCircle(sx - sr * 0.3, sy - sr * 0.3, sr * 0.4);
            g.endFill();
        }

        this.baseContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // BOLT (Brawl Stars 7-point polygon, +30% scale, delikatny pulse)
    // ═══════════════════════════════════════════════════════════
    private drawActiveBolt(): void {
        // Outer glow (rozmyta żółta poświata — większa dla 100×100 pad)
        const glow = new PIXI.Graphics();
        glow.beginFill(COLORS.boltGlowOuter, 0.36);
        glow.drawEllipse(0, 0, 38, 26);
        glow.endFill();
        // Inner brighter core
        glow.beginFill(COLORS.boltGlowInner, 0.28);
        glow.drawEllipse(0, 0, 24, 16);
        glow.endFill();
        this.glowContainer.addChild(glow);

        // Core bolt z chunky cutout, +65% scale
        const bolt = this.createBoltGfx(COLORS.boltMain, true);
        bolt.scale.set(this.boltScale);
        bolt.y = 0;
        this.glowContainer.addChild(bolt);
    }

    private createBoltGfx(color: number, withHighlight: boolean): PIXI.Graphics {
        const g = new PIXI.Graphics();
        // Brawl Stars style — przesadzone ostre kąty
        const points = [
            -4, -12,    // Top left
             8, -12,    // Top right
             2, -2,     // Mid right inset
            12, -2,     // Mid right outer
            -8, 14,     // Bottom spike
            -2,  2,     // Mid left inset
           -10,  2,     // Mid left outer
        ];

        if (withHighlight) {
            // Wycięta dziura w pniu (gruby ciemny zarys zawsze pod spodem)
            g.lineStyle(4, COLORS.barkDark, 1.0);
            g.beginFill(COLORS.barkDark, 1.0);
            g.drawPolygon(points);
            g.endFill();
            g.lineStyle(0);
        }

        // Bolt fill
        g.beginFill(color, 1.0);
        g.drawPolygon(points);
        g.endFill();

        if (withHighlight) {
            // Neon center (gorący środek)
            g.lineStyle(2, COLORS.neonWhite, 0.8);
            g.moveTo(-1, -9); g.lineTo(3, -9);
            g.lineTo(0, -2); g.lineTo(5, -2);
            g.lineTo(-4, 9);
            g.lineStyle(0);
        }

        return g;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — drop-in compat z PowerHoverPad
    // ═══════════════════════════════════════════════════════════
    update(
        playerX: number,
        playerY: number,
        time: number,
    ): PowerPadInteractionResult {
        const now = Date.now();
        const isActive = now >= this.cooldownEnd;
        let activated = false;

        if (isActive) {
            const cx = this.x + PAD_SIZE / 2;
            const cy = this.y + PAD_SIZE / 2;
            const dx = playerX - cx, dy = playerY - cy;
            if (dx * dx + dy * dy < ACTIVATE_RANGE * ACTIVATE_RANGE) {
                activated = true;
                this.cooldownEnd = now + COOLDOWN_MS;
                // Trigger squash animation + spark burst
                this.squashTimer = 0.15;
                for (let i = 0; i < 10; i++) {
                    this.spawnSpark(true);
                }
            }
        }

        this.drawVisuals(isActive, time);

        return {
            activated,
            durationMs: TURBO_DURATION_MS,
            multiplier: TURBO_MULT,
        };
    }

    private drawVisuals(isActive: boolean, time: number): void {
        const now = Date.now();

        // Delta dla particle aging
        const delta = this.lastTime === 0 ? 1 / 60 : Math.min(0.1, time - this.lastTime);
        this.lastTime = time;

        // ── Squash animation (po activation) ──
        if (this.squashTimer > 0) {
            this.squashTimer -= delta;
            this.baseContainer.scale.set(1.0, 0.85);
        } else {
            this.baseContainer.scale.set(1.0, 1.0);
        }

        // ── Active / inactive state switch ──
        if (isActive) {
            this.glowContainer.visible = true;
            this.inactiveBoltGfx.visible = false;
            this.outerGlowGfx.visible = true;

            // v0.38.2: DELIKATNY pulse poświaty (mniejsza amplituda, wolniejszy)
            this.glowContainer.alpha = 0.85 + Math.sin(time * 2.5) * 0.15;

            // Outer halo glow — bardzo delikatne pulsujące świecenie wokół pnia
            // v0.38.5: STRONGER żółty pulsing (Mariusz spec — wyraźnie pulsujący glow)
            this.outerGlowGfx.alpha = 0.65 + Math.sin(time * 2.2) * 0.30;
            this.outerGlowGfx.scale.set(1.0 + Math.sin(time * 1.8) * 0.08);

            // Spawn sparks (rzadziej — delikatniejszy efekt)
            if (Math.random() < 0.05 && this.particles.length < 4) {
                this.spawnSpark(false);
            }
        } else {
            this.glowContainer.visible = false;
            this.outerGlowGfx.visible = false;
            this.inactiveBoltGfx.visible = true;
        }

        // ── Update spark particles ──
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            if (p.life <= 0) {
                this.particlesContainer.removeChild(p.gfx);
                p.gfx.destroy();
                this.particles.splice(i, 1);
                continue;
            }
            // Iskry zygzakiem
            p.gfx.y -= p.speed * delta;
            p.gfx.x = p.baseX + Math.sin(time * 12 + p.phase) * p.driftAmp;
            // Delikatniejsze mruganie (slower strobing)
            p.gfx.alpha = (time * 12) % 2 > 1 ? 0.95 : 0.55;
            if (p.life < 0.4) p.gfx.alpha *= p.life / 0.4;
        }

        // ── Cooldown label ──
        if (!isActive) {
            this.cooldownLabel.visible = true;
            const remaining = Math.ceil((this.cooldownEnd - now) / 1000);
            this.cooldownLabel.text = `⚡ ${remaining}s`;
        } else {
            this.cooldownLabel.visible = false;
        }

        this.wasActive = isActive;
    }

    private spawnSpark(burst: boolean): void {
        const gfx = new PIXI.Graphics();
        gfx.beginFill(COLORS.boltMain, 1.0);
        // Mały prostokąt (iskra)
        gfx.drawRect(0, 0, 2, 4);
        gfx.endFill();

        const pX = (Math.random() - 0.5) * 12;
        const pY = (Math.random() - 0.5) * 10;
        gfx.position.set(pX, pY);
        gfx.rotation = (Math.random() - 0.5) * Math.PI / 4;

        this.particlesContainer.addChild(gfx);

        this.particles.push({
            gfx,
            baseX: pX,
            phase: Math.random() * Math.PI * 2,
            speed: burst ? 75 + Math.random() * 45 : 25 + Math.random() * 15,
            driftAmp: burst ? 10 + Math.random() * 10 : 2 + Math.random() * 3,
            life: burst ? 0.7 + Math.random() * 0.4 : 0.5 + Math.random() * 0.5,
            maxLife: burst ? 0.9 : 0.8,
        });
    }
}