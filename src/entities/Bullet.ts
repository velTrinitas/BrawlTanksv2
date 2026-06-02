import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';

/**
 * Bullet z per-brawler stats + super-shot mode (v0.5 Etap 2).
 * Zgodne z v4.48 (linia 1985-2000): speedMap, radMap, trailLens per brawler.id.
 */

// Per-brawler base stats (z v4.48 linia 1986-1999)
const SPEED_MAP: Record<string, number> = {
    twardy: 17, heavy: 13, scout: 27, sniper: 29,
    plasma: 17, pyro: 14, shadow: 19, king: 14,
};

const RADIUS_MAP: Record<string, number> = {
    twardy: 6, heavy: 11, scout: 4, sniper: 4,
    plasma: 9, pyro: 10, shadow: 8, king: 10,
};

const TRAIL_LEN_MAP: Record<string, number> = {
    twardy: 10, heavy: 7, scout: 16, sniper: 0,
    plasma: 5, pyro: 10, shadow: 7, king: 5,
};

const COLOR_MAP: Record<string, number> = {
    twardy: 0x2ecc71,
    heavy:  0x8e44ad,
    scout:  0xf1c40f,
    sniper: 0xffffff,
    plasma: 0x00cec9,
    pyro:   0xe74c3c,
    shadow: 0x6c3483,
    king:   0xd35400,
};

// Super-shot multipliers (v4.48 wierność)
const SUPER_DMG_MULT = 3;
const SUPER_RADIUS_MULT = 1.5;
const SUPER_TRAIL_MULT = 1.5;

// Fioletowy tint (Q2🅲️ user choice)
const SUPER_TINT = 0xc850ff;
const SUPER_SPARKLE_EVERY_FRAMES = 5; // co 5 klatek spawnuj sparkle

export class Bullet {
    public x: number;
    public y: number;
    public active: boolean;
    public distance: number;
    public dmg: number;
    public speed: number;
    public radius: number;
    public vx: number;
    public vy: number;
    public gfx: PIXI.Graphics;
    public isSuper: boolean;
    
    private trailLen: number;
    private trail: Array<{ x: number; y: number }> = [];
    private trailGfx: PIXI.Graphics | null = null;
    private brawlerColor: number;
    private sparkleTimer: number = 0;
    
    constructor(
        x: number, y: number, angle: number,
        brawlerInfo: Brawler,
        worldContainer: PIXI.Container,
        isSuper: boolean = false
    ) {
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.isSuper = isSuper;
        
        // Per-brawler base stats
        const baseSpeed = SPEED_MAP[brawlerInfo.id] ?? 15;
        const baseRadius = RADIUS_MAP[brawlerInfo.id] ?? 6;
        const baseTrail = TRAIL_LEN_MAP[brawlerInfo.id] ?? 0;
        
        // Apply super multipliers
        this.dmg = brawlerInfo.dmg * (isSuper ? SUPER_DMG_MULT : 1);
        this.speed = baseSpeed;
        this.radius = baseRadius * (isSuper ? SUPER_RADIUS_MULT : 1);
        this.trailLen = Math.ceil(baseTrail * (isSuper ? SUPER_TRAIL_MULT : 1));
        
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        
        this.brawlerColor = COLOR_MAP[brawlerInfo.id] ?? 0x2ecc71;
        const drawColor = isSuper ? SUPER_TINT : this.brawlerColor;
        
        // Main bullet sprite
        this.gfx = new PIXI.Graphics();
        
        // Outer glow gdy super (fioletowy halo)
        if (isSuper) {
            this.gfx.beginFill(SUPER_TINT, 0.35);
            this.gfx.drawCircle(0, 0, this.radius + 5);
            this.gfx.endFill();
            this.gfx.beginFill(SUPER_TINT, 0.55);
            this.gfx.drawCircle(0, 0, this.radius + 2);
            this.gfx.endFill();
        }
        
        // Core
        this.gfx.beginFill(drawColor);
        this.gfx.drawCircle(0, 0, this.radius);
        this.gfx.endFill();
        
        // Inner highlight (3D look)
        this.gfx.beginFill(0xffffff, isSuper ? 0.8 : 0.6);
        this.gfx.drawCircle(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.35);
        this.gfx.endFill();
        
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.zIndex = this.y + 10;
        worldContainer.addChild(this.gfx);
        
        // Trail (jeśli brawler ma trailLen > 0)
        if (this.trailLen > 0) {
            this.trailGfx = new PIXI.Graphics();
            this.trailGfx.zIndex = this.y + 9; // pod główmym pociskem
            worldContainer.addChild(this.trailGfx);
        }
    }
    
    update(delta: number, buildings: CyberBuilding[], effects: EffectsManager): void {
        if (!this.active) return;
        
        // Zapamiętaj poprzednią pozycję w trail
        if (this.trailLen > 0) {
            this.trail.push({ x: this.x, y: this.y });
            while (this.trail.length > this.trailLen) {
                this.trail.shift();
            }
        }
        
        // Move
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        
        // Wall collision
        for (const b of buildings) {
            if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                effects.spawnWallImpact(this.x, this.y);
                this.destroy();
                return;
            }
        }
        
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.zIndex = this.y + 10;
        
        // Render trail
        if (this.trailGfx && this.trail.length > 0) {
            this.trailGfx.clear();
            const trailColor = this.isSuper ? SUPER_TINT : this.brawlerColor;
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i];
                const alphaProg = (i + 1) / this.trail.length;
                const alpha = alphaProg * 0.6;
                const radius = this.radius * alphaProg * 0.8;
                this.trailGfx.beginFill(trailColor, alpha);
                this.trailGfx.drawCircle(t.x, t.y, radius);
                this.trailGfx.endFill();
            }
        }
        
        // Sparkle trail (Q2🅲️) — co N klatek spawn iskrę gdy super
        if (this.isSuper) {
            this.sparkleTimer += delta;
            if (this.sparkleTimer >= SUPER_SPARKLE_EVERY_FRAMES) {
                this.sparkleTimer = 0;
                effects.spawnEnemyHitSparks(this.x, this.y, SUPER_TINT);
            }
        }
        
        this.distance += this.speed * delta;
        if (this.distance > 1000) this.destroy();
    }
    
    destroy(): void {
        this.active = false;
        if (this.gfx.parent) this.gfx.parent.removeChild(this.gfx);
        this.gfx.destroy();
        if (this.trailGfx) {
            if (this.trailGfx.parent) this.trailGfx.parent.removeChild(this.trailGfx);
            this.trailGfx.destroy();
            this.trailGfx = null;
        }
    }
}