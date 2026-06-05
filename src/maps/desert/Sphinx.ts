import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

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
    private gfxStatic: PIXI.Graphics;       // cień + sand (drawn once)
    private gfxBody: PIXI.Container;        // body layer (parallax 3%)
    private gfxHead: PIXI.Container;        // head layer (parallax 8%)
    private gfxFaceAnim: PIXI.Graphics;     // oczy + blink (redraw per frame)
    private beetles: Beetle[];
    
    private static readonly BODY_PARALLAX = 0.03;
    private static readonly HEAD_PARALLAX = 0.08;
    private static readonly BEETLE_COUNT = 3;
    
    constructor(x: number, y: number, sizeX: number, sizeY: number, seed: number, worldContainer: PIXI.Container) {
        this.visualX = x;
        this.visualY = y;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.seed = seed;
        
        // Hitbox: visual size + 100 padding each side (lekcja v0.14.4)
        const hitboxW = sizeX + 100;
        const hitboxH = sizeY + 100;
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
        for (let i = 0; i < Sphinx.BEETLE_COUNT; i++) {
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
        this.drawShadow();
        this.drawBody(bodyDraw);
        this.drawHead(headDraw);
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
    
    /**
     * Per-frame redraw: parallax positions + eye glow/blink animation.
     */
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        const time = Date.now();
        const cameraCenterX = camX + screenW / 2;
        const cameraCenterY = camY + screenH / 2;
        
        // Parallax offsets (body subtle, head mocniejszy)
        const dx = this.visualX - cameraCenterX;
        const dy = this.visualY - cameraCenterY;
        
        this.gfxBody.x = -dx * Sphinx.BODY_PARALLAX;
        this.gfxBody.y = -dy * Sphinx.BODY_PARALLAX;
        
        this.gfxHead.x = -dx * Sphinx.HEAD_PARALLAX;
        this.gfxHead.y = -dy * Sphinx.HEAD_PARALLAX;
        
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