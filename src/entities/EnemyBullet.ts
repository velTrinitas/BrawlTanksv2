import * as PIXI from 'pixi.js';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';

export class EnemyBullet {
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
    
    constructor(
        x: number, y: number, angle: number,
        speed: number, dmg: number, color: number,
        worldContainer: PIXI.Container
    ) {
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.dmg = dmg;
        this.speed = speed;
        this.radius = 5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(color);
        this.gfx.drawCircle(0, 0, this.radius);
        this.gfx.endFill();
        // Subtle outline żeby był widoczny na czarnym tle
        this.gfx.lineStyle(1.5, 0x000000, 0.6);
        this.gfx.drawCircle(0, 0, this.radius);
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.zIndex = this.y + 10;
        worldContainer.addChild(this.gfx);
    }
    
    update(delta: number, buildings: CyberBuilding[], effects: EffectsManager): void {
        if (!this.active) return;
        
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
        
        this.distance += this.speed * delta;
        if (this.distance > 900) this.destroy();
    }
    
    destroy(): void {
        this.active = false;
        if (this.gfx.parent) {
            this.gfx.parent.removeChild(this.gfx);
        }
        this.gfx.destroy();
    }
}