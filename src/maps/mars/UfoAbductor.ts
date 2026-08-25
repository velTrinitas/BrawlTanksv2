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
    private gfxBeam: PIXI.Graphics;
    private gfxRing: PIXI.Graphics;     // ground telegraph — lives in world space

    // ── BAKED components (art-dir pass). Each of these used to be a per-frame
    // `clear()` + full redraw; now the geometry is built ONCE and every frame
    // only touches transform/tint/alpha/visible. See the class doc.
    private lightsContainer: PIXI.Container;
    private lightSprites: PIXI.Graphics[] = [];

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
    // Pilot: two BAKED poses swapped by `visible`, plus the two things that
    // genuinely move (the hose bezier and the rising bubbles).
    private alienContainer: PIXI.Container;
    private alienRefuelPose: PIXI.Graphics;
    private alienCombatPose: PIXI.Graphics;
    private alienMuzzleFlash: PIXI.Graphics;
    private fuelBubbles: PIXI.Graphics[] = [];
    private gfxAlienHose: PIXI.Graphics;
    // Escalation readout: baked segments + glow + lamps + the ARMED rim.
    private shieldContainer: PIXI.Container;
    private shieldSegments: PIXI.Graphics[] = [];
    private shieldGlow: PIXI.Graphics;
    private shieldLamps: PIXI.Graphics[] = [];
    private shieldArmedRim: PIXI.Graphics;
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
        // ALL Graphics up front (E1) — INCLUDING the pooled ones. The art-dir
        // draft allocated the fuel bubbles inside its bake method, i.e. after the
        // first block; that is the same E1 letter this file has been bitten by.
        this.container = new PIXI.Container();
        this.gfxBody = new PIXI.Graphics();
        this.gfxBeam = new PIXI.Graphics();
        this.gfxRing = new PIXI.Graphics();
        this.cargoGhost = new PIXI.Graphics();
        this.gfxShadow = new PIXI.Graphics();
        this.lightsContainer = new PIXI.Container();
        this.alienContainer = new PIXI.Container();
        this.alienRefuelPose = new PIXI.Graphics();
        this.alienCombatPose = new PIXI.Graphics();
        this.alienMuzzleFlash = new PIXI.Graphics();
        this.gfxAlienHose = new PIXI.Graphics();
        this.shieldContainer = new PIXI.Container();
        this.shieldGlow = new PIXI.Graphics();
        this.shieldArmedRim = new PIXI.Graphics();
        for (let i = 0; i < 7; i++) this.lightSprites.push(new PIXI.Graphics());
        for (let i = 0; i < PROVOKE_HITS; i++) this.shieldSegments.push(new PIXI.Graphics());
        for (let i = 0; i < 2; i++) this.shieldLamps.push(new PIXI.Graphics());
        for (let i = 0; i < 3; i++) this.fuelBubbles.push(new PIXI.Graphics());

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
        this.alienContainer.zIndex = FuelStation.LANDING.y + 30;
        this.alienContainer.addChild(this.alienRefuelPose);
        this.alienContainer.addChild(this.alienCombatPose);
        this.alienContainer.addChild(this.alienMuzzleFlash);
        for (const b of this.fuelBubbles) this.alienContainer.addChild(b);
        worldContainer.addChild(this.alienContainer);

        // The hose spans pilot -> saucer, so both endpoints are WORLD coords and
        // it cannot live inside the pilot's local container. It therefore needs
        // its OWN zIndex: left at the default 0 it sorts below the ground decal
        // band (shadow 8, ring 9) and the hose disappears under the dirt.
        this.gfxAlienHose.zIndex = FuelStation.LANDING.y + 31;
        worldContainer.addChild(this.gfxAlienHose);

        // beam under the hull, hull on top; the saucer flies ABOVE the world but
        // below the weather overlay band
        this.container.addChild(this.gfxBeam);
        this.container.addChild(this.cargoGhost);
        this.container.addChild(this.gfxBody);
        for (const l of this.lightSprites) this.lightsContainer.addChild(l);
        this.container.addChild(this.lightsContainer);
        this.shieldContainer.addChild(this.shieldGlow);
        for (const s of this.shieldSegments) this.shieldContainer.addChild(s);
        this.shieldContainer.addChild(this.shieldArmedRim);
        for (const l of this.shieldLamps) this.shieldContainer.addChild(l);
        this.container.addChild(this.shieldContainer);
        // Air band, OUT of the Y-sort: a flying craft that sorts against buildings
        // slides behind them and instantly loses its altitude read (SkyTraffic).
        this.container.zIndex = Z_UFO_AIR;
        worldContainer.addChild(this.container);

        this.drawBody();
        this.bakeShadow();
        this.bakeLights();
        this.bakeShield();
        this.bakeAlien();
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

    /**
     * Static saucer art: hull, panelling, dome, rim. Baked once — only the rim
     * lights, beam and escalation readout change per frame.
     *
     * Art-dir pass added: hull panel lines, rim rivets, a dark cockpit interior
     * with the pilot's silhouette visible inside, and specular highlights on the
     * glass. All of it is free — it lands in the same one-time bake.
     *
     * DELIBERATELY NOT TAKEN from the draft: an exhaust glow under the belly. It
     * sits exactly where the tractor beam originates, so during a grab the player
     * would see two overlapping light sources and lose track of where the beam
     * starts. Czytelnosc beats the extra shine.
     */
    private drawBody(): void {
        const g = this.gfxBody;
        // Dark underbelly — NOT a contact shadow. At alpha 0.9 this read as the
        // saucer resting on the dirt; it is now a faint hull underside, and the
        // real shadow lives on the ground in its own object (see bakeShadow).
        // The draft pushed this back to alpha 1.0, which resurrects exactly that
        // bug — the saucer looks parked on the ground while flying (A9).
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

        // hull panel lines — cheap high-detail, reads as engineered plating
        g.lineStyle(1, 0x6d7488, 0.5);
        g.drawEllipse(0, -2, 38, 10);
        g.moveTo(-28, 0); g.lineTo(-20, 8);
        g.moveTo(28, 0); g.lineTo(20, 8);
        g.moveTo(0, 6); g.lineTo(0, 15);
        g.lineStyle(0);

        // rivets around the rim — only the front-facing half is visible from here
        g.beginFill(0x5a6175, 0.8);
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            if (Math.sin(a) > 0) g.drawCircle(Math.cos(a) * 44, Math.sin(a) * 14 + 1, 1.2);
        }
        g.endFill();

        // rim ridge
        g.lineStyle(2, 0x6d7488, 0.9);
        g.drawEllipse(0, 0, 48, 17);
        g.lineStyle(0);

        // cockpit interior — a dark well behind the glass gives the dome depth
        g.beginFill(0x161a23, 0.9);
        g.drawEllipse(0, -12, 20, 13);
        g.endFill();
        // ...with the pilot sitting in it. Ties the saucer to the little alien
        // that later climbs out at the fuel station: same creature, one story.
        g.beginFill(0x224a35, 1);
        g.drawEllipse(0, -11, 7, 8);
        g.drawEllipse(0, -16, 9, 7);
        g.endFill();
        g.beginFill(MARS_HEX.alienGreen, 0.6);
        g.drawCircle(-3, -16, 1.5);
        g.drawCircle(3, -16, 1.5);
        g.endFill();

        // dome — alien green, the map's "this is interactive/alien" colour
        g.beginFill(MARS_HEX.alienGreen, 0.25);
        g.drawEllipse(0, -12, 22, 15);
        g.endFill();
        // specular highlights: two offset glints = curved glass, not a flat disc
        g.beginFill(0xffffff, 0.4);
        g.drawEllipse(-8, -16, 6, 3);
        g.endFill();
        g.beginFill(0xffffff, 0.2);
        g.drawEllipse(-13, -13, 3, 5);
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

        // Transform-only updates on the baked parts; the beam is the one thing
        // left that genuinely has to re-tessellate every frame (its geometry
        // links a moving hull to a fixed ground point).
        this.updateShadow(lift);
        this.updateLights(now);
        this.updateShield(now);
        this.updateAlien(now);
        this.drawBeam(now, lift);
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
        // baked art is reused by the respawned saucer — hide it, never clear it
        this.gfxShadow.visible = false;
        this.gfxRing.clear();
        this.gfxAlienHose.clear();
        this.alienContainer.visible = false;
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
        this.gfxShadow.visible = true;   // paired with markDead's hide
        // A fresh saucer gets a fresh fuse. Inheriting the dead one's `threat`
        // did more than show a lit ring: at threat 5 the guard in takeDamage
        // (`threat < PROVOKE_HITS`) is already false, so the level never climbs
        // and `alertedAt` is never set — the new saucer took hits with no warning
        // and never shot back until ESCALATION_DECAY_MS burned the fuse down
        // (~22 s). Decyzja Mariusza 2026-08-25.
        this.threat = 0;
        this.threatBumped = false;   // stale bump left over by the previous hull
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
    private bakeAlien(): void {
        // +50% (playtest) and a meaner silhouette: hunched, sharp-jawed, glowing
        // slit eyes instead of soft ovals — it should look like it means it.
        const S = 1.5;

        // ── POSE 1: REFUELLING (calm, head down over the nozzle) ────────────
        const r = this.alienRefuelPose;
        r.beginFill(0x000000, 0.30);                   // contact shadow
        r.drawEllipse(4, 19 * S, 15 * S, 5 * S);
        r.endFill();
        r.lineStyle(3.4 * S, 0x27684a, 1);             // legs, planted
        r.moveTo(-4 * S, 8 * S); r.lineTo(-6 * S, 17 * S);
        r.moveTo(4 * S, 8 * S); r.lineTo(6 * S, 17 * S);
        r.lineStyle(0);
        r.beginFill(0x2f8557, 1);                      // hunched body
        r.drawEllipse(0, 4 * S, 9.5 * S, 10 * S);
        r.endFill();
        r.beginFill(0x1f6642, 0.8);                    // darker underside
        r.drawEllipse(1.5 * S, 8 * S, 8 * S, 5 * S);
        r.endFill();
        r.beginFill(0x46a874, 1);                      // cranium, tipped forward
        r.drawEllipse(2 * S, -10 * S, 12 * S, 9.5 * S);
        r.endFill();
        r.beginFill(0x0b0f14, 0.95);                   // soft eyes (not angry yet)
        r.drawEllipse(-4 * S, -10 * S, 3 * S, 2 * S);
        r.drawEllipse(8 * S, -10 * S, 3 * S, 2 * S);
        r.endFill();
        r.lineStyle(2.8 * S, 0x2f8557, 1);             // arm down to the nozzle
        r.moveTo(-2 * S, 4 * S); r.lineTo(4 * S, 12 * S);
        r.lineStyle(0);
        r.beginFill(0x6a5c52, 1);
        // nozzle scaled by S like everything else — the draft left this one in
        // raw px, so the grip shrank to a chip next to the +50% pilot.
        r.drawRoundedRect(5 * S, -2 * S, 9 * S, 6 * S, 2);
        r.endFill();

        // ── POSE 2: COMBAT (braced, blaster out) ────────────────────────────
        const c = this.alienCombatPose;
        c.beginFill(0x000000, 0.30);                   // wider stance = wider shadow
        c.drawEllipse(4, 19 * S, 18 * S, 6 * S);
        c.endFill();
        c.lineStyle(3.4 * S, 0x27684a, 1);             // legs braced apart
        c.moveTo(-4 * S, 8 * S); c.lineTo(-10 * S, 18 * S);
        c.moveTo(4 * S, 8 * S); c.lineTo(12 * S, 17 * S);
        c.lineStyle(0);
        c.beginFill(0x2f8557, 1);                      // upright, aggressive
        c.drawEllipse(0, 3 * S, 10 * S, 11 * S);
        c.endFill();
        c.beginFill(0x1f6642, 0.8);
        c.drawEllipse(1.5 * S, 7 * S, 8 * S, 5 * S);
        c.endFill();
        c.lineStyle(2.8 * S, 0x2f8557, 1);             // long arm hanging forward
        c.moveTo(-7 * S, 1 * S); c.lineTo(-11 * S, 9 * S);
        c.lineStyle(0);
        c.beginFill(0x46a874, 1);
        c.drawEllipse(0, -13 * S, 12 * S, 9.5 * S);
        c.endFill();
        c.beginFill(0x59c088, 0.7);                    // sunlit NW dome
        c.drawEllipse(-3 * S, -16 * S, 6.5 * S, 4 * S);
        c.endFill();
        c.beginFill(0x0b0f14, 0.95);                   // ANGRY SLIT EYES
        c.drawPolygon([-10 * S, -16 * S, -2 * S, -13 * S, -2.5 * S, -10 * S, -10 * S, -12 * S]);
        c.drawPolygon([10 * S, -16 * S, 2 * S, -13 * S, 2.5 * S, -10 * S, 10 * S, -12 * S]);
        c.endFill();
        c.beginFill(0xff4d5e, 0.85);                   // red combat glow
        c.drawEllipse(-6 * S, -13 * S, 2.2 * S, 1.2 * S);
        c.drawEllipse(6 * S, -13 * S, 2.2 * S, 1.2 * S);
        c.endFill();
        // stubby sci-fi blaster: fat barrel, coil rings, bulb tip, antenna
        const dir = 1;
        c.lineStyle(5 * S, 0x8f9aa6, 1);
        c.moveTo(7 * dir * S, 1 * S); c.lineTo(22 * dir * S, -2 * S);
        c.lineStyle(2 * S, 0x6d7684, 1);
        for (let i = 0; i < 3; i++) {
            const cxp = (11 + i * 4) * dir * S;
            c.moveTo(cxp, -5 * S); c.lineTo(cxp, 3 * S);
        }
        c.lineStyle(0);
        c.beginFill(MARS_HEX.alienViolet, 0.95);
        c.drawCircle(25 * dir * S, -2 * S, 4.6 * S);
        c.endFill();
        c.beginFill(0xe6d4ff, 0.85);                   // hot core
        c.drawCircle(25 * dir * S, -2 * S, 2.2 * S);
        c.endFill();
        c.lineStyle(1.6 * S, 0x9aa6b2, 0.9);           // antenna
        c.moveTo(18 * dir * S, -5 * S); c.lineTo(20 * dir * S, -13 * S);
        c.lineStyle(0);

        // ── MUZZLE FLASH: baked once, popped by alpha + scale ───────────────
        // Drawn AROUND THE ORIGIN and moved to the barrel tip by x/y — same trap
        // as the alarm lamps: baking it at x = 40 and then scaling would slide the
        // flash ~16 px off the muzzle on every shot.
        const f = this.alienMuzzleFlash;
        f.beginFill(0xffffff, 1);
        f.drawCircle(0, 0, 5 * S + 2);
        f.endFill();
        f.beginFill(MARS_HEX.alienViolet, 0.6);
        f.drawCircle(0, 0, 14 * S);
        f.endFill();
        f.lineStyle(3, 0xe6d4ff, 0.9);                 // 4-point star
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            f.moveTo(0, 0);
            f.lineTo(Math.cos(a) * 22 * S, Math.sin(a) * 22 * S);
        }
        f.lineStyle(0);
        f.beginFill(0xd9c8e6, 0.4);                    // recoil smoke puff
        f.drawEllipse(10, -4, 11, 7);
        f.endFill();
        f.x = 27 * dir * S;
        f.y = -2 * S;

        // fuel bubbles — white unit circles, coloured and scaled per frame
        for (const b of this.fuelBubbles) {
            b.beginFill(MARS_HEX.alienGreen, 1);
            b.drawCircle(0, 0, 1);
            b.endFill();
        }

        this.alienMuzzleFlash.visible = false;
        this.alienContainer.visible = false;
    }

    private updateAlien(now: number): void {
        this.gfxAlienHose.clear();
        this.alienContainer.visible = this.alienOut;
        if (!this.alienOut) return;

        const ax = this.x - 62;
        const ay = this.y + 18;
        const fighting = this.alertedAt > 0 && now - this.alertedAt >= ALERT_MS;

        this.alienCombatPose.visible = fighting;
        this.alienRefuelPose.visible = !fighting;
        for (const b of this.fuelBubbles) b.visible = !fighting;

        this.alienContainer.x = ax;
        this.alienContainer.y = ay;

        if (fighting) {
            // planted: braced to shoot, no sway
            this.alienRefuelPose.rotation = 0;
            this.alienRefuelPose.y = 0;
            this.alienMuzzleFlash.visible = false;

            const sinceShot = now - this.lastAlienShotAt;
            if (sinceShot < 130) {
                const t = 1 - sinceShot / 130;
                this.alienMuzzleFlash.visible = true;
                this.alienMuzzleFlash.alpha = t;
                this.alienMuzzleFlash.scale.set(0.6 + 0.4 * t);   // explosive pop
            }
        } else {
            this.alienMuzzleFlash.visible = false;

            // WADDLE — kept. The old per-frame pose swung the pilot's legs; a
            // baked pose cannot do that, so the sway becomes a transform, which
            // is free. The draft replaced this with `rotation = 0` under a
            // comment describing an animation that was not there, turning the
            // pilot into a statue for the whole 10 s refuel.
            //
            // Applied to the POSE, not the container: the fuel bubbles are
            // siblings positioned at the SAUCER's fill port ~60 px away, and
            // swaying the container would swing them along with the pilot.
            this.alienRefuelPose.rotation = Math.sin(now / 190) * 0.06;
            this.alienRefuelPose.y = Math.sin(now / 190) * 2.4;

            // hose bezier — genuinely dynamic (pilot end local, saucer end world)
            this.gfxAlienHose.lineStyle(2.4, 0x3f3a36, 0.9);
            this.gfxAlienHose.moveTo(ax + 7, ay + 2);
            this.gfxAlienHose.quadraticCurveTo(ax + 26, ay + 12, this.x - 8, this.y + 20);
            this.gfxAlienHose.lineStyle(0);

            // fuel bubbles rising = "it is actually working"
            for (let i = 0; i < this.fuelBubbles.length; i++) {
                const b = this.fuelBubbles[i];
                const t = ((now / 900 + i * 0.33) % 1);
                b.x = (this.x - ax) - 10;
                b.y = (this.y - ay) + 18 - t * 22;
                b.scale.set(2 + t * 2);
                b.alpha = 0.4 * (1 - t);
            }
        }
    }

    /**
     * ESCALATION READOUT: a threat ring that fills segment by segment with each
     * hit, walking yellow -> red and pulsing faster as it climbs. This is the
     * whole "danger is building" signal — the player watches the fuse burn.
     */
    private bakeShield(): void {
        const rx = 78, ry = 34;
        const gap = 0.16;

        // hull glow — white, tinted per level in updateShield
        this.shieldGlow.beginFill(0xffffff, 1);
        this.shieldGlow.drawEllipse(0, -2, rx * 0.9, ry);
        this.shieldGlow.endFill();

        // one arc per hit = a fuse the player can count
        for (let i = 0; i < PROVOKE_HITS; i++) {
            const a0 = -Math.PI / 2 + (i / PROVOKE_HITS) * Math.PI * 2 + gap / 2;
            const a1 = -Math.PI / 2 + ((i + 1) / PROVOKE_HITS) * Math.PI * 2 - gap / 2;
            const g = this.shieldSegments[i];
            g.lineStyle(5, 0xffffff, 1);
            g.arc(0, -2, rx, a0, a1);
            g.lineStyle(0);
        }

        // ARMED rim — KEPT (the draft dropped it). This is the loudest signal the
        // saucer gives before it opens fire; without it the last beat before
        // combat is just two small lamps. Drawn at the LOCAL origin so the pulse
        // can be a `scale` animation instead of a per-frame redraw; the container
        // carries the -2 offset the old ellipse had baked into its centre.
        this.shieldArmedRim.lineStyle(5, 0xffffff, 1);
        this.shieldArmedRim.drawEllipse(0, 0, rx, ry);
        this.shieldArmedRim.lineStyle(0);
        this.shieldArmedRim.y = -2;

        // alarm lamps — drawn AT THE ORIGIN, placed by x/y. The draft drew them
        // at x = +/-62 and then animated `scale`, which multiplies the offset too:
        // the lamps slid ~25 px outward on every pulse instead of throbbing.
        for (let i = 0; i < 2; i++) {
            const g = this.shieldLamps[i];
            g.beginFill(0xffffff, 1);
            g.drawCircle(0, 0, 5);
            g.endFill();
            g.x = (i === 0 ? -1 : 1) * 62;
            g.y = -6;
        }
    }

    private updateShield(now: number): void {
        this.shieldContainer.visible = this.threat > 0;
        if (this.threat === 0) return;

        const lvl = this.threat;                       // 1..5
        const col = THREAT_COLORS[Math.min(lvl, THREAT_COLORS.length) - 1];
        const armed = this.alertedAt > 0;
        const speed = 340 - lvl * 52;                  // faster pulse each step
        const pulse = 0.5 + 0.5 * Math.sin(now / speed);

        for (let i = 0; i < PROVOKE_HITS; i++) {
            const lit = i < lvl;
            const seg = this.shieldSegments[i];
            seg.tint = lit ? col : 0x6b5f66;
            seg.alpha = lit ? 0.55 + 0.4 * pulse : 0.35;
        }

        this.shieldGlow.tint = col;
        this.shieldGlow.alpha = (0.05 + 0.035 * lvl) * pulse;

        const fast = 0.5 + 0.5 * Math.sin(now / 70);
        this.shieldArmedRim.visible = armed;
        if (armed) {
            this.shieldArmedRim.tint = 0xff2d3f;
            this.shieldArmedRim.alpha = 0.6 + 0.4 * fast;
            // same swell the old redraw had: rx +8, ry +5 at full pulse
            this.shieldArmedRim.scale.set(1 + (8 / 78) * fast, 1 + (5 / 34) * fast);
        }
        for (const lamp of this.shieldLamps) {
            lamp.visible = armed;
            if (armed) {
                lamp.tint = 0xff2d3f;
                lamp.alpha = 0.9 * fast;
                lamp.scale.set(1 + 0.4 * fast);
            }
        }
    }

    /**
     * Ground shadow — ALWAYS drawn, even while cruising. Higher = smaller, fainter
     * and pushed further SE (sun sits NW). This is the reference that turns "a
     * saucer sliding across the dirt" into "a saucer flying above it".
     */
    private bakeShadow(): void {
        const g = this.gfxShadow;
        // 3 concentric ellipses = a graded penumbra with zero filter cost. Drawn
        // around the LOCAL origin so `scale` in updateShadow is a pure resize and
        // does not drag the shape sideways.
        g.beginFill(0x000000, 0.15);
        g.drawEllipse(0, 0, 48, 18);
        g.endFill();
        g.beginFill(0x000000, 0.25);
        g.drawEllipse(0, 0, 34, 13);
        g.endFill();
        g.beginFill(0x000000, 0.35);
        g.drawEllipse(0, 0, 20, 8);
        g.endFill();
    }

    /**
     * Higher = smaller, fainter, pushed further SE (sun sits NW). This is the
     * reference that turns "a saucer sliding across the dirt" into "a saucer
     * flying above it" — hence transform-only, never a redraw.
     */
    private updateShadow(lift: number): void {
        const a = this.altitude;
        const off = SHADOW_OFF * a;
        // A9 fix — KEEP. When parked (altitude 0) `lift` goes NEGATIVE: the hull
        // is drawn ~46 px south of its ground point, and a shadow that ignores
        // that stays behind, so a landed saucer hovers beside its own shadow. The
        // art-dir draft dropped this term from its updateShadow.
        this.gfxShadow.x = this.x + off;
        this.gfxShadow.y = this.y + Math.max(0, -lift) + off * 0.7;
        const s = 1 - a * 0.34;
        this.gfxShadow.scale.set(s, s);
        this.gfxShadow.alpha = 1 - a * 0.5;
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

        const t = Math.min(1, (now - this.phaseAt) / DEVOUR_MS);
        const ease = t * t;                       // slow start, snatched at the end

        if (this.victimEnemy) {
            const e = this.victimEnemy;
            const groundY = this.targetY;
            // Mouth = the actual hull position. `this.y - 30` was a guess made
            // before the lift existed, so the victim vanished ~60 px BELOW the
            // saucer instead of disappearing into it.
            const lift = UFO_LIFT_PX * this.altitude - DESCEND_PX * (1 - this.altitude);
            const mouthY = this.y - lift + 6;
            e.container.x = this.targetX + Math.sin(now / 60) * 3 * (1 - t);
            e.container.y = groundY + (mouthY - groundY) * ease;
            e.container.scale.set(this.victimBaseScale * (1 - 0.85 * ease));
            e.container.rotation += (0.05 + 0.25 * t) * (1 + t) * delta;   // D4
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

    /** Lamps drawn WHITE at their own origin — colour comes from `tint`. */
    private bakeLights(): void {
        for (const l of this.lightSprites) {
            l.beginFill(0xffffff, 1);
            l.drawCircle(0, 0, 3);
            l.endFill();
        }
    }

    /** Rim lights chase around the hull; colour shifts while a beam is active. */
    private updateLights(now: number): void {
        const active = this.phase !== 'cruise';
        const col = active ? MARS_HEX.alienViolet : MARS_HEX.alienGreen;
        const n = this.lightSprites.length;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + now / (active ? 220 : 520);
            const l = this.lightSprites[i];
            l.x = Math.cos(a) * 40;
            l.y = Math.sin(a) * 13 + 3;
            l.tint = col;
            l.alpha = 0.85 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 160 + i)));
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
        // The container is SCALED (x1.5 playtest bump), so world-space pixels must
        // be divided by that scale — otherwise the cone overshoots the ground by
        // ~50 px and the telegraph ring ends up HALF the width of the real beam,
        // which is exactly the F8 promise ("the ring is the danger zone") broken.
        const s = this.container.scale.y || 1;
        const drop = (lift + (this.targetY - this.y)) / s;
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
        // rotating targeting crosshair — reads as "something is aiming at THIS
        // spot", which is the whole job of the telegraph (F8)
        const ca = now / 300;
        ring.lineStyle(1.5, MARS_HEX.alienViolet, 0.4 * lockT);
        ring.moveTo(Math.cos(ca) * 38, Math.sin(ca) * 14);
        ring.lineTo(-Math.cos(ca) * 38, -Math.sin(ca) * 14);
        ring.moveTo(Math.cos(ca + 1.57) * 38, Math.sin(ca + 1.57) * 14);
        ring.lineTo(-Math.cos(ca + 1.57) * 38, -Math.sin(ca + 1.57) * 14);
        // the fuse itself, thicker (2 -> 3) so the countdown is the loudest line
        ring.lineStyle(3, MARS_HEX.alienViolet, 0.8);
        ring.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + lockT * Math.PI * 2);
        ring.lineStyle(0);
        // fill alpha stays at 0.10 (draft raised it to 0.15) — see the note on
        // beam alphas below: this is the map's largest lit surface.
        ring.beginFill(MARS_HEX.alienGreen, 0.10 * lockT);
        ring.drawEllipse(0, 0, 38, 14);
        ring.endFill();

        // Cone: narrow at the hull, wide on the ground. It brightens as the lock
        // completes and again while feeding — the beam visibly "bites".
        // `bite` softened 0.5 -> 0.3: at 0.5 the cone flared half again as wide
        // mid-swallow, which briefly made the beam wider than the ring that
        // promised its footprint.
        const bite = this.phase === 'devour' ? 1 + 0.3 * Math.sin(devourT * Math.PI) : 1;
        const w = (BEAM_HALF_W / s) * (this.phase === 'lock' ? 0.45 + 0.55 * lockT : 1) * bite;
        // Alphas held at 0.13 / 0.24 (the draft wanted 0.15 / 0.28). The cone is
        // the single largest translucent surface on the map and fill-rate is what
        // kills mobile — +15-30% overdraw here buys almost no visible punch.
        const a = (this.phase === 'devour' ? 0.24 : 0.13) * lockT;
        beam.beginFill(MARS_HEX.alienGreen, a);
        beam.drawPolygon([-11, 8, 11, 8, w, drop, -w, drop]);
        beam.endFill();
        // core narrowed 0.42 -> 0.35: a tighter hot centre separates the two cone
        // layers instead of washing them into one slab
        beam.beginFill(0xd9f7e6, a * 0.8);
        beam.drawPolygon([-5, 8, 5, 8, w * 0.35, drop, -w * 0.35, drop]);
        beam.endFill();
        // HYBRID (the draft replaced all rungs with 8 vertical streaks): rungs
        // stay, because a ladder climbing the cone is what says "it is pulling
        // something UP" — and at antialias-off a 1px vertical line shimmers. The
        // streaks join in only while feeding, as extra energy on top of the
        // ladder rather than instead of it.
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
        if (this.phase === 'devour') {
            beam.lineStyle(2, 0xd9f7e6, 0.45);
            for (let i = 0; i < 3; i++) {
                const t = ((now / 150 + i / 3) % 1);
                const yy = 8 + (drop - 8) * (1 - t);
                const xOff = Math.sin(i * 123.4) * w * 0.6;
                beam.moveTo(xOff, yy);
                beam.lineTo(xOff, yy - 12);
            }
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
