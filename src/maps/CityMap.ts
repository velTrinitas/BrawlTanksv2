import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * Statyczna tekstura miasta — bake'owana raz z Canvas 2D.
 * Zawiera: asfalt, intersekcje, pasy drogowe, oznaczenia pasów pieszych.
 * Kopia z v4.48 buildCityOffscreenTexture.
 */
export function buildCityTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    
    // Tło ciemne
    c.fillStyle = '#14141e';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    
    // Asfalt — krzyżujące się drogi
    c.fillStyle = '#09090f';
    c.fillRect(0, 617, WORLD_W, 100);
    c.fillRect(0, 1283, WORLD_W, 100);
    c.fillRect(617, 0, 100, WORLD_H);
    c.fillRect(1283, 0, 100, WORLD_H);
    
    // Krawężniki
    c.fillStyle = '#1c1c2a';
    [617, 1283].forEach(y => {
        c.fillRect(0, y - 18, WORLD_W, 18);
        c.fillRect(0, y + 100, WORLD_W, 18);
    });
    [617, 1283].forEach(x => {
        c.fillRect(x - 18, 0, 18, WORLD_H);
        c.fillRect(x + 100, 0, 18, WORLD_H);
    });
    
    // Linie graniczne dróg
    c.strokeStyle = '#282840';
    c.lineWidth = 2;
    [617, 717, 1283, 1383].forEach(y => {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(WORLD_W, y);
        c.stroke();
    });
    [617, 717, 1283, 1383].forEach(x => {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, WORLD_H);
        c.stroke();
    });
    
    // Żółte przerywane pasy środkowe
    c.strokeStyle = '#f1c40f';
    c.lineWidth = 3;
    c.setLineDash([35, 22]);
    [[0, 667, WORLD_W, 667], [0, 1333, WORLD_W, 1333], [667, 0, 667, WORLD_H], [1333, 0, 1333, WORLD_H]].forEach(([x1, y1, x2, y2]) => {
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
    });
    c.setLineDash([]);
    
    // Pasy pieszych (zebry) na skrzyżowaniach
    c.fillStyle = 'rgba(255,255,255,0.20)';
    [[617, 617], [617, 1283], [1283, 617], [1283, 1283]].forEach(([ix, iy]) => {
        for (let t = iy; t < iy + 100; t += 14) {
            c.fillRect(ix, t, 100, 8);
        }
    });
    
    return PIXI.Texture.from(cv);
}

/**
 * Layout 24 budynków cyberpunk.
 * Format: [x, y, width, height, parallaxFactor, type]
 * Kopia z v4.48.
 */
export const CITY_BUILDINGS_LAYOUT: number[][] = [
    [80, 80, 180, 120, 0.18, 2], [310, 60, 100, 180, 0.22, 1], [80, 290, 240, 95, 0.12, 4],
    [825, 55, 58, 58, 0.36, 5], [930, 100, 155, 115, 0.20, 2], [755, 225, 115, 140, 0.16, 1],
    [1455, 80, 200, 160, 0.25, 3], [1705, 60, 85, 180, 0.20, 1], [1455, 300, 145, 100, 0.10, 4],
    [55, 785, 115, 160, 0.20, 1], [225, 805, 195, 120, 0.18, 2], [485, 910, 58, 58, 0.30, 5],
    [1445, 800, 195, 140, 0.22, 2], [1705, 785, 98, 160, 0.18, 1], [1445, 1005, 180, 100, 0.15, 3],
    [80, 1440, 125, 178, 0.20, 1], [265, 1445, 58, 58, 0.28, 5], [80, 1688, 195, 118, 0.18, 2],
    [748, 1440, 195, 78, 0.10, 4], [925, 1565, 175, 130, 0.22, 3], [758, 1762, 108, 148, 0.18, 1],
    [1445, 1445, 220, 148, 0.20, 2], [1722, 1452, 158, 78, 0.12, 4], [1882, 1602, 58, 58, 0.32, 5],
];

/**
 * Klasa budynku z parallax effect. Rysuje 3 ściany 3D na podstawie offset kamery.
 * UWAGA: redraws every frame — to v4.48 styl. W Phase 4 zoptymalizujemy do bake'owanej tekstury.
 */
export class CyberBuilding {
    public x: number; public y: number; public w: number; public h: number; public hF: number;
    public gfx: PIXI.Graphics;
    private C: { rf: number; wD: number; wL: number; n1: number };
    
    constructor(x: number, y: number, w: number, d: number, hF: number, type: number, container: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = d; this.hF = hF;
        this.gfx = new PIXI.Graphics();
        this.gfx.zIndex = y + d;
        container.addChild(this.gfx);
        
        const P = [
            null, 
            { rf: 0x1a1a2d, wD: 0x101018, wL: 0x181826, n1: 0x00ffff },
            { rf: 0x1e2230, wD: 0x141820, wL: 0x1c2028, n1: 0xaaddff },
            { rf: 0x222635, wD: 0x181c24, wL: 0x1e2030, n1: 0xf1c40f },
            { rf: 0x1a1a1e, wD: 0x111114, wL: 0x181818, n1: 0xff3300 },
            { rf: 0x12121a, wD: 0x0e0e14, wL: 0x141420, n1: 0xcc00ff },
            { rf: 0x2c2422, wD: 0x1a1412, wL: 0x241b18, n1: 0xff6600 },
            { rf: 0x1f2421, wD: 0x111412, wL: 0x181c19, n1: 0x00ff44 },
            { rf: 0x1d222b, wD: 0x13161c, wL: 0x1a1e26, n1: 0x00ccff },
        ];
        this.C = P[type] || P[1]!;
    }
    
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        const ox = (this.x + this.w / 2 - (camX + screenW / 2)) * this.hF;
        const oy = (this.y + this.h / 2 - (camY + screenH / 2)) * this.hF;
        const g = this.gfx;
        g.clear();
        
        const drawWall = (x1: number, y1: number, x2: number, y2: number, rx1: number, ry1: number, rx2: number, ry2: number, col: number) => {
            g.beginFill(col);
            g.lineStyle(1, 0, 1);
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.lineTo(rx2, ry2);
            g.lineTo(rx1, ry1);
            g.endFill();
        };
        
        if (oy > 0) drawWall(this.x, this.y, this.x + this.w, this.y, this.x + ox, this.y + oy, this.x + this.w + ox, this.y + oy, this.C.wD);
        else if (oy < 0) drawWall(this.x, this.y + this.h, this.x + this.w, this.y + this.h, this.x + ox, this.y + this.h + oy, this.x + this.w + ox, this.y + this.h + oy, this.C.wL);
        
        if (ox > 0) drawWall(this.x, this.y, this.x, this.y + this.h, this.x + ox, this.y + oy, this.x + ox, this.y + this.h + oy, this.C.wL);
        else if (ox < 0) drawWall(this.x + this.w, this.y, this.x + this.w, this.y + this.h, this.x + this.w + ox, this.y + oy, this.x + this.w + ox, this.y + this.h + oy, this.C.wD);
        
        g.beginFill(this.C.rf);
        g.lineStyle(2, 0, 1);
        g.drawRect(this.x + ox, this.y + oy, this.w, this.h);
        g.endFill();
        
        g.lineStyle(3, this.C.n1, 0.8);
        g.drawRect(this.x + ox + 8, this.y + oy + 8, this.w - 16, this.h - 16);
    }
}
/**
 * Pozycje MediPadów (HoverRepairPad) na CityMap — zgodnie z v4.48.
 */
export const MEDI_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: 617, y: 200 },    // V1 street, północ
    { x: 1283, y: 850 },   // V2 street, środek
    { x: 617, y: 1450 },   // V1 street, południe
];

/**
 * Pozycje PowerPadów (PowerHoverPad) na CityMap — zgodnie z v4.48.
 */
export const POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: 617, y: 900 },    // V1 street, środek
    { x: 1283, y: 400 },   // V2 street, północ
];