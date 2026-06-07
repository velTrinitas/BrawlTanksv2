import * as PIXI from 'pixi.js';
import { getEnemyTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import { BRAWLERS } from '../config/brawlers';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';
import type { EnemyConfig } from '../config/enemies';
import type { ICollidable } from '../types/MapType';

export interface EnemyShotInfo {
    x: number;
    y: number;
    angle: number;
    speed: number;
    dmg: number;
    color: number;
    burstCount: number;
    burstSpread: number;
}

type MegaBossPhase = 'rush' | 'strafe' | 'flee';

export class Enemy {
    public x: number;
    public y: number;
    public speed: number;
    public maxHp: number;
    public hp: number;
    public active: boolean;
    public tintHex: number;
    public isBoss: boolean;
    public isMegaBoss: boolean;
    public scoreValue: number;
    public collisionDmg: number;
    
    // v0.18.1 FAZA 4b — speed modifier (set externally per-frame by main.ts: quicksand = 0.5, normal = 1.0)
    public speedModifier: number = 1.0;
    
    // v0.18.3 FAZA 4c — detection range modifier (set externally per-frame by main.ts).
    // 0.5 gdy GRACZ jest w oazie (640px shooting range → 320px), 1.0 normalnie.
    // Aplikowane do `dist < 640 * this.detectionRangeModifier` w shooting check poniżej.
    public detectionRangeModifier: number = 1.0;
    
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    public hpBar: PIXI.Graphics;
    public shieldGfx: PIXI.Graphics | null = null;
    
    /** v0.5 Etap 1: Date.now() endpoint gdy freeze wygasa. 0 = nie zamrożony */
    public frozenUntil: number = 0;
    
    private shootIntervalMs: number;
    private bulletSpeed: number;
    private bulletDmg: number;
    private bulletColor: number;
    private lastShotTime: number = 0;
    private burstCount: number;
    private burstSpread: number;
    
    private flashTimer: number = 0;
    
    private megaPhase: MegaBossPhase = 'rush';
    private megaStrafeAngle: number = 0;
    private megaStrafeDir: number = 1;
    private megaShieldActive: boolean = false;
    private megaShieldNextTime: number = 0;
    private megaShieldEndTime: number = 0;
    
    private static readonly MIN_DIST_TO_PLAYER = 60;
    private static readonly BASE_SHOOTING_RANGE = 640;
    
    constructor(
        x: number, y: number,
        config: EnemyConfig,
        isBoss: boolean,
        worldContainer: PIXI.Container,
        isMegaBoss: boolean = false
    ) {
        this.x = x; this.y = y;
        this.speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
        this.maxHp = config.hp;
        this.hp = this.maxHp;
        this.active = true;
        this.tintHex = config.tint;
        this.isBoss = isBoss;
        this.isMegaBoss = isMegaBoss;
        this.scoreValue = config.scoreValue;
        this.collisionDmg = config.dmg;
        
        this.shootIntervalMs = config.shootIntervalMs;
        this.bulletSpeed = config.bulletSpeed;
        this.bulletDmg = config.bulletDmg;
        this.bulletColor = config.bulletColor;
        
        if (isMegaBoss) {
            this.burstCount = 1;
            this.burstSpread = 0;
        } else if (isBoss) {
            this.burstCount = 3;
            this.burstSpread = 0.30;
        } else {
            this.burstCount = 1;
            this.burstSpread = 0;
        }
        
        this.lastShotTime = Date.now() + Math.random() * 1000 - this.shootIntervalMs;
        
        if (isMegaBoss) {
            this.megaShieldNextTime = Date.now() + 12000;
        }
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.scale.set(config.scale);
        
        // v0.12.2 fix — getEnemyTextures wymusza PIERWOTNY v4.48 look (generic drawTankHull/Turret)
        // niezależnie od BRAWLERS[1].id ('heavy'). Brawler używany TYLKO dla colorMain (potem nadpisane tintem).
        const tex = getEnemyTextures(BRAWLERS[1]);
        
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        this.hull.tint = this.tintHex;
        
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        this.turret.tint = this.tintHex;
        
        this.hpBar = new PIXI.Graphics();
        this.hpBar.y = isMegaBoss ? -65 : -55;
        this.drawHp();
        
        this.container.addChild(this.hull);
        this.container.addChild(this.turret);
        this.container.addChild(this.hpBar);
        
        if (isMegaBoss) {
            this.shieldGfx = new PIXI.Graphics();
            this.shieldGfx.visible = false;
            this.container.addChild(this.shieldGfx);
        }
        
        worldContainer.addChild(this.container);
    }
    
    private drawHp(): void {
        this.hpBar.clear();
        const barW = this.isMegaBoss ? 100 : (this.isBoss ? 70 : 40);
        this.hpBar.beginFill(0x000000, 0.5);
        this.hpBar.drawRect(-barW / 2, 0, barW, this.isMegaBoss ? 7 : 5);
        const color = this.isMegaBoss ? 0xffdd00 : (this.isBoss ? 0xff0066 : 0xff3300);
        this.hpBar.beginFill(color);
        this.hpBar.drawRect(-barW / 2, 0, Math.max(0, (this.hp / this.maxHp) * barW), this.isMegaBoss ? 7 : 5);
        this.hpBar.endFill();
    }
    
    private drawShield(): void {
        if (!this.shieldGfx) return;
        this.shieldGfx.clear();
        if (!this.megaShieldActive) {
            this.shieldGfx.visible = false;
            return;
        }
        this.shieldGfx.visible = true;
        const pulse = 0.7 + Math.sin(Date.now() / 80) * 0.3;
        this.shieldGfx.lineStyle(4, 0xffd700, pulse);
        this.shieldGfx.drawCircle(0, 0, 38);
        this.shieldGfx.lineStyle(2, 0xffff88, pulse * 0.6);
        this.shieldGfx.drawCircle(0, 0, 42);
    }
    
    getMegaPhase(): MegaBossPhase | null {
        return this.isMegaBoss ? this.megaPhase : null;
    }
    
    update(delta: number, targetX: number, targetY: number, buildings: ICollidable[]): EnemyShotInfo | null {
        if (!this.active) return null;
        
        // v0.5 Etap 1: FREEZE check — zamrożony wróg nie rusza się, nie strzela
        if (Date.now() < this.frozenUntil) {
            this.hull.tint = 0x66ddff;
            this.turret.tint = 0x66ddff;
            return null;
        } else if (this.hull.tint === 0x66ddff) {
            // Freeze wygasł — przywróć normalny tint
            this.hull.tint = this.tintHex;
            this.turret.tint = this.tintHex;
        }
        
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
        
        // v0.18.1 FAZA 4b — effective speed z quicksand modifier (1.0 normal, 0.5 w strefie)
        const effectiveSpeed = this.speed * this.speedModifier;
        
        if (this.isMegaBoss) {
            const hpPct = this.hp / this.maxHp;
            if (hpPct > 0.6) this.megaPhase = 'rush';
            else if (hpPct > 0.3) this.megaPhase = 'strafe';
            else this.megaPhase = 'flee';
            
            const now = Date.now();
            if (!this.megaShieldActive && now >= this.megaShieldNextTime) {
                this.megaShieldActive = true;
                this.megaShieldEndTime = now + 3000;
            }
            if (this.megaShieldActive && now >= this.megaShieldEndTime) {
                this.megaShieldActive = false;
                this.megaShieldNextTime = now + (hpPct < 0.5 ? 8000 : 12000);
            }
            this.drawShield();
            
            let moveX = 0, moveY = 0;
            if (this.megaPhase === 'rush') {
                this.burstCount = 1;
                this.burstSpread = 0;
                if (dist > Enemy.MIN_DIST_TO_PLAYER) {
                    moveX = (dx / dist) * effectiveSpeed;
                    moveY = (dy / dist) * effectiveSpeed;
                }
            } else if (this.megaPhase === 'strafe') {
                this.burstCount = 1;
                this.burstSpread = 0;
                const idealDist = 280;
                this.megaStrafeAngle += 0.02 * this.megaStrafeDir * delta;
                if (Math.random() < 0.005) this.megaStrafeDir *= -1;
                
                if (Math.abs(dist - idealDist) > 30) {
                    const radialDir = dist > idealDist ? 1 : -1;
                    moveX = (dx / dist) * effectiveSpeed * radialDir * 0.7;
                    moveY = (dy / dist) * effectiveSpeed * radialDir * 0.7;
                } else {
                    moveX = -(dy / dist) * effectiveSpeed * this.megaStrafeDir;
                    moveY = (dx / dist) * effectiveSpeed * this.megaStrafeDir;
                }
            } else {
                this.burstCount = 3;
                this.burstSpread = 0.40;
                if (dist < 500) {
                    moveX = -(dx / dist) * effectiveSpeed * 1.3;
                    moveY = -(dy / dist) * effectiveSpeed * 1.3;
                }
            }
            
            const nx = this.x + moveX * delta;
            const ny = this.y + moveY * delta;
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 35)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 35)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
        } else {
            if (dist > Enemy.MIN_DIST_TO_PLAYER) {
                const nx = this.x + (dx / dist) * effectiveSpeed * delta;
                const ny = this.y + (dy / dist) * effectiveSpeed * delta;
                
                let canMoveX = true, canMoveY = true;
                for (const b of buildings) {
                    if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                    if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
                }
                if (canMoveX) this.x = nx;
                if (canMoveY) this.y = ny;
            }
        }
        
        this.hull.rotation = angleToTarget;
        this.turret.rotation = angleToTarget;
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + (this.isMegaBoss ? 35 : this.isBoss ? 28 : 19);
        
        const now = Date.now();
        // v0.18.3 FAZA 4c — shooting range scaled by detectionRangeModifier
        // (gdy gracz w oazie: 640 × 0.5 = 320px effective range).
        const effectiveRange = Enemy.BASE_SHOOTING_RANGE * this.detectionRangeModifier;
        if (now - this.lastShotTime >= this.shootIntervalMs && dist < effectiveRange) {
            this.lastShotTime = now;
            const muzzleOffset = this.isMegaBoss ? 70 : this.isBoss ? 55 : 40;
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
    
    takeDamage(amount: number, hitX: number, hitY: number, worldContainer: PIXI.Container, effects: EffectsManager): boolean {
        if (this.isMegaBoss && this.megaShieldActive) {
            effects.spawnEnemyHitSparks(hitX, hitY, 0xffd700);
            return false;
        }
        
        this.hp -= amount;
        this.drawHp();
        
        this.hull.tint = 0xffffff;
        this.turret.tint = 0xffffff;
        this.flashTimer = 4;
        
        effects.spawnEnemyHitSparks(hitX, hitY, this.tintHex);
        
        if (this.hp <= 0) {
            this.active = false;
            effects.spawnExplosionAndWreck(this.x, this.y, this.tintHex);
            if (this.isMegaBoss) {
                effects.shake(28, 40);
            } else if (this.isBoss) {
                effects.shake(16, 22);
            }
            worldContainer.removeChild(this.container);
            this.container.destroy({ children: true });
            return true;
        }
        return false;
    }
    
    /**
     * Ilość gemów które wróg dropi po śmierci.
     */
    getGemDropCount(): number {
        if (this.isMegaBoss) return 20;
        if (this.isBoss) return 5;
        return 1;
    }
    
    /**
     * v0.5 Etap 1: Zamraża wroga do timestampu `until` (Date.now() + duration).
     */
    freeze(until: number): void {
        this.frozenUntil = until;
    }
}