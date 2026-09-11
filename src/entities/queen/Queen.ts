import * as PIXI from 'pixi.js';
import { DUNGEON_PALETTE as P } from '../../maps/dungeon/dungeonPalette';

/**
 * Queen — Krolowa w celi (SAVE THE QUEEN Q2). Pieczony sprite Canvas 2D (2 tekstury:
 * 'idle' + 'wave' na swap), lekki bob +/-3 px (Sensoryka: "zyje"). ZERO zlota: perlowa
 * suknia, tiara srebrno-perlowa z ROZOWYM klejnotem, peleryna w krolewskim fiolecie
 * (klamra z kolorem kafla #8e44ad).
 *
 * Hitbox dotkniecia = AABB sprite'a + pad (kontrakt K9 padow) — liczony w QueenSystem.
 * Reakcje: wave(ms) — pomachanie (cegla z wewnetrznej warstwy rozbita), cheer(ms) —
 * rece w gore (Zwornik). Q5: 'throw' (serce), poswiata PANIKI, flourish OCALONA.
 */

const TEX_W = 96, TEX_H = 128;
let _idle: PIXI.Texture | null = null;
let _wave: PIXI.Texture | null = null;

function bakeQueen(pose: 'idle' | 'wave'): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const c = cv.getContext('2d')!;
    const cx = TEX_W / 2;
    // cien
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(cx + 3, TEX_H - 8, 30, 9, 0, 0, Math.PI * 2); c.fill();
    // peleryna (fiolet) — szeroka u dolu
    c.fillStyle = P.violet;
    c.beginPath(); c.moveTo(cx - 20, 44); c.quadraticCurveTo(cx - 44, 90, cx - 36, TEX_H - 12); c.lineTo(cx + 36, TEX_H - 12); c.quadraticCurveTo(cx + 44, 90, cx + 20, 44); c.closePath(); c.fill();
    c.fillStyle = '#6d2f8a'; c.beginPath(); c.moveTo(cx - 36, TEX_H - 12); c.lineTo(cx + 36, TEX_H - 12); c.lineTo(cx + 30, TEX_H - 18); c.lineTo(cx - 30, TEX_H - 18); c.closePath(); c.fill();
    // suknia (perla) z magentowym pasem
    const dg = c.createLinearGradient(cx - 26, 0, cx + 26, 0);
    dg.addColorStop(0, '#d9d0e0'); dg.addColorStop(0.45, P.pearl); dg.addColorStop(1, '#c9bfd4');
    c.fillStyle = dg;
    c.beginPath(); c.moveTo(cx - 14, 48); c.quadraticCurveTo(cx - 30, 92, cx - 26, TEX_H - 16); c.lineTo(cx + 26, TEX_H - 16); c.quadraticCurveTo(cx + 30, 92, cx + 14, 48); c.closePath(); c.fill();
    c.fillStyle = P.magenta; c.fillRect(cx - 15, 58, 30, 7);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(cx - 10, 66); c.quadraticCurveTo(cx - 20, 92, cx - 18, TEX_H - 18); c.lineTo(cx - 10, TEX_H - 18); c.quadraticCurveTo(cx - 12, 92, cx - 4, 66); c.closePath(); c.fill();
    // ramiona / rece
    c.strokeStyle = '#f3d9c6'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - 12, 54); c.lineTo(cx - 24, 78); c.stroke();
    if (pose === 'wave') { c.beginPath(); c.moveTo(cx + 12, 54); c.lineTo(cx + 26, 30); c.stroke(); }
    else { c.beginPath(); c.moveTo(cx + 12, 54); c.lineTo(cx + 24, 78); c.stroke(); }
    // rekawy (fiolet)
    c.strokeStyle = P.violet; c.lineWidth = 9;
    c.beginPath(); c.moveTo(cx - 12, 52); c.lineTo(cx - 18, 64); c.stroke();
    if (pose === 'wave') { c.beginPath(); c.moveTo(cx + 12, 52); c.lineTo(cx + 19, 42); c.stroke(); }
    else { c.beginPath(); c.moveTo(cx + 12, 52); c.lineTo(cx + 18, 64); c.stroke(); }
    // szyja + glowa
    c.fillStyle = '#f3d9c6';
    c.fillRect(cx - 5, 36, 10, 10);
    c.beginPath(); c.arc(cx, 28, 15, 0, Math.PI * 2); c.fill();
    // wlosy (ciemny brąz) — po bokach twarzy i z tylu
    c.fillStyle = '#4a2c22';
    c.beginPath(); c.arc(cx, 24, 16, Math.PI, 0); c.fill();
    c.fillRect(cx - 16, 24, 6, 20); c.fillRect(cx + 10, 24, 6, 20);
    // twarz: oczy + usmiech
    c.fillStyle = '#2a1a2e'; c.beginPath(); c.arc(cx - 5, 29, 1.8, 0, Math.PI * 2); c.arc(cx + 5, 29, 1.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.magenta; c.lineWidth = 1.6; c.beginPath(); c.arc(cx, 33, 4, 0.2, Math.PI - 0.2); c.stroke();
    // tiara: srebrno-perlowa z rozowym klejnotem (ZERO zlota)
    c.fillStyle = '#d8dde6';
    c.beginPath(); c.moveTo(cx - 14, 16); c.lineTo(cx - 9, 6); c.lineTo(cx - 4, 13); c.lineTo(cx, 3); c.lineTo(cx + 4, 13); c.lineTo(cx + 9, 6); c.lineTo(cx + 14, 16); c.closePath(); c.fill();
    c.strokeStyle = '#f5f7fa'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#ff5fb0'; c.beginPath(); c.arc(cx, 10, 3.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx - 1, 9, 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = P.pearl; for (const px of [-9, 9]) { c.beginPath(); c.arc(cx + px, 8, 1.8, 0, Math.PI * 2); c.fill(); }
    return PIXI.Texture.from(cv);
}

export class Queen {
    /** srodek (world) */
    public x: number;
    public y: number;
    public readonly container: PIXI.Container;
    private readonly sprite: PIXI.Sprite;
    private t = 0;
    private poseUntil = 0;
    private readonly baseY: number;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.baseY = y;
        this.container = new PIXI.Container();
        this.container.x = x; this.container.y = y;
        this.container.zIndex = y + TEX_H / 2;
        worldContainer.addChild(this.container);
        if (!_idle) _idle = bakeQueen('idle');
        if (!_wave) _wave = bakeQueen('wave');
        this.sprite = new PIXI.Sprite(_idle);
        this.sprite.anchor.set(0.5, 0.5);
        this.container.addChild(this.sprite);
    }

    /** AABB dotkniecia (world, TOP-LEFT) — sprite + pad. */
    public aabb(pad: number): { x: number; y: number; w: number; h: number } {
        return { x: this.x - TEX_W / 2 - pad, y: this.y - TEX_H / 2 - pad, w: TEX_W + pad * 2, h: TEX_H + pad * 2 };
    }

    /** Pomachanie (swap tekstury) na ms. */
    public wave(ms: number): void {
        this.sprite.texture = _wave!;
        this.poseUntil = performance.now() + ms;
    }

    public update(delta: number): void {
        this.t += delta / 60;
        this.container.y = this.baseY + Math.sin(this.t * 2.4) * 3; // bob +/-3 px
        if (this.poseUntil > 0 && performance.now() >= this.poseUntil) {
            this.poseUntil = 0;
            this.sprite.texture = _idle!;
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
