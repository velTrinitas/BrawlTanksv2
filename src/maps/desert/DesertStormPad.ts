import * as PIXI from 'pixi.js';

/**
 * DesertStormPad — desert wariant PowerHoverPad ("Ołtarz Burzy").
 * Visual: czarny bazalt + złota zygzakowata błyskawica + niebieskie elektryczne wyładowania.
 * Mechanika: IDENTYCZNA z PowerHoverPad (city) — TYLKO wygląd różni się.
 * 
 * Game balance: 5s turbo / 45s CD / range 50 / mult 2.0 — match city pads.
 * Jeśli zmienisz wartości w city PowerHoverPad, ZMIEŃ TEŻ TUTAJ żeby balans był spójny.
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 50;          // MATCH city PowerHoverPad
const TURBO_DURATION_MS = 5000;     // MATCH city PowerHoverPad
const COOLDOWN_MS = 20000;          // MATCH city PowerHoverPad
const TURBO_MULT = 2.0;             // MATCH city PowerHoverPad

let _stormGlowTexture: PIXI.Texture | null = null;
function getStormGlowTexture(): PIXI.Texture {
    if (_stormGlowTexture) return _stormGlowTexture;
    const size = 240;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 10, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,200,0,0.5)');
    grad.addColorStop(0.5, 'rgba(255,150,0,0.2)');
    grad.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _stormGlowTexture = PIXI.Texture.from(cv);
    return _stormGlowTexture;
}

export interface PowerPadInteractionResult {
    activated: boolean;
    durationMs: number;
    multiplier: number;
}

export class DesertStormPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    
    public container: PIXI.Container;
    private floorShadow: PIXI.Graphics;
    private glowSprite: PIXI.Sprite;
    private platformBase: PIXI.Container;
    private wallGfx: PIXI.Graphics;
    private surfaceGfx: PIXI.Graphics;
    private arcsGfx: PIXI.Graphics;
    private cooldownLabel: PIXI.Text;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 5;
        worldContainer.addChild(this.container);
        
        // Poczerniały piasek pod ołtarzem (przypalony)
        this.floorShadow = new PIXI.Graphics();
        this.floorShadow.beginFill(0x1a0d00, 0.7);
        this.floorShadow.drawCircle(PAD_SIZE / 2, PAD_SIZE / 2, PAD_SIZE * 0.55);
        this.floorShadow.endFill();
        this.container.addChild(this.floorShadow);
        
        this.glowSprite = new PIXI.Sprite(getStormGlowTexture());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = PAD_SIZE / 2;
        this.glowSprite.y = PAD_SIZE / 2;
        this.glowSprite.blendMode = PIXI.BLEND_MODES.ADD;
        this.container.addChild(this.glowSprite);
        
        this.platformBase = new PIXI.Container();
        this.container.addChild(this.platformBase);
        
        this.wallGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.wallGfx);
        
        this.surfaceGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.surfaceGfx);
        
        this.arcsGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.arcsGfx);
        
        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 'bold',
            fill: 0x887766,
        });
        this.cooldownLabel.anchor.set(0.5);
        this.cooldownLabel.visible = false;
        this.platformBase.addChild(this.cooldownLabel);
    }
    
    update(
        playerX: number,
        playerY: number,
        time: number
    ): PowerPadInteractionResult {
        const now = Date.now();
        const isActive = now >= this.cooldownEnd;
        let activated = false;
        
        if (isActive) {
            const cx = this.x + PAD_SIZE / 2;
            const cy = this.y + PAD_SIZE / 2;
            const dx = playerX - cx, dy = playerY - cy;
            if (dx * dx + dy * dy < ACTIVATE_RANGE * ACTIVATE_RANGE) {
                activated = true;
                this.cooldownEnd = now + COOLDOWN_MS;
            }
        }
        
        this.drawVisuals(isActive, time);
        
        return {
            activated,
            durationMs: TURBO_DURATION_MS,
            multiplier: TURBO_MULT,
        };
    }
    
    private drawVisuals(isActive: boolean, time: number): void {
        const elevation = isActive ? 5 : 2;
        
        if (isActive) {
            this.glowSprite.visible = true;
            this.glowSprite.alpha = 0.6 + Math.sin(time * 8) * 0.2;
        } else {
            this.glowSprite.visible = false;
        }
        
        this.platformBase.y = -elevation;
        
        const chamfer = 22; // octagon shape
        const w = PAD_SIZE;
        const h = PAD_SIZE;
        
        // Bazalt — grubość płyty (ekstruzja w dół)
        const wallColor = isActive ? 0x1f1f22 : 0x0f0f12;
        this.wallGfx.clear();
        this.wallGfx.beginFill(wallColor);
        for (let i = 1; i <= elevation; i++) {
            this.wallGfx.drawPolygon([
                chamfer, i,  w - chamfer, i,
                w, chamfer + i,  w, h - chamfer + i,
                w - chamfer, h + i,  chamfer, h + i,
                0, h - chamfer + i,  0, chamfer + i
            ]);
        }
        this.wallGfx.endFill();
        
        // Powierzchnia ołtarza (ośmiokąt)
        const surfaceColor = isActive ? 0x2a2a2e : 0x151518;
        this.surfaceGfx.clear();
        this.surfaceGfx.beginFill(surfaceColor);
        this.surfaceGfx.drawPolygon([
            chamfer, 0,  w - chamfer, 0,
            w, chamfer,  w, h - chamfer,
            w - chamfer, h,  chamfer, h,
            0, h - chamfer,  0, chamfer
        ]);
        this.surfaceGfx.endFill();
        
        // Zdobienia krawędzi
        this.surfaceGfx.lineStyle(2, isActive ? 0x111111 : 0x050505, 1);
        const c2 = chamfer + 2;
        this.surfaceGfx.drawPolygon([
            c2, 6,  w - c2, 6,
            w - 6, c2,  w - 6, h - c2,
            w - c2, h - 6,  c2, h - 6,
            6, h - c2,  6, c2
        ]);
        
        // Cień symbolu
        this.surfaceGfx.lineStyle(0);
        this.surfaceGfx.beginFill(0x110d00, 0.8);
        this.drawLightningPath(this.surfaceGfx, PAD_SIZE / 2, (PAD_SIZE / 2) + 2, 1.8);
        this.surfaceGfx.endFill();
        
        // Złota zygzakowata błyskawica
        this.surfaceGfx.beginFill(isActive ? 0xffcc00 : 0x443300);
        if (isActive) {
            this.surfaceGfx.lineStyle(1.5, 0xffffff, 0.8);
        }
        this.drawLightningPath(this.surfaceGfx, PAD_SIZE / 2, PAD_SIZE / 2, 1.8);
        this.surfaceGfx.endFill();
        
        // Niebieskawe elektryczne wyładowania
        this.arcsGfx.clear();
        if (isActive) {
            for (let i = 0; i < 3; i++) {
                if (Math.random() > 0.4) {
                    const startX = PAD_SIZE / 2 + (Math.random() - 0.5) * PAD_SIZE * 0.7;
                    const startY = PAD_SIZE / 2 + (Math.random() - 0.5) * PAD_SIZE * 0.7;
                    
                    this.arcsGfx.lineStyle(1 + Math.random(), 0x00e5ff, 0.9);
                    this.arcsGfx.moveTo(startX, startY);
                    
                    const midX = startX + (Math.random() - 0.5) * 20;
                    const midY = startY + (Math.random() - 0.5) * 20;
                    this.arcsGfx.lineTo(midX, midY);
                    
                    const endX = midX + (Math.random() - 0.5) * 25;
                    const endY = midY + (Math.random() - 0.5) * 25;
                    this.arcsGfx.lineTo(endX, endY);
                }
            }
        }
        
        // Cooldown timer w środku wygasłego symbolu
        if (!isActive) {
            this.cooldownLabel.visible = true;
            const cdLeft = Math.ceil((this.cooldownEnd - Date.now()) / 1000);
            this.cooldownLabel.text = `${cdLeft}s`;
            this.cooldownLabel.x = PAD_SIZE / 2;
            this.cooldownLabel.y = PAD_SIZE / 2;
        } else {
            this.cooldownLabel.visible = false;
        }
    }
    
    private drawLightningPath(gfx: PIXI.Graphics, cx: number, cy: number, scale: number): void {
        gfx.moveTo(cx + 4 * scale, cy - 14 * scale);
        gfx.lineTo(cx - 9 * scale, cy + 2 * scale);
        gfx.lineTo(cx - 2 * scale, cy + 2 * scale);
        gfx.lineTo(cx - 7 * scale, cy + 16 * scale);
        gfx.lineTo(cx + 10 * scale, cy - 2 * scale);
        gfx.lineTo(cx + 2 * scale, cy - 2 * scale);
        gfx.lineTo(cx + 8 * scale, cy - 14 * scale);
        gfx.closePath();
    }
}