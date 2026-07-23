import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import {
    FORTIFIED_HANGAR_RECT,
    FORTIFIED_HANGAR_BUILDING,
    FORTIFIED_FLAG_MASTS,
    FORTIFIED_MAST_PAD,
} from '../FortifiedRuinsMap';

/**
 * RuinsHangar — baza domowa gracza na mapie Fortified Ruins (crisp mobile F4.1e).
 *
 * WOJSKOWY hangar w moro + poligon (beton + strefa dostawy "H") + 3 maszty na
 * zdobyte flagi + pulsujacy beacon dostawy.
 *
 * F4.1e (mobile): podloga (H/poligon), bryla i maszty rysowaly sie jako zywe
 * wektory PIXI => na mobile (AA renderera OFF) "pikselowaly" na ukosnych/okraglych
 * krawedziach. Fix: te trzy warstwy sa WYPIEKANE w Canvas 2D (AA) -> Textures ->
 * Sprite'y (gladko + tanio). Tekstury CACHOWANE module-level (geometria hangaru
 * jest stala) => zero rebake / zero leaku przy restarcie meczu. Beacon (animowany,
 * cienki, ruchomy) zostaje jako Graphics.
 *
 * Struktura (3 kontenery — poprawny Y-sort z czolgami):
 *  - floor (zIndex 6): sprite poligonu + beacon,
 *  - building (zIndex = dolna krawedz bryly): SOLID, kolizja przez getCollisionRects(),
 *  - masts (zIndex = baza masztow): przejezdne, tylko wizual.
 */

const WALL_H = 34;
const MAST_H = 89; // F4.1b: +20% dluzsze maszty w bazie

const P = {
    apronA:    '#7a7668',
    apronB:    '#6e6a5c',
    joint:     '#4a473f',
    hazardYel: '#d4b048',
    hazardBlk: '#2c2c24',
    wallDark:  '#3f4a34',
    camoOlive: '#55663e',
    camoBrown: '#6b5a38',
    camoTan:   '#8a8258',
    camoDark:  '#39422c',
    gate:      '#2e3628',
    gateSlat:  '#39422f',
    gateStripe:'#b89a30',
    star:      '#d4b048',
    mastPole:  '#8a8a82',
    steel:     '#6e6e66',
};
const BEACON_NUM = 0xf1c40f;

interface HangarTex {
    floor: PIXI.Texture;
    building: PIXI.Texture;
    buildingPad: number;
    masts: PIXI.Texture;
    mastsX: number;
    mastsY: number;
}
let HANGAR_TEX: HangarTex | null = null;

export class RuinsHangar {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private floorContainer: PIXI.Container;
    private buildingContainer: PIXI.Container;
    private mastsContainer: PIXI.Container;
    private gfxBeacon: PIXI.Graphics;

    private collisionRects: ICollidable[];

    constructor(worldContainer: PIXI.Container) {
        const R = FORTIFIED_HANGAR_RECT;
        const B = FORTIFIED_HANGAR_BUILDING;
        this.x = R.x;
        this.y = R.y;
        this.w = R.w;
        this.h = R.h;

        const tex = getHangarTextures();

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.floorContainer = new PIXI.Container();
        this.floorContainer.x = R.x;
        this.floorContainer.y = R.y;
        this.floorContainer.zIndex = 6;
        worldContainer.addChild(this.floorContainer);

        this.buildingContainer = new PIXI.Container();
        this.buildingContainer.x = B.x;
        this.buildingContainer.y = B.y;
        this.buildingContainer.zIndex = B.y + B.h;
        worldContainer.addChild(this.buildingContainer);

        this.mastsContainer = new PIXI.Container();
        this.mastsContainer.zIndex = FORTIFIED_FLAG_MASTS[0].y + 5;
        worldContainer.addChild(this.mastsContainer);

        const floorSpr = new PIXI.Sprite(tex.floor);
        this.floorContainer.addChild(floorSpr);

        this.gfxBeacon = new PIXI.Graphics();
        this.floorContainer.addChild(this.gfxBeacon);

        const buildingSpr = new PIXI.Sprite(tex.building);
        buildingSpr.x = -tex.buildingPad;
        buildingSpr.y = -tex.buildingPad;
        this.buildingContainer.addChild(buildingSpr);

        const mastsSpr = new PIXI.Sprite(tex.masts);
        mastsSpr.x = tex.mastsX;   // canvas(0,0) == world(mastsX, mastsY)
        mastsSpr.y = tex.mastsY;
        this.mastsContainer.addChild(mastsSpr);

        // SOLID: bryla budynku blokuje czolgi i pociski
        this.collisionRects = [{ x: B.x, y: B.y, w: B.w, h: B.h, update: () => {} }];
    }

    /** Rect strefy domowej (world coords) — dla CtfSystem (F2) i HUD (F3). */
    public getZoneRect(): { x: number; y: number; w: number; h: number } {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    /** Kolizja bryly budynku (buildings + solidBuildings w main.ts). */
    public getCollisionRects(): ICollidable[] {
        return this.collisionRects;
    }

    /**
     * Pulsujacy beacon dostawy (Sensoryka). carrying=true => DRAMATYCZNY tryb.
     */
    public update(carrying: boolean = false): void {
        const time = Date.now();
        const g = this.gfxBeacon;
        g.clear();
        const cx = this.w / 2 + 60; // nad strefa "H"
        const cy = this.h / 2;
        const period = carrying ? 900 : 1600;
        const maxR = carrying ? 110 : 60;
        const baseAlpha = carrying ? 0.85 : 0.5;
        const t = (time % period) / period;
        const radius = 20 + t * maxR;
        const alpha = baseAlpha * (1 - t);
        g.lineStyle(carrying ? 6 : 4, BEACON_NUM, alpha);
        g.drawCircle(cx, cy, radius);
        g.lineStyle(0);
        if (carrying) {
            const t2 = ((time + period / 2) % period) / period;
            g.lineStyle(4, 0xffffff, 0.5 * (1 - t2));
            g.drawCircle(cx, cy, 20 + t2 * maxR);
            g.lineStyle(0);
            g.lineStyle(3, BEACON_NUM, 0.9);
            g.drawCircle(cx, cy, 16);
            g.lineStyle(0);
        }
    }
}

// =================================================================
// Canvas 2D bake (AA) — podloga / bryla / maszty, cache module-level
// =================================================================

function getHangarTextures(): HangarTex {
    if (HANGAR_TEX) return HANGAR_TEX;
    HANGAR_TEX = buildHangarTextures();
    return HANGAR_TEX;
}

function polygon(c: CanvasRenderingContext2D, pts: number[]): void {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
}

function buildHangarTextures(): HangarTex {
    const R = FORTIFIED_HANGAR_RECT;
    const B = FORTIFIED_HANGAR_BUILDING;

    return {
        floor: PIXI.Texture.from(buildFloorCanvas(R.w, R.h)),
        building: PIXI.Texture.from(buildBuildingCanvas(B.w, B.h)),
        buildingPad: 28,
        masts: PIXI.Texture.from(buildMastsCanvas()),
        mastsX: MASTS_ORIGIN_X,
        mastsY: MASTS_ORIGIN_Y,
    };
}

// ── Podloga: poligon + fugi + wear + strefa "H" + hazard border + pad masztow ──
function buildFloorCanvas(w: number, h: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d')!;

    // Baza betonowa
    c.globalAlpha = 0.94; c.fillStyle = P.apronB; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;

    // Jasniejsze plyty 125px (rozrzedzone)
    c.globalAlpha = 0.30; c.fillStyle = P.apronA;
    for (let ty = 0; ty < h; ty += 250) {
        for (let tx = 0; tx < w; tx += 250) {
            c.fillRect(tx, ty, 125, 125);
            c.fillRect(tx + 125, ty + 125, 125, 125);
        }
    }
    c.globalAlpha = 1;

    // Fugi dylatacyjne
    c.strokeStyle = P.joint; c.lineWidth = 2; c.globalAlpha = 0.55;
    for (let ty = 125; ty < h; ty += 125) { c.beginPath(); c.moveTo(0, ty); c.lineTo(w, ty); c.stroke(); }
    for (let tx = 125; tx < w; tx += 125) { c.beginPath(); c.moveTo(tx, 0); c.lineTo(tx, h); c.stroke(); }
    c.globalAlpha = 1;

    // Plamy oleju / przypalenia
    for (const [ox, oy, orr] of [
        [150, 120, 22], [360, 300, 18], [230, 430, 26], [95, 250, 15], [410, 150, 14],
    ] as Array<[number, number, number]>) {
        c.globalAlpha = 0.26; c.fillStyle = '#2c2a24';
        c.beginPath(); c.ellipse(ox, oy, orr, orr * 0.7, 0, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    // Strefa dostawy "H" (pod beaconem)
    const dx = w / 2 + 60, dy = h / 2;
    c.strokeStyle = P.hazardYel;
    c.globalAlpha = 0.85; c.lineWidth = 6;
    c.beginPath(); c.arc(dx, dy, 74, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.5; c.lineWidth = 3;
    c.beginPath(); c.arc(dx, dy, 62, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.85; c.fillStyle = P.hazardYel;
    c.fillRect(dx - 26, dy - 30, 10, 60);
    c.fillRect(dx + 16, dy - 30, 10, 60);
    c.fillRect(dx - 16, dy - 6, 32, 10);
    c.globalAlpha = 1;

    // Strzalki naprowadzajace od wschodu -> H
    c.globalAlpha = 0.45; c.fillStyle = '#ffffff';
    for (let ax = dx + 120; ax < w - 20; ax += 46) {
        polygon(c, [ax - 20, dy, ax, dy - 14, ax - 8, dy, ax, dy + 14]); c.fill();
    }
    c.globalAlpha = 1;

    // Slady opon
    c.strokeStyle = '#3a382f'; c.lineWidth = 5; c.globalAlpha = 0.22;
    c.beginPath(); c.moveTo(dx - 46, dy + 60); c.bezierCurveTo(200, 330, 130, 300, 70, 205); c.stroke();
    c.beginPath(); c.moveTo(dx - 26, dy + 66); c.bezierCurveTo(215, 345, 150, 320, 95, 225); c.stroke();
    c.globalAlpha = 1;

    // Hazard border strefy
    const SEG = 40;
    for (const [bx, by, bw, bh, horiz] of [
        [0, 0, w, 6, true], [0, h - 6, w, 6, true],
        [0, 0, 6, h, false], [w - 6, 0, 6, h, false],
    ] as Array<[number, number, number, number, boolean]>) {
        let i = 0;
        c.globalAlpha = 0.9;
        if (horiz) {
            for (let sx = bx; sx < bx + bw; sx += SEG, i++) {
                c.fillStyle = i % 2 === 0 ? P.hazardYel : P.hazardBlk;
                c.fillRect(sx, by, Math.min(SEG, bx + bw - sx), bh);
            }
        } else {
            for (let sy = by; sy < by + bh; sy += SEG, i++) {
                c.fillStyle = i % 2 === 0 ? P.hazardYel : P.hazardBlk;
                c.fillRect(bx, sy, bw, Math.min(SEG, by + bh - sy));
            }
        }
    }
    c.globalAlpha = 1;

    // Pad masztow (betonowa wysepka z obwodka + sloty w kolorach flag)
    const PAD = FORTIFIED_MAST_PAD;
    const px = PAD.x - R_X, py = PAD.y - R_Y;
    c.globalAlpha = 0.95; c.fillStyle = '#82806e';
    c.fillRect(px, py, PAD.w, PAD.h);
    c.globalAlpha = 0.6; c.strokeStyle = P.hazardYel; c.lineWidth = 3;
    c.strokeRect(px, py, PAD.w, PAD.h);
    c.globalAlpha = 1;
    for (const m of FORTIFIED_FLAG_MASTS) {
        const scx = m.x - R_X, scy = m.y - R_Y;
        const col = '#' + m.color.toString(16).padStart(6, '0');
        c.strokeStyle = col; c.lineWidth = 3; c.globalAlpha = 0.8;
        c.beginPath(); c.arc(scx, scy, 16, 0, Math.PI * 2); c.stroke();
        c.fillStyle = col; c.globalAlpha = 0.18;
        c.beginPath(); c.arc(scx, scy, 16, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    return cv;
}

// ── Bryla hangaru 2.5D ──
function buildBuildingCanvas(w: number, h: number): HTMLCanvasElement {
    const PAD = 28;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w + PAD * 2);
    cv.height = Math.ceil(h + PAD * 2);
    const c = cv.getContext('2d')!;
    c.translate(PAD, PAD);   // canvas (PAD,PAD) == local (0,0)

    const roofH = h - WALL_H;

    // Cien bryly
    c.globalAlpha = 0.35; c.fillStyle = '#2c2416'; c.fillRect(6, 8, w, h);
    c.globalAlpha = 1;
    // Plinta/fundament
    c.globalAlpha = 0.9; c.fillStyle = '#24281c'; c.fillRect(-3, h - 4, w + 6, 8);
    c.globalAlpha = 1;

    // Dach (moro)
    c.fillStyle = P.camoOlive; c.fillRect(0, 0, w, roofH);
    const patches: Array<[number, number, number, number, string]> = [
        [18, 10, 44, 26, P.camoBrown], [70, 30, 52, 30, P.camoDark],
        [130, 8, 48, 24, P.camoTan],  [40, 62, 56, 28, P.camoDark],
        [110, 58, 60, 32, P.camoBrown], [8, 84, 40, 26, P.camoTan],
        [150, 92, 42, 24, P.camoOlive], [78, 92, 46, 22, P.camoTan],
    ];
    c.globalAlpha = 0.9;
    for (const [pxx, pyy, pw, ph, col] of patches) {
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(pxx + pw / 2, pyy * (roofH / 126) + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
        c.fill();
    }
    c.globalAlpha = 1;
    // Kalenica + panele
    c.strokeStyle = P.camoDark; c.lineWidth = 2; c.globalAlpha = 0.7;
    c.beginPath(); c.moveTo(0, roofH * 0.5); c.lineTo(w, roofH * 0.5); c.stroke();
    for (let pxx = 40; pxx < w; pxx += 40) { c.beginPath(); c.moveTo(pxx, 0); c.lineTo(pxx, roofH); c.stroke(); }
    c.globalAlpha = 1;
    // Nity
    c.globalAlpha = 0.7; c.fillStyle = '#2c3320';
    for (let pxx = 40; pxx < w; pxx += 40) {
        for (const pyy of [roofH * 0.25, roofH * 0.75]) { c.beginPath(); c.arc(pxx, pyy, 1.6, 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
    // Wentylator kalenicy
    c.globalAlpha = 0.95; c.fillStyle = '#3a4030'; c.fillRect(w * 0.5 - 14, roofH * 0.5 - 5, 28, 10);
    c.globalAlpha = 0.8; c.strokeStyle = '#24281c'; c.lineWidth = 1;
    for (let vx = -12; vx <= 12; vx += 4) { c.beginPath(); c.moveTo(w * 0.5 + vx, roofH * 0.5 - 5); c.lineTo(w * 0.5 + vx, roofH * 0.5 + 5); c.stroke(); }
    c.globalAlpha = 1;
    // Okap
    c.globalAlpha = 0.85; c.fillStyle = P.camoTan; c.fillRect(0, roofH - 4, w, 4);
    c.globalAlpha = 1;

    // Antena radiowa
    c.strokeStyle = P.steel; c.lineWidth = 2; c.globalAlpha = 0.95;
    c.beginPath(); c.moveTo(w - 20, 8); c.lineTo(w - 20, -22); c.stroke();
    c.beginPath(); c.moveTo(w - 26, -14); c.lineTo(w - 14, -18); c.stroke();
    c.globalAlpha = 0.95; c.fillStyle = '#e74c3c';
    c.beginPath(); c.arc(w - 20, -23, 2.4, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    // Sciana poludniowa
    c.fillStyle = P.wallDark; c.fillRect(0, roofH, w, WALL_H);

    // Wrota: korrugowana brama
    const gateW = w * 0.52;
    const gateX = (w - gateW) / 2;
    c.fillStyle = P.gate; c.fillRect(gateX, roofH + 4, gateW, WALL_H - 8);
    c.strokeStyle = P.gateSlat; c.lineWidth = 2; c.globalAlpha = 0.7;
    for (let sy = roofH + 8; sy < roofH + WALL_H - 6; sy += 5) {
        c.beginPath(); c.moveTo(gateX + 3, sy); c.lineTo(gateX + gateW - 3, sy); c.stroke();
    }
    c.globalAlpha = 1;
    // Szewrony
    c.strokeStyle = P.gateStripe; c.lineWidth = 4; c.globalAlpha = 0.85;
    for (let sx = gateX + 6; sx < gateX + gateW - 4; sx += 18) {
        c.beginPath(); c.moveTo(sx, roofH + WALL_H - 6); c.lineTo(sx + 10, roofH + 6); c.stroke();
    }
    c.globalAlpha = 1;
    // Podzial skrzydel
    c.strokeStyle = P.wallDark; c.lineWidth = 3;
    c.beginPath(); c.moveTo(w / 2, roofH + 4); c.lineTo(w / 2, roofH + WALL_H - 4); c.stroke();
    // Nadproze
    c.globalAlpha = 0.95; c.fillStyle = P.camoDark; c.fillRect(gateX - 4, roofH, gateW + 8, 5);
    c.globalAlpha = 1;
    // Naroznikowe slupy
    c.globalAlpha = 0.9; c.fillStyle = '#2e3626';
    c.fillRect(0, roofH - 2, 5, WALL_H + 2);
    c.fillRect(w - 5, roofH - 2, 5, WALL_H + 2);
    c.globalAlpha = 1;
    // Okienka
    for (const wx of [gateX / 2 - 8, w - gateX / 2 - 8]) {
        c.globalAlpha = 0.95; c.fillStyle = '#aecad8'; c.fillRect(wx, roofH + 8, 16, 11);
        c.globalAlpha = 0.6; c.fillStyle = '#d8ecf4'; c.fillRect(wx + 1, roofH + 9, 6, 4);
        c.globalAlpha = 0.85; c.strokeStyle = P.camoDark; c.lineWidth = 2; c.strokeRect(wx, roofH + 8, 16, 11);
    }
    c.globalAlpha = 1;

    // Gwiazda (emblemat) z obwodka
    const scx = w / 2, scy = roofH * 0.5;
    const starPts: number[] = [];
    for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? 20 : 8;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        starPts.push(scx + Math.cos(a) * rr, scy + Math.sin(a) * rr);
    }
    polygon(c, starPts);
    c.globalAlpha = 0.92; c.fillStyle = P.star; c.fill();
    c.globalAlpha = 0.6; c.strokeStyle = '#2c2416'; c.lineWidth = 2; c.stroke();
    c.globalAlpha = 1;

    // Worki z piaskiem
    for (const bx of [8, w - 30]) {
        for (let i = 0; i < 3; i++) {
            c.fillStyle = i % 2 ? '#9a8a5c' : '#8a7a50';
            c.beginPath();
            c.ellipse(bx + 11 + (i % 2) * 4, roofH + WALL_H - 8 - i * 7, 12, 5, 0, 0, Math.PI * 2);
            c.fill();
        }
    }

    return cv;
}

// ── Maszty (world coords -> canvas z origin) ──
const R_X = FORTIFIED_HANGAR_RECT.x;
const R_Y = FORTIFIED_HANGAR_RECT.y;
const MASTS_ORIGIN_X = Math.min(...FORTIFIED_FLAG_MASTS.map(m => m.x)) - 12;
const MASTS_ORIGIN_Y = Math.min(...FORTIFIED_FLAG_MASTS.map(m => m.y)) - MAST_H - 12;

function buildMastsCanvas(): HTMLCanvasElement {
    const maxX = Math.max(...FORTIFIED_FLAG_MASTS.map(m => m.x)) + 16;
    const maxY = Math.max(...FORTIFIED_FLAG_MASTS.map(m => m.y)) + 10;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(maxX - MASTS_ORIGIN_X);
    cv.height = Math.ceil(maxY - MASTS_ORIGIN_Y);
    const c = cv.getContext('2d')!;
    c.translate(-MASTS_ORIGIN_X, -MASTS_ORIGIN_Y); // rysuj we world coords

    for (const m of FORTIFIED_FLAG_MASTS) {
        const mx = m.x, my = m.y;
        const col = '#' + m.color.toString(16).padStart(6, '0');
        // Cien
        c.globalAlpha = 0.3; c.fillStyle = '#2c2416';
        c.beginPath(); c.ellipse(mx + 3, my + 3, 10, 4, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        // Podstawa
        c.fillStyle = '#8a8878'; c.fillRect(mx - 7, my - 6, 14, 10);
        c.fillStyle = '#6e6c5e'; c.fillRect(mx - 7, my + 1, 14, 3);
        // Maszt
        c.fillStyle = P.mastPole; c.fillRect(mx - 2, my - MAST_H, 4, MAST_H - 4);
        // Kula w kolorze flagi
        c.fillStyle = col; c.beginPath(); c.arc(mx, my - MAST_H - 3, 5, 0, Math.PI * 2); c.fill();
        // Linka
        c.strokeStyle = '#c8c8c0'; c.lineWidth = 1.5; c.globalAlpha = 0.7;
        c.beginPath(); c.moveTo(mx + 4, my - MAST_H + 4); c.lineTo(mx + 6, my - 10); c.stroke();
        c.globalAlpha = 1;
    }

    return cv;
}
