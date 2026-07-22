import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import {
    FORTIFIED_HANGAR_RECT,
    FORTIFIED_HANGAR_BUILDING,
    FORTIFIED_FLAG_MASTS,
    FORTIFIED_MAST_PAD,
} from '../FortifiedRuinsMap';

/**
 * RuinsHangar — baza domowa gracza na mapie Fortified Ruins (FAZA CTF F1.1).
 *
 * Redesign wg decyzji Mariusza (2026-07-19): zamiast plaskiej posadzki —
 * WOJSKOWY budynek hangaru w moro (a'la baza wysunieta rozbita w ruinach;
 * NIE kopia legacy granatowej hali) + pad z 3 masztami na ZDOBYTE flagi
 * (podstawy masztow w kolorach flag = czytelne "tu wracaja flagi"; w F2
 * capture wciaga proporzec na maszt).
 *
 * Struktura (3 kontenery — poprawny Y-sort z czolgami):
 *  - floor (zIndex 6): beton apron + hazard border strefy + pad masztow + beacon,
 *  - building (zIndex = dolna krawedz bryly): SOLID, kolizja przez getCollisionRects(),
 *  - masts (zIndex = baza masztow): przejezdne sluzki, tylko wizual.
 *
 * Strefa domowa (500x500) poza budynkiem pozostaje w pelni przejezdna —
 * logika dostawy flag (CtfSystem, F2) uzywa getZoneRect().
 * Animacja: tylko puls beacona (maly redraw) — mobile-safe.
 */

const PALETTE = {
    apronA:    0x7a7668,   // beton jasny
    apronB:    0x6e6a5c,   // beton ciemny
    hazardYel: 0xd4b048,
    hazardBlk: 0x2c2c24,
    wallDark:  0x3f4a34,   // sciana - ciemna oliwka
    wallLight: 0x4c5940,
    camoOlive: 0x55663e,   // moro: oliwka
    camoBrown: 0x6b5a38,   // moro: braz
    camoTan:   0x8a8258,   // moro: piaskowy
    camoDark:  0x39422c,   // moro: ciemna zielen
    gate:      0x2e3628,
    gateStripe:0xb89a30,
    star:      0xd4b048,
    mastPole:  0x8a8a82,
    beacon:    0xf1c40f,
};

export class RuinsHangar {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private floorContainer: PIXI.Container;
    private buildingContainer: PIXI.Container;
    private mastsContainer: PIXI.Container;
    private gfxFloor: PIXI.Graphics;
    private gfxBuilding: PIXI.Graphics;
    private gfxMasts: PIXI.Graphics;
    private gfxBeacon: PIXI.Graphics;

    private collisionRects: ICollidable[];

    constructor(worldContainer: PIXI.Container) {
        const R = FORTIFIED_HANGAR_RECT;
        this.x = R.x;
        this.y = R.y;
        this.w = R.w;
        this.h = R.h;

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        const B = FORTIFIED_HANGAR_BUILDING;
        this.floorContainer = new PIXI.Container();
        this.floorContainer.x = R.x;
        this.floorContainer.y = R.y;
        this.floorContainer.zIndex = 6;
        worldContainer.addChild(this.floorContainer);

        this.buildingContainer = new PIXI.Container();
        this.buildingContainer.x = B.x;
        this.buildingContainer.y = B.y;
        this.buildingContainer.zIndex = B.y + B.h; // Y-sort: czolg przed/za bryla
        worldContainer.addChild(this.buildingContainer);

        this.mastsContainer = new PIXI.Container();
        this.mastsContainer.zIndex = FORTIFIED_FLAG_MASTS[0].y + 5;
        worldContainer.addChild(this.mastsContainer);

        this.gfxFloor = new PIXI.Graphics();
        this.gfxBeacon = new PIXI.Graphics();
        this.floorContainer.addChild(this.gfxFloor);
        this.floorContainer.addChild(this.gfxBeacon);

        this.gfxBuilding = new PIXI.Graphics();
        this.buildingContainer.addChild(this.gfxBuilding);

        this.gfxMasts = new PIXI.Graphics();
        this.mastsContainer.addChild(this.gfxMasts);

        // SOLID: bryla budynku blokuje czolgi i pociski
        this.collisionRects = [{ x: B.x, y: B.y, w: B.w, h: B.h, update: () => {} }];

        this.drawFloor();
        this.drawBuilding();
        this.drawMasts();
    }

    /** Rect strefy domowej (world coords) — dla CtfSystem (F2) i HUD (F3). */
    public getZoneRect(): { x: number; y: number; w: number; h: number } {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    /** Kolizja bryly budynku (buildings + solidBuildings w main.ts). */
    public getCollisionRects(): ICollidable[] {
        return this.collisionRects;
    }

    /** Beton apron + hazard border strefy + pad masztow (local coords strefy). */
    private drawFloor(): void {
        const g = this.gfxFloor;
        const w = this.w;
        const h = this.h;

        // Betonowe plyty 50x50 (militarny apron zamiast kamiennej szachownicy)
        for (let ty = 0; ty < h; ty += 50) {
            for (let tx = 0; tx < w; tx += 50) {
                g.beginFill(((tx + ty) / 50) % 2 === 0 ? PALETTE.apronA : PALETTE.apronB, 0.92);
                g.drawRect(tx, ty, 50, 50);
                g.endFill();
            }
        }
        // Spekania plyt (subtelne linie fug)
        g.lineStyle(1.5, 0x55524a, 0.5);
        for (let ty = 50; ty < h; ty += 50) { g.moveTo(0, ty); g.lineTo(w, ty); }
        for (let tx = 50; tx < w; tx += 50) { g.moveTo(tx, 0); g.lineTo(tx, h); }
        g.lineStyle(0);

        // Hazard border strefy (zolto-czarne segmenty — militarna granica "domu")
        const SEG = 40;
        for (const [bx, by, bw, bh, horiz] of [
            [0, 0, w, 6, true], [0, h - 6, w, 6, true],
            [0, 0, 6, h, false], [w - 6, 0, 6, h, false],
        ] as Array<[number, number, number, number, boolean]>) {
            let i = 0;
            if (horiz) {
                for (let sx = bx; sx < bx + bw; sx += SEG, i++) {
                    g.beginFill(i % 2 === 0 ? PALETTE.hazardYel : PALETTE.hazardBlk, 0.9);
                    g.drawRect(sx, by, Math.min(SEG, bx + bw - sx), bh);
                    g.endFill();
                }
            } else {
                for (let sy = by; sy < by + bh; sy += SEG, i++) {
                    g.beginFill(i % 2 === 0 ? PALETTE.hazardYel : PALETTE.hazardBlk, 0.9);
                    g.drawRect(bx, sy, bw, Math.min(SEG, by + bh - sy));
                    g.endFill();
                }
            }
        }

        // Pad masztow (betonowa wysepka z obwodka)
        const P = FORTIFIED_MAST_PAD;
        const px = P.x - this.x;
        const py = P.y - this.y;
        g.beginFill(0x82806e, 0.95);
        g.drawRect(px, py, P.w, P.h);
        g.endFill();
        g.lineStyle(3, PALETTE.hazardYel, 0.6);
        g.drawRect(px, py, P.w, P.h);
        g.lineStyle(0);
        // Napisy-slots: kolorowe kola pod maszty (czytelnosc: "tu wracaja flagi")
        for (const m of FORTIFIED_FLAG_MASTS) {
            g.lineStyle(3, m.color, 0.8);
            g.drawCircle(m.x - this.x, m.y - this.y, 16);
            g.lineStyle(0);
            g.beginFill(m.color, 0.18);
            g.drawCircle(m.x - this.x, m.y - this.y, 16);
            g.endFill();
        }
    }

    /** Bryla hangaru 2.5D: moro dach, oliwkowa sciana, brama z szewronami, gwiazda. */
    private drawBuilding(): void {
        const g = this.gfxBuilding;
        const B = FORTIFIED_HANGAR_BUILDING;
        const w = B.w;
        const h = B.h;
        const WALL_H = 34;          // widoczna sciana poludniowa (2.5D)
        const roofH = h - WALL_H;   // dach zajmuje reszte

        // Cien bryly
        g.beginFill(0x2c2416, 0.35);
        g.drawRect(6, 8, w, h);
        g.endFill();

        // ── Dach (moro) ──
        g.beginFill(PALETTE.camoOlive);
        g.drawRect(0, 0, w, roofH);
        g.endFill();
        // Laty moro (deterministyczny uklad — bez rng, stabilny bake)
        const patches: Array<[number, number, number, number, number]> = [
            [18, 10, 44, 26, PALETTE.camoBrown], [70, 30, 52, 30, PALETTE.camoDark],
            [130, 8, 48, 24, PALETTE.camoTan],  [40, 62, 56, 28, PALETTE.camoDark],
            [110, 58, 60, 32, PALETTE.camoBrown], [8, 84, 40, 26, PALETTE.camoTan],
            [150, 92, 42, 24, PALETTE.camoOlive], [78, 92, 46, 22, PALETTE.camoTan],
        ];
        for (const [px, py, pw, ph, col] of patches) {
            g.beginFill(col, 0.9);
            g.drawEllipse(px + pw / 2, py * (roofH / 126) + ph / 2, pw / 2, ph / 2);
            g.endFill();
        }
        // Kalenica + panele dachu
        g.lineStyle(2, PALETTE.camoDark, 0.7);
        g.moveTo(0, roofH * 0.5);
        g.lineTo(w, roofH * 0.5);
        for (let px = 40; px < w; px += 40) { g.moveTo(px, 0); g.lineTo(px, roofH); }
        g.lineStyle(0);
        // Okap (jasna krawedz dachu)
        g.beginFill(PALETTE.camoTan, 0.8);
        g.drawRect(0, roofH - 4, w, 4);
        g.endFill();

        // ── Sciana poludniowa (front) ──
        g.beginFill(PALETTE.wallDark);
        g.drawRect(0, roofH, w, WALL_H);
        g.endFill();
        // Wrota hangaru (2 skrzydla) z ukosnymi szewronami
        const gateW = w * 0.52;
        const gateX = (w - gateW) / 2;
        g.beginFill(PALETTE.gate);
        g.drawRect(gateX, roofH + 4, gateW, WALL_H - 8);
        g.endFill();
        g.lineStyle(4, PALETTE.gateStripe, 0.85);
        for (let sx = gateX + 6; sx < gateX + gateW - 4; sx += 18) {
            g.moveTo(sx, roofH + WALL_H - 6);
            g.lineTo(sx + 10, roofH + 6);
        }
        g.lineStyle(0);
        // Podzial skrzydel
        g.lineStyle(3, PALETTE.wallDark, 1);
        g.moveTo(w / 2, roofH + 4);
        g.lineTo(w / 2, roofH + WALL_H - 4);
        g.lineStyle(0);
        // Okienka po bokach bramy
        for (const wx of [gateX / 2 - 8, w - gateX / 2 - 8]) {
            g.beginFill(0x9ab8c8, 0.9);
            g.drawRect(wx, roofH + 8, 16, 10);
            g.endFill();
            g.lineStyle(2, PALETTE.camoDark, 0.8);
            g.drawRect(wx, roofH + 8, 16, 10);
            g.lineStyle(0);
        }

        // ── Gwiazda (militarny emblemat na dachu) ──
        const cx = w / 2;
        const cy = roofH * 0.5;
        const starPts: number[] = [];
        const R1 = 20, R2 = 8;
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? R1 : R2;
            const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
            starPts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.beginFill(PALETTE.star, 0.9);
        g.drawPolygon(starPts);
        g.endFill();

        // ── Worki z piaskiem przy narozach frontu ──
        for (const bx of [8, w - 30]) {
            for (let i = 0; i < 3; i++) {
                g.beginFill(i % 2 ? 0x9a8a5c : 0x8a7a50);
                g.drawEllipse(bx + 11 + (i % 2) * 4, roofH + WALL_H - 8 - i * 7, 12, 5);
                g.endFill();
            }
        }
    }

    /** 3 maszty na zdobyte flagi (przejezdne; proporce wciaga F2 po capture). */
    private drawMasts(): void {
        const g = this.gfxMasts;
        const MAST_H = 74;

        for (const m of FORTIFIED_FLAG_MASTS) {
            const mx = m.x;
            const my = m.y;
            // Cien
            g.beginFill(0x2c2416, 0.3);
            g.drawEllipse(mx + 3, my + 3, 10, 4);
            g.endFill();
            // Podstawa (betonowy klocek)
            g.beginFill(0x8a8878);
            g.drawRect(mx - 7, my - 6, 14, 10);
            g.endFill();
            g.beginFill(0x6e6c5e);
            g.drawRect(mx - 7, my + 1, 14, 3);
            g.endFill();
            // Maszt
            g.beginFill(PALETTE.mastPole);
            g.drawRect(mx - 2, my - MAST_H, 4, MAST_H - 4);
            g.endFill();
            // Kula na szczycie w kolorze flagi (czytelnosc: ktory maszt czyj)
            g.beginFill(m.color);
            g.drawCircle(mx, my - MAST_H - 3, 5);
            g.endFill();
            // Linka (pusta — proporzec pojawi sie po capture w F2)
            g.lineStyle(1.5, 0xc8c8c0, 0.7);
            g.moveTo(mx + 4, my - MAST_H + 4);
            g.lineTo(mx + 6, my - 10);
            g.lineStyle(0);
        }
    }

    /**
     * Pulsujacy beacon w srodku strefy — widoczny "wroc tutaj" (Sensoryka).
     * FAZA CTF F3: carrying=true => DRAMATYCZNY tryb dostawy (szybszy puls,
     * podwojny ring, wiekszy zasieg, mocniejsza alpha) — beacon dostawy.
     */
    public update(carrying: boolean = false): void {
        const time = Date.now();
        const g = this.gfxBeacon;
        g.clear();
        const cx = this.w / 2 + 60; // przesuniety na wschod od budynku (wolny apron)
        const cy = this.h / 2;
        const period = carrying ? 900 : 1600;
        const maxR = carrying ? 110 : 60;
        const baseAlpha = carrying ? 0.85 : 0.5;
        const t = (time % period) / period;
        const radius = 20 + t * maxR;
        const alpha = baseAlpha * (1 - t);
        g.lineStyle(carrying ? 6 : 4, PALETTE.beacon, alpha);
        g.drawCircle(cx, cy, radius);
        g.lineStyle(0);
        if (carrying) {
            // Drugi ring w przeciwfazie + staly marker celu
            const t2 = ((time + period / 2) % period) / period;
            g.lineStyle(4, 0xffffff, 0.5 * (1 - t2));
            g.drawCircle(cx, cy, 20 + t2 * maxR);
            g.lineStyle(0);
            g.lineStyle(3, PALETTE.beacon, 0.9);
            g.drawCircle(cx, cy, 16);
            g.lineStyle(0);
        }
    }
}
