import * as PIXI from 'pixi.js';

/**
 * Bridge — Kamienny most z papirusowymi balustradami.
 * Pass-through (NO collision) — gracz przejedzie po moście.
 * Visual: 4 kamienne płyty + 2 balustrady + cień na wodzie + erosion marks.
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
    public width: number;
    public height: number;
    
    private container: PIXI.Container;
    
    constructor(x: number, y: number, width: number, height: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 5;  // above water, naturally Y-sorted vs player
        worldContainer.addChild(this.container);
        
        this.draw();
    }
    
    private draw(): void {
        const g = new PIXI.Graphics();
        const hw = this.width / 2;
        const hh = this.height / 2;
        
        // Cień na wodzie (subtle dark patch under bridge)
        g.beginFill(PALETTE.waterShadow, 0.45);
        g.drawRoundedRect(-hw - 3, -hh + 8, this.width + 6, this.height, 6);
        g.endFill();
        
        // Cień grubości pod base
        g.beginFill(PALETTE.stoneShadow, 0.7);
        g.drawRoundedRect(-hw + 2, -hh + 3, this.width, this.height, 4);
        g.endFill();
        
        // Stone base (main slab)
        g.beginFill(PALETTE.stoneBase);
        g.drawRoundedRect(-hw, -hh, this.width, this.height, 4);
        g.endFill();
        
        // Sunlit highlight (NW corner)
        g.beginFill(PALETTE.stoneLight, 0.5);
        g.drawRoundedRect(-hw + 2, -hh + 2, this.width * 0.4, this.height * 0.3, 3);
        g.endFill();
        
        // Stone slab divisions (4 panels)
        const slabCount = 4;
        const slabWidth = this.width / slabCount;
        g.lineStyle(1.5, PALETTE.stoneDeep, 0.7);
        for (let i = 1; i < slabCount; i++) {
            const xOff = -hw + i * slabWidth;
            g.moveTo(xOff, -hh + 2);
            g.lineTo(xOff, hh - 2);
        }
        g.lineStyle(0);
        
        // Erosion marks (cracks, dirt)
        for (let i = 0; i < 12; i++) {
            const sx = -hw + 4 + Math.random() * (this.width - 8);
            const sy = -hh + 3 + Math.random() * (this.height - 6);
            g.beginFill(PALETTE.stoneDeep, 0.5 + Math.random() * 0.3);
            g.drawCircle(sx, sy, 0.7 + Math.random() * 1.4);
            g.endFill();
        }
        
        // Top railing (papyrus rope wrapped) — N edge
        g.beginFill(PALETTE.railingDark);
        g.drawRect(-hw, -hh - 5, this.width, 5);
        g.endFill();
        g.beginFill(PALETTE.railingMid);
        g.drawRect(-hw, -hh - 6, this.width, 3);
        g.endFill();
        g.beginFill(PALETTE.railingLight);
        g.drawRect(-hw, -hh - 6, this.width, 1.5);
        g.endFill();
        
        // Bottom railing — S edge
        g.beginFill(PALETTE.railingDark);
        g.drawRect(-hw, hh, this.width, 5);
        g.endFill();
        g.beginFill(PALETTE.railingMid);
        g.drawRect(-hw, hh + 3, this.width, 3);
        g.endFill();
        g.beginFill(PALETTE.railingLight);
        g.drawRect(-hw, hh + 4.5, this.width, 1.5);
        g.endFill();
        
        // Railing posts (pionowe pale)
        g.beginFill(PALETTE.railingDark);
        const postCount = 6;
        for (let i = 0; i <= postCount; i++) {
            const px = -hw + (i / postCount) * this.width - 1.5;
            g.drawRect(px, -hh - 6, 3, 6);
            g.drawRect(px, hh, 3, 6);
        }
        g.endFill();
        
        // Light highlight on top posts
        g.beginFill(PALETTE.railingLight, 0.6);
        for (let i = 0; i <= postCount; i++) {
            const px = -hw + (i / postCount) * this.width - 1.5;
            g.drawRect(px, -hh - 6, 1.2, 6);
            g.drawRect(px, hh, 1.2, 6);
        }
        g.endFill();
        
        this.container.addChild(g);
    }
}