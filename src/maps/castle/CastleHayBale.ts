import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import { applyHitShake } from '../../rendering/hitShake';
import { bakeHay } from './castleBake';

/**
 * CastleHayBale — snop siana (OBRON ZAMEK F6, uwaga #9): niszczalny solid 48x48
 * (wzorzec Crate: takeDamage duck-typed z Bullet.ts, w/h = 0 po rozwaleniu, respawn).
 * Rozwalenie = wybuch zdziebel + GEM (callback onBreak -> main spawnGem) — mala nagroda
 * za eksploracje miedzy falami. Art = 2 pieczone tekstury (caly / naruszony).
 */

const HAY_HP = 200;
const RESPAWN_SEC = 45;

export class CastleHayBale implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed = false;

    private readonly origW: number;
    private readonly origH: number;
    private hp = HAY_HP;
    private respawnTimer = 0;
    private container: PIXI.Container;
    private sprite: PIXI.Sprite;
    private readonly effects: EffectsManager;
    private readonly onBreak: (cx: number, cy: number) => void;

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container,
        effects: EffectsManager, onBreak: (cx: number, cy: number) => void) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.origW = w; this.origH = h;
        this.effects = effects;
        this.onBreak = onBreak;
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite(bakeHay(0));
        this.sprite.anchor.set(0.5, 0.62);
        this.container.addChild(this.sprite);
        this.container.x = x + w / 2;
        this.container.y = y + h / 2;
        this.container.zIndex = y + h + x * 1e-4;
        worldContainer.addChild(this.container);
    }

    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        this.effects.spawnWoodSplinters(hitX, hitY, 4);
        if (this.hp <= 0) { this.breakApart(); return; }
        if (this.hp <= HAY_HP / 2) this.sprite.texture = bakeHay(1);
        applyHitShake(this.container, this.x + this.w / 2, this.y + this.h / 2, 2, 80, () => this.isDestroyed);
    }

    private breakApart(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_SEC;
        this.w = 0; this.h = 0;
        this.container.visible = false;
        const cx = this.x + this.origW / 2, cy = this.y + this.origH / 2;
        this.effects.spawnWoodSplinters(cx, cy, 16);
        this.effects.spawnFloatingText(cx, cy - 20, '💎', 0xe0b53c);
        this.onBreak(cx, cy);
    }

    public update(): void {
        if (!this.isDestroyed) return;
        this.respawnTimer -= 1 / 60;
        if (this.respawnTimer <= 0) {
            this.isDestroyed = false;
            this.hp = HAY_HP;
            this.w = this.origW; this.h = this.origH;
            this.sprite.texture = bakeHay(0);
            this.container.visible = true;
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
