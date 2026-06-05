import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * Pojedyncza piramida z parallax 3-warstwowym.
 * 
 * Warstwy (kolejne parallax strengths):
 *   - gfxBase  (0% parallax) — cień, sand ring wokół podstawy. STATIC drawn raz.
 *   - gfxMid   (5% parallax) — 4 walls trapezoidalne + step lines + wejście do grobowca. STATIC.
 *   - gfxTop   (12% parallax) — pyramidion gold + apex glow flicker + entrance torch glow. DYNAMIC.
 * 
 * Efekt głębi: gdy kamera porusza się, warstwy mid i top "uciekają" w stronę kamery,
 * dając wrażenie 3D bez prawdziwego 3D. Pyramidion przesuwa się najsilniej (12% parallax)
 * — wygląda jakby "leans" w przeciwną stronę kamery.
 * 
 * Hitbox: rectangle 55% × 55% size, centered at (x, y). Mniejszy niż visual,
 * żeby gracz mógł podjechać blisko piramidy.
 */
const PALETTE = {
    sandLight:  0xd4a865,  // N wall (sun-facing, najjaśniejsza)
    sandMid:    0xb8884a,  // E + W walls
    sandDark:   0x8a5e2a,  // S wall (cień)
    rim:        0x6a4a1e,  // step lines na walls
    pyramidion: 0xf4d76a,  // gold capstone
    entrance:   0x3a2410,  // ciemny otwór do grobowca
    glow:       0xff8c2a,  // pochodnia z wewnątrz
    apexGlow:   0xfff4a0,  // jasny halo wokół pyramidion
};

export class Pyramid implements ICollidable {
    public x: number; public y: number;
    public w: number; public h: number;
    
    private gfxBase: PIXI.Graphics;
    private gfxMid: PIXI.Graphics;
    private gfxTop: PIXI.Graphics;
    
    private size: number;
    private seed: number;
    
    // Parallax strengths (factor offset = (pos - cameraCenter) × strength)
    private static readonly PARALLAX_MID = 0.05;
    private static readonly PARALLAX_TOP = 0.12;
    
    constructor(x: number, y: number, size: number, seed: number, container: PIXI.Container) {
        this.x = x; this.y = y;
        this.size = size;
        // Hitbox 55% size — gracz może podjechać blisko piramidy bez kolizji z odległym kawałkiem visual
        this.w = size * 0.55;
        this.h = size * 0.55;
        this.seed = seed;
        
        this.gfxBase = new PIXI.Graphics();
        this.gfxMid = new PIXI.Graphics();
        this.gfxTop = new PIXI.Graphics();
        
        // zIndex w worldContainer (sorted by y) — base lowest, top highest
        this.gfxBase.zIndex = y - size * 0.4;
        this.gfxMid.zIndex = y;
        this.gfxTop.zIndex = y + size * 0.5;
        
        this.gfxBase.position.set(x, y);
        this.gfxMid.position.set(x, y);
        this.gfxTop.position.set(x, y);
        
        container.addChild(this.gfxBase);
        container.addChild(this.gfxMid);
        container.addChild(this.gfxTop);
        
        // Static rendering raz w konstruktorze (warstwy base + mid bez animacji)
        this.drawBase();
        this.drawMid();
        // drawTop() jest DYNAMIC (apex glow flicker + torch flicker) — wywoływane co frame w update()
    }
    
    /**
     * Warstwa BASE (0% parallax) — cień piramidy + sand ring wokół podstawy.
     */
    private drawBase(): void {
        const g = this.gfxBase;
        g.clear();
        const hs = this.size / 2;
        
        // Cień (długi, sun from upper-left → shadow do dolu-prawo)
        g.beginFill(0x000000, 0.35);
        g.drawEllipse(hs * 0.45, hs * 0.55, hs * 1.15, hs * 0.55);
        g.endFill();
        
        // Sand ring (rozsypany piasek wokół base, jaśniejsza wewnętrzna)
        g.beginFill(PALETTE.sandMid, 0.55);
        g.drawEllipse(0, 0, hs * 1.02, hs * 0.36);
        g.endFill();
        
        g.beginFill(PALETTE.sandLight, 0.4);
        g.drawEllipse(0, 0, hs * 0.9, hs * 0.28);
        g.endFill();
        
        // Drobny detail — kilka małych kropek piasku wokół (rozsypany sand)
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + this.seed * 0.3;
            const r = hs * (0.95 + Math.sin(i * 1.7 + this.seed) * 0.1);
            g.beginFill(PALETTE.sandDark, 0.4);
            g.drawCircle(Math.cos(a) * r, Math.sin(a) * r * 0.32, 1.5);
            g.endFill();
        }
    }
    
    /**
     * Warstwa MID (5% parallax) — 4 walls trapezoidalne + step lines + wejście do grobowca.
     */
    private drawMid(): void {
        const g = this.gfxMid;
        g.clear();
        const s = this.size;
        const hs = s / 2;
        
        // Apex point — przesunięty do góry (perspektywa "wertykalna")
        const apexX = 0;
        const apexY = -hs * 0.2;
        
        // 4 corners of pyramidal base (w warstwie mid)
        const tlX = -hs, tlY = -hs;
        const trX = hs,  trY = -hs;
        const brX = hs,  brY = hs;
        const blX = -hs, blY = hs;
        
        // N wall (top, sun-facing — najjaśniejsza)
        g.lineStyle(1.8, 0x000000, 0.95);
        g.beginFill(PALETTE.sandLight);
        g.moveTo(tlX, tlY);
        g.lineTo(trX, trY);
        g.lineTo(apexX, apexY);
        g.closePath();
        g.endFill();
        
        // E wall (right — mid lit)
        g.beginFill(PALETTE.sandMid);
        g.moveTo(trX, trY);
        g.lineTo(brX, brY);
        g.lineTo(apexX, apexY);
        g.closePath();
        g.endFill();
        
        // S wall (bottom — cień, najciemniejsza)
        g.beginFill(PALETTE.sandDark);
        g.moveTo(brX, brY);
        g.lineTo(blX, blY);
        g.lineTo(apexX, apexY);
        g.closePath();
        g.endFill();
        
        // W wall (left — mid lit, lekko ciemniejsza niż E)
        g.beginFill(PALETTE.sandMid);
        g.moveTo(blX, blY);
        g.lineTo(tlX, tlY);
        g.lineTo(apexX, apexY);
        g.closePath();
        g.endFill();
        
        // Step lines (stepped pyramid, 3 poziomy) — koncentryczne czworokąty zmniejszające się ku apex
        g.lineStyle(0.9, PALETTE.rim, 0.6);
        const levels = 3;
        for (let i = 1; i <= levels; i++) {
            const t = i / (levels + 1); // 0.25, 0.5, 0.75
            // Interpolacja od corner do apex
            const lx = hs * (1 - t);
            // Y interpolation: top corner -hs → apex apexY ; bottom corner hs → apex apexY
            const lyTop = tlY + (apexY - tlY) * t;
            const lyBot = brY + (apexY - brY) * t;
            
            g.moveTo(-lx, lyTop);
            g.lineTo(lx, lyTop);
            g.lineTo(lx, lyBot);
            g.lineTo(-lx, lyBot);
            g.lineTo(-lx, lyTop);
        }
        
        // Wejście do grobowca — small dark rect na E wall (z prawej)
        g.lineStyle(1.2, 0x000000, 1);
        g.beginFill(PALETTE.entrance);
        const entW = s * 0.07;
        const entH = s * 0.13;
        const entX = hs * 0.6;
        const entY = s * 0.08;
        g.drawRect(entX, entY - entH / 2, entW, entH);
        g.endFill();
        
        // Hieroglify wokół wejścia (subtle carvings — kilka małych pionowych kresek)
        g.lineStyle(0.6, PALETTE.rim, 0.5);
        for (let i = 0; i < 3; i++) {
            const hx = entX + entW + 2 + i * 2;
            g.moveTo(hx, entY - entH / 2 + 2);
            g.lineTo(hx, entY + entH / 2 - 2);
        }
        for (let i = 0; i < 3; i++) {
            const hx = entX - 3 - i * 2;
            g.moveTo(hx, entY - entH / 2 + 2);
            g.lineTo(hx, entY + entH / 2 - 2);
        }
    }
    
    /**
     * Warstwa TOP (12% parallax) — pyramidion gold + apex glow + entrance torch flicker.
     * Wywoływane co frame dla flicker effects.
     */
    private drawTop(time: number): void {
        const g = this.gfxTop;
        g.clear();
        const s = this.size;
        const hs = s / 2;
        const apexY = -hs * 0.2;
        
        // Apex halo glow (najjaśniejsze tło wokół pyramidion)
        const apexFlicker = 0.7 + Math.sin(time / 200 + this.seed) * 0.3;
        g.beginFill(PALETTE.apexGlow, 0.22 * apexFlicker);
        g.drawCircle(0, apexY, s * 0.16);
        g.endFill();
        g.beginFill(0xffe066, 0.4 * apexFlicker);
        g.drawCircle(0, apexY, s * 0.09);
        g.endFill();
        
        // Pyramidion gold capstone
        g.lineStyle(1.5, 0x000000, 1);
        g.beginFill(PALETTE.pyramidion);
        g.drawCircle(0, apexY, s * 0.048);
        g.endFill();
        
        // Highlight na pyramidion (rzucenie światła z N-W)
        g.lineStyle(0);
        g.beginFill(0xfff0a0);
        g.drawCircle(-s * 0.014, apexY - s * 0.014, s * 0.018);
        g.endFill();
        
        // Entrance torch glow (ciepły migotający flame z wewnątrz grobowca)
        const torchFlicker = 0.6 + Math.sin(time / 130 + this.seed + 1.5) * 0.4;
        const entW = s * 0.07;
        const entH = s * 0.13;
        const entCx = hs * 0.6 + entW / 2;
        const entCy = s * 0.08;
        
        g.beginFill(PALETTE.glow, 0.35 * torchFlicker);
        g.drawCircle(entCx, entCy, entH * 0.85);
        g.endFill();
        g.beginFill(0xffd33a, 0.55 * torchFlicker);
        g.drawCircle(entCx, entCy, entH * 0.3);
        g.endFill();
        g.beginFill(0xffffff, 0.5 * torchFlicker);
        g.drawCircle(entCx, entCy, entH * 0.12);
        g.endFill();
    }
    
    /**
     * Update parallax positions + dynamic flicker effects (apex glow + torch glow).
     */
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        // Calc parallax offset (relative to camera center)
        const cdx = this.x - (camX + screenW / 2);
        const cdy = this.y - (camY + screenH / 2);
        
        const midOX = cdx * Pyramid.PARALLAX_MID;
        const midOY = cdy * Pyramid.PARALLAX_MID;
        const topOX = cdx * Pyramid.PARALLAX_TOP;
        const topOY = cdy * Pyramid.PARALLAX_TOP;
        
        this.gfxBase.position.set(this.x, this.y);
        this.gfxMid.position.set(this.x + midOX, this.y + midOY);
        this.gfxTop.position.set(this.x + topOX, this.y + topOY);
        
        // Redraw top dla flicker effects
        this.drawTop(Date.now());
    }
}