import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';
import { getTrailTexture, getGlowTexture, getArcTextures, getZigzagTrailTexture } from '../rendering/Effects';
import { isTankArtV2 } from '../config/tankArtFlag';
import { shotFxFor } from '../config/shotFx';
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
    // POOLING: initializery (pola ustawiane w reset(), nie wprost w konstruktorze).
    public x: number = 0;
    public y: number = 0;
    public active: boolean = true;
    public distance: number = 0;
    public dmg: number = 0;
    public speed: number = 0;
    public radius: number = 0;
    public vx: number = 0;
    public vy: number = 0;
    public gfx: PIXI.Graphics | null = null;  // flat path display object (null w trybie bake)
    public isSuper: boolean = false;
    /**
     * F7b-2: zrodlo pocisku. 'tower' = pocisk Wiezy MG — kill-path w main.ts pomija
     * combo/celnosc/frozen-bonus (auto-aim != skill; celnosc >100% lamalaby L2b).
     */
    public source: 'player' | 'tower' = 'player';

    // FAZA P5 Batch 2 — behavior system (breakup / boomerang)
    public behavior: 'straight' | 'breakup' | 'boomerang' | 'shockwave' = 'straight';
    public maxDist: number = 1000;
    public shockwaveRadius = 0; public shockwaveDmg = 0; // FAZA P5 Batch 3 (pancerny shockwave-on-hit; czytane w hit handlerze)
    public hitEnemies: Set<object> = new Set(); // boomerang pierce dedup (per faza)
    /** BALANCE_V2 (S3): ile wrogow pocisk jeszcze przebije (Tech). 0 = ginie na pierwszym trafieniu. */
    public pierceLeft = 0;
    /** v0.211.0 Snajper: dmg po pierwszym trafieniu (null = pelne, jak Tech). */
    public pierceDmgAfter: number | null = null;
    private breakupDist = 0; private fragCount = 0; private fragSpread = 0; private fragDmgMult = 0;
    private maxOutDist = 0; private returnSpeed = 0;
    private phase: 'out' | 'back' = 'out';
    private boomerangLife = 0;
    private readonly worldContainer: PIXI.Container;
    private readonly brawlerInfo: Brawler;

    private trailLen: number = 0;
    // v0.73.7 PERF (minor-GC): ring-buffer prealokowanych punktow zamiast push/shift {x,y} co klatke.
    // Punkty tworzone raz i reuzywane; trailHead = nastepny slot zapisu, trailCount = ile waznych.
    private trailPts: Array<{ x: number; y: number }> = [];
    private trailHead: number = 0;
    private trailCount: number = 0;
    private trailGfx: PIXI.Graphics | null = null;
    /**
     * TANK ART v2: smuga jako JEDEN sprite ADD (tekstura 64x8, anchor 1,0.5, tint) na
     * effects.fxAddLayer — zamiast trailGfx (do 16 kolek retesselowanych CO KLATKE per pocisk).
     * Dlugosc rosnie z przebyta droga (nie wystaje za lufe), rotacja = wektor lotu.
     */
    private trailSprite: PIXI.Sprite | null = null;
    /** TANK ART v2: dodatkowe sprite'y ADD per pocisk (glow / luki / orbitery) — max 3, leniwie. */
    private fxA: PIXI.Sprite | null = null;
    private fxB: PIXI.Sprite | null = null;
    private fxC: PIXI.Sprite | null = null;
    private fxT = 0;
    private readonly artV2: boolean = isTankArtV2() && BAKER_ENABLED;
    private brawlerColor: number = 0;
    private sparkleTimer: number = 0;

    // FAZA P2 Sprite Baker
    private bakerActive: boolean = false;
    private sprite: PIXI.Sprite | null = null;   // bake path display object
    private spinMode: 'dir' | 'spin' | 'none' = 'none';
    private spinRate: number = 0;
    private superTrailColor: number = SUPER_TINT; // per-brawler super tint (bake) lub SUPER_TINT (flat)

    constructor(
        x: number, y: number, angle: number,
        brawlerInfo: Brawler,
        worldContainer: PIXI.Container,
        isSuper: boolean = false,
        superDmgOverride?: number   // FAZA P5 - super v2: dmg per-pocisk niezalezny od brawler.dmg*3 (null => stara logika)
    ) {
        this.worldContainer = worldContainer;
        this.brawlerInfo = brawlerInfo;
        this.isSuper = isSuper;
        // FAZA P2 — czy uzyc upieczonej tekstury 2.5D (gated ?baker=1 + tekstury gotowe).
        // Staly per-brawler (nie zmienia sie w meczu), wiec ustawiamy raz w konstruktorze.
        this.bakerActive = BAKER_ENABLED && BulletSpriteBaker.isBaked(brawlerInfo.id);
        this.superTrailColor = this.bakerActive
            ? BulletSpriteBaker.getSuperTintNum(brawlerInfo.id)
            : SUPER_TINT;
        this.brawlerColor = COLOR_MAP[brawlerInfo.id] ?? 0x2ecc71;
        // Jedno zrodlo konfiguracji: reset() ustawia CALY stan runtime + display.
        this.reset(x, y, angle, isSuper, superDmgOverride);
    }

    /**
     * POOLING (v0.73.7): rekonfiguracja instancji na nowy strzal (reuzycie z puli).
     *
     * Odtwarza DOKLADNIE stan konstruktora + ZERUJE caly stan zachowan (behavior,
     * hitEnemies, smuga, fazy bumerangu, breakup/shockwave params, sparkleTimer),
     * zeby po "umyciu kubka" nie zostal ZADEN slad po poprzednim strzale. behavior
     * ustawia potem applyBehavior() (jak przy new Bullet w petli strzalu).
     *
     * Display object jest reuzywany (sprite: swap tekstury super/normal; gfx: redraw)
     * — tworzony leniwie tylko przy pierwszym uzyciu instancji.
     */
    reset(x: number, y: number, angle: number, isSuper: boolean, superDmgOverride?: number): void {
        const b = this.brawlerInfo;
        this.x = x; this.y = y;
        this.active = true;
        this.distance = 0;
        this.isSuper = isSuper;

        const baseSpeed = SPEED_MAP[b.id] ?? 15;
        // BALANCE_V2 (S1): promien pocisku to UKRYTA statystyka celnosci — trafienie liczy sie jako
        // `30 + radius` (main.ts), wiec Zwiad/Snajper (4) mieli ~40% mniejsze pole niz King (10).
        // Ruleset moze go nadpisac; fallback = dzisiejsza mapa, wiec Wieza/Ping-Pong bez zmian.
        const baseRadius = b.bulletRadius ?? RADIUS_MAP[b.id] ?? 6;
        const baseTrail = TRAIL_LEN_MAP[b.id] ?? 0;

        this.dmg = superDmgOverride != null ? superDmgOverride : b.dmg * (isSuper ? SUPER_DMG_MULT : 1);
        this.speed = baseSpeed;
        this.radius = baseRadius * (isSuper ? SUPER_RADIUS_MULT : 1);
        this.trailLen = Math.ceil(baseTrail * (isSuper ? SUPER_TRAIL_MULT : 1));

        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;

        // ── ZEROWANIE stanu zachowan (kluczowe: brak sladu po poprzednim strzale) ──
        this.source = 'player'; // F7b-2: pooled pocisk Wiezy nie moze wrocic jako 'tower'
        this.brawlerColor = COLOR_MAP[b.id] ?? 0x2ecc71; // F7b-2: cofniecie teal-tracera
        // BALANCE_V2 (S3): ile jeszcze wrogow ten pocisk przebije (Tech). 0 = zwykly pocisk,
        // ginie na pierwszym trafieniu. Zerowane TUTAJ, zeby pooled pocisk Wiezy/Ping-Ponga nigdy
        // nie odziedziczyl przebicia po poprzednim strzale gracza.
        this.pierceLeft = isSuper ? 0 : (b.pierce ?? 0);
        this.pierceDmgAfter = isSuper ? null : (b.pierceDmgAfter ?? null); // v0.211.0
        this.behavior = 'straight';
        // BALANCE_V2 (S2): ZASIEG per czolg. Ustawiany TUTAJ, nigdy mnoznikiem w update() —
        // Wieza (main.ts, 460) i Ping-Pong (900) nadpisuja `maxDist` PO resecie i dziela te sama
        // pule pociskow; mnoznik w locie dalby im zasieg brawlera gracza.
        this.maxDist = b.maxDist ?? 1000;
        this.shockwaveRadius = 0;
        this.shockwaveDmg = 0;
        this.hitEnemies.clear();
        this.breakupDist = 0; this.fragCount = 0; this.fragSpread = 0; this.fragDmgMult = 0;
        this.maxOutDist = 0; this.returnSpeed = 0;
        this.phase = 'out';
        this.boomerangLife = 0;
        this.trailHead = 0; this.trailCount = 0; // v0.73.7 PERF: reset ring-buffera (pool punktow zostaje do reuzycia)
        this.sparkleTimer = 0;

        if (this.bakerActive) {
            // 2.5D: PIXI.Sprite z labowa tekstura (aura wpieczona dla super). Rotacja wg trybu.
            if (!this.sprite) {
                this.sprite = new PIXI.Sprite(BulletSpriteBaker.getTexture(b.id, isSuper));
                this.sprite.anchor.set(0.5);
                this.sprite.scale.set(BULLET_DISPLAY_SCALE);
                const sm = BulletSpriteBaker.getSpin(b.id);
                this.spinMode = sm.mode;
                this.spinRate = sm.rate;
                this.worldContainer.addChild(this.sprite);
            } else {
                this.sprite.texture = BulletSpriteBaker.getTexture(b.id, isSuper); // super/normal swap
            }
            // F7b-2: cofniecie restylingu Wiezy (pooled sprite mogl byc teal + zmniejszony).
            this.sprite.tint = 0xffffff;
            this.sprite.scale.set(BULLET_DISPLAY_SCALE);
            if (this.spinMode === 'dir') this.sprite.rotation = angle;
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.zIndex = this.y + 10;
            this.sprite.visible = true;
        } else {
            // ── FLAT PATH (bit-for-bit jak dotad) ──
            if (!this.gfx) {
                this.gfx = new PIXI.Graphics();
                this.worldContainer.addChild(this.gfx);
            }
            const drawColor = isSuper ? SUPER_TINT : this.brawlerColor;
            this.gfx.clear();
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
            this.gfx.visible = true;
        }

        // TANK ART v2: smuga-sprite (tworzona leniwie w update, gdy znamy effects.fxAddLayer).
        if (this.artV2) {
            this.fxT = 0;
            if (this.fxA) this.fxA.visible = false;
            if (this.fxB) this.fxB.visible = false;
            if (this.fxC) this.fxC.visible = false;
            if (this.trailSprite) { this.trailSprite.visible = false; this.trailSprite.width = 0; }
            if (this.trailGfx) { this.trailGfx.clear(); this.trailGfx.visible = false; }
        } else
        // Trail (oba tryby — decision B: game trail TRAIL_LEN_MAP zachowany).
        // Obecnosc trailGfx zalezy od baseTrail>0 (stala per-brawler), wiec tworzymy
        // raz i reuzywamy (clear + show). Sniper (baseTrail 0) nigdy nie ma trailGfx.
        if (this.trailLen > 0) {
            if (!this.trailGfx) {
                this.trailGfx = new PIXI.Graphics();
                this.worldContainer.addChild(this.trailGfx);
            }
            this.trailGfx.clear();
            this.trailGfx.zIndex = this.y + 9;
            this.trailGfx.visible = true;
        } else if (this.trailGfx) {
            this.trailGfx.clear();
            this.trailGfx.visible = false;
        }
    }

    update(delta: number, buildings: ICollidable[], effects: EffectsManager, ctx?: BulletCtx): void {
        if (!this.active) return;

        if (this.trailLen > 0) {
            // v0.73.7 PERF: zapis do ring-buffera bez alokacji (pool rosnie do trailLen raz).
            const cap = this.trailLen;
            while (this.trailPts.length < cap) this.trailPts.push({ x: 0, y: 0 });
            const p = this.trailPts[this.trailHead];
            p.x = this.x; p.y = this.y;
            this.trailHead = (this.trailHead + 1) % cap;
            if (this.trailCount < cap) this.trailCount++;
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
                this.deactivate();
                return;
            }

            // Wall collision (+ destructibles routing — v0.34.0 T7 crates)
            for (const b of buildings) {
                if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                    const destructible = b as ICollidable & { takeDamage?: (dmg: number, hitX: number, hitY: number, heavy?: boolean) => void };
                    if (typeof destructible.takeDamage === 'function') {
                        // SAVE THE QUEEN Q2: 4. arg "heavy" = super strzal (Zwornik odporny na zwykle pociski); inne propy go ignoruja
                        destructible.takeDamage(this.dmg, this.x, this.y, this.isSuper);
                    } else {
                        effects.spawnWallImpact(this.x, this.y);
                        if (this.artV2 && this.source === 'player') {
                            const fx = shotFxFor(this.brawlerInfo.id);
                            effects.spawnImpactV2(this.x, this.y, Math.atan2(this.vy, this.vx), { color: fx.color, ringRadius: fx.ringRadius * 0.7, hitSparks: Math.max(2, fx.hitSparks - 2) });
                            effects.spawnBulletMark(this.x, this.y);
                        }
                        AudioSys.getInstance().playHit('wall');
                    }
                    this.deactivate();
                    return;
                }
            }

            if (this.distance > this.maxDist) {
                // S2: sygnal „koniec zasiegu" TYLKO tutaj — trafienie i sciana maja wlasne efekty,
                // a pocisk Wiezy/Ping-Ponga tez przejdzie ta sciezka i to jest poprawne (on rowniez
                // gdzies konczy lot). Wyciszone dla supera: tam i tak leci wlasna feeria.
                if (!this.isSuper) effects.spawnRangeFizzle(this.x, this.y, this.brawlerColor);
                this.deactivate();
                return;
            }
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
        } else if (this.gfx) {
            this.gfx.x = this.x;
            this.gfx.y = this.y;
            this.gfx.zIndex = this.y + 10;
        }

        // TANK ART v2: smuga = 1 sprite (ADD, warstwa fxAddLayer), dlugosc z drogi, rotacja z wektora.
        if (this.artV2 && this.source === 'player') {
            const fx = shotFxFor(this.brawlerInfo.id);
            if (fx.trailLen > 0) {
                if (!this.trailSprite) {
                    this.trailSprite = new PIXI.Sprite(this.brawlerInfo.id === 'plasma' ? getZigzagTrailTexture() : getTrailTexture());
                    this.trailSprite.anchor.set(1, 0.5);
                    this.trailSprite.blendMode = PIXI.BLEND_MODES.ADD;
                    effects.fxAddLayer.addChild(this.trailSprite);
                }
                const s = this.trailSprite;
                const mult = this.isSuper ? 1.5 : 1;
                s.visible = true;
                s.tint = this.isSuper ? this.superTrailColor : fx.color;
                s.alpha = this.isSuper ? 0.95 : 0.8;
                s.x = this.x; s.y = this.y;
                s.rotation = Math.atan2(this.vy, this.vx);
                s.width = Math.min(fx.trailLen * mult, this.distance * 0.6 + 4);
                s.height = fx.trailWidth * mult;
            }
            this.updateV2Fx(delta, effects);
        } else
        // Render trail (oba tryby).
        if (this.trailGfx && this.trailCount > 0) {
            this.trailGfx.clear();
            const trailColor = this.isSuper ? this.superTrailColor : this.brawlerColor;
            // v0.73.7 PERF: iteracja ring-buffera od najstarszego (idx = head - count + i).
            // alphaProg 1:1 jak wczesniej — najstarszy najslabszy, najnowszy najmocniejszy.
            const cap = this.trailLen;
            for (let i = 0; i < this.trailCount; i++) {
                const idx = (this.trailHead - this.trailCount + i + cap) % cap;
                const t = this.trailPts[idx];
                const alphaProg = (i + 1) / this.trailCount;
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
            if (d < 34) { this.deactivate(); return; } // zlapany przez gracza
            const rs = this.returnSpeed;
            this.vx += (dx / d * rs - this.vx) * 0.2;
            this.vy += (dy / d * rs - this.vy) * 0.2;
            this.x += this.vx * delta;
            this.y += this.vy * delta;
            this.boomerangLife += delta;
            if (this.boomerangLife > 150) this.deactivate(); // safety ~2.5s @60fps
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

    /**
     * F7b-2: przemaluj na tracer Wiezy MG (teal, mniejszy) — pocisk NIE moze wygladac
     * jak strzal gracza (Czytelnosc: "skad nadszedl ogien" musi byc jednoznaczne).
     * Wolane raz po acquireBullet w spawnerze wiezy; reset() cofa wszystko przy reuzyciu.
     * trailLen celowo NIETKNIETY (ring-buffer smugi jest zwymiarowany pod trailLen —
     * zmiana w locie rozjechalaby indeksowanie); smuga dziedziczy teal przez brawlerColor.
     */
    styleAsTowerTracer(): void {
        this.source = 'tower';
        // v0.190.0: +50% (bylo 4). Uwaga: `radius` wchodzi TAKZE do hit-testu, wiec pocisk wiezy
        // jest teraz realnie latwiejszy do trafienia w cel — zmiana wizualna z konsekwencja w balansie.
        this.radius = 6;
        this.brawlerColor = 0x4dd7c8;    // smuga w barwie wiezy (teal = "to Twoje")
        if (this.bakerActive && this.sprite) {
            this.sprite.tint = 0x4dd7c8;
            this.sprite.scale.set(BULLET_DISPLAY_SCALE * 0.9); // bylo 0.6 => +50%
        } else if (this.gfx) {
            this.gfx.clear();
            // Poswiata: dwa pierscienie zamiast filtra — filtr pelnoekranowy to fill-rate,
            // a dwa dodatkowe kola kosztuja tyle, co nic (regula mobile-first §3).
            this.gfx.beginFill(0x4dd7c8, 0.18);
            this.gfx.drawCircle(0, 0, this.radius * 2.1);
            this.gfx.endFill();
            this.gfx.beginFill(0x4dd7c8, 0.35);
            this.gfx.drawCircle(0, 0, this.radius * 1.45);
            this.gfx.endFill();
            this.gfx.beginFill(0xaef3ec);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.endFill();
            this.gfx.beginFill(0xffffff, 0.85);
            this.gfx.drawCircle(-1.6, -1.6, 2.2);
            this.gfx.endFill();
        }
        // SMUGA: wieza ma ja ZAWSZE, niezaleznie od brawlera. `trailLen` pochodzi normalnie
        // z TRAIL_LEN_MAP i dla czesci brawlerow (np. Snajper) wynosi 0 — bez tego tracer wiezy
        // bywalby bez smugi zaleznie od wybranego czolgu, co czytaloby sie jak niespojnosc.
        this.trailLen = Math.max(this.trailLen, 9);
        if (!this.trailGfx) {
            this.trailGfx = new PIXI.Graphics();
            this.worldContainer.addChild(this.trailGfx);
        }
        this.trailGfx.clear();
        this.trailGfx.zIndex = this.y + 9;
        this.trailGfx.visible = true;
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

    /**
     * POOLING (v0.73.7): "wlozenie do pudelka" — chowamy display objects zamiast
     * niszczyc (sprite + gfx + trail zostaja w kontenerze, visible=false), gotowe do
     * reset(). NIE niszczymy tekstur (wspoldzielone/cache). Teardown miedzy meczami =
     * worldContainer.removeChildren() + wyzerowanie puli w startGame.
     */
    deactivate(): void {
        this.active = false;
        if (this.sprite) this.sprite.visible = false;
        if (this.gfx) this.gfx.visible = false;
        if (this.trailGfx) this.trailGfx.visible = false;
        if (this.trailSprite) this.trailSprite.visible = false;
        if (this.fxA) this.fxA.visible = false;
        if (this.fxB) this.fxB.visible = false;
        if (this.fxC) this.fxC.visible = false;
    }

    /**
     * TANK ART v2 — efekty runtime pocisku per czolg (Mariusz, 2026-09-26). Wszystko lokalne/wizualne.
     *  plasma: 2 luki elektryczne (losowy wariant co 3 klatki) + glow; twardy super: glow;
     *  pyro: zywy ogien = jezyk ognia z puli co 3 (super 2) klatki + glow; shadow: jasnoszary glow + jasny dymek co 4 klatki;
     *  king super: 2 orbitujace iskry wokol korony. Koszt: <= 3 sprite'y ADD/pocisk + czastki z puli (cap 200).
     */
    private ensureFx(effects: EffectsManager, which: 'A' | 'B' | 'C', tex: PIXI.Texture): PIXI.Sprite {
        const key = which === 'A' ? 'fxA' : which === 'B' ? 'fxB' : 'fxC';
        let s = this[key];
        if (!s) {
            s = new PIXI.Sprite(tex); s.anchor.set(0.5); s.blendMode = PIXI.BLEND_MODES.ADD;
            effects.fxAddLayer.addChild(s); this[key] = s;
        }
        s.visible = true;
        return s;
    }

    private updateV2Fx(delta: number, effects: EffectsManager): void {
        const id = this.brawlerInfo.id; const sup = this.isSuper;
        this.fxT += delta;
        const dirA = Math.atan2(this.vy, this.vx);
        if (id === 'plasma') {
            // Tech: zawsze odcienie niebiesko-blekitne (super = glebszy blekit, nie roz)
            const arcs = getArcTextures(); const tint = sup ? 0x8ad4ff : 0x9af0ff;
            const g = this.ensureFx(effects, 'C', getGlowTexture()); g.x = this.x; g.y = this.y; g.tint = sup ? 0x3aa0ff : 0x00d4ff; g.alpha = 0.5; g.scale.set(this.radius * 0.22);
            for (const which of ['A', 'B'] as const) {
                const s = this.ensureFx(effects, which, arcs[0]);
                if (this.fxT >= 3 || (s as unknown as { _ox?: number })._ox === undefined) {
                    s.texture = arcs[(Math.random() * arcs.length) | 0]; s.rotation = Math.random() * Math.PI * 2;
                    s.scale.set(0.9 + Math.random() * 0.6 + (sup ? 0.4 : 0)); s.tint = tint;
                    const r = this.radius * (0.6 + Math.random() * 0.8); const a = Math.random() * Math.PI * 2;
                    (s as unknown as { _ox: number })._ox = Math.cos(a) * r; (s as unknown as { _oy: number })._oy = Math.sin(a) * r;
                }
                s.x = this.x + ((s as unknown as { _ox?: number })._ox ?? 0); s.y = this.y + ((s as unknown as { _oy?: number })._oy ?? 0);
                s.alpha = 0.55 + Math.random() * 0.45;
            }
            if (this.fxT >= 3) this.fxT = 0;
        } else if (id === 'scout') {
            // Zwiad: wiekszy zoltawy dymek za beczka (co 4 klatki, z puli)
            if (this.fxT >= 4) { this.fxT = 0; effects.spawnSoftPuff(this.x - this.vx * 0.6, this.y - this.vy * 0.6, 0xf2d778, sup ? 3.2 : 2.6); }
        } else if (id === 'twardy' && sup) {
            const g = this.ensureFx(effects, 'A', getGlowTexture()); g.x = this.x; g.y = this.y; g.tint = this.superTrailColor; g.alpha = 0.65; g.scale.set(this.radius * 0.28);
        } else if (id === 'pyro') {
            const g = this.ensureFx(effects, 'A', getGlowTexture()); g.x = this.x; g.y = this.y; g.tint = 0xff7a2a; g.alpha = 0.55; g.scale.set(this.radius * (sup ? 0.3 : 0.22));
            const every = sup ? 2 : 3;
            if (this.fxT >= every) { this.fxT = 0; effects.spawnFlameBit(this.x, this.y, dirA, sup); if (sup) effects.spawnFlameBit(this.x, this.y, dirA, true); }
        } else if (id === 'shadow') {
            // Shadow: szary przyciemniony (jasny czytal sie jak bialy), takze w super
            const g = this.ensureFx(effects, 'A', getGlowTexture()); g.x = this.x; g.y = this.y; g.tint = 0x8f97a8; g.alpha = sup ? 0.5 : 0.38; g.scale.set(this.radius * 0.3);
            if (this.fxT >= 4) { this.fxT = 0; effects.spawnSoftPuff(this.x, this.y, 0xa9b0bf, sup ? 2.6 : 2); }
        } else if (id === 'king') {
            const g = this.ensureFx(effects, 'A', getGlowTexture()); g.x = this.x; g.y = this.y; g.tint = sup ? 0xff8a2a : 0xffd23a; g.alpha = sup ? 0.6 : 0.5; g.scale.set(this.radius * (sup ? 0.32 : 0.24));
            if (sup) {
                const t = performance.now() * 0.012 + this.x * 0.01; const rr = this.radius * 1.7;
                const o1 = this.ensureFx(effects, 'B', getGlowTexture()); o1.tint = 0xfff0a0; o1.alpha = 0.95; o1.scale.set(0.42); o1.x = this.x + Math.cos(t) * rr; o1.y = this.y + Math.sin(t) * rr * 0.6;
                const o2 = this.ensureFx(effects, 'C', getGlowTexture()); o2.tint = 0xffb340; o2.alpha = 0.95; o2.scale.set(0.42); o2.x = this.x + Math.cos(t + Math.PI) * rr; o2.y = this.y + Math.sin(t + Math.PI) * rr * 0.6;
            }
        }
    }

    /** Pelne zniszczenie (nieuzywane w hot-path po poolingu; zostaje dla teardownu). */
    destroy(): void {
        this.active = false;
        if (this.trailSprite) {
            if (this.trailSprite.parent) this.trailSprite.parent.removeChild(this.trailSprite);
            this.trailSprite.destroy(); // tekstura wspolna (getTrailTexture) -> NIE niszczymy tekstury
            this.trailSprite = null;
        }
        for (const key of ['fxA', 'fxB', 'fxC'] as const) {
            const s = this[key];
            if (s) { if (s.parent) s.parent.removeChild(s); s.destroy(); this[key] = null; }
        }
        if (this.sprite) {
            if (this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
            this.sprite.destroy();   // texture cached/shared w bakerze -> NIE niszczymy tekstury
            this.sprite = null;
        }
        if (this.gfx) {
            if (this.gfx.parent) this.gfx.parent.removeChild(this.gfx);
            this.gfx.destroy();
            this.gfx = null;
        }
        if (this.trailGfx) {
            if (this.trailGfx.parent) this.trailGfx.parent.removeChild(this.trailGfx);
            this.trailGfx.destroy();
            this.trailGfx = null;
        }
    }
}