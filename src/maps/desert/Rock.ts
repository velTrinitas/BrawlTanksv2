import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * Rock — Skała pustynna z 2 tiers (v0.18.0 FAZA 4a).
 * 
 * - 'large': pełna collision (ruch + pociski), 7 manual fixed positions, 70-100px
 * - 'small': BRAK collision, decoracja, 30-35 procedural random spawn, 15-35px
 * 
 * Visual: 8-sided irregular polygon z seed, 3-layer depth (shadow/body/highlight).
 * Large dodatkowo: cracks, moss patches, erosion marks.
 */

const PALETTE = {
    rockBase:    0x9a7548,
    rockLight:   0xb89066,
    rockShadow:  0x6a4a28,
    rockDeep:    0x4a3018,
    crackDark:   0x2a1810,
    mossGreen:   0x5a7838,
    sandyEdge:   0xbca088,
};

export type RockTier = 'small' | 'large';

export class Rock implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    
    public visualX: number;  // public dla distance checks w main.ts
    public visualY: number;
    private size: number;
    private seed: number;
    private tier: RockTier;
    
    private container: PIXI.Container;
    
    constructor(
        x: number,
        y: number,
        size: number,
        tier: RockTier,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.visualX = x;
        this.visualY = y;
        this.size = size;
        this.seed = seed;
        this.tier = tier;
        
        // Hitbox: large = collision, small = 0 (effectively no collision)
        if (tier === 'large') {
            const hitboxSize = size + 60;  // padding mniejszy niż piramida (skała okrągła)
            this.x = x - hitboxSize / 2;
            this.y = y - hitboxSize / 2;
            this.w = hitboxSize;
            this.h = hitboxSize;
        } else {
            this.x = x;
            this.y = y;
            this.w = 0;
            this.h = 0;
        }
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // Large rock: above small rocks/tracks; Small rock: low priority
        // v0.18.0-fix: small rocks zawsze pod player (zIndex 4 stałe, niezależne od y).
        // Large rocks Y-based dla naturalnego sortowania względem player/wrogów.
        this.container.zIndex = tier === 'large' ? y + 8 : 4;
        worldContainer.addChild(this.container);
        
        this.draw();
    }
    
    private draw(): void {
        const g = new PIXI.Graphics();
        this.container.addChild(g);
        
        const s = this.size;
        const hS = s / 2;
        const rot = (this.seed * 0.37) % (Math.PI * 2);
        
        // Cień rzucany na piasek (SE)
        g.beginFill(0x000000, 0.35);
        g.drawEllipse(hS * 0.3, hS * 0.45, hS * 1.05, hS * 0.7);
        g.endFill();
        
        // Sandy edge wokół podstawy
        g.beginFill(PALETTE.sandyEdge, 0.45);
        g.drawEllipse(0, hS * 0.15, hS * 1.15, hS * 0.85);
        g.endFill();
        
        // Generate irregular polygon shape (8 vertices z noise z seed)
        const verts = 8;
        const points: number[] = [];
        for (let i = 0; i < verts; i++) {
            const a = (i / verts) * Math.PI * 2 + rot;
            const noise = Math.sin(i * 1.7 + this.seed) * 0.15;
            const rad = hS * (0.85 + noise);
            points.push(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        
        // Cień bryły (3D feel, offset SE)
        g.beginFill(PALETTE.rockShadow);
        const shadowPoints = points.map(v => v + 3);
        g.drawPolygon(shadowPoints);
        g.endFill();
        
        // Main body
        g.beginFill(PALETTE.rockBase);
        g.drawPolygon(points);
        g.endFill();
        
        // Sunlit highlight (NW) — mniejszy polygon zakrywający NW część skały
        g.beginFill(PALETTE.rockLight, 0.65);
        const hlVerts = 6;
        const hlPoints: number[] = [];
        for (let i = 0; i < hlVerts; i++) {
            const a = Math.PI + (i / (hlVerts - 1)) * Math.PI * 0.85 + rot;
            const rad = hS * 0.62;
            hlPoints.push(
                Math.cos(a) * rad - hS * 0.08,
                Math.sin(a) * rad - hS * 0.08,
            );
        }
        g.drawPolygon(hlPoints);
        g.endFill();
        
        if (this.tier === 'large') {
            // Cracks (pęknięcia)
            g.lineStyle(1.8, PALETTE.crackDark, 0.7);
            g.moveTo(-hS * 0.4, -hS * 0.3);
            g.lineTo(-hS * 0.15, hS * 0.1);
            g.lineTo(hS * 0.1, hS * 0.4);
            g.moveTo(hS * 0.2, -hS * 0.5);
            g.lineTo(hS * 0.45, -hS * 0.1);
            g.lineStyle(0);
            
            // Moss patches (zielony mech na top NW)
            g.beginFill(PALETTE.mossGreen, 0.7);
            g.drawEllipse(-hS * 0.3, -hS * 0.42, hS * 0.2, hS * 0.09);
            g.drawEllipse(hS * 0.12, -hS * 0.5, hS * 0.13, hS * 0.07);
            g.endFill();
            
            // Moss dots (smaller scattered)
            g.beginFill(PALETTE.mossGreen, 0.5);
            for (let i = 0; i < 4; i++) {
                const a = -Math.PI / 2 + (i - 1.5) * 0.35 + rot;
                const rad = hS * 0.35;
                g.drawCircle(Math.cos(a) * rad, Math.sin(a) * rad, 1.5);
            }
            g.endFill();
            
            // Erosion marks (rough dots na main body)
            g.beginFill(PALETTE.rockDeep, 0.5);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + this.seed;
                const rad = hS * (0.3 + ((i * 13 + this.seed) % 10) / 30);
                g.drawCircle(Math.cos(a) * rad, Math.sin(a) * rad, 0.8 + ((i + this.seed) % 3) * 0.4);
            }
            g.endFill();
        } else {
            // Small rock — tylko centralny ciemny dot dla detail
            g.beginFill(PALETTE.rockDeep, 0.55);
            g.drawCircle(0, 0, hS * 0.22);
            g.endFill();
            
            // Subtle moss dot na top (15% chance based on seed)
            if ((this.seed % 7) < 1) {
                g.beginFill(PALETTE.mossGreen, 0.5);
                g.drawCircle(-hS * 0.2, -hS * 0.25, 1.2);
                g.endFill();
            }
        }
    }
    
    update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        // Static — no per-frame updates.
    }
}