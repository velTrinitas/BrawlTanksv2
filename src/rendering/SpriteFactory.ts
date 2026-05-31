import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';

/**
 * Lerpuje hex color o określoną wartość (jaśniej/ciemniej).
 * Kopia z v4.48 — używana w drawTankHull/Turret.
 */
function lerpHex(hex: string, amt: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Rysuje kadłub czołga na Canvas 2D — kopia z v4.48.
 * Używana TYLKO do bake'owania do PIXI.Texture. Nie w runtime.
 */
function drawTankHull(ctx: CanvasRenderingContext2D, brawler: Brawler): void {
    const col = brawler.colorMain;
    const cL = lerpHex(col, 45);
    const HL = 52, HW = 26, TRK = 5;
    const hhl = HL / 2, hhw = HW / 2;
    
    // Gąsienice (góra + dół)
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.roundRect(-hhl, -(hhw + TRK / 2 + 0.5) - TRK / 2, HL, TRK, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-hhl, (hhw + TRK / 2 + 0.5) - TRK / 2, HL, TRK, 2);
    ctx.fill();
    
    // Główna bryła kadłuba
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-hhl, -hhw, HL, HW, 3);
    ctx.fill();
    ctx.stroke();
    
    // Highlight (jasny pasek z lewej)
    ctx.fillStyle = cL;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.roundRect(-hhl, -hhw, HL * 0.2, HW, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
}

/**
 * Rysuje wieżyczkę czołga — kopia z v4.48.
 */
function drawTankTurret(ctx: CanvasRenderingContext2D, brawler: Brawler): void {
    const col = brawler.colorMain;
    const tr = 12, bl = 20, bw = 5;
    const bstart = tr * 0.6;
    
    // Baza wieżyczki (cylinder)
    ctx.fillStyle = lerpHex(col, -18);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, tr + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Lufa
    ctx.fillStyle = '#484848';
    ctx.beginPath();
    ctx.roundRect(bstart, -bw / 2, bl, bw, bw * 0.25);
    ctx.fill();
    ctx.stroke();
}

/**
 * Zestaw tekstur dla jednego brawlera (kadłub + wieżyczka).
 */
export interface BrawlerTextures {
    hull: PIXI.Texture;
    turret: PIXI.Texture;
}

/**
 * Globalny cache tekstur per brawler.id. Lazy init: tworzymy raz przy pierwszym użyciu.
 * Anty-pattern naprawiony z migracji: bez tego każdy nowy Player tworzył nowe textury → leak GPU.
 */
const BRAWLER_TEX_CACHE = new Map<string, BrawlerTextures>();

/**
 * Zwraca textury dla brawlera. Pierwsze wywołanie generuje, kolejne zwracają z cache.
 */
export function getBrawlerTextures(brawler: Brawler): BrawlerTextures {
    if (BRAWLER_TEX_CACHE.has(brawler.id)) {
        return BRAWLER_TEX_CACHE.get(brawler.id)!;
    }
    
    const createTex = (drawFn: (ctx: CanvasRenderingContext2D) => void): PIXI.Texture => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(80, 80);
        ctx.scale(1.75, 1.75); // skala z v4.48 dla detalu
        drawFn(ctx);
        return PIXI.Texture.from(canvas);
    };
    
    const textures: BrawlerTextures = {
        hull: createTex(ctx => drawTankHull(ctx, brawler)),
        turret: createTex(ctx => drawTankTurret(ctx, brawler)),
    };
    
    BRAWLER_TEX_CACHE.set(brawler.id, textures);
    return textures;
}