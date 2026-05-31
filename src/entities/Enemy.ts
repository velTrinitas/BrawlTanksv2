import * as PIXI from 'pixi.js';
import { getBrawlerTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import { BRAWLERS } from '../config/brawlers';
import type { CyberBuilding } from '../maps/CityMap';

export class Enemy {
    public x: number;
    public y: number;
    public speed: number;
    public maxHp: number;
    public hp: number;
    public active: boolean;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    public hpBar: PIXI.Graphics;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.speed = 2.5;
        this.maxHp = 6;
        this.hp = this.maxHp;
        this.active = true;
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        
        // Wrogowie używają na razie sprite Pancernego z czerwonym tintem
        const enemyTex = getBrawlerTextures(BRAWLERS[1]);
        
        this.hull = new PIXI.Sprite(enemyTex.hull);
        this.hull.anchor.set(0.5);
        this.hull.tint = 0xff4444;
        
        this.turret = new PIXI.Sprite(enemyTex.turret);
        this.turret.anchor.set(0.5);
        this.turret.tint = 0xff4444;
        
        this.hpBar = new PIXI.Graphics();
        this.hpBar.y = -55;
        this.drawHp();
        
        this.container.addChild(this.hull);
        this.container.addChild(this.turret);
        this.container.addChild(this.hpBar);
        worldContainer.addChild(this.container);
    }
    
    private drawHp(): void {
        this.hpBar.clear();
        this.hpBar.beginFill(0x000000, 0.5);
        this.hpBar.drawRect(-20, 0, 40, 5);
        this.hpBar.beginFill(0xff3300);
        this.hpBar.drawRect(-20, 0, Math.max(0, (this.hp / this.maxHp) * 40), 5);
        this.hpBar.endFill();
    }
    
    update(delta: number, targetX: number, targetY: number, buildings: CyberBuilding[]): void {
        if (!this.active) return;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 60) {
            const nx = this.x + (dx / dist) * this.speed * delta;
            const ny = this.y + (dy / dist) * this.speed * delta;
            
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
        }
        
        this.hull.rotation = Math.atan2(dy, dx);
        this.turret.rotation = Math.atan2(dy, dx);
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + 19;
    }
    
    takeDamage(amount: number, worldContainer: PIXI.Container): boolean {
        this.hp -= amount;
        this.drawHp();
        if (this.hp <= 0) {
            this.active = false;
            worldContainer.removeChild(this.container);
            this.container.destroy({ children: true });
            return true; // zwraca true gdy zabity
        }
        return false;
    }
}