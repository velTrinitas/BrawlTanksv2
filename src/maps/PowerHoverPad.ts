import * as PIXI from 'pixi.js';

/**
 * PowerHoverPad — Turbo pad z v4.48.
 * Gracz w odległości <50px → instant TURBO ×2 na 5s, cooldown 20s.
 * Wizual: pomarańczowy glow, ⚡ symbol pulsujący, rotujące łuki energii.
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 50;
const TURBO_DURATION_MS = 5000;
const COOLDOWN_MS = 20000;
const TURBO_MULT = 2.0;

let _orangeGlowTexture: PIXI.Texture | null = null;
function getOrangeGlowTexture(): PIXI.Texture {
    if (_orangeGlowTexture) return _orangeGlowTexture;
    const size = 240;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 10, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,102,0,0.5)');
    grad.addColorStop(0.5, 'rgba(255,102,0,0.2)');
    grad.addColorStop(1, 'rgba(255,102,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _orangeGlowTexture = PIXI.Texture.from(cv);
    return _orangeGlowTexture;
}

export interface PowerPadInteractionResult {
    activated: boolean;
    durationMs: number;
    multiplier: number;
}

export class PowerHoverPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    
    public container: PIXI.Container;
    private floorShadow: PIXI.Graphics;
    private glowSprite: PIXI.Sprite;
    private platformBase: PIXI.Container;
    private wallGfx: PIXI.Graphics;
    private surfaceGfx: PIXI.Graphics;
    private boltLabel: PIXI.Text;
    private arcsGfx: PIXI.Graphics;
    private cooldownLabel: PIXI.Text;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 50;
        worldContainer.addChild(this.container);
        
        this.floorShadow = new PIXI.Graphics();
        this.floorShadow.beginFill(0x000000, 0.7);
        this.floorShadow.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 15);
        this.floorShadow.endFill();
        this.container.addChild(this.floorShadow);
        
        this.glowSprite = new PIXI.Sprite(getOrangeGlowTexture());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = PAD_SIZE / 2;
        this.glowSprite.y = PAD_SIZE / 2;
        this.glowSprite.blendMode = PIXI.BLEND_MODES.SCREEN;
        this.container.addChild(this.glowSprite);
        
        this.platformBase = new PIXI.Container();
        this.container.addChild(this.platformBase);
        
        this.wallGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.wallGfx);
        
        this.surfaceGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.surfaceGfx);
        
        // ⚡ symbol w centrum
        this.boltLabel = new PIXI.Text('⚡', {
            fontFamily: 'Arial',
            fontSize: 32,
            fontWeight: 'bold',
            fill: 0xffcc00,
        });
        this.boltLabel.anchor.set(0.5);
        this.boltLabel.x = PAD_SIZE / 2;
        this.boltLabel.y = PAD_SIZE / 2;
        this.platformBase.addChild(this.boltLabel);
        
        // Łuki energii rotujące
        this.arcsGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.arcsGfx);
        
        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial',
            fontSize: 9,
            fontWeight: 'bold',
            fill: 0xffeedd,
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
        const hoverH = isActive ? 12 + Math.sin(time * 6) * 4 : 4;
        
        // Glow
        if (isActive) {
            this.glowSprite.visible = true;
            this.glowSprite.alpha = 0.7;
        } else {
            this.glowSprite.visible = false;
        }
        
        this.platformBase.y = -hoverH;
        
        // Walls
        const wallColor = isActive ? 0x2b1400 : 0x0a0805;
        this.wallGfx.clear();
        this.wallGfx.beginFill(wallColor);
        this.wallGfx.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 15);
        this.wallGfx.moveTo(15, hoverH);
        this.wallGfx.lineTo(15, 0);
        this.wallGfx.lineTo(PAD_SIZE - 15, 0);
        this.wallGfx.lineTo(PAD_SIZE - 15, hoverH);
        this.wallGfx.endFill();
        
        // Surface
        this.surfaceGfx.clear();
        this.surfaceGfx.beginFill(isActive ? 0x140d05 : 0x121212);
        this.surfaceGfx.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 15);
        this.surfaceGfx.endFill();
        
        // Panel przemysłowy (kwadrat środkowy)
        this.surfaceGfx.lineStyle(2, isActive ? 0x3b2308 : 0x222222, 1);
        this.surfaceGfx.drawRect(15, 15, PAD_SIZE - 30, PAD_SIZE - 30);
        
        // Neonowe krawędzie pomarańczowe
        this.surfaceGfx.lineStyle(5, isActive ? 0xff6600 : 0x332200, 1);
        this.surfaceGfx.drawRoundedRect(3, 3, PAD_SIZE - 6, PAD_SIZE - 6, 15);
        
        // ⚡ pulse scale
        if (isActive) {
            const sc = 1 + Math.sin(time * 6) * 0.08;
            this.boltLabel.scale.set(sc);
            this.boltLabel.tint = 0xffcc00;
        } else {
            this.boltLabel.scale.set(0.85);
            this.boltLabel.tint = 0x554400;
        }
        
        // Rotujące łuki energii (tylko gdy aktywny)
        this.arcsGfx.clear();
        if (isActive) {
            this.arcsGfx.x = PAD_SIZE / 2;
            this.arcsGfx.y = PAD_SIZE / 2;
            this.arcsGfx.alpha = 0.7;
            for (let i = 0; i < 4; i++) {
                const startAngle = time * 2 + (i * Math.PI) / 2;
                const endAngle = startAngle + 0.9;
                this.arcsGfx.lineStyle(2, 0xff6600, 0.85);
                this.arcsGfx.arc(0, 0, 28, startAngle, endAngle);
            }
        }
        
        // Cooldown
        if (!isActive) {
            this.cooldownLabel.visible = true;
            const cdLeft = Math.ceil((this.cooldownEnd - Date.now()) / 1000);
            this.cooldownLabel.text = `⏱ ${cdLeft}s`;
            this.cooldownLabel.x = PAD_SIZE / 2;
            this.cooldownLabel.y = -16;
        } else {
            this.cooldownLabel.visible = false;
        }
    }
}