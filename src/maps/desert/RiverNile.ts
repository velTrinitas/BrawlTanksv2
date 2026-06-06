import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RiverNile — Diagonalna rzeka z 2 meandrami przez desert mapę (v0.17.0-fix2).
 * 
 * Zmiany od pierwszej wersji:
 *   - 25-warstwowy smooth gradient (10 color stops) zamiast 5 hard layers — bez "wyraźnego zarysowania"
 *   - 16-punktowy polyline path (zamiast 5+bezier) — gładkie meandry + bridges land precyzyjnie
 *   - getBridgeLayout(count, deckLength, deckWidth) — pozycje + rotacje obliczane z tangentów
 *   - Distance-based collision skip (działa z rotowanymi mostami)
 *   - Collision segments NIE blokują pocisków (osobna tablica `solidBuildings` w main.ts)
 * 
 * Fixy v0.17.0-fix2:
 *   - Skip radius bazowany na deckLength + 80 (było deckWidth + 20) — gracz nie blokowany na moście
 *   - Rozjaśniona paleta z U-shape gradientem (sun-reflex highlight w centrum) — bez czarnego środka
 */

// v0.17.0-fix2: rozjaśniona paleta z U-shape gradientem.
// Max depth = 0x155f7d (medium teal, nie czerń). Środek t=0.92-1.0 = sun-reflex highlight 
// (jaśniejszy niż okolice 0.75-0.85), symulujący odbicie słońca z najgłębszej wody.
const RIVER_PALETTE_STOPS = [
    { t: 0.00, color: 0xdcb878, alpha: 0.40 },   // sand transition (outer halo)
    { t: 0.12, color: 0xcab390, alpha: 0.60 },   // sand fade
    { t: 0.22, color: 0xa5c3b0, alpha: 0.75 },   // sand-water blend (greenish)
    { t: 0.32, color: 0x76c7cf, alpha: 0.90 },   // very shallow (bright light cyan)
    { t: 0.45, color: 0x4bb0c2, alpha: 1.0 },    // shallow water
    { t: 0.58, color: 0x2a92ad, alpha: 1.0 },    // MAIN water (bright teal-blue)
    { t: 0.72, color: 0x1c7693, alpha: 1.0 },    // deeper teal
    { t: 0.84, color: 0x155f7d, alpha: 1.0 },    // mid-deep (NIE granatowy/czerń!)
    { t: 0.92, color: 0x186b8a, alpha: 0.95 },   // pre-highlight (subtle brightening)
    { t: 1.00, color: 0x2789a8, alpha: 0.85 },   // BRIGHT CENTER (sun-reflex highlight)
];

export interface RiverPathPoint {
    x: number;
    y: number;
}

interface BridgeSkipArea {
    x: number;
    y: number;
    deckLength: number;
}

export interface BridgeLayout {
    x: number;
    y: number;
    rotation: number;       // radians, prostopadła do flow rzeki
    deckLength: number;     // X axis = across river
    deckWidth: number;      // Y axis = walking strip (1.25× tank)
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
    private bridgeLayout: BridgeLayout[];
    
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
        bridgeCount: number,
        bridgeDeckLength: number,
        bridgeDeckWidth: number,
        worldContainer: PIXI.Container,
    ) {
        this.path = path;
        this.width = width;
        this.pathLength = this.computePathLength();
        
        // Generate bridge layout (positions + rotations from path tangents)
        this.bridgeLayout = this.computeBridgeLayout(bridgeCount, bridgeDeckLength, bridgeDeckWidth);
        
        // Container, zIndex 50 (under buildings, above sand)
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
        
        // Init reflex spots
        this.reflexSpots = [];
        const reflexCount = Math.max(10, Math.floor(this.pathLength / 80));
        for (let i = 0; i < reflexCount; i++) {
            const t = (i + 0.5) / reflexCount;
            const pt = this.getPointAt(t);
            this.reflexSpots.push({
                x: pt.x + (Math.random() - 0.5) * (width * 0.55),
                y: pt.y + (Math.random() - 0.5) * (width * 0.55),
                phase: Math.random() * Math.PI * 2,
                size: 1.8 + Math.random() * 2.5,
            });
        }
        
        this.rippleSpawnTimer = Date.now();
        this.activeRipples = [];
        
        // Build collision segments (skipping bridge areas)
        // v0.17.0-fix2: skip area używa deckLength (dłuższy wymiar mostu)
        const bridgeSkipAreas: BridgeSkipArea[] = this.bridgeLayout.map(b => ({
            x: b.x, y: b.y, deckLength: b.deckLength,
        }));
        this.collisionSegments = this.buildCollisionSegments(bridgeSkipAreas);
        
        // Draw static water (25-layer smooth gradient + foam)
        this.drawWaterBase();
    }
    
    public getCollisionSegments(): ICollidable[] {
        return this.collisionSegments;
    }
    
    public getBridgeLayout(): BridgeLayout[] {
        return this.bridgeLayout;
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
    
    /** Point along path at parameter t in [0,1] (linear interpolation between polyline vertices). */
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
    
    /** Tangent direction (normalized) at parameter t. */
    private getTangentAt(t: number): { x: number; y: number } {
        const targetDist = this.pathLength * Math.max(0, Math.min(1, t));
        let accDist = 0;
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            const segDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            if (accDist + segDist >= targetDist) {
                return { x: (p2.x - p1.x) / segDist, y: (p2.y - p1.y) / segDist };
            }
            accDist += segDist;
        }
        const last = this.path[this.path.length - 1];
        const prev = this.path[this.path.length - 2];
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return { x: dx / len, y: dy / len };
    }
    
    /** Generate evenly-spaced bridge layout with rotations perpendicular to flow. */
    private computeBridgeLayout(count: number, deckLength: number, deckWidth: number): BridgeLayout[] {
        const result: BridgeLayout[] = [];
        for (let i = 0; i < count; i++) {
            const t = (i + 1) / (count + 1); // evenly spaced, excluding endpoints
            const pt = this.getPointAt(t);
            const tangent = this.getTangentAt(t);
            // Bridge X axis = perpendicular to flow → rotation = tangent angle + π/2
            const rotation = Math.atan2(tangent.y, tangent.x) + Math.PI / 2;
            result.push({
                x: pt.x,
                y: pt.y,
                rotation,
                deckLength,
                deckWidth,
            });
        }
        return result;
    }
    
    /** Collision segments along path, omitting bridge areas (distance-based skip). */
    private buildCollisionSegments(bridges: BridgeSkipArea[]): ICollidable[] {
        const segments: ICollidable[] = [];
        const stepDist = 40;
        const segCount = Math.ceil(this.pathLength / stepDist);
        const hitboxSize = this.width + 60;
        
        for (let i = 0; i <= segCount; i++) {
            const t = i / segCount;
            const pt = this.getPointAt(t);
            
            // v0.17.0-fix2: skip radius oparty na deckLength (dłuższy wymiar mostu) + margines 80.
            // Player na brzegu mostu (deckWidth/2 = 62.5 od centrum) NIE może być w zasięgu
            // river hitbox (140/2 = 70) → potrzebny clearance: 62.5 + 20 (player) + 70 = 152.5.
            // deckLength/2 + 80 = 170 — bezpieczny margin dla rotated bridges przy meandrach.
            const blocked = bridges.some(b => {
                const dx = b.x - pt.x;
                const dy = b.y - pt.y;
                const skipR = b.deckLength / 2 + 80;
                return dx * dx + dy * dy < skipR * skipR;
            });
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
    
    /** Smooth color interpolation between RIVER_PALETTE_STOPS at parameter t in [0,1]. */
    private interpolateColor(t: number): { color: number; alpha: number } {
        const stops = RIVER_PALETTE_STOPS;
        for (let i = 0; i < stops.length - 1; i++) {
            const s1 = stops[i];
            const s2 = stops[i + 1];
            if (t >= s1.t && t <= s2.t) {
                const range = s2.t - s1.t;
                const localT = range === 0 ? 0 : (t - s1.t) / range;
                const r1 = (s1.color >> 16) & 0xff;
                const g1 = (s1.color >> 8) & 0xff;
                const b1 = s1.color & 0xff;
                const r2 = (s2.color >> 16) & 0xff;
                const g2 = (s2.color >> 8) & 0xff;
                const b2 = s2.color & 0xff;
                const r = Math.round(r1 + (r2 - r1) * localT);
                const g = Math.round(g1 + (g2 - g1) * localT);
                const b = Math.round(b1 + (b2 - b1) * localT);
                const alpha = s1.alpha + (s2.alpha - s1.alpha) * localT;
                return { color: (r << 16) | (g << 8) | b, alpha };
            }
        }
        const last = stops[stops.length - 1];
        return { color: last.color, alpha: last.alpha };
    }
    
    /** Draw polyline path (lineTo only, round join) — bridges land precisely on visual path. */
    private drawPolylinePath(g: PIXI.Graphics, lineWidth: number, color: number, alpha: number): void {
        g.lineStyle({
            width: lineWidth,
            color,
            alpha,
            cap: PIXI.LINE_CAP.ROUND,
            join: PIXI.LINE_JOIN.ROUND,
        });
        g.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) {
            g.lineTo(this.path[i].x, this.path[i].y);
        }
    }
    
    /** 25-layer smooth gradient + foam at edges. */
    private drawWaterBase(): void {
        const g = this.gfxStatic;
        
        const layers = 25;
        const outerWidth = this.width + 60;          // 140 dla width=80
        const innerWidth = Math.max(15, this.width - 50);  // 30
        
        for (let i = 0; i < layers; i++) {
            const t = i / (layers - 1);
            const w = outerWidth + (innerWidth - outerWidth) * t;
            const { color, alpha } = this.interpolateColor(t);
            this.drawPolylinePath(g, w, color, alpha);
        }
        
        // Foam — 50 białych iskier przy styku sand-water
        g.lineStyle(0);
        for (let i = 0; i < 50; i++) {
            const t = Math.random();
            const pt = this.getPointAt(t);
            const angle = Math.random() * Math.PI * 2;
            const dist = (this.width / 2) + (Math.random() * 18);
            g.beginFill(0xffffff, 0.55 + Math.random() * 0.3);
            g.drawCircle(
                pt.x + Math.cos(angle) * dist,
                pt.y + Math.sin(angle) * dist,
                0.7 + Math.random() * 1.3,
            );
            g.endFill();
        }
    }
    
    public update(): void {
        const time = Date.now();
        this.drawFlowStreaks(time);
        this.drawReflexes(time);
        this.updateRipples(time);
        this.updateMist(time);
    }
    
    private drawFlowStreaks(time: number): void {
        const g = this.gfxFlow;
        g.clear();
        
        const streakCount = 4;
        const cycleDuration = 6000;
        const streakLength = 0.12;
        
        for (let i = 0; i < streakCount; i++) {
            const offset = i / streakCount;
            const phase = ((time / cycleDuration) + offset) % 1;
            const headT = phase;
            const tailT = Math.max(0, phase - streakLength);
            const fadeInOut = Math.sin(phase * Math.PI);
            const alpha = 0.32 * fadeInOut;
            
            g.lineStyle({
                width: 4,
                color: 0xa0e0f0,
                alpha,
                cap: PIXI.LINE_CAP.ROUND,
            });
            
            const steps = 6;
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
    
    private drawReflexes(time: number): void {
        const g = this.gfxReflexes;
        g.clear();
        
        for (const spot of this.reflexSpots) {
            const twinkle = Math.max(0, 0.35 + Math.sin(time / 350 + spot.phase) * 0.5);
            g.beginFill(0xfff8c0, 0.15 * twinkle);
            g.drawCircle(spot.x, spot.y, spot.size * 2.8);
            g.endFill();
            g.beginFill(0xfff8c0, 0.35 * twinkle);
            g.drawCircle(spot.x, spot.y, spot.size * 1.5);
            g.endFill();
            g.beginFill(0xffffff, 0.9 * twinkle);
            g.drawCircle(spot.x, spot.y, spot.size);
            g.endFill();
        }
    }
    
    private updateRipples(time: number): void {
        const g = this.gfxRipples;
        g.clear();
        
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
        
        const RIPPLE_DURATION = 2200;
        this.activeRipples = this.activeRipples.filter(r => time - r.startTime < RIPPLE_DURATION);
        
        for (const ripple of this.activeRipples) {
            const age = (time - ripple.startTime) / RIPPLE_DURATION;
            const radius = ripple.maxRadius * age;
            const alpha = (1 - age) * 0.55;
            
            g.lineStyle(1.5, 0xffffff, alpha);
            g.drawCircle(ripple.x, ripple.y, radius);
            if (age > 0.3) {
                g.lineStyle(0.8, 0xffffff, alpha * 0.7);
                g.drawCircle(ripple.x, ripple.y, radius * 0.6);
            }
        }
        g.lineStyle(0);
    }
    
    private updateMist(time: number): void {
        const MIST_MAX = 25;
        const MIST_SPAWN_RATE = 0.4;
        const MIST_LIFETIME = 4000;
        
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