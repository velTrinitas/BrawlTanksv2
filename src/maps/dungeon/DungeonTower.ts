import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { applyHitShake } from '../../rendering/hitShake';
import { checkRectCollision } from '../../systems/Physics';
import { DUNGEON_PALETTE as P } from './dungeonPalette';

/**
 * DungeonTower — ZLOWROGA WIEZA w centrum kolumnady (SAVE THE QUEEN Q4.5, decyzja Mariusza
 * po playtescie Q4: "wieza, ktora strzela do mnie co 0.75 s zielonym ogniem, wyglada mega,
 * duza fake 3D z gradientem, kule duze z dluga smuga i dymem").
 *
 *  - Solid 90x90 (buildings + solidBuildings), x/y = TOP-LEFT. Art: jedna pieczona tekstura
 *    (walec z gradientem 6 stopow jak DungeonPillar, ale 2x wyzszy, blanki, zielony krysztal
 *    na szczycie, dlugi cien SE) — zero pracy per-frame poza pulsem krysztalu.
 *  - STRZAL: co fireMs, gdy gracz w zasiegu; TELEGRAF 250 ms (krysztal rozblyska + pierscien),
 *    kula r=13 (zielony ogien: rdzen jasny, otoczka ciemna), predkosc orbSpeed, smuga 10 probek
 *    (gasnace kola) + obloczki dymu co 3 klatki. Trafienie gracza = wybuch zielony + dmg.
 *    Kula w solid (mur/filar) = wybuch + duck-typed takeDamage na cegle (wieza tez rozbija mur —
 *    interakcja: mozna ja "uzyc" jako mlota, stojac za murem).
 *  - HP 4000: rozwalalna TYLKO pociskami gracza (duck-typing z Bullet.ts przekazuje 4. arg
 *    `heavy`; EnemyBullet podaje 3 argi => ignorujemy). Zniszczona: eksplozja, gruz (tint),
 *    kolizja znika, callback (gemy/score). Stany obrazen: pekniecia przez tint co 25%.
 * Mobile: 1 sprite + 1 Graphics (kule/smugi/dym, <=6 kul zywych) — klasa A.
 */

export interface TowerOrb { x: number; y: number; vx: number; vy: number; life: number; trail: number[]; smokeT: number }
export interface TowerSmoke { x: number; y: number; r: number; age: number; life: number }
export interface TowerBurst { x: number; y: number; age: number }

export interface DungeonTowerOpts {
    hp: number;
    fireMs: number;
    telegraphMs: number;
    range: number;
    orbSpeed: number;
    orbDmg: number;
    orbR: number;
    onDestroyed: (cx: number, cy: number) => void;
    /** kula trafila gracza (QueenSystem -> hurtPlayer) */
    onPlayerHit: (dmg: number) => void;
}

const RISE = 150;
const M = 16;
const SHADOW_X = 90, SHADOW_Y = 50;
const GREEN = 0x39ff6a, GREEN_DARK = 0x0d5e26, GREEN_HI = 0xd6ffe0;
let _tex: PIXI.Texture | null = null;

function bakeTower(w: number, h: number): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = w + M * 2 + SHADOW_X; cv.height = h + M * 2 + RISE + SHADOW_Y;
    const c = cv.getContext('2d')!;
    const x = M, y = M + RISE, cx = x + w / 2;
    // cien SE (dlugi, rozmyty) + kontaktowy
    c.save(); c.filter = 'blur(8px)'; c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.moveTo(x + 8, y + h - 8); c.lineTo(x + w - 6, y + h - 12); c.lineTo(x + w + SHADOW_X - 16, y + h + SHADOW_Y - 20); c.lineTo(x + w + SHADOW_X - 40, y + h + SHADOW_Y - 6); c.lineTo(x + 24, y + h + 14); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.ellipse(cx + 5, y + h - 8, w * 0.64, 14, 0, 0, Math.PI * 2); c.fill();
    // plinta 2-stopniowa
    const pg = c.createLinearGradient(x - 12, 0, x + w + 12, 0);
    pg.addColorStop(0, P.stoneDark); pg.addColorStop(0.3, P.stoneLight); pg.addColorStop(0.6, P.stone); pg.addColorStop(1, '#1c1726');
    c.fillStyle = pg; c.fillRect(x - 12, y + h - 28, w + 24, 28);
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x - 12, y + h - 28, w + 24, 4);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x - 12, y + h - 6, w + 24, 6);
    c.fillStyle = pg; c.fillRect(x - 5, y + h - 38, w + 10, 10);
    // trzon walec
    const sx0 = x + 4, sw = w - 8, sy0 = y - RISE + 34, sh = h + RISE - 72;
    const sg = c.createLinearGradient(sx0, 0, sx0 + sw, 0);
    sg.addColorStop(0, '#221c2e'); sg.addColorStop(0.15, P.stoneLight); sg.addColorStop(0.3, '#7c7494'); sg.addColorStop(0.55, P.stone); sg.addColorStop(0.82, P.stoneDark); sg.addColorStop(1, '#15111d');
    c.fillStyle = sg; c.fillRect(sx0, sy0, sw, sh);
    // bloki kamienne (rzedy z przesunieciem) — bryla, nie paski
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2;
    for (let by = sy0 + 10, row = 0; by < sy0 + sh - 8; by += 22, row++) {
        c.beginPath(); c.moveTo(sx0, by); c.lineTo(sx0 + sw, by); c.stroke();
        for (let bx = sx0 + (row % 2 ? 14 : 0); bx < sx0 + sw; bx += 28) { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by + 22); c.stroke(); }
    }
    // krzywizna: rowki cos
    for (let i = 1; i < 6; i++) { const u = i / 6; const fx = sx0 + sw * (0.5 - Math.cos(u * Math.PI) * 0.5); c.fillStyle = 'rgba(0,0,0,' + (0.1 + u * 0.16).toFixed(2) + ')'; c.fillRect(fx - 1, sy0, 2, sh); }
    // AO dol + zielone podswietlenie od krysztalu (gora)
    const ao = c.createLinearGradient(0, sy0 + sh - 50, 0, sy0 + sh); ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = ao; c.fillRect(sx0, sy0 + sh - 50, sw, 50);
    const gl = c.createLinearGradient(0, sy0, 0, sy0 + 70); gl.addColorStop(0, 'rgba(57,255,106,0.35)'); gl.addColorStop(1, 'rgba(57,255,106,0)');
    c.fillStyle = gl; c.fillRect(sx0, sy0, sw, 70);
    // okno-szczelina z zielonym swiatlem
    c.fillStyle = '#0b0710'; c.fillRect(cx - 5, sy0 + 60, 10, 34);
    c.fillStyle = '#39ff6a'; c.globalAlpha = 0.85; c.fillRect(cx - 3, sy0 + 64, 6, 26); c.globalAlpha = 1;
    // obrecze zelazne z nitami
    for (const ry of [sy0 + 40, sy0 + sh - 60]) {
        c.fillStyle = P.iron; c.fillRect(sx0 - 3, ry, sw + 6, 9);
        c.fillStyle = P.ironLight; c.fillRect(sx0 - 3, ry, sw * 0.4, 2);
        c.fillStyle = P.ironLight; for (let nx = sx0 + 6; nx < sx0 + sw; nx += 14) c.fillRect(nx, ry + 3, 2, 3);
    }
    // blanki (korona) + podstawa krysztalu
    const capY = y - RISE + 14;
    const cg = c.createLinearGradient(x - 12, 0, x + w + 12, 0);
    cg.addColorStop(0, P.stoneDark); cg.addColorStop(0.25, P.stoneLight); cg.addColorStop(0.6, P.stone); cg.addColorStop(1, '#1c1726');
    c.fillStyle = cg;
    c.beginPath(); c.moveTo(sx0 - 2, capY + 22); c.lineTo(sx0 + sw + 2, capY + 22); c.lineTo(x + w + 12, capY + 10); c.lineTo(x - 12, capY + 10); c.closePath(); c.fill();
    for (let bx = x - 12; bx < x + w + 12; bx += 20) { c.fillStyle = cg; c.fillRect(bx, capY - 4, 12, 14); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(bx, capY - 4, 12, 3); }
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(sx0 - 2, capY + 20, sw + 4, 4);
    // krysztal (zielony, fasetowany) nad korona — puls robi runtime overlay
    const kx = cx, ky = capY - 22;
    c.fillStyle = GREEN_DARK.toString(16).padStart(6, '0').replace(/^/, '#');
    c.beginPath(); c.moveTo(kx, ky - 26); c.lineTo(kx + 16, ky); c.lineTo(kx, ky + 18); c.lineTo(kx - 16, ky); c.closePath(); c.fill();
    c.fillStyle = '#39ff6a'; c.beginPath(); c.moveTo(kx, ky - 26); c.lineTo(kx + 16, ky); c.lineTo(kx, ky + 4); c.closePath(); c.fill();
    c.fillStyle = '#1faa3c'; c.beginPath(); c.moveTo(kx, ky - 26); c.lineTo(kx - 16, ky); c.lineTo(kx, ky + 4); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(kx - 2, ky - 20); c.lineTo(kx + 4, ky - 10); c.lineTo(kx - 4, ky - 8); c.closePath(); c.fill();
    // zelazne klamry trzymajace krysztal
    c.strokeStyle = P.ironLight; c.lineWidth = 3;
    c.beginPath(); c.moveTo(kx - 14, ky + 2); c.lineTo(kx - 8, ky + 14); c.moveTo(kx + 14, ky + 2); c.lineTo(kx + 8, ky + 14); c.stroke();
    // mech fioletowy u podstawy
    c.fillStyle = P.moss; c.globalAlpha = 0.6; c.beginPath(); c.ellipse(x + 14, y + h - 32, 12, 6, 0.3, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    return PIXI.Texture.from(cv);
}

export class DungeonTower implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    public hp: number;
    public readonly maxHp: number;
    public isDestroyed = false;

    private readonly opts: DungeonTowerOpts;
    private readonly origX: number; private readonly origY: number;
    private readonly container: PIXI.Container;
    private readonly sprite: PIXI.Sprite;
    private readonly crystal: PIXI.Graphics;   // puls krysztalu + telegraf (nad wieza)
    private readonly fx: PIXI.Graphics;        // kule, smugi, dym, wybuchy (world, nad czolgami)
    private readonly hpBar: PIXI.Graphics;
    private readonly effects: EffectsManager;
    private readonly audio: AudioSys;
    private readonly orbs: TowerOrb[] = [];
    private readonly smoke: TowerSmoke[] = [];
    private readonly bursts: TowerBurst[] = [];
    private fireT = 0;
    private telegraph = 0;     // ms pozostale telegrafu (0 = brak)
    private aimX = 0; private aimY = 0;
    private t = 0;

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container, effects: EffectsManager, audio: AudioSys, opts: DungeonTowerOpts) {
        this.x = x; this.y = y; this.w = w; this.h = h; this.origX = x; this.origY = y;
        this.opts = opts; this.hp = opts.hp; this.maxHp = opts.hp;
        this.effects = effects; this.audio = audio;
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this.crystal = new PIXI.Graphics();
        this.hpBar = new PIXI.Graphics();
        this.fx = new PIXI.Graphics();
        this.container.addChild(this.sprite, this.crystal, this.hpBar);
        worldContainer.addChild(this.container);
        worldContainer.addChild(this.fx);
        if (!_tex) _tex = bakeTower(w, h);
        this.sprite.texture = _tex;
        this.container.x = x - M; this.container.y = y - M - RISE;
        this.container.zIndex = y + h;
        this.fx.zIndex = 15000; // kule nad czolgami
        this.fireT = opts.fireMs * 0.5;
        this.drawHp();
    }

    public get centerX(): number { return this.origX + this.w / 2; }
    public get centerY(): number { return this.origY + this.h / 2; }
    /** srodek krysztalu (punkt wylotu kul) w swiecie */
    private get muzzleX(): number { return this.origX + this.w / 2; }
    private get muzzleY(): number { return this.origY - RISE + 14 - 22; }

    /** Duck-typed z Bullet.ts (4 argi). EnemyBullet daje 3 => heavy undefined => ignoruj (wrogowie nie rania wiezy). */
    public takeDamage(dmg: number, hitX: number, hitY: number, heavy?: boolean): void {
        if (this.isDestroyed || heavy === undefined) return;
        this.hp -= dmg;
        this.effects.spawnEnemyHitSparks(hitX, hitY, GREEN);
        this.audio.playHit('wall');
        applyHitShake(this.container, this.origX - M, this.origY - M - RISE, 1.2, 80, () => this.isDestroyed);
        // stany obrazen: tint ciemnieje co 25%
        const pct = Math.max(0, this.hp / this.maxHp);
        this.sprite.tint = pct > 0.75 ? 0xffffff : pct > 0.5 ? 0xd9d0e0 : pct > 0.25 ? 0xb3a6bf : 0x8a7a99;
        this.drawHp();
        if (this.hp <= 0) this.shatter();
    }

    private shatter(): void {
        this.isDestroyed = true;
        // kolizja znika (wzorzec PrisonBrick): poza swiat
        this.w = 0; this.h = 0; this.x = -10000; this.y = -10000;
        this.effects.spawnMegaBomb(this.centerX, this.centerY);
        this.effects.spawnShockwaveRing(this.centerX, this.centerY, 200, GREEN);
        this.effects.spawnWoodSplinters(this.centerX, this.centerY - 60, 24);
        this.effects.shake(12, 22);
        this.audio.playExplosion();
        // gruz: sprite spada (skala Y) i ciemnieje
        this.sprite.tint = 0x4a4058; this.sprite.alpha = 0.85;
        this.sprite.scale.y = 0.35; this.sprite.y = (RISE + M + this.origY - (this.origY - M - RISE)) * 0 + RISE * 0.65;
        this.crystal.clear(); this.hpBar.clear();
        this.orbs.length = 0;
        this.opts.onDestroyed(this.centerX, this.centerY);
    }

    private drawHp(): void {
        const g = this.hpBar; g.clear();
        const bw = 90, bx = M, by = 0;
        g.beginFill(0x000000, 0.55); g.drawRoundedRect(bx, by, bw, 8, 3); g.endFill();
        g.beginFill(GREEN, 1); g.drawRoundedRect(bx, by, Math.max(0, bw * this.hp / this.maxHp), 8, 3); g.endFill();
    }

    /** @param solids przeszkody dla kul (mur/filary — duck-typed takeDamage na cegle) */
    /** ICollidable: buildings.forEach moze wolac update(cam) — logika wiezy jest w tick(). */
    public update(): void { /* no-op — patrz tick() */ }

    /** @param solids przeszkody dla kul (mur/filary — duck-typed takeDamage na cegle) */
    public tick(dtMs: number, playerX: number, playerY: number, solids: readonly ICollidable[]): void {
        this.t += dtMs;
        const fx = this.fx; fx.clear();
        // ── puls krysztalu / telegraf ──
        const cr = this.crystal; cr.clear();
        if (!this.isDestroyed) {
            const kx = M + this.w / 2, ky = M + 14 - 22;
            const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.005);
            const tele = this.telegraph > 0 ? 1 - this.telegraph / this.opts.telegraphMs : 0;
            cr.beginFill(GREEN, 0.18 + 0.12 * pulse + 0.4 * tele); cr.drawCircle(kx, ky - 4, 22 + 8 * pulse + 26 * tele); cr.endFill();
            if (tele > 0) { cr.lineStyle(3, GREEN_HI, 0.9 * (1 - tele)); cr.drawCircle(kx, ky - 4, 30 + 50 * tele); cr.lineStyle(0); }
            // ── strzal ──
            const dx = playerX - this.muzzleX, dy = playerY - this.muzzleY;
            const dist = Math.hypot(dx, dy);
            if (this.telegraph > 0) {
                this.telegraph -= dtMs;
                if (this.telegraph <= 0) { this.telegraph = 0; this.fire(); }
            } else if (dist <= this.opts.range) {
                this.fireT -= dtMs;
                if (this.fireT <= 0) { this.fireT = this.opts.fireMs; this.telegraph = this.opts.telegraphMs; this.aimX = playerX; this.aimY = playerY; this.audio.playCrateTap(1); }
            }
            if (this.telegraph > 0) { this.aimX = playerX; this.aimY = playerY; } // sledzi do momentu strzalu
        }
        // ── kule ──
        const step = dtMs / (1000 / 60);
        for (let i = this.orbs.length - 1; i >= 0; i--) {
            const o = this.orbs[i];
            o.trail.push(o.x, o.y); if (o.trail.length > 20) o.trail.splice(0, 2);
            o.x += o.vx * step; o.y += o.vy * step; o.life -= dtMs;
            o.smokeT += dtMs;
            if (o.smokeT >= 50) { o.smokeT = 0; if (this.smoke.length < 40) this.smoke.push({ x: o.x - o.vx * 2, y: o.y - o.vy * 2, r: 6, age: 0, life: 550 }); }
            let hit = false;
            // gracz (kolo r + 22)
            if ((o.x - playerX) ** 2 + (o.y - playerY) ** 2 <= (this.opts.orbR + 22) ** 2) { this.opts.onPlayerHit(this.opts.orbDmg); hit = true; }
            // solidy (mur/filary/ramka) — cegla dostaje obrazenia jak od pocisku wroga
            if (!hit) for (const b of solids) {
                if (b.w <= 0 || (b as unknown) === this) continue;
                if (checkRectCollision(b.x, b.y, b.w, b.h, o.x, o.y, this.opts.orbR)) {
                    const d = b as ICollidable & { takeDamage?: (dmg: number, hx: number, hy: number) => void };
                    if (typeof d.takeDamage === 'function') d.takeDamage(this.opts.orbDmg, o.x, o.y);
                    hit = true; break;
                }
            }
            if (hit || o.life <= 0) {
                this.bursts.push({ x: o.x, y: o.y, age: 0 });
                this.effects.spawnEnemyHitSparks(o.x, o.y, GREEN);
                this.audio.playHit('wall');
                this.orbs.splice(i, 1);
            }
        }
        // ── rysowanie: dym -> smugi -> kule -> wybuchy ──
        for (let i = this.smoke.length - 1; i >= 0; i--) {
            const s = this.smoke[i]; s.age += dtMs; s.r += 0.05 * dtMs; s.y -= 0.01 * dtMs;
            if (s.age >= s.life) { this.smoke.splice(i, 1); continue; }
            const a = 0.35 * (1 - s.age / s.life);
            fx.beginFill(0x1a3a22, a); fx.drawCircle(s.x, s.y, s.r); fx.endFill();
            fx.beginFill(0x39ff6a, a * 0.35); fx.drawCircle(s.x + 2, s.y - 2, s.r * 0.5); fx.endFill();
        }
        for (const o of this.orbs) {
            const n = o.trail.length / 2;
            for (let k = 0; k < n; k++) {
                const f = (k + 1) / (n + 1);
                fx.beginFill(GREEN_DARK, 0.5 * f); fx.drawCircle(o.trail[k * 2], o.trail[k * 2 + 1], this.opts.orbR * (0.35 + 0.75 * f)); fx.endFill();
                fx.beginFill(GREEN, 0.55 * f); fx.drawCircle(o.trail[k * 2], o.trail[k * 2 + 1], this.opts.orbR * (0.2 + 0.5 * f)); fx.endFill();
            }
            // Q4.6: zielonkawa AURA kuli (miekka, 2 warstwy — bez blendu ADD)
            fx.beginFill(GREEN, 0.10); fx.drawCircle(o.x, o.y, this.opts.orbR * 2.8); fx.endFill();
            fx.beginFill(GREEN, 0.18); fx.drawCircle(o.x, o.y, this.opts.orbR * 1.9); fx.endFill();
            fx.beginFill(GREEN_DARK, 0.9); fx.drawCircle(o.x, o.y, this.opts.orbR + 4); fx.endFill();
            fx.beginFill(GREEN, 1); fx.drawCircle(o.x, o.y, this.opts.orbR); fx.endFill();
            fx.beginFill(GREEN_HI, 1); fx.drawCircle(o.x - 3, o.y - 3, this.opts.orbR * 0.45); fx.endFill();
        }
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i]; b.age += dtMs;
            const k = b.age / 320;
            if (k >= 1) { this.bursts.splice(i, 1); continue; }
            fx.lineStyle(4, GREEN, 0.9 * (1 - k)); fx.drawCircle(b.x, b.y, 10 + 50 * k); fx.lineStyle(0);
            fx.beginFill(GREEN_HI, 0.8 * (1 - k)); fx.drawCircle(b.x, b.y, 16 * (1 - k)); fx.endFill();
            fx.beginFill(GREEN, 0.9 * (1 - k));
            for (let j = 0; j < 6; j++) { const a = j * 1.047 + k * 2; fx.drawCircle(b.x + Math.cos(a) * (14 + 40 * k), b.y + Math.sin(a) * (14 + 40 * k), 4 * (1 - k)); }
            fx.endFill();
        }
    }

    private fire(): void {
        if (this.orbs.length >= 6) return;
        const mx = this.muzzleX, my = this.muzzleY;
        const dx = this.aimX - mx, dy = this.aimY - my;
        const d = Math.hypot(dx, dy) || 1;
        this.orbs.push({ x: mx, y: my, vx: (dx / d) * this.opts.orbSpeed, vy: (dy / d) * this.opts.orbSpeed, life: 2600, trail: [], smokeT: 0 });
        this.effects.spawnEnemyHitSparks(mx, my, GREEN_HI);
        this.audio.playShockwave();
    }

    public destroy(): void {
        this.container.destroy({ children: true });
        this.fx.destroy();
    }
}
