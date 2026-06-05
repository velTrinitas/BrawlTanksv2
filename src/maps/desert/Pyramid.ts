import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * Pyramid — True 2.5D Parallax (dynamic apex calculation + 12-step stepped pyramid).
 * 
 * v0.14.2 fixy:
 *   - HITBOX FIX: x/y to top-left corner hitboxu (zgodne z CyberBuilding convention)
 *     Wcześniej x/y były center → collision tylko od S. Teraz visualX/visualY trzymają
 *     center dla apex calc, this.x/this.y dla checkRectCollision (top-left).
 *   - USUNIĘTE: wejście do grobowca, pochodnia, glow sprite, hieroglify
 *     (apex przy HEIGHT_FACTOR=0.25 powodował "ucieczkę" wejścia na piramidach
 *     daleko od centrum kamery — wygląd nienaturalny + user feedback "nic nie wnoszą")
 * 
 * Mechanika 2.5D: apex (szczyt) jest DYNAMICZNIE LICZONY z pozycji kamery.
 * Gdy gracz porusza się, szczyt "ucieka" w stronę kamery → iluzja wysokiej piramidy.
 */

const PALETTE = {
    sandSunlit:       0xefd29d,
    sandMid1:         0xd4ac6e,
    sandMid2:         0xaa7a3e,
    sandShadow:       0x66421a,
    stepShadow:       0x000000,
    pyramidionGold:   0xffd700,
    pyramidionShadow: 0xb8860b,
    baseShadow:       0x000000,
};

export class Pyramid implements ICollidable {
    // ICollidable — top-left corner of hitbox (zgodne z konwencją CyberBuilding)
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    
    // Visual center (różny od this.x/this.y) — używany do parallax calc + container pos
    private visualX: number;
    private visualY: number;
    
    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;
    private gfxDynamic: PIXI.Graphics;
    
    private size: number;
    private seed: number;
    
    private static readonly HEIGHT_FACTOR = 0.25;
    private static readonly STEPS_COUNT = 12;
    
    constructor(x: number, y: number, size: number, seed: number, worldContainer: PIXI.Container) {
        // Visual center
        this.visualX = x;
        this.visualY = y;
        this.size = size;
        this.seed = seed;
        
        // v0.14.4 FIX: hitbox = visual size + 100px padding (50px each side).
        // Padding kompensuje visual tank size (~100px long-axis po TANK_CANVAS_SCALE 1.75) vs player
        // collision radius (20px w checkRectCollision). Bez padding-u tank wjeżdżał ~30px wizualnie
        // w piramidę zanim collision react. +100 padding daje ~20px gap od visual brzegu piramidy
        // ze WSZYSTKICH 4 stron — user wymóg "większe marginesy".
        const hitboxSize = size + 100;
        this.x = x - hitboxSize / 2;
        this.y = y - hitboxSize / 2;
        this.w = hitboxSize;
        this.h = hitboxSize;
        
        this.container = new PIXI.Container();
        this.container.x = x;   // visual center
        this.container.y = y;
        this.container.zIndex = y + 10;  // v0.14.3 FIX: piramida ABOVE track markers/wrecks o tej samej y
        worldContainer.addChild(this.container);
        
        this.gfxStatic = new PIXI.Graphics();
        this.gfxDynamic = new PIXI.Graphics();
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxDynamic);
        
        this.drawStaticBase();
    }
    
    /**
     * Statyczna warstwa: cień rzucany na piasek + sand ring + noise.
     */
    private drawStaticBase(): void {
        const g = this.gfxStatic;
        const hs = this.size / 2;
        
        // Długi cień rzucany na piasek (sun from NW)
        g.beginFill(PALETTE.baseShadow, 0.4);
        g.drawPolygon([
            -hs * 0.8, hs * 0.8,
            hs, -hs * 0.8,
            hs * 1.8, hs * 1.6,
            hs * 0.2, hs * 1.8,
        ]);
        g.endFill();
        
        // Ambient Occlusion pod bazą
        g.beginFill(PALETTE.baseShadow, 0.3);
        g.drawRect(-hs - 5, -hs - 5, this.size + 10, this.size + 10);
        g.endFill();
        
        // Sand ring (subtle outline)
        g.lineStyle(2, 0xdcb878, 0.4);
        g.drawEllipse(0, 0, hs * 1.2, hs * 1.1);
        
        // Noise na krawędziach (drobne kropki piasku)
        g.lineStyle(0);
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2 + this.seed;
            const dist = hs * (1.0 + Math.random() * 0.3);
            g.beginFill(0x8a5e2a, 0.3 + Math.random() * 0.3);
            g.drawCircle(Math.cos(angle) * dist, Math.sin(angle) * dist, 1 + Math.random() * 2);
            g.endFill();
        }
    }
    
    /**
     * Main 2.5D parallax render. Wywoływane per frame.
     * Zgodne z ICollidable.update sygnaturą (4 args).
     */
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        const time = Date.now();
        const g = this.gfxDynamic;
        g.clear();
        
        const hs = this.size / 2;
        const cameraCenterX = camX + screenW / 2;
        const cameraCenterY = camY + screenH / 2;
        
        // 2.5D APEX — przesunięcie szczytu względem kamery (used visualX/Y, NIE this.x/y które są top-left hitboxu)
        const apexX = (this.visualX - cameraCenterX) * Pyramid.HEIGHT_FACTOR;
        const apexY = (this.visualY - cameraCenterY) * Pyramid.HEIGHT_FACTOR;
        
        const tl = { x: -hs, y: -hs };
        const tr = { x: hs,  y: -hs };
        const br = { x: hs,  y: hs };
        const bl = { x: -hs, y: hs };
        const apex = { x: apexX, y: apexY };
        
        // 1. ŚCIANY GŁÓWNE (4 trapezoidy zbiegające się w apex)
        g.beginFill(PALETTE.sandSunlit);
        g.drawPolygon([tl.x, tl.y, tr.x, tr.y, apex.x, apex.y]);
        g.endFill();
        g.beginFill(PALETTE.sandMid1);
        g.drawPolygon([tl.x, tl.y, bl.x, bl.y, apex.x, apex.y]);
        g.endFill();
        g.beginFill(PALETTE.sandMid2);
        g.drawPolygon([tr.x, tr.y, br.x, br.y, apex.x, apex.y]);
        g.endFill();
        g.beginFill(PALETTE.sandShadow);
        g.drawPolygon([bl.x, bl.y, br.x, br.y, apex.x, apex.y]);
        g.endFill();
        
        // 2. 12 SCHODKÓW (koncentryczne prostokąty kurczące się do apex)
        for (let i = 1; i <= Pyramid.STEPS_COUNT; i++) {
            const t = i / (Pyramid.STEPS_COUNT + 1);
            const pTL = { x: tl.x + (apex.x - tl.x) * t, y: tl.y + (apex.y - tl.y) * t };
            const pTR = { x: tr.x + (apex.x - tr.x) * t, y: tr.y + (apex.y - tr.y) * t };
            const pBR = { x: br.x + (apex.x - br.x) * t, y: br.y + (apex.y - br.y) * t };
            const pBL = { x: bl.x + (apex.x - bl.x) * t, y: bl.y + (apex.y - bl.y) * t };
            
            g.lineStyle(1.5, PALETTE.stepShadow, 0.25 - (t * 0.1));
            g.moveTo(pTL.x, pTL.y); g.lineTo(pTR.x, pTR.y);
            g.lineTo(pBR.x, pBR.y); g.lineTo(pBL.x, pBL.y);
            g.lineTo(pTL.x, pTL.y);
            
            g.lineStyle(1, 0xffffff, 0.15 - (t * 0.1));
            g.moveTo(pBL.x, pBL.y); g.lineTo(pTL.x, pTL.y); g.lineTo(pTR.x, pTR.y);
        }
        
        // 3. KRAWĘDZIE WIREFRAME (4 linie base → apex)
        g.lineStyle(2, PALETTE.stepShadow, 0.4);
        g.moveTo(tl.x, tl.y); g.lineTo(apex.x, apex.y);
        g.moveTo(tr.x, tr.y); g.lineTo(apex.x, apex.y);
        g.moveTo(bl.x, bl.y); g.lineTo(apex.x, apex.y);
        g.moveTo(br.x, br.y); g.lineTo(apex.x, apex.y);
        
        // 4. PYRAMIDION (mała piramidka złota na samym czubku, 4 ściany)
        const pyrT = 0.90;
        const pTL = { x: tl.x + (apex.x - tl.x) * pyrT, y: tl.y + (apex.y - tl.y) * pyrT };
        const pTR = { x: tr.x + (apex.x - tr.x) * pyrT, y: tr.y + (apex.y - tr.y) * pyrT };
        const pBR = { x: br.x + (apex.x - br.x) * pyrT, y: br.y + (apex.y - br.y) * pyrT };
        const pBL = { x: bl.x + (apex.x - bl.x) * pyrT, y: bl.y + (apex.y - bl.y) * pyrT };
        
        g.lineStyle(0);
        g.beginFill(PALETTE.pyramidionGold);
        g.drawPolygon([pTL.x, pTL.y, pTR.x, pTR.y, apex.x, apex.y]); // N (sunlit)
        g.drawPolygon([pTL.x, pTL.y, pBL.x, pBL.y, apex.x, apex.y]); // W (sunlit)
        g.endFill();
        
        g.beginFill(PALETTE.pyramidionShadow);
        g.drawPolygon([pTR.x, pTR.y, pBR.x, pBR.y, apex.x, apex.y]); // E (shadow)
        g.drawPolygon([pBL.x, pBL.y, pBR.x, pBR.y, apex.x, apex.y]); // S (shadow)
        g.endFill();
        
        // 5. MAGICZNY REFLEKS NA CZUBKU (migotający biały dot)
        const sparkle = 0.7 + Math.sin(time / 100 + this.seed) * 0.3;
        g.beginFill(0xffffff, 0.85 * sparkle);
        g.drawCircle(apex.x - 1, apex.y - 1, 2.5);
        g.endFill();
        
        // Subtle aureola wokół refleksu
        g.beginFill(0xfff4a0, 0.25 * sparkle);
        g.drawCircle(apex.x, apex.y, 6);
        g.endFill();
    }
}