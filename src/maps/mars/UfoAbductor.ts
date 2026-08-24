import * as PIXI from 'pixi.js';
import type { Enemy, EnemyShotInfo } from '../../entities/Enemy';
import type { ICollidable } from '../../types/MapType';
import type { MarsCargo } from './MarsCargo';
import { MARS_HEX } from '../MarsMap';
import { FuelStation } from './FuelStation';
import { WORLD_W, WORLD_H } from '../../config/constants';

/**
 * UfoAbductor — the map's STAR MECHANIC (grammar layer 9).
 *
 * FAZA MARS M5. A flying saucer cruises the sky, picks a target on the ground,
 * telegraphs, lowers a tractor beam, lifts the victim and drops it. An abducted
 * ENEMY dies on impact and pays out a bonus; an abducted CARGO box is simply
 * taken (it respawns on its own timer).
 *
 * THE PLAYER IS NEVER A TARGET (Mariusz's call). A saucer that can yank the
 * player out of a fight would read as unfair to a 9-12 year old — the UFO is
 * chaotic help, not a threat. That is also why the whole thing is telegraphed
 * from the first frame of the lock (F8): a ground ring appears, pulses, and only
 * then does the beam come down, so a kill is never a surprise.
 *
 * Contract with main.ts (mirrors the Disco pattern from PowerSystem):
 *   - `update(delta, enemies, cargo)` returns an event when a victim hits the
 *     ground; main.ts owns the kill path (score, drops, spawn counters).
 *   - `isAbducted(enemy)` lets the enemy loop SKIP `enemy.update()` for the
 *     victim, so the UFO fully owns its container while it is in the air.
 *   - The UFO keeps a reference to its victim, so it re-checks `active` EVERY
 *     frame and drops the reference if anything else kills it first.
 */

export interface UfoAbductEvent {
    /** Enemy that hit the ground and must be killed by main.ts. */
    enemy: Enemy;
    x: number;
    y: number;
}

/** One frame's worth of things main.ts has to act on. */
export interface UfoTick {
    abducted?: UfoAbductEvent;
    shots?: EnemyShotInfo[];
    destroyed?: { x: number; y: number };
    alerted?: boolean;          // fired once, when the saucer decides to fight back
}

type Phase = 'cruise' | 'lock' | 'devour' | 'toStation' | 'grounded' | 'takeoff';

// ── Refuelling routine (M5c) ──
const REFUEL_MS = 10_000;         // Mariusz: ~10 s on the ground, then it leaves
const CATCHES_PER_REFUEL = 3;     // playtest: it was landing after every meal
const LANDING_MS = 1400;
const TAKEOFF_MS = 1200;
/** HP = 5x mega boss (2000). Technically killable, practically a monument. */
const UFO_HP = 10_000;
const GEM_DROP = 60;              // 3x mega boss — worth the risk
const RESPAWN_MS = 25_000;        // "za jakis czas podlatuje drugi"

// ── Combat ──
/**
 * ESCALATING WARNING (playtest rev 2: "musi byc lepszy system ostrzegania ...
 * 5 strzalow ... gracz musi wiedziec ze niebezpieczenstwo narasta").
 *
 * One flash was not enough — a sprayed burst still felt like an ambush. The
 * saucer now uses the reactor's escalation language from Cyber City: FIVE hits
 * to provoke it, and every hit visibly raises the threat level. Colour walks
 * yellow -> amber -> orange -> red, the pulse gets faster, the ring around the
 * hull fills up like a fuse, and the last step before combat is unmistakable.
 * You cannot stumble into this fight; you can only choose it.
 */
const PROVOKE_HITS = 5;           // hits needed before it shoots back
const ESCALATION_DECAY_MS = 4500; // stop shooting and it cools down a step
/** Threat colours per level 1..5 — the reactor's yellow->red walk. */
const THREAT_COLORS = [0xffd54a, 0xffb03a, 0xff8a3a, 0xff5e6a, 0xff2d3f];
const ALERT_MS = 700;             // final beat between "level 5" and first shot
const SHOT_INTERVAL_MS = 620;
const ALIEN_SHOT_INTERVAL_MS = 900;
const PLASMA_SPEED = 5.2;
const PLASMA_DMG = 90;
const BLASTER_DMG = 55;

const CRUISE_SPEED = 1.25;
const SEARCH_RADIUS = 520;        // how far it will divert to grab something
const LOCK_MS = 1300;             // telegraph + PARALYSIS window before the beam bites
const DEVOUR_MS = 1500;           // victim is drawn up the cone and consumed
const COOLDOWN_MS = 9000;
const BEAM_HALF_W = 42;
const HOVER_DRIFT = 0.055;        // approach lerp toward the target

// ── Altitude illusion (SkyTraffic recipe). The single thing that makes a
// flying object read as flying is a DETACHED GROUND SHADOW; without a reference
// on the ground no amount of lift helps, the object simply "is where it is".
const Z_UFO_AIR = 8000;           // air band, out of the Y-sort entirely
const Z_UFO_SHADOW = 8;           // ground shadow, just under the telegraph ring (9)
const UFO_LIFT_PX = 150;          // +25% (playtest) — body drawn this far above ground
const UFO_BOB_AMP = 4;
const UFO_BOB_RATE = 0.035;
const SHADOW_OFF = 32;            // ~0.216 x lift, matching SkyTraffic's ratio
const DESCEND_PX = 46;            // how far it dips while feeding

export class UfoAbductor {
    private container: PIXI.Container;
    private gfxBody: PIXI.Graphics;
    private gfxLights: PIXI.Graphics;
    private gfxBeam: PIXI.Graphics;
    private gfxRing: PIXI.Graphics;     // ground telegraph — lives in world space

    private x: number;
    private y: number;
    private wanderAngle: number;

    private phase: Phase = 'cruise';
    private phaseAt = 0;
    private cooldownUntil = 0;

    private victimEnemy: Enemy | null = null;
    private victimCargo: MarsCargo | null = null;
    private victimBaseScale = 1;
    private cargoGhost: PIXI.Graphics;   // we draw our own box; MarsCargo art is private
    private gfxShadow: PIXI.Graphics;    // GROUND shadow — separate object, always on
    private targetX = 0;
    private targetY = 0;
    private bob = Math.random() * Math.PI * 2;
    private altitude = 1;                // 1 = cruising high, 0 = dipped to feed

    // ── refuelling + combat state ──
    private gfxAlien: PIXI.Graphics;     // the little pilot, on the ground
    private gfxShield: PIXI.Graphics;    // alarm flare while alerted
    private hp = UFO_HP;
    private alertedAt = 0;               // 0 = calm; else Date.now() of first hit
    private lastShotAt = 0;
    private lastAlienShotAt = 0;
    private alienOut = false;
    private respawnAt = 0;               // >0 = shot down, waiting for the next one
    private dead = false;
    private payoutTaken = false;
    private alertAnnounced = false;
    private threat = 0;                  // 0..PROVOKE_HITS escalation level
    private threatBumped = false;
    private lastHitAt = 0;
    private catches = 0;                 // meals since the last refuel

    constructor(worldContainer: PIXI.Container) {
        // ALL Graphics up front (E1)
        this.container = new PIXI.Container();
        this.gfxBody = new PIXI.Graphics();
        this.gfxLights = new PIXI.Graphics();
        this.gfxBeam = new PIXI.Graphics();
        this.gfxRing = new PIXI.Graphics();
        this.cargoGhost = new PIXI.Graphics();
        this.gfxShadow = new PIXI.Graphics();
        this.gfxAlien = new PIXI.Graphics();
        this.gfxShield = new PIXI.Graphics();

        this.x = WORLD_W * 0.5;
        this.y = WORLD_H * 0.35;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.phaseAt = Date.now();
        this.cooldownUntil = Date.now() + 6000;   // grace period after map start

        // Ground shadow lives in the WORLD, not in the saucer's container — the
        // gap between body and shadow is the whole illusion (lesson A9).
        this.gfxShadow.zIndex = Z_UFO_SHADOW;
        worldContainer.addChild(this.gfxShadow);

        // ground ring sits ON the ground decal band, under everything that drives
        this.gfxRing.zIndex = 9;
        worldContainer.addChild(this.gfxRing);

        // the pilot walks on the GROUND, so it Y-sorts with the world, not with
        // the saucer's air band
        this.gfxAlien.zIndex = FuelStation.LANDING.y + 30;
        worldContainer.addChild(this.gfxAlien);

        // beam under the hull, hull on top; the saucer flies ABOVE the world but
        // below the weather overlay band
        this.container.addChild(this.gfxBeam);
        this.container.addChild(this.cargoGhost);
        this.container.addChild(this.gfxBody);
        this.container.addChild(this.gfxLights);
        this.container.addChild(this.gfxShield);
        // Air band, OUT of the Y-sort: a flying craft that sorts against buildings
        // slides behind them and instantly loses its altitude read (SkyTraffic).
        this.container.zIndex = Z_UFO_AIR;
        worldContainer.addChild(this.container);

        this.drawBody();
    }

    /**
     * Bullet target, pushed ONCE into solidBuildings. Live getters, so the saucer
     * is only hittable while it sits on the pad — you cannot snipe it out of the
     * sky, which keeps the fight an opt-in at the station (and matches the
     * MarsCargo pattern of collapsing w/h to 0 instead of re-pushing arrays).
     */
    public getBulletTarget(): ICollidable & { takeDamage(d: number, hx: number, hy: number): void } {
        const self = this;
        const HALF_W = 52, HALF_H = 22;
        return {
            get x() { return self.hittable ? self.x - HALF_W : -10000; },
            get y() { return self.hittable ? self.y - HALF_H : -10000; },
            get w() { return self.hittable ? HALF_W * 2 : 0; },
            get h() { return self.hittable ? HALF_H * 2 : 0; },
            update: () => {},
            takeDamage: (d: number, hx: number, hy: number) => self.takeDamage(d, hx, hy),
        };
    }

    private get hittable(): boolean {
        return !this.dead && this.phase === 'grounded';
    }

    /** main.ts asks this before calling enemy.update() — Disco pattern. */
    public isAbducted(e: Enemy): boolean {
        return this.victimEnemy === e;
    }

    /** Static saucer art: hull, dome, rim. Lights/beam are per-frame. */
    private drawBody(): void {
        const g = this.gfxBody;
        // Dark underbelly — NOT a contact shadow. At alpha 0.9 this read as the
        // saucer resting on the dirt; it is now a faint hull underside, and the
        // real shadow lives on the ground in its own object (see drawShadow).
        g.beginFill(0x2a2438, 0.35);
        g.drawEllipse(0, 4, 46, 14);
        g.endFill();
        // hull
        g.beginFill(0x8b93a8, 1);
        g.drawEllipse(0, 0, 48, 17);
        g.endFill();
        g.beginFill(0xb4bccd, 1);
        g.drawEllipse(-4, -4, 42, 12);
        g.endFill();
        // rim ridge
        g.lineStyle(2, 0x6d7488, 0.9);
        g.drawEllipse(0, 0, 48, 17);
        g.lineStyle(0);
        // dome — alien green, the map's "this is interactive/alien" colour
        g.beginFill(MARS_HEX.alienGreen, 0.35);
        g.drawEllipse(0, -12, 22, 15);
        g.endFill();
        g.beginFill(0xd9f7e6, 0.55);
        g.drawEllipse(-6, -16, 9, 6);
        g.endFill();
        g.lineStyle(1.6, MARS_HEX.alienViolet, 0.7);
        g.drawEllipse(0, -12, 22, 15);
        g.lineStyle(0);
    }

    /**
     * Cruise, hunt, abduct. Returns an event only on the frame a victim lands.
     */
    public update(delta: number, enemies: Enemy[], cargo: MarsCargo[], playerX: number, playerY: number): UfoTick | null {
        const now = Date.now();
        const tick: UfoTick = {};

        // ── shot down: wait out the respawn, then a fresh saucer arrives ──
        if (this.dead) {
            if (now >= this.respawnAt) this.respawn(now);
            return null;
        }

        // A victim killed by someone else mid-abduction must be released at once,
        // otherwise we would touch a destroyed container (the v0.112 crash).
        if (this.victimEnemy && !this.victimEnemy.active) {
            this.victimEnemy = null;
            this.phase = 'cruise';
            this.cooldownUntil = now + COOLDOWN_MS;
        }

        switch (this.phase) {
            case 'cruise':    this.doCruise(delta, now, enemies, cargo); break;
            case 'lock':      this.doLock(delta, now); break;
            case 'devour':    tick.abducted = this.doDevour(delta, now) ?? undefined; break;
            case 'toStation': this.doToStation(delta, now); break;
            case 'grounded':  this.doGrounded(now); break;
            case 'takeoff':   this.doTakeoff(delta, now); break;
        }

        // ── escalation cools down if you stop shooting (reactor behaviour) ──
        if (this.threat > 0 && this.alertedAt === 0 && now - this.lastHitAt > ESCALATION_DECAY_MS) {
            this.threat--;
            this.lastHitAt = now;
        }

        // ── combat: only ever while grounded, and only after the warning ──
        if (this.phase === 'grounded' && this.alertedAt > 0 && now - this.alertedAt >= ALERT_MS) {
            const shots = this.fireBack(now, playerX, playerY);
            if (shots.length) tick.shots = shots;
        }

        // ── altitude: cruise high, dip to feed, sit on the ground to refuel ──
        let wantAlt = 1;
        if (this.phase === 'lock' || this.phase === 'devour') wantAlt = 0.62;
        else if (this.phase === 'grounded') wantAlt = 0;
        else if (this.phase === 'toStation') wantAlt = 0.75;
        const rate = (this.phase === 'grounded' || this.phase === 'takeoff') ? 0.035 : 0.06;
        this.altitude += (wantAlt - this.altitude) * rate * delta;

        this.bob += UFO_BOB_RATE * delta;
        const lift = UFO_LIFT_PX * this.altitude - DESCEND_PX * (1 - this.altitude);
        this.container.x = this.x;
        this.container.y = this.y - lift + Math.sin(this.bob) * UFO_BOB_AMP * this.altitude;
        // +50% overall (playtest) — the saucer was too small to read as a threat
        this.container.scale.set((1.06 + 0.12 * this.altitude) * 1.5);

        this.drawShadow();
        this.drawLights(now);
        this.drawBeam(now, lift);
        this.drawAlien(now);
        this.drawShield(now);
        return (tick.abducted || tick.shots || tick.destroyed || tick.alerted) ? tick : null;
    }

    // ══════════════════════════════════════════════════════════════
    // REFUELLING ROUTINE (M5c)
    // ══════════════════════════════════════════════════════════════

    /** Fly to the fuel station and set down on the apron. */
    private doToStation(delta: number, now: number): void {
        const L = FuelStation.LANDING;
        this.x += (L.x - this.x) * 0.03 * delta;
        this.y += (L.y - this.y) * 0.03 * delta;
        const near = Math.hypot(L.x - this.x, L.y - this.y) < 14;
        if (near && now - this.phaseAt >= LANDING_MS) {
            this.x = L.x; this.y = L.y;
            this.phase = 'grounded';
            this.phaseAt = now;
            this.alienOut = true;
        }
    }

    /** Sit on the pad while the pilot refuels. Leaves after REFUEL_MS. */
    private doGrounded(now: number): void {
        if (now - this.phaseAt >= REFUEL_MS) {
            this.phase = 'takeoff';
            this.phaseAt = now;
            this.alienOut = false;
            this.alertedAt = 0;          // grudge forgotten once airborne
        }
    }

    /** Climb back to cruising altitude and resume hunting. */
    private doTakeoff(delta: number, now: number): void {
        this.wanderAngle += (Math.random() - 0.5) * 0.03 * delta;
        this.x += Math.cos(this.wanderAngle) * CRUISE_SPEED * 0.8 * delta;
        this.y += Math.sin(this.wanderAngle) * CRUISE_SPEED * 0.5 * delta;
        if (now - this.phaseAt >= TAKEOFF_MS) {
            this.phase = 'cruise';
            this.cooldownUntil = now + COOLDOWN_MS;
        }
    }

    // ══════════════════════════════════════════════════════════════
    // COMBAT (M5c)
    // ══════════════════════════════════════════════════════════════

    /**
     * Hit by a player bullet. Duck-typed by Bullet.ts via solidBuildings.
     *
     * The FIRST hit does not start a fight — it raises the alarm (see ALERT_MS).
     * Damage is taken from the very first shot, but the saucer only shoots back
     * once the warning has played out.
     */
    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.dead || this.phase !== 'grounded') return;   // airborne = untouchable
        void hitX; void hitY;
        this.hp -= dmg;

        // ESCALATION: each hit raises the threat level; combat starts at level 5.
        if (this.threat < PROVOKE_HITS) {
            this.threat++;
            this.lastHitAt = Date.now();
            this.threatBumped = true;                 // main.ts turns this into feedback
            if (this.threat >= PROVOKE_HITS) this.alertedAt = Date.now();
        }
        if (this.hp <= 0) this.markDead();
    }

    /**
     * Threat step to report this frame, or 0. main.ts uses it for escalating
     * shake/sound/HUD, so the ramp is felt and not just seen.
     */
    public consumeThreatBump(): number {
        if (!this.threatBumped) return 0;
        this.threatBumped = false;
        return this.threat;
    }

    /** True on the frame the alarm starts — main.ts turns it into a HUD warning. */
    public consumeAlert(): boolean {
        if (this.alertedAt > 0 && !this.alertAnnounced) {
            this.alertAnnounced = true;
            return true;
        }
        return false;
    }

    private markDead(): void {
        this.dead = true;
        this.respawnAt = Date.now() + RESPAWN_MS;
        this.container.visible = false;
        this.gfxShadow.clear();
        this.gfxRing.clear();
        this.gfxAlien.clear();
        this.alienOut = false;
    }

    /** Where it died — main.ts needs it for the gem burst. */
    public takeDeathPayout(): { x: number; y: number; gems: number } | null {
        if (!this.dead || this.payoutTaken) return null;
        this.payoutTaken = true;
        return { x: this.x, y: this.y, gems: GEM_DROP };
    }

    private respawn(now: number): void {
        this.dead = false;
        this.payoutTaken = false;
        this.alertAnnounced = false;
        this.hp = UFO_HP;
        this.alertedAt = 0;
        this.phase = 'cruise';
        this.altitude = 1;
        this.x = WORLD_W * 0.5;
        this.y = WORLD_H * 0.25;
        this.cooldownUntil = now + 4000;
        this.container.visible = true;
    }

    /**
     * Saucer plasma + pilot blaster. Both are returned as plain shot data and
     * fired by main.ts through the normal enemy-bullet path.
     * `bulletType: null` is deliberate — the sprite baker ignores `color` for
     * named types, and we want the alien green.
     */
    private fireBack(now: number, px: number, py: number): EnemyShotInfo[] {
        const out: EnemyShotInfo[] = [];
        const aim = (fx: number, fy: number) => Math.atan2(py - fy, px - fx);

        if (now - this.lastShotAt >= SHOT_INTERVAL_MS) {
            this.lastShotAt = now;
            out.push({
                x: this.x, y: this.y - 20,
                angle: aim(this.x, this.y - 20),
                speed: PLASMA_SPEED, dmg: PLASMA_DMG,
                color: MARS_HEX.alienGreen,
                burstCount: 2, burstSpread: 0.22,
                bulletType: null,
            });
        }
        if (this.alienOut && now - this.lastAlienShotAt >= ALIEN_SHOT_INTERVAL_MS) {
            this.lastAlienShotAt = now;
            const ax = this.x - 46, ay = this.y + 16;
            out.push({
                x: ax, y: ay,
                angle: aim(ax, ay),
                speed: PLASMA_SPEED * 0.85, dmg: BLASTER_DMG,
                color: MARS_HEX.alienViolet,
                burstCount: 1, burstSpread: 0,
                bulletType: null,
            });
        }
        return out;
    }

    /**
     * The pilot: a small alien that hops out, walks to the hose and refuels.
     * When the shooting starts it plants itself and returns fire with a stubby
     * sci-fi blaster (Mariusz's call — drawn deliberately toy-like, never a
     * realistic firearm; see the map contract).
     */
    private drawAlien(now: number): void {
        const g = this.gfxAlien;
        g.clear();
        if (!this.alienOut) return;

        const ax = this.x - 62;
        const ay = this.y + 18;
        const fighting = this.alertedAt > 0 && now - this.alertedAt >= ALERT_MS;
        const step = Math.sin(now / 190) * (fighting ? 0 : 2.2);
        // +50% (playtest) and a meaner silhouette: hunched, sharp-jawed, glowing
        // slit eyes instead of soft ovals — it should look like it means it.
        const S = 1.5;

        // contact shadow
        g.beginFill(0x000000, 0.30);
        g.drawEllipse(ax + 4, ay + 19 * S, 15 * S, 5 * S);
        g.endFill();
        // legs
        g.lineStyle(3.4 * S, 0x27684a, 1);
        g.moveTo(ax - 4 * S, ay + 8 * S); g.lineTo(ax - 6 * S + step, ay + 17 * S);
        g.moveTo(ax + 4 * S, ay + 8 * S); g.lineTo(ax + 6 * S - step, ay + 17 * S);
        g.lineStyle(0);
        // hunched body + darker underside (menace comes from the crouch)
        g.beginFill(0x2f8557, 1);
        g.drawEllipse(ax, ay + 3 * S, 9.5 * S, 10 * S);
        g.endFill();
        g.beginFill(0x1f6642, 0.8);
        g.drawEllipse(ax + 1.5 * S, ay + 7 * S, 8 * S, 5 * S);
        g.endFill();
        // long arms hanging forward
        g.lineStyle(2.8 * S, 0x2f8557, 1);
        g.moveTo(ax - 7 * S, ay + 1 * S); g.lineTo(ax - 11 * S, ay + 9 * S);
        g.lineStyle(0);
        // big cranium, wider at the top
        g.beginFill(0x46a874, 1);
        g.drawEllipse(ax, ay - 13 * S, 12 * S, 9.5 * S);
        g.endFill();
        g.beginFill(0x59c088, 0.7);                    // sunlit NW dome
        g.drawEllipse(ax - 3 * S, ay - 16 * S, 6.5 * S, 4 * S);
        g.endFill();
        // ANGRY SLIT EYES — angled inward, faint inner glow
        g.beginFill(0x0b0f14, 0.95);
        g.drawPolygon([
            ax - 10 * S, ay - 16 * S, ax - 2 * S, ay - 13 * S,
            ax - 2.5 * S, ay - 10 * S, ax - 10 * S, ay - 12 * S,
        ]);
        g.drawPolygon([
            ax + 10 * S, ay - 16 * S, ax + 2 * S, ay - 13 * S,
            ax + 2.5 * S, ay - 10 * S, ax + 10 * S, ay - 12 * S,
        ]);
        g.endFill();
        g.beginFill(fighting ? 0xff4d5e : MARS_HEX.alienGreen, fighting ? 0.85 : 0.45);
        g.drawEllipse(ax - 6 * S, ay - 13 * S, 2.2 * S, 1.2 * S);
        g.drawEllipse(ax + 6 * S, ay - 13 * S, 2.2 * S, 1.2 * S);
        g.endFill();

        if (fighting) {
            // stubby sci-fi blaster: fat barrel, bulb tip, antenna, coil rings
            const dir = 1;
            g.lineStyle(5 * S, 0x8f9aa6, 1);
            g.moveTo(ax + 7 * dir * S, ay + 1 * S);
            g.lineTo(ax + 22 * dir * S, ay - 2 * S);
            g.lineStyle(2 * S, 0x6d7684, 1);           // coil rings
            for (let i = 0; i < 3; i++) {
                const cxp = ax + (11 + i * 4) * dir * S;
                g.moveTo(cxp, ay - 5 * S); g.lineTo(cxp, ay + 3 * S);
            }
            g.lineStyle(0);
            const charge = 0.4 + 0.6 * Math.abs(Math.sin(now / 130));
            g.beginFill(MARS_HEX.alienViolet, 0.95);
            g.drawCircle(ax + 25 * dir * S, ay - 2 * S, 4.6 * S);
            g.endFill();
            g.beginFill(0xe6d4ff, 0.85 * charge);      // hot core
            g.drawCircle(ax + 25 * dir * S, ay - 2 * S, 2.2 * S);
            g.endFill();
            g.beginFill(MARS_HEX.alienViolet, 0.30 * charge);
            g.drawCircle(ax + 25 * dir * S, ay - 2 * S, 11 * S);
            g.endFill();
            g.lineStyle(1.6 * S, 0x9aa6b2, 0.9);       // antenna
            g.moveTo(ax + 18 * dir * S, ay - 5 * S);
            g.lineTo(ax + 20 * dir * S, ay - 13 * S);
            g.lineStyle(0);

            // MUZZLE FLASH: bright star right after each shot (juicy feedback)
            const sinceShot = now - this.lastAlienShotAt;
            if (sinceShot < 130) {
                const f = 1 - sinceShot / 130;
                const mx = ax + 27 * dir * S, my = ay - 2 * S;
                g.beginFill(0xffffff, 0.9 * f);
                g.drawCircle(mx, my, 5 * S * f + 2);
                g.endFill();
                g.beginFill(MARS_HEX.alienViolet, 0.55 * f);
                g.drawCircle(mx, my, 14 * S * f);
                g.endFill();
                g.lineStyle(3 * f, 0xe6d4ff, 0.8 * f);   // 4-point star
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + 0.4;
                    g.moveTo(mx, my);
                    g.lineTo(mx + Math.cos(a) * 22 * S * f, my + Math.sin(a) * 22 * S * f);
                }
                g.lineStyle(0);
                // recoil smoke puff
                g.beginFill(0xd9c8e6, 0.35 * f);
                g.drawEllipse(mx + 10 * f, my - 4 * f, 8 * f + 3, 5 * f + 2);
                g.endFill();
            }
        } else {
            // refuelling: holds the nozzle, hose line back to the saucer
            g.lineStyle(2.4, 0x3f3a36, 0.9);
            g.moveTo(ax + 7, ay + 2);
            g.quadraticCurveTo(ax + 26, ay + 12, this.x - 8, this.y + 20);
            g.lineStyle(0);
            g.beginFill(0x6a5c52, 1);
            g.drawRoundedRect(ax + 5, ay - 2, 9, 6, 2);
            g.endFill();
            // fuel bubbles rising = "it is actually working"
            for (let i = 0; i < 3; i++) {
                const t = ((now / 900 + i * 0.33) % 1);
                g.beginFill(MARS_HEX.alienGreen, 0.4 * (1 - t));
                g.drawCircle(this.x - 10, this.y + 18 - t * 22, 2 + t * 2);
                g.endFill();
            }
        }
    }

    /**
     * ESCALATION READOUT: a threat ring that fills segment by segment with each
     * hit, walking yellow -> red and pulsing faster as it climbs. This is the
     * whole "danger is building" signal — the player watches the fuse burn.
     */
    private drawShield(now: number): void {
        const g = this.gfxShield;
        g.clear();
        if (this.threat === 0) return;

        const lvl = this.threat;                       // 1..5
        const col = THREAT_COLORS[Math.min(lvl, THREAT_COLORS.length) - 1];
        const armed = this.alertedAt > 0;
        const speed = 340 - lvl * 52;                  // faster pulse each step
        const pulse = 0.5 + 0.5 * Math.sin(now / speed);
        const rx = 78, ry = 34;

        // segmented ring: one lit arc per hit taken = a fuse you can count
        const SEG = PROVOKE_HITS;
        const gap = 0.16;
        for (let i = 0; i < SEG; i++) {
            const lit = i < lvl;
            const a0 = -Math.PI / 2 + (i / SEG) * Math.PI * 2 + gap / 2;
            const a1 = -Math.PI / 2 + ((i + 1) / SEG) * Math.PI * 2 - gap / 2;
            g.lineStyle(lit ? 5 : 2, lit ? col : 0x6b5f66, lit ? 0.55 + 0.4 * pulse : 0.35);
            g.arc(0, -2, rx, a0, a1);
            // ellipse-ish squash: redraw the same arc scaled on Y
            g.lineStyle(0);
        }
        g.lineStyle(0);

        // hull glow rising with the level
        g.beginFill(col, (0.05 + 0.035 * lvl) * pulse);
        g.drawEllipse(0, -2, rx * 0.9, ry);
        g.endFill();

        // ARMED: the last beat before it opens fire — thick flashing rim
        if (armed) {
            const fast = 0.5 + 0.5 * Math.sin(now / 70);
            g.lineStyle(5, 0xff2d3f, 0.6 + 0.4 * fast);
            g.drawEllipse(0, -2, rx + 8 * fast, ry + 5 * fast);
            g.lineStyle(0);
            // alarm lamps left/right of the hull
            for (const sx of [-1, 1]) {
                g.beginFill(0xff2d3f, 0.9 * fast);
                g.drawCircle(sx * 62, -6, 5);
                g.endFill();
            }
        }
    }

    /**
     * Ground shadow — ALWAYS drawn, even while cruising. Higher = smaller, fainter
     * and pushed further SE (sun sits NW). This is the reference that turns "a
     * saucer sliding across the dirt" into "a saucer flying above it".
     */
    private drawShadow(): void {
        const g = this.gfxShadow;
        g.clear();
        const a = this.altitude;
        const off = SHADOW_OFF * a;
        const rx = 34 * (1 - a * 0.34);
        const ry = 13 * (1 - a * 0.34);
        const alpha = 0.30 * (1 - a * 0.5);
        g.beginFill(0x000000, alpha);
        g.drawEllipse(this.x + off, this.y + off * 0.7, rx, ry);
        g.endFill();
        g.beginFill(0x000000, alpha * 0.5);   // soft penumbra
        g.drawEllipse(this.x + off, this.y + off * 0.7, rx * 1.4, ry * 1.4);
        g.endFill();
    }

    /** Wander the sky; divert when something grabbable comes into range. */
    private doCruise(delta: number, now: number, enemies: Enemy[], cargo: MarsCargo[]): void {
        this.wanderAngle += (Math.random() - 0.5) * 0.05 * delta;
        this.x += Math.cos(this.wanderAngle) * CRUISE_SPEED * delta;
        this.y += Math.sin(this.wanderAngle) * CRUISE_SPEED * 0.6 * delta;

        // bounce off the world edges with a margin (it flies over everything)
        const M = 180;
        if (this.x < M) { this.x = M; this.wanderAngle = Math.PI - this.wanderAngle; }
        if (this.x > WORLD_W - M) { this.x = WORLD_W - M; this.wanderAngle = Math.PI - this.wanderAngle; }
        if (this.y < M) { this.y = M; this.wanderAngle = -this.wanderAngle; }
        if (this.y > WORLD_H - M) { this.y = WORLD_H - M; this.wanderAngle = -this.wanderAngle; }

        if (now < this.cooldownUntil) return;

        // pick the nearest enemy in range; fall back to a cargo box
        let best: Enemy | null = null;
        let bestD2 = SEARCH_RADIUS * SEARCH_RADIUS;
        for (const e of enemies) {
            if (!e.active || e.isMegaBoss) continue;   // mega boss is the scenario goal, hands off
            const d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = e; }
        }
        if (best) {
            this.victimEnemy = best;
            this.victimBaseScale = best.container.scale.x;
            this.targetX = best.x;
            this.targetY = best.y;
            this.phase = 'lock';
            this.phaseAt = now;
            return;
        }
        let bestBox: MarsCargo | null = null;
        let bestBoxD2 = SEARCH_RADIUS * SEARCH_RADIUS;
        for (const c of cargo) {
            if (c.isDestroyed) continue;
            const cx = c.x + 18, cy = c.y + 18;
            const d2 = (cx - this.x) ** 2 + (cy - this.y) ** 2;
            if (d2 < bestBoxD2) { bestBoxD2 = d2; bestBox = c; }
        }
        if (bestBox) {
            this.victimCargo = bestBox;
            this.targetX = bestBox.x + 18;
            this.targetY = bestBox.y + 18;
            this.phase = 'lock';
            this.phaseAt = now;
        }
    }

    /**
     * Slide over the target, drop altitude and TELEGRAPH (F8). The victim is
     * already PARALYSED here — the cone pins it in place before it starts to
     * consume, so the sequence reads as "caught, then eaten", not "vanished".
     */
    private doLock(delta: number, now: number): void {
        // track a moving enemy while lining up (it is frozen, but it may have
        // been mid-slide when the beam caught it)
        if (this.victimEnemy) {
            this.targetX = this.victimEnemy.x;
            this.targetY = this.victimEnemy.y;
            // hold it still: main.ts skips enemy.update for the victim, so we
            // simply keep re-stamping the ground pose plus a captive shiver
            const e = this.victimEnemy;
            e.container.x = e.x + Math.sin(now / 45) * 1.6;
            e.container.y = e.y + Math.cos(now / 52) * 1.2;
        }
        this.x += (this.targetX - this.x) * HOVER_DRIFT * delta;
        this.y += (this.targetY - this.y) * HOVER_DRIFT * delta;

        if (now - this.phaseAt >= LOCK_MS) {
            this.phase = 'devour';
            this.phaseAt = now;
            if (this.victimCargo) {
                // MarsCargo owns its art privately; instead of reaching into it we
                // destroy it (its own respawn timer brings it back) and draw our
                // own copy rising up the cone. Zero risk to its collision contract.
                this.victimCargo.takeDamage(999, this.targetX, this.targetY);
            }
        }
    }

    /**
     * The cone CONSUMES the victim: it is drawn up the beam, spinning and
     * shrinking, until it disappears into the hull. For an enemy that moment IS
     * the kill — main.ts gets the event and runs the score path.
     */
    private doDevour(delta: number, now: number): UfoAbductEvent | null {
        void delta;
        const t = Math.min(1, (now - this.phaseAt) / DEVOUR_MS);
        const ease = t * t;                       // slow start, snatched at the end

        if (this.victimEnemy) {
            const e = this.victimEnemy;
            const groundY = this.targetY;
            const mouthY = this.y - 30;           // just under the hull
            e.container.x = this.targetX + Math.sin(now / 60) * 3 * (1 - t);
            e.container.y = groundY + (mouthY - groundY) * ease;
            e.container.scale.set(this.victimBaseScale * (1 - 0.85 * ease));
            e.container.rotation += (0.05 + 0.25 * t) * (1 + t);
            e.container.zIndex = Z_UFO_AIR - 1;   // inside the beam, under the hull
            e.x = this.targetX;
            e.y = this.targetY;                   // logical spot stays on the ground
        }

        if (t >= 1) {
            const e = this.victimEnemy;
            this.victimEnemy = null;
            this.victimCargo = null;
            this.catches++;
            // M5c rev2 (playtest: "zbyt czesto tankuje") — refuel every 3rd meal,
            // otherwise straight back to hunting.
            this.phase = this.catches >= CATCHES_PER_REFUEL ? 'toStation' : 'cruise';
            if (this.phase === 'toStation') this.catches = 0;
            this.phaseAt = now;
            this.cooldownUntil = now + COOLDOWN_MS;
            if (e && e.active) {
                // restore scale/rotation so the death effect is the right size
                e.container.scale.set(this.victimBaseScale);
                e.container.rotation = 0;
                return { enemy: e, x: this.targetX, y: this.targetY };
            }
        }
        return null;
    }

    /** Rim lights chase around the hull; colour shifts while a beam is active. */
    private drawLights(now: number): void {
        const g = this.gfxLights;
        g.clear();
        const active = this.phase !== 'cruise';
        const n = 7;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + now / (active ? 220 : 520);
            const lx = Math.cos(a) * 40;
            const ly = Math.sin(a) * 13 + 3;
            const bright = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 160 + i));
            g.beginFill(active ? MARS_HEX.alienViolet : MARS_HEX.alienGreen, 0.85 * bright);
            g.drawCircle(lx, ly, 3);
            g.endFill();
        }
    }

    /**
     * Tractor beam + ground telegraph ring. During `lock` the ring pulses and the
     * beam is only a hint — the grab happens when the ring completes.
     */
    private drawBeam(now: number, lift: number): void {
        const beam = this.gfxBeam;
        const ring = this.gfxRing;
        beam.clear();
        ring.clear();
        if (this.phase !== 'lock' && this.phase !== 'devour') return;

        // The cone must reach the GROUND, and the body is drawn `lift` px above
        // its ground point — so in container space the drop is lift + the
        // distance from the saucer's ground point down to the victim.
        const drop = lift + (this.targetY - this.y);
        const lockT = this.phase === 'lock'
            ? Math.min(1, (now - this.phaseAt) / LOCK_MS)
            : 1;
        const devourT = this.phase === 'devour'
            ? Math.min(1, (now - this.phaseAt) / DEVOUR_MS)
            : 0;

        // ground ring — the actual warning (world space, under the victim)
        ring.x = this.targetX;
        ring.y = this.targetY;
        ring.lineStyle(3, MARS_HEX.alienGreen, 0.55 + 0.35 * Math.sin(now / 120));
        ring.drawEllipse(0, 0, 40, 15);
        ring.lineStyle(2, MARS_HEX.alienViolet, 0.6);
        ring.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + lockT * Math.PI * 2);
        ring.lineStyle(0);
        ring.beginFill(MARS_HEX.alienGreen, 0.10 * lockT);
        ring.drawEllipse(0, 0, 38, 14);
        ring.endFill();

        // Cone: narrow at the hull, wide on the ground. It brightens as the lock
        // completes and again while feeding — the beam visibly "bites".
        const bite = this.phase === 'devour' ? 1 + 0.5 * Math.sin(devourT * Math.PI) : 1;
        const w = BEAM_HALF_W * (this.phase === 'lock' ? 0.45 + 0.55 * lockT : 1) * bite;
        const a = (this.phase === 'devour' ? 0.24 : 0.13) * lockT;
        beam.beginFill(MARS_HEX.alienGreen, a);
        beam.drawPolygon([-11, 8, 11, 8, w, drop, -w, drop]);
        beam.endFill();
        beam.beginFill(0xd9f7e6, a * 0.8);
        beam.drawPolygon([-6, 8, 6, 8, w * 0.42, drop, -w * 0.42, drop]);
        beam.endFill();
        // rungs climbing the beam = "something is being pulled up"
        beam.lineStyle(1.6, 0xd9f7e6, (this.phase === 'devour' ? 0.5 : 0.32) * lockT);
        const rungs = this.phase === 'devour' ? 6 : 4;
        for (let i = 0; i < rungs; i++) {
            const speed = this.phase === 'devour' ? 260 : 520;
            const t = ((now / speed + i / rungs) % 1);
            const yy = 8 + (drop - 8) * (1 - t);
            const ww = w * (0.3 + 0.7 * (1 - t));
            beam.moveTo(-ww, yy);
            beam.lineTo(ww, yy);
        }
        beam.lineStyle(0);
        // swallow flash at the hull mouth as the victim goes in
        if (this.phase === 'devour') {
            beam.beginFill(0xd9f7e6, 0.30 * devourT * devourT);
            beam.drawEllipse(0, 6, 26 * devourT, 10 * devourT);
            beam.endFill();
        }

        // cargo box being drawn up the cone (our own copy — see doLock)
        const ghost = this.cargoGhost;
        ghost.clear();
        if (this.victimCargo && this.phase === 'devour') {
            const t = devourT * devourT;
            const gy = drop - (drop - 20) * t;
            const s = 1 - 0.8 * t;
            ghost.rotation = devourT * 2.2;
            ghost.beginFill(0x9aa6b2, 1);
            ghost.drawRoundedRect(-18 * s, gy - 18 * s, 36 * s, 36 * s, 3);
            ghost.endFill();
            ghost.lineStyle(1.4, 0x3a2028, 0.8);
            ghost.drawRoundedRect(-18 * s, gy - 18 * s, 36 * s, 36 * s, 3);
            ghost.lineStyle(0);
            ghost.beginFill(MARS_HEX.baseCyan, 0.5);
            ghost.drawRect(-9 * s, gy - 2 * s, 18 * s, 2.4 * s);
            ghost.endFill();
        }
    }
}
