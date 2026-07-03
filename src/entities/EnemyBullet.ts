import * as PIXI from 'pixi.js';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';
import type { ICollidable } from '../types/MapType';
import { BAKER_ENABLED } from '../rendering/SpriteFactory';
import {
    EnemyBulletSpriteBaker,
    ENEMY_BULLET_DISPLAY_SCALE,
    type EnemyBulletType,
} from '../rendering/EnemyBulletSpriteBaker';

/**
 * EnemyBullet z per-typ 2.5D bake (FAZA P4).
 *
 * Gdy ?baker=1 i tekstura upieczona, flat PIXI.Graphics kolko podmieniane na PIXI.Sprite z labowa
 * tekstura pocisku (render2d drawBullet: enemy_basic / boss_shell / mega_shell). Hitbox/kolizje BEZ
 * zmian — czysto wizualne. Flat path (flaga OFF, albo bulletType=null np. pursuit) bit-for-bit jak dotad.
 *
 * TYP pocisku przepchniety z Enemy.ts przez EnemyShotInfo.bulletType -> main.ts spawnEnemyShot ->
 * tu. null => flat (pursuit i inne bez upieczonego typu). Baker wie ktory drawBullet upiec + jak
 * zorientowac sprite (spin: 'none' kula enemy_basic / 'dir' elipsa boss_shell+mega_shell).
 */
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
    public gfx!: PIXI.Graphics; // flat path display object (undefined w trybie bake)

    // FAZA P4 Sprite Baker
    private bakerActive: boolean = false;
    private sprite: PIXI.Sprite | null = null; // bake path display object
    private spinMode: 'dir' | 'none' = 'none';

    constructor(
        x: number, y: number, angle: number,
        speed: number, dmg: number, color: number,
        worldContainer: PIXI.Container,
        bulletType: EnemyBulletType | null = null,
    ) {
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.dmg = dmg;
        this.speed = speed;
        this.radius = 5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        // FAZA P4 — czy uzyc upieczonej tekstury 2.5D (gated ?baker=1 + typ znany + tekstura gotowa).
        this.bakerActive = BAKER_ENABLED && bulletType !== null && EnemyBulletSpriteBaker.isBaked(bulletType);

        if (this.bakerActive && bulletType) {
            // 2.5D: PIXI.Sprite z labowa tekstura. Orientacja wg trybu spin.
            this.sprite = new PIXI.Sprite(EnemyBulletSpriteBaker.getTexture(bulletType));
            this.sprite.anchor.set(0.5);
            this.sprite.scale.set(ENEMY_BULLET_DISPLAY_SCALE);

            this.spinMode = EnemyBulletSpriteBaker.getSpin(bulletType).mode;
            // 'dir' = elipsa zorientowana wzdluz lotu (pocisk leci prosto -> ustawiamy raz).
            // 'none' = kula rotacyjnie symetryczna (bez rotacji).
            if (this.spinMode === 'dir') this.sprite.rotation = angle;

            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
            worldContainer.addChild(this.sprite);
        } else {
            // ── FLAT PATH (bit-for-bit jak dotad) ──
            this.gfx = new PIXI.Graphics();
            this.gfx.beginFill(color);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.endFill();
            // Subtle outline zeby byl widoczny na czarnym tle
            this.gfx.lineStyle(1.5, 0x000000, 0.6);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
            worldContainer.addChild(this.gfx);
        }
    }

    update(delta: number, buildings: ICollidable[], effects: EffectsManager): void {
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

        // Display object update (bake = sprite; flat = gfx). 'dir'/'none' ustawione w konstruktorze
        // (lot prosty), wiec tu tylko pozycja + zIndex.
        if (this.bakerActive && this.sprite) {
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
        } else {
            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
        }

        this.distance += this.speed * delta;
        if (this.distance > 900) this.destroy();
    }

    destroy(): void {
        this.active = false;
        if (this.bakerActive) {
            if (this.sprite) {
                if (this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
                this.sprite.destroy(); // tekstura cached/shared w bakerze -> NIE niszczymy tekstury
                this.sprite = null;
            }
        } else {
            if (this.gfx.parent) {
                this.gfx.parent.removeChild(this.gfx);
            }
            this.gfx.destroy();
        }
    }
}