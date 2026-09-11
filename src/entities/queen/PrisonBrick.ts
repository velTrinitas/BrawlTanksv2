import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { applyHitShake } from '../../rendering/hitShake';
import { DUNGEON_PALETTE as P } from '../../maps/dungeon/dungeonPalette';

/**
 * PrisonBrick — cegla muru wiezienia Krolowej (SAVE THE QUEEN Q2). Pochodna IceCube v3
 * HYBRID: ICollidable (x/y = TOP-LEFT, 56 px), duck-typed takeDamage z Bullet/EnemyBullet,
 * 3 stany obrazen przez SWAP wspoldzielonej tekstury (5 wariantow x 3 stany = 15 tekstur
 * w cache + Zwornik 3 stany), getExtraCollidables (padded box do buildings[]), applyHitShake.
 *
 * Roznice vs IceCube:
 *  - BRAK auto-respawnu: cegla wraca TYLKO przez Budowniczego (Q4: rebuild(pct)).
 *    Po rozbiciu obiekt zostaje jako pusty slot (isDestroyed, w/h=0, niewidoczny).
 *  - kind 'keystone' (Zwornik): wieksza (68 px, wystaje z lica), ciemniejsza, runa
 *    pulsujaca fioletem (jedyny animowany element muru). ODPORNA na zwykle pociski:
 *    takeDamage(…, heavy=false) => iskra + clink + callback (baner "uzyj SUPERA"),
 *    zero obrazen. Rozwalaja ja: super strzal, moce AoE, dynamit (heavy=true).
 *  - pociski WROGOW tez niszcza cegly (dziedziczone: "wrog jako mlot").
 */

export const PRISON_BRICK_SIZE = 56;
const KEYSTONE_SIZE = 68;
const VARIANT_COUNT = 5;
const RISE = 20; // Q5: wyzszy blok = mocniejsze fake-3D (decyzja Mariusza: "juicy")
const MARGIN = 12;
const SPLASH_BRICK = 0xd97a5a;
const SPLASH_KEY = 0xc850ff;

export type BrickKind = 'brick' | 'keystone';

export interface PrisonBrickCallbacks {
    /** cegla rozbita (cx, cy = srodek) — gem chance, licznik, pasek drogi */
    onBreak: (brick: PrisonBrick, cx: number, cy: number) => void;
    /** zwykly pocisk trafil Zwornik — HUD: "ZWORNIK — uzyj SUPERA!" */
    onKeystoneClink?: (brick: PrisonBrick) => void;
}

function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface BakedTex { tex: PIXI.Texture; m: number; rise: number; size: number }
/** Klucz: kind(0 brick/1 key) * 100 + variant * 10 + stage. */
const CACHE = new Map<number, BakedTex>();

function getBrickTexture(kind: BrickKind, variant: number, stage: number): BakedTex {
    const key = (kind === 'keystone' ? 100 : 0) + variant * 10 + stage;
    const cached = CACHE.get(key);
    if (cached) return cached;
    const bt = kind === 'keystone' ? bakeKeystone(stage) : bakeBrick(variant, stage);
    CACHE.set(key, bt);
    return bt;
}

export class PrisonBrick implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed = false;
    public readonly kind: BrickKind;
    public readonly row: number;
    public readonly col: number;
    public readonly maxHp: number;
    public hp: number;
    /** v3: powiazany Zwornik (brama = 2 kafle) — pekniecie jednego rozbija drugi. */
    public linked: PrisonBrick | null = null;
    /** Q4: dynamit ukryty w cegle — 'hidden' wyglada jak zwykla cegla; 'lit' = lont (1.5 s); 'done' = wybuchl. */
    public dynamite: 'hidden' | 'lit' | 'done' | null = null;
    private dynGfx: PIXI.Graphics | null = null;
    private fuseT = 0;

    private readonly origX: number;
    private readonly origY: number;
    private readonly variant: number;
    private stage = 0;
    private readonly effects: EffectsManager;
    private readonly audio: AudioSys;
    private readonly cb: PrisonBrickCallbacks;
    private readonly container: PIXI.Container;
    private readonly sprite: PIXI.Sprite;
    private readonly rune: PIXI.Sprite | null;
    private runeT = 0;

    constructor(kind: BrickKind, row: number, col: number, x: number, y: number, seed: number, maxHp: number,
        worldContainer: PIXI.Container, effects: EffectsManager, audio: AudioSys, cb: PrisonBrickCallbacks) {
        this.kind = kind; this.row = row; this.col = col;
        this.x = x; this.y = y;
        this.w = PRISON_BRICK_SIZE; this.h = PRISON_BRICK_SIZE; // hitbox ZAWSZE 56 (Zwornik wystaje tylko wizualnie)
        this.origX = x; this.origY = y;
        this.variant = seed % VARIANT_COUNT;
        this.maxHp = maxHp; this.hp = maxHp;
        this.effects = effects; this.audio = audio; this.cb = cb;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x; this.container.y = y;
        this.container.zIndex = y + PRISON_BRICK_SIZE + (kind === 'keystone' ? 1 : 0);
        worldContainer.addChild(this.container);
        const bt = getBrickTexture(kind, this.variant, 0);
        this.sprite = new PIXI.Sprite(bt.tex);
        this.placeSprite(bt);
        this.container.addChild(this.sprite);
        this.rune = kind === 'keystone' ? new PIXI.Sprite(getRuneTexture()) : null;
        if (this.rune) {
            this.rune.anchor.set(0.5);
            this.rune.x = PRISON_BRICK_SIZE / 2; this.rune.y = PRISON_BRICK_SIZE / 2 - RISE / 2;
            this.rune.blendMode = PIXI.BLEND_MODES.ADD;
            this.container.addChild(this.rune);
        }
    }

    private placeSprite(bt: BakedTex): void {
        // canvas(m, m+rise) == local(0,0) = top-left hitboxa; Zwornik jest wiekszy => wycentrowany na hitboxie
        const off = (bt.size - PRISON_BRICK_SIZE) / 2;
        this.sprite.x = -bt.m - off;
        this.sprite.y = -(bt.rise + bt.m) - off;
    }

    /** Duck-typed z Bullet/EnemyBullet (+ 4. arg heavy: super/AoE/dynamit — Q2 Bullet.ts przekazuje isSuper). */
    public takeDamage(dmg: number, hitX: number, hitY: number, heavy: boolean = false): void {
        if (this.isDestroyed) return;
        if (this.kind === 'keystone' && !heavy) {
            // clink: iskra + drgniecie, ZERO obrazen — czytelny sygnal "to nie ta bron"
            this.effects.spawnEnemyHitSparks(hitX, hitY, SPLASH_KEY);
            this.audio.playWallThunk();
            applyHitShake(this.container, this.origX, this.origY, 1.0, 60, () => this.isDestroyed);
            this.cb.onKeystoneClink?.(this);
            return;
        }
        this.hp -= dmg;
        if (this.hp <= 0) { this.shatter(); return; }
        this.refreshStage();
        this.effects.spawnEnemyHitSparks(hitX, hitY, this.kind === 'keystone' ? SPLASH_KEY : SPLASH_BRICK);
        this.audio.playHit('wall');
        applyHitShake(this.container, this.origX, this.origY, 1.5, 80, () => this.isDestroyed);
    }

    private refreshStage(): void {
        const newStage = this.hp > this.maxHp * 0.6 ? 0 : this.hp > this.maxHp * 0.25 ? 1 : 2;
        if (newStage !== this.stage) {
            this.stage = newStage;
            const bt = getBrickTexture(this.kind, this.variant, newStage);
            this.sprite.texture = bt.tex;
            this.placeSprite(bt);
        }
    }

    private shatter(): void {
        this.isDestroyed = true;
        this.w = 0; this.h = 0;
        this.container.visible = false;
        const cx = this.origX + PRISON_BRICK_SIZE / 2, cy = this.origY + PRISON_BRICK_SIZE / 2;
        // pyl ceglany + odpryski + ring
        this.effects.spawnWoodSplinters(cx, cy, this.kind === 'keystone' ? 22 : 10);
        this.effects.spawnShockwaveRing(cx, cy, this.kind === 'keystone' ? 90 : 40, this.kind === 'keystone' ? SPLASH_KEY : SPLASH_BRICK);
        if (this.kind === 'keystone') { this.audio.playExplosion(); this.effects.shake(10, 14); } else this.audio.playCrateBreak();
        this.cb.onBreak(this, cx, cy);
        if (this.linked && !this.linked.isDestroyed) this.linked.shatter();
    }

    /** Q5: slot PUSTY od startu (kolumna dobudowy Budowniczych) — bez efektow rozbicia. */
    public vacate(): void {
        this.isDestroyed = true;
        this.w = 0; this.h = 0;
        this.container.visible = false;
    }

    /** Q4 Budowniczy: slot wraca jako cegla w podanym % HP (stan wizualny liczony z HP). */
    public rebuild(pct: number): void {
        this.isDestroyed = false;
        this.hp = Math.max(1, Math.round(this.maxHp * pct));
        this.w = PRISON_BRICK_SIZE; this.h = PRISON_BRICK_SIZE;
        this.stage = -1; this.refreshStage();
        this.container.visible = true;
    }

    /** Q4 Budowniczy "domurowuje": +pct HP (clamp do maxHp). */
    public heal(pct: number): void {
        if (this.isDestroyed) return;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * pct);
        this.refreshStage();
    }

    public get hpPct(): number { return this.isDestroyed ? 0 : this.hp / this.maxHp; }

    /** Q4: odkrycie dynamitu — wiazka czerwonych lasek + lont na licu cegly (telegraf; puls w update). */
    public revealDynamite(): void {
        if (this.dynGfx) return;
        const g = new PIXI.Graphics();
        const s = PRISON_BRICK_SIZE;
        // 3 laski TNT
        for (let i = 0; i < 3; i++) {
            const x = 10 + i * 13;
            g.beginFill(0x8f1d1d); g.drawRoundedRect(x, 12 - RISE / 2, 10, 30, 3); g.endFill();
            g.beginFill(0xd63b3b); g.drawRoundedRect(x + 1, 13 - RISE / 2, 8, 28, 3); g.endFill();
            g.beginFill(0xf2ecf5, 0.9); g.drawRect(x + 1, 24 - RISE / 2, 8, 4); g.endFill();
        }
        // lont
        g.lineStyle(2, 0x3a2a1a); g.moveTo(s / 2, 12 - RISE / 2); g.quadraticCurveTo(s / 2 + 8, 2 - RISE / 2, s / 2 + 14, 6 - RISE / 2); g.lineStyle(0);
        this.dynGfx = g;
        this.container.addChild(g);
    }

    /** Q4: lont plonie — iskra na koncu lontu + puls czerwieni (co ~100 ms). */
    private tickFuse(delta: number): void {
        if (!this.dynGfx || this.dynamite !== 'lit') return;
        this.fuseT += delta;
        const on = Math.floor(this.fuseT / 6) % 2 === 0;
        this.sprite.tint = on ? 0xff7a7a : 0xffffff;
        if (Math.floor(this.fuseT) % 12 === 0) this.effects.spawnEnemyHitSparks(this.origX + PRISON_BRICK_SIZE / 2 + 14, this.origY + 6 - RISE / 2, 0xffb347);
    }
    public get centerX(): number { return this.origX + PRISON_BRICK_SIZE / 2; }
    public get centerY(): number { return this.origY + PRISON_BRICK_SIZE / 2; }

    public update(delta: number): void {
        this.tickFuse(delta);
        if (this.rune && !this.isDestroyed) {
            this.runeT += delta / 60;
            this.rune.alpha = 0.45 + 0.4 * Math.sin(this.runeT * 3.2);
            const s = 1 + 0.06 * Math.sin(this.runeT * 3.2);
            this.rune.scale.set(s);
        }
    }

    /** Padded hitbox dla PLAYER collision (wzorzec Crate/IceCube) — do buildings[]. */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        return [{
            get x() { return self.isDestroyed ? -10000 : self.origX - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.origY - PAD; },
            get w() { return self.isDestroyed ? 0 : PRISON_BRICK_SIZE + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : PRISON_BRICK_SIZE + PAD * 2; },
            update: () => { /* static */ },
        }];
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}

// =================================================================
// Canvas 2D bake — cegla 5 wariantow x 3 stany, Zwornik 3 stany, runa
// =================================================================

/** Rozjasnienie/przyciemnienie koloru hex (#rrggbb) o k (-1..1). */
function shade(hex: string, k: number): string {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/**
 * Q5 "JUICY" (decyzja Mariusza): blok fake-3D z gradientami — top jasny NW->SE z glossem,
 * lico pionowy gradient (jasny pas pod krawedzia -> soczysty srodek -> ciemny dol z AO),
 * sciana E z gradientem, bevel (jasna krawedz N/W, ciemna S/E), miekki cien kontaktowy,
 * zaokraglone rogi, zaprawa jako miekka fuga. Wszystko wpieczone RAZ (15 tekstur w cache).
 */
function drawBlock(c: CanvasRenderingContext2D, x: number, y: number, size: number, rise: number, top: string, front: string, side: string, mortar: string): void {
    const rr = (px: number, py: number, w: number, h: number, r: number): void => { c.beginPath(); c.roundRect(px, py, w, h, r); };
    // cien kontaktowy SE — miekki
    c.save(); c.filter = 'blur(3px)'; c.fillStyle = 'rgba(0,0,0,0.5)'; rr(x + 6, y + rise + 7, size, size - 2, 5); c.fill(); c.restore();
    // sciana boczna E (gradient w glab)
    const sg = c.createLinearGradient(x + size - 8, 0, x + size, 0);
    sg.addColorStop(0, side); sg.addColorStop(1, shade(side, -0.45));
    c.fillStyle = sg; rr(x + size - 9, y + rise + 2, 9, size - 2, 3); c.fill();
    // lico: pionowy gradient (blik pod krawedzia -> soczysty -> AO na dole)
    const fg = c.createLinearGradient(0, y + rise, 0, y + rise + size);
    fg.addColorStop(0, shade(front, 0.28)); fg.addColorStop(0.12, shade(front, 0.12)); fg.addColorStop(0.55, front); fg.addColorStop(0.85, shade(front, -0.22)); fg.addColorStop(1, shade(front, -0.45));
    c.fillStyle = fg; rr(x, y + rise, size - 3, size, 4); c.fill();
    // poziomy gradient na licu (swiatlo z NW: lewa jasniejsza)
    const hg = c.createLinearGradient(x, 0, x + size, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0.14)'); hg.addColorStop(0.5, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = hg; rr(x, y + rise, size - 3, size, 4); c.fill();
    // top (podniesiony o rise): gradient NW->SE + gloss
    const tg = c.createLinearGradient(x, y, x + size, y + rise);
    tg.addColorStop(0, shade(top, 0.35)); tg.addColorStop(0.5, top); tg.addColorStop(1, shade(top, -0.18));
    c.fillStyle = tg; rr(x, y, size - 3, rise + 5, 4); c.fill();
    const gloss = c.createLinearGradient(0, y, 0, y + rise * 0.6);
    gloss.addColorStop(0, 'rgba(255,255,255,0.42)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gloss; rr(x + 3, y + 1, size - 9, rise * 0.6, 3); c.fill();
    // bevel: jasna krawedz N i W, ciemna S i E
    c.fillStyle = 'rgba(255,255,255,0.32)'; c.fillRect(x + 2, y + 1, size - 7, 2); c.fillRect(x + 1, y + 2, 2, size + rise - 4);
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(x + 2, y + rise + size - 3, size - 5, 2); c.fillRect(x + size - 5, y + rise + 2, 2, size - 5);
    // krawedz top/lico: ciemna kreska (zlom brył) + cieply refleks lawy na dole lica
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 1, y + rise + 3, size - 5, 1.5);
    const warm = c.createLinearGradient(0, y + rise + size - 12, 0, y + rise + size);
    warm.addColorStop(0, 'rgba(255,122,26,0)'); warm.addColorStop(1, 'rgba(255,122,26,0.16)');
    c.fillStyle = warm; c.fillRect(x + 2, y + rise + size - 12, size - 7, 12);
    // zaprawa: miekka fuga wokolo (jasna, lekko przezroczysta)
    c.strokeStyle = mortar; c.lineWidth = 2; c.globalAlpha = 0.55;
    rr(x + 1, y + 1, size - 4, size + rise - 2, 4); c.stroke();
    c.globalAlpha = 1;
}

function drawCracks(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number, size: number, rise: number, n: number, color: string, glow: boolean): void {
    c.strokeStyle = color; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
        let cx = x + 6 + rng() * (size - 12), cy = y + rise + 4 + rng() * (size - 8);
        c.beginPath(); c.moveTo(cx, cy);
        for (let s = 0; s < 3; s++) { cx += (rng() - 0.5) * 22; cy += (rng() - 0.5) * 22; c.lineTo(cx, cy); }
        c.stroke();
    }
    if (glow) {
        // przebija fioletowe swiatlo celi (wpieczone jasne kreski — nie live blend)
        c.strokeStyle = '#e39bff'; c.lineWidth = 3; c.globalAlpha = 0.85;
        for (let i = 0; i < 2; i++) { const gx = x + 10 + rng() * (size - 20), gy = y + rise + 8 + rng() * (size - 16); c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (rng() - 0.5) * 18, gy + 10 + rng() * 14); c.stroke(); }
        c.globalAlpha = 1;
    }
    // odpryski u dolu
    c.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + 4 + rng() * (size - 8), y + rise + size - 2 - rng() * 6, 1.5 + rng() * 2.5, 0, Math.PI * 2); c.fill(); }
}

const BRICK_STAGE = [
    { top: P.brickLight, front: P.brick, side: P.brickDark, cracks: 0 },
    { top: '#9a4236', front: '#7a3229', side: '#4e1d14', cracks: 3 },
    { top: '#7a3229', front: '#5e2419', side: '#3a140d', cracks: 6 },
] as const;

function bakeBrick(variant: number, stage: number): BakedTex {
    const size = PRISON_BRICK_SIZE, m = MARGIN, rise = RISE;
    const cv = document.createElement('canvas');
    cv.width = size + m * 2; cv.height = size + rise + m * 2;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x51 + variant * 977);
    const st = BRICK_STAGE[stage];
    drawBlock(c, m, m, size, rise, st.top, st.front, st.side, P.mortar);
    // grunge per wariant: plamki (ciemne + jasne "wypalenia") + drobne pory
    c.fillStyle = 'rgba(0,0,0,0.16)';
    for (let i = 0; i < 4 + variant; i++) { c.beginPath(); c.ellipse(m + 4 + rng() * (size - 10), m + rise + 6 + rng() * (size - 12), 3 + rng() * 5, 2 + rng() * 3, rng(), 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(255,200,160,0.14)';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(m + 6 + rng() * (size - 14), m + rise + 6 + rng() * (size - 14), 4 + rng() * 6, 2 + rng() * 3, rng(), 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 10; i++) { c.beginPath(); c.arc(m + 4 + rng() * (size - 10), m + rise + 6 + rng() * (size - 12), 0.8 + rng() * 0.9, 0, Math.PI * 2); c.fill(); }
    // 1 fuga pozioma + 1 pionowa (mur nie wyglada jak siatka) — miekkie, z cieniem
    const fy = m + rise + 16 + variant * 5, fx = m + 12 + variant * 7;
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(m + 3, fy + 1); c.lineTo(m + size - 6, fy + 1); c.moveTo(fx + 1, fy); c.lineTo(fx + 1, m + rise + size - 4); c.stroke();
    c.strokeStyle = P.mortar; c.lineWidth = 1.5; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(m + 3, fy); c.lineTo(m + size - 6, fy); c.moveTo(fx, fy); c.lineTo(fx, m + rise + size - 4); c.stroke();
    c.globalAlpha = 1;
    if (st.cracks > 0) drawCracks(c, rng, m, m, size, rise, st.cracks, '#1a0a08', stage === 2);
    return { tex: PIXI.Texture.from(cv), m, rise, size };
}

const KEY_STAGE = [
    { top: '#4a2540', front: '#331a30', side: '#1d0e1c', cracks: 0 },
    { top: '#3f1f36', front: '#2a1527', side: '#160a15', cracks: 3 },
    { top: '#331a30', front: '#20101f', side: '#100710', cracks: 6 },
] as const;

function bakeKeystone(stage: number): BakedTex {
    const size = KEYSTONE_SIZE, m = MARGIN, rise = RISE + 6;
    const cv = document.createElement('canvas');
    cv.width = size + m * 2; cv.height = size + rise + m * 2;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x4b45);
    const st = KEY_STAGE[stage];
    drawBlock(c, m, m, size, rise, st.top, st.front, st.side, '#6b3fa0');
    // obramowanie z zelaza (nity) — "to jest inne niz cegla"
    c.strokeStyle = P.ironLight; c.lineWidth = 3; c.strokeRect(m + 4, m + rise + 4, size - 8, size - 8);
    c.fillStyle = P.iron;
    for (const [rx, ry] of [[8, 8], [size - 8, 8], [8, size - 8], [size - 8, size - 8]]) { c.beginPath(); c.arc(m + rx, m + rise + ry, 3, 0, Math.PI * 2); c.fill(); }
    if (st.cracks > 0) drawCracks(c, rng, m, m, size, rise, st.cracks, '#0b040a', stage === 2);
    return { tex: PIXI.Texture.from(cv), m, rise, size };
}

let _runeTex: PIXI.Texture | null = null;
function getRuneTexture(): PIXI.Texture {
    if (_runeTex) return _runeTex;
    const cv = document.createElement('canvas');
    cv.width = 44; cv.height = 44;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(22, 22, 2, 22, 22, 22);
    g.addColorStop(0, 'rgba(226,140,255,0.55)'); g.addColorStop(1, 'rgba(142,68,173,0)');
    c.fillStyle = g; c.fillRect(0, 0, 44, 44);
    c.strokeStyle = '#f0c8ff'; c.lineWidth = 3; c.lineCap = 'round';
    // runa: romb + pionowa kreska + 2 ramiona
    c.beginPath(); c.moveTo(22, 8); c.lineTo(32, 22); c.lineTo(22, 36); c.lineTo(12, 22); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(22, 12); c.lineTo(22, 32); c.moveTo(15, 18); c.lineTo(29, 26); c.stroke();
    _runeTex = PIXI.Texture.from(cv);
    return _runeTex;
}
