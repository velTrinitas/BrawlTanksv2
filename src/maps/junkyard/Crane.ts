import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { CraneTuning } from '../../config/junkyardRules';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT, JUNKYARD_WRECK_TINTS } from '../JunkyardMap';
import { simNowMs } from '../../systems/SimClock';
import { worldRng } from '../../systems/Rng';
import { bakeCanvas, block, css, cylinder, hazard, parallaxBlock, parallaxOffset, propRng, roundRect, softShadow, staticRect } from './junkyardBake';
import type { ParallaxBlock } from './junkyardBake';
import { isJunkyardParallaxEnabled } from '../../config/junkyardFlag';
import { bakeCarSprite, STACK_W, STACK_H } from './WreckStack';

/**
 * Crane — Dzwig z elektromagnesem (ZLOMOWISKO J4). North of the press; its arm reaches r=420 (the five
 * verified drop points from the J0 layout — never on a corridor narrower than two tanks, never on the bed).
 *
 * Cycle (sim clock, deterministic): swing to a stack -> magnet lowers, CLANK, a wreck comes up -> carry to the
 * target (arm rotates, its long shadow sweeps the yard) -> TELEGRAPH 2 s (red dashed circle + the wreck's
 * shadow shrinking onto the spot, beeps) -> DROP: AoE damage r=100 (enemy 250, player 25% max HP), dust,
 * bolts, shake -> the wreck stays as NEW COVER (DroppedWreck: 3 hits, max 6 on the map, the oldest crumbles).
 *
 * Pulpit dzwigu (console pad by the tower): stand on it 1.5 s -> the NEXT drop aims at the biggest enemy
 * cluster (boss counts triple), ties broken with worldRng. That is the Flex for a good player.
 *
 * Machine kills give no score (decision), drops stay. Fake-3D: tower/cab = gradient blocks, arm = lattice
 * beam with a highlight, magnet = chrome-rimmed red disc, cable = 1 live Graphics line.
 */
export interface CraneHooks {
    getEnemies: () => Enemy[];
    getPlayers: () => Player[];
    damageEnemy: (e: Enemy, dmg: number) => boolean;
    damagePlayer: (index: number, amount: number) => void;
    pushPlayer: (index: number, dirX: number, dirY: number, dist: number) => void;
    addSolid: (o: ICollidable) => void;
    removeSolid: (o: ICollidable) => void;
    notify: (key: 'armed' | 'drop') => void;
}

type Phase = 'idle' | 'toStack' | 'lift' | 'carry' | 'telegraph' | 'drop';
const ARM_R = 420;          // reach (= drop ring radius)
const TOWER_RISE = 90;
const PIVOT_LIFT = TOWER_RISE + 26; // REV 4: the arm sits ON the tower top (slewing ring), it used to float 100 px above it
const HANG = 62;            // cable length on screen
const WRECK_DMG_R = 100;
const PAD_R = 60;

/** Dropped wreck = destructible cover (duck-typed takeDamage like crates). Footprint 80x56 centred on the spot. */
export class DroppedWreck implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    public container: PIXI.Container;
    public hp: number;
    public dead = false;
    constructor(cx: number, cy: number, hp: number, worldContainer: PIXI.Container, private effects: EffectsManager, private audio: AudioSys, private onCrumble: (w: DroppedWreck) => void) {
        this.w = STACK_W; this.h = STACK_H; this.x = cx - STACK_W / 2; this.y = cy - STACK_H / 2; this.hp = hp;
        this.container = new PIXI.Container();
        this.container.position.set(this.x, this.y);
        this.container.zIndex = this.y + this.h;
        worldContainer.addChild(this.container);
        bakeCanvas(this.container, 'wreck_drop_shadow', STACK_W, STACK_H, { l: 16, t: 16, r: 30, b: 30 }, c => {
            c.save(); c.filter = 'blur(6px)'; c.fillStyle = css(JUNKYARD_HEX.shadow, 0.45); c.fillRect(8, 8, STACK_W, STACK_H); c.restore();
        });
        const holder = new PIXI.Container(); holder.position.set(STACK_W / 2, STACK_H / 2 - 4); this.container.addChild(holder);
        const rng = propRng(cx, cy, 13);
        bakeCarSprite(holder, (rng() * 4) | 0, (rng() * 3) | 0, JUNKYARD_WRECK_TINTS[(rng() * JUNKYARD_WRECK_TINTS.length) | 0]);
        holder.rotation = (rng() - 0.5) * 0.3;
    }
    update(): void { /* static */ }
    takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.dead) return;
        this.hp -= 1; // 3 hits like crates, whatever the bullet
        this.effects.spawnEnemyHitSparks(hitX, hitY, 0xc3c9cf);
        this.audio.playHit('wall');
        this.container.x = this.x + (Math.random() - 0.5) * 4; // visual only
        if (this.hp <= 0) this.crumble();
        void dmg;
    }
    crumble(): void {
        if (this.dead) return;
        this.dead = true;
        this.effects.spawnPressDebris(this.x + this.w / 2, this.y + this.h / 2);
        this.effects.spawnTowerDeployDust(this.x + this.w / 2, this.y + this.h / 2);
        this.audio.playPressCrush();
        this.w = 0; this.h = 0;
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        this.onCrumble(this);
    }
}

export class Crane {
    private solids: ICollidable[] = [];
    private arm: PIXI.Container;
    private armShadow: PIXI.Sprite;
    private cable: PIXI.Graphics;
    private magnet: PIXI.Container;
    private carried: PIXI.Container;
    private tele: PIXI.Container;
    private teleShadow: PIXI.Sprite;
    private padGfx: PIXI.Graphics;
    private padRing: PIXI.Graphics;
    private pivot: { x: number; y: number };
    private ground: { x: number; y: number };
    private phase: Phase = 'idle';
    private phaseStart = 0;
    private angle = -Math.PI / 4;
    private angleFrom = -Math.PI / 4;
    private angleTo = -Math.PI / 4;
    private target = { x: 0, y: 0 };
    private lastTargetIdx = -1;
    private hang = 0;
    private armed = false;
    private padHoldStart = -1;
    private padCooldownEnd = 0;
    private lastBeepAt = 0;
    private wrecks: DroppedWreck[] = [];
    private dropped = false;
    private towerPx: ParallaxBlock;
    private viewOff = { x: 0, y: 0 }; // J6a parallax of everything hanging at pivot height (arm, cable, magnet, carried wreck)

    constructor(private world: PIXI.Container, private effects: EffectsManager, private audio: AudioSys, private tune: CraneTuning, private hooks: CraneHooks) {
        const L = JUNKYARD_LAYOUT;
        const t = L.craneTower;
        this.solids.push(staticRect(t.x, t.y, t.w, t.h));
        this.ground = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
        this.pivot = { x: t.x + t.w / 2, y: t.y + t.h / 2 - PIVOT_LIFT };
        // tower (static, baked without the arm)
        const tower = new PIXI.Container(); tower.position.set(t.x, t.y); tower.zIndex = t.y + t.h; world.addChild(tower);
        this.towerPx = parallaxBlock(tower, 'crane_tower', t.w, t.h, TOWER_RISE, { top: JUNKYARD_HEX.steel, side: JUNKYARD_HEX.steelDark },
            { l: 60, t: TOWER_RISE + 120, r: 60, b: 40 }, c => { hazard(c, 0, t.h - 14, t.w, 14); }, c => this.drawTowerTop(c, t.w, t.h));
        // arm shadow on the ground (long bar, rotates with the arm, offset SE)
        const sh = new PIXI.Container(); sh.position.set(this.ground.x + 36, this.ground.y + 36); sh.zIndex = 4; world.addChild(sh);
        this.armShadow = bakeCanvas(sh, 'crane_arm_shadow', ARM_R + 40, 36, { l: 60, t: 10, r: 10, b: 10 }, c => {
            c.save(); c.filter = 'blur(5px)'; c.fillStyle = css(JUNKYARD_HEX.shadow, 0.3); c.fillRect(-50, 4, ARM_R + 80, 26); c.restore();
        });
        this.armShadow.anchor.set(0, 0.5); this.armShadow.position.set(-60 + 0, 0); this.armShadow.pivot.set(0, 0);
        this.armShadow.position.set(-60, -18);
        // arm (rotates around the pivot)
        this.arm = new PIXI.Container(); this.arm.position.set(this.pivot.x, this.pivot.y); this.arm.zIndex = t.y + t.h + 2000; world.addChild(this.arm);
        const armSpr = bakeCanvas(this.arm, 'crane_arm', ARM_R + 70, 40, { l: 70, t: 20, r: 30, b: 20 }, c => this.drawArm(c));
        armSpr.position.set(-70 - 70 + 70, -20 - 20 + 20); // local (0,0) = pivot; sprite margins handled by bakeCanvas
        // cable + magnet + carried wreck (world-positioned, follow the arm tip)
        this.cable = new PIXI.Graphics(); this.cable.zIndex = t.y + t.h + 1999; world.addChild(this.cable);
        this.magnet = new PIXI.Container(); this.magnet.zIndex = t.y + t.h + 2001; world.addChild(this.magnet);
        bakeCanvas(this.magnet, 'crane_magnet', 0, 0, { l: 40, t: 24, r: 40, b: 24 }, c => this.drawMagnet(c));
        this.carried = new PIXI.Container(); this.carried.zIndex = t.y + t.h + 2000; this.carried.visible = false; world.addChild(this.carried);
        bakeCarSprite(this.carried, 0, 1, JUNKYARD_WRECK_TINTS[2]);
        // telegraph: red dashed ring (static Graphics, alpha pulse) + shrinking shadow
        this.tele = new PIXI.Container(); this.tele.zIndex = 6; this.tele.visible = false; world.addChild(this.tele);
        const ring = new PIXI.Graphics();
        ring.lineStyle(3, JUNKYARD_HEX.beaconRed, 0.9);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) { ring.arc(0, 0, WRECK_DMG_R, a, a + Math.PI / 14); ring.moveTo(Math.cos(a + Math.PI / 9) * WRECK_DMG_R, Math.sin(a + Math.PI / 9) * WRECK_DMG_R); }
        ring.lineStyle(0);
        this.tele.addChild(ring);
        const shHolder = new PIXI.Container(); this.tele.addChild(shHolder);
        this.teleShadow = bakeCanvas(shHolder, 'crane_tele_shadow', 0, 0, { l: 60, t: 44, r: 60, b: 44 }, c => {
            c.save(); c.filter = 'blur(6px)'; c.fillStyle = css(JUNKYARD_HEX.shadow, 0.5); c.beginPath(); c.ellipse(0, 0, 44, 30, 0, 0, Math.PI * 2); c.fill(); c.restore();
        });
        this.teleShadow.anchor.set(0.5);
        this.teleShadow.position.set(0, 0);
        // console pad (Pulpit dzwigu)
        const pp = L.cranePad;
        const pad = new PIXI.Container(); pad.position.set(pp.x, pp.y); pad.zIndex = 5; world.addChild(pad);
        bakeCanvas(pad, 'crane_pad', 100, 100, { l: 20, t: 50, r: 30, b: 30 }, c => this.drawPad(c));
        this.padGfx = new PIXI.Graphics(); pad.addChild(this.padGfx);
        this.padRing = new PIXI.Graphics(); pad.addChild(this.padRing);
        this.phaseStart = simNowMs();
        this.applyArm();
    }

    public getCollisionRects(): ICollidable[] { return this.solids; }
    public get phaseName(): Phase { return this.phase; }
    public get isArmed(): boolean { return this.armed; }

    /** Fixed logic step (host). */
    public update(): void {
        const now = simNowMs();
        const T = this.tune;
        const el = now - this.phaseStart;
        this.updatePad(now);
        switch (this.phase) {
            case 'idle':
                if (el >= T.idleMs) { this.pickTarget(); this.setPhase('toStack', now); this.angleFrom = this.angle; this.angleTo = this.stackAngle(); }
                break;
            case 'toStack': {
                const k = ease(Math.min(1, el / T.swingMs));
                this.angle = lerpAngle(this.angleFrom, this.angleTo, k);
                this.hang = 0;
                if (k >= 1) { this.setPhase('lift', now); this.audio.playCraneMotor(); }
                break;
            }
            case 'lift': {
                const k = Math.min(1, el / T.liftMs);
                // magnet goes down (0..0.5) then up with the wreck (0.5..1)
                this.hang = k < 0.5 ? k * 2 * 40 : (1 - (k - 0.5) * 2) * 40;
                if (k >= 0.5 && !this.carried.visible) { this.carried.visible = true; this.audio.playMagnetClank(); }
                if (k >= 1) { this.setPhase('carry', now); this.angleFrom = this.angle; this.angleTo = Math.atan2(this.target.y - this.ground.y, this.target.x - this.ground.x); this.audio.playCraneMotor(); }
                break;
            }
            case 'carry': {
                const k = ease(Math.min(1, el / T.carryMs));
                this.angle = lerpAngle(this.angleFrom, this.angleTo, k);
                if (k >= 1) { this.setPhase('telegraph', now); this.tele.visible = true; this.tele.position.set(this.target.x, this.target.y); this.lastBeepAt = 0; }
                break;
            }
            case 'telegraph': {
                const k = Math.min(1, el / T.telegraphMs);
                const s = 1.8 - 0.8 * k;
                this.teleShadow.scale.set(s); this.teleShadow.alpha = 0.3 + 0.7 * k;
                this.tele.alpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 90));
                const period = 420 - 260 * k;
                if (now - this.lastBeepAt >= period) { this.lastBeepAt = now; this.audio.playPressBeep(k > 0.6); }
                if (k >= 1) { this.setPhase('drop', now); this.dropped = false; this.audio.playCraneDropWhistle(); }
                break;
            }
            case 'drop': {
                const k = Math.min(1, el / T.dropMs);
                // the wreck falls: from under the magnet to the target (visual only; impact at k=1)
                const tip = this.tip(); tip.x += this.viewOff.x; tip.y += this.viewOff.y;
                const fx = tip.x + (this.target.x - tip.x) * k, fy = (tip.y + HANG + 8) + (this.target.y - (tip.y + HANG + 8)) * (k * k);
                this.carried.position.set(fx, fy); this.carried.scale.set(1.15 - 0.15 * k);
                if (k >= 1 && !this.dropped) { this.dropped = true; this.impact(now); }
                if (el >= T.dropMs + 200) { this.setPhase('idle', now); this.carried.visible = false; this.tele.visible = false; }
                break;
            }
        }
        this.applyArm();
    }

    private setPhase(p: Phase, now: number): void { this.phase = p; this.phaseStart = now; }

    private stackAngle(): number {
        // visually "reach to a stack": the two inner stacks N of the press are at ~atan2 of (1100,1070)/(1900,1070)
        const s = this.lastTargetIdx % 2 === 0 ? { x: 1100, y: 1070 } : { x: 1900, y: 1070 };
        return Math.atan2(s.y - this.ground.y, s.x - this.ground.x);
    }

    private pickTarget(): void {
        const pts = JUNKYARD_LAYOUT.craneDrops;
        let idx: number;
        if (this.armed) {
            // biggest enemy cluster near a drop point (boss counts x3); ties -> worldRng
            let best = -1, bestScore = -1;
            const enemies = this.hooks.getEnemies();
            const scores = pts.map(p => { let s = 0; for (const e of enemies) { if (!e.active) continue; if (Math.hypot(e.x - p.x, e.y - p.y) <= 190) s += (e.isBoss || e.isMegaBoss) ? 3 : 1; } return s; });
            for (let i = 0; i < pts.length; i++) if (scores[i] > bestScore || (scores[i] === bestScore && worldRng.chance(0.5))) { bestScore = scores[i]; best = i; }
            idx = best;
            this.armed = false;
        } else {
            idx = worldRng.int(pts.length);
            if (idx === this.lastTargetIdx) idx = (idx + 1) % pts.length;
        }
        this.lastTargetIdx = idx;
        this.target = { x: pts[idx].x, y: pts[idx].y };
    }

    private tip(): { x: number; y: number } {
        return { x: this.pivot.x + Math.cos(this.angle) * ARM_R, y: this.pivot.y + Math.sin(this.angle) * ARM_R };
    }

    /** VIEW loop (not the logic step): parallax of the tower roof + everything at pivot height. */
    public updateView(camX: number, camY: number, viewW: number, viewH: number): void {
        const t = JUNKYARD_LAYOUT.craneTower;
        if (!isJunkyardParallaxEnabled()) { this.towerPx.setOffset(0, 0); this.viewOff.x = 0; this.viewOff.y = 0; }
        else {
            const o = parallaxOffset(t.x + t.w / 2, t.y + t.h / 2, TOWER_RISE, camX, camY, viewW, viewH);
            this.towerPx.setOffset(o.ox, o.oy);
            const p = parallaxOffset(t.x + t.w / 2, t.y + t.h / 2, PIVOT_LIFT, camX, camY, viewW, viewH);
            this.viewOff.x = p.ox - 4; this.viewOff.y = p.oy; // -4: same E-face bias as the roof so the slewing ring stays under the pivot
        }
        this.applyArm();
    }

    private applyArm(): void {
        this.arm.rotation = this.angle;
        this.arm.position.set(this.pivot.x + this.viewOff.x, this.pivot.y + this.viewOff.y);
        this.armShadow.parent.rotation = this.angle;
        const tip = this.tip(); tip.x += this.viewOff.x; tip.y += this.viewOff.y;
        const my = tip.y + this.hang + HANG;
        this.magnet.position.set(tip.x, my);
        this.cable.clear();
        this.cable.lineStyle(2, 0x1a1a1a, 1); this.cable.moveTo(tip.x, tip.y); this.cable.lineTo(tip.x, my - 6);
        this.cable.lineStyle(0);
        if (this.carried.visible && this.phase !== 'drop') { this.carried.position.set(tip.x, my + 10); this.carried.scale.set(1.15); }
    }

    private impact(now: number): void {
        const tx = this.target.x, ty = this.target.y;
        this.audio.playCraneThud();
        this.effects.shake(9, 12);
        this.effects.spawnTowerDeployDust(tx, ty);
        this.effects.spawnPressDebris(tx, ty);
        this.effects.spawnRingFx(tx, ty, WRECK_DMG_R, 0xe63b2e, 12);
        this.hooks.notify('drop');
        for (const e of this.hooks.getEnemies()) {
            if (!e.active) continue;
            if (Math.hypot(e.x - tx, e.y - ty) <= WRECK_DMG_R) this.hooks.damageEnemy(e, this.tune.enemyDmg);
        }
        const players = this.hooks.getPlayers();
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const d = Math.hypot(p.x - tx, p.y - ty);
            if (d <= WRECK_DMG_R) this.hooks.damagePlayer(i, p.maxHp * this.tune.playerDmgPct);
            // anyone standing on the footprint gets pushed out (never trapped inside new cover)
            if (Math.abs(p.x - tx) < STACK_W / 2 + 24 && Math.abs(p.y - ty) < STACK_H / 2 + 24) {
                const dx = p.x - tx || 1, dy = p.y - ty;
                this.hooks.pushPlayer(i, dx, dy, 70);
            }
        }
        for (const e of this.hooks.getEnemies()) {
            if (!e.active) continue;
            if (Math.abs(e.x - tx) < STACK_W / 2 + 20 && Math.abs(e.y - ty) < STACK_H / 2 + 20) {
                const dx = e.x - tx || 1, dy = e.y - ty; const len = Math.hypot(dx, dy) || 1;
                e.x = tx + dx / len * 90; e.y = ty + dy / len * 70;
            }
        }
        // new cover; oldest crumbles when over the limit
        const w = new DroppedWreck(tx, ty, this.tune.wreckHp, this.world, this.effects, this.audio, (dead) => {
            const i = this.wrecks.indexOf(dead); if (i >= 0) this.wrecks.splice(i, 1);
            this.hooks.removeSolid(dead);
        });
        this.wrecks.push(w);
        this.hooks.addSolid(w);
        while (this.wrecks.length > this.tune.maxWrecks) this.wrecks[0].crumble();
        void now;
    }

    private updatePad(now: number): void {
        const pp = JUNKYARD_LAYOUT.cranePad;
        const cx = pp.x + 50, cy = pp.y + 50;
        const ready = now >= this.padCooldownEnd && !this.armed;
        let occupant: Player | null = null;
        for (const p of this.hooks.getPlayers()) if (Math.hypot(p.x - cx, p.y - cy) <= PAD_R) { occupant = p; break; }
        if (ready && occupant) {
            if (this.padHoldStart < 0) this.padHoldStart = now;
            const k = Math.min(1, (now - this.padHoldStart) / this.tune.padHoldMs);
            this.drawPadRing(k, 0xf2c230);
            if (k >= 1) { this.armed = true; this.padHoldStart = -1; this.padCooldownEnd = now + this.tune.padCooldownMs; this.hooks.notify('armed'); this.audio.playConsoleArmed(); }
        } else {
            this.padHoldStart = -1;
            if (this.armed) this.drawPadRing(1, 0xe63b2e);
            else if (!ready) this.drawPadRing(1 - Math.min(1, (this.padCooldownEnd - now) / this.tune.padCooldownMs), 0x8a9099);
            else this.drawPadRing(0, 0);
        }
        // console screen blink
        this.padGfx.clear();
        const on = Math.sin(now / 250) > 0;
        this.padGfx.beginFill(this.armed ? JUNKYARD_HEX.beaconRed : (ready ? 0x39d98a : 0x8a9099), on || this.armed ? 0.9 : 0.4);
        this.padGfx.drawRect(36, 12, 28, 10); this.padGfx.endFill();
    }

    private drawPadRing(k: number, color: number): void {
        this.padRing.clear();
        if (k <= 0) return;
        this.padRing.lineStyle(4, color, 0.9);
        this.padRing.arc(50, 50, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        this.padRing.lineStyle(0);
    }

    // ── art ──
    /** Roof of the tower: bolted ring plate + slewing ring (the arm's pivot cylinder lands exactly on it). */
    private drawTowerTop(c: CanvasRenderingContext2D, w: number, h: number): void {
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(w / 2 + 3, -TOWER_RISE + h / 2 + 3, 34, 20, 0, 0, Math.PI * 2); c.fill();
        const pg = c.createRadialGradient(w / 2 - 8, -TOWER_RISE + h / 2 - 6, 4, w / 2, -TOWER_RISE + h / 2, 34);
        pg.addColorStop(0, css(JUNKYARD_HEX.steelLight)); pg.addColorStop(1, css(JUNKYARD_HEX.steelDark));
        c.fillStyle = pg; c.beginPath(); c.ellipse(w / 2, -TOWER_RISE + h / 2, 34, 20, 0, 0, Math.PI * 2); c.fill();
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.fillStyle = '#2f343a'; c.beginPath(); c.arc(w / 2 + Math.cos(a) * 27, -TOWER_RISE + h / 2 + Math.sin(a) * 15, 2.5, 0, Math.PI * 2); c.fill(); }
        cylinder(c, w / 2 - 16, -PIVOT_LIFT + h / 2 - 2, 32, 28, JUNKYARD_HEX.steelDark, 6);
    }

    private drawArm(c: CanvasRenderingContext2D): void {
        // local (0,0) = pivot; beam along +x to ARM_R, counterweight at -x
        const bg = c.createLinearGradient(0, -9, 0, 9); bg.addColorStop(0, '#c3c9cf'); bg.addColorStop(0.5, '#6f767e'); bg.addColorStop(1, '#2f343a');
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 5, ARM_R, 9);
        c.fillStyle = bg; c.fillRect(0, -9, ARM_R, 18);
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; for (let k = 10; k < ARM_R; k += 18) { c.beginPath(); c.moveTo(k, -8); c.lineTo(k + 10, 8); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, -9, ARM_R, 2);
        hazard(c, ARM_R - 40, -9, 40, 18, 8);
        const cwg = c.createLinearGradient(-66, 0, -16, 0); cwg.addColorStop(0, '#5e5a52'); cwg.addColorStop(1, '#9a958b');
        c.fillStyle = cwg; roundRect(c, -66, -14, 50, 28, 3); c.fill(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-66, 10, 50, 4);
        // operator cab at the pivot (rotates with the jib) + pivot cylinder underneath
        c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, -12, -12, 40, 30, 4); c.fill();
        const cab = c.createLinearGradient(-16, -16, 24, 14); cab.addColorStop(0, '#f0dc6a'); cab.addColorStop(1, '#8f8233');
        c.fillStyle = cab; roundRect(c, -16, -16, 40, 30, 4); c.fill();
        const gg = c.createLinearGradient(-12, -12, 20, -2); gg.addColorStop(0, '#9fc3d8'); gg.addColorStop(0.5, '#2f3a44'); gg.addColorStop(1, '#1d242b');
        c.fillStyle = gg; roundRect(c, -12, -12, 32, 10, 2); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.strokeRect(-16, -16, 40, 30);
        cylinder(c, -8, 10, 16, 14, JUNKYARD_HEX.steelDark, 4);
    }

    private drawMagnet(c: CanvasRenderingContext2D): void {
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(3, 10, 32, 13, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#3a3f45'; c.beginPath(); c.ellipse(0, 6, 32, 13, 0, 0, Math.PI * 2); c.fill();
        const dg = c.createRadialGradient(-8, -4, 2, 0, 0, 34); dg.addColorStop(0, '#ff8f84'); dg.addColorStop(0.5, css(JUNKYARD_HEX.beaconRed)); dg.addColorStop(1, '#7a1b14');
        c.fillStyle = dg; c.beginPath(); c.ellipse(0, 0, 32, 13, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = css(JUNKYARD_HEX.chrome, 0.9); c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, 30, 11, 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.ellipse(-9, -4, 10, 4, 0, 0, Math.PI * 2); c.fill();
        cylinder(c, -5, -16, 10, 14, JUNKYARD_HEX.steelDark);
    }

    private drawPad(c: CanvasRenderingContext2D): void {
        softShadow(c, 0, 0, 100, 100, 6, 0.3);
        block(c, 0, 0, 100, 100, 6, { top: 0x6f767e, side: 0x3c4147, radius: 6 });
        hazard(c, 6, -6 + 6, 88, 6, 6);
        // console box with a screen, lever and a big yellow button
        block(c, 30, 4, 40, 28, 26, { top: 0xd9c75a, side: 0x8f8233, radius: 3 });
        c.fillStyle = '#1d242b'; c.fillRect(36, 12 - 26 + 26 - 26, 28, 10);
        cylinder(c, 50, -22 - 26, 4, 24, JUNKYARD_HEX.steelDark); c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.beginPath(); c.arc(52, -22 - 26, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(JUNKYARD_HEX.hazardY); c.beginPath(); c.arc(50, 60, 14, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(46, 56, 5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.beginPath(); c.arc(50, 60, 14, 0, Math.PI * 2); c.stroke();
        // footprint marks
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([6, 5]); c.strokeRect(8, 40, 84, 54); c.setLineDash([]);
    }
}

function ease(k: number): number { return k * k * (3 - 2 * k); }
function lerpAngle(a: number, b: number, k: number): number {
    let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}
