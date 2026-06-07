import * as PIXI from 'pixi.js';

/**
 * v0.18.3 FAZA 4c — OASIS STEALTH ZONE
 * 
 * Owalna strefa pustyni z kępą palm, sadzawką i lotusami.
 * Mechanika: gdy GRACZ jest w środku oazy, wszystkie wrogie czołgi
 * tracą połowę zasięgu wykrycia (640px → 320px). Brak collision —
 * tank wjeżdża swobodnie. Visualnie palm trees Y-sortowane z tankiem
 * (palm base = zIndex w worldContainer).
 * 
 * Architektura analogiczna do Quicksand (visual + isPointInside),
 * ale modyfikuje Enemy.detectionRangeModifier zamiast speedModifier.
 */
export class Oasis {
    public readonly visualX: number;
    public readonly visualY: number;
    public readonly rX: number;
    public readonly rY: number;
    
    private baseContainer: PIXI.Container;
    private pondGfx: PIXI.Graphics;
    private rippleGfx: PIXI.Graphics;
    private pondRX: number;
    private pondRY: number;
    private rippleTime: number = 0;
    
    constructor(
        x: number, y: number,
        rX: number, rY: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.visualX = x;
        this.visualY = y;
        this.rX = rX;
        this.rY = rY;
        
        // Sadzawka centralna — ~42% promienia oazy (mniejsza niż detection zone)
        this.pondRX = rX * 0.42;
        this.pondRY = rY * 0.42;
        
        // BASE CONTAINER: ground patch + pond + ripples + lotusy + grass.
        // zIndex = -50: nad piaskiem (-100), pod tankami/budynkami (Y-sorted).
        this.baseContainer = new PIXI.Container();
        this.baseContainer.x = x;
        this.baseContainer.y = y;
        this.baseContainer.zIndex = -50;
        this.baseContainer.sortableChildren = true;
        worldContainer.addChild(this.baseContainer);
        
        const rng = makeRng(seed);
        
        // Layer 1: zielony grunt (3 nested ellipses dla soft edge)
        this.drawGroundPatch();
        
        // Layer 2: pond
        this.pondGfx = new PIXI.Graphics();
        this.pondGfx.zIndex = 2;
        this.drawPond();
        this.baseContainer.addChild(this.pondGfx);
        
        // Layer 3: ripples (animowane, expanding concentric circles)
        this.rippleGfx = new PIXI.Graphics();
        this.rippleGfx.zIndex = 3;
        this.baseContainer.addChild(this.rippleGfx);
        
        // Layer 4: lotus pads pływające w sadzawce
        this.drawLotusPads(rng);
        
        // Layer 5: kępy traw na obwodzie
        this.drawGrassTufts(rng);
        
        // Layer 6: PALMS — każda jako osobny container w worldContainer
        // dla poprawnego Y-sortu z tankami (palm base Y = zIndex).
        this.drawPalmTrees(rng, worldContainer);
    }
    
    private drawGroundPatch(): void {
        const ground = new PIXI.Graphics();
        ground.zIndex = 1;
        
        const layers = [
            { mul: 1.00, color: 0xa8c878, alpha: 0.35 }, // outer fade (lush sand transition)
            { mul: 0.82, color: 0x8eb05a, alpha: 0.45 }, // mid
            { mul: 0.62, color: 0x6fa040, alpha: 0.55 }, // inner lush
        ];
        for (const l of layers) {
            ground.beginFill(l.color, l.alpha);
            ground.drawEllipse(0, 0, this.rX * l.mul, this.rY * l.mul);
            ground.endFill();
        }
        
        // Subtle dark hint na obrzeżu pondu (mokra ziemia)
        ground.beginFill(0x4a6a2a, 0.4);
        ground.drawEllipse(0, 0, this.pondRX * 1.35, this.pondRY * 1.35);
        ground.endFill();
        
        this.baseContainer.addChild(ground);
    }
    
    private drawPond(): void {
        this.pondGfx.clear();
        
        // Cienie obwodowe (darker rim)
        this.pondGfx.beginFill(0x1c4a7a, 0.55);
        this.pondGfx.drawEllipse(0, 0, this.pondRX + 4, this.pondRY + 4);
        this.pondGfx.endFill();
        
        // Główna woda (deep blue)
        this.pondGfx.beginFill(0x2080c8);
        this.pondGfx.drawEllipse(0, 0, this.pondRX, this.pondRY);
        this.pondGfx.endFill();
        
        // Średnia warstwa (jaśniejsza)
        this.pondGfx.beginFill(0x40a4dc, 0.7);
        this.pondGfx.drawEllipse(-this.pondRX * 0.15, -this.pondRY * 0.15, this.pondRX * 0.72, this.pondRY * 0.62);
        this.pondGfx.endFill();
        
        // Highlight (najjaśniejszy, sun reflex)
        this.pondGfx.beginFill(0xb0e0ff, 0.55);
        this.pondGfx.drawEllipse(-this.pondRX * 0.32, -this.pondRY * 0.38, this.pondRX * 0.26, this.pondRY * 0.18);
        this.pondGfx.endFill();
        
        // Drugi sunny spot (offset)
        this.pondGfx.beginFill(0xddf0ff, 0.4);
        this.pondGfx.drawEllipse(this.pondRX * 0.25, this.pondRY * 0.15, this.pondRX * 0.13, this.pondRY * 0.08);
        this.pondGfx.endFill();
    }
    
    private drawLotusPads(rng: () => number): void {
        const padCount = 3 + Math.floor(rng() * 2); // 3-4 lotusy
        for (let i = 0; i < padCount; i++) {
            const angle = (i / padCount) * Math.PI * 2 + rng() * 0.5;
            const distFactor = 0.3 + rng() * 0.4;
            const px = Math.cos(angle) * this.pondRX * distFactor;
            const py = Math.sin(angle) * this.pondRY * distFactor;
            
            const pad = new PIXI.Graphics();
            pad.zIndex = 4;
            
            // Lily pad — owal zielony
            pad.beginFill(0x2e8b3a, 0.9);
            pad.drawEllipse(px, py, 10, 7.5);
            pad.endFill();
            
            // Notch (charakterystyczne wycięcie lily pada)
            pad.beginFill(0x1f5530, 0.6);
            pad.moveTo(px, py);
            pad.lineTo(px + 9, py - 2);
            pad.lineTo(px + 9, py + 2);
            pad.closePath();
            pad.endFill();
            
            // Lighter top
            pad.beginFill(0x4cae4c, 0.7);
            pad.drawEllipse(px - 1, py - 1.5, 6.5, 4.5);
            pad.endFill();
            
            // Kwiat lotusu (różowy/biały)
            const isPink = rng() < 0.6;
            const flowerColor = isPink ? 0xff8fb0 : 0xfffae0;
            // Płatki (3-4 sztuki)
            for (let p = 0; p < 4; p++) {
                const pa = (p / 4) * Math.PI * 2;
                pad.beginFill(flowerColor, 0.95);
                pad.drawEllipse(px + Math.cos(pa) * 1.5, py - 1 + Math.sin(pa) * 1.5, 1.8, 1.2);
                pad.endFill();
            }
            // Środek (żółty)
            pad.beginFill(0xffd040, 0.95);
            pad.drawCircle(px, py - 1, 1.2);
            pad.endFill();
            
            this.baseContainer.addChild(pad);
        }
    }
    
    private drawGrassTufts(rng: () => number): void {
        const tuftCount = 10;
        for (let i = 0; i < tuftCount; i++) {
            const angle = rng() * Math.PI * 2;
            const distFactor = 0.55 + rng() * 0.3;
            const tx = Math.cos(angle) * this.rX * distFactor;
            const ty = Math.sin(angle) * this.rY * distFactor;
            
            const tuft = new PIXI.Graphics();
            tuft.zIndex = 5;
            
            // 4-5 ostrych źdźbeł trawy
            const blades = 4 + Math.floor(rng() * 2);
            for (let b = 0; b < blades; b++) {
                const bAng = -Math.PI / 2 + (b / blades - 0.5) * 0.8 + (rng() - 0.5) * 0.2;
                const bLen = 5 + rng() * 5;
                const tipX = tx + Math.cos(bAng) * bLen;
                const tipY = ty + Math.sin(bAng) * bLen;
                
                tuft.lineStyle(1.8, 0x4a8a3a, 0.9);
                tuft.moveTo(tx, ty);
                tuft.lineTo(tipX, tipY);
            }
            
            this.baseContainer.addChild(tuft);
        }
    }
    
    private drawPalmTrees(rng: () => number, worldContainer: PIXI.Container): void {
        const palmCount = 4 + Math.floor(rng() * 2); // 4-5 palm
        
        for (let i = 0; i < palmCount; i++) {
            // Equally spaced angles with jitter, omijają górę (powyżej -PI/2 wokół -PI/2 luka)
            const baseAngle = (i / palmCount) * Math.PI * 2;
            const angle = baseAngle + (rng() - 0.5) * 0.4;
            
            // Palms at 85-100% of ellipse perimeter (some on edge, some slightly outside)
            const distMul = 0.85 + rng() * 0.15;
            const palmLocalX = Math.cos(angle) * this.rX * distMul;
            const palmLocalY = Math.sin(angle) * this.rY * distMul;
            
            const palmContainer = this.buildPalmTree(rng);
            palmContainer.x = this.visualX + palmLocalX;
            palmContainer.y = this.visualY + palmLocalY;
            // Y-sort z tankami: palm base Y = zIndex
            palmContainer.zIndex = palmContainer.y;
            worldContainer.addChild(palmContainer);
        }
    }
    
    private buildPalmTree(rng: () => number): PIXI.Container {
        const palm = new PIXI.Container();
        
        const trunkH = 52 + rng() * 14;
        const trunkW = 7;
        const leanX = (rng() - 0.5) * 10;
        
        // === SHADOW (na ziemi, owal) ===
        const shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.25);
        shadow.drawEllipse(2, 2, 28, 8);
        shadow.endFill();
        palm.addChild(shadow);
        
        // === TRUNK ===
        const trunk = new PIXI.Graphics();
        
        // Trunk shadow side (lewa, ciemna)
        trunk.beginFill(0x4a2d18);
        trunk.moveTo(-trunkW * 0.5, 0);
        trunk.quadraticCurveTo(leanX * 0.4 - trunkW * 0.4, -trunkH * 0.5, leanX - trunkW * 0.2, -trunkH);
        trunk.lineTo(leanX + trunkW * 0.1, -trunkH);
        trunk.quadraticCurveTo(leanX * 0.5 - trunkW * 0.1, -trunkH * 0.5, -trunkW * 0.1, 0);
        trunk.closePath();
        trunk.endFill();
        
        // Trunk highlight side (prawa, jasna)
        trunk.beginFill(0x8b5a32);
        trunk.moveTo(0, 0);
        trunk.quadraticCurveTo(leanX * 0.5 - trunkW * 0.1, -trunkH * 0.5, leanX + trunkW * 0.1, -trunkH);
        trunk.lineTo(leanX + trunkW * 0.5, -trunkH);
        trunk.quadraticCurveTo(leanX * 0.6 + trunkW * 0.3, -trunkH * 0.5, trunkW * 0.5, 0);
        trunk.closePath();
        trunk.endFill();
        
        // Trunk rings (poziome cięcia, typowe dla palmy daktylowej)
        trunk.lineStyle(1, 0x2d1808, 0.6);
        for (let r = 0; r < 7; r++) {
            const ry = -8 - r * 8;
            if (ry < -trunkH + 4) break;
            const rLean = leanX * (-ry / trunkH);
            trunk.moveTo(rLean - trunkW * 0.45, ry);
            trunk.lineTo(rLean + trunkW * 0.45, ry + 0.5);
        }
        
        palm.addChild(trunk);
        
        // === COCONUTS (gronko pod koronę) ===
        const coconuts = new PIXI.Graphics();
        const cocoCount = 2 + Math.floor(rng() * 3); // 2-4
        for (let c = 0; c < cocoCount; c++) {
            const cAng = -Math.PI / 2 + (c / Math.max(1, cocoCount - 1) - 0.5) * 0.8;
            const cx = leanX + Math.cos(cAng) * 6;
            const cy = -trunkH + 3 + Math.sin(cAng) * 3;
            coconuts.beginFill(0x3a1f08);
            coconuts.drawCircle(cx, cy, 3.2);
            coconuts.endFill();
            coconuts.beginFill(0x6b4423, 0.7);
            coconuts.drawCircle(cx - 0.8, cy - 0.8, 1.8);
            coconuts.endFill();
        }
        palm.addChild(coconuts);
        
        // === FRONDS (8 liści palmowych radialnie) ===
        const fronds = new PIXI.Graphics();
        const frondCount = 8;
        
        for (let f = 0; f < frondCount; f++) {
            const angle = (f / frondCount) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.15;
            const frondLen = 30 + rng() * 12;
            
            // Drooping factor — fronds nad sufitem stoją prosto, na bokach opadają
            const sideness = Math.abs(Math.sin(angle));
            const droop = 4 + sideness * 8;
            
            const tipX = leanX + Math.cos(angle) * frondLen;
            const tipY = -trunkH + Math.sin(angle) * frondLen + droop;
            
            // Kolor: tylne fronds ciemniejsze (back-to-front fake parallax)
            const isBack = angle > -Math.PI / 2 && angle < Math.PI / 2 && Math.cos(angle) < 0;
            const color = isBack ? 0x3a7a28 : 0x4eaa3a;
            
            // Frond shape — wydłużona "leaf" przez quadratic curves
            const perpAng = angle + Math.PI / 2;
            const baseW = 4;
            const midBulge = 8 + rng() * 3;
            
            const bx1 = leanX + Math.cos(perpAng) * baseW;
            const by1 = -trunkH + Math.sin(perpAng) * baseW;
            const bx2 = leanX - Math.cos(perpAng) * baseW;
            const by2 = -trunkH - Math.sin(perpAng) * baseW;
            
            const midX = leanX + Math.cos(angle) * frondLen * 0.55;
            const midY = -trunkH + Math.sin(angle) * frondLen * 0.55 + droop * 0.4;
            const mx1 = midX + Math.cos(perpAng) * midBulge;
            const my1 = midY + Math.sin(perpAng) * midBulge;
            const mx2 = midX - Math.cos(perpAng) * midBulge;
            const my2 = midY - Math.sin(perpAng) * midBulge;
            
            fronds.beginFill(color, 0.96);
            fronds.moveTo(bx1, by1);
            fronds.quadraticCurveTo(mx1, my1, tipX, tipY);
            fronds.quadraticCurveTo(mx2, my2, bx2, by2);
            fronds.closePath();
            fronds.endFill();
            
            // Środkowa żyła frondu (rachis)
            fronds.lineStyle(1.2, 0x2e5a20, 0.8);
            fronds.moveTo(leanX, -trunkH);
            fronds.quadraticCurveTo(midX, midY, tipX, tipY);
            
            // 5-6 listków bocznych na każdym frondzie (drobny detail)
            fronds.lineStyle(0.8, 0x2e5a20, 0.55);
            const sideLeafCount = 5;
            for (let sl = 1; sl <= sideLeafCount; sl++) {
                const t = sl / (sideLeafCount + 1);
                const slX = leanX + (tipX - leanX) * t;
                const slY = -trunkH + (tipY - (-trunkH)) * t;
                const slLen = (1.0 - t) * 4 + 2;
                fronds.moveTo(slX, slY);
                fronds.lineTo(slX + Math.cos(perpAng) * slLen, slY + Math.sin(perpAng) * slLen);
                fronds.moveTo(slX, slY);
                fronds.lineTo(slX - Math.cos(perpAng) * slLen, slY - Math.sin(perpAng) * slLen);
            }
        }
        
        palm.addChild(fronds);
        
        return palm;
    }
    
    /**
     * Per-frame: animowane ripples na sadzawce (2 expanding rings).
     */
    public update(): void {
        this.rippleTime += 1 / 60;
        
        this.rippleGfx.clear();
        for (let r = 0; r < 2; r++) {
            const phase = (this.rippleTime * 0.35 + r * 0.5) % 1.0;
            const alpha = (1.0 - phase) * 0.4;
            const ringRX = this.pondRX * (0.15 + phase * 0.75);
            const ringRY = this.pondRY * (0.15 + phase * 0.75);
            
            this.rippleGfx.lineStyle(1.5, 0xc8eaff, alpha);
            this.rippleGfx.drawEllipse(0, 0, ringRX, ringRY);
        }
    }
    
    /**
     * Test elliptical containment: (dx/rX)² + (dy/rY)² ≤ 1.
     */
    public isPointInside(px: number, py: number): boolean {
        const dx = px - this.visualX;
        const dy = py - this.visualY;
        return (dx * dx) / (this.rX * this.rX) + (dy * dy) / (this.rY * this.rY) <= 1.0;
    }
}

/** LCG seeded RNG dla deterministycznych palm layoutów per oasis seed. */
function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}