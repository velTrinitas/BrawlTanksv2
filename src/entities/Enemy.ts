import * as PIXI from 'pixi.js';
import { getEnemyTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import { BRAWLERS } from '../config/brawlers';
import type { EffectsManager } from '../rendering/Effects';
import type { EnemyConfig } from '../config/enemies';
import type { ICollidable } from '../types/MapType';
import type { PowerCube } from './pickups/PowerCube';

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

/**
 * v0.44.0 FAZA 8.6: cube stealing constants.
 *
 * - SEARCH_RADIUS: enemy "sees" cubes within this radius
 * - CHASE_THRESHOLD: cubeDist² < playerDist² * 0.49 (= 0.7²) → switch target z player na cube
 * - STEAL_TOUCH_DIST: cubeDist < this → enemy steals cube (cube znika, enemy NIE dostaje bonusu)
 * - Megaboss SKIPS stealing (chronimy phase-based AI rush/strafe/flee)
 *
 * v0.44.1 FIX (bug: enemies parking 60px od cube i stojące):
 * - CUBE_CHASE_MIN_MOVE_DIST: gdy enemy chasing cube, override Enemy.MIN_DIST_TO_PLAYER (60)
 *   na 5px (chcemy żeby podszedł na dotyk, NIE trzymał shooting distance jak przy graczu)
 */
const CUBE_SEARCH_RADIUS_SQ = 160 * 160;
const CUBE_CHASE_THRESHOLD = 0.49;  // 0.7² — switch jeśli cube < 70% playerDist
const CUBE_STEAL_TOUCH_DIST = 30;   // + cube.radius (20) → real touch ~50px
const CUBE_CHASE_MIN_MOVE_DIST = 5; // v0.44.1: override MIN_DIST_TO_PLAYER dla cube chase

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

    // v0.18.1 FAZA 4b — speed modifier
    public speedModifier: number = 1.0;

    // v0.18.3-fix1 FAZA 4c — stealth flag
    public playerStealthed: boolean = false;
    private confusedRotation: number = 0;

    /**
     * v0.44.0 FAZA 8.6: callback wywoływany gdy enemy kradnie cube.
     * main.ts ustawia po spawnach: `enemy.onCubeStolen = (x, y) => effects.spawnFloatingText(...)`.
     */
    public onCubeStolen: ((cubeX: number, cubeY: number) => void) | null = null;

    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    public hpBar: PIXI.Graphics;
    public shieldGfx: PIXI.Graphics | null = null;

    /** v0.5 Etap 1: freeze timer */
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

        this.confusedRotation = Math.random() * Math.PI * 2;

        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.scale.set(config.scale);

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

    /**
     * v0.44.0 FAZA 8.6: cube stealing logic.
     * Skanuje cubes w 160px radius, override targetX/Y jeśli cube w 70% playerDist.
     * Touch range = 30px + cube.radius (~50px) → cube.active = false + onCubeStolen callback.
     *
     * Megaboss SKIPS cube stealing (chronimy phase-based AI).
     */
    private tryStealCube(
        playerX: number, playerY: number,
        powerCubes: PowerCube[],
    ): { targetX: number; targetY: number } {
        if (this.isMegaBoss || powerCubes.length === 0) {
            return { targetX: playerX, targetY: playerY };
        }

        const dxP = playerX - this.x;
        const dyP = playerY - this.y;
        const distToPlayerSq = dxP * dxP + dyP * dyP;

        let nearestCube: PowerCube | null = null;
        let nearestDistSq = CUBE_SEARCH_RADIUS_SQ;
        for (const cube of powerCubes) {
            if (!cube.active) continue;
            const dx = cube.x - this.x;
            const dy = cube.y - this.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < nearestDistSq) {
                nearestDistSq = dSq;
                nearestCube = cube;
            }
        }

        if (!nearestCube) {
            return { targetX: playerX, targetY: playerY };
        }

        if (nearestDistSq >= distToPlayerSq * CUBE_CHASE_THRESHOLD) {
            return { targetX: playerX, targetY: playerY };
        }

        // Touch detection — steal cube
        const touchR = CUBE_STEAL_TOUCH_DIST + nearestCube.radius;
        if (nearestDistSq < touchR * touchR) {
            nearestCube.active = false;
            this.onCubeStolen?.(nearestCube.x, nearestCube.y);
            return { targetX: playerX, targetY: playerY };
        }

        return { targetX: nearestCube.x, targetY: nearestCube.y };
    }

    /**
     * v0.44.0 FAZA 8.6: dorzucony parametr `powerCubes` (default empty array for back-compat).
     * v0.44.1 FIX: minMoveDist override gdy chasing cube (5px zamiast 60).
     */
    update(
        delta: number,
        targetX: number,
        targetY: number,
        buildings: ICollidable[],
        powerCubes: PowerCube[] = [],
    ): EnemyShotInfo | null {
        if (!this.active) return null;

        if (Date.now() < this.frozenUntil) {
            this.hull.tint = 0x66ddff;
            this.turret.tint = 0x66ddff;
            return null;
        } else if (this.hull.tint === 0x66ddff) {
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

        if (this.playerStealthed) {
            this.confusedRotation += 0.045 * delta;
            this.hull.rotation = this.confusedRotation;
            this.turret.rotation = this.confusedRotation + Math.sin(Date.now() / 280) * 0.65;

            this.container.x = this.x;
            this.container.y = this.y;
            this.container.zIndex = this.y + (this.isMegaBoss ? 35 : this.isBoss ? 28 : 19);

            if (this.isMegaBoss && this.megaShieldActive) {
                this.drawShield();
            } else if (this.isMegaBoss && this.shieldGfx) {
                this.shieldGfx.visible = false;
            }

            return null;
        }

        // v0.44.0 FAZA 8.6: cube stealing override
        const effectiveTarget = this.tryStealCube(targetX, targetY, powerCubes);
        const effTargetX = effectiveTarget.targetX;
        const effTargetY = effectiveTarget.targetY;

        // v0.44.1 FIX: detect cube chase mode EARLY (przed movement decision)
        const isChasingCube = effTargetX !== targetX || effTargetY !== targetY;

        const dx = effTargetX - this.x;
        const dy = effTargetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToTarget = Math.atan2(dy, dx);

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
            // v0.44.1 FIX: cube chase wymaga niskiego minMoveDist (5px zamiast 60)
            // żeby enemy DOSZEDŁ do touch range (50px) i ukradł cube.
            // Bez tego override'u enemy parkował na 60px od cube'a i stał wiecznie.
            const minMoveDist = isChasingCube ? CUBE_CHASE_MIN_MOVE_DIST : Enemy.MIN_DIST_TO_PLAYER;

            if (dist > minMoveDist) {
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
        this.confusedRotation = angleToTarget;

        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + (this.isMegaBoss ? 35 : this.isBoss ? 28 : 19);

        // Strzelanie: TYLKO gdy chasing player, NIE w trakcie chase cube
        if (!isChasingCube) {
            const now = Date.now();
            if (now - this.lastShotTime >= this.shootIntervalMs && dist < 640) {
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

    getGemDropCount(): number {
        if (this.isMegaBoss) return 20;
        if (this.isBoss) return 5;
        return 1;
    }

    /** v0.5 Etap 1: freeze power. */
    freeze(until: number): void {
        this.frozenUntil = until;
    }
}