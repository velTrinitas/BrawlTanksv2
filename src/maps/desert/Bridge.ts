import * as PIXI from 'pixi.js';
import { bakeToSprite } from '../propBaker';

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

    /** E5 — czy punkt jest na pokladzie (uklad obrocony mostu). */
    public isOnDeck(px: number, py: number): boolean {
        const c = Math.cos(-this.rotation), s = Math.sin(-this.rotation);
        const dx = px - this.x, dy = py - this.y;
        const lx = dx * c - dy * s, ly = dx * s + dy * c;
        return Math.abs(lx) <= this.deckLength / 2 && Math.abs(ly) <= this.deckWidth / 2;
    }

    /** E5 — ugiecie pod czolgiem: poklad schodzi o 2 px (tylko wizual). */
    public setLoaded(on: boolean): void {
        this.container.y = this.y + (on ? 2 : 0);
    }
    
    constructor(
        x: number,
        y: number,
        deckLength: number,
        deckWidth: number,
        rotation: number,
        worldContainer: PIXI.Container,
        artV2: boolean = false,   // DESERT ART v2 — deski na kamiennych przyczolkach
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

        if (artV2) this.drawV2();
        else this.draw();
    }

    /**
     * DESERT ART v2 — drewniany pomost na kamiennych przyczolkach. Uklad lokalny jak legacy
     * (X = przez rzeke, Y = pas jazdy), wymiary pokladu IDENTYCZNE, wiec nic w kolizji
     * i skip-area rzeki sie nie zmienia. Nowe: cien na wodzie, grubosc pokladu,
     * deski z przerwami i sekami, slupki z wysokoscia (cien na pokladzie) i liny.
     * Pieczone raz (wspolna tekstura dla wszystkich 8 mostow).
     */
    private drawV2(): void {
        const g = new PIXI.Graphics();
        const hL = this.deckLength / 2;
        const hW = this.deckWidth / 2;
        const h = (i: number) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };

        // Cien pokladu na wodzie
        g.beginFill(0x000000, 0.3);
        g.drawRect(-hL + 16, -hW + 10, this.deckLength - 20, this.deckWidth + 6);
        g.endFill();
        // Kamienne przyczolki na brzegach
        for (const sx of [-1, 1]) {
            const x0 = sx < 0 ? -hL - 6 : hL - 22;
            g.beginFill(0x5a4228);
            g.drawRoundedRect(x0 + 2, -hW - 10 + 3, 28, this.deckWidth + 20, 4);
            g.endFill();
            g.beginFill(0xb09470);
            g.drawRoundedRect(x0, -hW - 10, 28, this.deckWidth + 20, 4);
            g.endFill();
            g.lineStyle(1, 0x5a4228, 0.6);
            for (let r = 1; r < 5; r++) {
                const y = -hW - 10 + r * (this.deckWidth + 20) / 5;
                g.moveTo(x0 + 2, y); g.lineTo(x0 + 26, y);
            }
            g.lineStyle(0);
        }
        // Grubosc pokladu (bok widoczny na S)
        g.beginFill(0x4a2e14);
        g.drawRect(-hL, -hW, this.deckLength, this.deckWidth + 6);
        g.endFill();
        // Deski (w poprzek kierunku jazdy = wzdluz osi Y)
        const planks = 14;
        const pw = this.deckLength / planks;
        for (let i = 0; i < planks; i++) {
            const x = -hL + i * pw;
            const tone = [0x9a6a3a, 0x8a5c30, 0xa47444][i % 3];
            const off = (h(i) - 0.5) * 3;
            g.beginFill(tone);
            g.drawRect(x + 0.8, -hW + off * 0.3, pw - 1.6, this.deckWidth);
            g.endFill();
            g.beginFill(0xffffff, 0.12);
            g.drawRect(x + 0.8, -hW, 1.6, this.deckWidth);
            g.endFill();
            // Seki i slojowanie
            g.beginFill(0x4a2e14, 0.55);
            g.drawEllipse(x + pw / 2, -hW + h(i + 40) * this.deckWidth, 1.6, 2.4);
            g.endFill();
            g.lineStyle(0.8, 0x5a3a1c, 0.35);
            g.moveTo(x + pw * 0.3, -hW + 4); g.lineTo(x + pw * 0.35, hW - 4);
            g.lineStyle(0);
        }
        // Belki poprzeczne na krawedziach pasa
        for (const y of [-hW - 3, hW - 3]) {
            g.beginFill(0x5a3a1c);
            g.drawRect(-hL, y, this.deckLength, 6);
            g.endFill();
            g.beginFill(0xb88a54, 0.7);
            g.drawRect(-hL, y, this.deckLength, 1.5);
            g.endFill();
        }
        // Slupki z wysokoscia + liny
        const posts = 6;
        const lift = 7; // „wysokosc" slupka — czubek przesuniety w gore ekranu
        for (const y of [-hW, hW]) {
            const pts: [number, number][] = [];
            for (let i = 0; i <= posts; i++) {
                const x = -hL + 8 + (i / posts) * (this.deckLength - 16);
                g.beginFill(0x000000, 0.25);
                g.drawEllipse(x + 4, y + 2, 4, 2);
                g.endFill();
                g.beginFill(0x3a2410);
                g.drawRect(x - 2, y - lift, 4, lift + 1);
                g.endFill();
                g.beginFill(0xc89a60);
                g.drawCircle(x, y - lift, 2.4);
                g.endFill();
                pts.push([x, y - lift]);
            }
            g.lineStyle(1.6, 0xd8c08a, 0.95);
            for (let i = 0; i < pts.length - 1; i++) {
                const [x1, y1] = pts[i];
                const [x2, y2] = pts[i + 1];
                g.moveTo(x1, y1);
                g.quadraticCurveTo((x1 + x2) / 2, y1 + 3, x2, y2);
            }
            g.lineStyle(0);
        }

        const baked = bakeToSprite(g, `bridge_v2:${this.deckLength}x${this.deckWidth}`);
        if (baked) { this.container.addChild(baked); g.destroy(); }
        else this.container.addChild(g);
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