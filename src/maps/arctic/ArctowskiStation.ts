import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * ArctowskiStation — Polska Stacja Antarktyczna im. H. Arctowskiego (ARC-R3).
 *
 * Referencje Mariusza (20260801_Antarktyda*.png): NISKI, dlugi, ZLOTY kadlub o
 * PRZEKROJU HEKSAGONALNYM na stalowych nogach-zastrzalach. Gorny-lewy rog mapy.
 *
 * BRYLA (feedback v4): sylwetka kadluba = OSMIOKAT (prostokat ze scietymi narozami
 * na 0.25h/0.75h), a konce to WASKIE heksagonalne SCIANY CZOLOWE wpuszczone w
 * sylwetke (perspektywicznie splaszczone denka pryzmy — nie doklejone tarcze).
 * Przekroj heksagonalny widac Z BOKU: chamfer sylwetki + denko + krawedzie
 * wzdluzne biegnace wprost z narozy denka.
 *
 * KADLUB UNIESIONY (RISE) nad footprintem => przeswit, w ktorym widac OBA rzedy
 * nog (przedni + tylny, cofniety "w glab"). Nogi dynamiczne (pomysl AD): stopa na
 * GRUNCIE -> brzuch kadluba na OFFSECIE paralaksy (pochylaja sie z kamera).
 * Feedback v4: nizsze i o 50% GRUBSZE.
 *
 * OKNA: kwadratowe z mocno zaokraglonymi narozami (squircle), w TRZECH rzedach
 * (gorna faseta / sciana frontowa / dolny skos), JUSTOWANE do modulow — jeden
 * zestaw okien na modul, idealnie w jego osi.
 *
 * Paralaksa: wzorzec CyberBuilding (CityMap.ts); zIndex = y+oy+h + x*1e-4.
 * Collidable: buildings (dostaje update(cam) z petli) + solidBuildings.
 */

const HF = 0.11;
const RISE = 24;          // kadlub wisi nad gruntem (przeswit na nogi; JEDNO zrodlo, bez double-count)
const CAP_A = 16;         // polszerokosc heksagonalnej sciany czolowej (waska — perspektywa)

const C = {
    // metaliczne zloto — wysoki kontrast (paleta AD; kontrast = iluzja metalu)
    goldHighlight: 0xfff5c2,
    goldBase:      0xebb734,
    goldMid:       0xb5861b,
    goldShadow:    0x594109,
    goldSeam:      0x8c6511,
    // okna
    windowFrame:   0x3a2b0f,
    windowGlass:   0x1a2b35,
    windowReflect: 0x6da5c7,
    windowWarm:    0xffc857,
    // konstrukcja (stalowe nogi)
    stilt:         0xe2e8f0,
    stiltShade:    0x64748b,
    stiltCore:     0x0f172a,
    // detale
    trim:          0xf6efdd,
    beacon:        0xe84f4f,
    flagRed:       0xdc143c,
} as const;

export class ArctowskiStation implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private gfx: PIXI.Graphics;          // dynamiczna (nogi + kadlub, redraw per frame)

    /** cx/cy = CENTER (ARCTIC_STATION_POS); hitbox = footprint (top-left). */
    constructor(cx: number, cy: number, w: number, h: number, worldContainer: PIXI.Container) {
        this.w = w;
        this.h = h;
        this.x = cx - w / 2;
        this.y = cy - h / 2;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        const gfxStatic = new PIXI.Graphics();
        gfxStatic.zIndex = this.y + h - 1; // pod kadlubem, nad tafla
        worldContainer.addChild(gfxStatic);

        this.gfx = new PIXI.Graphics();
        this.gfx.zIndex = this.y + h + this.x * 1e-4;
        worldContainer.addChild(this.gfx);

        this.drawStatic(gfxStatic);
    }

    /** Cien + naspy — baked raz (grunt). Nogi/drabinka sa DYNAMICZNE (w update). */
    private drawStatic(g: PIXI.Graphics): void {
        const { x, y, w, h } = this;

        // podwojny cien kontaktowy (SE — slonce NW; miekka glebia pod kadlubem)
        g.beginFill(0x15323d, 0.30);
        g.drawEllipse(x + w / 2, y + h + 2, w * 0.45, 14);
        g.endFill();
        g.beginFill(0x15323d, 0.18);
        g.drawEllipse(x + w / 2 + 14, y + h + 9, w * 0.40, 18);
        g.endFill();

        // organiczne naspy sniegu wklejajace stacje w krajobraz
        g.beginFill(0xdfeef4, 0.85);
        g.drawEllipse(x + w * 0.15, y + h + 12, 45, 11);
        g.drawEllipse(x + w * 0.62, y + h + 8, w * 0.24, 8);
        g.drawEllipse(x + w * 0.88, y + h + 10, 35, 9);
        g.endFill();
    }

    /** Jedna dynamiczna noga V: stopa (grunt) -> brzuch kadluba (offset). */
    private drawLeg(g: PIXI.Graphics, groundX: number, groundY: number,
        hullX: number, hullY: number, backRow: boolean): void {
        const spread = backRow ? 10 : 13;
        const thick = backRow ? 10 : 12;     // feedback v4: +50% masywniejsze
        const litCol = backRow ? C.stiltShade : C.stilt;

        // tylny (zacieniony) zastrzal
        g.lineStyle(thick, backRow ? C.stiltCore : C.stiltShade, backRow ? 0.85 : 1);
        g.moveTo(groundX + spread, groundY - 3); g.lineTo(hullX, hullY);
        // przedni (oswietlony) zastrzal
        g.lineStyle(thick, litCol, 1);
        g.moveTo(groundX - spread, groundY); g.lineTo(hullX, hullY);
        // ciemny rdzen dla grubosci
        g.lineStyle(3, C.stiltCore, 0.4);
        g.moveTo(groundX - spread, groundY); g.lineTo(hullX, hullY);

        // stopa fundamentowa
        g.lineStyle(0);
        g.beginFill(backRow ? C.stiltCore : C.stiltShade, backRow ? 0.9 : 1);
        g.drawPolygon([groundX - spread - 9, groundY, groundX + spread + 9, groundY - 5,
            groundX + spread + 9, groundY - 1, groundX - spread - 9, groundY + 4]);
        g.endFill();
    }

    /** Paralaksa per frame: 2 rzedy nog + kadlub-osmiokat z hex denkami + 3 rzedy okien. */
    public update(camX: number, camY: number, screenW: number, screenH: number): void {
        const ox = (this.x + this.w / 2 - (camX + screenW / 2)) * HF;
        const oy = (this.y + this.h / 2 - (camY + screenH / 2)) * HF;

        this.gfx.zIndex = this.y + oy + this.h + this.x * 1e-4;

        const g = this.gfx;
        g.clear();

        const rx = this.x + ox;
        const ry = this.y + oy - RISE;        // kadlub UNIESIONY (przeswit na nogi)
        const midY = ry + this.h / 2;
        const yBot = ry + this.h;
        const corn = this.h * 0.25;           // naroza hexa (0.25h / 0.75h)
        const a = CAP_A;

        // ══ 1. NOGI — 2 rzedy w przeswicie pod kadlubem (tylny cofniety "w glab") ══
        const legCount = 8;
        for (let i = 0; i < legCount; i++) {
            const p = i / (legCount - 1);
            const lx = a * 2 + 14 + p * (this.w - a * 4 - 28);
            // TYLNY rzad: stopy wyzej (dalej od kamery), ciemniejsze — czytelna glebia
            this.drawLeg(g, this.x + lx + 6, this.y + this.h - 16, rx + lx + 6, yBot - 4, true);
        }
        for (let i = 0; i < legCount; i++) {
            const p = i / (legCount - 1);
            const lx = a * 2 + 14 + p * (this.w - a * 4 - 28);
            // PRZEDNI rzad: stopy tuz pod kadlubem (nizsze, masywne nogi)
            this.drawLeg(g, this.x + lx, this.y + this.h + 10, rx + lx, yBot - 2, false);
        }
        g.lineStyle(0);

        // ══ 2. KADLUB — OSMIOKAT (prostokat ze scietymi narozami = przekroj hex z boku) ══
        const octPath: number[] = [
            rx + a, ry,
            rx + this.w - a, ry,
            rx + this.w, ry + corn,
            rx + this.w, yBot - corn,
            rx + this.w - a, yBot,
            rx + a, yBot,
            rx, yBot - corn,
            rx, ry + corn,
        ];
        g.beginFill(C.goldBase);
        g.drawPolygon(octPath);
        g.endFill();

        // FASETY: krawedzie wzdluzne DOKLADNIE na wysokosci narozy denek
        const bandTop = ry + corn;
        const bandSkirt = yBot - corn;
        const inA = rx + a * 2;               // cialo zaczyna sie ZA sciana czolowa
        const inB = rx + this.w - a * 2;

        // gorna faseta — MOCNY blik sloneczny (kontrast = metal)
        g.beginFill(C.goldHighlight, 0.9);
        g.drawPolygon([inA, ry + 2, inB, ry + 2, inB, bandTop, inA, bandTop]);
        g.endFill();
        // dolny skos — GLEBOKI cien wlasny przekroju
        g.beginFill(C.goldShadow, 0.85);
        g.drawPolygon([inA, bandSkirt, inB, bandSkirt, inB, yBot - 1, inA, yBot - 1]);
        g.endFill();

        // ══ 3. MODULY + OKNA justowane do modulow (feedback v4) ══
        const MODULES = 11;
        const segW = (inB - inA) / MODULES;
        const tones = [0xdcba5e, 0xe8c96f, 0xd4b054, 0xeed27c, 0xe0bd62, 0xd8b65a, 0xe5c46a];
        const doorModule = Math.floor(MODULES / 2); // sluza w srodkowym module
        const winMidY = (bandTop + bandSkirt) / 2;

        for (let i = 0; i < MODULES; i++) {
            const segX = inA + i * segW;
            const cxM = segX + segW / 2;      // OS modulu — do niej justowane wszystkie okna
            // ton modulu (sciana frontowa niejednolita)
            g.beginFill(tones[i % tones.length], 0.45);
            g.drawRect(segX + 1, bandTop, segW - 2, bandSkirt - bandTop);
            g.endFill();
            // fuga modulowa (pion przez wszystkie fasety)
            if (i > 0) {
                g.lineStyle(1.4, C.goldSeam, 0.55);
                g.moveTo(segX, ry + 3);
                g.lineTo(segX, yBot - 3);
                g.lineStyle(0);
            }

            const lit = (i % 5 === 1 || i % 7 === 3); // rozrzucone cieple swiatla (AD)

            // — rzad GORNY (gorna faseta): male squircle, os modulu —
            g.beginFill(C.windowFrame);
            g.drawRoundedRect(cxM - 5.5, ry + corn * 0.5 - 4, 11, 8, 3.5);
            g.endFill();
            g.beginFill(lit ? C.windowWarm : C.windowGlass);
            g.drawRoundedRect(cxM - 4, ry + corn * 0.5 - 2.5, 8, 5, 2.5);
            g.endFill();

            // — rzad SRODKOWY (sciana frontowa): glowne squircle-bulaje / sluza —
            if (i === doorModule) {
                g.beginFill(C.windowFrame);
                g.drawRoundedRect(cxM - 12, bandTop + 6, 24, bandSkirt - bandTop - 8, 5);
                g.endFill();
                g.beginFill(C.windowGlass);
                g.drawRoundedRect(cxM - 8, bandTop + 10, 16, 13, 4);
                g.endFill();
            } else {
                g.beginFill(C.windowFrame);
                g.drawRoundedRect(cxM - 8, winMidY - 7, 16, 14, 5.5);
                g.endFill();
                g.beginFill(lit ? C.windowWarm : C.windowGlass);
                g.drawRoundedRect(cxM - 6, winMidY - 5, 12, 10, 4.5);
                g.endFill();
                if (lit) {
                    g.beginFill(C.windowWarm, 0.25);
                    g.drawCircle(cxM, winMidY, 13);
                    g.endFill();
                } else {
                    g.beginFill(C.windowReflect, 0.7);
                    g.drawRoundedRect(cxM - 5, winMidY - 4, 10, 3.5, 1.8);
                    g.endFill();
                    g.beginFill(0xffffff, 0.85);
                    g.drawCircle(cxM - 3, winMidY - 2.5, 1);
                    g.endFill();
                }
            }

            // — rzad DOLNY (dolny skos): male squircle, os modulu —
            g.beginFill(C.windowFrame, 0.9);
            g.drawRoundedRect(cxM - 5.5, yBot - corn * 0.5 - 4, 11, 8, 3.5);
            g.endFill();
            g.beginFill(lit ? C.windowWarm : 0x243740, 0.95);
            g.drawRoundedRect(cxM - 4, yBot - corn * 0.5 - 2.5, 8, 5, 2.5);
            g.endFill();
        }

        // TWARDE krawedzie zalaman — cap-to-cap (KANTY przekroju)
        g.lineStyle(2, C.goldHighlight, 0.85);
        g.moveTo(inA, bandTop); g.lineTo(inB, bandTop);
        g.lineStyle(2, C.goldShadow, 0.85);
        g.moveTo(inA, bandSkirt); g.lineTo(inB, bandSkirt);
        g.lineStyle(0);

        // ══ 4. HEX SCIANY CZOLOWE — waskie, WPUSZCZONE w sylwetke (nie doklejone) ══
        const drawCapFace = (edgeX: number, dir: 1 | -1, litFace: boolean) => {
            const peakX = edgeX + dir * a;    // krawedz pionowa "grzbietu" denka
            const hex: number[] = [
                peakX, ry,
                edgeX + dir * a * 2, ry + corn * 0.999, // styk z cialem (bez szpar AA)
                edgeX + dir * a * 2, yBot - corn * 0.999,
                peakX, yBot,
                edgeX, yBot - corn,
                edgeX, ry + corn,
            ];
            g.beginFill(litFace ? C.goldMid : C.goldShadow, 0.9);
            g.drawPolygon(hex);
            g.endFill();
            // polowka blizsza kamery jasniejsza (kant pionowy denka)
            g.beginFill(litFace ? C.goldBase : C.goldMid, 0.7);
            g.drawPolygon([peakX, ry, edgeX + dir * a * 2, ry + corn, edgeX + dir * a * 2, yBot - corn, peakX, yBot]);
            g.endFill();
            // obrys + zebra grodzi (heksagon czytelny z boku)
            g.lineStyle(1.8, C.goldSeam, 0.9);
            g.drawPolygon(hex);
            g.lineStyle(1.2, C.goldSeam, 0.55);
            g.moveTo(peakX, ry); g.lineTo(peakX, yBot);
            g.lineStyle(0);
        };
        drawCapFace(rx, 1, true);                      // denko zachodnie (slonce NW)
        drawCapFace(rx + this.w, -1, false);           // denko wschodnie (cien)

        // ══ 5. Drabinka: sluza (offset) -> grunt (statyczny) — pochyla sie jak nogi ══
        const doorX = inA + doorModule * segW + segW / 2;
        const ladGX = this.x + this.w / 2;
        const ladGY = this.y + this.h + 10;
        g.lineStyle(2.4, C.stiltShade, 1);
        g.moveTo(doorX - 5, yBot - 2); g.lineTo(ladGX - 5, ladGY);
        g.moveTo(doorX + 5, yBot - 2); g.lineTo(ladGX + 5, ladGY);
        for (let f = 0.2; f < 1; f += 0.2) {
            const lx2 = doorX + (ladGX - doorX) * f;
            const ly2 = (yBot - 2) + (ladGY - (yBot - 2)) * f;
            g.moveTo(lx2 - 5, ly2); g.lineTo(lx2 + 5, ly2);
        }
        g.lineStyle(0);

        // biala listwa obrysu sylwetki
        g.lineStyle(1.6, C.trim, 0.5);
        g.drawPolygon(octPath);
        g.lineStyle(0);

        // beacon (czerwona lampka nawigacyjna)
        g.beginFill(C.beacon, 0.35);
        g.drawCircle(rx + this.w * 0.5, ry - 2, 6);
        g.endFill();
        g.beginFill(C.beacon);
        g.drawCircle(rx + this.w * 0.5, ry - 2, 2.6);
        g.endFill();

        // flaga PL na maszcie (przy wschodnim denku)
        const fx = rx + this.w - a * 2 - 18;
        const fy = ry + 4;
        g.lineStyle(2, C.stiltShade, 1);
        g.moveTo(fx, fy + 8); g.lineTo(fx, fy - 14);
        g.lineStyle(0);
        g.beginFill(0xffffff);
        g.drawRect(fx, fy - 14, 13, 4.4);
        g.endFill();
        g.beginFill(C.flagRed);
        g.drawRect(fx, fy - 9.6, 13, 4.4);
        g.endFill();

        // czasza satelitarna (przy zachodnim denku)
        const dx2 = rx + a * 2 + 16;
        const dy2 = ry + 6;
        g.beginFill(C.stilt);
        g.drawEllipse(dx2, dy2, 8.5, 5.6);
        g.endFill();
        g.beginFill(C.stiltShade, 0.6);
        g.drawEllipse(dx2 + 1.8, dy2 + 0.9, 4.8, 3.2);
        g.endFill();
    }
}
