import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { bakeToSprite } from '../propBaker';

/**
 * Rock — Skała pustynna z 2 tiers (v0.18.0 FAZA 4a).
 * 
 * - 'large': pełna collision (ruch + pociski), 7 manual fixed positions, 70-100px
 * - 'small': BRAK collision, decoracja, 30-35 procedural random spawn, 15-35px
 * 
 * Visual: 8-sided irregular polygon z seed, 3-layer depth (shadow/body/highlight).
 * Large dodatkowo: cracks, moss patches, erosion marks.
 *
 * FAZA MARS M3: dodany OPCJONALNY parametr palety (default = pustynny PALETTE,
 * wiec Pustynia jest nietknieta). Klasa nie cache'uje tekstur, wiec wariant
 * kolorystyczny nie moze zatruc zadnej innej mapy. Ksztalt (nieregularny
 * polygon + erozja) jest uniwersalny dla kazdego swiata skalistego.
 */

export type RockPalette = {
    rockBase: number;
    rockLight: number;
    rockShadow: number;
    rockDeep: number;
    crackDark: number;
    mossGreen: number;   // organiczny nalot; na mapach bez zycia = odcien skaly
    sandyEdge: number;
};

const PALETTE: RockPalette = {
    rockBase:    0x9a7548,
    rockLight:   0xb89066,
    rockShadow:  0x6a4a28,
    rockDeep:    0x4a3018,
    crackDark:   0x2a1810,
    mossGreen:   0x5a7838,
    sandyEdge:   0xbca088,
};

export type RockTier = 'small' | 'large';

/**
 * Domyslny padding hitboxa (LEGACY). Marsjanskie i zamkowe skaly maja ulozenie
 * math-verified wlasnie na `size + 60` (komentarze „AABB 120x120" przy `size: 60`
 * w `main.ts`), wiec ta wartosc NIE MOZE sie zmienic globalnie.
 */
export const ROCK_HITBOX_PADDING_LEGACY = 60;

/**
 * Padding pustynny (v0.202.0) — hitbox = bryla skaly, zgodnie z Czytelnoscia #1
 * („hitboxy pokrywaja sie z tym, co narysowane"). Bryla to osmiokat o promieniu
 * `hS * (0.85 +- 0.15)` plus 3 px cienia, wiec jej AABB jest w najciasniejszym
 * przypadku rowne `size + 6`; 8 daje 2 px zapasu i ZERO penetracji wizualnej
 * (polygon zawsze zawiera sie w prostokacie). Dotad bylo 60 = 30 px powietrza na
 * kazda os — gracz zatrzymywal sie pol czolgu przed skala.
 */
export const ROCK_HITBOX_PADDING_DESERT = 8;

export class Rock implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    
    public visualX: number;  // public dla distance checks w main.ts
    public visualY: number;
    private size: number;
    private seed: number;
    private tier: RockTier;
    private palette: RockPalette;
    private artV2: boolean;

    private container: PIXI.Container;

    constructor(
        x: number,
        y: number,
        size: number,
        tier: RockTier,
        seed: number,
        worldContainer: PIXI.Container,
        palette: RockPalette = PALETTE,   // FAZA MARS M3 (default = pustynia)
        hitboxPadding: number = ROCK_HITBOX_PADDING_LEGACY,
        artV2: boolean = false,          // DESERT ART v2 — fasetowany glaz, ten sam obrys
    ) {
        this.artV2 = artV2;
        this.visualX = x;
        this.visualY = y;
        this.size = size;
        this.seed = seed;
        this.tier = tier;
        this.palette = palette;
        
        // Hitbox: large = collision, small = 0 (effectively no collision)
        if (tier === 'large') {
            // v0.202.0: padding parametryzowany — pustynia dostaje hitbox rowny bryle,
            // Mars/Zamek zostaja przy LEGACY 60 (ich layouty sa na tym math-verified).
            const hitboxSize = size + hitboxPadding;
            this.x = x - hitboxSize / 2;
            this.y = y - hitboxSize / 2;
            this.w = hitboxSize;
            this.h = hitboxSize;
        } else {
            this.x = x;
            this.y = y;
            this.w = 0;
            this.h = 0;
        }
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // Large rock: above small rocks/tracks; Small rock: low priority
        // v0.18.0-fix: small rocks zawsze pod player (zIndex 4 stałe, niezależne od y).
        // Large rocks Y-based dla naturalnego sortowania względem player/wrogów.
        this.container.zIndex = tier === 'large' ? y + 8 : 4;
        worldContainer.addChild(this.container);
        
        this.draw();
    }
    
    /**
     * v0.133.0 — art rysowany jak dotad w `Graphics`, ale na koniec PIECZONY do
     * tekstury (patrz `propBaker.ts`). Skala jest w calosci statyczna, a `update()`
     * to no-op, wiec nie ma nic, co musialoby zostac zywe. Zysk podwojny: gladkie
     * krawedzie mimo wylaczonego MSAA na dotyku oraz jeden quad zamiast teselacji
     * osmiokata z pekniciami i mchem przy kazdym rysowaniu.
     */
    private draw(): void {
        const g = new PIXI.Graphics();
        if (this.artV2) {
            this.drawV2(g);
            return;
        }

        const s = this.size;
        const hS = s / 2;
        const rot = (this.seed * 0.37) % (Math.PI * 2);
        
        // Cień rzucany na piasek (SE)
        g.beginFill(0x000000, 0.35);
        g.drawEllipse(hS * 0.3, hS * 0.45, hS * 1.05, hS * 0.7);
        g.endFill();
        
        // Sandy edge wokół podstawy
        g.beginFill(this.palette.sandyEdge, 0.45);
        g.drawEllipse(0, hS * 0.15, hS * 1.15, hS * 0.85);
        g.endFill();
        
        // Generate irregular polygon shape (8 vertices z noise z seed)
        const verts = 8;
        const points: number[] = [];
        for (let i = 0; i < verts; i++) {
            const a = (i / verts) * Math.PI * 2 + rot;
            const noise = Math.sin(i * 1.7 + this.seed) * 0.15;
            const rad = hS * (0.85 + noise);
            points.push(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        
        // Cień bryły (3D feel, offset SE)
        g.beginFill(this.palette.rockShadow);
        const shadowPoints = points.map(v => v + 3);
        g.drawPolygon(shadowPoints);
        g.endFill();
        
        // Main body
        g.beginFill(this.palette.rockBase);
        g.drawPolygon(points);
        g.endFill();
        
        // Sunlit highlight (NW) — mniejszy polygon zakrywający NW część skały
        g.beginFill(this.palette.rockLight, 0.65);
        const hlVerts = 6;
        const hlPoints: number[] = [];
        for (let i = 0; i < hlVerts; i++) {
            const a = Math.PI + (i / (hlVerts - 1)) * Math.PI * 0.85 + rot;
            const rad = hS * 0.62;
            hlPoints.push(
                Math.cos(a) * rad - hS * 0.08,
                Math.sin(a) * rad - hS * 0.08,
            );
        }
        g.drawPolygon(hlPoints);
        g.endFill();
        
        if (this.tier === 'large') {
            // Cracks (pęknięcia)
            g.lineStyle(1.8, this.palette.crackDark, 0.7);
            g.moveTo(-hS * 0.4, -hS * 0.3);
            g.lineTo(-hS * 0.15, hS * 0.1);
            g.lineTo(hS * 0.1, hS * 0.4);
            g.moveTo(hS * 0.2, -hS * 0.5);
            g.lineTo(hS * 0.45, -hS * 0.1);
            g.lineStyle(0);
            
            // Moss patches (zielony mech na top NW)
            g.beginFill(this.palette.mossGreen, 0.7);
            g.drawEllipse(-hS * 0.3, -hS * 0.42, hS * 0.2, hS * 0.09);
            g.drawEllipse(hS * 0.12, -hS * 0.5, hS * 0.13, hS * 0.07);
            g.endFill();
            
            // Moss dots (smaller scattered)
            g.beginFill(this.palette.mossGreen, 0.5);
            for (let i = 0; i < 4; i++) {
                const a = -Math.PI / 2 + (i - 1.5) * 0.35 + rot;
                const rad = hS * 0.35;
                g.drawCircle(Math.cos(a) * rad, Math.sin(a) * rad, 1.5);
            }
            g.endFill();
            
            // Erosion marks (rough dots na main body)
            g.beginFill(this.palette.rockDeep, 0.5);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + this.seed;
                const rad = hS * (0.3 + ((i * 13 + this.seed) % 10) / 30);
                g.drawCircle(Math.cos(a) * rad, Math.sin(a) * rad, 0.8 + ((i + this.seed) % 3) * 0.4);
            }
            g.endFill();
        } else {
            // Small rock — tylko centralny ciemny dot dla detail
            g.beginFill(this.palette.rockDeep, 0.55);
            g.drawCircle(0, 0, hS * 0.22);
            g.endFill();
            
            // Subtle moss dot na top (15% chance based on seed)
            if ((this.seed % 7) < 1) {
                g.beginFill(this.palette.mossGreen, 0.5);
                g.drawCircle(-hS * 0.2, -hS * 0.25, 1.2);
                g.endFill();
            }
        }

        // PIECZENIE. Gdy renderer nie jest dostepny, `bakeToSprite` zwraca null
        // i zostajemy przy zywych Graphics — gorsza jakosc, ale prop dziala.
        // v0.187.0: klucz cache — art skaly zalezy WYLACZNIE od tych pieciu wartosci, wiec dwie
        // skaly o tym samym kluczu sa nieodroznialne i moga dzielic teksture. Paleta wchodzi do
        // klucza, bo Mars uzywa tej samej klasy z innymi kolorami (FAZA MARS M3).
        const baked = bakeToSprite(g, `rock:${this.tier}:${Math.round(this.size)}:${this.seed}:${this.palette.rockDeep}:${this.palette.mossGreen}`);
        if (baked) {
            this.container.addChild(baked);
            g.destroy();
        } else {
            this.container.addChild(g);
        }
    }
    
    /** Deterministyczny szum 0..1 (seed + indeks). */
    private hash(i: number): number {
        const v = Math.sin(i * 12.9898 + this.seed * 78.233) * 43758.5453;
        return v - Math.floor(v);
    }

    /**
     * DESERT ART v2 — fasetowany glaz piaskowca. OBRYS BRYLY IDENTYCZNY z legacy
     * (osmiokat o promieniu hS * (0.85 +- 0.15)), wiec hitbox ROCK_HITBOX_PADDING_DESERT
     * dalej pasuje 1:1. Nowe: gorna faseta w sloncu (NW), ciemna sciana boczna SE,
     * warstwy osadowe, pekniecia, zaspa piasku po zawietrznej. Bez mchu (klimat pustyni).
     */
    private drawV2(g: PIXI.Graphics): void {
        const hS = this.size / 2;
        const rot = (this.seed * 0.37) % (Math.PI * 2);
        const pts: number[] = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + rot;
            const rad = hS * (0.85 + Math.sin(i * 1.7 + this.seed) * 0.15);
            pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        const scaled = (k: number, dx: number, dy: number) => pts.map((v, i) => v * k + (i % 2 === 0 ? dx : dy));

        // Cien rzucany SE (slonce NW) + AO
        g.beginFill(0x000000, 0.16);
        g.drawPolygon(scaled(1.0, hS * 0.45, hS * 0.4));
        g.endFill();
        g.beginFill(0x000000, 0.2);
        g.drawPolygon(scaled(1.04, hS * 0.12, hS * 0.12));
        g.endFill();

        // Zaspa piasku po zawietrznej (SE)
        g.beginFill(0xe6c690, 0.8);
        g.drawEllipse(hS * 0.45, hS * 0.55, hS * 0.55, hS * 0.28);
        g.endFill();

        // Bok bryly (ciemny) = pelny obrys
        g.beginFill(this.palette.rockShadow);
        g.drawPolygon(pts);
        g.endFill();
        // Srodek bryly
        g.beginFill(this.palette.rockBase);
        g.drawPolygon(scaled(0.86, -hS * 0.06, -hS * 0.08));
        g.endFill();
        // Gorna faseta w sloncu
        g.beginFill(this.palette.rockLight);
        g.drawPolygon(scaled(0.6, -hS * 0.16, -hS * 0.2));
        g.endFill();
        g.beginFill(0xffffff, 0.14);
        g.drawPolygon(scaled(0.36, -hS * 0.24, -hS * 0.28));
        g.endFill();

        if (this.tier === 'large') {
            // Warstwy osadowe (piaskowiec)
            g.lineStyle(1.2, this.palette.rockDeep, 0.35);
            for (let i = 0; i < 3; i++) {
                const y = -hS * 0.3 + i * hS * 0.28;
                g.moveTo(-hS * 0.6, y + this.hash(i) * 4);
                g.quadraticCurveTo(0, y + hS * 0.08, hS * 0.6, y + this.hash(i + 5) * 4);
            }
            // Pekniecia
            g.lineStyle(1.8, this.palette.crackDark, 0.7);
            const cx = (this.hash(10) - 0.5) * hS * 0.4;
            g.moveTo(cx - hS * 0.3, -hS * 0.35);
            g.lineTo(cx - hS * 0.05, -hS * 0.02);
            g.lineTo(cx + hS * 0.1, hS * 0.12);
            g.lineTo(cx + hS * 0.35, hS * 0.42);
            g.moveTo(cx - hS * 0.05, -hS * 0.02);
            g.lineTo(cx - hS * 0.25, hS * 0.25);
            g.lineStyle(1, 0xffffff, 0.25);
            g.moveTo(cx - hS * 0.29, -hS * 0.37);
            g.lineTo(cx - hS * 0.04, -hS * 0.04);
            g.lineStyle(0);
            // Dziobki erozji
            g.beginFill(this.palette.rockDeep, 0.45);
            for (let i = 0; i < 7; i++) {
                const a = this.hash(i + 20) * Math.PI * 2;
                const r = hS * (0.2 + this.hash(i + 30) * 0.45);
                g.drawCircle(Math.cos(a) * r, Math.sin(a) * r, 0.9 + this.hash(i + 40) * 1.4);
            }
            g.endFill();
        } else {
            g.beginFill(this.palette.rockDeep, 0.4);
            g.drawCircle(hS * 0.15, hS * 0.1, hS * 0.16);
            g.endFill();
        }

        const baked = bakeToSprite(g, `rock_v2:${this.tier}:${Math.round(this.size)}:${this.seed}:${this.palette.rockDeep}`);
        if (baked) {
            this.container.addChild(baked);
            g.destroy();
        } else {
            this.container.addChild(g);
        }
    }

    update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        // Static — no per-frame updates.
    }
}