import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { applyHitShake } from '../../rendering/hitShake';
import { bakeToSprite } from '../propBaker';
import { DesertJuice } from './DesertJuice';

/**
 * SandstoneBlock — DESERT ART v2 / E3. Zestrzeliwalny blok piaskowca (oslona).
 *
 * Wzorzec 1:1 z `entities/IceCube.ts` (decyzje juz sprawdzone w grze): x/y = TOP-LEFT
 * hitboxa, duck-typing `takeDamage` w Bullet/EnemyBullet (pociski gracza I wrogow),
 * 3 stany uszkodzen jako SWAP wspoldzielonej tekstury, rozpad + respawn 60 s,
 * padded hitbox gracza przez `getExtraCollidables()`.
 *
 * Roznice wzgledem kostki lodu (decyzje Mariusza 2026-09-28):
 *   - ZERO dropu gemow (piaskowiec nie rusza ekonomii),
 *   - 3 warianty historyczne: blok z hieroglifami, beben kolumny, blok z kartuszem.
 *
 * COOP/MP: HP i respawn to stan gry — respawn liczony w stalych krokach (1/60 na
 * wywolanie `update`, wolane z petli logiki jak kostki lodu). Warianty z indeksu
 * ukladu, nie z RNG. Wizual (odpryski, pyl, drgniecie) jest lokalny.
 */

export const SANDSTONE_SIZE = 60;
const SANDSTONE_HP = 200;      // twardy(100)=2 hity, zwiad(80)=3, snajper(300)=1
const RESPAWN_TIME = 60;       // sekundy
const VARIANT_COUNT = 3;
const RISE = 20;               // uniesienie gornej sciany (fake-3D jak kostka lodu)
const DUST = 0xe0c080;

const TEX_CACHE = new Map<number, PIXI.Texture>();
let _anchor: { x: number; y: number } | null = null;

function h(i: number): number {
    const v = Math.sin(i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
}

/** Wspoldzielona tekstura (wariant x stan). Ramka IDENTYCZNA we wszystkich stanach. */
function getTexture(variant: number, stage: number): PIXI.Texture | null {
    const key = variant * 10 + stage;
    const hit = TEX_CACHE.get(key);
    if (hit && !hit.destroyed) return hit;
    const g = new PIXI.Graphics();
    drawBlock(g, variant, stage);
    const spr = bakeToSprite(g, `sandstone_v2:${variant}:${stage}`);
    g.destroy();
    if (!spr) return null;
    _anchor = { x: spr.anchor.x, y: spr.anchor.y };
    TEX_CACHE.set(key, spr.texture);
    return spr.texture;
}

function drawBlock(g: PIXI.Graphics, variant: number, stage: number): void {
    const S = SANDSTONE_SIZE;
    const front = 6;                  // gorna krawedz frontu (dol gornej sciany)
    // Niewidoczna ramka = stale granice kadru dla wszystkich stanow (swap tekstury bez skoku)
    g.beginFill(0x000000, 0.001);
    g.drawRect(-12, -RISE - 6, S + 30, S + RISE + 22);
    g.endFill();
    // Cien SE (slonce NW) — czworokat, bryla nie rzuca okraglego cienia
    g.beginFill(0x000000, 0.22);
    g.drawPolygon([6, S - 4, S + 4, S - 4, S + 14, S + 10, 16, S + 10]);
    g.endFill();
    // Zaspa piasku u podstawy
    g.beginFill(0xe8c890, 0.85);
    g.drawEllipse(S * 0.5, S - 2, S * 0.62, 7);
    g.endFill();

    const top = stage === 2 ? 0xc8985a : 0xecca8c;
    const faceL = stage === 2 ? 0xb0804a : 0xd8a868;
    const faceR = stage === 2 ? 0x8a5e32 : 0xb08048;

    if (variant === 1) {
        // Beben kolumny (walec z gory): front zaokraglony, gora = elipsa
        const cx = S / 2, rx = S / 2;
        g.beginFill(faceR);
        g.drawRoundedRect(0, front - 2, S, S - front + 2, 22);
        g.endFill();
        g.beginFill(faceL);
        g.drawRoundedRect(0, front - 2, S * 0.55, S - front + 2, 22);
        g.endFill();
        g.lineStyle(1.4, 0x6a4a24, 0.45);   // zlobkowanie (kanelury)
        for (let k = 1; k < 6; k++) {
            const x = (k / 6) * S;
            g.moveTo(x, front + 4); g.lineTo(x, S - 6);
        }
        g.lineStyle(0);
        g.beginFill(top);
        g.drawEllipse(cx, front - RISE / 2 + 2, rx, RISE / 2 + 6);
        g.endFill();
        g.lineStyle(1.5, 0xfff0cc, 0.6);
        g.arc(cx, front - RISE / 2 + 2, rx - 3, Math.PI * 1.05, Math.PI * 1.6);
        g.lineStyle(0);
    } else {
        // Szescian: gorna sciana + front dzielony grania (swiatlo NW / cien SE)
        const mid = S * 0.5;
        g.beginFill(faceL);
        g.drawPolygon([0, front, mid, front + 2, mid, S, 2, S]);
        g.endFill();
        g.beginFill(faceR);
        g.drawPolygon([mid, front + 2, S, front, S - 2, S, mid, S]);
        g.endFill();
        g.beginFill(top);
        g.drawPolygon([5, -RISE, S - 5, -RISE, S, front, 0, front]);
        g.endFill();
        g.beginFill(0xffffff, 0.22);
        g.drawPolygon([5, -RISE, S * 0.55, -RISE, S * 0.4, front, 0, front]);
        g.endFill();
        // Krawedzie
        g.lineStyle(2, 0xfff0cc, 0.7);
        g.moveTo(2, S); g.lineTo(0, front); g.lineTo(5, -RISE); g.lineTo(S - 5, -RISE);
        g.lineStyle(1.2, 0x5a3a1c, 0.5);
        g.moveTo(mid, front + 2); g.lineTo(mid, S);
        g.lineStyle(0);
        // Dekoracja frontu
        const ink = 0x6a3e1a;
        if (variant === 0) {
            // Hieroglify: rzad oczu, fal i ptakow (uproszczone piktogramy)
            g.beginFill(ink, 0.7);
            for (let r = 0; r < 3; r++) {
                const y = front + 10 + r * 14;
                g.drawEllipse(10, y, 4, 2);                   // oko
                g.drawRect(20, y - 1, 8, 2);                  // woda
                g.drawCircle(38, y, 2.2);                     // slonce
                g.drawPolygon([46, y + 3, 52, y - 3, 54, y + 3]); // ptak
            }
            g.endFill();
        } else {
            // Kartusz (owal z liniami) — miejsce na imie faraona
            g.lineStyle(2, ink, 0.75);
            g.drawRoundedRect(S * 0.28, front + 8, S * 0.44, S - front - 16, 10);
            g.moveTo(S * 0.26, S - 7); g.lineTo(S * 0.74, S - 7);
            g.lineStyle(0);
            g.beginFill(ink, 0.65);
            for (let k = 0; k < 3; k++) g.drawEllipse(S / 2, front + 16 + k * 10, 6, 2.5);
            g.endFill();
        }
    }

    // Uszkodzenia: rysy (stan 1+) i wykruszone narozniki (stan 2)
    if (stage >= 1) {
        g.lineStyle(1.6 + stage * 0.4, 0x3a2008, 0.8);
        const n = stage * 2 + 1;
        for (let c = 0; c < n; c++) {
            let x = 8 + h(variant * 40 + c) * (S - 16);
            let y = -RISE + 4 + h(variant * 40 + c + 9) * 20;
            g.moveTo(x, y);
            for (let s = 0; s < 3; s++) {
                x += (h(c * 7 + s + variant) - 0.5) * 14;
                y += 8 + h(c * 5 + s + 3) * 10;
                g.lineTo(x, y);
            }
        }
        g.lineStyle(0);
    }
    if (stage === 2) {
        g.beginFill(0x5a3a1c, 0.85);
        g.drawPolygon([S - 12, -RISE, S - 5, -RISE, S, front, S - 4, front + 10, S - 14, -RISE + 10]);
        g.drawPolygon([0, S - 14, 8, S - 10, 6, S, 2, S]);
        g.endFill();
    }
}

export class SandstoneBlock implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed = false;

    private origX: number;
    private origY: number;
    private hp = SANDSTONE_HP;
    private respawnTimer = 0;
    private variant: number;
    private stage = 0;

    private effects: EffectsManager;
    private audio: AudioSys;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;

    constructor(x: number, y: number, index: number, worldContainer: PIXI.Container, effects: EffectsManager, audio: AudioSys) {
        this.x = x;
        this.y = y;
        this.w = SANDSTONE_SIZE;
        this.h = SANDSTONE_SIZE;
        this.origX = x;
        this.origY = y;
        this.variant = index % VARIANT_COUNT;
        this.effects = effects;
        this.audio = audio;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + SANDSTONE_SIZE;   // Y-sort po dolnej krawedzi
        worldContainer.addChild(this.container);

        const tex = getTexture(this.variant, 0);
        this.sprite = new PIXI.Sprite(tex ?? PIXI.Texture.EMPTY);
        if (_anchor) this.sprite.anchor.set(_anchor.x, _anchor.y);
        this.container.addChild(this.sprite);
        if (!tex) console.error('[SandstoneBlock] brak renderera do pieczenia — blok niewidoczny', { x, y, index });
    }

    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        this.effects.spawnEnemyHitSparks(hitX, hitY, DUST);
        this.effects.spawnSoftPuff(hitX, hitY, DUST, 0.9);
        DesertJuice.active?.chip(hitX, hitY, 2);   // E5: odpryski z grawitacja fake-3D
        if (this.hp <= 0) {
            this.crumble();
            return;
        }
        const newStage = this.hp > SANDSTONE_HP * 0.6 ? 0 : this.hp > SANDSTONE_HP * 0.25 ? 1 : 2;
        if (newStage !== this.stage) {
            this.stage = newStage;
            const tex = getTexture(this.variant, newStage);
            if (tex) this.sprite.texture = tex;
        }
        applyHitShake(this.container, this.origX, this.origY, 2, 90, () => this.isDestroyed);
    }

    private crumble(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        this.w = 0;
        this.h = 0;
        this.container.visible = false;
        const cx = this.origX + SANDSTONE_SIZE / 2;
        const cy = this.origY + SANDSTONE_SIZE / 2;
        this.effects.spawnSandstoneCrumble(cx, cy);
        DesertJuice.active?.crumble(cx, cy);       // E5: bryly + kupka gruzu 10 s
        this.effects.spawnShockwaveRing(cx, cy, 50, DUST);
        this.audio.playCrateBreak();
        // Celowo BEZ dropu (decyzja 2026-09-28: piaskowiec nie rusza ekonomii).
    }

    private respawn(): void {
        this.isDestroyed = false;
        this.hp = SANDSTONE_HP;
        this.stage = 0;
        this.w = SANDSTONE_SIZE;
        this.h = SANDSTONE_SIZE;
        const tex = getTexture(this.variant, 0);
        if (tex) this.sprite.texture = tex;
        this.container.visible = true;
        this.effects.spawnSoftPuff(this.origX + SANDSTONE_SIZE / 2, this.origY + SANDSTONE_SIZE / 2, DUST, 1.4);
    }

    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        if (this.isDestroyed) {
            this.respawnTimer -= 1 / 60;
            if (this.respawnTimer <= 0) this.respawn();
        }
    }

    /** Padded hitbox dla kolizji gracza (wzorzec IceCube/Crate) — do buildings[]. */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        return [{
            get x() { return self.isDestroyed ? -10000 : self.origX - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.origY - PAD; },
            get w() { return self.isDestroyed ? 0 : SANDSTONE_SIZE + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : SANDSTONE_SIZE + PAD * 2; },
            update: () => { /* static */ },
        }];
    }
}
