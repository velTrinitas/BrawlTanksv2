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
 * FAZA MARS POLISH — 2.5D BAKE (playtest: "skrzynie sa plaskie, maja byc bryly
 * jak kostki lodu na Arktyce"). Two changes, one rewrite:
 *
 *  1. VISUAL: the box was a flat lid with a 4 px offset side wall — read as a
 *     sticker on the ground. It is now a real solid: a top face lifted by RISE,
 *     two visible side faces (sunlit NW / shaded SE — the map's sun sits NW) and
 *     a cast shadow that is a QUADRILATERAL, not an ellipse, because a cuboid
 *     does not cast a round shadow (the exact lesson `IceCube` learned).
 *
 *  2. COST: it used to build a live `PIXI.Graphics` per box — 64 boxes = 64
 *     Graphics + 64 AO Graphics + 128 containers, all re-uploaded as geometry.
 *     Now the art is BAKED once per variant into a shared texture (lesson C1,
 *     canon `IceCube`), so all 64 boxes are plain sprites sharing 4 textures and
 *     batch in one draw call. The cast shadow bakes INTO the sprite, which
 *     removes the separate AO container entirely. Class B -> A.
 *
 * HITBOX IS UNCHANGED: 36x36 at the FOOTPRINT. RISE only lifts pixels upward,
 * never the collision box — otherwise the player would be stopped by empty air
 * above the container, which is exactly the "died from nowhere" injustice
 * Czytelnosc forbids. The whole silhouette above y is decoration.
 *
 * Collision contract (identical to Crate): the container itself goes to
 * solidBuildings (bullets hit the drawn size exactly), the padded proxy goes to
 * buildings (player stops a little earlier — "nie da sie na nie wjezdzac").
 */

const BOX_W = 36;
const BOX_H = 36;
const BOX_HP = 3;
const RESPAWN_TIME = 60;

/**
 * Height of the lifted top face. 14 on a 36 footprint (~39%) matches the ratio
 * IceCube landed on after the "RISE 48 robil slupy" feedback — a cube, not a
 * tower. Purely visual: see the hitbox note in the class doc.
 */
const RISE = 14;
/** Canvas margin: the cast shadow reaches ~12 px SE, plus room for the outline. */
const MARGIN = 16;
/** Supersample — small art viewed at desktop zoom 1.0 (C1). */
const BAKE_RES = 2;
/** Shared geometry variants, so 64 boxes upload 4 textures and batch. */
const VARIANT_COUNT = 4;

interface BakedTex { tex: PIXI.Texture; m: number; rise: number; }

/** Key = variant. Module-level, shared by every box on the map. */
const CARGO_CACHE = new Map<number, BakedTex>();

function getCargoTexture(variant: number): BakedTex {
    const cached = CARGO_CACHE.get(variant);
    if (cached) return cached;
    const bt = buildCargoCanvas(variant);
    CARGO_CACHE.set(variant, bt);
    return bt;
}

/** Deterministic per-variant RNG (LCG) — same shape every run. */
function makeRnd(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/**
 * Corrugated supply container as a SOLID: ribbed top face, two side faces,
 * reinforced corner castings, one cyan status strip (tech detail only — F1),
 * plus a seeded ID stencil so no two variants look stamped from one mould.
 */
function buildCargoCanvas(variant: number): BakedTex {
    const rnd = makeRnd(0xca6 + variant * 7919);
    const w = BOX_W, h = BOX_H, rise = RISE, m = MARGIN;

    const cv = document.createElement('canvas');
    cv.width = Math.ceil((w + m * 2) * BAKE_RES);
    cv.height = Math.ceil((h + rise + m * 2) * BAKE_RES);
    const c = cv.getContext('2d')!;
    c.scale(BAKE_RES, BAKE_RES);
    c.translate(m, m + rise);   // local (0,0) = TOP-LEFT of the 36x36 footprint

    // ── 1. Cast shadow — QUADRILATERAL, sheared SE (sun NW). A cuboid does not
    // cast a round shadow; the ellipse the old version used was the giveaway
    // that the box was flat.
    c.globalAlpha = 0.30;
    c.fillStyle = hex(MARS_HEX.depth);
    c.beginPath();
    c.moveTo(4, h + 1);
    c.lineTo(w + 5, h + 1);
    c.lineTo(w + 11, h + 8);
    c.lineTo(10, h + 8);
    c.closePath();
    c.fill();
    // wider soft falloff, still sheared the same way
    c.globalAlpha = 0.13;
    c.beginPath();
    c.moveTo(0, h + 2);
    c.lineTo(w + 8, h + 2);
    c.lineTo(w + 15, h + 11);
    c.lineTo(7, h + 11);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;

    // ── 2. Dust settled on the windward (NW) foot — ties the solid to the ground
    c.fillStyle = hex(MARS_HEX.duneLight);
    c.globalAlpha = 0.22;
    c.fillRect(1, h - 3, w - 2, 4);
    c.globalAlpha = 1;

    // ── 3. The cuboid, in two parts:
    //   BODY   = the footprint rect (0,0,w,h) — this is the face the camera sees
    //            head-on, and it is exactly where the hitbox is.
    //   LID    = a trapezoid lifted by `rise` and inset at the far edge, so the
    //            top reads as receding away from the viewer.
    // Drawn body-first, lid over it, so the shared crease at y=0 stays clean.
    const jit = () => (rnd() - 0.5) * 2.2;
    const topY = -rise;
    const inset = 2 + jit() * 0.4;              // far edge narrower = perspective

    // BODY — shaded steel, sunlit band along the NW (top) edge
    c.fillStyle = '#78838f';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#b9c4cf';
    c.globalAlpha = 0.5;
    c.fillRect(1.5, 1.5, w - 3, h * 0.28);
    c.globalAlpha = 1;

    // Corrugation ribs down the body (vertical = it reads as a wall, not a floor)
    c.strokeStyle = hex(MARS_HEX.baseSteel);
    c.lineWidth = 1.2;
    c.globalAlpha = 0.55;
    for (let rx = 6; rx < w - 3; rx += 6) {
        c.beginPath(); c.moveTo(rx, 2); c.lineTo(rx, h - 3); c.stroke();
    }
    c.globalAlpha = 1;

    // LID — trapezoid, the brightest plane (sun is NW / above)
    c.fillStyle = '#9aa6b2';
    c.beginPath();
    c.moveTo(inset, topY);
    c.lineTo(w - inset, topY);
    c.lineTo(w, 0);
    c.lineTo(0, 0);
    c.closePath();
    c.fill();
    // lid highlight — separates the top plane from the body at a glance
    c.fillStyle = '#c6d1dc';
    c.beginPath();
    c.moveTo(inset + 1, topY + 1);
    c.lineTo(w - inset - 1, topY + 1);
    c.lineTo(w - 1.5, -1.5);
    c.lineTo(1.5, -1.5);
    c.closePath();
    c.fill();
    // ribs continue across the lid, converging with the trapezoid
    c.strokeStyle = hex(MARS_HEX.baseSteel);
    c.lineWidth = 1;
    c.globalAlpha = 0.4;
    for (let rx = 6; rx < w - 3; rx += 6) {
        const t = rx / w;
        c.beginPath();
        c.moveTo(inset + (w - inset * 2) * t, topY + 1);
        c.lineTo(rx, -1);
        c.stroke();
    }
    c.globalAlpha = 1;

    // ── 6. Reinforced corner castings (on the body, where they read)
    c.fillStyle = '#6f7a86';
    const cs = 7;
    c.fillRect(0, 0, cs, cs);
    c.fillRect(w - cs, 0, cs, cs);
    c.fillRect(0, h - cs, cs, cs);
    c.fillRect(w - cs, h - cs, cs, cs);

    // ── 7. Cyan status strip + lamp (DETAIL only — cyan areas are reserved, F1)
    c.fillStyle = hex(MARS_HEX.baseCyan);
    c.globalAlpha = 0.55;
    c.fillRect(9, h * 0.52, w - 18, 2.4);
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(w - 9, h * 0.52 + 1.2, 1.7, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    // ── 8. Seeded ID stencil: 2-4 short dark ticks, different per variant
    c.fillStyle = hex(MARS_HEX.depth);
    c.globalAlpha = 0.5;
    const ticks = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < ticks; i++) c.fillRect(8 + i * 5, h * 0.7, 3, 4);
    c.globalAlpha = 1;

    // ── 9. Outline: violet-brown, consistent with the map's shadow tone.
    // Traced around the WHOLE silhouette (top face + body), not just the footprint.
    c.strokeStyle = '#3a2028';
    c.lineWidth = 1.4;
    c.globalAlpha = 0.8;
    c.beginPath();
    c.moveTo(inset, topY);
    c.lineTo(w - inset, topY);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.lineTo(0, 0);
    c.closePath();
    c.stroke();
    // crease between top face and body
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.stroke();
    c.globalAlpha = 1;

    const bt: BakedTex = { tex: PIXI.Texture.from(cv), m, rise };
    return bt;
}

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

    private effects: EffectsManager;
    private audio: AudioSys;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;

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
        this.effects = effects;
        this.audio = audio;

        // ALL display objects created here, before any draw call (E1).
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // Y-sort on the FOOTPRINT's bottom edge, not on the lifted art: the box
        // occupies the ground where its hitbox is.
        this.container.zIndex = Math.floor(y + BOX_H);
        worldContainer.addChild(this.container);

        const bt = getCargoTexture(seed % VARIANT_COUNT);
        this.sprite = new PIXI.Sprite(bt.tex);
        this.sprite.scale.set(1 / BAKE_RES);
        // canvas(m, m + rise) == local(0,0) == top-left of the hitbox
        this.sprite.x = -bt.m;
        this.sprite.y = -(bt.rise + bt.m);
        this.container.addChild(this.sprite);
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
        this.container.x = this.origX + (Math.random() - 0.5) * shake;
        this.container.y = this.origY + (Math.random() - 0.5) * shake;
        setTimeout(() => {
            if (this.container && !this.isDestroyed) {
                this.container.x = this.origX;
                this.container.y = this.origY;
            }
        }, 80);
    }

    private destroy(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        this.w = 0;
        this.h = 0;
        this.container.visible = false;

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
        this.container.x = this.origX;
        this.container.y = this.origY;
        this.container.visible = true;
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
