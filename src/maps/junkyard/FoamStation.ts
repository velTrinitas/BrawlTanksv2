import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT } from '../JunkyardMap';
import { isJunkyardParallaxEnabled } from '../../config/junkyardFlag';
import { isBoxInView } from '../cullGate';
import { bakeCanvas, css, hazard, leanSprite, parallaxOffset, propRng, roundRect, softShadow, staticRect } from './junkyardBake';

/**
 * FoamStation — MYJNIA PIANY of ZLOMOWISKO (REV 8, replaces the two-wall tunnel from JunkyardMachines).
 * Same bones as the NEON-OASIS station of Cyber City (open canopy on 4 pillars, roof with parallax, ground
 * slab with an oil puddle + ripples, fog pushed by the tracks, a leaking unit that drips, a "scan" reaction
 * on entry) — re-skinned for a scrapyard: corrugated rusty roof on hazard-wrapped steel posts, two big
 * spinning brush heads hanging under the roof, a yellow pressure-washer unit with a gauge and a leaking hose,
 * white suds instead of cryo fog, water-jet burst from the brushes when a tank rolls in.
 *
 * Collision: the 4 posts + the washer unit are solids (hitbox = what you see); the slab itself is passable.
 * Stealth: the point test lives in JunkyardHideout('wash') (main.ts loop); this class is art + view only.
 * Mobile: everything baked (Canvas 2D); per frame only sprite transforms + two small Graphics, in view only.
 * No effect on the simulation.
 */
const ROOF_H = 96;             // canopy height above ground (parallax + post length)
const POST = 28;               // post footprint (solid)
const ROOF_PAD = 16;           // roof overhang beyond the zone (posts stand at the roof corners)
const PUFFS = 26, BUBBLES = 14;
const BRUSH_R = 30;

interface Puff { s: PIXI.Sprite; bx: number; by: number; vx: number; vy: number; ph: number; }
interface Drip { x: number; y: number; vy: number; }
interface Ripple { x: number; y: number; age: number; }

export class FoamStation {
    private solids: ICollidable[] = [];
    private zone: { x: number; y: number; w: number; h: number };
    private roofRect: { x: number; y: number; w: number; h: number };
    private ground: PIXI.Container;
    private groundFx: PIXI.Graphics;
    private posts: PIXI.Container[] = [];
    private roof: PIXI.Container;
    private sign: PIXI.Container;
    private brushes: PIXI.Sprite[] = [];
    private brushBase: Array<{ x: number; y: number }> = [];
    private foam: PIXI.Container;
    private puffs: Puff[] = [];
    private fx: PIXI.Graphics;
    private drips: Drip[] = [];
    private ripples: Ripple[] = [];
    private t = 0;
    private lastMs = 0;
    private spin = 0;
    private enterFlash = 0;
    private wasInside = false;
    private leakX: number; private leakY: number;
    private oilX: number; private oilY: number;
    private dripCd = 0;

    constructor(private world: PIXI.Container) {
        const z = JUNKYARD_LAYOUT.washTunnel;
        this.zone = { x: z.x, y: z.y, w: z.w, h: z.h };
        this.roofRect = { x: z.x - ROOF_PAD, y: z.y - ROOF_PAD, w: z.w + ROOF_PAD * 2, h: z.h + ROOF_PAD * 2 };
        const R = this.roofRect;
        // solids: 4 posts just outside the zone corners + the washer unit on the N edge
        const postRects = [
            { x: z.x - POST, y: z.y - POST }, { x: z.x + z.w, y: z.y - POST },
            { x: z.x - POST, y: z.y + z.h }, { x: z.x + z.w, y: z.y + z.h },
        ];
        for (const p of postRects) this.solids.push(staticRect(p.x, p.y, POST, POST));
        const unit = { x: z.x + z.w / 2 - 34, y: z.y - 34, w: 68, h: 30 };
        this.solids.push(staticRect(unit.x, unit.y, unit.w, unit.h));
        this.oilX = z.x + z.w * 0.30; this.oilY = z.y + z.h * 0.70;
        this.leakX = unit.x + unit.w - 6; this.leakY = unit.y + unit.h + 2;

        // ── ground slab (baked): wet concrete, drain, arrows, oil puddle, glued roof shadow ──
        this.ground = new PIXI.Container(); this.ground.position.set(R.x, R.y); this.ground.zIndex = 5; world.addChild(this.ground);
        bakeCanvas(this.ground, 'foam_ground', R.w, R.h, { l: 10, t: 10, r: 30, b: 30 }, c => this.drawGround(c, z));
        this.groundFx = new PIXI.Graphics(); this.groundFx.zIndex = 6; world.addChild(this.groundFx);

        // ── washer unit (baked prop, y-sorted) ──
        const unitC = new PIXI.Container(); unitC.position.set(unit.x, unit.y); unitC.zIndex = unit.y + unit.h; world.addChild(unitC);
        bakeCanvas(unitC, 'foam_unit', unit.w, unit.h, { l: 16, t: 60, r: 24, b: 20 }, c => FoamStation.drawUnit(c, unit.w, unit.h));

        // ── posts: foot-origin holders leaned towards the roof offset ──
        for (const p of postRects) {
            const h = new PIXI.Container(); h.position.set(p.x + POST / 2, p.y + POST); h.zIndex = p.y + POST + 2; world.addChild(h);
            bakeCanvas(h, 'foam_post', POST, ROOF_H, { l: 10, t: 14, r: 10, b: 8 }, c => FoamStation.drawPost(c));
            this.posts.push(h);
        }

        // ── brushes under the roof (sprites, rotate) ──
        const brushTex = (() => { const tmp = new PIXI.Container(); const s = bakeCanvas(tmp, 'foam_brush', BRUSH_R * 2, BRUSH_R * 2, { l: 8, t: 8, r: 8, b: 8 }, c => FoamStation.drawBrush(c)); const tex = s.texture; tmp.destroy({ children: true }); return tex; })();
        for (const fx of [0.3, 0.7]) {
            const b = new PIXI.Sprite(brushTex); b.anchor.set(0.5); b.zIndex = 98000; world.addChild(b);
            this.brushes.push(b); this.brushBase.push({ x: z.x + z.w * fx, y: z.y + z.h * 0.5 });
        }

        // ── foam: puffs + bubbles (one baked texture each) ──
        this.foam = new PIXI.Container(); this.foam.zIndex = 98050; world.addChild(this.foam);
        const tmp = new PIXI.Container();
        const puffTex = bakeCanvas(tmp, 'foam_puff', 44, 44, { l: 0, t: 0, r: 0, b: 0 }, c => FoamStation.drawPuff(c)).texture;
        const bubTex = bakeCanvas(tmp, 'foam_bubble', 24, 24, { l: 0, t: 0, r: 0, b: 0 }, c => FoamStation.drawBubble(c)).texture;
        tmp.destroy({ children: true });
        const rng = propRng(z.x, z.y, 8);
        for (let i = 0; i < PUFFS + BUBBLES; i++) {
            const isPuff = i < PUFFS;
            const s = new PIXI.Sprite(isPuff ? puffTex : bubTex); s.anchor.set(0.5);
            const bx = z.x + 18 + rng() * (z.w - 36), by = z.y + 18 + rng() * (z.h - 36);
            s.position.set(bx, by); s.scale.set(isPuff ? 0.8 + rng() * 0.9 : 0.5 + rng() * 0.8); s.alpha = isPuff ? 0.5 + rng() * 0.3 : 0.6 + rng() * 0.3;
            this.foam.addChild(s);
            this.puffs.push({ s, bx, by, vx: 0, vy: 0, ph: rng() * Math.PI * 2 });
        }

        // ── fx layer (drips, jets) above foam, below roof ──
        this.fx = new PIXI.Graphics(); this.fx.zIndex = 98100; world.addChild(this.fx);

        // ── roof (baked corrugated sheet) + hanging sign over the W entry, both ride the parallax ──
        this.roof = new PIXI.Container(); this.roof.position.set(R.x, R.y); this.roof.zIndex = 99000; world.addChild(this.roof);
        bakeCanvas(this.roof, 'foam_roof', R.w, R.h, { l: 6, t: 6, r: 6, b: 6 }, c => FoamStation.drawRoof(c, R.w, R.h)).alpha = 0.88; // Czytelnosc: the tank under the canopy stays visible
        this.sign = new PIXI.Container(); this.sign.position.set(R.x - 4, z.y + z.h / 2); this.sign.zIndex = 99010; world.addChild(this.sign);
        bakeCanvas(this.sign, 'foam_sign', 36, 70, { l: 30, t: 40, r: 20, b: 20 }, c => FoamStation.drawSign(c));
    }

    public getCollisionRects(): ICollidable[] { return this.solids; }

    public isPointInside(px: number, py: number): boolean {
        const z = this.zone; return px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
    }

    /** VIEW loop: parallax, brushes, foam wakes from the local tank, drips / ripples, entry burst. */
    public update(camX: number, camY: number, viewW: number, viewH: number, tank: { x: number; y: number } | null): void {
        const R = this.roofRect;
        const vis = isBoxInView(R.x - 40, R.y - ROOF_H - 40, R.w + 80, R.h + ROOF_H + 80, camX, camY, viewW, viewH);
        this.ground.renderable = vis; this.groundFx.renderable = vis; this.roof.renderable = vis; this.sign.renderable = vis; this.foam.renderable = vis; this.fx.renderable = vis;
        for (const p of this.posts) p.renderable = vis;
        for (const b of this.brushes) b.renderable = vis;
        if (!vis) { this.lastMs = 0; return; }
        const now = performance.now(); // visual only
        const dt = this.lastMs ? Math.min(3, (now - this.lastMs) / 16.667) : 1; this.lastMs = now;
        this.t += dt / 60;

        // parallax: roof + sign at ROOF_H, posts lean, brushes hang at half height
        let ox = 0, oy = 0;
        if (isJunkyardParallaxEnabled()) { const o = parallaxOffset(R.x + R.w / 2, R.y + R.h / 2, ROOF_H, camX, camY, viewW, viewH); ox = o.ox; oy = o.oy; }
        this.roof.position.set(R.x + ox, R.y + oy);
        this.sign.position.set(R.x - 4 + ox, this.zone.y + this.zone.h / 2 + oy);
        for (const p of this.posts) leanSprite(p, ROOF_H, ox, oy);

        // tank inside: brushes spin fast, foam gets pushed, one-shot jet burst on entry
        const inside = !!tank && this.isPointInside(tank.x, tank.y);
        if (inside && !this.wasInside) this.enterFlash = 1;
        this.wasInside = inside;
        this.spin += (inside ? 0.22 : 0.05) * dt;
        for (let i = 0; i < this.brushes.length; i++) {
            const b = this.brushes[i], base = this.brushBase[i];
            b.rotation = this.spin * (i === 0 ? 1 : -1);
            const wob = inside ? Math.sin(this.t * 40 + i) * 1.5 : 0;
            b.position.set(base.x + ox * 0.5 + wob, base.y + oy * 0.5);
            b.scale.set(1 + (inside ? 0.06 : 0));
        }
        if (tank) this.pushFoam(tank.x, tank.y);
        const z = this.zone;
        for (const p of this.puffs) {
            p.vx *= 0.9; p.vy *= 0.9;
            p.bx += p.vx * 0.05; p.by += p.vy * 0.05;
            if (p.bx < z.x + 12) p.bx = z.x + 12; else if (p.bx > z.x + z.w - 12) p.bx = z.x + z.w - 12;
            if (p.by < z.y + 12) p.by = z.y + 12; else if (p.by > z.y + z.h - 12) p.by = z.y + z.h - 12;
            p.s.x = p.bx + Math.sin(this.t * 0.7 + p.ph) * 6 + p.vx;
            p.s.y = p.by + Math.cos(this.t * 0.5 + p.ph) * 4 + p.vy;
            p.s.alpha = 0.45 + Math.sin(this.t * 1.3 + p.ph) * 0.2 + (inside ? 0.15 : 0);
        }

        // fx: drips from the leaking hose -> ripples in the oil puddle; jet burst
        const g = this.fx; g.clear();
        if (--this.dripCd <= 0) { this.dripCd = 50 + Math.floor(Math.abs(Math.sin(this.t * 7.3)) * 40); this.drips.push({ x: this.leakX, y: this.leakY, vy: 0.6 }); }
        for (let i = this.drips.length - 1; i >= 0; i--) {
            const d = this.drips[i]; d.vy += 0.18 * dt; d.y += d.vy * dt;
            if (d.y >= this.oilY - 2) { this.ripples.push({ x: d.x + (this.oilX - d.x) * 0.1, y: this.oilY, age: 0 }); this.drips.splice(i, 1); continue; }
            g.beginFill(0xbfefff, 0.9); g.drawCircle(d.x, d.y, 2); g.endFill();
        }
        if (this.enterFlash > 0) {
            this.enterFlash -= 0.06 * dt;
            const a = Math.max(0, this.enterFlash);
            for (let i = 0; i < this.brushes.length; i++) {
                const b = this.brushes[i];
                for (let k = 0; k < 7; k++) {
                    const ang = this.spin * 3 + k * (Math.PI * 2 / 7);
                    const len = BRUSH_R + 10 + (1 - a) * 46;
                    g.lineStyle(2.5 - (1 - a) * 1.5, 0xe6fbff, a * 0.9);
                    g.moveTo(b.x + Math.cos(ang) * BRUSH_R, b.y + Math.sin(ang) * BRUSH_R * 0.8);
                    g.lineTo(b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len * 0.8);
                }
            }
            g.lineStyle(0);
        }
        const fg = this.groundFx; fg.clear();
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i]; r.age += dt;
            if (r.age >= 36) { this.ripples.splice(i, 1); continue; }
            const k = r.age / 36, rad = 4 + k * 24;
            fg.lineStyle(1.6, 0x9ae6ff, (1 - k) * 0.5); fg.drawEllipse(r.x, r.y, rad, rad * 0.5);
            fg.lineStyle(1, 0xff8ad0, (1 - k) * 0.3); fg.drawEllipse(r.x, r.y, rad * 0.65, rad * 0.32);
        }
        fg.lineStyle(0);
    }

    private pushFoam(tx: number, ty: number): void {
        const z = this.zone;
        if (tx < z.x - 50 || tx > z.x + z.w + 50 || ty < z.y - 50 || ty > z.y + z.h + 50) return;
        const RAD = 70, F = 2.6;
        for (const p of this.puffs) {
            const dx = p.s.x - tx, dy = p.s.y - ty, d2 = dx * dx + dy * dy;
            if (d2 > RAD * RAD || d2 < 0.01) continue;
            const d = Math.sqrt(d2), k = 1 - d / RAD;
            p.vx += dx / d * F * k; p.vy += dy / d * F * k;
        }
    }

    public destroy(): void {
        this.ground.destroy({ children: true }); this.groundFx.destroy(); this.roof.destroy({ children: true }); this.sign.destroy({ children: true });
        this.foam.destroy({ children: true }); this.fx.destroy();
        for (const p of this.posts) p.destroy({ children: true });
        for (const b of this.brushes) b.destroy();
        void this.world;
    }

    // ── art (Canvas 2D, baked once) ─────────────────────────────────────────────────────────
    private drawGround(c: CanvasRenderingContext2D, z: { x: number; y: number; w: number; h: number }): void {
        const R = this.roofRect, rng = propRng(z.x, z.y, 5);
        const lx = z.x - R.x, ly = z.y - R.y; // zone in roof-local coords
        // slab + outline
        const sg = c.createLinearGradient(0, 0, R.w, R.h); sg.addColorStop(0, '#9b9fa4'); sg.addColorStop(0.5, '#878c92'); sg.addColorStop(1, '#6d7278');
        c.fillStyle = sg; roundRect(c, 0, 0, R.w, R.h, 14); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2; c.stroke();
        // expansion joints + cracks
        c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1.5;
        for (let gx = 60; gx < R.w; gx += 95) { c.beginPath(); c.moveTo(gx, 4); c.lineTo(gx, R.h - 4); c.stroke(); }
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
        for (let i = 0; i < 6; i++) { let x = rng() * R.w, y = rng() * R.h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); }
        // wet sheen inside the wash zone
        const wg = c.createLinearGradient(lx, ly, lx + z.w, ly + z.h); wg.addColorStop(0, 'rgba(255,255,255,0.22)'); wg.addColorStop(0.5, 'rgba(160,220,235,0.18)'); wg.addColorStop(1, 'rgba(255,255,255,0.10)');
        c.fillStyle = wg; roundRect(c, lx, ly, z.w, z.h, 10); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.16)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.ellipse(lx + rng() * z.w, ly + rng() * z.h, 16 + rng() * 34, 3 + rng() * 5, 0, 0, Math.PI * 2); c.fill(); }
        // drain channel with grate along the zone centre
        const dy = ly + z.h / 2;
        const dg = c.createLinearGradient(0, dy - 7, 0, dy + 7); dg.addColorStop(0, '#5a6066'); dg.addColorStop(0.5, '#23272b'); dg.addColorStop(1, '#5a6066');
        c.fillStyle = dg; c.fillRect(lx, dy - 7, z.w, 14);
        c.fillStyle = '#15181b'; for (let gx = lx + 12; gx < lx + z.w - 20; gx += 34) c.fillRect(gx, dy - 4, 22, 8);
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(lx, dy - 8, z.w, 1.5);
        // worn lane arrows (W entry -> E exit)
        c.fillStyle = css(JUNKYARD_HEX.hazardY, 0.6);
        for (const ax of [lx + 14, lx + z.w - 40]) { c.beginPath(); c.moveTo(ax, dy - 30); c.lineTo(ax + 26, dy - 14); c.lineTo(ax, dy + 2 - 14); c.closePath(); c.fill(); }
        // oil puddle (rainbow sheen) where the hose leaks
        const ox = this.oilX - R.x, oy = this.oilY - R.y;
        c.fillStyle = 'rgba(16,14,22,0.85)'; c.beginPath(); c.ellipse(ox, oy, 46, 22, 0, 0, Math.PI * 2); c.fill();
        const sheen = ['#39ff8a', '#33d0ff', '#9a6aff', '#ff5ad0', '#ffe04a'];
        sheen.forEach((col, i) => { c.globalAlpha = 0.16 - i * 0.02; c.fillStyle = col; c.beginPath(); c.ellipse(ox + (rng() - 0.5) * 8, oy + (rng() - 0.5) * 6, 42 - i * 7, 20 - i * 3.5, 0, 0, Math.PI * 2); c.fill(); });
        c.globalAlpha = 1;
        c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.ellipse(ox - 12, oy - 7, 12, 5, 0, 0, Math.PI * 2); c.fill();
        // hose from the unit to the leak point + the drain
        c.strokeStyle = '#2b2f33'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(this.leakX - R.x, this.leakY - R.y - 4); c.quadraticCurveTo(this.leakX - R.x + 30, ly + 30, lx + z.w - 30, dy - 8); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5; c.stroke();
        // roof shadow glued to the slab (the roof floats with parallax, the shadow does not)
        softShadow(c, 8, 8, R.w - 16, R.h - 16, ROOF_H, 0.30);
        // posts' AO
        c.fillStyle = 'rgba(0,0,0,0.3)';
        for (const [px, py] of [[lx - POST / 2, ly - POST / 2], [lx + z.w + POST / 2, ly - POST / 2], [lx - POST / 2, ly + z.h + POST / 2], [lx + z.w + POST / 2, ly + z.h + POST / 2]]) { c.beginPath(); c.ellipse(px + 3, py + 3, 22, 12, 0, 0, Math.PI * 2); c.fill(); }
    }

    private static drawPost(c: CanvasRenderingContext2D): void {
        // steel box post seen standing: local (0,0) = foot centre; body spans y -ROOF_H..0
        const w = POST, x0 = -w / 2;
        const g = c.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, '#3a3f45'); g.addColorStop(0.18, '#6f767e'); g.addColorStop(0.22, '#c9d0d6'); g.addColorStop(0.4, '#8a9199'); g.addColorStop(1, '#2b2f34');
        c.fillStyle = g; c.fillRect(x0, -ROOF_H, w, ROOF_H);
        // rust streaks + rivets
        c.fillStyle = 'rgba(140,70,25,0.45)'; for (let i = 0; i < 4; i++) c.fillRect(x0 + 4 + i * 6, -ROOF_H + 30 + i * 9, 2, 22 + i * 6);
        c.fillStyle = '#1d2024'; for (let y = -ROOF_H + 12; y < -30; y += 16) { c.beginPath(); c.arc(x0 + 5, y, 1.6, 0, Math.PI * 2); c.arc(x0 + w - 5, y, 1.6, 0, Math.PI * 2); c.fill(); }
        // vertical tone: lit under the roof edge, sooty at the foot
        const v = c.createLinearGradient(0, -ROOF_H, 0, 0); v.addColorStop(0, 'rgba(255,255,255,0.14)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)');
        c.fillStyle = v; c.fillRect(x0, -ROOF_H, w, ROOF_H);
        // hazard wrap at the foot AND under the cap (REV 9c) + base plate
        hazard(c, x0, -26, w, 18, 9); hazard(c, x0, -ROOF_H + 10, w, 12, 9);
        c.fillStyle = '#4a5058'; c.fillRect(x0 - 4, -8, w + 8, 8); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x0 - 4, -8, w + 8, 1.5);
        // cap bracket at the top
        c.fillStyle = '#5a6068'; c.fillRect(x0 - 3, -ROOF_H - 6, w + 6, 8); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x0 - 3, -ROOF_H - 6, w + 6, 1.5);
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.2; c.strokeRect(x0, -ROOF_H, w, ROOF_H);
    }

    private static drawRoof(c: CanvasRenderingContext2D, w: number, h: number): void {
        // corrugated rusty sheets, patched from different scrap panels; ridges run N-S
        const panels = ['#8d4f2c', '#9c5a33', '#7c4a2a', '#a7673a'];
        const pw = w / 4;
        for (let i = 0; i < 4; i++) {
            const pg = c.createLinearGradient(i * pw, 0, i * pw, h); pg.addColorStop(0, panels[i]); pg.addColorStop(1, '#4a2816');
            c.fillStyle = pg; c.fillRect(i * pw, 0, pw + 1, h);
        }
        for (let x = 0; x < w; x += 10) { const rg = c.createLinearGradient(x, 0, x + 10, 0); rg.addColorStop(0, 'rgba(0,0,0,0.3)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.18)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.1)'); rg.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = rg; c.fillRect(x, 0, 10, h); }
        // rust blooms + bolts along panel seams
        const rng = propRng(7, 11, 3);
        c.fillStyle = 'rgba(70,30,10,0.22)'; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(rng() * w, rng() * h, 8 + rng() * 18, 5 + rng() * 10, rng() * 3, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#2a2320'; for (let i = 1; i < 4; i++) for (let y = 12; y < h; y += 28) { c.beginPath(); c.arc(i * pw, y, 2, 0, Math.PI * 2); c.fill(); }
        // rim: light N/W edges, dark S/E edges (thickness of the sheet)
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, h); c.lineTo(0, 0); c.lineTo(w, 0); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 3; c.beginPath(); c.moveTo(w, 0); c.lineTo(w, h); c.lineTo(0, h); c.stroke();
        // foam-cyan + pink paint stripe across the W edge (the station's colour code)
        c.fillStyle = css(JUNKYARD_HEX.foam, 0.9); c.fillRect(0, 0, 14, h); c.fillStyle = '#ff7fb0'; c.fillRect(14, 0, 6, h);
        // the middle sheets are TORN OFF (scrapyard): a ragged hole over the wash lane -> brushes, suds and the tank
        // stay visible under the canopy (Czytelnosc > roof). Torn edge: bright lip + dark underside.
        // REV 9c (Mariusz: more juice, open the roof a bit more): bigger tear, diagonal sun gradient over the sheets,
        // steel corner gussets with hazard tape. Hole drawn after the gradient; gussets are drawn last (over everything).
        const sun = c.createLinearGradient(0, 0, w, h); sun.addColorStop(0, 'rgba(255,230,190,0.28)'); sun.addColorStop(0.45, 'rgba(255,255,255,0)'); sun.addColorStop(1, 'rgba(20,8,0,0.38)');
        c.fillStyle = sun; c.fillRect(0, 0, w, h);
        const hx0 = w * 0.12, hx1 = w * 0.93, hy0 = h * 0.13, hy1 = h * 0.88;
        const pts: Array<[number, number]> = [];
        const jag = (x: number, y: number, i: number) => pts.push([x + Math.sin(i * 2.3) * 6, y + Math.cos(i * 1.7) * 6]);
        for (let i = 0; i <= 8; i++) jag(hx0 + (hx1 - hx0) * i / 8, hy0, i);
        for (let i = 1; i <= 5; i++) jag(hx1, hy0 + (hy1 - hy0) * i / 5, i + 9);
        for (let i = 1; i <= 8; i++) jag(hx1 - (hx1 - hx0) * i / 8, hy1, i + 15);
        for (let i = 1; i < 5; i++) jag(hx0, hy1 - (hy1 - hy0) * i / 5, i + 24);
        const hole = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts) c.lineTo(x, y); c.closePath(); };
        c.save(); c.globalCompositeOperation = 'destination-out'; hole(); c.fillStyle = '#000'; c.fill(); c.restore();
        hole(); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.stroke();
        c.save(); hole(); c.clip(); c.strokeStyle = 'rgba(0,0,0,0.0)'; c.restore();
        // dark underside lip just outside the hole (sheet thickness)
        c.save(); hole(); c.clip(); c.restore();
        c.strokeStyle = 'rgba(40,20,8,0.7)'; c.lineWidth = 5; c.save(); c.translate(2, 3); hole(); c.restore(); c.stroke();
        c.save(); c.globalCompositeOperation = 'destination-out'; hole(); c.fillStyle = '#000'; c.fill(); c.restore();
        // cross beams of the frame left exposed over the hole (two steel rafters)
        for (const rx of [w * 0.42, w * 0.66]) { const rg = c.createLinearGradient(rx - 5, 0, rx + 5, 0); rg.addColorStop(0, '#2b2f33'); rg.addColorStop(0.3, '#9aa3ab'); rg.addColorStop(0.5, '#5a6068'); rg.addColorStop(1, '#1d2024'); c.fillStyle = rg; c.fillRect(rx - 5, hy0 - 4, 10, hy1 - hy0 + 8); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(rx - 5, hy0 - 4, 10, 1.5); }
        // CORNER GUSSETS: steel plates bolted over the post caps, diagonal hazard tape band, bevelled edge, soft shadow on the sheet
        const G = 34;
        for (const [gx, gy] of [[0, 0], [w - G, 0], [0, h - G], [w - G, h - G]]) {
            c.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(c, gx + 3, gy + 4, G, G, 4); c.fill();
            const pg = c.createLinearGradient(gx, gy, gx + G, gy + G); pg.addColorStop(0, '#c3c9cf'); pg.addColorStop(0.5, '#7a8189'); pg.addColorStop(1, '#3c4147');
            c.fillStyle = pg; roundRect(c, gx, gy, G, G, 4); c.fill();
            c.save(); roundRect(c, gx, gy, G, G, 4); c.clip();
            c.translate(gx + G / 2, gy + G / 2); c.rotate(-Math.PI / 4); hazard(c, -G, -7, G * 2, 14, 7); c.restore();
            c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx + 1, gy + G - 1); c.lineTo(gx + 1, gy + 1); c.lineTo(gx + G - 1, gy + 1); c.stroke();
            c.strokeStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.moveTo(gx + G - 1, gy + 1); c.lineTo(gx + G - 1, gy + G - 1); c.lineTo(gx + 1, gy + G - 1); c.stroke();
            for (const [bx, by] of [[gx + 6, gy + 6], [gx + G - 6, gy + 6], [gx + 6, gy + G - 6], [gx + G - 6, gy + G - 6]]) {
                c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(bx + 0.8, by + 1, 2.4, 0, Math.PI * 2); c.fill();
                const bg = c.createRadialGradient(bx - 0.8, by - 0.8, 0.4, bx, by, 2.4); bg.addColorStop(0, '#fff'); bg.addColorStop(0.5, '#aab1b8'); bg.addColorStop(1, '#3c4147');
                c.fillStyle = bg; c.beginPath(); c.arc(bx, by, 2.4, 0, Math.PI * 2); c.fill();
            }
        }
        // hazard tape along the N and S roof edges between the gussets (the roof's safety rim)
        hazard(c, G, 0, w - 2 * G, 7, 8); hazard(c, G, h - 7, w - 2 * G, 7, 8);
    }

    private static drawSign(c: CanvasRenderingContext2D): void {
        // hanging painted board under the roof edge at the W entry: foam-cyan with pink band + bubbles, chain links
        c.strokeStyle = '#2a2d31'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, -36); c.lineTo(6, -2); c.moveTo(30, -36); c.lineTo(30, -2); c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, 3, 3, 36, 70, 5); c.fill();
        const bg = c.createLinearGradient(0, 0, 0, 70); bg.addColorStop(0, '#9ff0f3'); bg.addColorStop(0.5, css(JUNKYARD_HEX.foam)); bg.addColorStop(1, '#2d8d93');
        c.fillStyle = bg; roundRect(c, 0, 0, 36, 70, 5); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#ff7fb0'; c.fillRect(0, 26, 36, 8);
        c.fillStyle = 'rgba(255,255,255,0.9)'; for (const [x, y, r] of [[12, 14, 6], [24, 10, 4], [18, 50, 7], [28, 60, 3.5]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(2, 2, 32, 2);
    }

    private static drawUnit(c: CanvasRenderingContext2D, w: number, h: number): void {
        // yellow pressure-washer unit: box with hazard base, round gauge, hose reel, exhaust stub
        const RISE = 40;
        softShadow(c, 0, 0, w, h, RISE, 0.4);
        const sg = c.createLinearGradient(0, h - RISE, 0, h); sg.addColorStop(0, '#d9a512'); sg.addColorStop(1, '#6b4e05');
        c.fillStyle = sg; c.fillRect(0, h - RISE, w, RISE); // S face
        hazard(c, 0, h - 12, w, 12, 10);
        const tg = c.createLinearGradient(0, -RISE, w, h - RISE); tg.addColorStop(0, '#ffd84a'); tg.addColorStop(0.5, '#f2c230'); tg.addColorStop(1, '#b8860b');
        c.fillStyle = tg; roundRect(c, 0, -RISE, w, h, 3); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(2, -RISE + 1, w - 4, 2);
        // gauge on the S face
        const gx = 16, gy = h - RISE / 2;
        c.fillStyle = '#1b1e22'; c.beginPath(); c.arc(gx, gy, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#eef2f5'; c.beginPath(); c.arc(gx, gy, 7, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#e63b2e'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 4.5, gy - 3.5); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; for (let a = -2.4; a <= -0.7; a += 0.42) { c.beginPath(); c.moveTo(gx + Math.cos(a) * 5, gy + Math.sin(a) * 5); c.lineTo(gx + Math.cos(a) * 6.5, gy + Math.sin(a) * 6.5); c.stroke(); }
        // hose reel on top
        const rg = c.createRadialGradient(w - 20, -RISE + 14, 2, w - 20, -RISE + 14, 12); rg.addColorStop(0, '#4a5058'); rg.addColorStop(1, '#1d2024');
        c.fillStyle = rg; c.beginPath(); c.arc(w - 20, -RISE + 14, 12, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2b2f33'; c.lineWidth = 3; c.beginPath(); c.arc(w - 20, -RISE + 14, 8, 0, Math.PI * 2); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1; c.stroke();
        // exhaust stub + louvre vents
        c.fillStyle = '#2b2f33'; c.fillRect(8, -RISE - 10, 6, 12); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(8, -RISE - 10, 6, 1.5);
        c.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = -RISE + 8; y < -6; y += 5) c.fillRect(24, y, 22, 2);
        // leaking joint (drips spawn below the unit's right corner)
        c.fillStyle = '#2b2f33'; c.fillRect(w - 10, h - 6, 6, 8);
    }

    private static drawBrush(c: CanvasRenderingContext2D): void {
        // spinning brush head seen from above: bristle disc with radial stripes, suds rim, chrome hub
        const r = BRUSH_R, cx = r, cy = r;
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(cx + 4, cy + 6, r, r * 0.9, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(cx, cy, r + 5, 0, Math.PI * 2); c.fill(); // suds rim
        const bg = c.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, r); bg.addColorStop(0, '#8fe0f4'); bg.addColorStop(0.6, '#3d8fb8'); bg.addColorStop(1, '#1d4f6e');
        c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
        for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; c.strokeStyle = i % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.3)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); c.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2)); c.stroke(); }
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
        const hg = c.createLinearGradient(cx - 8, 0, cx + 8, 0); hg.addColorStop(0, '#2b2f34'); hg.addColorStop(0.2, '#ffffff'); hg.addColorStop(0.5, '#9aa3ab'); hg.addColorStop(1, '#2b2f34');
        c.fillStyle = hg; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#15181b'; c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
    }

    private static drawPuff(c: CanvasRenderingContext2D): void {
        const r = 22;
        const g = c.createRadialGradient(r - 5, r - 6, 2, r, r, r); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.45, 'rgba(236,250,252,0.7)'); g.addColorStop(0.8, 'rgba(150,225,232,0.3)'); g.addColorStop(1, 'rgba(150,225,232,0)');
        c.fillStyle = g;
        for (const [x, y, k] of [[r, r, 1], [r - 9, r + 4, 0.7], [r + 9, r + 3, 0.65], [r + 2, r - 9, 0.6]]) { c.beginPath(); c.arc(x, y, r * k, 0, Math.PI * 2); c.fill(); }
    }

    private static drawBubble(c: CanvasRenderingContext2D): void {
        const r = 12;
        const g = c.createRadialGradient(r - 3, r - 4, 1, r, r, r); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(210,245,250,0.7)'); g.addColorStop(0.8, 'rgba(95,211,217,0.45)'); g.addColorStop(1, 'rgba(95,211,217,0)');
        c.fillStyle = g; c.beginPath(); c.arc(r, r, r, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(r, r, r - 1.5, 0, Math.PI * 2); c.stroke();
    }
}
