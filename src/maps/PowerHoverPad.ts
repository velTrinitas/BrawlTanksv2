import * as PIXI from 'pixi.js';
import { getPadShadowTexture } from './HoverRepairPad';

/**
 * PowerHoverPad — Turbo pad z v4.48.
 * Gracz w odległości <50px → instant TURBO ×2 na 5s, cooldown 20s.
 * Wizual: pomarańczowy glow, ⚡ symbol pulsujący, rotujące łuki energii.
 *
 * MOBILE-CRISP (fix pikselozy): plyta baked do Canvas 2D (AA) x2 warianty
 * (jak HoverRepairPad); hover/luki/labelki bez zmian.
 */

const PAD_SIZE = 100;
const PAD_RES = 3;

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

const _powerSlabTextures: { on: PIXI.Texture | null; off: PIXI.Texture | null } = { on: null, off: null };
/** Plyta turbo-pada (baza + panel + neon-ramka) — baked, 2 warianty. */
function getPowerSlabTexture(active: boolean): PIXI.Texture {
    const cached = active ? _powerSlabTextures.on : _powerSlabTextures.off;
    if (cached) return cached;
    const cv = document.createElement('canvas');
    cv.width = PAD_SIZE * PAD_RES;
    cv.height = PAD_SIZE * PAD_RES;
    const c = cv.getContext('2d')!;
    c.scale(PAD_RES, PAD_RES);

    // baza
    c.fillStyle = active ? '#140d05' : '#121212';
    roundRectPath(c, 0, 0, PAD_SIZE, PAD_SIZE, 15);
    c.fill();
    // panel przemyslowy (kwadrat srodkowy)
    c.strokeStyle = active ? '#3b2308' : '#222222';
    c.lineWidth = 2;
    c.strokeRect(15, 15, PAD_SIZE - 30, PAD_SIZE - 30);
    // neonowe krawedzie pomaranczowe
    c.strokeStyle = active ? '#ff6600' : '#332200';
    c.lineWidth = 5;
    roundRectPath(c, 3, 3, PAD_SIZE - 6, PAD_SIZE - 6, 15);
    c.stroke();

    const tex = PIXI.Texture.from(cv);
    if (active) _powerSlabTextures.on = tex; else _powerSlabTextures.off = tex;
    return tex;
}
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
    private floorShadow: PIXI.Sprite;
    private glowSprite: PIXI.Sprite;
    private platformBase: PIXI.Container;
    private slabSprite: PIXI.Sprite;
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
        
        this.floorShadow = new PIXI.Sprite(getPadShadowTexture());
        this.floorShadow.scale.set(1 / PAD_RES);
        this.floorShadow.alpha = 0.7;
        this.container.addChild(this.floorShadow);
        
        this.glowSprite = new PIXI.Sprite(getOrangeGlowTexture());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = PAD_SIZE / 2;
        this.glowSprite.y = PAD_SIZE / 2;
        this.glowSprite.blendMode = PIXI.BLEND_MODES.SCREEN;
        this.container.addChild(this.glowSprite);
        
        this.platformBase = new PIXI.Container();
        this.container.addChild(this.platformBase);
        
        this.slabSprite = new PIXI.Sprite(getPowerSlabTexture(true));
        this.slabSprite.scale.set(1 / PAD_RES);
        this.platformBase.addChild(this.slabSprite);

        // ⚡ symbol w centrum
        this.boltLabel = new PIXI.Text('⚡', {
            fontFamily: 'Arial',
            fontSize: 32,
            fontWeight: 'bold',
            fill: 0xffcc00, stroke: 0x000000, strokeThickness: 3,
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
            fill: 0xffeedd, stroke: 0x000000, strokeThickness: 3,
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

        // plyta = baked tekstura (mobile-crisp); stan aktywnosci przez podmiane tekstury
        this.slabSprite.texture = getPowerSlabTexture(isActive);

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