import * as PIXI from 'pixi.js';
import type { Player } from '../../entities/Player';
import type { EffectsManager } from '../../rendering/Effects';
import { checkRectCollision } from '../Physics';
import { t } from '../../i18n/i18n';
import { AudioSys } from '../../audio/AudioSys';
import { simNowMs } from '../SimClock';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT } from '../../maps/JunkyardMap';
import { bakeCanvas, css, hazard } from '../../maps/junkyard/junkyardBake';
import { TIRE_JUMP } from '../../config/junkyardRules';

/**
 * JunkyardJump — OPONA-TRAMPOLINA (ZLOMOWISKO J6b): port of CastleJump (GRUPA E) onto the sim clock.
 *
 * Two giant truck tyres with a taut rubber mat, N and S of the Great Press. Drive onto one = you are thrown
 * in an arc OVER the press to the other side (the Flex: jump the 40-ton plate while it slams). Landing spot is
 * checked against the live `buildings` (dropped wrecks etc.); if blocked: a notice, try again after rolling off.
 * Per-tyre cooldown on simNowMs (pauses with the match; coop clients agree). In flight: no input, no shooting,
 * the player is invulnerable and the press / hubcaps skip them (main.ts hooks `isAirborne`).
 * Visual: the tank lifts (sprite only), its shadow stays on the ground and shrinks (decoupled-shadow pattern).
 */
const TRAMPOLINES: ReadonlyArray<{ x: number; y: number; landX: number; landY: number; dir: number }> = [
    { x: 1430, y: 1810, landX: 1570, landY: 1130, dir: -Math.PI / 2 + 0.2 }, // S tyre -> over the press to the N (AABB: 120 px from the columns)
    { x: 1570, y: 1190, landX: 1430, landY: 1870, dir: Math.PI / 2 + 0.2 },  // N tyre -> over the press to the S
];
const TEX_RES = 2;
const R = TIRE_JUMP.visualRadius;

interface TyreView {
    x: number; y: number; landX: number; landY: number; dir: number;
    root: PIXI.Container; base: PIXI.Sprite; arrow: PIXI.Sprite; ring: PIXI.Graphics; label: PIXI.Text;
    armed: boolean; squashT: number; lastLabel: string; readyAt: number;
}

export class JunkyardJump {
    private flightT = -1;
    private fromX = 0; private fromY = 0;
    private toX = 0; private toY = 0;
    private baseScaleX = 1; private baseScaleY = 1;
    private time = 0;
    private shadow: PIXI.Graphics;
    private tyres: TyreView[] = [];

    constructor(worldContainer: PIXI.Container) {
        this.shadow = new PIXI.Graphics();
        this.shadow.beginFill(0x000000, 1); this.shadow.drawEllipse(0, 0, 30, 15); this.shadow.endFill();
        this.shadow.zIndex = 9; this.shadow.visible = false;
        worldContainer.addChild(this.shadow);
        for (const d of TRAMPOLINES) {
            const root = new PIXI.Container(); root.position.set(d.x, d.y); root.zIndex = d.y;
            const holder = new PIXI.Container(); root.addChild(holder);
            const base = bakeCanvas(holder, 'tire_jump', 0, 0, { l: R + 18, t: R + 18, r: R + 18, b: R + 18 }, c => JunkyardJump.drawTyre(c));
            base.anchor.set(0.5); base.position.set(0, 0);
            const arrowHolder = new PIXI.Container(); root.addChild(arrowHolder);
            const arrow = bakeCanvas(arrowHolder, 'tire_jump_arrow', 0, 0, { l: 20, t: 16, r: 20, b: 16 }, c => {
                c.lineJoin = 'round';
                const chevron = (ox: number): void => { c.beginPath(); c.moveTo(ox - 6, -10); c.lineTo(ox + 6, 0); c.lineTo(ox - 6, 10); };
                for (const ox of [-6, 7]) { chevron(ox); c.strokeStyle = '#1a1300'; c.lineWidth = 7; c.stroke(); chevron(ox); c.strokeStyle = '#ffe14d'; c.lineWidth = 4; c.stroke(); }
            });
            arrow.anchor.set(0.5); arrow.position.set(0, 0); arrowHolder.rotation = d.dir;
            const ring = new PIXI.Graphics();
            const label = new PIXI.Text('', { fontFamily: 'Titan One, Arial', fontSize: 15, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 });
            label.anchor.set(0.5); label.visible = false;
            root.addChild(ring, label);
            worldContainer.addChild(root);
            this.tyres.push({ ...d, root, base, arrow: arrowHolder as unknown as PIXI.Sprite, ring, label, armed: true, squashT: 0, lastLabel: '', readyAt: 0 });
        }
    }

    isAirborne(): boolean { return this.flightT >= 0; }

    private landingFor(tr: TyreView, buildings: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): { x: number; y: number } | null {
        const px = -Math.sin(tr.dir), py = Math.cos(tr.dir);
        for (const shift of [0, 40, -40, 80, -80]) {
            const lx = tr.landX + px * shift, ly = tr.landY + py * shift;
            let free = true;
            for (const b of buildings) { if (b.w > 0 && checkRectCollision(b.x, b.y, b.w, b.h, lx, ly, TIRE_JUMP.landRadius)) { free = false; break; } }
            if (free) return { x: lx, y: ly };
        }
        return null;
    }

    /** Once per logic step, BEFORE the player's movement. Returns true while the player is in flight. */
    update(delta: number, player: Player, buildings: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
        effects: EffectsManager, canAct: boolean, notify: (text: string, color: string) => void): boolean {
        const now = simNowMs();
        this.time += delta;
        if (this.flightT < 0 && canAct) {
            for (const tr of this.tyres) {
                const d2 = (player.x - tr.x) ** 2 + (player.y - tr.y) ** 2;
                if (d2 > TIRE_JUMP.rearmRadius ** 2) { tr.armed = true; continue; }
                if (!tr.armed || d2 > TIRE_JUMP.triggerRadius ** 2 || now < tr.readyAt) continue;
                tr.armed = false;
                const land = this.landingFor(tr, buildings);
                if (!land) { notify(t('castle.jump.blocked'), '#ffb347'); continue; }
                tr.squashT = 18;
                this.start(player, land, tr, effects, now);
                break;
            }
        }
        this.drawTyres(now, delta);
        if (this.flightT < 0) return false;
        this.flightT += delta;
        const F = TIRE_JUMP.flightFrames;
        const k = Math.min(1, this.flightT / F);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const alt = Math.sin(Math.PI * k);
        player.x = this.fromX + (this.toX - this.fromX) * e;
        player.y = this.fromY + (this.toY - this.fromY) * e;
        const lift = alt * TIRE_JUMP.peakLift;
        player.container.x = player.x; player.container.y = player.y - lift;
        player.container.scale.set(this.baseScaleX * (1 + alt * 0.25), this.baseScaleY * (1 + alt * 0.25));
        player.container.zIndex = 9500; // above the press frame (b.y+b.h+403) and everything else
        this.shadow.x = player.x + alt * 10; this.shadow.y = player.y + 14 + alt * 12;
        this.shadow.scale.set(1 - alt * 0.45); this.shadow.alpha = 0.5 * (1 - alt * 0.4);
        if (k >= 1) this.land(player, effects);
        return true;
    }

    private drawTyres(now: number, delta: number): void {
        for (const tr of this.tyres) {
            const cd = Math.max(0, tr.readyAt - now);
            const ready = cd <= 0;
            let sy = 1, sx = 1;
            if (tr.squashT > 0) {
                tr.squashT = Math.max(0, tr.squashT - delta);
                const p = 1 - tr.squashT / 18; const w = Math.sin(p * Math.PI * 3) * (1 - p);
                sy = 1 - 0.3 * w; sx = 1 + 0.15 * w;
            } else if (ready) { const b = Math.sin(this.time * 0.18); sy = 1 + 0.06 * b; sx = 1 - 0.03 * b; }
            tr.base.scale.set(sx, sy);
            tr.base.alpha = ready ? 1 : 0.55;
            tr.arrow.visible = ready;
            if (ready) {
                const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.18);
                tr.arrow.alpha = 0.75 + 0.25 * pulse; tr.arrow.scale.set(1 + 0.12 * pulse);
                tr.arrow.x = Math.cos(tr.dir) * 4 * pulse; tr.arrow.y = Math.sin(tr.dir) * 4 * pulse;
            }
            if (!ready) {
                const frac = 1 - cd / TIRE_JUMP.cooldownMs;
                tr.ring.clear(); tr.ring.lineStyle(5, 0x000000, 0.45); tr.ring.drawCircle(0, 0, R + 5);
                tr.ring.lineStyle(4, 0xffd23f, 0.95); tr.ring.arc(0, 0, R + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
                const txt = `${Math.ceil(cd / 1000)}`;
                if (txt !== tr.lastLabel) { tr.label.text = txt; tr.lastLabel = txt; }
                tr.label.visible = true;
            } else if (tr.label.visible) { tr.ring.clear(); tr.label.visible = false; tr.lastLabel = ''; }
        }
    }

    private start(player: Player, land: { x: number; y: number }, tr: TyreView, effects: EffectsManager, now: number): void {
        this.fromX = player.x; this.fromY = player.y; this.toX = land.x; this.toY = land.y;
        this.baseScaleX = player.container.scale.x; this.baseScaleY = player.container.scale.y;
        this.flightT = 0;
        tr.readyAt = now + TIRE_JUMP.cooldownMs;
        this.shadow.visible = true;
        player.firing = false;
        effects.spawnTowerDeployDust(tr.x, tr.y);
        AudioSys.getInstance().playCastleJump();
        effects.shake(8, 10);
    }

    private land(player: Player, effects: EffectsManager): void {
        this.flightT = -1;
        player.x = this.toX; player.y = this.toY;
        player.container.x = player.x; player.container.y = player.y;
        player.container.scale.set(this.baseScaleX, this.baseScaleY);
        player.container.zIndex = player.y + 40;
        this.shadow.visible = false;
        effects.spawnTowerDeployDust(player.x, player.y); effects.spawnTowerDeployDust(player.x + 18, player.y + 6);
        effects.shake(14, 18);
    }

    destroy(): void {
        this.shadow.destroy();
        for (const tr of this.tyres) tr.root.destroy({ children: true });
        this.tyres = [];
    }

    /** Giant truck tyre lying flat: contact shadow, thick rubber sidewall (fake-3D), tread blocks, a taut dark mat with yellow springs. */
    private static drawTyre(c: CanvasRenderingContext2D): void {
        const SIDE = 8;
        let g = c.createRadialGradient(4, 10, R * 0.4, 4, 10, R + 12);
        g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.75, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(4, 10, R + 12, R + 8, 0, 0, Math.PI * 2); c.fill();
        // sidewall (rubber, dark, offset down = thickness)
        g = c.createLinearGradient(-R, 0, R, 0); g.addColorStop(0, '#2c2c2c'); g.addColorStop(0.5, '#161616'); g.addColorStop(1, '#0a0a0a');
        c.fillStyle = g; c.beginPath(); c.arc(0, SIDE, R + 2, 0, Math.PI * 2); c.fill(); c.fillRect(-(R + 2), 0, (R + 2) * 2, SIDE);
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1.5; for (let k = -R; k < R; k += 7) { c.beginPath(); c.moveTo(k, 1); c.lineTo(k + 2, SIDE + 1); c.stroke(); }
        // tread face (top): radial rubber with a lit NW rim, tread blocks around
        g = c.createRadialGradient(-6, -6, 2, 0, 0, R + 2); g.addColorStop(0, '#5a5a5a'); g.addColorStop(0.5, css(JUNKYARD_HEX.tire)); g.addColorStop(1, '#101010');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, R + 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#0c0c0c'; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; c.save(); c.rotate(a); c.fillRect(R - 9, -2.5, 8, 5); c.restore(); }
        c.strokeStyle = 'rgba(120,120,120,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R - 10, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 2.2; c.beginPath(); c.arc(0, 0, R, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
        // mat: concave dark rubber with an inner shadow + yellow springs to the rim + hazard patch
        const mr = R - 13;
        g = c.createRadialGradient(1, 2, 1, 0, 0, mr); g.addColorStop(0, '#1a1c1f'); g.addColorStop(0.6, '#2f343a'); g.addColorStop(1, '#6e757e');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, mr, 0, Math.PI * 2); c.fill();
        c.save(); c.beginPath(); c.arc(0, 0, mr, 0, Math.PI * 2); c.clip(); c.fillStyle = 'rgba(0,0,0,0.38)';
        c.beginPath(); c.arc(0, 0, mr + 1, 0, Math.PI * 2); c.arc(4, 5, mr, 0, Math.PI * 2, true); c.fill('evenodd'); c.restore();
        c.strokeStyle = '#0a0b0c'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, mr, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#ffd23f'; c.lineWidth = 1.8; c.lineCap = 'round';
        const N = 14;
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
            c.beginPath();
            for (let k = 0; k <= 4; k++) { const r = mr + (k / 4) * (R - 10 - mr); const off = k % 2 === 0 ? 0 : (k === 1 ? 1.8 : -1.8); const x = ca * r + px * off, y = sa * r + py * off; if (k === 0) c.moveTo(x, y); else c.lineTo(x, y); }
            c.stroke();
        }
        c.save(); c.beginPath(); c.arc(0, 0, mr - 4, 0, Math.PI * 2); c.clip(); hazard(c, -mr, -4, mr * 2, 8, 6); c.restore();
        c.fillStyle = 'rgba(160,200,255,0.18)'; c.beginPath(); c.ellipse(7, 8, 10, 4.5, -0.7, 0, Math.PI * 2); c.fill();
    }

    /** Layout check / tests. */
    static get positions(): ReadonlyArray<{ x: number; y: number; landX: number; landY: number }> { return TRAMPOLINES; }
}

void JUNKYARD_LAYOUT;
