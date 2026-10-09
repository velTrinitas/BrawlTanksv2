import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { PressTuning } from '../../config/junkyardRules';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT } from '../JunkyardMap';
import { simNowMs } from '../../systems/SimClock';
import { bakeCanvas, block, css, darken, grime, hazard, lighten, parallaxBlock, parallaxOffset, propRng, roundRect, staticRect } from './junkyardBake';
import type { ParallaxBlock } from './junkyardBake';
import { isJunkyardParallaxEnabled } from '../../config/junkyardFlag';

/**
 * GreatPress — Wielka Prasa, the centre piece of ZLOMOWISKO (J3; art REV 5 after the parallax playtest).
 *
 * The bed is PASSABLE: you can drive in. The press runs on its own clock (idle -> telegraph -> slam -> rise)
 * and crushes everything inside the bed when the plate lands:
 *  - regular enemy: destroyed (no score — decision: the score measures the player), drops stay
 *  - boss / mega boss: tuning.bossDmgPct of max HP + stun, with a per-boss ceiling (bossCeilingPct) so the
 *    press can never do the tank's job; shields do not help against 40 tons of steel
 *  - player: tuning.playerDmgPct of max HP + knockback out of the bed (no instakill — 9-12 audience)
 *
 * One warning language for every machine on the map: stripes flash -> shadow grows -> beacon -> hit.
 * All timing from simNowMs() (pauses with the match, deterministic). Visual state is derived from the
 * phase every logic step, so a catch-up never desyncs the plate from the damage moment.
 *
 * FAKE-3D (REV 9, Mariusz: "wszystko z prostopadloscianow, jak Cyber City" — the chrome cylinders of REV 5-7 never read):
 *  - 4 COLUMNS = square-section cuboids (parallaxBlock: roof + S face + E/W face sheared per frame) on square bolted feet;
 *  - a TOP FRAME of square-section BEAMS (block() cuboids) with corner CUBES on the column tops, carrying the hydraulic
 *    unit (yellow box + finned motor + valve box) and the red beacon on its own little mount;
 *  - the RAM: a SQUARE beam (same section language as the columns) from the hydraulic unit down to the plate — its length
 *    follows the plate (live);
 *  - the PLATE hangs on the ram (no sleeves — REV 9b: Mariusz).
 * ONE parallax law for every part: offset at height H = frameOff * H / COL_H (frameOff = parallaxOffset at COL_H). The
 * columns are sheared by exactly that (parallaxBlock), the plate sits at H = lift + PLATE_RISE, the frame at COL_H, so the
 * ram between plate centre and frame centre is parallel to the columns at any camera position.
 * Parallax (J6a): every part shifts by its height above the bed, all with the SAME reference point (bed centre),
 * so columns, rings, frame and ram stay geometrically coherent at any camera position.
 */
export interface PressHooks {
    getEnemies: () => Enemy[];
    getPlayers: () => Player[];
    /** Crush a regular enemy outright (kill path lives in main.ts; returns true if it died). */
    crushEnemy: (e: Enemy) => boolean;
    /** Boss hit: amount already capped by the ceiling. */
    hitBoss: (e: Enemy, amount: number) => void;
    /** Player crushed: damage + knockback (dir from bed centre). */
    crushPlayer: (index: number, amount: number, dirX: number, dirY: number, distance: number) => void;
    notify: (key: 'telegraph' | 'bossCrushed' | 'playerCrushed', count: number) => void;
    /** J6b: a player flying over the press on the tyre-trampoline is not on the bed. */
    isAirborne?: (p: Player) => boolean;
}

type Phase = 'idle' | 'telegraph' | 'slam' | 'rise';
const LIFT = 120;       // plate height above the bed when parked (REV 5: press is 20% smaller)
const PLATE_RISE = 30;  // visible thickness of the plate (its S face) — REV 6: thicker = heavier
const COL_H = 176;      // column height (plate parked top = LIFT + PLATE_RISE = 142 < COL_H)
const COL_W = 40;       // column footprint = pressPistons (square section, REV 9)
const BEAM = 26;        // top-frame beam section (square, REV 9)
const CUBE = BEAM + 12; // corner cube on each column top
const RAM_W = 36;       // ram beam width (square section; texture unit height 8)
const RAM_TEX_H = 8;

export class GreatPress {
    public container: PIXI.Container;
    public readonly bed: ICollidable;
    private solids: ICollidable[] = [];
    private plate: PIXI.Container;
    private plateShadow: PIXI.Sprite;
    private beacon: PIXI.Sprite;
    private stripesHot: PIXI.Sprite;
    private frame: PIXI.Container;
    private ram: PIXI.Sprite;
    private ramSleeve: PIXI.Sprite;
    private columns: ParallaxBlock[] = [];
    private phase: Phase = 'idle';
    private phaseStart = 0;
    private cycleStart = 0;
    private slamDone = false;
    private lastBeepAt = 0;
    private riseSoundDone = false;
    private crushCount = 0;
    /** Per-boss press damage so far (ceiling). WeakMap => dead bosses do not leak. */
    private bossDamage = new WeakMap<Enemy, number>();
    private curLift = LIFT;
    /** View offsets (parallax) for the two live heights: plate (lift + rise) and frame (COL_H). */
    private plateOff = { x: 0, y: 0 };
    private frameOff = { x: 0, y: 0 };

    constructor(worldContainer: PIXI.Container, private effects: EffectsManager, private audio: AudioSys,
        private tune: PressTuning, private hooks: PressHooks) {
        const L = JUNKYARD_LAYOUT;
        const b = L.pressBed;
        this.bed = staticRect(b.x, b.y, b.w, b.h);
        // Parts go STRAIGHT into the world container: Y-sort against tanks works only at that level
        // (a nested container has one zIndex for everything inside — tanks drew over the landed plate).
        this.container = worldContainer;
        for (const p of L.pressPistons) this.solids.push(staticRect(p.x, p.y, p.w, p.h));

        const rng = propRng(b.x, b.y, 1);
        // floor (tanks drive over it)
        const floor = new PIXI.Container(); floor.position.set(b.x, b.y); floor.zIndex = 5; worldContainer.addChild(floor);
        bakeCanvas(floor, 'press_floor', b.w, b.h, { l: 26, t: 26, r: 86, b: 26 }, c => this.drawFloor(c, b.w, b.h, rng));
        // hot stripes overlay (flashes during telegraph)
        const hot = new PIXI.Container(); hot.position.set(b.x, b.y); hot.zIndex = 6; this.container.addChild(hot);
        this.stripesHot = bakeCanvas(hot, 'press_stripes_hot', b.w, b.h, { l: 26, t: 26, r: 26, b: 26 }, c => {
            c.fillStyle = css(JUNKYARD_HEX.beaconRed, 0.55);
            c.fillRect(-24, -24, b.w + 48, 24); c.fillRect(-24, b.h, b.w + 48, 24); c.fillRect(-24, 0, 24, b.h); c.fillRect(b.w, 0, 24, b.h);
        });
        this.stripesHot.alpha = 0;
        // plate shadow on the bed (scales with lift)
        const shadowHolder = new PIXI.Container(); shadowHolder.position.set(b.x + b.w / 2, b.y + b.h / 2); shadowHolder.zIndex = 7; this.container.addChild(shadowHolder);
        this.plateShadow = bakeCanvas(shadowHolder, 'press_plate_shadow', b.w, b.h, { l: 30, t: 30, r: 30, b: 30 }, c => {
            c.save(); c.filter = 'blur(14px)'; c.fillStyle = css(JUNKYARD_HEX.shadow, 0.6); c.fillRect(10, 10, b.w - 20, b.h - 20); c.restore();
        });
        this.plateShadow.anchor.set(0.5); this.plateShadow.position.set(0, 0);
        // ── columns (solids): square cuboids on bolted square feet; parallaxBlock shears S/E/W faces per frame (REV 9) ──
        for (const p of L.pressPistons) {
            const holder = new PIXI.Container(); holder.position.set(p.x, p.y); holder.zIndex = p.y + p.h; this.container.addChild(holder);
            this.columns.push(parallaxBlock(holder, 'press_col', p.w, p.h, COL_H,
                { top: JUNKYARD_HEX.steelLight, side: JUNKYARD_HEX.steel, east: darken(JUNKYARD_HEX.steel, 0.5), rim: 0xffffff },
                { l: 40, t: COL_H + 30, r: 130, b: 110 }, c => GreatPress.drawColumnBase(c, p.w, p.h), c => GreatPress.drawColumnTop(c, p.w, p.h), c => GreatPress.drawColumnSide(c, p.w)));
        }
        // ── plate (moves): baked at bed level, container.y = bed.y - lift; corner rings ride on the columns ──
        this.plate = new PIXI.Container(); this.plate.position.set(b.x, b.y - LIFT); this.plate.zIndex = b.y + b.h + 400; this.container.addChild(this.plate);
        bakeCanvas(this.plate, 'press_plate', b.w, b.h, { l: 70, t: 70, r: 80, b: 70 }, c => this.drawPlate(c, b.w, b.h));
        // ── ram: chrome rod from the frame's hydraulic unit down to the plate (length = live) + fixed sleeve ──
        this.ram = bakeCanvas(this.container, 'press_ram', RAM_W, RAM_TEX_H, { l: 0, t: 0, r: 0, b: 0 }, c => {
            // square beam seen from above-front: W face (dark) 30%, hard edge, front face (lit, slight falloff) 70%, dark E edge
            const wf = c.createLinearGradient(0, 0, RAM_W * 0.3, 0); wf.addColorStop(0, '#2a2e33'); wf.addColorStop(1, '#4a5058');
            c.fillStyle = wf; c.fillRect(0, 0, RAM_W * 0.3, RAM_TEX_H);
            const ff = c.createLinearGradient(RAM_W * 0.3, 0, RAM_W, 0); ff.addColorStop(0, '#c3c9cf'); ff.addColorStop(0.5, '#9aa2ab'); ff.addColorStop(1, '#6e757e');
            c.fillStyle = ff; c.fillRect(RAM_W * 0.3, 0, RAM_W * 0.7, RAM_TEX_H);
            c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(RAM_W * 0.3, 0, 1.5, RAM_TEX_H);
            c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 1.2, RAM_TEX_H); c.fillRect(RAM_W - 1.5, 0, 1.5, RAM_TEX_H);
        });
        this.ram.anchor.set(0.5, 0); this.ram.zIndex = b.y + b.h + 401;
        this.ramSleeve = bakeCanvas(this.container, 'press_ram_sleeve', RAM_W + 20, 64, { l: 6, t: 0, r: 6, b: 10 }, c => {
            // square guide box under the hydraulic unit: W face dark, front face lit, bolted collar at the bottom
            const W = RAM_W + 20;
            c.fillStyle = '#2a2e33'; c.fillRect(0, 0, W * 0.3, 64);
            const ff = c.createLinearGradient(W * 0.3, 0, W, 0); ff.addColorStop(0, '#aab1b8'); ff.addColorStop(0.6, '#7a8189'); ff.addColorStop(1, '#4a5058');
            c.fillStyle = ff; c.fillRect(W * 0.3, 0, W * 0.7, 64);
            c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(W * 0.3, 0, 1.5, 64);
            c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, 2); c.fillRect(W - 1.5, 0, 1.5, 64);
            // collar: wider band, lit top, dark underside
            c.fillStyle = '#3c4147'; c.fillRect(-6, 50, W + 12, 12); c.fillStyle = '#6e757e'; c.fillRect(-6 + (W + 12) * 0.3, 50, (W + 12) * 0.7, 12);
            c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(-6, 50, W + 12, 1.5); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(-6, 60, W + 12, 2);
            for (const bx of [-6 + 6, W + 6 - 6]) GreatPress.rivet(c, bx, 56, 2);
        });
        this.ramSleeve.anchor.set(0.5, 0); this.ramSleeve.zIndex = b.y + b.h + 402;
        // ── top frame: beams on the column tops + hydraulic unit + beacon (height COL_H) ──
        const c0 = L.pressPistons[0], c3 = L.pressPistons[3];
        const fx = c0.x + c0.w / 2, fy = c0.y + c0.h / 2, fw = c3.x + c3.w / 2 - fx, fh = c3.y + c3.h / 2 - fy;
        this.frame = new PIXI.Container(); this.frame.position.set(fx, fy - COL_H); this.frame.zIndex = b.y + b.h + 403; this.container.addChild(this.frame);
        bakeCanvas(this.frame, 'press_frame', fw, fh, { l: 40, t: 60, r: 44, b: 40 }, c => this.drawFrame(c, fw, fh));
        const bh = new PIXI.Container(); bh.position.set(fw / 2 - 26, fh / 2 - 46); this.frame.addChild(bh);
        this.beacon = bakeCanvas(bh, 'press_beacon', 0, 0, { l: 30, t: 30, r: 30, b: 30 }, c => {
            const glow = c.createRadialGradient(0, 0, 3, 0, 0, 26);
            glow.addColorStop(0, css(JUNKYARD_HEX.beaconRed, 0.6)); glow.addColorStop(1, css(JUNKYARD_HEX.beaconRed, 0));
            c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fill();
            const body = c.createRadialGradient(-3, -4, 1, 0, 0, 11);
            body.addColorStop(0, '#ffd0c8'); body.addColorStop(0.35, css(JUNKYARD_HEX.beaconRed)); body.addColorStop(0.85, '#8e1f16'); body.addColorStop(1, '#5a120c');
            c.fillStyle = body; c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(0, -3, 9, 6, 0, Math.PI, Math.PI * 2); c.fill(); // glass dome (upper half)
            c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(-3.5, -5, 3.5, 2.2, -0.6, 0, Math.PI * 2); c.fill(); // glass dome highlight
            c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.arc(4, 3, 1.4, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.stroke();
        });
        this.cycleStart = simNowMs();
        this.phaseStart = this.cycleStart;
        this.applyVisual(0);
        this.layoutView();
    }

    public getCollisionRects(): ICollidable[] { return this.solids; }
    public get phaseName(): Phase { return this.phase; }
    public isPointInBed(x: number, y: number): boolean {
        const b = this.bed; return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }
    public get crushedBossCount(): number { return this.crushCount; }

    /** Fixed logic step (host). Phase machine + damage + visuals derived from phase progress. */
    public update(): void {
        const now = simNowMs();
        const T = this.tune;
        const el = now - this.phaseStart;
        switch (this.phase) {
            case 'idle':
                if (el >= T.idleMs) { this.setPhase('telegraph', now); this.hooks.notify('telegraph', 0); this.lastBeepAt = 0; }
                this.applyVisual(0);
                break;
            case 'telegraph': {
                const k = Math.min(1, el / T.telegraphMs);
                // beeps accelerate: 500 ms -> 180 ms
                const period = 500 - 320 * k;
                if (now - this.lastBeepAt >= period) { this.lastBeepAt = now; this.audio.playPressBeep(k > 0.6); }
                this.applyVisual(k * 0.25, k);
                if (el >= T.telegraphMs) { this.setPhase('slam', now); this.slamDone = false; }
                break;
            }
            case 'slam': {
                const k = Math.min(1, el / T.slamMs);
                this.applyVisual(0.25 + 0.75 * (k * k), 1);
                if (k >= 1 && !this.slamDone) { this.slamDone = true; this.impact(now); }
                if (el >= T.slamMs + 150) { this.setPhase('rise', now); this.riseSoundDone = false; }
                break;
            }
            case 'rise': {
                const k = Math.min(1, el / T.riseMs);
                if (!this.riseSoundDone) { this.riseSoundDone = true; this.audio.playPressRise(); }
                this.applyVisual(1 - k * k * (3 - 2 * k), 0); // ease
                if (el >= T.riseMs) this.setPhase('idle', now);
                break;
            }
        }
    }

    private setPhase(p: Phase, now: number): void { this.phase = p; this.phaseStart = now; }

    /** VIEW loop (not the logic step): parallax — plate by (lift + rise), frame by COL_H, columns lean; one reference point. */
    public updateView(camX: number, camY: number, viewW: number, viewH: number): void {
        const b = JUNKYARD_LAYOUT.pressBed;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (!isJunkyardParallaxEnabled()) {
            this.plateOff.x = 0; this.plateOff.y = 0; this.frameOff.x = 0; this.frameOff.y = 0;
        } else {
            const fo = parallaxOffset(cx, cy, COL_H, camX, camY, viewW, viewH);
            this.frameOff.x = fo.ox; this.frameOff.y = fo.oy;
            // plate offset = the columns' lean at the plate's height (linear, like leanSprite/shearX) — so the plate's
            // square sleeves always sit exactly where the columns pass through them (REV 9 fix: sleeves beside columns)
            const t = (PLATE_RISE + this.curLift) / COL_H;
            this.plateOff.x = fo.ox * t; this.plateOff.y = fo.oy * t;
        }
        this.layoutView();
    }

    /** Place plate / frame / ram / columns from the current lift + view offsets. */
    private layoutView(): void {
        const b = JUNKYARD_LAYOUT.pressBed;
        this.plate.position.set(b.x + this.plateOff.x, b.y - this.curLift + this.plateOff.y);
        const c0 = JUNKYARD_LAYOUT.pressPistons[0];
        this.frame.position.set(c0.x + c0.w / 2 + this.frameOff.x, c0.y + c0.h / 2 - COL_H + this.frameOff.y);
        for (const col of this.columns) col.setOffset(this.frameOff.x + 4, this.frameOff.y); // +4 cancels parallaxBlock's rest E-face shift => tops exactly under the frame cubes
        // ram: from the hydraulic unit (frame centre, height COL_H) to the plate top (height lift + rise)
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const topX = cx + this.frameOff.x, topY = cy - COL_H + this.frameOff.y + 16;
        const botX = cx + this.plateOff.x, botY = cy - this.curLift - PLATE_RISE + this.plateOff.y;
        const dx = botX - topX, dy = botY - topY, len = Math.max(1, Math.hypot(dx, dy));
        const rot = Math.atan2(dy, dx) - Math.PI / 2;
        this.ram.position.set(topX, topY); this.ram.rotation = rot; this.ram.scale.set(1, len / RAM_TEX_H);
        this.ramSleeve.position.set(topX, topY); this.ramSleeve.rotation = rot;
    }

    /** drop: 0 = parked up, 1 = on the bed. warn: 0..1 telegraph intensity. */
    private applyVisual(drop: number, warn = 0): void {
        const lift = LIFT * (1 - drop);
        this.curLift = lift;
        this.layoutView();
        // shadow: small + faint when the plate is high, full + dark when it is on the bed
        const s = 0.55 + 0.45 * drop;
        this.plateShadow.scale.set(s, s);
        this.plateShadow.alpha = 0.35 + 0.65 * drop;
        // stripes flash 2x/s during telegraph, faster near the end; beacon blinks in the same rhythm
        const now = simNowMs();
        const hz = 2 + warn * 4;
        const on = warn > 0 ? (Math.sin(now / 1000 * hz * Math.PI * 2) > 0) : false;
        this.stripesHot.alpha = on ? 0.9 : 0;
        this.beacon.alpha = warn > 0 ? (on ? 1 : 0.35) : (this.phase === 'slam' ? 1 : 0.85);
        this.beacon.scale.set(on ? 1.25 : 1);
    }

    /** The plate lands: damage everything in the bed, shake, dust, debris, sound. */
    private impact(now: number): void {
        const b = JUNKYARD_LAYOUT.pressBed;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        this.audio.playPressSlam();
        this.effects.shake(14, 18);
        // dust along the four edges + bolts/nuts burst inside
        for (let i = 0; i < 6; i++) {
            const t = (i + 0.5) / 6;
            this.effects.spawnPressDustPuff(b.x + b.w * t, b.y - 4, -Math.PI / 2);
            this.effects.spawnPressDustPuff(b.x + b.w * t, b.y + b.h + 4, Math.PI / 2);
        }
        for (let i = 0; i < 4; i++) {
            const t = (i + 0.5) / 4;
            this.effects.spawnPressDustPuff(b.x - 4, b.y + b.h * t, Math.PI);
            this.effects.spawnPressDustPuff(b.x + b.w + 4, b.y + b.h * t, 0);
        }
        for (let i = 0; i < 5; i++) this.effects.spawnPressDebris(b.x + 40 + (b.w - 80) * (i / 4), cy + (i % 2 ? 40 : -40));
        this.effects.spawnRingFx(cx, cy, 160, 0xf2c230, 14);

        let crushedSomething = false;
        for (const e of this.hooks.getEnemies()) {
            if (!e.active || !this.isPointInBed(e.x, e.y)) continue;
            crushedSomething = true;
            this.effects.spawnPressDebris(e.x, e.y);
            if (e.isBoss || e.isMegaBoss) {
                const done = this.bossDamage.get(e) ?? 0;
                const cap = e.maxHp * this.tune.bossCeilingPct;
                const amount = Math.max(0, Math.min(e.maxHp * this.tune.bossDmgPct, cap - done));
                if (amount > 0) {
                    this.bossDamage.set(e, done + amount);
                    e.stunUntil = now + this.tune.bossStunMs;
                    this.hooks.hitBoss(e, amount);
                    this.crushCount++;
                    this.hooks.notify('bossCrushed', this.crushCount);
                    this.audio.playStunRing();
                }
            } else {
                this.hooks.crushEnemy(e);
            }
        }
        const players = this.hooks.getPlayers();
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (!this.isPointInBed(p.x, p.y) || this.hooks.isAirborne?.(p)) continue;
            crushedSomething = true;
            let dx = p.x - cx, dy = p.y - cy;
            // push out through the nearest edge (never into a column corner); distance = to that edge + clearance,
            // never less than the tuned minimum, so the tank ALWAYS ends outside the bed
            if (Math.abs(dx) / b.w > Math.abs(dy) / b.h) dy = 0; else dx = 0;
            if (dx === 0 && dy === 0) dy = 1;
            const toEdge = dx !== 0 ? (dx > 0 ? b.x + b.w - p.x : p.x - b.x) : (dy > 0 ? b.y + b.h - p.y : p.y - b.y);
            this.hooks.crushPlayer(i, p.maxHp * this.tune.playerDmgPct, dx, dy, Math.max(this.tune.playerKnockPx, toEdge + 50));
            this.hooks.notify('playerCrushed', 0);
        }
        if (crushedSomething) this.audio.playPressCrush();
    }

    // ── art ──
    /** Column GROUND layer: square bolted foot (block) + stacked AO ellipses. Shadow/AO band come from parallaxBlock. */
    private static drawColumnBase(c: CanvasRenderingContext2D, w: number, h: number): void {
        for (const [rx, ry, a] of [[w * 1.1, 13, 0.10], [w * 0.9, 10, 0.14], [w * 0.7, 8, 0.18]] as Array<[number, number, number]>) {
            c.fillStyle = `rgba(0,0,0,${a})`; c.beginPath(); c.ellipse(w / 2 + 2, h + 2, rx, ry, 0, 0, Math.PI * 2); c.fill();
        }
        block(c, -8, -8, w + 16, h + 16, 8, { top: JUNKYARD_HEX.steelLight, side: JUNKYARD_HEX.steelDark, east: darken(JUNKYARD_HEX.steelDark, 0.7), radius: 2 });
        for (const [bx, by] of [[-2, -10], [w + 2, -10], [-2, h - 6], [w + 2, h - 6]]) GreatPress.rivet(c, bx, by, 2.6);
        hazard(c, -8, h + 2, w + 16, 6, 6); // stripe on the foot's S face
    }
    /** Column ROOF: bevelled square cap + centre bolt (local top face spans y -COL_H..h-COL_H). */
    private static drawColumnTop(c: CanvasRenderingContext2D, w: number, h: number): void {
        const y0 = -COL_H;
        const g = c.createLinearGradient(4, y0 + 4, w - 4, y0 + h - 4); g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.5, '#c3c9cf'); g.addColorStop(1, '#7a8189');
        c.fillStyle = g; roundRect(c, 4, y0 + 4, w - 8, h - 8, 2); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(4, y0 + h - 4); c.lineTo(w - 4, y0 + h - 4); c.lineTo(w - 4, y0 + 4); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(4, y0 + h - 4); c.lineTo(4, y0 + 4); c.lineTo(w - 4, y0 + 4); c.stroke();
        GreatPress.rivet(c, w / 2, y0 + h / 2, 3.5);
    }
    /** Column S FACE (local 0..w x 0..COL_H, ground at the bottom): centre rib, 3 steel bands, rust at the foot. */
    private static drawColumnSide(c: CanvasRenderingContext2D, w: number): void {
        const H = COL_H;
        c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(w / 2 - 1.5, 0, 3, H); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(w / 2 + 1.5, 0, 1.5, H);
        for (const k of [0.2, 0.5, 0.8]) {
            const by = H * k;
            c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, by, w, 7);
            c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, by, w, 1.5);
            c.fillStyle = '#1a1d20'; for (const bx of [6, w - 6]) { c.beginPath(); c.arc(bx, by + 3.5, 1.6, 0, Math.PI * 2); c.fill(); }
        }
        grime(c, 2, H * 0.6, w - 4, H * 0.4, propRng(w, H, 9), 3);
        const soot = c.createLinearGradient(0, H - 30, 0, H); soot.addColorStop(0, 'rgba(0,0,0,0)'); soot.addColorStop(1, 'rgba(0,0,0,0.45)');
        c.fillStyle = soot; c.fillRect(0, H - 30, w, 30);
    }
    /** Rivet head: drop shadow, steel dome, highlight. */
    private static rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(x + 0.8, y + 1, r, 0, Math.PI * 2); c.fill();
        const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 0.5, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#aab1b8'); g.addColorStop(1, '#3c4147');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }

    /** Plate: thick slab (gradient top, chunky S face), hazard edges, bolts, ram seat. */
    private drawPlate(c: CanvasRenderingContext2D, w: number, h: number): void {
        const inset = 8, pw = w - 2 * inset, ph = h - 2 * inset;
        const top = JUNKYARD_HEX.steel, side = darken(JUNKYARD_HEX.steel, 0.62);
        // S face (gradient, lit top edge) + E face
        const sg = c.createLinearGradient(0, ph, 0, ph + PLATE_RISE); sg.addColorStop(0, '#f4f6f8'); sg.addColorStop(0.07, css(lighten(side, 0.3))); sg.addColorStop(0.1, css(side)); sg.addColorStop(0.7, css(darken(side, 0.8))); sg.addColorStop(1, css(darken(side, 0.45)));
        c.fillStyle = sg; c.fillRect(inset, ph, pw, PLATE_RISE);
        c.fillStyle = 'rgba(255,255,255,0.08)'; for (let gx = inset + 12; gx < inset + pw; gx += 24) c.fillRect(gx, ph + 4, 2, PLATE_RISE - 8); // milled grooves on the S face
        c.fillStyle = css(darken(side, 0.7)); c.beginPath(); c.moveTo(inset + pw, 0); c.lineTo(inset + pw + 8, 5); c.lineTo(inset + pw + 8, ph + 5); c.lineTo(inset + pw, ph + PLATE_RISE); c.closePath(); c.fill();
        // top face
        const tg = c.createLinearGradient(inset, 0, inset + pw, ph); tg.addColorStop(0, css(lighten(top, 0.2))); tg.addColorStop(0.5, css(top)); tg.addColorStop(1, css(darken(top, 0.8)));
        c.fillStyle = tg; roundRect(c, inset, 0, pw, ph, 4); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(inset + 1, ph - 1); c.lineTo(inset + 1, 1); c.lineTo(inset + pw - 1, 1); c.stroke();
        hazard(c, inset, 0, pw, 14); hazard(c, inset, ph - 14, pw, 14);
        for (let rx = inset + 18; rx < w - inset - 8; rx += 26) for (const ry of [24, ph - 24]) {
            c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(rx + 1, ry + 1, 3, 0, Math.PI * 2); c.fill();
            c.fillStyle = css(JUNKYARD_HEX.steelLight); c.beginPath(); c.arc(rx, ry, 3, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(rx - 1, ry - 1, 1, 0, Math.PI * 2); c.fill();
        }
        for (const ry of [ph * 0.42, ph * 0.58]) {
            const rg = c.createLinearGradient(0, ry - 4, 0, ry + 4); rg.addColorStop(0, css(JUNKYARD_HEX.steelLight)); rg.addColorStop(1, css(JUNKYARD_HEX.steelDark));
            c.fillStyle = rg; c.fillRect(inset + 18, ry - 4, pw - 36, 8);
        }
        // ram seat in the centre
        const seat = c.createRadialGradient(w / 2 - 4, h / 2 - 4, 2, w / 2, h / 2, 24); seat.addColorStop(0, '#e8ecef'); seat.addColorStop(0.6, '#8a9099'); seat.addColorStop(1, '#3c4147');
        c.fillStyle = seat; c.beginPath(); c.ellipse(w / 2, h / 2 - 6, 24, 14, 0, 0, Math.PI * 2); c.fill();
        // AO along the top face's inner edge: reads as a thick slab, not sheet metal
        const aoT = c.createLinearGradient(0, 0, 0, 7); aoT.addColorStop(0, 'rgba(0,0,0,0.3)'); aoT.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = aoT; c.fillRect(inset, 14, pw, 7);
        const aoL = c.createLinearGradient(inset, 0, inset + 7, 0); aoL.addColorStop(0, 'rgba(0,0,0,0.25)'); aoL.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = aoL; c.fillRect(inset, 14, 7, ph - 28);
    }

    /** Top frame (REV 9): square-section BEAMS (block cuboids) in a rectangle + centre cross-beam, corner CUBES on the column
     *  tops, hydraulic unit (yellow box + finned motor + valve box + gauge + hoses) and the beacon mount. Local (0,0) = NW column centre. */
    private drawFrame(c: CanvasRenderingContext2D, fw: number, fh: number): void {
        const T = BEAM, st = { top: JUNKYARD_HEX.steel, side: JUNKYARD_HEX.steelDark, east: darken(JUNKYARD_HEX.steelDark, 0.7), rim: 0xffffff };
        const rivetsAlong = (x0: number, y0: number, x1: number, y1: number) => {
            const horiz = y0 === y1, len = horiz ? x1 - x0 : y1 - y0, n = Math.floor(len / 24);
            for (let i = 1; i < n; i++) GreatPress.rivet(c, horiz ? x0 + i * 24 : x0, horiz ? y0 : y0 + i * 24, 2.2);
        };
        // beam along x: top face centred on y; beam along y: top face centred on x (its S face = the end cap at the S end)
        const beamX = (y: number) => { block(c, -T / 2, y + T / 2, fw + T, T, T, st); rivetsAlong(0, y - 4, fw, y - 4); };
        const beamY = (x: number) => { block(c, x - T / 2, T / 2, T, fh - T / 2, T, st); rivetsAlong(x - 4, 0, x - 4, fh); };
        const cube = (x: number, y: number) => {
            block(c, x - CUBE / 2, y - CUBE / 2 + CUBE, CUBE, CUBE, CUBE, { ...st, top: JUNKYARD_HEX.steelLight, radius: 2 });
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) GreatPress.rivet(c, x + dx * (CUBE / 2 - 6), y + dy * (CUBE / 2 - 6), 2.4);
        };
        // far to near: N beam, side beams, cross-beam, S beam; cubes on top of the crossings
        beamX(0); beamY(0); beamY(fw); beamX(fh / 2); beamX(fh);
        hazard(c, -T / 2, fh + T / 2 - 1, fw + T, 7, 8); // stripe on the S beam's S face
        for (const [kx, ky] of [[0, 0], [fw, 0], [0, fh / 2], [fw, fh / 2], [0, fh], [fw, fh]]) cube(kx, ky);
        // HYDRAULIC UNIT on the cross-beam: yellow cuboid (top + S face), hazard skirt
        const ux = fw / 2 - 46, uy = fh / 2 - 34, uw = 92, uh = 56, rise = 30;
        c.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(c, ux + 5, uy + 8, uw, uh, 5); c.fill();
        const sg = c.createLinearGradient(0, uy + uh - rise, 0, uy + uh); sg.addColorStop(0, '#d9a21c'); sg.addColorStop(0.08, '#b8860f'); sg.addColorStop(0.7, '#7a5a0a'); sg.addColorStop(1, '#4a3606');
        c.fillStyle = sg; c.fillRect(ux, uy + uh - rise, uw, rise);
        c.fillStyle = '#6b4d08'; c.beginPath(); c.moveTo(ux + uw, uy - rise); c.lineTo(ux + uw + 6, uy - rise + 4); c.lineTo(ux + uw + 6, uy + uh - rise + 4); c.lineTo(ux + uw, uy + uh); c.closePath(); c.fill();
        const tg = c.createLinearGradient(ux, uy - rise, ux + uw, uy + uh - rise); tg.addColorStop(0, '#ffd45a'); tg.addColorStop(0.45, '#f2c230'); tg.addColorStop(1, '#b8860f');
        c.fillStyle = tg; roundRect(c, ux, uy - rise, uw, uh, 6); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ux + 1, uy + uh - rise - 1); c.lineTo(ux + 1, uy - rise + 1); c.lineTo(ux + uw - 1, uy - rise + 1); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1; roundRect(c, ux, uy - rise, uw, uh, 6); c.stroke();
        hazard(c, ux, uy + uh - rise - 7, uw, 7, 8);
        // MOTOR: horizontal finned cylinder on the unit's E half (hard chrome cut), fan guard on its E end, valve box W of it
        const mx = fw / 2 + 6, my = uy - rise + 6, mw = 34, mh = 18;
        c.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(c, mx + 2, my + 3, mw, mh, 6); c.fill();
        const mg = c.createLinearGradient(0, my, 0, my + mh); mg.addColorStop(0, '#15181b'); mg.addColorStop(0.18, '#3c4147'); mg.addColorStop(0.2, '#eef1f4'); mg.addColorStop(0.32, '#aab1b8'); mg.addColorStop(0.7, '#4a5058'); mg.addColorStop(1, '#0f1113');
        c.fillStyle = mg; roundRect(c, mx, my, mw, mh, 6); c.fill();
        for (let fx = mx + 5; fx < mx + mw - 4; fx += 5) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(fx, my + 1, 2, mh - 2); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(fx - 1, my + 1, 1, mh - 2); }
        const gx0 = mx + mw + 1, gy0 = my + mh / 2;
        c.fillStyle = '#0a0b0c'; c.beginPath(); c.ellipse(gx0, gy0, 5, mh / 2, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#c3c9cf'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(gx0, gy0, 5, mh / 2, 0, 0, Math.PI * 2); c.stroke();
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI; c.beginPath(); c.moveTo(gx0 - Math.cos(a) * 4.5, gy0 - Math.sin(a) * (mh / 2 - 1)); c.lineTo(gx0 + Math.cos(a) * 4.5, gy0 + Math.sin(a) * (mh / 2 - 1)); c.stroke(); }
        block(c, fw / 2 - 2, my + mh, 10, 10, 8, { top: 0xc3c9cf, side: 0x555b63, noAO: true }); GreatPress.rivet(c, fw / 2 + 3, my + mh - 3, 1.6);
        // gauge: white dial with a bezel, red needle, tick marks (lower middle of the unit)
        const gx = fw / 2, gy = uy - rise + uh * 0.66;
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(gx + 1, gy + 2, 12, 0, Math.PI * 2); c.fill();
        const bz = c.createLinearGradient(gx - 12, gy - 12, gx + 12, gy + 12); bz.addColorStop(0, '#eef1f4'); bz.addColorStop(0.5, '#8a9099'); bz.addColorStop(1, '#2f343a');
        c.fillStyle = bz; c.beginPath(); c.arc(gx, gy, 12, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f8f9fa'; c.beginPath(); c.arc(gx, gy, 9, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#1d2024'; c.lineWidth = 1.2; for (let i = 0; i < 7; i++) { const a = Math.PI * 0.75 + i * (Math.PI * 1.5 / 6); c.beginPath(); c.moveTo(gx + Math.cos(a) * 7.5, gy + Math.sin(a) * 7.5); c.lineTo(gx + Math.cos(a) * 5.5, gy + Math.sin(a) * 5.5); c.stroke(); }
        c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.beginPath(); c.arc(gx, gy, 8.5, Math.PI * 1.9, Math.PI * 2.25); c.lineTo(gx, gy); c.closePath(); c.fill();
        c.strokeStyle = '#e63b2e'; c.lineWidth = 2; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 5.5, gy - 4.5); c.stroke(); c.fillStyle = '#1d2024'; c.beginPath(); c.arc(gx, gy, 1.8, 0, Math.PI * 2); c.fill();
        // chrome hoses: from the unit's sides, curving down/out to the cross-beam cubes
        for (const dir of [-1, 1]) {
            const sx = gx + dir * (uw / 2 - 6), sy = uy - rise + 14;
            c.lineCap = 'round';
            c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 9; c.beginPath(); c.moveTo(sx + 2, sy + 4); c.quadraticCurveTo(sx + dir * 34 + 2, sy - 10 + 4, sx + dir * 44 + 2, sy + 36 + 4); c.stroke();
            c.strokeStyle = '#2a2e33'; c.lineWidth = 8; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + dir * 34, sy - 10, sx + dir * 44, sy + 36); c.stroke();
            c.strokeStyle = '#aab1b8'; c.lineWidth = 4; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + dir * 34, sy - 10, sx + dir * 44, sy + 36); c.stroke();
            c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(sx, sy - 1); c.quadraticCurveTo(sx + dir * 34, sy - 11, sx + dir * 44, sy + 35); c.stroke();
            c.fillStyle = '#3c4147'; c.fillRect(sx - 4, sy - 4, 8, 8); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(sx - 4, sy - 4, 8, 1.5);
        }
        // BEACON MOUNT (W half of the unit): small black cuboid with a bevel + chrome collar; the glowing beacon sprite sits on it
        const bx = fw / 2 - 26, by = fh / 2 - 46;
        block(c, bx - 12, by + 7, 24, 8, 8, { top: 0x2a2e33, side: 0x15181b, east: 0x0a0b0c, rim: 0x9aa2ab, radius: 2, noAO: true });
        const rg = c.createLinearGradient(bx - 10, 0, bx + 10, 0); rg.addColorStop(0, '#3c4147'); rg.addColorStop(0.3, '#ffffff'); rg.addColorStop(0.34, '#aab1b8'); rg.addColorStop(1, '#2a2e33');
        c.fillStyle = rg; c.beginPath(); c.ellipse(bx, by + 2, 10, 4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#15181b'; c.beginPath(); c.ellipse(bx, by + 1, 8, 3, 0, 0, Math.PI * 2); c.fill();
    }

    private drawFloor(c: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
        hazard(c, -24, -24, w + 48, 24); hazard(c, -24, h, w + 48, 24); hazard(c, -24, 0, 24, h); hazard(c, w, 0, 24, h);
        c.fillStyle = css(JUNKYARD_HEX.steelDark); c.fillRect(0, 0, w, h);
        const g = c.createLinearGradient(6, 6, w - 6, h - 6);
        g.addColorStop(0, css(lighten(JUNKYARD_HEX.steel, 0.18))); g.addColorStop(0.5, css(JUNKYARD_HEX.steel)); g.addColorStop(1, css(darken(JUNKYARD_HEX.steel, 0.78)));
        c.fillStyle = g; c.fillRect(6, 6, w - 12, h - 12);
        c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
        for (let i = 0; i < 40; i++) { const yy = 6 + rng() * (h - 12); c.beginPath(); c.moveTo(6 + rng() * w * 0.4, yy); c.lineTo(w * 0.6 + rng() * w * 0.4 - 6, yy); c.stroke(); }
        const ig = c.createLinearGradient(6, 6, 40, 40); ig.addColorStop(0, 'rgba(0,0,0,0.45)'); ig.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = ig; c.fillRect(6, 6, w - 12, h - 12);
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 3;
        for (let gx = 40; gx < w; gx += 40) { c.beginPath(); c.moveTo(gx, 8); c.lineTo(gx, h - 8); c.stroke(); }
        c.fillStyle = css(JUNKYARD_HEX.oil, 0.35); c.beginPath(); c.ellipse(w * 0.5, h * 0.55, 70, 32, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(JUNKYARD_HEX.rust, 0.3); c.beginPath(); c.ellipse(w * 0.3, h * 0.4, 32, 18, 0, 0, Math.PI * 2); c.fill();
        // exit ramp E (feeds the belt)
        const rg = c.createLinearGradient(w, 0, w + 60, 0); rg.addColorStop(0, css(JUNKYARD_HEX.steelDark)); rg.addColorStop(1, css(JUNKYARD_HEX.steel));
        c.fillStyle = rg; c.fillRect(w, h * 0.2, 60, h * 0.6);
        c.strokeStyle = 'rgba(0,0,0,0.4)'; for (let k = 8; k < 60; k += 10) { c.beginPath(); c.moveTo(w + k, h * 0.2 + 3); c.lineTo(w + k, h * 0.8 - 3); c.stroke(); }
    }
}
