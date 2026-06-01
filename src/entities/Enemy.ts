import * as PIXI from 'pixi.js';
import { getBrawlerTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import { BRAWLERS } from '../config/brawlers';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';
import type { EnemyConfig } from '../config/enemies';

/**
 * Info o strzale wroga — zwracane z update() gdy wróg chce strzelić.
 * Główny gameLoop tworzy faktyczny EnemyBullet (Enemy nie zna worldContainer dla bulletów).
 */
export interface EnemyShotInfo {
    x: number;
    y: number;
    angle: number;
    speed: number;
    dmg: number;
    color: number;
    /** Liczba pocisków w salwie (1 = pojedynczy, 3 = boss spread) */
    burstCount: number;
    /** Kąt rozrzutu salwy w radianach (dla burstCount > 1) */
    burstSpread: number;
}

export class Enemy {
    public x: number;
    public y: number;
    public speed: number;
    public maxHp: number;
    public hp: number;
    public active: boolean;
    public tintHex: number;
    public isBoss: boolean;
    public scoreValue: number;
    public collisionDmg: number;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    public hpBar: PIXI.Graphics;
    
    // Strzelanie
    private shootIntervalMs: number;
    private bulletSpeed: number;
    private bulletDmg: number;
    private bulletColor: number;
    private lastShotTime: number = 0;
    private burstCount: number;
    private burstSpread: number;
    
    // Hit flash
    private flashTimer: number = 0;
    
    // Min dystans do gracza (nie wjedzie na niego)
    private static readonly MIN_DIST_TO_PLAYER = 60;
    
    constructor(x: number, y: number, config: EnemyConfig, isBoss: boolean, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
        this.maxHp = config.hp;
        this.hp = this.maxHp;
        this.active = true;
        this.tintHex = config.tint;
        this.isBoss = isBoss;
        this.scoreValue = config.scoreValue;
        this.collisionDmg = config.dmg;
        
        this.shootIntervalMs = config.shootIntervalMs;
        this.bulletSpeed = config.bulletSpeed;
        this.bulletDmg = config.bulletDmg;
        this.bulletColor = config.bulletColor;
        this.burstCount = isBoss ? 3 : 1;     // Boss strzela 3-bullet spread
        this.burstSpread = isBoss ? 0.30 : 0; // ±0.15 rad
        
        // Random opóźnienie pierwszego strzału (0-1s) żeby nie wszyscy strzelali sync
        this.lastShotTime = Date.now() + Math.random() * 1000 - this.shootIntervalMs;
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.scale.set(config.scale);
        
        // Boss używa Pancernego jako base (większy, bardziej tank-like)
        const tex = getBrawlerTextures(BRAWLERS[1]);
        
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        this.hull.tint = this.tintHex;
        
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        this.turret.tint = this.tintHex;
        
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
        const barW = this.isBoss ? 70 : 40;
        this.hpBar.beginFill(0x000000, 0.5);
        this.hpBar.drawRect(-barW / 2, 0, barW, 5);
        // Color: czerwony zawsze (boss = ciemniejszy)
        this.hpBar.beginFill(this.isBoss ? 0xff0066 : 0xff3300);
        this.hpBar.drawRect(-barW / 2, 0, Math.max(0, (this.hp / this.maxHp) * barW), 5);
        this.hpBar.endFill();
    }
    
    /**
     * Update — zwraca shotInfo gdy wróg chce strzelić, inaczej null.
     */
    update(delta: number, targetX: number, targetY: number, buildings: CyberBuilding[]): EnemyShotInfo | null {
        if (!this.active) return null;
        
        // Hit flash decay
        if (this.flashTimer > 0) {
            this.flashTimer -= delta;
            if (this.flashTimer <= 0) {
                this.hull.tint = this.tintHex;
                this.turret.tint = this.tintHex;
            }
        }
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToTarget = Math.atan2(dy, dx);
        
        // Chase logic — utrzymuje minimalny dystans
        if (dist > Enemy.MIN_DIST_TO_PLAYER) {
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
        
        this.hull.rotation = angleToTarget;
        this.turret.rotation = angleToTarget;
        this.container.x = this.x;
        this.container.y = this.y;
        // zIndex z uwzględnieniem scale (boss większy → wyższy zIndex)
        this.container.zIndex = this.y + (this.isBoss ? 28 : 19);
        
        // Strzelanie — jeśli minął cooldown i jest w range
        const now = Date.now();
        if (now - this.lastShotTime >= this.shootIntervalMs && dist < 700) {
            this.lastShotTime = now;
            // Strzelamy z końca lufy (offset od centrum)
            const muzzleOffset = this.isBoss ? 55 : 40;
            return {
                x: this.x + Math.cos(angleToTarget) * muzzleOffset,
                y: this.y + Math.sin(angleToTarget) * muzzleOffset,
                angle: angleToTarget,
                speed: this.bulletSpeed,
                dmg: this.bulletDmg,
                color: this.bulletColor,
                burstCount: this.burstCount,
                burstSpread: this.burstSpread,
            };
        }
        
        return null;
    }
    
    /**
     * @returns true jeśli wróg zginął
     */
    takeDamage(amount: number, hitX: number, hitY: number, worldContainer: PIXI.Container, effects: EffectsManager): boolean {
        this.hp -= amount;
        this.drawHp();
        
        // Hit flash
        this.hull.tint = 0xffffff;
        this.turret.tint = 0xffffff;
        this.flashTimer = 4;
        
        effects.spawnEnemyHitSparks(hitX, hitY, this.tintHex);
        
        if (this.hp <= 0) {
            this.active = false;
            effects.spawnExplosionAndWreck(this.x, this.y, this.tintHex);
            // Boss = większy screen shake
            if (this.isBoss) {
                effects.shake(16, 22);
            }
            worldContainer.removeChild(this.container);
            this.container.destroy({ children: true });
            return true;
        }
        return false;
    }
}