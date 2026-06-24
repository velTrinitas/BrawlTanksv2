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

/**
 * v0.58.0 Warstwa C2 — pursuit vehicle AI constants (strafe-dodge).
 *
 * Wzorowane na mega-boss faza 'strafe', ale napastliwiej:
 *  - IDEAL_DIST 200 (megaboss 280) — poscig trzyma sie blizej
 *  - DIR_FLIP_CHANCE 0.012 (megaboss 0.005) — czestsze uniki, trudniej wycelowac
 *  - ORBIT_SPEED 0.028 (megaboss 0.02) — szybsze okrazanie
 *  - RADIAL_CORRECTION_BAND 30 (jak megaboss) — strefa tolerancji dystansu
 *  - SHOOT_RANGE 700 — strzela z wiekszego dystansu niz zwykly (640) bo to karabin
 */
const PURSUIT_IDEAL_DIST = 200;
const PURSUIT_DIR_FLIP_CHANCE = 0.012;
const PURSUIT_ORBIT_SPEED = 0.028;
const PURSUIT_RADIAL_BAND = 30;
const PURSUIT_SHOOT_RANGE = 700;
// v0.58.0 fix: pojedyncze CELOWANE strzaly, ale czeste (shootIntervalMs 600 w configu).
// Burst 1 = jeden pocisk per strzal, zawsze namierzony na gracza (jak zwykly czolg,
// tylko szybszy ogien). NIE seria-wachlarz (to bylo mylne z pierwotnego "karabin").
const PURSUIT_BURST_COUNT = 1;
const PURSUIT_BURST_SPREAD = 0;

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

    // v0.58.0 Warstwa C2 — pursuit vehicle flag (strafe-dodge AI, spawn z PoliceStation)
    public isPursuit: boolean;

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

    // v0.58.0 Warstwa C2 — police beacon lights (koguty): migajace niebiesko-czerwone
    // swiatla na wiezy (dach) + tyl kadluba. Tylko dla isPursuit. Dziecko container
    // (renderowane NA WIERZCHU), rotacja synchronizowana z hull co klatke.
    public policeLights: PIXI.Graphics | null = null;

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

    // v0.58.0 Warstwa C2 — pursuit strafe state (analog megaStrafeDir, osobne zeby
    // nie kolidowac gdyby kiedys pursuit + megaboss byly na mapie jednoczesnie).
    private pursuitStrafeDir: number = 1;

    private static readonly MIN_DIST_TO_PLAYER = 60;

    constructor(
        x: number, y: number,
        config: EnemyConfig,
        isBoss: boolean,
        worldContainer: PIXI.Container,
        isMegaBoss: boolean = false,
        isPursuit: boolean = false
    ) {
        this.x = x; this.y = y;
        this.speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
        this.maxHp = config.hp;
        this.hp = this.maxHp;
        this.active = true;
        this.tintHex = config.tint;
        this.isBoss = isBoss;
        this.isMegaBoss = isMegaBoss;
        this.isPursuit = isPursuit;
        this.scoreValue = config.scoreValue;
        this.collisionDmg = config.dmg;

        this.shootIntervalMs = config.shootIntervalMs;
        this.bulletSpeed = config.bulletSpeed;
        this.bulletDmg = config.bulletDmg;
        this.bulletColor = config.bulletColor;

        if (isMegaBoss) {
            this.burstCount = 1;
            this.burstSpread = 0;
        } else if (isPursuit) {
            // v0.58.0: woz poscigowy = karabin maszynowy (burst 3, ciasny snop)
            this.burstCount = PURSUIT_BURST_COUNT;
            this.burstSpread = PURSUIT_BURST_SPREAD;
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

        // v0.58.0: losowy poczatkowy kierunek orbitowania dla pursuit
        this.pursuitStrafeDir = Math.random() < 0.5 ? 1 : -1;

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

        // v0.58.0 Warstwa C2 — koguty policyjne. Dodane JAKO OSTATNIE dziecko container
        // (renderuje sie na wierzchu hull+turret). Rysowane/animowane w drawPoliceLights().
        if (isPursuit) {
            this.policeLights = new PIXI.Graphics();
            this.container.addChild(this.policeLights);
        }

        worldContainer.addChild(this.container);
    }

    private drawHp(): void {
        this.hpBar.clear();
        const barW = this.isMegaBoss ? 100 : (this.isBoss ? 70 : (this.isPursuit ? 55 : 40));
        this.hpBar.beginFill(0x000000, 0.5);
        this.hpBar.drawRect(-barW / 2, 0, barW, this.isMegaBoss ? 7 : 5);
        const color = this.isMegaBoss
            ? 0xffdd00
            : (this.isBoss ? 0xff0066 : (this.isPursuit ? 0x4488ff : 0xff3300));
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

    /**
     * v0.58.0 Warstwa C2 — koguty policyjne (migajace swiatla).
     *
     * Rysowane w LOCAL space tanka (forward = +X, rear = -X, anchor center).
     * Dwa zrodla:
     *   1) Beacon na wiezy/dachu (przy srodku): lewa kopulka NIEBIESKA, prawa CZERWONA
     *   2) Belka na tyle kadluba (-X): dwie polowki migajace na przemian
     * Faza migania toggluje co ~140ms (Math.floor(now/140) % 2). Aktywny kolor = jasny
     * + glow + bialy hot-spot; nieaktywny = ciemny (przygaszony). Klasyczny wzor policyjny
     * (gdy niebieski jasny, czerwony ciemny i odwrotnie).
     *
     * Rotacja synchronizowana z hull w update() (this.policeLights.rotation = hull.rotation),
     * wiec belka tylna zawsze jest z tylu pojazdu niezaleznie od kierunku jazdy.
     */
    private drawPoliceLights(): void {
        if (!this.policeLights) return;
        const g = this.policeLights;
        g.clear();

        const BLUE = 0x2266ff;
        const RED = 0xff2233;
        const blueOn = Math.floor(Date.now() / 140) % 2 === 0;
        const domeBlue = blueOn ? BLUE : 0x101a3a; // przygaszony gdy nieaktywny
        const domeRed = blueOn ? 0x3a0e14 : RED;

        // --- Beacon na wiezy (dach) — dwie kopulki przy srodku, lekko do przodu (+X) ---
        // glow aktywnego koloru
        if (blueOn) { g.beginFill(BLUE, 0.35); g.drawCircle(2, -5, 6.5); g.endFill(); }
        else { g.beginFill(RED, 0.35); g.drawCircle(2, 5, 6.5); g.endFill(); }
        // kopulki
        g.beginFill(domeBlue, 1); g.drawCircle(2, -5, 3); g.endFill();
        g.beginFill(domeRed, 1); g.drawCircle(2, 5, 3); g.endFill();
        // bialy hot-spot na aktywnym
        if (blueOn) { g.beginFill(0xffffff, 0.85); g.drawCircle(1.2, -5.7, 1); g.endFill(); }
        else { g.beginFill(0xffffff, 0.85); g.drawCircle(1.2, 4.3, 1); g.endFill(); }

        // --- Belka na tyle kadluba (-X) — dwie polowki migajace na przemian ---
        // glow
        if (blueOn) { g.beginFill(BLUE, 0.30); g.drawRect(-27, -8, 6, 7); g.endFill(); }
        else { g.beginFill(RED, 0.30); g.drawRect(-27, 1, 6, 7); g.endFill(); }
        // segmenty belki
        g.beginFill(domeBlue, 1); g.drawRect(-25, -7, 4, 6); g.endFill();
        g.beginFill(domeRed, 1); g.drawRect(-25, 1, 4, 6); g.endFill();
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
     * v0.58.0: pursuit SKIPS rowniez (chronimy spojnosc poscigu — woz nie zbacza za cube).
     */
    private tryStealCube(
        playerX: number, playerY: number,
        powerCubes: PowerCube[],
    ): { targetX: number; targetY: number } {
        if (this.isMegaBoss || this.isPursuit || powerCubes.length === 0) {
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

        // v0.58.0 Warstwa C2 — koguty migaja stale (przed freeze/stealth returnami),
        // a rotacja podaza za hull (tyl belki zawsze z tylu pojazdu). 1-klatkowy lag
        // rotacji (hull.rotation z poprzedniej klatki) jest niezauwazalny.
        if (this.isPursuit && this.policeLights) {
            this.drawPoliceLights();
            this.policeLights.rotation = this.hull.rotation;
        }

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
        } else if (this.isPursuit) {
            // v0.58.0 Warstwa C2 — strafe-dodge AI (napastliwy poscig).
            // Orbituje gracza na PURSUIT_IDEAL_DIST (200px), z czestszymi unikami
            // niz megaboss strafe. Bursty karabinu juz ustawione w konstruktorze
            // (PURSUIT_BURST_COUNT/SPREAD) — NIE nadpisujemy ich tu (inaczej niz megaboss).
            this.megaStrafeAngle += PURSUIT_ORBIT_SPEED * this.pursuitStrafeDir * delta;
            if (Math.random() < PURSUIT_DIR_FLIP_CHANCE) this.pursuitStrafeDir *= -1;

            let moveX = 0, moveY = 0;
            if (Math.abs(dist - PURSUIT_IDEAL_DIST) > PURSUIT_RADIAL_BAND) {
                // poza strefa tolerancji — korekta radialna (dojedz/odjedz do idealnego dystansu)
                const radialDir = dist > PURSUIT_IDEAL_DIST ? 1 : -1;
                moveX = (dx / dist) * effectiveSpeed * radialDir;
                moveY = (dy / dist) * effectiveSpeed * radialDir;
            } else {
                // w strefie — czyste okrazanie (tangencjalnie do gracza)
                moveX = -(dy / dist) * effectiveSpeed * this.pursuitStrafeDir;
                moveY = (dx / dist) * effectiveSpeed * this.pursuitStrafeDir;
            }

            const nx = this.x + moveX * delta;
            const ny = this.y + moveY * delta;
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 25)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 25)) canMoveY = false;
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
        this.container.zIndex = this.y + (this.isMegaBoss ? 35 : this.isBoss ? 28 : (this.isPursuit ? 24 : 19));

        // Strzelanie: TYLKO gdy chasing player, NIE w trakcie chase cube
        if (!isChasingCube) {
            const now = Date.now();
            // v0.58.0: pursuit ma wlasny shoot range (700, bo karabin daleko siegajacy)
            const shootRange = this.isPursuit ? PURSUIT_SHOOT_RANGE : 640;
            if (now - this.lastShotTime >= this.shootIntervalMs && dist < shootRange) {
                this.lastShotTime = now;
                const muzzleOffset = this.isMegaBoss ? 70 : this.isBoss ? 55 : (this.isPursuit ? 48 : 40);
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
            } else if (this.isPursuit) {
                effects.shake(12, 16); // v0.58.0: solidny wstrzas przy zniszczeniu wozu
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
        if (this.isPursuit) return 8; // v0.58.0: hojny drop za twardy cel
        return 1;
    }

    /** v0.5 Etap 1: freeze power. */
    freeze(until: number): void {
        this.frozenUntil = until;
    }
}