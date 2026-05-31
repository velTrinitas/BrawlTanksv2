import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import { getBrawlerTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import type { CyberBuilding } from '../maps/CityMap';

interface KeysState {
    w: boolean; a: boolean; s: boolean; d: boolean;
}

export class Player {
    public brawler: Brawler;
    public x: number;
    public y: number;
    public speed: number;
    public maxHp: number;
    public hp: number;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    
    constructor(brawlerData: Brawler, worldContainer: PIXI.Container) {
        this.brawler = brawlerData;
        this.x = 800;
        this.y = 800;
        this.speed = brawlerData.speed;
        this.maxHp = brawlerData.hp;
        this.hp = this.maxHp;
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        
        // OPT: użyj global cache (anti-leak pattern z lessons learned)
        const tex = getBrawlerTextures(this.brawler);
        
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        
        this.container.addChild(this.hull);
        this.container.addChild(this.turret);
        worldContainer.addChild(this.container);
    }
    
    takeDamage(amount: number): boolean {
        // TODO: aura check w Phase 3
        this.hp -= amount;
        return this.hp <= 0; // zwraca true jeśli zginął
    }
    
    update(keys: KeysState, mouseWorldX: number, mouseWorldY: number, buildings: CyberBuilding[]): void {
        let dx = 0, dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = this.x + (dx / len) * this.speed;
            const ny = this.y + (dy / len) * this.speed;
            
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
            
            this.hull.rotation = Math.atan2(dy, dx);
        }
        
        this.container.x = this.x;
        this.container.y = this.y;
        this.turret.rotation = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);
        this.container.zIndex = this.y + 19;
    }
}