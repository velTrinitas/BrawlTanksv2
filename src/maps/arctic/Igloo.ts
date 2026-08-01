import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { ARCTIC_PALETTE, ARCTIC_LIGHT } from '../ArcticMap';

/**
 * Igloo — kopula ze sniegowych blokow (ARC-B v2 AAA, kierunek AD).
 *
 * v2 (AD "Soul & Depth"): CIEPLE swiatlo bijace z wnetrza (pomaranczowy blask
 * zamiast czarnej dziury) + light-spill rozlany na snieg przed wejsciem +
 * organiczna zaspa bezier u podstawy. Narracyjny kontrast zimno-cieplo
 * ("ktos tu mieszka") — spojny z oknami Stacji Polarnej.
 *
 * Collidable (buildings + solidBuildings). Baked Canvas 2D (AA) -> Sprite
 * (pojedyncza instancja => cache staly). ICollidable: x/y = TOP-LEFT hitboxa;
 * konstruktor przyjmuje CENTER. Static — update() no-op.
 * Baked art NIE odswieza sie przez HMR (re-entry mapy).
 */

interface BakedTex { tex: PIXI.Texture; m: number; rise: number; }
let IGLOO_TEX: BakedTex | null = null;

export class Igloo implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    /** ARC-R2b: prowokacja Yeti — ostrzeliwanie igloo akumuluje dmg, prog odpala callback. */
    public onProvoked: (() => void) | null = null;
    private hitAccum = 0;
    private origX: number = 0;
    private origY: number = 0;

    private container: PIXI.Container;

    /** cx/cy = CENTER (layout ARC-B); hitbox przeliczany na top-left. */
    constructor(cx: number, cy: number, size: number, worldContainer: PIXI.Container) {
        this.w = size;
        this.h = size;
        this.x = cx - size / 2;
        this.y = cy - size / 2;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + size; // Y-sort po dolnej krawedzi
        worldContainer.addChild(this.container);
        this.origX = this.x;
        this.origY = this.y;

        if (!IGLOO_TEX) IGLOO_TEX = buildIglooCanvas(size);
        const spr = new PIXI.Sprite(IGLOO_TEX.tex);
        spr.x = -IGLOO_TEX.m;
        spr.y = -(IGLOO_TEX.rise + IGLOO_TEX.m);
        this.container.addChild(spr);
    }

    public update(): void {
        // static — zero pracy per-frame
    }

    /**
     * ARC-R2b: pociski (gracza I wrogow — duck-typing w Bullet/EnemyBullet) "obrazaja" igloo.
     * Igloo NIE jest niszczalne — trafienia akumuluja sie i po progu budza Yeti.
     * Sensoryka: drgniecie kopuly przy kazdym trafieniu.
     */
    public takeDamage(dmg: number, _hitX: number, _hitY: number): void {
        this.hitAccum += dmg;
        const shake = 2;
        this.container.x = this.origX + (Math.random() - 0.5) * shake;
        this.container.y = this.origY + (Math.random() - 0.5) * shake;
        setTimeout(() => {
            this.container.x = this.origX;
            this.container.y = this.origY;
        }, 70);
        if (this.hitAccum >= 300 && this.onProvoked) { // ~3 trafienia standardowym dzialem
            this.hitAccum = 0;
            this.onProvoked();
        }
    }
}

// =================================================================
// Canvas 2D bake (AA)
// =================================================================

function buildIglooCanvas(size: number): BakedTex {
    const rise = Math.round(size * 0.52);
    const m = 30; // margines na rozlane cieple swiatlo
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(size + m * 2);
    cv.height = Math.ceil(size + rise + m * 2);
    const c = cv.getContext('2d')!;
    c.translate(m, m + rise);              // local (0,0) = top-left hitboxa

    const P = ARCTIC_PALETTE;
    const cx = size / 2;
    const domeCY = size * 0.52;
    const domeRX = size * 0.50;
    const domeRY = size * 0.50 + rise * 0.9;

    const WARM_GLOW = '#ffa845'; // cieply ogien wnetrza

    // ── 1. Cien kontaktowy (SE) ──
    c.globalAlpha = 0.18; c.fillStyle = P.depth;
    c.beginPath(); c.ellipse(cx + ARCTIC_LIGHT.shX * 2, size * 0.86, size * 0.56, size * 0.22, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    // ── 2. AAA Light Spill (AD): cieple swiatlo rozlane przed wejsciem ──
    c.save();
    c.globalCompositeOperation = 'lighter';
    const spillGrad = c.createRadialGradient(cx, size * 0.8, 0, cx, size * 0.9, size * 0.4);
    spillGrad.addColorStop(0, 'rgba(255, 168, 69, 0.4)');
    spillGrad.addColorStop(1, 'rgba(255, 168, 69, 0)');
    c.fillStyle = spillGrad;
    c.beginPath(); c.ellipse(cx, size * 0.9, size * 0.4, size * 0.2, 0, 0, Math.PI * 2); c.fill();
    c.restore();

    // ── 3. Kopula (clip: nie rysuj ponizej podstawy) ──
    c.save();
    c.beginPath();
    c.rect(-m, -rise - m, size + m * 2, rise + size * 0.86 + m);
    c.clip();

    const gDome = c.createLinearGradient(cx - domeRX, domeCY - domeRY, cx + domeRX * 0.7, domeCY);
    gDome.addColorStop(0, P.albedo);       // NW jasne
    gDome.addColorStop(0.55, P.frost);
    gDome.addColorStop(1, P.midtint);      // SE chlodniejsze
    c.fillStyle = gDome;
    c.beginPath(); c.ellipse(cx, domeCY, domeRX, domeRY, 0, Math.PI, Math.PI * 2); c.fill();
    c.beginPath(); c.rect(cx - domeRX, domeCY - 1, domeRX * 2, size * 0.34); c.fill();

    // cien SE na kopule
    c.globalAlpha = 0.25; c.fillStyle = P.shadow;
    c.beginPath(); c.ellipse(cx + domeRX * 0.42, domeCY - domeRY * 0.1, domeRX * 0.55, domeRY * 0.62, -0.35, -Math.PI * 0.4, Math.PI * 0.55); c.fill();
    c.globalAlpha = 1;

    // fugi blokow: 3 luki poziome + promieniste pionowe
    c.strokeStyle = P.shadow; c.globalAlpha = 0.35; c.lineWidth = 1.5;
    for (const t of [0.30, 0.58, 0.82]) {
        c.beginPath(); c.ellipse(cx, domeCY, domeRX * (0.55 + t * 0.45), domeRY * t, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    }
    for (let i = 1; i <= 6; i++) {
        const a = Math.PI + (i / 7) * Math.PI;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * domeRX * 0.62, domeCY + Math.sin(a) * domeRY * 0.62);
        c.lineTo(cx + Math.cos(a) * domeRX * 0.98, domeCY + Math.sin(a) * domeRY * 0.98);
        c.stroke();
    }
    c.globalAlpha = 1;
    c.restore();

    // ── 4. Tunel wejsciowy z CIEPLYM blaskiem wnetrza (AD) ──
    const tw = size * 0.34, th = size * 0.30, tx = cx - tw / 2, ty = size * 0.56;
    const gTun = c.createLinearGradient(tx, ty, tx + tw, ty);
    gTun.addColorStop(0, P.frost); gTun.addColorStop(1, P.midtint);
    c.fillStyle = gTun;
    c.beginPath(); c.ellipse(cx, ty + th * 0.55, tw * 0.62, th * 0.62, 0, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(tx + tw * 0.04, ty + th * 0.5, tw * 0.92, th * 0.42);

    // wnetrze: cieply pomaranczowy blask -> braz -> mrok (zamiast czarnej dziury)
    const holeGrad = c.createRadialGradient(cx, ty + th * 0.8, 0, cx, ty + th * 0.7, tw * 0.4);
    holeGrad.addColorStop(0, WARM_GLOW);
    holeGrad.addColorStop(0.7, '#8a3f00');
    holeGrad.addColorStop(1, P.depth);
    c.fillStyle = holeGrad;
    c.beginPath(); c.ellipse(cx, ty + th * 0.72, tw * 0.30, th * 0.38, 0, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(cx - tw * 0.30, ty + th * 0.70, tw * 0.60, th * 0.24);

    // fuga na tunelu
    c.strokeStyle = P.shadow; c.globalAlpha = 0.45; c.lineWidth = 2;
    c.beginPath(); c.ellipse(cx, ty + th * 0.62, tw * 0.47, th * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.globalAlpha = 1;

    // ── 5. Zaspa bezier wokol podstawy (windswept, AD) ──
    c.fillStyle = P.frost; c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(cx - size * 0.5, size * 0.75);
    c.bezierCurveTo(cx - size * 0.7, size * 0.9, cx, size * 0.95, cx + size * 0.6, size * 0.85);
    c.bezierCurveTo(cx + size * 0.4, size * 0.8, cx, size * 0.8, cx - size * 0.5, size * 0.75);
    c.fill();
    c.globalAlpha = 1;

    // ── 6. Zloty glint na szczycie ──
    c.fillStyle = P.gold; c.globalAlpha = 0.8;
    c.beginPath(); c.arc(cx - domeRX * 0.15, domeCY - domeRY * 0.86, 1.8, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    return { tex: PIXI.Texture.from(cv), m, rise };
}
