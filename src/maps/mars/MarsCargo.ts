import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { MARS_HEX } from '../MarsMap';

/**
 * MarsCargo — destructible supply container (grammar layer 5, Mars).
 *
 * FAZA MARS M3. Why a new class instead of re-skinning `Crate`:
 * the crate's whole visual language is pine planks + rusted iron straps + wood
 * grain, which is an anachronism on Mars (climate consistency is a hard rule).
 * Recolouring 30 constants would leave wood grain on a white panel. So the
 * VISUAL is new, while the MECHANICS are copied 1:1 from the proven Crate:
 *   - HP 3, 60 s respawn, `isDestroyed` gating
 *   - duck-typed `takeDamage(dmg, hitX, hitY)` — Bullet/EnemyBullet find it via
 *     solidBuildings, no registration needed
 *   - `getExtraCollidables()` padded proxy with LIVE getters (PAD 8) for player
 *     collision, so the pad follows the destroyed state without re-pushing
 *   - dedicated update loop (respawn timer), same as crates in main.ts
 *
 * Collision contract (identical to Crate): the container itself goes to
 * solidBuildings (bullets hit the drawn size exactly), the padded proxy goes to
 * buildings (player stops a little earlier — "nie da sie na nie wjezdzac").
 */

const BOX_W = 36;
const BOX_H = 36;
const BOX_HP = 3;
const RESPAWN_TIME = 60;

export class MarsCargo implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed: boolean = false;

    private origX: number;
    private origY: number;
    private hp: number;
    private respawnTimer: number = 0;
    private seed: number;

    private effects: EffectsManager;
    private audio: AudioSys;

    private aoContainer: PIXI.Container;
    private boxContainer: PIXI.Container;

    constructor(
        x: number,
        y: number,
        seed: number,
        worldContainer: PIXI.Container,
        effects: EffectsManager,
        audio: AudioSys,
    ) {
        this.x = x;
        this.y = y;
        this.w = BOX_W;
        this.h = BOX_H;
        this.origX = x;
        this.origY = y;
        this.hp = BOX_HP;
        this.seed = seed;
        this.effects = effects;
        this.audio = audio;

        // ALL containers/graphics created here, before any drawX call (E1).
        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;   // ground AO band, same as Crate
        worldContainer.addChild(this.aoContainer);

        this.boxContainer = new PIXI.Container();
        this.boxContainer.zIndex = Math.floor(y + BOX_H);
        worldContainer.addChild(this.boxContainer);

        this.drawAO();
        this.drawBox();
    }

    /** Contact shadow on the regolith (SE — sun sits NW). */
    private drawAO(): void {
        const g = new PIXI.Graphics();
        const groundY = this.y + BOX_H;
        g.beginFill(MARS_HEX.depth, 0.30);
        g.drawPolygon([
            this.x + 4, groundY + 1,
            this.x + BOX_W + 5, groundY + 1,
            this.x + BOX_W + 9, groundY + 7,
            this.x + 8, groundY + 7,
        ]);
        g.endFill();
        // wider soft falloff
        g.beginFill(MARS_HEX.depth, 0.14);
        g.drawEllipse(this.x + BOX_W / 2 + 5, groundY + 5, BOX_W * 0.8, 7);
        g.endFill();
        this.aoContainer.addChild(g);
    }

    /**
     * Corrugated supply container seen from above: steel body, ribbed lid,
     * reinforced corner castings, one cyan status strip (tech detail only — F1),
     * plus a seeded ID stencil so no two boxes look stamped from one mould.
     */
    private drawBox(): void {
        const g = new PIXI.Graphics();
        this.boxContainer.addChild(g);

        const x = this.x, y = this.y;
        const rnd = this.makeRnd();

        // SE side wall (2.5D depth — the box has thickness)
        g.beginFill(MARS_HEX.baseSteel, 1);
        g.drawRoundedRect(x + 3, y + 4, BOX_W, BOX_H, 3);
        g.endFill();

        // lid (top face)
        g.beginFill(0x9aa6b2, 1);
        g.drawRoundedRect(x, y, BOX_W, BOX_H, 3);
        g.endFill();
        // sunlit NW half
        g.beginFill(0xb9c4cf, 0.85);
        g.drawRoundedRect(x + 1.5, y + 1.5, BOX_W - 3, BOX_H * 0.45, 2);
        g.endFill();

        // corrugation ribs across the lid
        g.lineStyle(1.2, MARS_HEX.baseSteel, 0.55);
        for (let rx = x + 6; rx < x + BOX_W - 3; rx += 6) {
            g.moveTo(rx, y + 3);
            g.lineTo(rx, y + BOX_H - 3);
        }
        g.lineStyle(0);

        // reinforced corner castings
        g.beginFill(0x6f7a86, 1);
        const c = 7;
        g.drawRect(x, y, c, c);
        g.drawRect(x + BOX_W - c, y, c, c);
        g.drawRect(x, y + BOX_H - c, c, c);
        g.drawRect(x + BOX_W - c, y + BOX_H - c, c, c);
        g.endFill();

        // cyan status strip + lamp (DETAIL only — cyan areas are reserved, F1)
        g.beginFill(MARS_HEX.baseCyan, 0.55);
        g.drawRect(x + 9, y + BOX_H * 0.52, BOX_W - 18, 2.4);
        g.endFill();
        g.beginFill(MARS_HEX.baseCyan, 0.9);
        g.drawCircle(x + BOX_W - 9, y + BOX_H * 0.52 + 1.2, 1.7);
        g.endFill();

        // seeded ID stencil: 2-4 short dark ticks, different per box
        g.beginFill(MARS_HEX.depth, 0.5);
        const ticks = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < ticks; i++) {
            g.drawRect(x + 8 + i * 5, y + BOX_H * 0.7, 3, 4);
        }
        g.endFill();

        // dust settled on the windward (NW) edge — ties the box to the ground
        g.beginFill(MARS_HEX.duneLight, 0.22);
        g.drawRect(x + 1, y + BOX_H - 5, BOX_W - 2, 4);
        g.endFill();

        // outline: violet-brown, consistent with the map's shadow tone
        g.lineStyle(1.4, 0x3a2028, 0.8);
        g.drawRoundedRect(x, y, BOX_W, BOX_H, 3);
        g.lineStyle(0);
    }

    /** Deterministic per-box RNG (LCG) so the stencil is stable across respawns. */
    private makeRnd(): () => number {
        let s = this.seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.destroy();
            return;
        }
        // metal reads as sparks, not splinters
        this.effects.spawnEnemyHitSparks(hitX, hitY, MARS_HEX.baseCyan);
        const shake = 1.5;
        this.boxContainer.x = (Math.random() - 0.5) * shake;
        this.boxContainer.y = (Math.random() - 0.5) * shake;
        setTimeout(() => {
            if (this.boxContainer && !this.isDestroyed) {
                this.boxContainer.x = 0;
                this.boxContainer.y = 0;
            }
        }, 80);
    }

    private destroy(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        this.w = 0;
        this.h = 0;
        this.boxContainer.visible = false;
        this.aoContainer.visible = false;

        const cx = this.origX + BOX_W / 2;
        const cy = this.origY + BOX_H / 2;
        this.effects.spawnWallImpact(cx, cy);
        this.effects.spawnEnemyHitSparks(cx, cy, MARS_HEX.baseCyan);
        // TODO(M6): dedicated metal-burst SFX; crate break is the closest existing
        // sample (IceCube reuses it the same way).
        this.audio.playCrateBreak();
    }

    private respawn(): void {
        this.isDestroyed = false;
        this.hp = BOX_HP;
        this.w = BOX_W;
        this.h = BOX_H;
        this.boxContainer.visible = true;
        this.aoContainer.visible = true;
    }

    /** Dedicated loop in main.ts — respawn timer only (frame-locked, as Crate). */
    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        if (this.isDestroyed) {
            this.respawnTimer -= 1 / 60;
            if (this.respawnTimer <= 0) this.respawn();
        }
    }

    /** Padded player-collision proxy with live getters (PAD 8) — Crate contract. */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        return [{
            get x() { return self.isDestroyed ? -10000 : self.origX - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.origY - PAD; },
            get w() { return self.isDestroyed ? 0 : BOX_W + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : BOX_H + PAD * 2; },
            update: () => {},
        }];
    }
}
