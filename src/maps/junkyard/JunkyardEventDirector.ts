import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { JunkyardEventsTuning } from '../../config/junkyardRules';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT, JUNKYARD_STACK_CLUSTER } from '../JunkyardMap';
import { simNowMs } from '../../systems/SimClock';
import { worldRng } from '../../systems/Rng';
import { checkRectCollision } from '../../systems/Physics';
import { bakeCanvas, css } from './junkyardBake';

/**
 * JunkyardEventDirector — timed yard events of ZLOMOWISKO (J6a). A tiny director: counts logic steps, rolls an
 * event with `worldRng` every `nextInSteps` (per-event cooldowns), so two coop clients roll the same thing.
 *
 *  - 'hubcaps'  Lawina kolpakow: one of the four inner wreck stacks shakes for 2 s (telegraph in the map's one
 *               warning language: stripes/beeps + a red dashed ring), then 8 hubcaps roll out like frisbees along
 *               a fan aimed at the nearest player (worldRng spread). 40 dmg to enemies AND players (SRC_HUBCAP),
 *               one bounce off a solid, then they clang and vanish. Enemy kills: no score (machines do not play).
 *  - 'sale'     Wyprzedaz czesci: the office megaphone pulses ("PROMOCJA!"), 3-5 pickups land on the lot in
 *               front of the office (gems, a heart, 30% a power cube). Pure reward, zero risk.
 *
 * Hubcap positions = sim state (fixed px per step); sprites rotate per frame (visual only).
 */
export type JunkyardEventKind = 'hubcaps' | 'sale';
export interface EventHooks {
    getEnemies: () => Enemy[];
    getPlayers: () => Player[];
    getSolids: () => ICollidable[];
    /** Hubcap hit on a regular enemy; returns true if it died. */
    damageEnemy: (e: Enemy, dmg: number) => boolean;
    damagePlayer: (index: number, amount: number) => void;
    /** Sale drop: spawn ONE pickup of a kind at (x, y). */
    spawnPickup: (kind: 'gem' | 'heart' | 'cube', x: number, y: number) => void;
    /** Shake a wreck stack (visual): idx in the inner ring 0..3, on/off. */
    shakeStack: (ringIdx: number, on: boolean) => void;
    notify: (key: 'hubcapsTelegraph' | 'hubcaps' | 'sale') => void;
}

interface Hubcap { x: number; y: number; ox: number; oy: number; vx: number; vy: number; life: number; bounced: boolean; hit: boolean; spr: PIXI.Sprite; }
const FREE_R = 150; // no solid checks until the cap has rolled out of its own stack
const HUBCAP_R = 14;
const INNER_RING = 4; // first four stacks of JUNKYARD_LAYOUT.stacks

export class JunkyardEventDirector {
    private steps = 0;
    private nextAt: number;
    private cooldownUntil: Record<JunkyardEventKind, number> = { hubcaps: 0, sale: 0 };
    private phase: 'idle' | 'telegraph' | 'rolling' = 'idle';
    private phaseStart = 0;
    private stackIdx = 0;
    private hubcaps: Hubcap[] = [];
    private pool: PIXI.Sprite[] = [];
    private ring: PIXI.Graphics;
    private megaphone: PIXI.Graphics;
    private saleUntil = 0;
    private lastBeepAt = 0;
    private layer: PIXI.Container;
    public eventsFired = 0;

    constructor(private world: PIXI.Container, private effects: EffectsManager, private audio: AudioSys,
        private tune: JunkyardEventsTuning, private hooks: EventHooks) {
        this.nextAt = tune.firstEventSteps;
        this.layer = new PIXI.Container(); this.layer.zIndex = 9000; world.addChild(this.layer); // rolling caps above everything low
        this.ring = new PIXI.Graphics(); this.ring.visible = false; this.ring.zIndex = 6; world.addChild(this.ring);
        const o = JUNKYARD_LAYOUT.office;
        this.megaphone = new PIXI.Graphics(); this.megaphone.position.set(o.x + o.w * 0.5 + 60, o.y - 56 - 36); this.megaphone.zIndex = o.y + o.h + 500; this.megaphone.visible = false; world.addChild(this.megaphone);
    }

    public get phaseName(): string { return this.phase; }
    public get activeHubcaps(): number { return this.hubcaps.filter(h => h.life > 0).length; }
    public get hubcapPos(): { x: number; y: number } | null { const h = this.hubcaps.find(h => h.life > 0); return h ? { x: h.x, y: h.y } : null; }
    /** Dev / trace: fire an event now (ignores timers). */
    public force(kind: JunkyardEventKind): void { this.start(kind); }

    /** Fixed logic step (host). */
    public update(): void {
        this.steps++;
        const now = simNowMs();
        if (this.phase === 'idle' && this.steps >= this.nextAt) {
            const ready = (['hubcaps', 'sale'] as JunkyardEventKind[]).filter(k => this.steps >= this.cooldownUntil[k]);
            if (ready.length) this.start(ready[worldRng.int(ready.length)]);
            this.nextAt = this.steps + this.tune.minGapSteps + worldRng.int(this.tune.maxGapSteps - this.tune.minGapSteps + 1);
        }
        if (this.phase === 'telegraph') {
            const k = Math.min(1, (now - this.phaseStart) / this.tune.hubcapTelegraphMs);
            const period = 420 - 260 * k;
            if (now - this.lastBeepAt >= period) { this.lastBeepAt = now; this.audio.playPressBeep(k > 0.6); }
            this.ring.alpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 90));
            if (k >= 1) this.launchHubcaps(now);
        }
        if (this.phase === 'rolling') this.stepHubcaps();
        if (this.saleUntil > now) {
            const k = (this.saleUntil - now) / this.tune.saleShowMs;
            this.megaphone.clear();
            this.megaphone.lineStyle(3, JUNKYARD_HEX.hazardY, 0.9); this.megaphone.drawCircle(0, 0, 18 + (1 - k) * 60);
            this.megaphone.lineStyle(2, JUNKYARD_HEX.beaconRed, 0.6); this.megaphone.drawCircle(0, 0, 10 + ((now / 4) % 50));
            this.megaphone.lineStyle(0);
        } else if (this.megaphone.visible) { this.megaphone.visible = false; this.megaphone.clear(); }
    }

    private start(kind: JunkyardEventKind): void {
        const now = simNowMs();
        this.cooldownUntil[kind] = this.steps + this.tune.cooldownSteps;
        this.eventsFired++;
        if (kind === 'hubcaps') {
            this.stackIdx = worldRng.int(INNER_RING);
            this.phase = 'telegraph'; this.phaseStart = now; this.lastBeepAt = 0;
            const c = this.stackCenter(this.stackIdx);
            this.ring.clear(); this.ring.lineStyle(3, JUNKYARD_HEX.beaconRed, 0.9);
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) { this.ring.arc(c.x, c.y, 120, a, a + Math.PI / 14); this.ring.moveTo(c.x + Math.cos(a + Math.PI / 9) * 120, c.y + Math.sin(a + Math.PI / 9) * 120); }
            this.ring.lineStyle(0); this.ring.visible = true;
            this.hooks.shakeStack(this.stackIdx, true);
            this.hooks.notify('hubcapsTelegraph');
        } else {
            this.saleUntil = now + this.tune.saleShowMs;
            this.megaphone.visible = true;
            this.audio.playMegaphonePromo();
            const o = JUNKYARD_LAYOUT.office;
            this.effects.spawnFloatingText(o.x + o.w / 2, o.y - 70, 'PROMOCJA!', 0xf2c230);
            this.effects.spawnRingFx(o.x + o.w / 2 + 60, o.y - 92, 90, 0xf2c230, 14);
            const n = this.tune.saleMin + worldRng.int(this.tune.saleMax - this.tune.saleMin + 1);
            for (let i = 0; i < n; i++) {
                const r = worldRng.next();
                const kind = i === 0 ? 'heart' : (r < this.tune.saleCubeChance ? 'cube' : 'gem');
                const x = o.x + 20 + worldRng.next() * (o.w - 40), y = o.y + o.h + 50 + worldRng.next() * 90;
                this.hooks.spawnPickup(kind, x, y);
                this.effects.spawnRingFx(x, y, 24, 0xffffff, 10);
            }
            this.hooks.notify('sale');
        }
    }

    private stackCenter(ringIdx: number): { x: number; y: number } {
        const st = JUNKYARD_LAYOUT.stacks[ringIdx];
        const k = JUNKYARD_STACK_CLUSTER[1];
        return { x: st.x + k.dx / 2 + 40, y: st.y + k.dy + 40 };
    }

    private hubcapSprite(): PIXI.Sprite {
        const s = this.pool.pop();
        if (s) { s.visible = true; return s; }
        const holder = new PIXI.Container(); this.layer.addChild(holder);
        const spr = bakeCanvas(holder, 'hubcap_roll', 0, 0, { l: 20, t: 20, r: 20, b: 20 }, c => {
            c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(3, 4, HUBCAP_R, HUBCAP_R * 0.9, 0, 0, Math.PI * 2); c.fill();
            const g = c.createRadialGradient(-5, -5, 2, 0, 0, HUBCAP_R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, css(JUNKYARD_HEX.chrome)); g.addColorStop(1, '#6f767e');
            c.fillStyle = g; c.beginPath(); c.arc(0, 0, HUBCAP_R, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#3c4147'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, HUBCAP_R - 3, 0, Math.PI * 2); c.stroke();
            for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * (HUBCAP_R - 4), Math.sin(a) * (HUBCAP_R - 4)); c.stroke(); }
            c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.beginPath(); c.arc(0, 0, 3.5, 0, Math.PI * 2); c.fill();
        });
        spr.anchor.set(0.5); spr.position.set(0, 0);
        holder.removeChild(spr); this.layer.removeChild(holder); holder.destroy();
        this.layer.addChild(spr);
        return spr;
    }

    private launchHubcaps(now: number): void {
        this.phase = 'rolling'; this.phaseStart = now;
        this.ring.visible = false;
        this.hooks.shakeStack(this.stackIdx, false);
        const c = this.stackCenter(this.stackIdx);
        const players = this.hooks.getPlayers();
        let tx = 1500, ty = 1500, best = Infinity;
        for (const p of players) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < best) { best = d; tx = p.x; ty = p.y; } }
        const base = Math.atan2(ty - c.y, tx - c.x);
        const spread = this.tune.hubcapSpreadRad;
        for (let i = 0; i < this.tune.hubcapCount; i++) {
            const a = base + (i / (this.tune.hubcapCount - 1) - 0.5) * 2 * spread + (worldRng.next() - 0.5) * 0.12;
            const sp = this.tune.hubcapSpeed * (0.85 + worldRng.next() * 0.3);
            const spr = this.hubcapSprite();
            spr.position.set(c.x, c.y);
            this.hubcaps.push({ x: c.x, y: c.y, ox: c.x, oy: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: this.tune.hubcapLifeSteps, bounced: false, hit: false, spr });
        }
        this.audio.playHubcapClang();
        this.effects.shake(5, 8);
        this.effects.spawnPressDebris(c.x, c.y);
        this.effects.spawnTowerDeployDust(c.x, c.y);
        this.hooks.notify('hubcaps');
    }

    private stepHubcaps(): void {
        const solids = this.hooks.getSolids();
        const enemies = this.hooks.getEnemies();
        const players = this.hooks.getPlayers();
        for (const h of this.hubcaps) {
            if (h.life <= 0) continue;
            h.life--;
            const nx = h.x + h.vx, ny = h.y + h.vy;
            let blocked = false;
            if (Math.hypot(nx - h.ox, ny - h.oy) > FREE_R) for (const b of solids) { if (b.w > 0 && checkRectCollision(b.x, b.y, b.w, b.h, nx, ny, HUBCAP_R)) { blocked = true; break; } }
            if (blocked) {
                if (h.bounced) { this.clang(h); continue; }
                h.bounced = true;
                // reflect on the dominant axis
                if (Math.abs(h.vx) > Math.abs(h.vy)) h.vx = -h.vx; else h.vy = -h.vy;
                this.audio.playHubcapClang();
                this.effects.spawnEnemyHitSparks(h.x, h.y, 0xc3c9cf);
            } else { h.x = nx; h.y = ny; }
            h.spr.position.set(h.x, h.y); h.spr.rotation += 0.35; h.spr.zIndex = h.y;
            if (!h.hit) {
                for (const e of enemies) {
                    if (!e.active) continue;
                    if (Math.hypot(e.x - h.x, e.y - h.y) <= HUBCAP_R + 22) { h.hit = true; this.hooks.damageEnemy(e, this.tune.hubcapDmg); this.clang(h); break; }
                }
                if (!h.hit) for (let i = 0; i < players.length; i++) {
                    const p = players[i];
                    if (Math.hypot(p.x - h.x, p.y - h.y) <= HUBCAP_R + 24) { h.hit = true; this.hooks.damagePlayer(i, this.tune.hubcapDmg); this.clang(h); break; }
                }
            }
            if (h.life <= 0) this.clang(h);
        }
        if (this.hubcaps.every(h => h.life <= 0)) {
            for (const h of this.hubcaps) { h.spr.visible = false; this.pool.push(h.spr); }
            this.hubcaps = [];
            this.phase = 'idle';
        }
    }

    private clang(h: Hubcap): void {
        if (h.life <= 0) return;
        h.life = 0;
        this.effects.spawnEnemyHitSparks(h.x, h.y, 0xe8ecef);
        this.effects.spawnRingFx(h.x, h.y, 26, 0xc3c9cf, 8);
        this.audio.playHubcapClang();
    }
}
