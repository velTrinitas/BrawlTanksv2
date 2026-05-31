import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import type { CyberBuilding } from '../maps/CityMap';

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
    
    constructor(x: number, y: number, angle: number, brawlerInfo: Brawler, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.dmg = brawlerInfo.dmg;
        this.speed = 15;
        this.radius = 6;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        
        // Kolor pocisku zależny od brawlera
        let color = 0x2ecc71;
        if (brawlerInfo.id === 'pyro') color = 0xe74c3c;
        else if (brawlerInfo.id === 'plasma') color = 0x00cec9;
        else if (brawlerInfo.id === 'shadow') color = 0x6c3483;
        else if (brawlerInfo.id === 'sniper') color = 0xffffff;
        
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(color);
        this.gfx.drawCircle(0, 0, this.radius);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.zIndex = this.y + 10;
        worldContainer.addChild(this.gfx);
    }
    
    update(delta: number, buildings: CyberBuilding[]): void {
        if (!this.active) return;
        
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        
        for (const b of buildings) {
            if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                this.destroy();
                return;
            }
        }
        
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.zIndex = this.y + 10;
        
        this.distance += this.speed * delta;
        if (this.distance > 1000) this.destroy();
    }
    
    destroy(): void {
        this.active = false;
        if (this.gfx.parent) {
            this.gfx.parent.removeChild(this.gfx);
        }
        this.gfx.destroy();
    }
}