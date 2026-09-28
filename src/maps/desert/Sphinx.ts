import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { isBoxInView } from '../cullGate';
import { bakeToSprite } from '../propBaker';

/**
 * Sphinx — Wielki Sfinks z Gizy (top-down view, sphinx pose, głowa na N).
 * 
 * Architektura (lekcje z v0.14.x Pyramid):
 *   - hitbox = visualSize + 100 padding (compensates TANK_CANVAS_SCALE 1.75 vs collision radius 20)
 *   - x/y = top-left corner hitboxu (CyberBuilding convention)
 *   - visualX/Y trzymają center dla parallax calc + container pos
 *   - 3 warstwy parallax: static (cień, sand) / body (3%) / head (8%, najwyższa)
 *   - 3 skarabeusze chodzące losowo w obrysie wokół sphinx (drobne życie)
 *   - Eye blink animation (rzadkie mrugnięcie ~co 4-6s)
 */

const PALETTE = {
    stoneBase:      0xc8a060,   // bazowy piaskowiec
    stoneLight:     0xe0c898,   // sunlit (NW)
    stoneDark:      0x705030,   // shadow (SE)
    stoneDeep:      0x4a3318,   // głębokie szczeliny
    nemesGold:      0xe8b830,   // złote pasy nemes
    nemesBlue:      0x2c6090,   // niebieskie pasy nemes
    beard:          0x9a7530,   // ceremonial beard
    eyeGlow:        0xfff8a0,   // subtle yellow glow
    shadowCast:     0x000000,   // cień na piasek
};

/**
 * Skarabeusz chodzący losowo wokół sphinx (dekoracja).
 */
class Beetle {
    private x: number;
    private y: number;
    private angle: number;
    private speed: number;
    private nextDirChange: number;
    private gfx: PIXI.Graphics;
    
    constructor(x: number, y: number, parentContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.25 + Math.random() * 0.25;
        this.nextDirChange = Date.now() + 1000 + Math.random() * 2500;
        
        this.gfx = new PIXI.Graphics();
        parentContainer.addChild(this.gfx);
        this.draw();
    }
    
    private draw(): void {
        this.gfx.clear();
        // Czarny pancerz
        this.gfx.beginFill(0x1a1a1a);
        this.gfx.drawEllipse(0, 0, 4, 2.5);
        this.gfx.endFill();
        // Złoty highlight (top żuk)
        this.gfx.beginFill(0xb89030, 0.65);
        this.gfx.drawEllipse(0, -0.5, 3.2, 1.4);
        this.gfx.endFill();
        // Cień głowa
        this.gfx.beginFill(0x0a0a0a);
        this.gfx.drawCircle(2.5, 0, 1);
        this.gfx.endFill();
    }
    
    update(): void {
        const now = Date.now();
        if (now > this.nextDirChange) {
            this.angle += (Math.random() - 0.5) * Math.PI * 0.8;
            this.nextDirChange = now + 1000 + Math.random() * 2500;
        }
        
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        
        // Trzymaj się obszaru wokół sphinx (radius ~150 od centrum)
        const maxDist = 150;
        const distSq = this.x * this.x + this.y * this.y;
        if (distSq > maxDist * maxDist) {
            // Zawróć ku centrum
            this.angle = Math.atan2(-this.y, -this.x) + (Math.random() - 0.5) * 0.5;
        }
        
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.rotation = this.angle;
    }
}

export class Sphinx implements ICollidable {
    // ICollidable — top-left corner of hitbox (CyberBuilding convention)
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    
    // Visual center (różny od this.x/this.y)
    private visualX: number;
    private visualY: number;
    private sizeX: number;
    private sizeY: number;
    private seed: number;
    
    private container: PIXI.Container;
    /** v0.132.0 — bramka cullingu: czy w poprzedniej klatce prop byl poza kadrem. */
    private culled = false;
    private gfxStatic: PIXI.Graphics;       // cień + sand (drawn once)
    private gfxBody: PIXI.Container;        // body layer (parallax 3%)
    private gfxHead: PIXI.Container;        // head layer (parallax 8%)
    private gfxFaceAnim: PIXI.Graphics;     // oczy + blink (redraw per frame)
    private beetles: Beetle[];
    
    private static readonly BODY_PARALLAX = 0.03;
    private static readonly HEAD_PARALLAX = 0.08;
    private static readonly BEETLE_COUNT = 3;
    /** DESERT ART v2 — slabsza paralaksa (plan: glowa 3-5% offsetu kamery). */
    private static readonly BODY_PARALLAX_V2 = 0.02;
    private static readonly HEAD_PARALLAX_V2 = 0.05;
    private artV2: boolean;
    
    constructor(x: number, y: number, sizeX: number, sizeY: number, seed: number, worldContainer: PIXI.Container, hitboxPad: number = 100, artV2: boolean = false) {
        this.artV2 = artV2;
        this.visualX = x;
        this.visualY = y;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.seed = seed;
        
        // Hitbox: visual size + 100 padding each side (lekcja v0.14.4)
        // DESERT ART v2: hitboxPad 30 (hitbox ~ bryla), legacy 100
        const hitboxW = sizeX + hitboxPad;
        const hitboxH = sizeY + hitboxPad;
        this.x = x - hitboxW / 2;
        this.y = y - hitboxH / 2;
        this.w = hitboxW;
        this.h = hitboxH;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 10;  // ABOVE track markers
        worldContainer.addChild(this.container);
        
        this.gfxStatic = new PIXI.Graphics();
        this.container.addChild(this.gfxStatic);
        
        // Skarabeusze rendered na piasku (PRZED body w order)
        this.beetles = [];
        // DESERT ART v2: bez dekoracyjnych zukow — w E4 skarabeusze sa ZAGROZENIEM,
        // wiec niegrozne zuki obok sfinksa klamalyby graczowi (czytelnosc #1).
        for (let i = 0; i < (artV2 ? 0 : Sphinx.BEETLE_COUNT); i++) {
            const angle = (i / Sphinx.BEETLE_COUNT) * Math.PI * 2 + this.seed;
            const dist = 80 + Math.random() * 50;
            const bx = Math.cos(angle) * dist;
            const by = Math.sin(angle) * dist;
            this.beetles.push(new Beetle(bx, by, this.container));
        }
        
        this.gfxBody = new PIXI.Container();
        this.container.addChild(this.gfxBody);
        const bodyDraw = new PIXI.Graphics();
        this.gfxBody.addChild(bodyDraw);
        
        this.gfxHead = new PIXI.Container();
        this.container.addChild(this.gfxHead);
        const headDraw = new PIXI.Graphics();
        this.gfxHead.addChild(headDraw);
        
        this.gfxFaceAnim = new PIXI.Graphics();
        this.gfxHead.addChild(this.gfxFaceAnim);
        
        // Draw static layers (raz w konstruktorze)
        if (this.artV2) {
            this.drawShadowV2();
            this.drawBodyV2(bodyDraw);
            this.drawHeadV2(headDraw);
            this.bakeLayer(this.gfxBody, bodyDraw, 'body');
            this.bakeLayer(this.gfxHead, headDraw, 'head');
        } else {
            this.drawShadow();
            this.drawBody(bodyDraw);
            this.drawHead(headDraw);
        }
    }
    
    /**
     * Cień rzucany na piasek (long polygon SE od sphinx).
     */
    private drawShadow(): void {
        const g = this.gfxStatic;
        const hsX = this.sizeX / 2;
        const hsY = this.sizeY / 2;
        
        // Cień (sun from NW)
        g.beginFill(PALETTE.shadowCast, 0.4);
        g.drawPolygon([
            -hsX * 0.7, -hsY * 0.8,
            hsX * 0.9, -hsY * 0.7,
            hsX * 1.5, hsY * 1.3,
            -hsX * 0.3, hsY * 1.4,
        ]);
        g.endFill();
        
        // Sand ring (rozsypany piasek wokół)
        g.lineStyle(2, 0xdcb878, 0.4);
        g.drawEllipse(0, 0, hsX * 1.3, hsY * 1.15);
        
        // Erosion noise (drobne kropki)
        g.lineStyle(0);
        for (let i = 0; i < 25; i++) {
            const angle = (i / 25) * Math.PI * 2 + this.seed;
            const dist = (hsX + hsY) / 2 * (1.0 + Math.random() * 0.3);
            g.beginFill(0x8a5e2a, 0.3 + Math.random() * 0.3);
            g.drawCircle(Math.cos(angle) * dist * 0.7, Math.sin(angle) * dist, 1 + Math.random() * 2);
            g.endFill();
        }
    }
    
    /**
     * Korpus lwa + łapy przednie + ogon.
     * Lokalnie (0, 0) to centrum sphinx. Głowa na N (-y).
     */
    private drawBody(g: PIXI.Graphics): void {
        const hsX = this.sizeX / 2;
        const hsY = this.sizeY / 2;
        
        // Główne ciało lwa (large rounded rect)
        const bodyY = hsY * 0.15;  // body biased na S (sphinx pose - tylne nogi)
        const bodyW = hsX * 1.7;
        const bodyH = hsY * 1.2;
        
        // Cień pod body (3D efekt)
        g.beginFill(PALETTE.stoneDark);
        g.drawRoundedRect(-bodyW / 2 + 4, bodyY - bodyH / 2 + 4, bodyW, bodyH, 25);
        g.endFill();
        
        // Body main
        g.beginFill(PALETTE.stoneBase);
        g.drawRoundedRect(-bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, 25);
        g.endFill();
        
        // Sunlit highlight (NW)
        g.beginFill(PALETTE.stoneLight, 0.4);
        g.drawRoundedRect(-bodyW / 2, bodyY - bodyH / 2, bodyW * 0.5, bodyH * 0.4, 25);
        g.endFill();
        
        // Erozja - poziome szczeliny
        g.lineStyle(1, PALETTE.stoneDeep, 0.5);
        for (let i = 0; i < 5; i++) {
            const lineY = bodyY - bodyH / 2 + (i + 1) * bodyH / 6;
            g.moveTo(-bodyW / 2 + 10, lineY);
            g.lineTo(bodyW / 2 - 10, lineY);
        }
        g.lineStyle(0);
        
        // Łapy przednie (2 wystające na N z body) — sphinx pose
        const pawW = hsX * 0.45;
        const pawL = hsY * 0.6;
        const pawY = bodyY - bodyH / 2 - pawL * 0.5;
        const pawSpread = hsX * 0.55;
        
        // Left paw
        g.beginFill(PALETTE.stoneDark);
        g.drawRoundedRect(-pawSpread - pawW / 2 + 3, pawY + 3, pawW, pawL, 12);
        g.endFill();
        g.beginFill(PALETTE.stoneBase);
        g.drawRoundedRect(-pawSpread - pawW / 2, pawY, pawW, pawL, 12);
        g.endFill();
        
        // Right paw
        g.beginFill(PALETTE.stoneDark);
        g.drawRoundedRect(pawSpread - pawW / 2 + 3, pawY + 3, pawW, pawL, 12);
        g.endFill();
        g.beginFill(PALETTE.stoneBase);
        g.drawRoundedRect(pawSpread - pawW / 2, pawY, pawW, pawL, 12);
        g.endFill();
        
        // Pazury (3 na każdej łapie)
        g.beginFill(PALETTE.stoneDeep);
        for (let s = -1; s <= 1; s += 2) {  // left/right paw
            for (let c = 0; c < 3; c++) {
                const cx = s * pawSpread - pawW * 0.3 + c * pawW * 0.3;
                g.drawCircle(cx, pawY + 2, 2);
            }
        }
        g.endFill();
        
        // Ogon zwinięty po SE
        const tailCx = hsX * 0.5;
        const tailCy = bodyY + bodyH * 0.4;
        g.lineStyle(8, PALETTE.stoneDark);
        g.moveTo(tailCx - 5, tailCy - 30);
        g.bezierCurveTo(tailCx + 25, tailCy - 30, tailCx + 30, tailCy + 5, tailCx + 5, tailCy + 25);
        g.lineStyle(0);
        // Tail tip (puszek)
        g.beginFill(PALETTE.stoneDeep);
        g.drawCircle(tailCx + 5, tailCy + 25, 6);
        g.endFill();
    }
    
    /**
     * Głowa faraona z nemes (pasiasta chusta) + broda ceremonial.
     * Pozycjonowana na N (-y od centrum).
     */
    private drawHead(g: PIXI.Graphics): void {
        const hsY = this.sizeY / 2;
        const headY = -hsY * 0.55;  // głowa na N
        const headW = this.sizeX * 0.85;
        const headH = this.sizeX * 0.7;
        
        // === NEMES (pasiasta chusta) ===
        // Tło nemes - poszerza się ku górze (trapezoidalna sylwetka)
        const nemesTopW = headW * 1.35;
        const nemesBotW = headW * 1.0;
        const nemesTopY = headY - headH * 0.7;
        const nemesBotY = headY + headH * 0.4;
        
        // Cień nemes (3D)
        g.beginFill(PALETTE.stoneDark);
        g.drawPolygon([
            -nemesTopW / 2 + 3, nemesTopY + 3,
            nemesTopW / 2 + 3, nemesTopY + 3,
            nemesBotW / 2 + 3, nemesBotY + 3,
            -nemesBotW / 2 + 3, nemesBotY + 3,
        ]);
        g.endFill();
        
        // Nemes base (gold)
        g.beginFill(PALETTE.nemesGold);
        g.drawPolygon([
            -nemesTopW / 2, nemesTopY,
            nemesTopW / 2, nemesTopY,
            nemesBotW / 2, nemesBotY,
            -nemesBotW / 2, nemesBotY,
        ]);
        g.endFill();
        
        // Pasy niebieskie (5 alternating gold/blue) — autentyczny nemes
        const stripeCount = 5;
        for (let i = 0; i < stripeCount; i++) {
            if (i % 2 === 0) continue;  // co drugi pas (alternating)
            const t1 = i / stripeCount;
            const t2 = (i + 1) / stripeCount;
            
            const topY1 = nemesTopY + (nemesBotY - nemesTopY) * t1;
            const topY2 = nemesTopY + (nemesBotY - nemesTopY) * t2;
            
            const topW1 = nemesTopW + (nemesBotW - nemesTopW) * t1;
            const topW2 = nemesTopW + (nemesBotW - nemesTopW) * t2;
            
            g.beginFill(PALETTE.nemesBlue);
            g.drawPolygon([
                -topW1 / 2, topY1,
                topW1 / 2, topY1,
                topW2 / 2, topY2,
                -topW2 / 2, topY2,
            ]);
            g.endFill();
        }
        
        // === GŁOWA (twarz) ===
        // Cień
        g.beginFill(PALETTE.stoneDark);
        g.drawEllipse(3, headY + 3, headW / 2, headH / 2);
        g.endFill();
        // Base
        g.beginFill(PALETTE.stoneBase);
        g.drawEllipse(0, headY, headW / 2, headH / 2);
        g.endFill();
        // Sunlit highlight
        g.beginFill(PALETTE.stoneLight, 0.45);
        g.drawEllipse(-headW * 0.15, headY - headH * 0.15, headW * 0.3, headH * 0.25);
        g.endFill();
        
        // === BRODA CEREMONIALNA (poniżej głowy) ===
        const beardY = headY + headH * 0.5;
        const beardW = headW * 0.22;
        const beardH = headH * 0.45;
        
        g.beginFill(PALETTE.stoneDark);
        g.drawRoundedRect(-beardW / 2 + 2, beardY + 2, beardW, beardH, 4);
        g.endFill();
        g.beginFill(PALETTE.beard);
        g.drawRoundedRect(-beardW / 2, beardY, beardW, beardH, 4);
        g.endFill();
        // Subtle line detail na brodzie
        g.lineStyle(0.8, PALETTE.stoneDeep, 0.6);
        for (let i = 1; i <= 3; i++) {
            const ly = beardY + (i * beardH / 4);
            g.moveTo(-beardW / 2 + 2, ly);
            g.lineTo(beardW / 2 - 2, ly);
        }
        g.lineStyle(0);
        
        // === NOS + USTA (subtle) ===
        // Nos - mały trójkąt subtle
        g.beginFill(PALETTE.stoneDeep, 0.5);
        g.drawPolygon([
            -3, headY,
            3, headY,
            0, headY + headH * 0.18,
        ]);
        g.endFill();
        
        // Usta - prosta linia
        g.lineStyle(1.2, PALETTE.stoneDeep, 0.7);
        g.moveTo(-headW * 0.12, headY + headH * 0.25);
        g.lineTo(headW * 0.12, headY + headH * 0.25);
        g.lineStyle(0);
    }
    
    // =================================================================
    // DESERT ART v2
    // =================================================================

    private hash(i: number): number {
        const v = Math.sin(i * 12.9898 + this.seed * 78.233) * 43758.5453;
        return v - Math.floor(v);
    }

    /** Piecze statyczna warstwe (korpus / glowa) do jednego sprite'a. Oczy zostaja zywe. */
    private bakeLayer(layer: PIXI.Container, g: PIXI.Graphics, part: string): void {
        const baked = bakeToSprite(g, `sphinx_v2_${part}:${this.sizeX}x${this.sizeY}:${this.seed}`);
        if (!baked) return;
        const idx = layer.getChildIndex(g);
        layer.removeChild(g);
        g.destroy();
        layer.addChildAt(baked, idx);
    }

    /** Cien SE (slonce NW), AO i zaspy piasku wokol cokolu. Pieczone. */
    private drawShadowV2(): void {
        const g = new PIXI.Graphics();
        const hsX = this.sizeX / 2;
        const hsY = this.sizeY / 2;
        g.beginFill(PALETTE.shadowCast, 0.14);
        g.drawRoundedRect(-hsX * 0.55, -hsY * 0.85, hsX * 1.9, hsY * 2.0, 50);
        g.endFill();
        g.beginFill(PALETTE.shadowCast, 0.14);
        g.drawRoundedRect(-hsX * 0.7, -hsY * 0.95, hsX * 1.75, hsY * 1.95, 45);
        g.endFill();
        g.beginFill(PALETTE.shadowCast, 0.2);
        g.drawRoundedRect(-hsX * 0.88, -hsY * 1.04, hsX * 1.76, hsY * 1.98, 40);
        g.endFill();
        for (let i = 0; i < 9; i++) {
            const left = i % 2 === 0;
            const y = -hsY * 0.8 + this.hash(i) * hsY * 1.7;
            g.beginFill(left ? 0xf0d49c : 0xc9a060, 0.75);
            g.drawEllipse((left ? -1 : 1) * hsX * (0.9 + this.hash(i + 9) * 0.1), y, 9 + this.hash(i + 3) * 8, 18 + this.hash(i + 5) * 14);
            g.endFill();
        }
        const baked = bakeToSprite(g, `sphinx_v2_shadow:${this.sizeX}x${this.sizeY}:${this.seed}`);
        if (baked) { this.gfxStatic.addChild(baked); g.destroy(); }
        else this.gfxStatic.addChild(g);
    }

    /**
     * Korpus lwa z gory, glowa na N: tulow z warstwami wapienia (jak prawdziwy sfinks),
     * grzbiet w sloncu, zady, wyciagniete lapy z palcami, Stela Snu miedzy lapami, ogon.
     */
    private drawBodyV2(g: PIXI.Graphics): void {
        const hsX = this.sizeX / 2;
        const hsY = this.sizeY / 2;
        const bx = hsX * 0.8, top = -hsY * 0.3, bot = hsY * 0.85;

        // Lapy (pod tulowiem w kolejnosci rysowania)
        for (const sx of [-1, 1]) {
            const x0 = sx < 0 ? -hsX * 0.8 : hsX * 0.38;
            const pw = hsX * 0.42;
            const y0 = -hsY * 1.02, ph = hsY * 0.85;
            g.beginFill(PALETTE.stoneDark);
            g.drawRoundedRect(x0 + 3, y0 + 3, pw, ph, 14);
            g.endFill();
            g.beginFill(PALETTE.stoneBase);
            g.drawRoundedRect(x0, y0, pw, ph, 14);
            g.endFill();
            g.beginFill(PALETTE.stoneLight, 0.55);
            g.drawRoundedRect(x0 + 3, y0 + 3, pw * 0.4, ph - 10, 10);
            g.endFill();
            g.beginFill(PALETTE.stoneDark, 0.5);
            g.drawRoundedRect(x0 + pw * 0.7, y0 + 6, pw * 0.26, ph - 12, 8);
            g.endFill();
            // Palce
            for (let c = 0; c < 4; c++) {
                const cx = x0 + pw * (0.14 + c * 0.24);
                g.beginFill(PALETTE.stoneDark);
                g.drawEllipse(cx + 1, y0 + 6, pw * 0.1, 6);
                g.endFill();
                g.beginFill(PALETTE.stoneLight);
                g.drawEllipse(cx, y0 + 5, pw * 0.09, 5);
                g.endFill();
            }
            // Poziome warstwy na lapie
            g.lineStyle(1, PALETTE.stoneDeep, 0.35);
            for (let k = 1; k < 5; k++) {
                g.moveTo(x0 + 4, y0 + ph * k / 5);
                g.lineTo(x0 + pw - 4, y0 + ph * k / 5);
            }
            g.lineStyle(0);
        }

        // Cien miedzy lapami + Stela Snu Totmesa IV
        g.beginFill(PALETTE.stoneDeep, 0.45);
        g.drawRect(-hsX * 0.38, -hsY * 0.98, hsX * 0.76, hsY * 0.7);
        g.endFill();
        const stW = hsX * 0.34, stH = hsY * 0.12, stY = -hsY * 0.96;
        g.beginFill(0x000000, 0.3);
        g.drawRoundedRect(-stW / 2 + 3, stY + 3, stW, stH, 8);
        g.endFill();
        g.beginFill(0xa88478);
        g.drawRoundedRect(-stW / 2, stY, stW, stH, 8);
        g.endFill();
        g.beginFill(0x5a3a30, 0.8);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
            g.drawRect(-stW / 2 + 6 + c * (stW - 12) / 4, stY + 7 + r * 6, 3, 3);
        }
        g.endFill();

        // Tulow: bok ciemny, grzbiet jasny
        g.beginFill(PALETTE.stoneDark);
        g.drawRoundedRect(-bx + 4, top + 4, bx * 2, bot - top, 44);
        g.endFill();
        g.beginFill(PALETTE.stoneBase);
        g.drawRoundedRect(-bx, top, bx * 2, bot - top, 44);
        g.endFill();
        g.beginFill(PALETTE.stoneDark, 0.45);
        g.drawRoundedRect(bx * 0.35, top + 10, bx * 0.62, bot - top - 20, 30);
        g.endFill();
        g.beginFill(PALETTE.stoneLight, 0.6);
        g.drawRoundedRect(-bx * 0.92, top + 8, bx * 0.8, bot - top - 16, 34);
        g.endFill();
        // Zady
        for (const sx of [-1, 1]) {
            g.beginFill(sx < 0 ? PALETTE.stoneLight : PALETTE.stoneDark, 0.55);
            g.drawEllipse(sx * bx * 0.62, bot - hsY * 0.28, bx * 0.38, hsY * 0.24);
            g.endFill();
        }
        // Warstwy wapienia (faliste pasy jasny/ciemny)
        for (let i = 0; i < 9; i++) {
            const y = top + 22 + i * (bot - top - 30) / 9;
            const w = 3 + this.hash(i) * 3;
            g.lineStyle(w, i % 2 === 0 ? PALETTE.stoneDeep : 0xffffff, i % 2 === 0 ? 0.22 : 0.12);
            g.moveTo(-bx + 10, y);
            g.bezierCurveTo(-bx * 0.3, y + 5 * this.hash(i + 3), bx * 0.3, y - 5 * this.hash(i + 4), bx - 10, y + 2);
        }
        // Grzbiet
        g.lineStyle(4, 0xfff0cc, 0.45);
        g.moveTo(-3, top + 30);
        g.lineTo(-3, bot - 30);
        g.lineStyle(2, PALETTE.stoneDeep, 0.3);
        g.moveTo(2, top + 30);
        g.lineTo(2, bot - 30);
        // Ogon wzdluz prawego boku
        g.lineStyle(8, PALETTE.stoneDark);
        g.moveTo(bx * 0.55, bot - 12);
        g.bezierCurveTo(bx * 1.05, bot - 20, bx * 1.02, bot - hsY * 0.45, bx * 0.9, bot - hsY * 0.7);
        g.lineStyle(4, PALETTE.stoneLight, 0.6);
        g.moveTo(bx * 0.55, bot - 14);
        g.bezierCurveTo(bx * 1.0, bot - 22, bx * 0.98, bot - hsY * 0.45, bx * 0.87, bot - hsY * 0.7);
        g.lineStyle(0);
        g.beginFill(PALETTE.stoneDeep);
        g.drawCircle(bx * 0.9, bot - hsY * 0.7, 6);
        g.endFill();
        // Ubytki erozji
        g.beginFill(PALETTE.stoneDeep, 0.35);
        for (let i = 0; i < 10; i++) {
            g.drawEllipse(-bx * 0.8 + this.hash(i + 50) * bx * 1.6, top + 20 + this.hash(i + 60) * (bot - top - 40), 2 + this.hash(i + 70) * 4, 1.5 + this.hash(i + 80) * 2);
        }
        g.endFill();
    }

    /**
     * Glowa: nemes w zlote/niebieskie pasy z opadajacymi klapami, twarz z odlupanym
     * nosem (historycznie), ureusz na czole. Geometria twarzy = legacy, wiec oczy
     * z `drawFaceAnim` trafiaja w to samo miejsce.
     */
    private drawHeadV2(g: PIXI.Graphics): void {
        const hsY = this.sizeY / 2;
        const headY = -hsY * 0.55;
        const headW = this.sizeX * 0.85;
        const headH = this.sizeX * 0.7;
        const nTopY = headY - headH * 0.72;
        const nTopW = headW * 1.15;
        const lapY = headY + headH * 0.95;
        const lapW = headW * 1.05;

        // Cien glowy na korpusie
        g.beginFill(0x000000, 0.28);
        g.drawPolygon([-nTopW / 2 + 8, nTopY + 8, nTopW / 2 + 8, nTopY + 8, lapW / 2 + 8, lapY + 8, -lapW / 2 + 8, lapY + 8]);
        g.endFill();
        // Nemes: podstawa zlota
        const nemes = [-nTopW / 2, nTopY, nTopW / 2, nTopY, lapW / 2, lapY, -lapW / 2, lapY];
        g.beginFill(PALETTE.nemesGold);
        g.drawPolygon(nemes);
        g.endFill();
        // Pasy pionowe (jak na nemes Tutanchamona)
        const stripes = 9;
        for (let i = 0; i < stripes; i++) {
            if (i % 2 === 0) continue;
            const u0 = i / stripes, u1 = (i + 1) / stripes;
            const X = (w: number, u: number) => -w / 2 + w * u;
            g.beginFill(PALETTE.nemesBlue);
            g.drawPolygon([X(nTopW, u0), nTopY, X(nTopW, u1), nTopY, X(lapW, u1), lapY, X(lapW, u0), lapY]);
            g.endFill();
        }
        // Wytarcie farby (erozja) + cieniowanie SE / swiatlo NW
        g.beginFill(PALETTE.stoneBase, 0.5);
        for (let i = 0; i < 6; i++) {
            g.drawEllipse(-nTopW * 0.4 + this.hash(i + 90) * nTopW * 0.8, nTopY + this.hash(i + 95) * (lapY - nTopY), 5 + this.hash(i) * 7, 3 + this.hash(i + 1) * 4);
        }
        g.endFill();
        g.beginFill(0x000000, 0.22);
        g.drawPolygon([nTopW * 0.15, nTopY, nTopW / 2, nTopY, lapW / 2, lapY, lapW * 0.15, lapY]);
        g.endFill();
        g.beginFill(0xffffff, 0.16);
        g.drawPolygon([-nTopW / 2, nTopY, -nTopW * 0.2, nTopY, -lapW * 0.2, lapY, -lapW / 2, lapY]);
        g.endFill();
        g.lineStyle(2, PALETTE.stoneDeep, 0.5);
        g.drawPolygon(nemes);
        g.lineStyle(0);

        // Twarz
        g.beginFill(PALETTE.stoneDark);
        g.drawEllipse(3, headY + 3, headW / 2 * 0.72, headH / 2);
        g.endFill();
        g.beginFill(PALETTE.stoneBase);
        g.drawEllipse(0, headY, headW / 2 * 0.72, headH / 2);
        g.endFill();
        g.beginFill(PALETTE.stoneLight, 0.55);
        g.drawEllipse(-headW * 0.1, headY - headH * 0.12, headW * 0.2, headH * 0.26);
        g.endFill();
        // Brwi
        g.lineStyle(2, PALETTE.stoneDeep, 0.6);
        g.moveTo(-headW * 0.26, headY - headH * 0.2); g.lineTo(-headW * 0.1, headY - headH * 0.22);
        g.moveTo(headW * 0.1, headY - headH * 0.22); g.lineTo(headW * 0.26, headY - headH * 0.2);
        g.lineStyle(0);
        // Odlupany nos — ciemna wyrwa
        g.beginFill(PALETTE.stoneDeep, 0.75);
        g.drawPolygon([-5, headY + 1, 6, headY - 1, 4, headY + headH * 0.2, -3, headY + headH * 0.18]);
        g.endFill();
        g.beginFill(PALETTE.stoneLight, 0.6);
        g.drawPolygon([-5, headY + 1, -2, headY, -3, headY + headH * 0.16]);
        g.endFill();
        // Usta
        g.lineStyle(1.6, PALETTE.stoneDeep, 0.7);
        g.moveTo(-headW * 0.12, headY + headH * 0.29);
        g.quadraticCurveTo(0, headY + headH * 0.33, headW * 0.12, headY + headH * 0.29);
        g.lineStyle(0);
        // Ureusz (kobra) na czole
        const uy = headY - headH * 0.44;
        g.beginFill(0x8a6010);
        g.drawEllipse(1, uy + 1, 6, 9);
        g.endFill();
        g.beginFill(PALETTE.nemesGold);
        g.drawEllipse(0, uy, 5.5, 8.5);
        g.endFill();
        g.beginFill(0xfff0a0, 0.8);
        g.drawEllipse(-1.5, uy - 3, 2, 3);
        g.endFill();
    }

    /**
     * Per-frame redraw: parallax positions + eye glow/blink animation.
     */
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        // v0.132.0 — VIEWPORT CULLING. Sfinks przerysowywal twarz (glow + mrugniecie)
        // i trzy skarabeusze w KAZDEJ klatce, niezaleznie od tego, gdzie na mapie
        // 3000x3000 jest gracz. Bramka po AABB hitboxu, nie po srodku — sfinks jest
        // dlugi i musi ozyc, zanim jego srodek wjedzie w kadr.
        const visible = isBoxInView(this.x, this.y, this.w, this.h, camX, camY, screenW, screenH);
        if (!visible) {
            if (!this.culled) { this.culled = true; this.container.renderable = false; }
            return;
        }
        if (this.culled) { this.culled = false; this.container.renderable = true; }

        const time = Date.now();
        const cameraCenterX = camX + screenW / 2;
        const cameraCenterY = camY + screenH / 2;
        
        // Parallax offsets (body subtle, head mocniejszy)
        const dx = this.visualX - cameraCenterX;
        const dy = this.visualY - cameraCenterY;
        
        this.gfxBody.x = -dx * (this.artV2 ? Sphinx.BODY_PARALLAX_V2 : Sphinx.BODY_PARALLAX);
        this.gfxBody.y = -dy * (this.artV2 ? Sphinx.BODY_PARALLAX_V2 : Sphinx.BODY_PARALLAX);
        
        this.gfxHead.x = -dx * (this.artV2 ? Sphinx.HEAD_PARALLAX_V2 : Sphinx.HEAD_PARALLAX);
        this.gfxHead.y = -dy * (this.artV2 ? Sphinx.HEAD_PARALLAX_V2 : Sphinx.HEAD_PARALLAX);
        
        // Animacja oczu (blink + glow)
        this.drawFaceAnim(time);
        
        // Update skarabeuszy
        for (const beetle of this.beetles) {
            beetle.update();
        }
    }
    
    /**
     * Oczy z subtle glow + rzadkie mrugnięcie (~co 5s).
     */
    private drawFaceAnim(time: number): void {
        const g = this.gfxFaceAnim;
        g.clear();
        
        const hsY = this.sizeY / 2;
        const headY = -hsY * 0.55;
        const headW = this.sizeX * 0.85;
        const headH = this.sizeX * 0.7;
        
        const eyeY = headY - headH * 0.1;
        const eyeOffsetX = headW * 0.18;
        
        // Blink cycle: 5000ms loop, blink na 150ms
        const blinkPhase = (time + this.seed * 1000) % 5000;
        const isBlinking = blinkPhase < 150;
        
        if (isBlinking) {
            // Zamknięte oczy (cienkie linie)
            g.lineStyle(1.5, PALETTE.stoneDeep, 0.8);
            g.moveTo(-eyeOffsetX - 4, eyeY);
            g.lineTo(-eyeOffsetX + 4, eyeY);
            g.moveTo(eyeOffsetX - 4, eyeY);
            g.lineTo(eyeOffsetX + 4, eyeY);
            g.lineStyle(0);
        } else {
            // Otwarte oczy z subtle glow
            const glowPulse = 0.6 + Math.sin(time / 600 + this.seed) * 0.2;
            
            // Glow aureola
            g.beginFill(PALETTE.eyeGlow, 0.15 * glowPulse);
            g.drawCircle(-eyeOffsetX, eyeY, 6);
            g.drawCircle(eyeOffsetX, eyeY, 6);
            g.endFill();
            
            // Białko oczu
            g.beginFill(0xfaf0c0);
            g.drawEllipse(-eyeOffsetX, eyeY, 4, 2.5);
            g.drawEllipse(eyeOffsetX, eyeY, 4, 2.5);
            g.endFill();
            
            // Źrenice (czarne)
            g.beginFill(0x0a0a0a);
            g.drawCircle(-eyeOffsetX, eyeY, 1.5);
            g.drawCircle(eyeOffsetX, eyeY, 1.5);
            g.endFill();
            
            // Refleks (mały biały dot)
            g.beginFill(0xffffff, 0.9);
            g.drawCircle(-eyeOffsetX - 0.5, eyeY - 0.5, 0.6);
            g.drawCircle(eyeOffsetX - 0.5, eyeY - 0.5, 0.6);
            g.endFill();
        }
    }
}