import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * SandstormBorder — delikatne beżowo-brązowe zadymki piaskowe na krawędziach mapy.
 * 
 * v0.18.0-fix2: szerokość zredukowana o 70% (outer 90→30, inner 180→55).
 * Kolory rozjaśnione (usunięty ciemny sandDeep), particles mniej + mniejsze + delikatniejsze.
 * 
 * 2 strefy:
 *   - Outer band (30 px) — collision wall, gracz NIE wjeżdża
 *   - Inner band (55 px total) — delikatna mgiełka (jasne particles + subtle gradient)
 * 
 * Collision: 4 ICollidable AABB rects, player visual edge stops ~10 px od brzegu mapy.
 */

const PALETTE = {
    // Beżowo-brązowe (NO dark sandDeep — zbyt dominujący)
    hazeMid:        0xc8a064,   // główny beż
    hazeLight:      0xe0c08c,   // jasny beż (gradient inner)
    hazeBrown:      0x9a7842,   // delikatny brąz (subtle accent)
    particleLight:  0xf0d8a0,
    particleMid:    0xd8b878,
};

interface SandParticle {
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

export class SandstormBorder {
    private worldW: number;
    private worldH: number;
    private outerWidth: number;
    private innerWidth: number;
    
    private container: PIXI.Container;
    private gfxStaticOverlay: PIXI.Graphics;
    private gfxAnimated: PIXI.Graphics;
    private particlesContainer: PIXI.Container;
    private particles: SandParticle[];
    
    private collisionRects: ICollidable[];
    
    private static _particleTexture: PIXI.Texture | null = null;
    
    constructor(
        worldW: number,
        worldH: number,
        worldContainer: PIXI.Container,
    ) {
        this.worldW = worldW;
        this.worldH = worldH;
        // v0.18.0-fix2: 70% mniej (z 90/180 → 30/55) — delikatne zadymki, nie ściana
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
    
    /**
     * 4 AABBs covering outer band.
     * COLLISION_INNER_EDGE = 40 px — player visual edge zatrzymuje się ~10 px od brzegu mapy.
     */
    private buildCollisionRects(): ICollidable[] {
        const W = this.worldW;
        const H = this.worldH;
        const OUTER = this.outerWidth;
        // v0.18.0-fix2: zachowane player visual edge ~10 px od brzegu (math: 40 + 20 radius - 50 tank half = 10)
        const COLLISION_INNER_EDGE = 40;
        
        return [
            { x: 0, y: -OUTER, w: W, h: OUTER + COLLISION_INNER_EDGE, update: () => {} },           // TOP
            { x: 0, y: H - COLLISION_INNER_EDGE, w: W, h: OUTER + COLLISION_INNER_EDGE, update: () => {} },  // BOTTOM
            { x: -OUTER, y: 0, w: OUTER + COLLISION_INNER_EDGE, h: H, update: () => {} },           // LEFT
            { x: W - COLLISION_INNER_EDGE, y: 0, w: OUTER + COLLISION_INNER_EDGE, h: H, update: () => {} }, // RIGHT
        ];
    }
    
    /**
     * 40 sandy particles distributed wzdłuż 4 krawędzi (vs 80 wcześniej).
     * Smaller, lżejsze, mniej dominujące.
     */
    private spawnParticles(): void {
        const PARTICLE_COUNT = 40;
        const tex = this.getParticleTexture();
        
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            // 25% w 4 corners (vs 30% wcześniej), 75% wzdłuż krawędzi
            const isCorner = Math.random() < 0.25;
            let baseX: number, baseY: number, driftAngle: number;
            
            if (isCorner) {
                const cornerIdx = Math.floor(Math.random() * 4);
                // Skala scaledana do mniejszego inner band
                const cornerOffset = 5 + Math.random() * (this.innerWidth - 10);
                if (cornerIdx === 0) {
                    baseX = cornerOffset;
                    baseY = cornerOffset;
                    driftAngle = Math.PI / 4;
                } else if (cornerIdx === 1) {
                    baseX = this.worldW - cornerOffset;
                    baseY = cornerOffset;
                    driftAngle = Math.PI * 3 / 4;
                } else if (cornerIdx === 2) {
                    baseX = cornerOffset;
                    baseY = this.worldH - cornerOffset;
                    driftAngle = -Math.PI / 4;
                } else {
                    baseX = this.worldW - cornerOffset;
                    baseY = this.worldH - cornerOffset;
                    driftAngle = -Math.PI * 3 / 4;
                }
            } else {
                const edgeIdx = Math.floor(Math.random() * 4);
                const along = Math.random();
                // Inset: 5 do innerWidth-5 (czyli 5-50 dla innerWidth=55)
                const inset = 5 + Math.random() * (this.innerWidth - 10);
                
                if (edgeIdx === 0) {  // TOP
                    baseX = along * this.worldW;
                    baseY = inset;
                    driftAngle = Math.random() < 0.5 ? 0 : Math.PI;
                } else if (edgeIdx === 1) {  // BOTTOM
                    baseX = along * this.worldW;
                    baseY = this.worldH - inset;
                    driftAngle = Math.random() < 0.5 ? 0 : Math.PI;
                } else if (edgeIdx === 2) {  // LEFT
                    baseX = inset;
                    baseY = along * this.worldH;
                    driftAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
                } else {  // RIGHT
                    baseX = this.worldW - inset;
                    baseY = along * this.worldH;
                    driftAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
                }
            }
            
            const sprite = new PIXI.Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.x = baseX;
            sprite.y = baseY;
            // Mniejszy scale: 0.15-0.5 (vs 0.3-1.0)
            sprite.scale.set(0.15 + Math.random() * 0.35);
            // Lower alpha: 0.2-0.4 (vs 0.35-0.7)
            sprite.alpha = 0.2 + Math.random() * 0.2;
            // Lżejszy tint — szansa na lighter
            sprite.tint = Math.random() < 0.6 ? PALETTE.particleLight : PALETTE.particleMid;
            this.particlesContainer.addChild(sprite);
            
            this.particles.push({
                sprite,
                baseX,
                baseY,
                angle: Math.random() * Math.PI * 2,
                // Mniejszy radius: 3-11 (vs 8-26)
                radius: 3 + Math.random() * 8,
                rotationSpeed: (Math.random() < 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.006),
                driftSpeed: 0.15 + Math.random() * 0.3,
                driftAngle,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }
    
    /**
     * Subtle beżowo-brązowy gradient overlay — 6 step bands (vs 12).
     * Lower alpha (0.5 fromAlpha vs 0.85), lżejszy kolor hazeMid (vs ciemny sandDeep).
     */
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
        
        // Main gradient: hazeMid (jasny brąz, nie ciemny). 6 steps, alpha 0.5 → 0.
        drawGradientBand(0, 0, W, I, 6, 0.5, 0.0, PALETTE.hazeMid);          // TOP
        drawGradientBand(0, H - I, W, I, 6, 0.0, 0.5, PALETTE.hazeMid);      // BOTTOM
        drawGradientBand(0, 0, I, H, 6, 0.5, 0.0, PALETTE.hazeMid);          // LEFT
        drawGradientBand(W - I, 0, I, H, 6, 0.0, 0.5, PALETTE.hazeMid);      // RIGHT
        
        // Subtle warm accent (jasny beż): 4 steps, alpha 0.25 → 0
        drawGradientBand(0, 0, W, I, 4, 0.25, 0.0, PALETTE.hazeLight);        // TOP
        drawGradientBand(0, H - I, W, I, 4, 0.0, 0.25, PALETTE.hazeLight);    // BOTTOM
        drawGradientBand(0, 0, I, H, 4, 0.25, 0.0, PALETTE.hazeLight);        // LEFT
        drawGradientBand(W - I, 0, I, H, 4, 0.0, 0.25, PALETTE.hazeLight);    // RIGHT
    }
    
    public update(): void {
        const time = Date.now();
        
        // Reduced edge ripples (4 vs 8 per side), lower alpha
        const ga = this.gfxAnimated;
        ga.clear();
        
        const W = this.worldW;
        const H = this.worldH;
        // Lżejszy ripple: 0.06 base (vs 0.12)
        const rippleAlpha = 0.06 + Math.sin(time / 1200) * 0.03;
        ga.lineStyle(1.5, PALETTE.particleLight, rippleAlpha);
        
        const rippleCount = 4;
        // TOP
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount + (time / 8000)) % 1;
            const x = t * W;
            const y = 15 + Math.sin(time / 600 + i) * 5;
            ga.moveTo(x - 15, y);
            ga.lineTo(x + 15, y);
        }
        // BOTTOM
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount - (time / 8000)) % 1;
            const x = (t < 0 ? t + 1 : t) * W;
            const y = H - 15 - Math.sin(time / 600 + i) * 5;
            ga.moveTo(x - 15, y);
            ga.lineTo(x + 15, y);
        }
        // LEFT
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount + (time / 8000)) % 1;
            const x = 15 + Math.sin(time / 600 + i) * 5;
            const y = t * H;
            ga.moveTo(x, y - 15);
            ga.lineTo(x, y + 15);
        }
        // RIGHT
        for (let i = 0; i < rippleCount; i++) {
            const t = (i / rippleCount - (time / 8000)) % 1;
            const x = W - 15 - Math.sin(time / 600 + i) * 5;
            const y = (t < 0 ? t + 1 : t) * H;
            ga.moveTo(x, y - 15);
            ga.lineTo(x, y + 15);
        }
        ga.lineStyle(0);
        
        // Update particles (swirl + drift + opacity pulse)
        for (const p of this.particles) {
            p.angle += p.rotationSpeed;
            const cx = p.baseX + Math.cos(p.angle) * p.radius;
            const cy = p.baseY + Math.sin(p.angle) * p.radius;
            
            p.baseX += Math.cos(p.driftAngle) * p.driftSpeed;
            p.baseY += Math.sin(p.driftAngle) * p.driftSpeed;
            
            // Wrap around edges
            if (p.baseX < -50) p.baseX = this.worldW + 50;
            if (p.baseX > this.worldW + 50) p.baseX = -50;
            if (p.baseY < -50) p.baseY = this.worldH + 50;
            if (p.baseY > this.worldH + 50) p.baseY = -50;
            
            p.sprite.x = cx;
            p.sprite.y = cy;
            
            // Opacity pulse — lżejsza
            const pulse = 0.4 + Math.sin(time / 700 + p.phase) * 0.25;
            p.sprite.alpha = pulse * 0.5;  // mniej dominujące (0.5 multiplier vs 0.7)
        }
    }
    
    private getParticleTexture(): PIXI.Texture {
        if (SandstormBorder._particleTexture) return SandstormBorder._particleTexture;
        const size = 24;
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext('2d')!;
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        // Lżejsze: 0.7 → 0.5 inner, jaśniejszy beż outer
        grad.addColorStop(0, 'rgba(255,230,180,0.5)');
        grad.addColorStop(0.5, 'rgba(220,180,120,0.25)');
        grad.addColorStop(1, 'rgba(180,140,80,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        SandstormBorder._particleTexture = PIXI.Texture.from(cv);
        return SandstormBorder._particleTexture;
    }
}