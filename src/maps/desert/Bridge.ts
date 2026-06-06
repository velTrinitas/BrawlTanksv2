import * as PIXI from 'pixi.js';

/**
 * Bridge — Kamienny most rotowany do osi rzeki (v0.17.0-fix).
 * 
 * Geometria w lokalnym układzie współrzędnych (PRZED container.rotation):
 *   - X axis = deckLength = długi wymiar (przekrój rzeki)
 *   - Y axis = deckWidth = pas, po którym jeździ czołg (1.25 × tank width)
 *   - container.rotation = atan2(tangent) + π/2 → bridge X axis prostopadły do flow rzeki
 * 
 * Visual: 4 kamienne płyty + 2 balustrady papirusowe + cień na wodzie + erosion marks.
 * Pass-through (BEZ collision) — gracz przejedzie po moście (river segments są skipped tu).
 */

const PALETTE = {
    stoneShadow:    0x4a3520,
    stoneBase:      0x8a7558,
    stoneLight:     0xa89066,
    stoneDeep:      0x5a4a30,
    railingDark:    0x4a3520,
    railingMid:     0x6a5530,
    railingLight:   0x9a8540,
    waterShadow:    0x000000,
};

export class Bridge {
    public x: number;
    public y: number;
    public deckLength: number;
    public deckWidth: number;
    public rotation: number;
    
    private container: PIXI.Container;
    
    constructor(
        x: number,
        y: number,
        deckLength: number,
        deckWidth: number,
        rotation: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.deckLength = deckLength;
        this.deckWidth = deckWidth;
        this.rotation = rotation;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.rotation = rotation;
        // v0.17.0-fix2: stałe zIndex (60, above river=50, below everything Y-based).
        // Gracz/wrogi zawsze renderowani NAD mostem (player.zIndex = y+19 >> 60).
        this.container.zIndex = 60;
        worldContainer.addChild(this.container);
        
        this.draw();
    }
    
    private draw(): void {
        const g = new PIXI.Graphics();
        const hL = this.deckLength / 2;
        const hW = this.deckWidth / 2;
        
        // Cień na wodzie (offset SE)
        g.beginFill(PALETTE.waterShadow, 0.45);
        g.drawRoundedRect(-hL + 3, -hW + 8, this.deckLength, this.deckWidth, 6);
        g.endFill();
        
        // Cień grubości pod base
        g.beginFill(PALETTE.stoneShadow, 0.7);
        g.drawRoundedRect(-hL + 2, -hW + 3, this.deckLength, this.deckWidth, 5);
        g.endFill();
        
        // Stone base (main slab)
        g.beginFill(PALETTE.stoneBase);
        g.drawRoundedRect(-hL, -hW, this.deckLength, this.deckWidth, 5);
        g.endFill();
        
        // Sunlit highlight (NW corner)
        g.beginFill(PALETTE.stoneLight, 0.5);
        g.drawRoundedRect(-hL + 2, -hW + 2, this.deckLength * 0.4, this.deckWidth * 0.3, 4);
        g.endFill();
        
        // Stone slab divisions (4 panels — prostopadle do osi mostu)
        const slabCount = 4;
        const slabWidth = this.deckLength / slabCount;
        g.lineStyle(1.8, PALETTE.stoneDeep, 0.75);
        for (let i = 1; i < slabCount; i++) {
            const xOff = -hL + i * slabWidth;
            g.moveTo(xOff, -hW + 3);
            g.lineTo(xOff, hW - 3);
        }
        g.lineStyle(0);
        
        // Erosion marks (cracks, dirt)
        for (let i = 0; i < 16; i++) {
            const sx = -hL + 5 + Math.random() * (this.deckLength - 10);
            const sy = -hW + 4 + Math.random() * (this.deckWidth - 8);
            g.beginFill(PALETTE.stoneDeep, 0.5 + Math.random() * 0.3);
            g.drawCircle(sx, sy, 0.8 + Math.random() * 1.5);
            g.endFill();
        }
        
        // Top railing (papyrus rope wrapped) — Y = -hW edge
        g.beginFill(PALETTE.railingDark);
        g.drawRect(-hL, -hW - 6, this.deckLength, 6);
        g.endFill();
        g.beginFill(PALETTE.railingMid);
        g.drawRect(-hL, -hW - 7, this.deckLength, 3);
        g.endFill();
        g.beginFill(PALETTE.railingLight);
        g.drawRect(-hL, -hW - 7, this.deckLength, 1.5);
        g.endFill();
        
        // Bottom railing — Y = +hW edge
        g.beginFill(PALETTE.railingDark);
        g.drawRect(-hL, hW, this.deckLength, 6);
        g.endFill();
        g.beginFill(PALETTE.railingMid);
        g.drawRect(-hL, hW + 3, this.deckLength, 3);
        g.endFill();
        g.beginFill(PALETTE.railingLight);
        g.drawRect(-hL, hW + 4.5, this.deckLength, 1.5);
        g.endFill();
        
        // Railing posts (pionowe pale wzdłuż mostu)
        const postCount = 7;
        g.beginFill(PALETTE.railingDark);
        for (let i = 0; i <= postCount; i++) {
            const px = -hL + (i / postCount) * this.deckLength - 1.5;
            g.drawRect(px, -hW - 7, 3, 7);
            g.drawRect(px, hW, 3, 7);
        }
        g.endFill();
        
        // Light highlight on posts
        g.beginFill(PALETTE.railingLight, 0.6);
        for (let i = 0; i <= postCount; i++) {
            const px = -hL + (i / postCount) * this.deckLength - 1.5;
            g.drawRect(px, -hW - 7, 1.2, 7);
            g.drawRect(px, hW, 1.2, 7);
        }
        g.endFill();
        
        this.container.addChild(g);
    }
}