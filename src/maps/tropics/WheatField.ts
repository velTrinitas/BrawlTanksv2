import * as PIXI from 'pixi.js';

/**
 * v0.26.0 FAZA T2 — WHEAT FIELD v2 PREMIUM
 *
 * Brawl Stars-style stealth zone: nieregularny chmurkowy ksztalt
 * (NIE elipsa!) z grubym outline, warstwowym gradientem, gestoscia
 * klosow, drop shadow, internal vignette i floating particles.
 *
 * Mechanika: gracz wjezdza -> 10s stealth (analog Oasis API).
 * No collision. isPointInside() uzywa elliptycznego boundingu (rX, rY)
 * dla spojnosci z Oasis — visual blob naturalne "wystaje" za stealth
 * boundary ale to vibe a nie bug.
 *
 * Layer stack (zIndex w baseContainer):
 *   1.  Drop shadow (large soft blob offset SE, 3 nested dla fake blur)
 *   2.  Tilled ground patch (irregular dark brown soil + specks)
 *   3.  Field body gradient (4 alpha-layered fills)
 *   4.  Thick cartoon outline (4px #4a2818) + inner highlight line
 *   5.  Internal SE vignette (depth)
 *   6.  Static back-row stubs (~60-100 painted into ONE Graphics)
 *   7.  Static mid-row blades (~120-200 painted into ONE Graphics)
 *   8.  Animated HERO blades (25 individual gfx with sway rotation)
 *   9.  Floating wheat particles (10 drift animation)
 *
 * Performance: ~7 PIXI.Graphics static + 25 hero gfx + 10 particles per field.
 * 5 pol = ~210 PIXI objects total. Static painted in single passes.
 */

// ───────────────────────────────────────────────────────────────
// PREMIUM COLOR PALETTE (Brawl Stars style)
// ───────────────────────────────────────────────────────────────
const COLORS = {
    outline:        0x4a2818,
    dropShadow:     0x000000,
    groundSoil:     0x6a4a20,
    groundSoilDark: 0x4a3010,
    bodyTopLight:   0xf4d460,
    bodyMid:        0xd4b830,
    bodyDark:       0x8a5810,
    bladeLightest:  0xfff0a0,
    bladeLight:     0xf4d460,
    bladeMid:       0xe8c440,
    bladeDark:      0xb88820,
    bladeDarkest:   0x8a5810,
    grainCrown:     0xf8e890,
    particle:       0xfff5b0,
};

const OUTLINE_W = 4;

interface HeroBlade {
    gfx: PIXI.Graphics;
    phase: number;
    swayAmount: number;
    swaySpeed: number;
}

interface FloatParticle {
    gfx: PIXI.Graphics;
    baseX: number;
    baseY: number;
    phase: number;
    driftAmp: number;
}

export class WheatField {
    public readonly visualX: number;
    public readonly visualY: number;
    public readonly rX: number;
    public readonly rY: number;

    private baseContainer: PIXI.Container;
    private heroBlades: HeroBlade[] = [];
    private particles: FloatParticle[] = [];
    private blobPath: Array<{ x: number; y: number }>;
    private time: number = 0;

    constructor(
        x: number, y: number,
        rX: number, rY: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.visualX = x;
        this.visualY = y;
        this.rX = rX;
        this.rY = rY;

        const rng = makeRng(seed);

        // 14 control points wokol centrum, variance 0.85-1.05
        this.blobPath = generateBlobPath(rng, rX, rY, 14);

        this.baseContainer = new PIXI.Container();
        this.baseContainer.x = x;
        this.baseContainer.y = y;
        this.baseContainer.zIndex = -50;
        this.baseContainer.sortableChildren = true;
        worldContainer.addChild(this.baseContainer);

        this.drawDropShadow();
        this.drawGroundPatch(rng);
        this.drawBodyGradient();
        this.drawOutline();
        this.drawInternalVignette();
        this.drawStaticBackStubs(rng);
        this.drawStaticMidBlades(rng);
        this.spawnHeroBlades(rng);
        this.spawnParticles(rng);
    }

    private drawDropShadow(): void {
        const shadow = new PIXI.Graphics();
        shadow.zIndex = 1;
        const offsets = [
            { dx: 10, dy: 12, scale: 1.10, alpha: 0.12 },
            { dx: 8,  dy: 10, scale: 1.05, alpha: 0.18 },
            { dx: 6,  dy: 8,  scale: 1.00, alpha: 0.25 },
        ];
        for (const o of offsets) {
            shadow.beginFill(COLORS.dropShadow, o.alpha);
            drawSmoothBlobPath(shadow, scalePath(this.blobPath, o.scale), o.dx, o.dy);
            shadow.endFill();
        }
        this.baseContainer.addChild(shadow);
    }

    private drawGroundPatch(rng: () => number): void {
        const ground = new PIXI.Graphics();
        ground.zIndex = 2;
        ground.beginFill(COLORS.groundSoilDark, 0.40);
        drawSmoothBlobPath(ground, scalePath(this.blobPath, 1.02));
        ground.endFill();
        ground.beginFill(COLORS.groundSoil, 0.85);
        drawSmoothBlobPath(ground, scalePath(this.blobPath, 0.95));
        ground.endFill();
        ground.beginFill(COLORS.groundSoilDark, 0.55);
        drawSmoothBlobPath(ground, scalePath(this.blobPath, 0.72));
        ground.endFill();
        // Soil specks
        for (let i = 0; i < 30; i++) {
            const ang = rng() * Math.PI * 2;
            const r = rng() * 0.85;
            ground.beginFill(COLORS.groundSoilDark, 0.6);
            ground.drawCircle(Math.cos(ang) * this.rX * r, Math.sin(ang) * this.rY * r, 1 + rng() * 1.5);
            ground.endFill();
        }
        this.baseContainer.addChild(ground);
    }

    private drawBodyGradient(): void {
        const body = new PIXI.Graphics();
        body.zIndex = 3;
        body.beginFill(COLORS.bodyTopLight, 0.30);
        drawSmoothBlobPath(body, scalePath(this.blobPath, 0.98), -2, -2);
        body.endFill();
        body.beginFill(COLORS.bodyMid, 0.92);
        drawSmoothBlobPath(body, scalePath(this.blobPath, 0.94));
        body.endFill();
        body.beginFill(COLORS.bodyDark, 0.45);
        drawSmoothBlobPath(body, scalePath(this.blobPath, 0.78), 4, 4);
        body.endFill();
        body.beginFill(COLORS.bodyTopLight, 0.40);
        drawSmoothBlobPath(body, scalePath(this.blobPath, 0.50), -this.rX * 0.18, -this.rY * 0.18);
        body.endFill();
        this.baseContainer.addChild(body);
    }

    private drawOutline(): void {
        const outline = new PIXI.Graphics();
        outline.zIndex = 4;
        outline.lineStyle(OUTLINE_W, COLORS.outline, 1.0);
        drawSmoothBlobPath(outline, this.blobPath);
        outline.lineStyle(1.5, COLORS.bladeLight, 0.40);
        drawSmoothBlobPath(outline, scalePath(this.blobPath, 0.97));
        this.baseContainer.addChild(outline);
    }

    private drawInternalVignette(): void {
        const vig = new PIXI.Graphics();
        vig.zIndex = 5;
        vig.beginFill(COLORS.outline, 0.18);
        drawSmoothBlobPath(vig, scalePath(this.blobPath, 0.93));
        vig.endFill();
        vig.beginFill(COLORS.bodyMid, 0.18);
        drawSmoothBlobPath(vig, scalePath(this.blobPath, 0.75));
        vig.endFill();
        this.baseContainer.addChild(vig);
    }

    private drawStaticBackStubs(rng: () => number): void {
        const stubs = new PIXI.Graphics();
        stubs.zIndex = 6;
        const area = Math.PI * this.rX * this.rY;
        const stubCount = Math.max(60, Math.floor(area / 90));
        for (let i = 0; i < stubCount; i++) {
            let bx = 0, by = 0;
            for (let k = 0; k < 6; k++) {
                const ux = rng() * 2 - 1;
                const uy = rng() * 2 - 1;
                if (ux * ux + uy * uy <= 0.85) {
                    bx = ux * this.rX * 0.90;
                    by = uy * this.rY * 0.90;
                    break;
                }
            }
            const h = 5 + rng() * 5;
            const tilt = (rng() - 0.5) * 0.3;
            const color = rng() < 0.5 ? COLORS.bladeDark : COLORS.bladeDarkest;
            stubs.lineStyle(1.5, color, 0.85);
            stubs.moveTo(bx, by);
            stubs.lineTo(bx + Math.sin(tilt) * h, by - Math.cos(tilt) * h);
        }
        this.baseContainer.addChild(stubs);
    }

    private drawStaticMidBlades(rng: () => number): void {
        const mids = new PIXI.Graphics();
        mids.zIndex = 7;
        const area = Math.PI * this.rX * this.rY;
        const bladeCount = Math.max(120, Math.floor(area / 55));
        const midColors = [COLORS.bladeMid, COLORS.bladeLight, COLORS.bladeDark, COLORS.bladeLightest];

        for (let i = 0; i < bladeCount; i++) {
            let bx = 0, by = 0;
            for (let k = 0; k < 6; k++) {
                const ux = rng() * 2 - 1;
                const uy = rng() * 2 - 1;
                if (ux * ux + uy * uy <= 0.85) {
                    bx = ux * this.rX * 0.92;
                    by = uy * this.rY * 0.92;
                    break;
                }
            }
            const h = 10 + rng() * 6;
            const tilt = (rng() - 0.5) * 0.4;
            const color = midColors[Math.floor(rng() * midColors.length)];

            mids.lineStyle(2, color, 0.95);
            const tipX = bx + Math.sin(tilt) * h;
            const tipY = by - Math.cos(tilt) * h;
            mids.moveTo(bx, by);
            mids.lineTo(tipX, tipY);

            mids.lineStyle(0);
            mids.beginFill(color, 1.0);
            mids.drawEllipse(tipX - 1.4, tipY + 1, 1.6, 2.2);
            mids.drawEllipse(tipX,       tipY - 1, 1.6, 2.2);
            mids.drawEllipse(tipX + 1.4, tipY + 1, 1.6, 2.2);
            mids.endFill();

            if (rng() < 0.5) {
                mids.beginFill(COLORS.bladeLightest, 0.6);
                mids.drawCircle(tipX, tipY - 2, 0.9);
                mids.endFill();
            }
        }
        this.baseContainer.addChild(mids);
    }

    private spawnHeroBlades(rng: () => number): void {
        const HERO_COUNT = 25;
        const minSpacingSq = 12 * 12;
        let placed = 0, attempts = 0;

        while (placed < HERO_COUNT && attempts < HERO_COUNT * 6) {
            attempts++;
            const ux = rng() * 2 - 1;
            const uy = rng() * 2 - 1;
            if (ux * ux + uy * uy > 0.80) continue;

            const bx = ux * this.rX * 0.88;
            const by = uy * this.rY * 0.88;

            let tooClose = false;
            for (const b of this.heroBlades) {
                const dx = bx - b.gfx.x;
                const dy = by - b.gfx.y;
                if (dx * dx + dy * dy < minSpacingSq) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const h = 18 + rng() * 7;
            const color = COLORS.bladeLight;

            const gfx = new PIXI.Graphics();
            gfx.x = bx;
            gfx.y = by;
            gfx.zIndex = Math.floor(by + 2000);

            gfx.lineStyle(2.5, color, 1.0);
            gfx.moveTo(0, 0);
            gfx.lineTo(0, -h);
            gfx.lineStyle(1.3, COLORS.bladeDarkest, 0.65);
            gfx.moveTo(1.2, 0);
            gfx.lineTo(1.2, -h + 2);

            // 5-grain crown
            gfx.lineStyle(0);
            gfx.beginFill(color, 1.0);
            gfx.drawEllipse(-2,   -h + 1, 1.9, 2.7);
            gfx.drawEllipse(-1,   -h - 2, 1.9, 2.7);
            gfx.drawEllipse(0,    -h - 4, 1.9, 2.7);
            gfx.drawEllipse(1,    -h - 2, 1.9, 2.7);
            gfx.drawEllipse(2,    -h + 1, 1.9, 2.7);
            gfx.endFill();

            gfx.beginFill(COLORS.bladeLightest, 0.9);
            gfx.drawEllipse(0, -h - 5, 1.2, 1.6);
            gfx.endFill();

            // Subtle dark outline along stem (cartoon definition)
            gfx.lineStyle(0.8, COLORS.outline, 0.7);
            gfx.moveTo(0, 0);
            gfx.lineTo(0, -h);

            this.baseContainer.addChild(gfx);
            this.heroBlades.push({
                gfx,
                phase: rng() * Math.PI * 2,
                swayAmount: 0.08 + rng() * 0.10,
                swaySpeed: 1.1 + rng() * 0.7,
            });
            placed++;
        }
    }

    private spawnParticles(rng: () => number): void {
        for (let i = 0; i < 10; i++) {
            const ux = rng() * 2 - 1;
            const uy = rng() * 2 - 1;
            const bx = ux * this.rX * 0.70;
            const by = uy * this.rY * 0.70;

            const gfx = new PIXI.Graphics();
            gfx.x = bx;
            gfx.y = by;
            gfx.zIndex = 9999;

            gfx.beginFill(COLORS.particle, 0.85);
            gfx.drawEllipse(0, 0, 1.6, 2.4);
            gfx.endFill();
            gfx.beginFill(0xffffff, 0.7);
            gfx.drawCircle(-0.4, -0.6, 0.5);
            gfx.endFill();

            this.baseContainer.addChild(gfx);
            this.particles.push({
                gfx,
                baseX: bx,
                baseY: by,
                phase: rng() * Math.PI * 2,
                driftAmp: 8 + rng() * 8,
            });
        }
    }

    public update(): void {
        this.time += 1 / 60;

        // Hero blades sway
        for (const b of this.heroBlades) {
            b.gfx.rotation = Math.sin(this.time * b.swaySpeed + b.phase) * b.swayAmount;
        }

        // Particles: float up + lateral drift + alpha pulse (3s cycle)
        for (const p of this.particles) {
            const cyclePhase = ((this.time * 0.33) + p.phase / (Math.PI * 2)) % 1.0;
            p.gfx.y = p.baseY - cyclePhase * 30;
            p.gfx.x = p.baseX + Math.sin(cyclePhase * Math.PI * 2 + p.phase) * (p.driftAmp / 2);
            let alpha = 0.9;
            if (cyclePhase < 0.2) alpha = (cyclePhase / 0.2) * 0.9;
            else if (cyclePhase > 0.7) alpha = ((1.0 - cyclePhase) / 0.3) * 0.9;
            p.gfx.alpha = alpha;
        }

        // Subtle container wobble for global wind effect
        this.baseContainer.x = this.visualX + Math.sin(this.time * 0.6) * 0.4;
        this.baseContainer.y = this.visualY + Math.cos(this.time * 0.5) * 0.3;
    }

    public isPointInside(px: number, py: number): boolean {
        const dx = px - this.visualX;
        const dy = py - this.visualY;
        return (dx * dx) / (this.rX * this.rX) + (dy * dy) / (this.rY * this.rY) <= 1.0;
    }
}

// ───────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────

function generateBlobPath(rng: () => number, rX: number, rY: number, segments: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const variance = 0.85 + rng() * 0.20;
        points.push({
            x: Math.cos(angle) * rX * variance,
            y: Math.sin(angle) * rY * variance,
        });
    }
    return points;
}

function drawSmoothBlobPath(
    gfx: PIXI.Graphics,
    points: Array<{ x: number; y: number }>,
    offsetX: number = 0,
    offsetY: number = 0,
): void {
    const n = points.length;
    if (n < 3) return;
    const mid0X = (points[0].x + points[n - 1].x) / 2 + offsetX;
    const mid0Y = (points[0].y + points[n - 1].y) / 2 + offsetY;
    gfx.moveTo(mid0X, mid0Y);
    for (let i = 0; i < n; i++) {
        const curr = points[i];
        const next = points[(i + 1) % n];
        const midX = (curr.x + next.x) / 2 + offsetX;
        const midY = (curr.y + next.y) / 2 + offsetY;
        gfx.quadraticCurveTo(curr.x + offsetX, curr.y + offsetY, midX, midY);
    }
    gfx.closePath();
}

function scalePath(points: Array<{ x: number; y: number }>, scale: number): Array<{ x: number; y: number }> {
    return points.map(p => ({ x: p.x * scale, y: p.y * scale }));
}

function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}