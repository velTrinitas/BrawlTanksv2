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
import { nextNetId } from '../systems/NetId'; // COOP S5b
import { simNowMs } from '../systems/SimClock';
import { isPlasmaShotEnabled, PLASMA_TAIL_GHOSTS } from '../config/enemyShot'; // ENEMY-SHOT v0.235.0

/** Plazma liczona raz na sesje (URL nie zmienia sie w trakcie gry). */
const PLASMA_ON = isPlasmaShotEnabled();
/** Odstep duchow ogona wzdluz lotu (px) — 1:1 z symulacji (drawA). */
const PLASMA_GHOST_STEP = 5.5;

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
    /** COOP S5b: stabilny id encji do migawek hosta (LAN-3); nowy przy kazdym reuzyciu z puli (reset). */
    public netId: number = nextNetId();
    /** COOP LAN-3a: wyglad pocisku (migawka hosta odtwarza go u goscia). */
    public bulletType: EnemyBulletType | null = null;
    public color = 0;
    public angle = 0;
    public x: number = 0;
    public y: number = 0;
    public active: boolean = true;
    public distance: number = 0;
    public dmg: number = 0;
    public speed: number = 0;
    public radius: number = 5;
    public vx: number = 0;
    public vy: number = 0;
    public gfx: PIXI.Graphics | null = null; // flat path display object (null w trybie bake)

    // FAZA P4 Sprite Baker
    private bakerActive: boolean = false;
    private sprite: PIXI.Sprite | null = null; // bake path display object
    private spinMode: 'dir' | 'none' = 'none';
    /** ENEMY-SHOT: duchy ogona plazmowej kuli (leniwie, raz na instancje z puli; ten sam sprite). */
    private ghosts: PIXI.Sprite[] = [];
    private plasma = false;

    // POOLING (v0.73.6) — kontener trzymany, by reset() mogl leniwie dotworzyc
    // brakujacy display object (gdy pooled pocisk zmienia tryb baked<->flat).
    private worldContainer: PIXI.Container;

    constructor(
        x: number, y: number, angle: number,
        speed: number, dmg: number, color: number,
        worldContainer: PIXI.Container,
        bulletType: EnemyBulletType | null = null,
    ) {
        this.worldContainer = worldContainer;
        // Jedno zrodlo konfiguracji: reset() ustawia CALY stan runtime + display.
        this.reset(x, y, angle, speed, dmg, color, bulletType);
    }

    /**
     * POOLING: rekonfiguracja instancji na nowy strzal (reuzycie z puli).
     * Obsluguje OBIE sciezki renderu bit-for-bit jak konstruktor sprzed poolingu:
     *  - baked (2.5D): PIXI.Sprite z upieczona tekstura per typ + spin,
     *  - flat: kolko z obrysem w kolorze pocisku.
     * Display object jest reuzywany (sprite: swap tekstury; gfx: redraw); tworzony
     * leniwie tylko gdy pooled pocisk przechodzi z jednego trybu w drugi (rzadkie —
     * dany typ wroga zawsze strzela tym samym typem pocisku).
     */
    reset(
        x: number, y: number, angle: number,
        speed: number, dmg: number, color: number,
        bulletType: EnemyBulletType | null,
    ): void {
        this.netId = nextNetId(); // COOP S5b: reuzycie z puli = nowa encja
        this.bulletType = bulletType; this.color = color; this.angle = angle; // COOP LAN-3a: wyglad do migawki
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.dmg = dmg;
        this.speed = speed;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        // FAZA P4 — czy uzyc upieczonej tekstury 2.5D (gated ?baker=1 + typ znany + tekstura gotowa).
        this.bakerActive = BAKER_ENABLED && bulletType !== null && EnemyBulletSpriteBaker.isBaked(bulletType);

        if (this.bakerActive && bulletType) {
            // 2.5D: PIXI.Sprite z labowa tekstura. Orientacja wg trybu spin.
            if (!this.sprite) {
                this.sprite = new PIXI.Sprite(EnemyBulletSpriteBaker.getTexture(bulletType));
                this.sprite.anchor.set(0.5);
                this.sprite.scale.set(ENEMY_BULLET_DISPLAY_SCALE);
                this.worldContainer.addChild(this.sprite);
            } else {
                this.sprite.texture = EnemyBulletSpriteBaker.getTexture(bulletType);
            }
            this.spinMode = EnemyBulletSpriteBaker.getSpin(bulletType).mode;
            // 'dir' = elipsa zorientowana wzdluz lotu (pocisk leci prosto -> ustawiamy raz).
            // 'none' = kula rotacyjnie symetryczna (bez rotacji).
            this.sprite.rotation = this.spinMode === 'dir' ? angle : 0;
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
            this.sprite.visible = true;
            if (this.gfx) this.gfx.visible = false; // ukryj tryb flat, gdy uzywamy baked
            // ENEMY-SHOT v0.235.0: plazmowa kula = puls + ogon z duchow (tylko enemy_basic).
            this.plasma = PLASMA_ON && bulletType === 'enemy_basic';
            if (this.plasma) {
                const tex = this.sprite.texture;
                while (this.ghosts.length < PLASMA_TAIL_GHOSTS) {
                    const gs = new PIXI.Sprite(tex);
                    gs.anchor.set(0.5);
                    this.worldContainer.addChild(gs);
                    this.ghosts.push(gs);
                }
                for (let i = 0; i < this.ghosts.length; i++) {
                    const gs = this.ghosts[i];
                    const k = i + 1;
                    gs.texture = tex;
                    gs.scale.set(ENEMY_BULLET_DISPLAY_SCALE * (1 - k * 0.15));
                    gs.alpha = 0.38 - k * 0.07;
                    gs.visible = true;
                }
                this.placePlasma();
            } else {
                this.sprite.scale.set(ENEMY_BULLET_DISPLAY_SCALE);
                for (const gs of this.ghosts) gs.visible = false;
            }
        } else {
            // ── FLAT PATH (bit-for-bit jak dotad) ──
            if (!this.gfx) {
                this.gfx = new PIXI.Graphics();
                this.worldContainer.addChild(this.gfx);
            }
            this.gfx.clear();
            this.gfx.beginFill(color);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.endFill();
            // Subtle outline zeby byl widoczny na czarnym tle
            this.gfx.lineStyle(1.5, 0x000000, 0.6);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
            this.gfx.visible = true;
            if (this.sprite) this.sprite.visible = false; // ukryj tryb baked, gdy uzywamy flat
            this.plasma = false;
            for (const gs of this.ghosts) gs.visible = false;
        }
    }

    update(delta: number, buildings: ICollidable[], effects: EffectsManager): void {
        if (!this.active) return;

        this.x += this.vx * delta;
        this.y += this.vy * delta;

        // Wall collision (+ ARC-R1: duck-typing takeDamage jak w Bullet.ts —
        // wrogowie tez rozbijaja niszczalne przeszkody, np. kostki lodu, by dopasc gracza)
        for (const b of buildings) {
            if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                const destructible = b as ICollidable & {
                    takeDamage?(dmg: number, hitX: number, hitY: number): void;
                    takeEnemyDamage?(dmg: number, hitX: number, hitY: number): void;
                };
                // DESERT ART v2 / E4: obiekt moze rozrozniac pociski wroga (piramida — wrog NIE
                // budzi klatwy, decyzja Mariusza 2026-09-28). Bez tej metody: stare zachowanie.
                if (typeof destructible.takeEnemyDamage === 'function') {
                    destructible.takeEnemyDamage(this.dmg, this.x, this.y);
                } else if (typeof destructible.takeDamage === 'function') {
                    destructible.takeDamage(this.dmg, this.x, this.y);
                } else {
                    effects.spawnWallImpact(this.x, this.y);
                }
                this.deactivate();
                return;
            }
        }

        // Display object update (bake = sprite; flat = gfx). 'dir'/'none' ustawione w reset()
        // (lot prosty), wiec tu tylko pozycja + zIndex.
        if (this.bakerActive && this.sprite) {
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
            if (this.plasma) this.placePlasma();
        } else if (this.gfx) {
            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
        }

        this.distance += this.speed * delta;
        if (this.distance > 900) this.deactivate();
    }

    /** COOP LAN-3a: pozycja z migawki hosta — TYLKO widok (u goscia bez lotu i kolizji). */
    setPose(x: number, y: number): void {
        this.x = x; this.y = y;
        const d = this.bakerActive && this.sprite ? this.sprite : this.gfx;
        if (d) { d.x = x; d.y = y; d.zIndex = y + 10; }
        if (this.plasma) this.placePlasma(); // gosc koopa widzi ten sam puls i ogon
    }

    /**
     * ENEMY-SHOT v0.235.0: puls jadra (1 +- 15%, sin(t*22), zegar MECZU — zamiera w pauzie)
     * + duchy ogona co 5,5 px wstecz wzdluz lotu. Tylko transformy, zero redraw.
     */
    private placePlasma(): void {
        const sp = this.sprite;
        if (!sp) return;
        const pulse = 1 + 0.15 * Math.sin((simNowMs() / 1000) * 22);
        sp.scale.set(ENEMY_BULLET_DISPLAY_SCALE * pulse);
        const inv = this.speed > 0 ? 1 / this.speed : 0;
        const ux = this.vx * inv, uy = this.vy * inv;
        for (let i = 0; i < this.ghosts.length; i++) {
            const gs = this.ghosts[i];
            const k = (i + 1) * PLASMA_GHOST_STEP;
            gs.x = this.x - ux * k;
            gs.y = this.y - uy * k;
            gs.zIndex = this.y + 9;
        }
    }

    /**
     * POOLING (v0.73.6): "wlozenie do pudelka" — chowamy display object zamiast
     * niszczyc. Sprite/gfx ZOSTAJA w kontenerze (visible=false), gotowe do reset().
     * NIE niszczymy tekstury (wspoldzielona/cache). Teardown miedzy meczami =
     * worldContainer.removeChildren() + wyzerowanie puli w startGame.
     */
    deactivate(): void {
        this.active = false;
        if (this.sprite) this.sprite.visible = false;
        if (this.gfx) this.gfx.visible = false;
        for (const gs of this.ghosts) gs.visible = false;
    }

    /** Pelne zniszczenie (nieuzywane w hot-path po poolingu; zostaje dla teardownu). */
    destroy(): void {
        this.active = false;
        if (this.sprite) {
            if (this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
            this.sprite.destroy();
            this.sprite = null;
        }
        if (this.gfx) {
            if (this.gfx.parent) this.gfx.parent.removeChild(this.gfx);
            this.gfx.destroy();
            this.gfx = null;
        }
        for (const gs of this.ghosts) { if (gs.parent) gs.parent.removeChild(gs); gs.destroy(); }
        this.ghosts = [];
    }
}