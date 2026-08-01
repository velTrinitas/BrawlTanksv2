import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * ArcticBorder — waska granatowo-niebieska zadymka lodowa na krawedziach Arktyki
 * (ARC-R1, wzorzec 1:1: SandstormBorder z pustyni — decyzja Mariusza 2026-08-01).
 *
 * Zastepuje szeroki GlacialBorder (T=130): teraz outer 30px kolizji + inner 55px
 * wizualu => playable rosnie do [40, WORLD-40] (jak pustynia). Kolorystyka:
 * granat/lazur/lodowy blekit + snieznо-lodowe drobiny zamiast piasku.
 *
 * 2 strefy:
 *   - Outer band (30 px) — collision wall, gracz NIE wyjezdza
 *   - Inner band (55 px) — delikatna mrozna mgielka (particles + gradient)
 * Collision: 4 ICollidable AABB (COLLISION_INNER_EDGE=40 — matematyka jak pustynia).
 */

const PALETTE = {
    hazeNavy:       0x1b3a6b,   // granat (glowny akcent — decyzja Mariusza)
    hazeAzure:      0x4a6fa5,   // lazur (gradient inner)
    hazeIce:        0xbcdfec,   // lodowy blekit (jasny akcent)
    particleLight:  0xdfeef4,   // szron
    particleMid:    0x9fc8e8,   // blekit drobin
};

interface IceParticle {
    sprite: PIXI.Sprite;
    baseX: number;
    baseY: number;
    angle: number;
    radius: number;
    rotationSpeed: number;
    driftSpeed: number;
    driftAngle: number;
    phase: number;
}

export class ArcticBorder {
    private worldW: number;
    private worldH: number;
    private outerWidth: number;
    private innerWidth: number;

    private container: PIXI.Container;
    private gfxStaticOverlay: PIXI.Graphics;
    private gfxAnimated: PIXI.Graphics;
    private particlesContainer: PIXI.Container;
    private particles: IceParticle[];

    private collisionRects: ICollidable[];

    private static _particleTexture: PIXI.Texture | null = null;

    constructor(worldW: number, worldH: number, worldContainer: PIXI.Container) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.outerWidth = 30;
        this.innerWidth = 55;

        this.container = new PIXI.Container();
        this.container.zIndex = 250;
        worldContainer.addChild(this.container);

        this.gfxStaticOverlay = new PIXI.Graphics();
        this.container.addChild(this.gfxStaticOverlay);

        this.gfxAnimated = new PIXI.Graphics();
        this.container.addChild(this.gfxAnimated);

        this.particlesContainer = new PIXI.Container();
        this.container.addChild(this.particlesContainer);

        this.particles = [];
        this.spawnParticles();

        this.collisionRects = this.buildCollisionRects();

        this.drawStaticOverlay();
    }

    public getCollisionRects(): ICollidable[] {
        return this.collisionRects;
    }

    /** 4 AABB — outer band. COLLISION_INNER_EDGE=40 (player visual edge ~10px od brzegu). */
    private buildCollisionRects(): ICollidable[] {
        const W = this.worldW;
        const H = this.worldH;
        const OUTER = this.outerWidth;
        const COLLISION_INNER_EDGE = 40;

        return [
            { x: 0, y: -OUTER, w: W, h: OUTER + COLLISION_INNER_EDGE, update: () => {} },                    // TOP
            { x: 0, y: H - COLLISION_INNER_EDGE, w: W, h: OUTER + COLLISION_INNER_EDGE, update: () => {} },  // BOTTOM
            { x: -OUTER, y: 0, w: OUTER + COLLISION_INNER_EDGE, h: H, update: () => {} },                    // LEFT
            { x: W - COLLISION_INNER_EDGE, y: 0, w: OUTER + COLLISION_INNER_EDGE, h: H, update: () => {} },  // RIGHT
        ];
    }

    /** 40 lodowych drobin wzdluz 4 krawedzi (wzorzec sand particles). */
    private spawnParticles(): void {
        const PARTICLE_COUNT = 40;
        const tex = this.getParticleTexture();

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const isCorner = Math.random() < 0.25;
            let baseX: number, baseY: number, driftAngle: number;

            if (isCorner) {
                const cornerIdx = Math.floor(Math.random() * 4);
                const cornerOffset = 5 + Math.random() * (this.innerWidth - 10);
                if (cornerIdx === 0) { baseX = cornerOffset; baseY = cornerOffset; driftAngle = Math.PI / 4; }
                else if (cornerIdx === 1) { baseX = this.worldW - cornerOffset; baseY = cornerOffset; driftAngle = Math.PI * 3 / 4; }
                else if (cornerIdx === 2) { baseX = cornerOffset; baseY = this.worldH - cornerOffset; driftAngle = -Math.PI / 4; }
                else { baseX = this.worldW - cornerOffset; baseY = this.worldH - cornerOffset; driftAngle = -Math.PI * 3 / 4; }
            } else {
                const edgeIdx = Math.floor(Math.random() * 4);
                const along = Math.random();
                const inset = 5 + Math.random() * (this.innerWidth - 10);

                if (edgeIdx === 0) { baseX = along * this.worldW; baseY = inset; driftAngle = Math.random() < 0.5 ? 0 : Math.PI; }
                else if (edgeIdx === 1) { baseX = along * this.worldW; baseY = this.worldH - inset; driftAngle = Math.random() < 0.5 ? 0 : Math.PI; }
                else if (edgeIdx === 2) { baseX = inset; baseY = along * this.worldH; driftAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
                else { baseX = this.worldW - inset; baseY = along * this.worldH; driftAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
            }

            const sprite = new PIXI.Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.x = baseX;
            sprite.y = baseY;
            sprite.scale.set(0.15 + Math.random() * 0.35);
            sprite.alpha = 0.2 + Math.random() * 0.2;
            sprite.tint = Math.random() < 0.6 ? PALETTE.particleLight : PALETTE.particleMid;
            this.particlesContainer.addChild(sprite);

            this.particles.push({
                sprite, baseX, baseY,
                angle: Math.random() * Math.PI * 2,
                radius: 3 + Math.random() * 8,
                rotationSpeed: (Math.random() < 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.006),
                driftSpeed: 0.15 + Math.random() * 0.3,
                driftAngle,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    /** Granatowo-lodowy gradient overlay: granat (glebia) + lodowy akcent. */
    private drawStaticOverlay(): void {
        const g = this.gfxStaticOverlay;
        const W = this.worldW;
        const H = this.worldH;
        const I = this.innerWidth;

        const drawGradientBand = (
            x: number, y: number, w: number, h: number,
            steps: number, fromAlpha: number, toAlpha: number,
            color: number,
        ) => {
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const alpha = fromAlpha + (toAlpha - fromAlpha) * t;
                g.beginFill(color, alpha);
                const isHorizontal = w > h;
                if (isHorizontal) {
                    const sliceH = h / steps;
                    g.drawRect(x, y + i * sliceH, w, sliceH);
                } else {
                    const sliceW = w / steps;
                    g.drawRect(x + i * sliceW, y, sliceW, h);
                }
                g.endFill();
            }
        };

        // Glowny gradient: GRANAT (akcent Mariusza). 6 steps, alpha 0.45 -> 0.
        drawGradientBand(0, 0, W, I, 6, 0.45, 0.0, PALETTE.hazeNavy);          // TOP
        drawGradientBand(0, H - I, W, I, 6, 0.0, 0.45, PALETTE.hazeNavy);      // BOTTOM
        drawGradientBand(0, 0, I, H, 6, 0.45, 0.0, PALETTE.hazeNavy);          // LEFT
        drawGradientBand(W - I, 0, I, H, 6, 0.0, 0.45, PALETTE.hazeNavy);      // RIGHT

        // Lazurowy mid-akcent: 4 steps, alpha 0.22 -> 0
        drawGradientBand(0, 0, W, I, 4, 0.22, 0.0, PALETTE.hazeAzure);
        drawGradientBand(0, H - I, W, I, 4, 0.0, 0.22, PALETTE.hazeAzure);
        drawGradientBand(0, 0, I, H, 4, 0.22, 0.0, PALETTE.hazeAzure);
        drawGradientBand(W - I, 0, I, H, 4, 0.0, 0.22, PALETTE.hazeAzure);

        // Lodowy blekit przy samej krawedzi: 3 steps, alpha 0.18 -> 0
        drawGradientBand(0, 0, W, I * 0.5, 3, 0.18, 0.0, PALETTE.hazeIce);
        drawGradientBand(0, H - I * 0.5, W, I * 0.5, 3, 0.0, 0.18, PALETTE.hazeIce);
        drawGradientBand(0, 0, I * 0.5, H, 3, 0.18, 0.0, PALETTE.hazeIce);
        drawGradientBand(W - I * 0.5, 0, I * 0.5, H, 3, 0.0, 0.18, PALETTE.hazeIce);
    }

    public update(): void {
        const time = Date.now();

        // Delikatne lodowe smugi (jak sand ripples — 4/krawedz)
        const ga = this.gfxAnimated;
        ga.clear();

        const W = this.worldW;
        const H = this.worldH;
        const rippleAlpha = 0.06 + Math.sin(time / 1200) * 0.03;
        ga.lineStyle(1.5, PALETTE.particleLight, rippleAlpha);

        const rippleCount = 4;
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount + (time / 8000)) % 1;
            const x = t * W;
            const y = 15 + Math.sin(time / 600 + i) * 5;
            ga.moveTo(x - 15, y);
            ga.lineTo(x + 15, y);
        }
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount - (time / 8000)) % 1;
            const x = (t < 0 ? t + 1 : t) * W;
            const y = H - 15 - Math.sin(time / 600 + i) * 5;
            ga.moveTo(x - 15, y);
            ga.lineTo(x + 15, y);
        }
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount + (time / 8000)) % 1;
            const x = 15 + Math.sin(time / 600 + i) * 5;
            const y = t * H;
            ga.moveTo(x, y - 15);
            ga.lineTo(x, y + 15);
        }
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount - (time / 8000)) % 1;
            const x = W - 15 - Math.sin(time / 600 + i) * 5;
            const y = (t < 0 ? t + 1 : t) * H;
            ga.moveTo(x, y - 15);
            ga.lineTo(x, y + 15);
        }
        ga.lineStyle(0);

        // Drobiny: swirl + dryf + puls
        for (const p of this.particles) {
            p.angle += p.rotationSpeed;
            const cx = p.baseX + Math.cos(p.angle) * p.radius;
            const cy = p.baseY + Math.sin(p.angle) * p.radius;

            p.baseX += Math.cos(p.driftAngle) * p.driftSpeed;
            p.baseY += Math.sin(p.driftAngle) * p.driftSpeed;

            if (p.baseX < -50) p.baseX = this.worldW + 50;
            if (p.baseX > this.worldW + 50) p.baseX = -50;
            if (p.baseY < -50) p.baseY = this.worldH + 50;
            if (p.baseY > this.worldH + 50) p.baseY = -50;

            p.sprite.x = cx;
            p.sprite.y = cy;

            const pulse = 0.4 + Math.sin(time / 700 + p.phase) * 0.25;
            p.sprite.alpha = pulse * 0.5;
        }
    }

    public destroy(): void {
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        this.particles = [];
    }

    private getParticleTexture(): PIXI.Texture {
        if (ArcticBorder._particleTexture) return ArcticBorder._particleTexture;
        const size = 24;
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext('2d')!;
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(225,240,250,0.5)');   // szron
        grad.addColorStop(0.5, 'rgba(160,200,235,0.25)'); // lodowy blekit
        grad.addColorStop(1, 'rgba(74,111,165,0)');       // lazur -> nic
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        ArcticBorder._particleTexture = PIXI.Texture.from(cv);
        return ArcticBorder._particleTexture;
    }
}
