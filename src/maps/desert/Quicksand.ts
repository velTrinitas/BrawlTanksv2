import * as PIXI from 'pixi.js';

/**
 * Quicksand — Ruchomy piasek (slowdown zone) na desert mapie (v0.18.1 FAZA 4b).
 * 
 * Mechanika:
 *   - Owalna strefa (radiusX × radiusY) z visual swirl + sinking particles
 *   - isPointInside(x, y) zwraca true jeśli punkt jest wewnątrz elipsy
 *   - Gracz/wrog wewnątrz: speed × 0.5 (zarządzane przez Player/Enemy.applySpeedModifier)
 *   - NO collision — można wjechać, ale ruszać się wolno
 * 
 * Visual:
 *   - Ciemny owal tła (sinking effect)
 *   - Wirujące cząsteczki piasku (jak whirlpool) — 12 particles po elipsie
 *   - Bańki wynurzające się (3-5 random spawn, fade up + pop)
 *   - Subtelnie żółtawa ramka ostrzegawcza (sin alpha pulse)
 *   - Centralne wgłębienie (gradient ciemny → jasny od centrum)
 */

const PALETTE = {
    sandDeep:    0x6a4a20,   // głębokie wgłębienie
    sandMid:     0x9a7848,   // mid tone
    sandLight:   0xc8a878,   // jaśniejszy obrys
    warningRim:  0xe8c060,   // żółtawa ramka ostrzegawcza
    bubbleLight: 0xe8d8b0,   // bańki piaskowe
    particleDark:0x5a3818,   // wirujące cząstki
    particleMid: 0x8a6838,
};

interface SwirlParticle {
    angle: number;
    radiusFactor: number;   // 0.5-1.0 (orbit radius vs zone)
    rotationSpeed: number;
    phase: number;
    size: number;
}

interface Bubble {
    x: number;
    y: number;
    startTime: number;
    lifetime: number;
    riseSpeed: number;
    targetSize: number;
}

export class Quicksand {
    public x: number;          // visual center X (used dla isPointInside)
    public y: number;          // visual center Y
    public radiusX: number;
    public radiusY: number;
    
    private seed: number;
    
    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;       // ciemny owal tła + central depression (drawn raz)
    private gfxRim: PIXI.Graphics;          // żółtawa ramka ostrzegawcza (pulsing alpha)
    private gfxSwirl: PIXI.Graphics;        // wirujące cząstki (redraw per frame)
    private gfxBubbles: PIXI.Graphics;      // bańki wynurzające się (redraw per frame)
    
    private swirlParticles: SwirlParticle[];
    private activeBubbles: Bubble[];
    private bubbleSpawnTimer: number;
    
    constructor(
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.radiusX = radiusX;
        this.radiusY = radiusY;
        this.seed = seed;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 5;  // above sand background, below player and most objects
        worldContainer.addChild(this.container);
        
        this.gfxStatic = new PIXI.Graphics();
        this.gfxRim = new PIXI.Graphics();
        this.gfxSwirl = new PIXI.Graphics();
        this.gfxBubbles = new PIXI.Graphics();
        
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxRim);
        this.container.addChild(this.gfxSwirl);
        this.container.addChild(this.gfxBubbles);
        
        // Init swirl particles (12 cząstek na orbicie elipsy)
        this.swirlParticles = [];
        const particleCount = 12;
        for (let i = 0; i < particleCount; i++) {
            this.swirlParticles.push({
                angle: (i / particleCount) * Math.PI * 2 + this.seed * 0.1,
                radiusFactor: 0.5 + Math.random() * 0.4,
                rotationSpeed: 0.005 + Math.random() * 0.005,
                phase: Math.random() * Math.PI * 2,
                size: 1.5 + Math.random() * 1.5,
            });
        }
        
        this.activeBubbles = [];
        this.bubbleSpawnTimer = Date.now();
        
        this.drawStaticBackground();
    }
    
    /**
     * Sprawdza czy punkt (px, py) w world coords jest wewnątrz strefy quicksand (ellipse).
     */
    public isPointInside(px: number, py: number): boolean {
        const dx = px - this.x;
        const dy = py - this.y;
        // Ellipse equation: (dx/rx)² + (dy/ry)² <= 1
        const normalized = (dx * dx) / (this.radiusX * this.radiusX) + (dy * dy) / (this.radiusY * this.radiusY);
        return normalized <= 1.0;
    }
    
    /**
     * Statyczne tło: ciemny owal + central depression gradient + sandy edge.
     */
    private drawStaticBackground(): void {
        const g = this.gfxStatic;
        const rX = this.radiusX;
        const rY = this.radiusY;
        
        // Outer sandy edge (transition do otoczenia)
        g.beginFill(PALETTE.sandLight, 0.5);
        g.drawEllipse(0, 0, rX * 1.1, rY * 1.1);
        g.endFill();
        
        // Main body — ciemny mid sand
        g.beginFill(PALETTE.sandMid, 1);
        g.drawEllipse(0, 0, rX, rY);
        g.endFill();
        
        // Inner depression — gradient od centrum, 5 koncentrycznych elips
        for (let i = 0; i < 5; i++) {
            const t = i / 4;
            const r = (1 - t * 0.7);  // od 1.0 do 0.3
            const alpha = 0.18 + t * 0.18;  // głębszy w centrum
            g.beginFill(PALETTE.sandDeep, alpha);
            g.drawEllipse(0, 0, rX * r, rY * r);
            g.endFill();
        }
        
        // Erosion specks (mikrocząstki rozsypane wewnątrz)
        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2 + this.seed;
            const r = 0.2 + Math.random() * 0.6;
            const x = Math.cos(a) * rX * r;
            const y = Math.sin(a) * rY * r;
            g.beginFill(PALETTE.particleDark, 0.4 + Math.random() * 0.3);
            g.drawCircle(x, y, 0.8 + Math.random() * 1.2);
            g.endFill();
        }
    }
    
    /**
     * Per-frame update — swirl + bubbles + pulsing warning rim.
     */
    public update(): void {
        const time = Date.now();
        
        this.drawWarningRim(time);
        this.drawSwirlParticles(time);
        this.updateBubbles(time);
    }
    
    /**
     * Subtelnie żółtawa ramka ostrzegawcza z pulsing alpha.
     */
    private drawWarningRim(time: number): void {
        const g = this.gfxRim;
        g.clear();
        
        const pulse = 0.45 + Math.sin(time / 600 + this.seed) * 0.25;
        
        // Outer warning ring
        g.lineStyle(2, PALETTE.warningRim, pulse);
        g.drawEllipse(0, 0, this.radiusX * 1.02, this.radiusY * 1.02);
        
        // Inner warning ring (lżejsze)
        g.lineStyle(1, PALETTE.warningRim, pulse * 0.6);
        g.drawEllipse(0, 0, this.radiusX * 0.92, this.radiusY * 0.92);
        
        g.lineStyle(0);
    }
    
    /**
     * 12 wirujących cząstek piasku orbitujących wokół centrum (whirlpool effect).
     */
    private drawSwirlParticles(time: number): void {
        const g = this.gfxSwirl;
        g.clear();
        
        for (const p of this.swirlParticles) {
            p.angle += p.rotationSpeed;
            
            // Subtle radius oscillation (cząstki "oddychają")
            const radOsc = 1 + Math.sin(time / 800 + p.phase) * 0.08;
            const rX = this.radiusX * p.radiusFactor * radOsc;
            const rY = this.radiusY * p.radiusFactor * radOsc;
            
            const px = Math.cos(p.angle) * rX;
            const py = Math.sin(p.angle) * rY;
            
            // Particle z tail (motion blur effect)
            const tailLen = 4;
            const tailX = Math.cos(p.angle - 0.1) * rX;
            const tailY = Math.sin(p.angle - 0.1) * rY;
            
            g.lineStyle(p.size * 0.7, PALETTE.particleDark, 0.45);
            g.moveTo(tailX, tailY);
            g.lineTo(px, py);
            g.lineStyle(0);
            
            // Particle head
            g.beginFill(PALETTE.particleMid, 0.85);
            g.drawCircle(px, py, p.size);
            g.endFill();
        }
    }
    
    /**
     * Bańki piaskowe wynurzające się z głębi (3-5 random spawn co kilka sekund).
     */
    private updateBubbles(time: number): void {
        const g = this.gfxBubbles;
        g.clear();
        
        // Spawn new bubble co 1.2-2.5s
        if (time - this.bubbleSpawnTimer > 1200 + Math.random() * 1300) {
            this.bubbleSpawnTimer = time;
            
            // Random position wewnątrz elipsy
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.7;  // 0-70% radius dla bubble origin
            const bx = Math.cos(a) * this.radiusX * r;
            const by = Math.sin(a) * this.radiusY * r;
            
            this.activeBubbles.push({
                x: bx,
                y: by,
                startTime: time,
                lifetime: 1500 + Math.random() * 800,
                riseSpeed: 0.3 + Math.random() * 0.4,
                targetSize: 3 + Math.random() * 3,
            });
        }
        
        // Update & render bubbles, remove dead
        for (let i = this.activeBubbles.length - 1; i >= 0; i--) {
            const b = this.activeBubbles[i];
            const age = (time - b.startTime) / b.lifetime;
            
            if (age >= 1) {
                this.activeBubbles.splice(i, 1);
                continue;
            }
            
            // Bubble rises subtly
            const yOffset = -age * 8 * b.riseSpeed;
            const renderX = b.x;
            const renderY = b.y + yOffset;
            
            // Size grows then pops at end
            let size: number;
            let alpha: number;
            if (age < 0.7) {
                size = b.targetSize * (age / 0.7);
                alpha = 0.85;
            } else {
                // Pop phase: grow rapidly + fade
                const popT = (age - 0.7) / 0.3;
                size = b.targetSize * (1 + popT * 0.6);
                alpha = 0.85 * (1 - popT);
            }
            
            // Bubble visual: light circle + darker ring
            g.lineStyle(0.8, PALETTE.particleDark, alpha * 0.8);
            g.beginFill(PALETTE.bubbleLight, alpha * 0.7);
            g.drawCircle(renderX, renderY, size);
            g.endFill();
            
            // Subtle highlight
            g.lineStyle(0);
            g.beginFill(0xffffff, alpha * 0.5);
            g.drawCircle(renderX - size * 0.3, renderY - size * 0.3, size * 0.25);
            g.endFill();
        }
    }
}