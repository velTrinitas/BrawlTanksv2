import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { bakeToSprite } from '../propBaker';
import { ArchaeologistDigger } from '../../entities/desert/Archaeologist';

/**
 * ArchaeologyCamp — DESERT ART v2 / E7 (uwaga Mariusza 2026-09-28). Obozowisko przy
 * piramidzie archeologow (za rzeka): prowizoryczny namiot, terenowy jeep (styl Willys /
 * Cherokee — fake-3D z cieniem) i wykop przed piramida z archeologiem przy pracy.
 *
 * KOLIZJA: tylko jeep = przeszkoda (buildings + solidBuildings), hitbox = obrys na ziemi.
 * Namiot PRZEJEZDNY (uwaga Mariusza) — czolg przejezdza przez plotno.
 * Wykop jest plaski — przejezdny (tylko rysunek + animowany archeolog).
 * Pozycje math-verified (DesertMap.ts: DESERT_CAMP_V2). Slonce NW, art pieczony raz.
 * COOP/MP: przeszkody statyczne; archeolog przy pracy = lokalny wizual.
 */

function baked(key: string, draw: (g: PIXI.Graphics) => void): PIXI.Sprite | null {
    const g = new PIXI.Graphics();
    draw(g);
    const s = bakeToSprite(g, key);
    g.destroy();
    if (!s) console.error(`[ArchaeologyCamp] ${key}: brak renderera do pieczenia`);
    return s;
}

class CampObstacle implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    constructor(cx: number, cy: number, w: number, h: number, spr: PIXI.Sprite | null, world: PIXI.Container) {
        this.w = w; this.h = h; this.x = cx - w / 2; this.y = cy - h / 2;
        if (spr) {
            spr.x = cx; spr.y = cy;
            spr.zIndex = cy + h / 2;
            world.addChild(spr);
        }
    }
    update(_a: number, _b: number, _c: number, _d: number): void { /* statyczne */ }
}

/** Namiot: plocienny namiot kalenicowy, lekko zapadniety, laty, odciagi i sledzie. 90x70. */
export function createTent(cx: number, cy: number, world: PIXI.Container): ICollidable {
    const spr = baked('camp_tent', g => {
        const W = 90, D = 70, H = 46;
        const hw = W / 2, hd = D / 2;
        // cien SE
        g.beginFill(0x000000, 0.22);
        g.drawPolygon([-hw + 10, hd, hw + 30, hd + 14, hw + 44, -hd + 18, hw, -hd + 4]);
        g.endFill();
        // odciagi i sledzie
        g.lineStyle(1, 0x6a5a40, 0.9);
        for (const [x, y] of [[-hw - 10, -hd + 6], [-hw - 10, hd - 4], [hw + 10, -hd + 6], [hw + 10, hd - 4]]) {
            g.moveTo(x < 0 ? -hw + 4 : hw - 4, y < 0 ? -hd + 14 - H * 0.4 : hd - H * 0.4);
            g.lineTo(x, y);
        }
        g.lineStyle(0);
        g.beginFill(0x4a3420);
        for (const [x, y] of [[-hw - 10, -hd + 6], [-hw - 10, hd - 4], [hw + 10, -hd + 6], [hw + 10, hd - 4]]) g.drawRect(x - 1.5, y - 1.5, 3, 3);
        g.endFill();
        // polac N (w sloncu) i polac S (cien), kalenica lekko zapadnieta
        const ridgeY = -H;
        g.beginFill(0xe4d6b0);
        g.drawPolygon([-hw, -hd + 20, hw, -hd + 20, hw - 4, ridgeY + 4, 0, ridgeY + 8, -hw + 4, ridgeY + 4]);
        g.endFill();
        g.beginFill(0xb8a47c);
        g.drawPolygon([-hw, hd - 8, hw, hd - 8, hw, -hd + 20, hw - 4, ridgeY + 4, 0, ridgeY + 8, -hw + 4, ridgeY + 4, -hw, -hd + 20]);
        g.endFill();
        g.beginFill(0x000000, 0.12);                         // zmarszczki plotna
        g.drawPolygon([-20, hd - 8, -8, hd - 8, -4, ridgeY + 12, -10, ridgeY + 10]);
        g.drawPolygon([18, hd - 8, 28, hd - 8, 22, ridgeY + 10, 17, ridgeY + 12]);
        g.endFill();
        // lata
        g.beginFill(0x8a9a6a); g.drawRect(-30, -4, 14, 11); g.endFill();
        g.lineStyle(0.8, 0x4a4a30, 0.8); g.drawRect(-30, -4, 14, 11); g.lineStyle(0);
        // wejscie (otwarta klapa po S) — ciemne wnetrze + podwinieta klapa
        g.beginFill(0x2a2014); g.drawPolygon([-12, hd - 8, 12, hd - 8, 0, ridgeY + 16]); g.endFill();
        g.beginFill(0xd4c49a); g.drawPolygon([12, hd - 8, 22, hd - 10, 3, ridgeY + 18]); g.endFill();
        // kalenica + maszty
        g.lineStyle(2, 0x5a4028, 1);
        g.moveTo(-hw + 4, ridgeY + 4); g.lineTo(0, ridgeY + 8); g.lineTo(hw - 4, ridgeY + 4);
        g.moveTo(-hw + 4, ridgeY + 4); g.lineTo(-hw + 4, hd - 8);
        g.moveTo(hw - 4, ridgeY + 4); g.lineTo(hw - 4, hd - 8);
        g.lineStyle(0);
        // skrzynka z lampa przed namiotem
        g.beginFill(0x7a5a30); g.drawRect(-hw + 2, hd - 4, 16, 10); g.endFill();
        g.beginFill(0xa07a44); g.drawRect(-hw + 2, hd - 4, 16, 3); g.endFill();
        g.beginFill(0xffd070); g.drawCircle(-hw + 10, hd - 8, 2.5); g.endFill();
    });
    return new CampObstacle(cx, cy, 90, 70, spr, world);
}

/**
 * Jeep terenowy (styl Willys / Cherokee) w widoku 3/4 JAK CZOLGI (uwaga Mariusza: „mniej
 * plasko"): widac dach/maske (gorna sciana uniesiona o RISE), bok od poludnia z wysokoscia
 * nadwozia, kola na boku jako elipsy z felgami, blotniki, szyby z odbiciem nieba, cien SE.
 * Hitbox = obrys na ziemi 70x40 (bez zmian). Przodem na E.
 */
export function createJeep(cx: number, cy: number, world: PIXI.Container): ICollidable {
    const spr = baked('camp_jeep_34', g => {
        const hw = 35, hd = 20, RISE = 16;
        const TOP = 0xa8a270, TOP_L = 0xc8c290, SIDE = 0x6e6a44, SIDE_D = 0x4e4a30, TRIM = 0x3a3824;
        const topY = -hd - RISE;           // gorna krawedz dachu/maski (tyl nadwozia uniesiony)
        const frontY = hd - RISE;          // dolna krawedz gornej sciany = gorna krawedz boku
        // cien SE (czworokat — bryla nie rzuca okraglego cienia)
        g.beginFill(0x000000, 0.28);
        g.drawPolygon([-hw + 4, hd, hw + 2, hd, hw + 16, hd + 12, -hw + 18, hd + 12]);
        g.endFill();
        // kola po stronie N (czesciowo schowane za nadwoziem)
        g.beginFill(0x1a1a1a);
        g.drawEllipse(-20, frontY - 26, 8, 5); g.drawEllipse(22, frontY - 26, 8, 5);
        g.endFill();
        // BOK (S) — wysokosc nadwozia
        g.beginFill(SIDE); g.drawRect(-hw, frontY, 70, RISE + 2); g.endFill();
        g.beginFill(SIDE_D); g.drawRect(-hw, frontY + RISE - 3, 70, 5); g.endFill();          // prog
        g.beginFill(0xffffff, 0.12); g.drawRect(-hw, frontY, 70, 2); g.endFill();              // krawedz w sloncu
        // wyciecie drzwi (Willys: bez drzwi) + blotniki nad kolami
        g.beginFill(TRIM); g.drawRoundedRect(-6, frontY + 2, 16, 10, 3); g.endFill();
        g.beginFill(SIDE_D);
        g.drawRoundedRect(-30, frontY + 5, 20, 8, 4);
        g.drawRoundedRect(12, frontY + 5, 20, 8, 4);
        g.endFill();
        // kola S: opona + felga + piasta, bieznik
        for (const x of [-20, 22]) {
            g.beginFill(0x151515); g.drawEllipse(x, hd - 1, 10, 7); g.endFill();
            g.beginFill(0x6a6a5a); g.drawEllipse(x, hd - 1, 5.5, 3.8); g.endFill();
            g.beginFill(0x3a3a30); g.drawEllipse(x, hd - 1, 2, 1.4); g.endFill();
            g.lineStyle(1, 0x2a2a2a, 1);
            for (let k = -2; k <= 2; k++) { g.moveTo(x + k * 3.5, hd - 7); g.lineTo(x + k * 3.5 + 1, hd - 5.5); }
            g.lineStyle(0);
        }
        // GORA: tylna skrzynia (nizej, bo bez dachu) + maska z przodu
        g.beginFill(TOP); g.drawRect(-hw, topY + 2, 70, frontY - topY - 2); g.endFill();
        g.beginFill(TOP_L); g.drawRect(-hw, topY + 2, 70, 5); g.endFill();                    // swiatlo NW
        // skrzynia ladunkowa (wglebienie) ze sprzetem
        g.beginFill(0x5a5638); g.drawRect(-hw + 3, topY + 6, 24, frontY - topY - 9); g.endFill();
        g.beginFill(0xa07a44); g.drawRect(-hw + 5, topY + 8, 9, 8); g.drawRect(-hw + 16, topY + 17, 8, 8); g.endFill();
        g.beginFill(0xd8b070); g.drawRect(-hw + 5, topY + 8, 9, 2); g.drawRect(-hw + 16, topY + 17, 8, 2); g.endFill();
        g.lineStyle(1.4, 0x5a3a1c, 1); g.moveTo(-hw + 6, frontY - 6); g.lineTo(-hw + 24, topY + 10); g.lineStyle(0);
        // fotele + kierownica
        g.beginFill(0x3a2a1a); g.drawRoundedRect(-6, topY + 6, 10, 9, 2); g.drawRoundedRect(-6, frontY - 14, 10, 9, 2); g.endFill();
        g.beginFill(0x5a4430); g.drawRect(-6, topY + 6, 10, 2); g.drawRect(-6, frontY - 14, 10, 2); g.endFill();
        g.lineStyle(2, 0x1a1a1a, 1); g.drawEllipse(7, topY + 11, 2.5, 3.5); g.lineStyle(0);
        // szyba (rama stojaca = widoczna jako pas z odbiciem nieba)
        g.beginFill(TRIM); g.drawRect(10, topY + 1, 4, frontY - topY); g.endFill();
        g.beginFill(0x9ec8e0, 0.85); g.drawRect(10.8, topY + 3, 2.4, frontY - topY - 4); g.endFill();
        g.beginFill(0xffffff, 0.6); g.drawRect(10.8, topY + 4, 2.4, 5); g.endFill();
        // maska: lekko wypukla, przetloczenia, grill + reflektory na czole (E)
        g.beginFill(TOP_L, 0.5); g.drawRoundedRect(15, topY + 3, 18, frontY - topY - 6, 4); g.endFill();
        g.lineStyle(1, SIDE_D, 0.7);
        g.moveTo(16, topY + 9); g.lineTo(32, topY + 9);
        g.moveTo(16, frontY - 8); g.lineTo(32, frontY - 8);
        g.lineStyle(0);
        g.beginFill(TRIM); g.drawRect(hw - 3, topY + 3, 3, frontY - topY + RISE - 2); g.endFill();
        g.lineStyle(0.8, 0x6a6a5a, 1);
        for (let k = 0; k < 6; k++) { const y = topY + 6 + k * 5; g.moveTo(hw - 3, y); g.lineTo(hw, y); }
        g.lineStyle(0);
        g.beginFill(0xfff4c0); g.drawCircle(hw - 1, topY + 5, 2.4); g.drawCircle(hw - 1, frontY + 4, 2.4); g.endFill();
        // kolo zapasowe na tyle (stojace — widoczne jako elipsa)
        g.beginFill(0x151515); g.drawEllipse(-hw - 3, frontY - 6, 5, 10); g.endFill();
        g.beginFill(0x6a6a5a); g.drawEllipse(-hw - 3, frontY - 6, 2.5, 5); g.endFill();
        // obrys gornej sciany (czytelnosc bryly)
        g.lineStyle(1.2, TRIM, 0.6); g.drawRect(-hw, topY + 2, 70, frontY - topY - 2); g.lineStyle(0);
    });
    return new CampObstacle(cx, cy, 70, 40, spr, world);
}

/**
 * Wykop przed piramida: prostokatny dol z warstwami (sciany w cieniu/sloncu), siatka
 * sznurkow na palikach, sito, wiadra, odsloniete znalezisko (glowa posagu). Przejezdny.
 */
export function createDigSite(cx: number, cy: number, world: PIXI.Container): { update(): void } {
    const spr = baked('camp_dig', g => {
        const W = 110, D = 70, hw = W / 2, hd = D / 2;
        // haldy wybranego piasku
        g.beginFill(0xe8c890); g.drawEllipse(hw + 14, -6, 18, 26); g.endFill();
        g.beginFill(0xf4dcaa); g.drawEllipse(hw + 10, -12, 10, 14); g.endFill();
        // dol: sciana N w cieniu (widac ja z gory), sciana S w sloncu, dno
        g.beginFill(0x8a6a3c); g.drawRect(-hw, -hd, W, D); g.endFill();
        g.beginFill(0x5e4424); g.drawRect(-hw, -hd, W, 14); g.endFill();
        g.beginFill(0x7a5a30); g.drawRect(-hw, -hd, 8, D); g.endFill();
        g.beginFill(0xc8a068); g.drawRect(-hw + 8, -hd + 14, W - 8, D - 14); g.endFill();
        g.lineStyle(1, 0x5e4424, 0.5);                       // warstwy stratygraficzne na scianie
        for (let i = 1; i < 4; i++) { g.moveTo(-hw, -hd + i * 3.5); g.lineTo(hw, -hd + i * 3.5); }
        g.lineStyle(0);
        // stopien (poziom wykopu)
        g.beginFill(0xb08a58); g.drawRect(-hw + 8, -hd + 14, 30, D - 14); g.endFill();
        // znalezisko: glowa posagu w nemes + skorupy
        g.beginFill(0x2a5aa0); g.drawPolygon([6, -4, 22, -4, 20, 10, 8, 10]); g.endFill();
        g.beginFill(0xe8c050); g.drawRect(8, 0, 12, 2); g.drawRect(8, 5, 12, 2); g.endFill();
        g.beginFill(0xc89a64); g.drawEllipse(14, 0, 5, 6); g.endFill();
        g.beginFill(0xb05a2a); g.drawPolygon([-20, 14, -12, 12, -14, 18]); g.drawPolygon([30, 20, 36, 18, 34, 24]); g.endFill();
        // siatka sznurkow + paliki
        g.lineStyle(1, 0xf4f0e0, 0.9);
        for (let i = 0; i <= 3; i++) { const x = -hw + (W * i) / 3; g.moveTo(x, -hd); g.lineTo(x, hd); }
        g.moveTo(-hw, 0); g.lineTo(hw, 0);
        g.lineStyle(0);
        g.beginFill(0x6a4424);
        for (let i = 0; i <= 3; i++) for (const y of [-hd, hd]) g.drawRect(-hw + (W * i) / 3 - 1.5, y - 3, 3, 6);
        g.endFill();
        // sito i wiadra przy krawedzi
        g.beginFill(0x7a5a30); g.drawEllipse(-hw - 14, hd - 6, 11, 5); g.endFill();
        g.beginFill(0x3a3a3a, 0.7); g.drawEllipse(-hw - 14, hd - 7, 9, 3.5); g.endFill();
        g.beginFill(0x8a8a90); g.drawRoundedRect(-hw - 22, -12, 8, 9, 2); g.drawRoundedRect(-hw - 12, -20, 8, 9, 2); g.endFill();
    });
    if (spr) {
        spr.x = cx; spr.y = cy;
        spr.zIndex = 4;                                      // plaski — pod czolgami
        world.addChild(spr);
    }
    // archeolog przy pracy: kleczy na stopniu wykopu obok znaleziska
    return new ArchaeologistDigger(cx - 8, cy + 14, world);
}
