import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RiverNile — Diagonalna rzeka z 2 meandrami przez desert mapę.
 * 
 * Architektura juiciness (v0.17.0):
 *   - 5 warstw wody (sand transition + 4 odcienie wody) z lineStyle stroke wzdłuż bezier path
 *   - Foam (40 sparkles) przy brzegach sand-water
 *   - 3-4 płynące streaky z BLEND_MODES.ADD (water flow illusion)
 *   - 10+ reflexes słońca z twinkle sin animation
 *   - Surface ripples spawn co 1.5-3s (concentric rings expanding)
 *   - Mist: ParticleContainer z 25 floating białych particles drifting up
 *   - Collision: ICollidable[] segments along path z padding +60 (mniejszy niż piramida bo rzeka NIE jest tank-blocker tylko boundary)
 *   - Bridges leave gaps in collision segments (gracz przejedzie po moście)
 * 
 * Path: tablica RiverPathPoint, smoothed quadratic curves dla meandrów.
 */

const PALETTE = {
    sandTransition: 0xdcb878,   // brzeg piaskowy
    waterShallow:   0x5fb8c9,   // płytkie wody (jasny cyan)
    waterMid:       0x2d8a9e,   // główny kolor wody (teal-blue)
    waterDeep:      0x1a5566,   // głęboka woda
    waterDeepest:   0x0d3344,   // najgłębsza
    streakLight:    0xa0e0f0,   // płynące streaky
    sunReflex:      0xffffff,
    sunGlow:        0xfff8c0,
    foamWhite:      0xffffff,
};

export interface RiverPathPoint {
    x: number;
    y: number;
}

export interface BridgeArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface MistParticle {
    sprite: PIXI.Sprite;
    startTime: number;
    lifetime: number;
    driftX: number;
    driftY: number;
}

interface Ripple {
    x: number;
    y: number;
    startTime: number;
    maxRadius: number;
}

interface ReflexSpot {
    x: number;
    y: number;
    phase: number;
    size: number;
}

export class RiverNile {
    private path: RiverPathPoint[];
    private width: number;
    private pathLength: number;
    
    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;
    private gfxFlow: PIXI.Graphics;
    private gfxReflexes: PIXI.Graphics;
    private gfxRipples: PIXI.Graphics;
    private mistContainer: PIXI.Container;
    private mistParticles: MistParticle[];
    
    private collisionSegments: ICollidable[];
    private reflexSpots: ReflexSpot[];
    private rippleSpawnTimer: number;
    private activeRipples: Ripple[];
    
    private static _mistTexture: PIXI.Texture | null = null;
    
    constructor(
        path: RiverPathPoint[],
        width: number,
        bridges: BridgeArea[],
        worldContainer: PIXI.Container
    ) {
        this.path = path;
        this.width = width;
        this.pathLength = this.computePathLength();
        
        // Container — z low zIndex (under buildings, above sand background)
        this.container = new PIXI.Container();
        this.container.zIndex = 50;
        worldContainer.addChild(this.container);
        
        this.gfxStatic = new PIXI.Graphics();
        this.gfxFlow = new PIXI.Graphics();
        this.gfxFlow.blendMode = PIXI.BLEND_MODES.ADD;
        this.gfxReflexes = new PIXI.Graphics();
        this.gfxRipples = new PIXI.Graphics();
        
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxFlow);
        this.container.addChild(this.gfxReflexes);
        this.container.addChild(this.gfxRipples);
        
        this.mistContainer = new PIXI.Container();
        this.container.addChild(this.mistContainer);
        this.mistParticles = [];
        
        // Init reflex spots (rozsiane wzdłuż rzeki)
        this.reflexSpots = [];
        const reflexCount = Math.max(8, Math.floor(this.pathLength / 90));
        for (let i = 0; i < reflexCount; i++) {
            const t = (i + 0.5) / reflexCount;
            const pt = this.getPointAt(t);
            this.reflexSpots.push({
                x: pt.x + (Math.random() - 0.5) * (width * 0.5),
                y: pt.y + (Math.random() - 0.5) * (width * 0.5),
                phase: Math.random() * Math.PI * 2,
                size: 1.8 + Math.random() * 2.5,
            });
        }
        
        this.rippleSpawnTimer = Date.now();
        this.activeRipples = [];
        
        // Generate collision segments (avoid bridges)
        this.collisionSegments = this.buildCollisionSegments(bridges);
        
        // Draw static base
        this.drawWaterBase();
    }
    
    /**
     * Zwraca collision segments do dodania do `buildings` array w main.ts.
     */
    public getCollisionSegments(): ICollidable[] {
        return this.collisionSegments;
    }
    
    private computePathLength(): number {
        let length = 0;
        for (let i = 0; i < this.path.length - 1; i++) {
            const dx = this.path[i + 1].x - this.path[i].x;
            const dy = this.path[i + 1].y - this.path[i].y;
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }
    
    /**
     * Sample point along path at parameter t in [0, 1].
     */
    private getPointAt(t: number): RiverPathPoint {
        const targetDist = this.pathLength * Math.max(0, Math.min(1, t));
        let accDist = 0;
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            const segDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            if (accDist + segDist >= targetDist) {
                const localT = (targetDist - accDist) / segDist;
                return {
                    x: p1.x + (p2.x - p1.x) * localT,
                    y: p1.y + (p2.y - p1.y) * localT,
                };
            }
            accDist += segDist;
        }
        return this.path[this.path.length - 1];
    }
    
    /**
     * Build collision rects along path, omit areas near bridges.
     */
    private buildCollisionSegments(bridges: BridgeArea[]): ICollidable[] {
        const segments: ICollidable[] = [];
        const stepDist = 50;
        const segCount = Math.ceil(this.pathLength / stepDist);
        const hitboxSize = this.width + 60;  // padding mniejszy niż building (rzeka jest "boundary", nie obstacle)
        
        for (let i = 0; i <= segCount; i++) {
            const t = i / segCount;
            const pt = this.getPointAt(t);
            
            // Skip if too close to bridge (gracz przejedzie po moście)
            const blocked = bridges.some(b => 
                Math.abs(b.x - pt.x) < b.width / 2 + 20 &&
                Math.abs(b.y - pt.y) < b.height / 2 + 20
            );
            if (blocked) continue;
            
            segments.push({
                x: pt.x - hitboxSize / 2,
                y: pt.y - hitboxSize / 2,
                w: hitboxSize,
                h: hitboxSize,
                update: () => {},
            });
        }
        
        return segments;
    }
    
    /**
     * Draw smooth path with PIXI lineStyle along bezier-smoothed path.
     */
    private drawSmoothedPath(g: PIXI.Graphics, lineWidth: number, color: number, alpha: number): void {
        g.lineStyle({
            width: lineWidth,
            color: color,
            alpha: alpha,
            cap: PIXI.LINE_CAP.ROUND,
            join: PIXI.LINE_JOIN.ROUND,
        });
        
        g.moveTo(this.path[0].x, this.path[0].y);
        
        // Quadratic curves through midpoints dla smooth meandry
        for (let i = 0; i < this.path.length - 1; i++) {
            if (i === this.path.length - 2) {
                g.lineTo(this.path[i + 1].x, this.path[i + 1].y);
            } else {
                const p1 = this.path[i + 1];
                const p2 = this.path[i + 2];
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                g.quadraticCurveTo(p1.x, p1.y, midX, midY);
            }
        }
    }
    
    /**
     * Statyczna warstwa: 5 warstw wody + foam.
     */
    private drawWaterBase(): void {
        const g = this.gfxStatic;
        
        // Layer 1: sand transition (najszersza, kolor brzegu)
        this.drawSmoothedPath(g, this.width + 60, PALETTE.sandTransition, 0.45);
        // Layer 2: shallow water (cyan)
        this.drawSmoothedPath(g, this.width + 20, PALETTE.waterShallow, 0.85);
        // Layer 3: main water (teal-blue)
        this.drawSmoothedPath(g, this.width, PALETTE.waterMid, 1.0);
        // Layer 4: deep water (darker)
        this.drawSmoothedPath(g, this.width - 30, PALETTE.waterDeep, 0.6);
        // Layer 5: deepest highlight
        this.drawSmoothedPath(g, Math.max(10, this.width - 55), PALETTE.waterDeepest, 0.35);
        
        // Reset line style
        g.lineStyle(0);
        
        // Foam at edges (40 białych sparkles)
        for (let i = 0; i < 40; i++) {
            const t = Math.random();
            const pt = this.getPointAt(t);
            const angle = Math.random() * Math.PI * 2;
            const dist = (this.width / 2) + (Math.random() * 18);
            g.beginFill(PALETTE.foamWhite, 0.55 + Math.random() * 0.3);
            g.drawCircle(
                pt.x + Math.cos(angle) * dist,
                pt.y + Math.sin(angle) * dist,
                0.7 + Math.random() * 1.3
            );
            g.endFill();
        }
    }
    
    /**
     * Per-frame update — flow streaks, reflexes, ripples, mist.
     */
    public update(): void {
        const time = Date.now();
        
        this.drawFlowStreaks(time);
        this.drawReflexes(time);
        this.updateRipples(time);
        this.updateMist(time);
    }
    
    /**
     * Płynące jasne smugi (water flow illusion). 4 streaki w cyklu.
     */
    private drawFlowStreaks(time: number): void {
        const g = this.gfxFlow;
        g.clear();
        
        const streakCount = 4;
        const cycleDuration = 6000;
        const streakLength = 0.12;  // 12% of path length
        
        for (let i = 0; i < streakCount; i++) {
            const offset = i / streakCount;
            const phase = ((time / cycleDuration) + offset) % 1;
            
            const headT = phase;
            const tailT = Math.max(0, phase - streakLength);
            
            // Multiple segments dla smooth streak
            const fadeInOut = Math.sin(phase * Math.PI);
            const alpha = 0.35 * fadeInOut;
            
            g.lineStyle({
                width: 4,
                color: PALETTE.streakLight,
                alpha: alpha,
                cap: PIXI.LINE_CAP.ROUND,
            });
            
            const steps = 5;
            for (let s = 0; s < steps; s++) {
                const t1 = tailT + (headT - tailT) * (s / steps);
                const t2 = tailT + (headT - tailT) * ((s + 1) / steps);
                const p1 = this.getPointAt(t1);
                const p2 = this.getPointAt(t2);
                if (s === 0) g.moveTo(p1.x, p1.y);
                g.lineTo(p2.x, p2.y);
            }
        }
        
        g.lineStyle(0);
    }
    
    /**
     * Reflexes słońca — białe kropki z twinkle.
     */
    private drawReflexes(time: number): void {
        const g = this.gfxReflexes;
        g.clear();
        
        for (const spot of this.reflexSpots) {
            const twinkle = 0.35 + Math.sin(time / 350 + spot.phase) * 0.5;
            const clampedTwinkle = Math.max(0, twinkle);
            
            // Outer soft glow
            g.beginFill(PALETTE.sunGlow, 0.15 * clampedTwinkle);
            g.drawCircle(spot.x, spot.y, spot.size * 2.8);
            g.endFill();
            
            // Mid glow
            g.beginFill(PALETTE.sunGlow, 0.35 * clampedTwinkle);
            g.drawCircle(spot.x, spot.y, spot.size * 1.5);
            g.endFill();
            
            // Bright center
            g.beginFill(PALETTE.sunReflex, 0.9 * clampedTwinkle);
            g.drawCircle(spot.x, spot.y, spot.size);
            g.endFill();
        }
    }
    
    /**
     * Surface ripples — concentric rings spawn random co 1.5-3s.
     */
    private updateRipples(time: number): void {
        const g = this.gfxRipples;
        g.clear();
        
        // Spawn new ripple
        if (time - this.rippleSpawnTimer > 1500 + Math.random() * 1500) {
            this.rippleSpawnTimer = time;
            const t = Math.random();
            const pt = this.getPointAt(t);
            this.activeRipples.push({
                x: pt.x + (Math.random() - 0.5) * (this.width * 0.4),
                y: pt.y + (Math.random() - 0.5) * (this.width * 0.4),
                startTime: time,
                maxRadius: 14 + Math.random() * 12,
            });
        }
        
        // Update + cleanup
        const RIPPLE_DURATION = 2200;
        this.activeRipples = this.activeRipples.filter(r => time - r.startTime < RIPPLE_DURATION);
        
        for (const ripple of this.activeRipples) {
            const age = (time - ripple.startTime) / RIPPLE_DURATION;
            const radius = ripple.maxRadius * age;
            const alpha = (1 - age) * 0.55;
            
            // Outer ring
            g.lineStyle(1.5, PALETTE.foamWhite, alpha);
            g.drawCircle(ripple.x, ripple.y, radius);
            
            // Inner subtle ring (jeśli starsze)
            if (age > 0.3) {
                g.lineStyle(0.8, PALETTE.foamWhite, alpha * 0.7);
                g.drawCircle(ripple.x, ripple.y, radius * 0.6);
            }
        }
        
        g.lineStyle(0);
    }
    
    /**
     * Mgła — ParticleContainer z floating particles drifting up + fade.
     */
    private updateMist(time: number): void {
        const MIST_MAX = 25;
        const MIST_SPAWN_RATE = 0.4;
        const MIST_LIFETIME = 4000;
        
        // Spawn
        if (this.mistParticles.length < MIST_MAX && Math.random() < MIST_SPAWN_RATE) {
            const t = Math.random();
            const pt = this.getPointAt(t);
            const sprite = new PIXI.Sprite(this.getMistTexture());
            sprite.anchor.set(0.5);
            sprite.x = pt.x + (Math.random() - 0.5) * this.width * 0.9;
            sprite.y = pt.y + (Math.random() - 0.5) * this.width * 0.5;
            sprite.alpha = 0;
            sprite.scale.set(0.35 + Math.random() * 0.5);
            this.mistContainer.addChild(sprite);
            this.mistParticles.push({
                sprite,
                startTime: time,
                lifetime: MIST_LIFETIME,
                driftX: (Math.random() - 0.5) * 0.35,
                driftY: -0.45 - Math.random() * 0.35,
            });
        }
        
        // Update + remove dead
        for (let i = this.mistParticles.length - 1; i >= 0; i--) {
            const p = this.mistParticles[i];
            const age = (time - p.startTime) / p.lifetime;
            
            if (age >= 1) {
                this.mistContainer.removeChild(p.sprite);
                p.sprite.destroy();
                this.mistParticles.splice(i, 1);
                continue;
            }
            
            p.sprite.x += p.driftX;
            p.sprite.y += p.driftY;
            
            // Fade in then out
            if (age < 0.25) {
                p.sprite.alpha = (age / 0.25) * 0.55;
            } else {
                p.sprite.alpha = ((1 - age) / 0.75) * 0.55;
            }
        }
    }
    
    private getMistTexture(): PIXI.Texture {
        if (RiverNile._mistTexture) return RiverNile._mistTexture;
        const size = 32;
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext('2d')!;
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,0.7)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        RiverNile._mistTexture = PIXI.Texture.from(cv);
        return RiverNile._mistTexture;
    }
}