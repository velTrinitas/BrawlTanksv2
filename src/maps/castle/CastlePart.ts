import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { applyHitShake } from '../../rendering/hitShake';
import {
    bakeWall, bakeTowerSquare, bakeKeep, bakeGate, bakeGateV,
    type BakedPart, type DamageTier, type WallSide,
} from './castleBake';
import { CASTLE_GATE_TURRETS } from '../CastleMap';

/**
 * CastlePart — jedna czesc zamku (OBRON ZAMEK F2): segment muru / wieza / brama /
 * donzon / wiezyczka bramna. ICollidable (x/y = TOP-LEFT, hitbox == AABB z layoutu).
 *
 * KOLIZJE PRZEZ DWA PROXY (regula: zero edycji Bullet.ts / EnemyBullet.ts):
 *  - `solidProxy`       — BEZ takeDamage -> do `buildings` + `solidBuildings`
 *                         (czolg gracza + pociski gracza: blokada + FX "sciana",
 *                         friendly fire OFF — gracz nie niszczy wlasnego zamku),
 *  - `enemyBulletProxy` — Z takeDamage -> do `castleEnemyBulletSolids` (main.ts),
 *                         tablicy, ktora dostaja TYLKO pociski wroga.
 * Oba proxy czytaja w/h z czesci: po ZNISZCZENIU zwracaja 0 (precedens UfoAbductor
 * "gettery w/h = 0 w locie") — ZERO mutacji tablic kolizji w trakcie meczu.
 *
 * OBRAZENIA: `takeDamage` deleguje do `onDamage` (CastleSystem, F3) jesli podpiete;
 * bez systemu (F2 playtest artu) stosuje obrazenia lokalnie. Tier wizualny = z HP;
 * zmiana tieru = swap tekstury + hit-shake (kontener, NIE hitbox — audyt Z0.2).
 */

export type CastlePartKind = 'wall' | 'tower' | 'gate' | 'keep' | 'turret';
export type CastleDamageSource = 'contact' | 'enemy_bullet' | 'taran' | 'katapulta' | 'debug';

export interface CastlePartOpts {
    id: string;
    kind: CastlePartKind;
    x: number; y: number; w: number; h: number;
    /** 0 = niezniszczalna (wieze, wiezyczki). */
    maxHp: number;
    side?: WallSide;
}

/** HP -> tier (0 intact >66%, 1 33-66%, 2 <33%, 3 destroyed). */
export function tierFromHp(hp: number, maxHp: number): DamageTier {
    if (maxHp <= 0) return 0;
    if (hp <= 0) return 3;
    const pct = hp / maxHp;
    if (pct > 0.66) return 0;
    if (pct > 0.33) return 1;
    return 2;
}

export class CastlePart {
    public readonly id: string;
    public readonly kind: CastlePartKind;
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;
    public readonly maxHp: number;
    public readonly side: WallSide | null;
    public hp: number;
    public tier: DamageTier = 0;
    /** false = zniszczona: przejezdna dla wszystkich, proxy zwracaja 0. */
    public solid = true;
    /** F6 (#3): brama ROZSUNIETA dla gracza (solidProxy = 0), wrogowie dalej blokowani (enemyProxy). */
    public gateOpen = false;
    /** F6 (#3): proxy TYLKO dla ruchu wrogow (castleEnemyBarriers) — solid dopoki czesc zyje. */
    public readonly enemyProxy: ICollidable;

    /** Podpina CastleSystem (F3). Gdy null — obrazenia lokalnie. */
    public onDamage: ((part: CastlePart, dmg: number, hitX: number, hitY: number, src: CastleDamageSource) => void) | null = null;
    /** Callback zmiany tieru (efekty/dzwiek/baner — CastleSystem F3/F6). */
    public onTierChanged: ((part: CastlePart, from: DamageTier, to: DamageTier) => void) | null = null;

    public readonly solidProxy: ICollidable;
    public readonly enemyBulletProxy: ICollidable & { takeDamage(dmg: number, hitX: number, hitY: number): void };

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;
    private baked: BakedPart;
    private baseX = 0;
    private baseY = 0;
    private destroyed = false;

    constructor(opts: CastlePartOpts, worldContainer: PIXI.Container) {
        this.id = opts.id;
        this.kind = opts.kind;
        this.x = opts.x; this.y = opts.y; this.w = opts.w; this.h = opts.h;
        this.maxHp = opts.maxHp;
        this.hp = opts.maxHp;
        this.side = opts.side ?? null;

        // PIXI members w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this.container.addChild(this.sprite);
        // Y-sort: dolna krawedz AABB + tie-break po x (kanon zIndex = y + h + x*1e-4)
        this.container.zIndex = this.y + this.h + this.x * 1e-4;
        worldContainer.addChild(this.container);

        this.baked = this.bakeFor(0);
        this.applyBaked();

        const self = this;
        this.solidProxy = {
            get x() { return self.x; },
            get y() { return self.y; },
            get w() { return self.solid && !self.gateOpen ? self.w : 0; },
            get h() { return self.solid && !self.gateOpen ? self.h : 0; },
            update: () => {},
        };
        this.enemyProxy = {
            get x() { return self.x; },
            get y() { return self.y; },
            get w() { return self.solid ? self.w : 0; },
            get h() { return self.solid ? self.h : 0; },
            update: () => {},
        };
        this.enemyBulletProxy = {
            get x() { return self.x; },
            get y() { return self.y; },
            get w() { return self.solid ? self.w : 0; },
            get h() { return self.solid ? self.h : 0; },
            update: () => {},
            takeDamage: (dmg: number, hitX: number, hitY: number) => self.takeDamage(dmg, hitX, hitY, 'enemy_bullet'),
        };
    }

    private bakeFor(tier: DamageTier): BakedPart {
        switch (this.kind) {
            case 'wall': return bakeWall(this.w, this.h, this.side ?? 'N', tier);
            case 'tower': return bakeTowerSquare(this.w); // F6 (#2): kwadratowa wieza z dachem piramidowym
            case 'keep': return bakeKeep(this.w, this.h, tier);
            case 'gate': return this.w >= this.h
                ? bakeGate({ w: this.w, h: this.h }, { w: CASTLE_GATE_TURRETS[0].w, h: CASTLE_GATE_TURRETS[0].h }, tier, this.gateOpen)
                : bakeGateV({ w: this.w, h: this.h }, { w: CASTLE_GATE_TURRETS[0].w, h: CASTLE_GATE_TURRETS[0].h }, tier, this.gateOpen);
            case 'turret': return { tex: PIXI.Texture.EMPTY, ox: 0, oy: 0 }; // wizual w teksturze bramy
        }
    }

    private applyBaked(): void {
        this.sprite.texture = this.baked.tex;
        this.baseX = this.x - this.baked.ox;
        this.baseY = this.y - this.baked.oy;
        this.container.x = this.baseX;
        this.container.y = this.baseY;
    }

    public get destructible(): boolean { return this.maxHp > 0; }
    public get hpPct(): number { return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 1; }
    public get centerX(): number { return this.x + this.w / 2; }
    public get centerY(): number { return this.y + this.h / 2; }

    /** Pociski wroga (duck-typed przez proxy) i kontakt/taran/katapulta (CastleSystem). */
    public takeDamage(dmg: number, hitX: number, hitY: number, src: CastleDamageSource = 'enemy_bullet'): void {
        if (!this.destructible || this.destroyed) return;
        if (this.onDamage) { this.onDamage(this, dmg, hitX, hitY, src); return; }
        this.applyDamage(dmg);
    }

    /** Faktyczna zmiana HP (wola CastleSystem po policzeniu obrazen lub takeDamage bez systemu). */
    public applyDamage(dmg: number): void {
        if (!this.destructible || this.destroyed) return;
        this.hp = Math.max(0, this.hp - dmg);
        this.refreshTier();
        if (!this.destroyed) applyHitShake(this.container, this.baseX, this.baseY, 2.5, 90, () => this.destroyed);
    }

    /** Naprawa (faza budowy / moc NAPRAWA). Zniszczona czesc odzyskuje solid przy hp > 0. */
    public repair(amount: number): number {
        if (!this.destructible) return 0;
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        if (this.destroyed && this.hp > 0) { this.destroyed = false; this.solid = true; }
        this.refreshTier();
        return this.hp - before;
    }

    /** Debug (window.castleTier): wymusza tier przez ustawienie HP. */
    public setTierDebug(tier: DamageTier): void {
        if (!this.destructible) return;
        const pct = tier === 0 ? 1 : tier === 1 ? 0.5 : tier === 2 ? 0.2 : 0;
        this.hp = Math.round(this.maxHp * pct);
        if (this.hp > 0 && this.destroyed) { this.destroyed = false; this.solid = true; }
        this.refreshTier();
    }

    private refreshTier(): void {
        const next = tierFromHp(this.hp, this.maxHp);
        if (next === 3 && !this.destroyed) { this.destroyed = true; this.solid = false; }
        if (next !== this.tier) {
            const prev = this.tier;
            this.tier = next;
            this.baked = this.bakeFor(next);
            this.applyBaked();
            // rumowisko lezy na ziemi: sortuj jak plaski dekor, nie jak bryla
            this.container.zIndex = next === 3 ? 6 : this.y + this.h + this.x * 1e-4;
            this.onTierChanged?.(this, prev, next);
        }
    }

    public get isDestroyed(): boolean { return this.destroyed; }

    /** F6 (#3): otworz/zamknij wrota (tylko brama, tylko zywa). Swap tekstury = zero per-frame. */
    public setGateOpen(open: boolean): void {
        if (this.kind !== 'gate' || this.destroyed || this.gateOpen === open) return;
        this.gateOpen = open;
        this.baked = this.bakeFor(this.tier);
        this.applyBaked();
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
