import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { BeltTuning } from '../../config/junkyardRules';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT } from '../JunkyardMap';
import { simNowMs } from '../../systems/SimClock';
import { isPointInView } from '../cullGate';
import { bakeCanvas, block, css, cylinder, darken, hazard, lighten, parallaxBlock, parallaxOffset, roundRect, softShadow, staticRect } from './junkyardBake';
import type { ParallaxBlock } from './junkyardBake';
import { isJunkyardParallaxEnabled } from '../../config/junkyardFlag';

/**
 * ConveyorBelt — Tasmociag + Kruszarka (ZLOMOWISKO J5; art REV 5).
 *
 * The belt (E of the press, joined to its exit ramp) is PASSABLE and carries whatever stands on it eastwards,
 * at a fixed number of px per logic step: tanks, regular enemies, pickups (gems / hearts / magnets / power
 * cubes). The boss is too heavy (decision: the belt never moves a boss). At the E end sits the Kruszarka
 * (solid): a regular enemy carried into the mouth is destroyed (no score — machines do not play for the
 * player), the player loses tune.playerDmgPct of max HP and is SPAT back west (knockback along the belt);
 * pickups stop at the mouth (a little pile of loot you have to risk for).
 *
 * Readability: the band visibly runs (TilingSprite, tilePosition from the sim clock), yellow arrows show
 * the direction, the chrome jaws chomp in a slow idle rhythm and snap fast for 0.5 s on a crush, red beacon.
 * All sim state (positions) changes in update() = fixed logic step; the band / teeth motion is visual.
 *
 * REV 9 (Mariusz' sketch): the MOUTH is a rectangular opening ON THE VERTICAL W WALL of the crusher cuboid — the wall the
 * belt runs into. parallaxBlock keeps that wall revealed at least MOUTH_DEPTH px (the roof shifts with it) and shears it
 * with the camera, so the jaws (children of the wall) chomp inside a real doorway. Roof = fan + chimney smoke (only in view).
 */
export interface Carriable { x: number; y: number; }
export interface BeltHooks {
    getEnemies: () => Enemy[];
    getPlayers: () => Player[];
    /** Pickups the belt may move; the callback applies the shift (entity + its sprite). */
    forEachPickup: (fn: (p: Carriable, setX: (x: number) => void) => void) => void;
    /** Crush a regular enemy outright (kill path in main.ts; returns true if it died). */
    crushEnemy: (e: Enemy) => boolean;
    /** Player spat out: damage + knockback west along the belt. */
    spitPlayer: (index: number, amount: number, dirX: number, dirY: number, distance: number) => void;
    notify: (key: 'ate' | 'spatYou') => void;
}

const TILE_W = 72;
const MOUTH_DEPTH = 34;    // px in front of the crusher W face where things get eaten (sim)
const WALL_MIN_REVEAL = 56; // the W wall (with the mouth) is always shown at least this wide (art only)
const CRUSHER_RISE = 100;
const TEETH_N = 6;          // teeth per jaw (18 x 22 px) along the wall (N-S)
const TOOTH_W = 18, TOOTH_H = 22;
const MOUTH_UP = 84;        // mouth height on the W wall (px above ground; wall is CRUSHER_RISE tall)
const JAW_LEN = TEETH_N * TOOTH_W + 8, JAW_THK = TOOTH_H + 8;
const CH_X = 104, CH_BASE = 118, CH_H = 56; // chimney: roof-local x, base y (from the roof's top edge), stack height
let _bandTex: PIXI.Texture | null = null;

function bandTexture(h: number): PIXI.Texture {
    if (_bandTex) return _bandTex;
    const cv = document.createElement('canvas');
    cv.width = TILE_W; cv.height = h;
    const c = cv.getContext('2d')!;
    // rubber: darker at the rails, lighter in the middle (art dir REV 6)
    const rg = c.createLinearGradient(0, 0, 0, h); rg.addColorStop(0, '#1c1c1c'); rg.addColorStop(0.18, '#3a3a3a'); rg.addColorStop(0.5, '#4a4a4a'); rg.addColorStop(0.82, '#363636'); rg.addColorStop(1, '#181818');
    c.fillStyle = rg; c.fillRect(0, 0, TILE_W, h);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, 4, h);
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(4, 0, 2, h);
    // chevron with a fake bevel: dark drop (+1,+1), orange base (+0,+1), yellow top, 1 px light rim on top
    const ax = 18;
    const chevron = (dx: number, dy: number) => { c.beginPath(); c.moveTo(ax + dx, h / 2 - 28 + dy); c.lineTo(ax + 30 + dx, h / 2 - 6 + dy); c.lineTo(ax + dx, h / 2 + 16 + dy); c.lineTo(ax + 10 + dx, h / 2 - 6 + dy); c.closePath(); c.fill(); };
    c.fillStyle = '#1a1200'; chevron(2, 2);
    c.fillStyle = '#d8860f'; chevron(0, 1.5);
    const ag = c.createLinearGradient(ax, h / 2 - 28, ax + 30, h / 2 + 16); ag.addColorStop(0, '#ffd45a'); ag.addColorStop(1, css(JUNKYARD_HEX.hazardY));
    c.fillStyle = ag; chevron(0, 0);
    c.strokeStyle = 'rgba(255,243,176,0.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(ax, h / 2 - 28); c.lineTo(ax + 30, h / 2 - 6); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(54, h * 0.7, 9, 4, 0.4, 0, Math.PI * 2); c.fill();
    _bandTex = PIXI.Texture.from(cv);
    return _bandTex;
}

export class ConveyorBelt {
    private solids: ICollidable[] = [];
    private band: PIXI.TilingSprite;
    private teethTop: PIXI.Sprite;
    private teethBot: PIXI.Sprite;
    private beacon: PIXI.Graphics;
    private fan: PIXI.Sprite;
    private crusherPx: ParallaxBlock;
    private snapUntil = 0;
    private lastSmokeAt = 0;
    private spitCooldown: number[] = [];
    private readonly belt = JUNKYARD_LAYOUT.belt;
    private readonly crusher = JUNKYARD_LAYOUT.crusher;
    private eaten = 0;

    constructor(world: PIXI.Container, private effects: EffectsManager, private audio: AudioSys,
        private tune: BeltTuning, private hooks: BeltHooks, private hazardsOn: boolean) {
        const b = this.belt, cr = this.crusher;
        this.solids.push(staticRect(cr.x, cr.y, cr.w, cr.h));
        // ── belt frame (static) ──
        const frame = new PIXI.Container(); frame.position.set(b.x, b.y); frame.zIndex = 4; world.addChild(frame);
        bakeCanvas(frame, 'belt_frame', b.w, b.h, { l: 24, t: 24, r: 24, b: 28 }, c => {
            softShadow(c, -8, -10, b.w + 16, b.h + 20, 8, 0.35);
            block(c, -8, -10, b.w + 16, b.h + 20, 8, { top: JUNKYARD_HEX.steelDark, side: darken(JUNKYARD_HEX.steelDark, 0.7), noAO: true });
            cylinder(c, -8, -10, 14, b.h + 20, JUNKYARD_HEX.steel); cylinder(c, b.w - 6, -10, 14, b.h + 20, JUNKYARD_HEX.steel);
            // side rails (art dir REV 6): N rail = narrow lit edge; S rail = lit top + 8 px dark side wall + AO on the rubber
            const railN = c.createLinearGradient(0, -14, 0, -6); railN.addColorStop(0, '#c9d0d6'); railN.addColorStop(0.3, '#8a9099'); railN.addColorStop(1, '#3c4147');
            c.fillStyle = railN; c.fillRect(-8, -14, b.w + 16, 8); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-8, -14, b.w + 16, 2);
            const railS = c.createLinearGradient(0, b.h - 2, 0, b.h + 14); railS.addColorStop(0, '#dfe4e8'); railS.addColorStop(0.15, '#8a9099'); railS.addColorStop(0.4, '#4a5058'); railS.addColorStop(1, '#1d2024');
            c.fillStyle = railS; c.fillRect(-8, b.h - 2, b.w + 16, 16); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-8, b.h - 2, b.w + 16, 2);
            c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(-8, b.h + 14, b.w + 16, 2);
            // idler rollers under the band every 120 px (visible as dark bars between slats)
            for (let rx = 60; rx < b.w - 30; rx += 120) cylinder(c, rx, -10, 10, b.h + 20, darken(JUNKYARD_HEX.steel, 0.8));
        });
        // ── running band (TilingSprite; tilePosition driven by the sim clock) ──
        this.band = new PIXI.TilingSprite(bandTexture(b.h), b.w, b.h);
        this.band.position.set(b.x, b.y - 8); this.band.zIndex = 5; world.addChild(this.band);
        // ── crusher: ground (shadow) + S face (baked gradient, sheared) + W WALL with the mouth (always revealed) + roof ──
        const body = new PIXI.Container(); body.position.set(cr.x, cr.y); body.zIndex = cr.y + cr.h; world.addChild(body);
        this.crusherPx = parallaxBlock(body, 'crusher', cr.w, cr.h, CRUSHER_RISE, { top: JUNKYARD_HEX.steel, side: JUNKYARD_HEX.steelDark },
            { l: 70, t: CRUSHER_RISE + 70, r: 70, b: 40 }, c => { c.fillStyle = 'rgba(0,0,0,0.28)'; roundRect(c, -6, 4, cr.w + 14, cr.h + 6, 8); c.fill(); }, c => this.drawCrusherTop(c, cr.w, cr.h), c => this.drawCrusherSide(c, cr.w),
            { west: { unit: CRUSHER_RISE, minReveal: WALL_MIN_REVEAL, draw: c => this.drawWestWall(c, cr.h) } });
        // jaws live ON the W wall (local x = height above ground, y = along the wall): rotated so the teeth run N-S.
        // top jaw: gum at the mouth's top edge, teeth pointing DOWN (towards x = 0); bottom jaw: gum on the floor, teeth UP.
        this.teethTop = bakeCanvas(this.crusherPx.west, 'crusher_jaw_top', JAW_LEN, JAW_THK, { l: 0, t: 0, r: 0, b: 0 }, c => ConveyorBelt.drawJaw(c, true));
        this.teethBot = bakeCanvas(this.crusherPx.west, 'crusher_jaw_bot', JAW_LEN, JAW_THK, { l: 0, t: 0, r: 0, b: 0 }, c => ConveyorBelt.drawJaw(c, false));
        // sprite local: x along the jaw (0..JAW_LEN), y across (0..JAW_THK). Rotation +90deg maps sprite x -> wall y, sprite y -> wall -x.
        for (const t of [this.teethTop, this.teethBot]) { t.anchor.set(0, 0); t.rotation = Math.PI / 2; }
        this.applyJaws(0);
        // roof: fan (rotates) + beacon (blinks)
        this.fan = bakeCanvas(this.crusherPx.top, 'crusher_fan', 0, 0, { l: 22, t: 22, r: 22, b: 22 }, c => {
            for (let i = 0; i < 4; i++) {
                c.save(); c.rotate(i * Math.PI / 2);
                const g = c.createLinearGradient(-4, 0, 14, 0); g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.45, '#aab1b8'); g.addColorStop(0.5, '#5e656d'); g.addColorStop(1, '#2f343a'); // asymmetric: one edge lit
                c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(14, -10, 6, -20); c.quadraticCurveTo(-4, -16, 0, 0); c.closePath(); c.fill();
                c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-4, -16, 6, -20); c.stroke();
                c.restore();
            }
            c.fillStyle = '#2f343a'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
        });
        this.fan.anchor.set(0.5); this.fan.position.set(cr.w * 0.36, -CRUSHER_RISE + 54);
        this.beacon = new PIXI.Graphics(); this.beacon.position.set(cr.w / 2, -CRUSHER_RISE - 12); this.crusherPx.top.addChild(this.beacon);
        this.applyVisual(simNowMs());
    }

    public getCollisionRects(): ICollidable[] { return this.solids; }
    public get eatenCount(): number { return this.eaten; }
    public isOnBelt(x: number, y: number): boolean {
        const b = this.belt; return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }
    private inMouth(x: number, y: number): boolean {
        const b = this.belt; return x >= this.crusher.x - MOUTH_DEPTH && y >= b.y && y <= b.y + b.h;
    }

    /** Fixed logic step (host). */
    public update(): void {
        const now = simNowMs();
        this.applyVisual(now);
        if (!this.hazardsOn) return;
        const dx = this.tune.speedPxPerStep;
        const stopX = this.crusher.x - MOUTH_DEPTH - 6;
        this.hooks.forEachPickup((p, setX) => {
            if (!this.isOnBelt(p.x, p.y)) return;
            setX(Math.min(stopX, p.x + dx));
        });
        for (const e of this.hooks.getEnemies()) {
            if (!e.active || e.isBoss || e.isMegaBoss || !this.isOnBelt(e.x, e.y)) continue;
            e.x += dx;
            if (this.inMouth(e.x, e.y)) this.eatEnemy(e, now);
        }
        const players = this.hooks.getPlayers();
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (!this.isOnBelt(p.x, p.y)) continue;
            p.x += dx;
            if (this.inMouth(p.x, p.y) && (this.spitCooldown[i] ?? 0) <= now) {
                this.spitCooldown[i] = now + this.tune.spitCooldownMs;
                this.snap(now, p.x, p.y);
                this.hooks.spitPlayer(i, p.maxHp * this.tune.playerDmgPct, -1, 0, this.tune.spitPx);
                this.hooks.notify('spatYou');
                this.audio.playCrusherSpit();
            }
        }
    }

    private eatEnemy(e: Enemy, now: number): void {
        this.snap(now, e.x, e.y);
        if (this.hooks.crushEnemy(e)) { this.eaten++; this.hooks.notify('ate'); }
    }

    private snap(now: number, x: number, y: number): void {
        this.snapUntil = now + 500;
        this.audio.playCrusherChomp();
        this.effects.shake(6, 8);
        this.effects.spawnPressDebris(x, y);
        this.effects.spawnTowerDeployDust(this.crusher.x - 10, y);
        this.effects.spawnRingFx(this.crusher.x - 10, y, 70, 0xe63b2e, 10);
    }

    /** Band scroll + jaws chomp + beacon, derived from the sim clock (pauses with the match). */
    private applyVisual(now: number): void {
        this.band.tilePosition.x = this.hazardsOn ? (now / 1000) * this.tune.speedPxPerStep * 60 % TILE_W : 0;
        const snapping = now < this.snapUntil;
        const k = snapping ? Math.abs(Math.sin(now / 45)) : (0.5 + 0.5 * Math.sin(now / 420));
        this.applyJaws(1 + 11 * (1 - k));
        this.beacon.clear();
        const on = snapping ? Math.sin(now / 60) > 0 : Math.sin(now / 500) > 0;
        this.beacon.beginFill(JUNKYARD_HEX.beaconRed, on ? 1 : 0.35); this.beacon.drawCircle(0, 0, snapping ? 10 : 8); this.beacon.endFill();
    }
    /** Mouth span along the W wall (wall-local y) = the belt's N..S edges. */
    private mouthY0(): number { return this.belt.y - this.crusher.y + (this.belt.h - JAW_LEN) / 2; }
    /** Place both jaws on the W wall for a given opening gap (px between the tooth tips and the mouth's mid-height).
     *  Rotated sprite: position = where sprite-local (0,0) lands; it extends +y (along the wall) and -x (sprite y axis). */
    private applyJaws(gap: number): void {
        const y0 = this.mouthY0(), mid = MOUTH_UP / 2;
        // top jaw: sprite y 0 = gum (at the top edge), y JAW_THK = tooth tips => wall x = pos - sprite y; tips at mid + gap
        this.teethTop.position.set(mid + gap + JAW_THK, y0);
        // bottom jaw: sprite y 0 = tooth tips, y JAW_THK = gum (on the floor) => tips at mid - gap
        this.teethBot.position.set(mid - gap, y0);
    }

    /** VIEW loop (not the logic step): parallax of the crusher roof, fan spin, chimney smoke (only in view). */
    public updateView(camX: number, camY: number, viewW: number, viewH: number): void {
        const cr = this.crusher;
        let ox = 0, oy = 0;
        if (isJunkyardParallaxEnabled()) { const o = parallaxOffset(cr.x + cr.w / 2, cr.y + cr.h / 2, CRUSHER_RISE, camX, camY, viewW, viewH); ox = o.ox; oy = o.oy; }
        this.crusherPx.setOffset(ox, oy);
        if (!isPointInView(cr.x + cr.w / 2, cr.y, camX, camY, viewW, viewH, 200)) return;
        const now = simNowMs();
        this.fan.rotation = (now / 1000) * (this.hazardsOn ? 9 : 2);
        if (this.hazardsOn && now - this.lastSmokeAt >= 380) {
            this.lastSmokeAt = now;
            this.effects.spawnChimneySmoke(cr.x + CH_X + ox - 4, cr.y - CRUSHER_RISE + CH_BASE - CH_H - 2 + oy);
        }
    }

    /** S face details (baked into the gradient wall): service hatch, vents, rust streaks. */
    private drawCrusherSide(c: CanvasRenderingContext2D, w: number): void {
        const r = CRUSHER_RISE;
        c.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(c, w * 0.55, r * 0.3, w * 0.32, r * 0.42, 4); c.fill();
        const hg = c.createLinearGradient(0, r * 0.3, 0, r * 0.72); hg.addColorStop(0, '#8a9099'); hg.addColorStop(1, '#4a5058');
        c.fillStyle = hg; roundRect(c, w * 0.55 - 2, r * 0.3 - 2, w * 0.32, r * 0.42, 4); c.fill();
        c.fillStyle = '#050607'; c.fillRect(w * 0.55 + 2, r * 0.34, w * 0.32 - 8, 34);
        for (let i = 0; i < 4; i++) { const sy = r * 0.36 + i * 8; c.fillStyle = '#6e757e'; c.fillRect(w * 0.55 + 4, sy, w * 0.32 - 12, 4); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(w * 0.55 + 4, sy, w * 0.32 - 12, 1); c.fillStyle = '#000'; c.fillRect(w * 0.55 + 4, sy + 4, w * 0.32 - 12, 1); }
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(w * 0.55 - 2, r * 0.3 - 2, w * 0.32, 2);
        for (const sx of [w * 0.12, w * 0.3]) { const g = c.createLinearGradient(0, r * 0.1, 0, r); g.addColorStop(0, css(JUNKYARD_HEX.rust, 0.45)); g.addColorStop(1, css(JUNKYARD_HEX.rust, 0)); c.fillStyle = g; c.fillRect(sx, r * 0.1, 6, r * 0.9); }
        c.fillStyle = css(JUNKYARD_HEX.steelLight); for (let x = 10; x < w; x += 20) { c.beginPath(); c.arc(x, 8, 2, 0, Math.PI * 2); c.fill(); }
    }

    /** W WALL (local x = height above ground 0..CRUSHER_RISE, y = along the wall 0..h): steel wall, rivet row at the roof edge,
     *  the MOUTH = rectangular doorway x 0..MOUTH_UP over the belt's span — black well with gloom, steel frame, hazard jambs,
     *  red warning disc above it. The jaws are sprites on top of this bake. */
    private drawWestWall(c: CanvasRenderingContext2D, h: number): void {
        const R = CRUSHER_RISE, y0 = this.mouthY0(), mw = JAW_LEN; // mouth spans y0..y0+mw
        const wg = c.createLinearGradient(0, 0, R, 0); wg.addColorStop(0, css(darken(JUNKYARD_HEX.steelDark, 0.75))); wg.addColorStop(0.5, css(JUNKYARD_HEX.steelDark)); wg.addColorStop(1, css(lighten(JUNKYARD_HEX.steelDark, 0.25)));
        c.fillStyle = wg; c.fillRect(0, 0, R, h);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(R - 1.5, 0, 1.5, h); // lit roof edge
        c.fillStyle = css(JUNKYARD_HEX.steelLight); for (let ry = 10; ry < h; ry += 20) { c.beginPath(); c.arc(R - 7, ry, 2, 0, Math.PI * 2); c.fill(); }
        for (const ry of [h * 0.08, h * 0.9]) { const g = c.createLinearGradient(0, 0, R * 0.6, 0); g.addColorStop(0, css(JUNKYARD_HEX.rust, 0.5)); g.addColorStop(1, css(JUNKYARD_HEX.rust, 0)); c.fillStyle = g; c.fillRect(0, ry, R * 0.6, 7); }
        // steel frame around the doorway (lit top edge = the lintel, hazard jambs N and S)
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, y0 - 10, MOUTH_UP + 10, mw + 20);
        const fg = c.createLinearGradient(MOUTH_UP - 2, 0, MOUTH_UP + 8, 0); fg.addColorStop(0, '#6e757e'); fg.addColorStop(0.4, '#eef1f4'); fg.addColorStop(1, '#3c4147');
        c.fillStyle = fg; c.fillRect(MOUTH_UP, y0 - 10, 8, mw + 20);
        hazard(c, 0, y0 - 10, MOUTH_UP, 8, 7); hazard(c, 0, y0 + mw + 2, MOUTH_UP, 8, 7);
        // the well: near-black, gloom deepest at the back (high x inside = far), faint drums
        c.fillStyle = '#050607'; c.fillRect(0, y0, MOUTH_UP, mw);
        const gl = c.createLinearGradient(0, 0, MOUTH_UP, 0); gl.addColorStop(0, 'rgba(40,44,48,0.35)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gl; c.fillRect(0, y0, MOUTH_UP, mw);
        c.fillStyle = '#121416'; for (const dy of [0.3, 0.7]) { c.beginPath(); c.ellipse(MOUTH_UP * 0.55, y0 + mw * dy, 12, 16, 0, 0, Math.PI * 2); c.fill(); }
        // floor plate (steel, lit edge) at ground level
        const fp = c.createLinearGradient(0, 0, 8, 0); fp.addColorStop(0, '#2f343a'); fp.addColorStop(1, '#6e757e');
        c.fillStyle = fp; c.fillRect(0, y0, 8, mw); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(7, y0, 1, mw);
        // red warning disc above the doorway + white bar
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(MOUTH_UP + 14, y0 + mw / 2 + 2, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.beginPath(); c.arc(MOUTH_UP + 13, y0 + mw / 2, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.fillRect(MOUTH_UP + 11, y0 + mw / 2 - 5, 4, 10);
    }

    /** One jaw: TEETH_N teeth as CONES — two adjacent triangles per tooth (left bright, right grey, hard cut on the axis),
     *  1 px dark outline, steel gum bar. top = teeth point DOWN (hanging from the lintel). */
    private static drawJaw(c: CanvasRenderingContext2D, top: boolean): void {
        const gumY = top ? 0 : TOOTH_H;
        const gg = c.createLinearGradient(0, gumY, 0, gumY + 8); gg.addColorStop(0, '#c9d0d6'); gg.addColorStop(0.4, '#6e757e'); gg.addColorStop(1, '#2f343a');
        c.fillStyle = gg; roundRect(c, 0, gumY, JAW_LEN, 8, 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(0, gumY, JAW_LEN, 1);
        for (let i = 0; i < TEETH_N; i++) {
            const x = 4 + i * TOOTH_W, mx = x + TOOTH_W / 2;
            const base = top ? 8 : TOOTH_H, tip = top ? TOOTH_H + 8 : 0;
            c.fillStyle = '#f4f6f8'; c.beginPath(); c.moveTo(x, base); c.lineTo(mx, tip); c.lineTo(mx, base); c.closePath(); c.fill();
            c.fillStyle = '#8a9099'; c.beginPath(); c.moveTo(mx, base); c.lineTo(mx, tip); c.lineTo(x + TOOTH_W, base); c.closePath(); c.fill();
            c.fillStyle = '#4a5058'; c.beginPath(); c.moveTo(mx + 2, base); c.lineTo(mx, tip); c.lineTo(x + TOOTH_W, base); c.closePath(); c.fill(); // core shadow on the far side
            c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, base); c.lineTo(mx, tip); c.lineTo(x + TOOTH_W, base); c.stroke();
        }
    }

    /** Roof layer: hazard strip, rivets, fan housing (the fan sprite spins on it), chimney, roof grate. */
    private drawCrusherTop(c: CanvasRenderingContext2D, w: number, h: number): void {
        hazard(c, 0, -CRUSHER_RISE, w, 16);
        c.fillStyle = css(JUNKYARD_HEX.steelLight); for (let rx = 14; rx < w - 10; rx += 22) { c.beginPath(); c.arc(rx, -CRUSHER_RISE + 24, 2.5, 0, Math.PI * 2); c.fill(); }
        // fan housing: dark well + ring with bolts (fan sprite rotates inside)
        const fx = w * 0.36, fy = -CRUSHER_RISE + 54;
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(fx + 3, fy + 4, 26, 0, Math.PI * 2); c.fill();
        const wg = c.createRadialGradient(fx, fy, 2, fx, fy, 24); wg.addColorStop(0, '#000000'); wg.addColorStop(0.6, '#0a0b0c'); wg.addColorStop(1, '#2a2e33'); // hollow well (art dir REV 6)
        c.fillStyle = wg; c.beginPath(); c.arc(fx, fy, 24, 0, Math.PI * 2); c.fill();
        const rg = c.createLinearGradient(fx - 26, fy - 26, fx + 26, fy + 26); rg.addColorStop(0, '#dfe4e8'); rg.addColorStop(0.5, '#8a9099'); rg.addColorStop(1, '#3c4147');
        c.strokeStyle = rg; c.lineWidth = 5; c.beginPath(); c.arc(fx, fy, 25, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#20242a'; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.beginPath(); c.arc(fx + Math.cos(a) * 25, fy + Math.sin(a) * 25, 2, 0, Math.PI * 2); c.fill(); }
        // chimney (REV 6, Mariusz): fake-3D stack set INTO the roof — bolted flange, chrome-cut cylinder, rain cap with a rim,
        // dark bore, soot streaks; smoke rises from CH_X / CH_TOP (see updateView)
        const chx = CH_X, chBase = -CRUSHER_RISE + CH_BASE, chH = CH_H, chW = 26;
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(chx + 6, chBase + 6, 24, 11, 0, 0, Math.PI * 2); c.fill(); // AO on the roof
        const fl = c.createLinearGradient(chx - 22, 0, chx + 22, 0); fl.addColorStop(0, '#2f343a'); fl.addColorStop(0.3, '#c3c9cf'); fl.addColorStop(0.34, '#8a9099'); fl.addColorStop(1, '#1d2024');
        c.fillStyle = fl; c.beginPath(); c.ellipse(chx, chBase, 22, 10, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#0f1113'; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.beginPath(); c.arc(chx + Math.cos(a) * 17, chBase + Math.sin(a) * 7, 1.8, 0, Math.PI * 2); c.fill(); }
        const cg = c.createLinearGradient(chx - chW / 2, 0, chx + chW / 2, 0);
        cg.addColorStop(0, '#101214'); cg.addColorStop(0.17, '#3c4248'); cg.addColorStop(0.19, '#eef1f4'); cg.addColorStop(0.3, '#aab1b8'); cg.addColorStop(0.6, '#5e656d'); cg.addColorStop(0.88, '#202428'); cg.addColorStop(1, '#080a0c');
        c.fillStyle = cg; c.fillRect(chx - chW / 2, chBase - chH, chW, chH);
        const soot = c.createLinearGradient(0, chBase - chH, 0, chBase - chH + 22); soot.addColorStop(0, 'rgba(0,0,0,0.55)'); soot.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = soot; c.fillRect(chx - chW / 2, chBase - chH, chW, 22);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(chx - chW / 2, chBase - 8, chW, 8); // AO where the stack meets the flange
        // rain cap: rim ellipse (lit) + dark bore
        const rim = c.createLinearGradient(chx - chW / 2 - 4, 0, chx + chW / 2 + 4, 0); rim.addColorStop(0, '#3c4147'); rim.addColorStop(0.3, '#ffffff'); rim.addColorStop(0.34, '#aab1b8'); rim.addColorStop(1, '#2a2e33');
        c.fillStyle = rim; c.beginPath(); c.ellipse(chx, chBase - chH, chW / 2 + 4, 6, 0, 0, Math.PI * 2); c.fill();
        const bore = c.createRadialGradient(chx, chBase - chH, 1, chx, chBase - chH, chW / 2 - 2); bore.addColorStop(0, '#000'); bore.addColorStop(1, '#15181b');
        c.fillStyle = bore; c.beginPath(); c.ellipse(chx, chBase - chH, chW / 2 - 2, 4, 0, 0, Math.PI * 2); c.fill();
        // guy bands (two rings on the stack)
        for (const by of [chBase - chH * 0.35, chBase - chH * 0.7]) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(chx - chW / 2 - 1, by, chW + 2, 4); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(chx - chW / 2 - 1, by, chW + 2, 1); }
        // red warning disc + roof grate (you can see the crushing drums below)
        c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.beginPath(); c.arc(w * 0.76, -CRUSHER_RISE + 50, 11, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.fillRect(w * 0.76 - 6, -CRUSHER_RISE + 48, 12, 4);
        // grate (art dir REV 6): hollow — black well + grey slats with a 1 px light top edge and a 1 px dark bottom edge
        c.fillStyle = '#050607'; roundRect(c, 20, h - CRUSHER_RISE - 70, w - 40, 50, 4); c.fill();
        for (let k = 0; k < 6; k++) { const sy = h - CRUSHER_RISE - 66 + k * 8; c.fillStyle = '#6e757e'; c.fillRect(26, sy, w - 52, 4); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(26, sy, w - 52, 1); c.fillStyle = '#000'; c.fillRect(26, sy + 4, w - 52, 1); }
    }
}
