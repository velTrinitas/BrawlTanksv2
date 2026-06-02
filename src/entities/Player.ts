import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import { getBrawlerTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';

interface KeysState {
    w: boolean; a: boolean; s: boolean; d: boolean;
}

export class Player {
    public brawler: Brawler;
    public x: number;
    public y: number;
    public baseSpeed: number;
    public maxHp: number;
    public hp: number;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    
    public speedBoostMult: number = 1;
    public speedBoostEnd: number = 0;
    
    private trackTimer: number = 0;
    private lastMoveAngle: number = 0;
    public isMoving: boolean = false;
    
    constructor(brawlerData: Brawler, worldContainer: PIXI.Container) {
        this.brawler = brawlerData;
        this.x = 800;
        this.y = 800;
        this.baseSpeed = brawlerData.speed;
        this.maxHp = brawlerData.hp;
        this.hp = this.maxHp;
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        
        const tex = getBrawlerTextures(this.brawler);
        
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        
        this.container.addChild(this.hull);
        this.container.addChild(this.turret);
        worldContainer.addChild(this.container);
    }
    
    /**
     * @param amount damage do zadania
     * @param isInvulnerable jeśli true (np. aura aktywna), damage NIE zostaje zadany
     * @returns true jeśli gracz zginął
     */
    takeDamage(amount: number, isInvulnerable: boolean = false): boolean {
        if (isInvulnerable) return false; // TARCZA blokuje wszystko
        this.hp -= amount;
        return this.hp <= 0;
    }
    
    applyTurboBoost(durationMs: number, multiplier: number): void {
        this.speedBoostMult = multiplier;
        this.speedBoostEnd = Date.now() + durationMs;
    }
    
    get currentSpeed(): number {
        if (Date.now() > this.speedBoostEnd) {
            this.speedBoostMult = 1;
        }
        return this.baseSpeed * this.speedBoostMult;
    }
    
    get hasSpeedBoost(): boolean {
        return Date.now() < this.speedBoostEnd && this.speedBoostMult > 1;
    }
    
    update(keys: KeysState, mouseWorldX: number, mouseWorldY: number, buildings: CyberBuilding[], effects: EffectsManager): void {
        let dx = 0, dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        
        this.isMoving = false;
        
        if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            const len = Math.sqrt(dx * dx + dy * dy);
            const speed = this.currentSpeed;
            const nx = this.x + (dx / len) * speed;
            const ny = this.y + (dy / len) * speed;
            
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
            
            this.lastMoveAngle = Math.atan2(dy, dx);
            this.hull.rotation = this.lastMoveAngle;
        }
        
        this.container.x = this.x;
        this.container.y = this.y;
        this.turret.rotation = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);
        this.container.zIndex = this.y + 19;
        
        if (this.hasSpeedBoost) {
            this.hull.tint = 0xffcc66;
        } else {
            this.hull.tint = 0xffffff;
        }
        
        if (this.isMoving) {
            this.trackTimer++;
            const trackInterval = this.hasSpeedBoost ? 2 : 4;
            if (this.trackTimer >= trackInterval) {
                this.trackTimer = 0;
                const perpX = -Math.sin(this.lastMoveAngle) * 12;
                const perpY = Math.cos(this.lastMoveAngle) * 12;
                effects.spawnTrackMark(this.x + perpX, this.y + perpY, this.lastMoveAngle);
                effects.spawnTrackMark(this.x - perpX, this.y - perpY, this.lastMoveAngle);
            }
        }
    }
}