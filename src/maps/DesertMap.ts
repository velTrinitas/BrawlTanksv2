import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * Statyczna tekstura pustyni — bake'owana raz z Canvas 2D.
 * Zawiera: base sand + 7000 mikrotekstur (2 warstwy: chłodne beżowe + cieplejsze brązy) + 12 formacji wydm.
 * 
 * WYDAJNOŚĆ: 1 PIXI.Texture → 1 PIXI.Sprite → 1 draw call dla całego tła.
 * Kopia z v4.48 _buildDesertOffscreen() + wzbogacone wydmy (gradient + windripples + sun highlight).
 */
export function buildDesertTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    
    // 1. Base sand
    c.fillStyle = '#e8d4a2';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    
    // 2. Mikrotekstury warstwa 1 — chłodne beżowe (3500 spots z v4.48)
    const sandCols1 = ['#f5dfa8', '#eecf90', '#f8e8c0', '#e8c888', '#faf0d0', '#d4b070'];
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H;
        const rx = 2.5 + Math.random() * 8;
        const ry = 1.5 + Math.random() * 4;
        const ang = Math.random() * Math.PI;
        const alpha = 0.10 + Math.random() * 0.20;
        const isDark = Math.random() < 0.3;
        
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = isDark ? '#8a6840' : sandCols1[Math.floor(Math.random() * sandCols1.length)];
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    
    // 3. Mikrotekstury warstwa 2 — cieplejsze brązy (3500 spots z v4.48)
    const sandCols2 = ['#c8a870', '#e0c898', '#b88858', '#d4b078', '#a87848'];
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H;
        const rx = 1.8 + Math.random() * 6;
        const ry = 1 + Math.random() * 3;
        const ang = Math.random() * Math.PI;
        const alpha = 0.08 + Math.random() * 0.18;
        
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = sandCols2[Math.floor(Math.random() * sandCols2.length)];
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    
    // 4. Wydmy — 12 formacji radialnie wokół centrum mapy
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;
    for (let i = 0; i < 12; i++) {
        const a = i * (Math.PI * 2 / 12) + (Math.random() - 0.5) * 0.5;
        const r = 400 + Math.random() * 600;
        const dx = cx + Math.cos(a) * r;
        const dy = cy + Math.sin(a) * r;
        const w = 180 + Math.random() * 200;
        const h = 28 + Math.random() * 40;
        const col1 = sandCols1[Math.floor(Math.random() * sandCols1.length)];
        drawDune(c, dx, dy, w, h, col1);
    }
    
    return PIXI.Texture.from(cv);
}

/**
 * Pojedyncza wydma — eliptyczny kształt z gradientem cieniowania (sun from upper-left).
 * Wzbogacona vs v4.48: dodany sun highlight + wind ripples na grzbiecie.
 */
function drawDune(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col1: string): void {
    c.save();
    c.translate(x, y);
    
    // Cień pod wydmą
    c.fillStyle = 'rgba(80, 50, 20, 0.18)';
    c.beginPath();
    c.ellipse(4, h * 0.5, w * 0.55, h * 0.35, 0, 0, Math.PI * 2);
    c.fill();
    
    // Bryła wydmy — eliptyczny gradient
    const grad = c.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, col1);
    grad.addColorStop(0.55, '#c49040');
    grad.addColorStop(1, '#9a7030');
    c.fillStyle = grad;
    c.beginPath();
    c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    c.fill();
    
    // Highlight na grzbiecie (sun glow)
    c.fillStyle = 'rgba(255, 240, 200, 0.32)';
    c.beginPath();
    c.ellipse(-w * 0.1, -h * 0.2, w * 0.4, h * 0.15, 0, 0, Math.PI * 2);
    c.fill();
    
    // Subtle wind ripples na grzbiecie
    c.strokeStyle = 'rgba(140, 100, 50, 0.22)';
    c.lineWidth = 1.2;
    for (let r = -2; r <= 2; r++) {
        const ry = r * h * 0.15;
        c.beginPath();
        c.moveTo(-w / 2 + 8, ry);
        c.quadraticCurveTo(0, ry - 2, w / 2 - 8, ry);
        c.stroke();
    }
    
    c.restore();
}

/**
 * Layout piramid na pustyni — 3 piramidy w 3 rogach mapy (różne rozmiary).
 * Format: { x, y, size, seed } — seed dla wariacji flicker phase.
 */
export interface PyramidLayoutEntry {
    x: number;
    y: number;
    size: number;
    seed: number;
}

export const DESERT_PYRAMID_LAYOUT: PyramidLayoutEntry[] = [
    { x: WORLD_W * 0.18, y: WORLD_H * 0.72, size: 280, seed: 1 },  // największa, południowy zachód
    { x: WORLD_W * 0.55, y: WORLD_H * 0.82, size: 240, seed: 2 },  // średnia, środek-południe
    { x: WORLD_W * 0.85, y: WORLD_H * 0.42, size: 210, seed: 3 },  // mała, wschód
];

export const DESERT_SPHINX_POSITION = {
    x: WORLD_W * 0.50,
    y: WORLD_H * 0.42,
    sizeX: 180,
    sizeY: 400,
    seed: 7,
};

/**
 * Pozycje MediPadów (HoverRepairPad) na pustyni — odpowiedniki repair hangars z v4.48.
 * 3 strefy w różnych ćwiartkach mapy (przesunięte żeby nie kolidować z piramidami).
 */
export const DESERT_MEDI_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.18, y: WORLD_H * 0.50 },
    { x: WORLD_W * 0.82, y: WORLD_H * 0.28 },
    { x: WORLD_W * 0.52, y: WORLD_H * 0.30 },
];

/**
 * Pozycje PowerPadów (PowerHoverPad) na pustyni — odpowiednik power well z v4.48.
 * 2 strefy (dla równowagi vs CityMap).
 */
export const DESERT_POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.72, y: WORLD_H * 0.62 },   // power well z v4.48
    { x: WORLD_W * 0.25, y: WORLD_H * 0.18 },   // bonus dla balansu
];
// === NIL ROUTE ===
// Diagonalna trasa z 2 meandrami (kolanami), omija wszystkie obiekty (sphinx + 3 piramidy).
// Start NE → Meander #1 → Mid → Meander #2 → End SW.
export const DESERT_RIVER_PATH = [
    { x: WORLD_W * 0.85, y: WORLD_H * 0.05 },  // Start NE
    { x: WORLD_W * 0.65, y: WORLD_H * 0.30 },  // Meander #1 (kolano)
    { x: WORLD_W * 0.70, y: WORLD_H * 0.50 },  // Mid descent
    { x: WORLD_W * 0.45, y: WORLD_H * 0.75 },  // Meander #2 (kolano)
    { x: WORLD_W * 0.10, y: WORLD_H * 0.95 },  // End SW
];

export const DESERT_RIVER_WIDTH = 80;

// Mosty — gracz może przejechać. Position blisko meandrów dla strategic crossings.
export const DESERT_BRIDGE_POSITIONS = [
    { x: WORLD_W * 0.67, y: WORLD_H * 0.30, width: 180, height: 36 },  // przy meander #1
    { x: WORLD_W * 0.45, y: WORLD_H * 0.75, width: 180, height: 36 },  // przy meander #2
];