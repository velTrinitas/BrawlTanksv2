import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';
import type { ICollidable } from '../types/MapType';
import { AudioSys } from '../audio/AudioSys';
import { BAKER_ENABLED } from '../rendering/SpriteFactory';
import { BulletSpriteBaker } from '../rendering/BulletSpriteBaker';

/**
 * Bullet z per-brawler stats + super-shot mode (v0.7 Sesja 5).
 * v0.5 Etap 2: SPEED_MAP, RADIUS_MAP, TRAIL_LEN_MAP per brawler.id zgodne z v4.48.
 * v0.7 Sesja 5: dodane wall hit audio.
 *
 * FAZA P2 Sprite Baker — gdy ?baker=1 i tekstury upieczone, flat PIXI.Graphics kolko
 * podmieniane na PIXI.Sprite z labowa tekstura pocisku (1:1 render2d/fire). Hitbox (radius)
 * BEZ zmian — czysto wizualne. Flat path (flaga OFF) bit-for-bit jak dotad.
 */

// Per-brawler base stats (z v4.48 linia 1986-1999)
const SPEED_MAP: Record<string, number> = {
    twardy: 17, heavy: 13, scout: 27, sniper: 29,
    plasma: 17, pyro: 14, shadow: 19, king: 14,
};

const RADIUS_MAP: Record<string, number> = {
    twardy: 6, heavy: 11, scout: 4, sniper: 4,
    plasma: 9, pyro: 10, shadow: 8, king: 10,
};

const TRAIL_LEN_MAP: Record<string, number> = {
    twardy: 10, heavy: 7, scout: 16, sniper: 0,
    plasma: 5, pyro: 10, shadow: 7, king: 5,
};

const COLOR_MAP: Record<string, number> = {
    twardy: 0x2ecc71,
    heavy:  0x8e44ad,
    scout:  0xf1c40f,
    sniper: 0xffffff,
    plasma: 0x00cec9,
    pyro:   0xe74c3c,
    shadow: 0x6c3483,
    king:   0xd35400,
};

// Super-shot multipliers (v4.48 wierność)
const SUPER_DMG_MULT = 3;
const SUPER_RADIUS_MULT = 1.5;
const SUPER_TRAIL_MULT = 1.5;

// Fioletowy tint (Q2🅲️ user choice) — flat path only.
const SUPER_TINT = 0xc850ff;
const SUPER_SPARKLE_EVERY_FRAMES = 5;

// FAZA P2 — display scale pocisku w trybie bake (musi pasowac do Player.ts BAKE_DISPLAY_SCALE = 1.25,
// zeby pociski byly spojne wizualnie z powiekszonym czolgiem 2.5D).
const BULLET_DISPLAY_SCALE = 1.25;

// FAZA P5 Batch 2 — kontekst do update() (breakup spawnuje fragi do bullets[], boomerang namierza gracza).
export interface BulletCtx { bullets: Bullet[]; playerX: number; playerY: number; }

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
    public gfx!: PIXI.Graphics;        // flat path display object (undefined w trybie bake)
    public isSuper: boolean;

    // FAZA P5 Batch 2 — behavior system (breakup / boomerang)
    public behavior: 'straight' | 'breakup' | 'boomerang' | 'shockwave' = 'straight';
    public maxDist: number = 1000;
    public shockwaveRadius = 0; public shockwaveDmg = 0; // FAZA P5 Batch 3 (pancerny shockwave-on-hit; czytane w hit handlerze)
    public hitEnemies: Set<object> = new Set(); // boomerang pierce dedup (per faza)
    private breakupDist = 0; private fragCount = 0; private fragSpread = 0; private fragDmgMult = 0;
    private maxOutDist = 0; private returnSpeed = 0;
    private phase: 'out' | 'back' = 'out';
    private boomerangLife = 0;
    private readonly worldContainer: PIXI.Container;
    private readonly brawlerInfo: Brawler;

    private trailLen: number;
    private trail: Array<{ x: number; y: number }> = [];
    private trailGfx: PIXI.Graphics | null = null;
    private brawlerColor: number;
    private sparkleTimer: number = 0;

    // FAZA P2 Sprite Baker
    private bakerActive: boolean = false;
    private sprite: PIXI.Sprite | null = null;   // bake path display object
    private spinMode: 'dir' | 'spin' | 'none' = 'none';
    private spinRate: number = 0;
    private superTrailColor: number;             // per-brawler super tint (bake) lub SUPER_TINT (flat)

    constructor(
        x: number, y: number, angle: number,
        brawlerInfo: Brawler,
        worldContainer: PIXI.Container,
        isSuper: boolean = false,
        superDmgOverride?: number   // FAZA P5 - super v2: dmg per-pocisk niezalezny od brawler.dmg*3 (null => stara logika)
    ) {
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.isSuper = isSuper;
        this.worldContainer = worldContainer;
        this.brawlerInfo = brawlerInfo;

        const baseSpeed = SPEED_MAP[brawlerInfo.id] ?? 15;
        const baseRadius = RADIUS_MAP[brawlerInfo.id] ?? 6;
        const baseTrail = TRAIL_LEN_MAP[brawlerInfo.id] ?? 0;

        this.dmg = superDmgOverride != null ? superDmgOverride : brawlerInfo.dmg * (isSuper ? SUPER_DMG_MULT : 1);
        this.speed = baseSpeed;
        this.radius = baseRadius * (isSuper ? SUPER_RADIUS_MULT : 1);
        this.trailLen = Math.ceil(baseTrail * (isSuper ? SUPER_TRAIL_MULT : 1));

        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;

        this.brawlerColor = COLOR_MAP[brawlerInfo.id] ?? 0x2ecc71;

        // FAZA P2 — czy uzyc upieczonej tekstury 2.5D (gated ?baker=1 + tekstury gotowe).
        this.bakerActive = BAKER_ENABLED && BulletSpriteBaker.isBaked(brawlerInfo.id);

        // Kolor super-trailu/sparkli: bake = per-brawler signature tint; flat = legacy fiolet.
        this.superTrailColor = this.bakerActive
            ? BulletSpriteBaker.getSuperTintNum(brawlerInfo.id)
            : SUPER_TINT;

        if (this.bakerActive) {
            // 2.5D: PIXI.Sprite z labowa tekstura (aura wpieczona dla super). Rotacja wg trybu.
            this.sprite = new PIXI.Sprite(BulletSpriteBaker.getTexture(brawlerInfo.id, isSuper));
            this.sprite.anchor.set(0.5);
            this.sprite.scale.set(BULLET_DISPLAY_SCALE);

            const sm = BulletSpriteBaker.getSpin(brawlerInfo.id);
            this.spinMode = sm.mode;
            this.spinRate = sm.rate;
            // 'dir' = orientacja stala wzdluz lotu (pocisk leci prosto -> ustawiamy raz).
            if (this.spinMode === 'dir') this.sprite.rotation = angle;

            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
            worldContainer.addChild(this.sprite);
        } else {
            // ── FLAT PATH (bit-for-bit jak dotad) ──
            const drawColor = isSuper ? SUPER_TINT : this.brawlerColor;

            this.gfx = new PIXI.Graphics();

            // Outer glow gdy super (fioletowy halo)
            if (isSuper) {
                this.gfx.beginFill(SUPER_TINT, 0.35);
                this.gfx.drawCircle(0, 0, this.radius + 5);
                this.gfx.endFill();
                this.gfx.beginFill(SUPER_TINT, 0.55);
                this.gfx.drawCircle(0, 0, this.radius + 2);
                this.gfx.endFill();
            }

            // Core
            this.gfx.beginFill(drawColor);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.endFill();

            // Inner highlight (3D look)
            this.gfx.beginFill(0xffffff, isSuper ? 0.8 : 0.6);
            this.gfx.drawCircle(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.35);
            this.gfx.endFill();

            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
            worldContainer.addChild(this.gfx);
        }

        // Trail (oba tryby — decision B: game trail TRAIL_LEN_MAP zachowany).
        if (this.trailLen > 0) {
            this.trailGfx = new PIXI.Graphics();
            this.trailGfx.zIndex = this.y + 9;
            worldContainer.addChild(this.trailGfx);
        }
    }

    update(delta: number, buildings: ICollidable[], effects: EffectsManager, ctx?: BulletCtx): void {
        if (!this.active) return;

        if (this.trailLen > 0) {
            this.trail.push({ x: this.x, y: this.y });
            while (this.trail.length > this.trailLen) {
                this.trail.shift();
            }
        }

        if (this.behavior === 'boomerang') {
            // FAZA P5 Batch 2 — boomerang: out -> powrot do gracza (pomija sciany).
            this.stepBoomerang(delta, ctx);
        } else {
            this.x += this.vx * delta;
            this.y += this.vy * delta;
            this.distance += this.speed * delta;

            // FAZA P5 Batch 2 — breakup: na breakupDist rozbij na fragmenty i zgin.
            if (this.behavior === 'breakup' && this.distance >= this.breakupDist) {
                if (ctx) this.spawnFrags(ctx);
                this.destroy();
                return;
            }

            // Wall collision (+ destructibles routing — v0.34.0 T7 crates)
            for (const b of buildings) {
                if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                    const destructible = b as ICollidable & { takeDamage?: (dmg: number, hitX: number, hitY: number) => void };
                    if (typeof destructible.takeDamage === 'function') {
                        destructible.takeDamage(this.dmg, this.x, this.y);
                    } else {
                        effects.spawnWallImpact(this.x, this.y);
                        AudioSys.getInstance().playHit('wall');
                    }
                    this.destroy();
                    return;
                }
            }

            if (this.distance > this.maxDist) { this.destroy(); return; }
        }

        if (!this.active) return; // boomerang moglo zginac (zlapany/safety)

        // Display object update (bake = sprite + rotation; flat = gfx).
        if (this.bakerActive && this.sprite) {
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
            if (this.spinMode === 'spin') {
                this.sprite.rotation = performance.now() * this.spinRate;
            } else if (this.behavior === 'boomerang' && this.spinMode === 'dir') {
                this.sprite.rotation = Math.atan2(this.vy, this.vx); // boomerang podaza za wektorem lotu
            }
        } else {
            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
        }

        // Render trail (oba tryby).
        if (this.trailGfx && this.trail.length > 0) {
            this.trailGfx.clear();
            const trailColor = this.isSuper ? this.superTrailColor : this.brawlerColor;
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i];
                const alphaProg = (i + 1) / this.trail.length;
                const alpha = alphaProg * 0.6;
                const radius = this.radius * alphaProg * 0.8;
                this.trailGfx.beginFill(trailColor, alpha);
                this.trailGfx.drawCircle(t.x, t.y, radius);
                this.trailGfx.endFill();
            }
        }

        // Sparkle trail gdy super.
        if (this.isSuper) {
            this.sparkleTimer += delta;
            if (this.sparkleTimer >= SUPER_SPARKLE_EVERY_FRAMES) {
                this.sparkleTimer = 0;
                effects.spawnEnemyHitSparks(this.x, this.y, this.superTrailColor);
            }
        }
    }

    /** FAZA P5 Batch 2 — boomerang: faza out do maxOutDist, potem powrot do gracza. */
    private stepBoomerang(delta: number, ctx?: BulletCtx): void {
        if (this.phase === 'out') {
            this.x += this.vx * delta;
            this.y += this.vy * delta;
            this.distance += this.speed * delta;
            if (this.distance >= this.maxOutDist) {
                this.phase = 'back';
                this.hitEnemies.clear(); // reset dedup na powrot (1 hit/wroga/kierunek)
                this.boomerangLife = 0;
            }
        } else {
            const px = ctx ? ctx.playerX : this.x;
            const py = ctx ? ctx.playerY : this.y;
            const dx = px - this.x, dy = py - this.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < 34) { this.destroy(); return; } // zlapany przez gracza
            const rs = this.returnSpeed;
            this.vx += (dx / d * rs - this.vx) * 0.2;
            this.vy += (dy / d * rs - this.vy) * 0.2;
            this.x += this.vx * delta;
            this.y += this.vy * delta;
            this.boomerangLife += delta;
            if (this.boomerangLife > 150) this.destroy(); // safety ~2.5s @60fps
        }
    }

    /** FAZA P5 Batch 2 — breakup: spawn fragCount fragmentow (straight, krotki zywot, ulamek dmg). */
    private spawnFrags(ctx: BulletCtx): void {
        const base = Math.atan2(this.vy, this.vx);
        const n = this.fragCount;
        const fragDmg = this.dmg * this.fragDmgMult;
        for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * this.fragSpread;
            const frag = new Bullet(this.x, this.y, a, this.brawlerInfo, this.worldContainer, this.isSuper, fragDmg);
            frag.speed *= 0.85;
            frag.vx = Math.cos(a) * frag.speed;
            frag.vy = Math.sin(a) * frag.speed;
            frag.maxDist = 300;
            ctx.bullets.push(frag);
        }
    }

    /** FAZA P5 Batch 2 — ustaw behavior + params z profilu (po new Bullet w fire loop). */
    applyBehavior(cfg: { behavior?: 'breakup' | 'boomerang' | 'shockwave'; breakupDist?: number; fragCount?: number; fragSpread?: number; fragDmgMult?: number; maxOutDist?: number; shockwaveRadius?: number; shockwaveDmg?: number; }): void {
        if (!cfg.behavior) return;
        this.behavior = cfg.behavior;
        if (cfg.behavior === 'shockwave') {
            // shockwave: pocisk leci prosto (straight movement), AoE odpala sie w hit handlerze main.ts.
            this.shockwaveRadius = cfg.shockwaveRadius ?? 150;
            this.shockwaveDmg = cfg.shockwaveDmg ?? 225;
        } else if (cfg.behavior === 'breakup') {
            this.breakupDist = cfg.breakupDist ?? 220;
            this.fragCount = cfg.fragCount ?? 5;
            this.fragSpread = cfg.fragSpread ?? 0.26;
            this.fragDmgMult = cfg.fragDmgMult ?? 0.35;
        } else if (cfg.behavior === 'boomerang') {
            this.maxOutDist = cfg.maxOutDist ?? 400;
            this.speed *= 1.15; this.vx *= 1.15; this.vy *= 1.15; // FAZA P5 Batch 2 - boomerang 15% szybszy
            this.returnSpeed = this.speed; // powrot z (podbita) predkoscia lotu (tunable)
            this.phase = 'out';
        }
    }

    destroy(): void {
        this.active = false;
        if (this.bakerActive) {
            if (this.sprite) {
                if (this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
                this.sprite.destroy();   // texture cached/shared w bakerze -> NIE niszczymy tekstury
                this.sprite = null;
            }
        } else {
            if (this.gfx.parent) this.gfx.parent.removeChild(this.gfx);
            this.gfx.destroy();
        }
        if (this.trailGfx) {
            if (this.trailGfx.parent) this.trailGfx.parent.removeChild(this.trailGfx);
            this.trailGfx.destroy();
            this.trailGfx = null;
        }
    }
}