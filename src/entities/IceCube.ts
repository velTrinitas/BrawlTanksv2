import * as PIXI from 'pixi.js';
import type { ICollidable } from '../types/MapType';
import type { EffectsManager } from '../rendering/Effects';
import type { AudioSys } from '../audio/AudioSys';
import { ARCTIC_PALETTE, ARCTIC_LIGHT } from '../maps/ArcticMap';

/**
 * IceCube — niszczalna krysztalowa kostka lodu (ARC-R1 "Lodowa Arena", v3 HYBRID).
 *
 * v3 = wizual AD ("Krystaliczna Kostka Oslonowa": ociosane fasety, subsurface glow,
 * wiatrowa zaspa, ostre krawedzie NW/SE) + optymalizacja AD (WARIANTY: seed%5 =>
 * 5 geometrii bazowych, wspoldzielone baked tekstury => sprite'y batchuja sie,
 * ~zero VRAM per kostka) — ZINTEGROWANE z mechanika v1/v2, ktorej wersja AD nie
 * zawierala (recenzja): takeDamage/3 stany obrazen (granatowienie!)/shatter+gem/
 * respawn 60s/getExtraCollidables. Stany obrazen = 5 wariantow x 3 stany = 15
 * malych tekstur w cache; przy trafieniu SWAP tekstury sprite'a (geometria per
 * wariant IDENTYCZNA miedzy stanami — zmienia sie tylko paleta + gestosc peknieC).
 * FIX review (3. raz ta sama zasada): glow auroraCyan -> crackSun (cyjan w polu
 * gry = jezyk freeze/stealth).
 *
 * Mechanika (decyzje Mariusza): pociski gracza I wrogow niszcza (duck-typing
 * takeDamage w Bullet/EnemyBullet); rozbicie = lekki wybuch lodu (zero obrazen)
 * + ~28% gem (onShatter w main.ts) + respawn 60s. ICollidable: x/y = TOP-LEFT.
 */

export const ICE_CUBE_SIZE = 56;
const ICE_HP = 250;          // twardy(100dmg)=3 hity, zwiad(80)=4, snajper(300)=1
const RESPAWN_TIME = 60;     // sekundy (jak Crate)
const VARIANT_COUNT = 5;     // AD: wspoldzielone tekstury => batching + maly VRAM
// Feedback Mariusza: RISE 48 robil "slupy" — SZESCIAN = top-face uniesiony o ~40% stopy.
const RISE = 22;
const MARGIN = 20;           // margines canvasu (cien-czworokat + zaspa)

/** Kolor akcentow lodu (mini-rozbryzg trafienia, ring, blysk respawnu). */
const SPLASH_LIGHT = 0xbfe6f5;

function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface BakedTex { tex: PIXI.Texture; m: number; rise: number; }
/** Klucz = variant * 10 + stage => max 15 tekstur (92x140px kazda). */
const ICE_CUBE_CACHE = new Map<number, BakedTex>();

function getIceCubeTexture(variant: number, stage: number): BakedTex {
    const key = variant * 10 + stage;
    const cached = ICE_CUBE_CACHE.get(key);
    if (cached) return cached;
    const bt = buildIceCubeCanvas(variant, stage);
    ICE_CUBE_CACHE.set(key, bt);
    return bt;
}

export class IceCube implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed: boolean = false;

    private origX: number;
    private origY: number;
    private hp: number = ICE_HP;
    private respawnTimer: number = 0;
    private variant: number;
    private stage: number = 0;

    private effects: EffectsManager;
    private audio: AudioSys;
    private onShatter: ((cx: number, cy: number) => void) | null;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;

    constructor(
        x: number,
        y: number,
        seed: number,
        worldContainer: PIXI.Container,
        effects: EffectsManager,
        audio: AudioSys,
        onShatter?: (cx: number, cy: number) => void,
    ) {
        this.x = x;
        this.y = y;
        this.w = ICE_CUBE_SIZE;
        this.h = ICE_CUBE_SIZE;
        this.origX = x;
        this.origY = y;
        this.variant = seed % VARIANT_COUNT;
        this.effects = effects;
        this.audio = audio;
        this.onShatter = onShatter ?? null;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + ICE_CUBE_SIZE; // Y-sort po dolnej krawedzi
        worldContainer.addChild(this.container);

        const bt = getIceCubeTexture(this.variant, 0);
        this.sprite = new PIXI.Sprite(bt.tex);
        this.sprite.x = -bt.m;                 // canvas(m, m+rise) == local(0,0) = top-left hitboxa
        this.sprite.y = -(bt.rise + bt.m);
        this.container.addChild(this.sprite);
    }

    // ── DAMAGE + RESPAWN (wzorzec Crate; wizual = swap wspoldzielonej tekstury) ──
    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.shatter();
            return;
        }
        // granatowienie: przelicz stan i podmien teksture (geometria zostaje — tylko paleta+pekniecia)
        const newStage = this.hp > ICE_HP * 0.6 ? 0 : this.hp > ICE_HP * 0.25 ? 1 : 2;
        if (newStage !== this.stage) {
            this.stage = newStage;
            this.sprite.texture = getIceCubeTexture(this.variant, newStage).tex;
        }
        // mini rozbryzg + drgniecie
        this.effects.spawnEnemyHitSparks(hitX, hitY, SPLASH_LIGHT);
        const shakeAmt = 1.5;
        this.container.x = this.origX + (Math.random() - 0.5) * shakeAmt;
        this.container.y = this.origY + (Math.random() - 0.5) * shakeAmt;
        setTimeout(() => {
            if (this.container && !this.isDestroyed) {
                this.container.x = this.origX;
                this.container.y = this.origY;
            }
        }, 80);
    }

    private shatter(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        this.w = 0;
        this.h = 0;
        this.container.visible = false;

        // "lekki wybuch lodu": rozbryzg + dymek + maly ring — ZERO obrazen
        const cx = this.origX + ICE_CUBE_SIZE / 2;
        const cy = this.origY + ICE_CUBE_SIZE / 2;
        this.effects.spawnIceShatter(cx, cy);
        this.effects.spawnShockwaveRing(cx, cy, 46, SPLASH_LIGHT);
        this.audio.playCrateBreak(); // TODO: dedykowany ice-crack sfx (asset od Mariusza)

        this.onShatter?.(cx, cy); // main.ts: ~28% szansa na gem
    }

    private respawn(): void {
        this.isDestroyed = false;
        this.hp = ICE_HP;
        this.stage = 0;
        this.w = ICE_CUBE_SIZE;
        this.h = ICE_CUBE_SIZE;
        this.sprite.texture = getIceCubeTexture(this.variant, 0).tex;
        this.container.visible = true;
        this.effects.spawnEnemyHitSparks(this.origX + ICE_CUBE_SIZE / 2, this.origY + ICE_CUBE_SIZE / 2, SPLASH_LIGHT);
    }

    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        if (this.isDestroyed) {
            this.respawnTimer -= 1 / 60;
            if (this.respawnTimer <= 0) this.respawn();
        }
    }

    /** Padded hitbox dla PLAYER collision (wzorzec Crate v0.34.1) — do buildings[]. */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        return [{
            get x() { return self.isDestroyed ? -10000 : self.origX - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.origY - PAD; },
            get w() { return self.isDestroyed ? 0 : ICE_CUBE_SIZE + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : ICE_CUBE_SIZE + PAD * 2; },
            update: () => { /* static */ },
        }];
    }
}

// =================================================================
// Canvas 2D bake (AD "Krystaliczna Kostka" + stany obrazen) — 5 wariantow x 3 stany
// =================================================================

/** Paleta faset per stan obrazen (0 lod -> 1 pekniety -> 2 granat przed rozpadem). */
const STAGE = [
    // feedback Mariusza: prawa faseta LEKKO jasniejsza (byla shadow->crackShadow)
    { topF: ARCTIC_PALETTE.midtint, leftHi: '#eef5f9', leftMid: ARCTIC_PALETTE.crackSun, leftLo: ARCTIC_PALETTE.midtint,
      rightHi: '#7fa3cb', rightLo: ARCTIC_PALETTE.shadow, glowA: 0.30, cracks: 0 },
    { topF: '#8fb0c6', leftHi: ARCTIC_PALETTE.crackSun, leftMid: ARCTIC_PALETTE.midtint, leftLo: ARCTIC_PALETTE.shadow,
      rightHi: ARCTIC_PALETTE.crackShadow, rightLo: '#12294f', glowA: 0.18, cracks: 3 },
    { topF: ARCTIC_PALETTE.shadow, leftHi: ARCTIC_PALETTE.midtint, leftMid: ARCTIC_PALETTE.shadow, leftLo: ARCTIC_PALETTE.crackShadow,
      rightHi: ARCTIC_PALETTE.crackShadow, rightLo: ARCTIC_PALETTE.depth, glowA: 0.08, cracks: 6 },
] as const;

function buildIceCubeCanvas(variant: number, stage: number): BakedTex {
    // Geometria seedowana TYLKO wariantem — identyczny ksztalt we wszystkich stanach.
    const rng = makeRng(0x1CE + variant * 7919);
    const w = ICE_CUBE_SIZE, h = ICE_CUBE_SIZE;
    const rise = RISE, m = MARGIN;
    const S = STAGE[stage];
    const P = ARCTIC_PALETTE;

    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w + m * 2);
    cv.height = Math.ceil(h + rise + m * 2);
    const c = cv.getContext('2d')!;
    c.translate(m, m + rise); // local (0,0) = top-left hitboxa

    // ── 1. Cien rzucany — CZWOROKAT (feedback: szescian nie rzuca okraglego cienia!)
    // Rownolegloboki rzut podstawy przesuniety SE.
    c.globalAlpha = 0.22;
    c.fillStyle = P.depth;
    c.beginPath();
    c.moveTo(3 + ARCTIC_LIGHT.shX, h - 4);
    c.lineTo(w + ARCTIC_LIGHT.shX + 2, h - 4);
    c.lineTo(w + ARCTIC_LIGHT.shX + 12, h + 8);
    c.lineTo(13 + ARCTIC_LIGHT.shX, h + 8);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;

    // ── 2. Wind-swept snow u podstawy (AD — nizsza, szescian siedzi nisko) ──
    c.fillStyle = P.frost;
    c.beginPath();
    c.moveTo(-w * 0.15, h * 0.72);
    c.bezierCurveTo(w * 0.2, h * 0.52, w * 0.8, h * 0.62, w * 1.15, h * 0.78);
    c.bezierCurveTo(w * 0.9, h * 1.02, w * 0.2, h * 0.96, -w * 0.15, h * 0.72);
    c.fill();

    // ── 3. SZESCIAN (feedback: bryla kubiczna, nie slup) — top-face rownoleglobok
    // cofniety w gore o RISE, front dzielony grania na 2 fasety (styl AD zostaje).
    const jit = () => (rng() - 0.5) * 4;
    const topY = -rise;                       // gorna krawedz top-face
    const frontY = 4 + jit() * 0.5;           // dolna krawedz top-face == gorna frontu
    const TL = { x: 5 + jit(), y: topY };
    const TR = { x: w - 5 + jit(), y: topY };
    const FL = { x: 0, y: frontY };
    const FR = { x: w, y: frontY };
    const BL = { x: 2 + jit() * 0.5, y: h };
    const BR = { x: w - 2 + jit() * 0.5, y: h };
    const midX = w * (0.42 + rng() * 0.16);   // gran frontu (styl AD)
    const midTopY = frontY + 2;

    // subsurface glow (crackSun — cyjan tylko poza polem gry)
    c.save();
    c.globalCompositeOperation = 'lighter';
    const coreGlow = c.createRadialGradient(midX, frontY + (h - frontY) * 0.4, 0, midX, frontY + (h - frontY) * 0.4, h * 0.8);
    coreGlow.addColorStop(0, P.crackSun);
    coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = coreGlow;
    c.globalAlpha = S.glowA;
    c.beginPath();
    c.moveTo(TL.x, TL.y); c.lineTo(TR.x, TR.y); c.lineTo(BR.x, BR.y); c.lineTo(BL.x, BL.y);
    c.closePath();
    c.fill();
    c.restore();

    // faseta TOP (rownoleglobok — pelna gora szescianu)
    c.fillStyle = S.topF;
    c.beginPath();
    c.moveTo(TL.x, TL.y); c.lineTo(TR.x, TR.y); c.lineTo(FR.x, FR.y); c.lineTo(FL.x, FL.y);
    c.closePath();
    c.fill();
    // blik NW na top-face
    c.fillStyle = S.leftHi;
    c.globalAlpha = 0.45;
    c.beginPath();
    c.moveTo(TL.x, TL.y); c.lineTo(TR.x * 0.62, TR.y); c.lineTo(FL.x + w * 0.5, frontY - 1); c.lineTo(FL.x, FL.y);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;

    // faseta FRONT-LEFT (swiatlo NW — gradient AD)
    const gradLeft = c.createLinearGradient(FL.x, frontY, midX, h);
    gradLeft.addColorStop(0, S.leftHi);
    gradLeft.addColorStop(0.3, S.leftMid);
    gradLeft.addColorStop(1, S.leftLo);
    c.fillStyle = gradLeft;
    c.beginPath();
    c.moveTo(FL.x, FL.y); c.lineTo(midX, midTopY); c.lineTo(midX, h); c.lineTo(BL.x, BL.y);
    c.closePath();
    c.fill();

    // faseta FRONT-RIGHT (cien SE — gradient AD)
    const gradRight = c.createLinearGradient(midX, frontY, FR.x, h);
    gradRight.addColorStop(0, S.rightHi);
    gradRight.addColorStop(1, S.rightLo);
    c.fillStyle = gradRight;
    c.beginPath();
    c.moveTo(midX, midTopY); c.lineTo(FR.x, FR.y); c.lineTo(BR.x, BR.y); c.lineTo(midX, h);
    c.closePath();
    c.fill();

    // ── 4. Wewnetrzne zalamania swiatla (AD, na froncie) ──
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = P.crackSun;
    c.lineWidth = 1;
    for (let i = 0; i < 3 + Math.floor(rng() * 3); i++) {
        c.globalAlpha = 0.2 + rng() * 0.3;
        c.beginPath();
        const sx = w * 0.15 + rng() * w * 0.7;
        const sy = frontY + 4 + rng() * (h - frontY) * 0.5;
        c.moveTo(sx, sy);
        c.lineTo(sx + (rng() - 0.5) * 20, sy + 8 + rng() * 12);
        c.lineTo(sx + (rng() - 0.5) * 16, sy + 16 + rng() * 12);
        c.stroke();
    }
    c.restore();

    // ── 5. Ostre krawedzie (AD: high-contrast) ──
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = stage === 2 ? P.crackSun : '#ffffff';
    c.lineWidth = 2.2;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.moveTo(BL.x, BL.y); c.lineTo(FL.x, FL.y); c.lineTo(TL.x, TL.y); c.lineTo(TR.x, TR.y);
    c.stroke();
    c.strokeStyle = P.depth;
    c.lineWidth = 1.4;
    c.globalAlpha = 0.55;
    c.beginPath();
    c.moveTo(midX, midTopY); c.lineTo(midX, h);
    c.stroke();
    // krawedz frontu (styk top/front)
    c.strokeStyle = P.crackShadow;
    c.lineWidth = 1;
    c.globalAlpha = 0.35;
    c.beginPath();
    c.moveTo(FL.x, FL.y); c.lineTo(FR.x, FR.y);
    c.stroke();
    c.globalAlpha = 1;

    // ── 6. Pekniecia OBRAZEN (rosna ze stanem — granatowienie ma narracje) ──
    if (S.cracks > 0) {
        c.strokeStyle = stage === 2 ? P.depth : P.crackShadow;
        c.lineWidth = 1.2 + stage * 0.4;
        for (let i = 0; i < S.cracks; i++) {
            c.globalAlpha = 0.55 + rng() * 0.3;
            const scarX = 6 + rng() * (w - 12);
            const scarY = topY + 6 + rng() * (h - topY - 12);
            c.beginPath();
            c.moveTo(scarX, scarY);
            c.lineTo(scarX + (rng() - 0.5) * 16, scarY + 7 + rng() * 12);
            c.lineTo(scarX + (rng() - 0.5) * 12, scarY + 15 + rng() * 12);
            c.stroke();
        }
        c.globalAlpha = 1;
    }

    // ── 7. Czapa sniegu NA TOP-FACE (przy stage 2 zsypana) ──
    if (stage < 2) {
        c.fillStyle = P.frost;
        c.globalAlpha = stage === 0 ? 0.95 : 0.55;
        c.beginPath();
        c.ellipse(w * 0.5, topY + 5, w * 0.30, 4 + rng() * 3, (rng() - 0.5) * 0.3, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
    }

    return { tex: PIXI.Texture.from(cv), m, rise };
}
