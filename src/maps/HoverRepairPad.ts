import * as PIXI from 'pixi.js';

/**
 * HoverRepairPad — MediPad z v4.48.
 * v0.4c: range 48→60px, naprawa 3s→2.25s (łatwiejszy healing).
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 60;       // v0.4c: +25% (było 48)
const REPAIR_TIME_MS = 2250;     // v0.4c: -25% (było 3000)
const COOLDOWN_MS = 60000;

// MOBILE-CRISP (fix pikselozy): antialias renderera OFF na mobile => zaokraglone
// naroza/krzyz z zywego PIXI.Graphics pikseluja. Plyta pada WYPIECZONA do tekstur
// Canvas 2D (AA) x2 (aktywna/nieaktywna) + cien; hover/lasery/progress na transformach.
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

let _padShadowTexture: PIXI.Texture | null = null;
/** Cien pada (czarny roundRect) — wspoldzielony (alpha per-instance). Uzywa go tez PowerHoverPad. */
export function getPadShadowTexture(): PIXI.Texture {
    if (_padShadowTexture) return _padShadowTexture;
    const cv = document.createElement('canvas');
    cv.width = PAD_SIZE * PAD_RES;
    cv.height = PAD_SIZE * PAD_RES;
    const c = cv.getContext('2d')!;
    c.scale(PAD_RES, PAD_RES);
    c.fillStyle = '#000000';
    roundRectPath(c, 0, 0, PAD_SIZE, PAD_SIZE, 15);
    c.fill();
    _padShadowTexture = PIXI.Texture.from(cv);
    return _padShadowTexture;
}

const _mediSlabTextures: { on: PIXI.Texture | null; off: PIXI.Texture | null } = { on: null, off: null };
/** Plyta medi-pada (baza + siatka + neon-ramka + krzyz) — baked, 2 warianty. */
function getMediSlabTexture(active: boolean): PIXI.Texture {
    const cached = active ? _mediSlabTextures.on : _mediSlabTextures.off;
    if (cached) return cached;
    const cv = document.createElement('canvas');
    cv.width = PAD_SIZE * PAD_RES;
    cv.height = PAD_SIZE * PAD_RES;
    const c = cv.getContext('2d')!;
    c.scale(PAD_RES, PAD_RES);

    // baza
    c.fillStyle = active ? '#1f0d14' : '#14181f';
    roundRectPath(c, 0, 0, PAD_SIZE, PAD_SIZE, 15);
    c.fill();
    // siatka srodkowa
    c.strokeStyle = active ? '#3b1622' : '#222222';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(15, PAD_SIZE / 2); c.lineTo(PAD_SIZE - 15, PAD_SIZE / 2);
    c.moveTo(PAD_SIZE / 2, 15); c.lineTo(PAD_SIZE / 2, PAD_SIZE - 15);
    c.stroke();
    // neonowa ramka
    c.strokeStyle = active ? '#ff003c' : '#333333';
    c.lineWidth = 4;
    roundRectPath(c, 2, 2, PAD_SIZE - 4, PAD_SIZE - 4, 15);
    c.stroke();
    // krzyz medyczny
    const cwHalf = 4, chHalf = 11;
    c.fillStyle = active ? '#ff003c' : '#552233';
    c.fillRect(PAD_SIZE / 2 - cwHalf, PAD_SIZE / 2 - chHalf, cwHalf * 2, chHalf * 2);
    c.fillRect(PAD_SIZE / 2 - chHalf, PAD_SIZE / 2 - cwHalf, chHalf * 2, cwHalf * 2);

    const tex = PIXI.Texture.from(cv);
    if (active) _mediSlabTextures.on = tex; else _mediSlabTextures.off = tex;
    return tex;
}

let _redGlowTexture: PIXI.Texture | null = null;
function getRedGlowTexture(): PIXI.Texture {
    if (_redGlowTexture) return _redGlowTexture;
    const size = 220;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 10, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,0,60,0.55)');
    grad.addColorStop(0.5, 'rgba(255,0,60,0.22)');
    grad.addColorStop(1, 'rgba(255,0,60,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _redGlowTexture = PIXI.Texture.from(cv);
    return _redGlowTexture;
}

export interface PadInteractionResult {
    healed: boolean;
}

export class HoverRepairPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    public repairProgress: number = 0;
    private _repairStart: number | null = null;
    
    public container: PIXI.Container;
    private floorShadow: PIXI.Sprite;
    private glowSprite: PIXI.Sprite;
    private platformBase: PIXI.Container;
    private slabSprite: PIXI.Sprite;
    private laserGfx: PIXI.Graphics;
    private progressBarBg: PIXI.Graphics;
    private progressBarFill: PIXI.Graphics;
    private progressLabel: PIXI.Text;
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
        this.floorShadow.alpha = 0.6;
        this.container.addChild(this.floorShadow);
        
        this.glowSprite = new PIXI.Sprite(getRedGlowTexture());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = PAD_SIZE / 2;
        this.glowSprite.y = PAD_SIZE / 2;
        this.glowSprite.blendMode = PIXI.BLEND_MODES.SCREEN;
        this.container.addChild(this.glowSprite);
        
        this.platformBase = new PIXI.Container();
        this.container.addChild(this.platformBase);
        
        this.slabSprite = new PIXI.Sprite(getMediSlabTexture(true));
        this.slabSprite.scale.set(1 / PAD_RES);
        this.platformBase.addChild(this.slabSprite);

        this.laserGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.laserGfx);
        
        this.progressBarBg = new PIXI.Graphics();
        this.progressBarBg.visible = false;
        this.platformBase.addChild(this.progressBarBg);
        
        this.progressBarFill = new PIXI.Graphics();
        this.progressBarFill.visible = false;
        this.platformBase.addChild(this.progressBarFill);
        
        this.progressLabel = new PIXI.Text('NAPRAWIAM...', {
            fontFamily: 'Courier New',
            fontSize: 10,
            fontWeight: 'bold',
            fill: 0xffffff,
        });
        this.progressLabel.anchor.set(0.5);
        this.progressLabel.visible = false;
        this.platformBase.addChild(this.progressLabel);
        
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
        isPlayerMoving: boolean,
        playerHp: number,
        playerMaxHp: number,
        time: number
    ): PadInteractionResult {
        const now = Date.now();
        const isActive = now >= this.cooldownEnd;
        let healed = false;
        
        if (isActive) {
            const cx = this.x + PAD_SIZE / 2;
            const cy = this.y + PAD_SIZE / 2;
            const dx = playerX - cx, dy = playerY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < ACTIVATE_RANGE && playerHp < playerMaxHp) {
                if (!isPlayerMoving) {
                    if (!this._repairStart) this._repairStart = now;
                    this.repairProgress = Math.min(1, (now - this._repairStart) / REPAIR_TIME_MS);
                    if (this.repairProgress >= 1) {
                        healed = true;
                        this.cooldownEnd = now + COOLDOWN_MS;
                        this.repairProgress = 0;
                        this._repairStart = null;
                    }
                } else {
                    this.repairProgress = 0;
                    this._repairStart = null;
                }
            } else {
                this.repairProgress = 0;
                this._repairStart = null;
            }
        } else {
            this.repairProgress = 0;
        }
        
        this.drawVisuals(isActive, time);
        
        return { healed };
    }
    
    private drawVisuals(isActive: boolean, time: number): void {
        const isRepairing = this.repairProgress > 0;
        const hoverH = isActive ? 10 + Math.sin(time * 3) * 5 : 2;
        
        if (isActive) {
            this.glowSprite.visible = true;
            this.glowSprite.alpha = isRepairing ? 0.5 + Math.random() * 0.3 : 0.6;
        } else {
            this.glowSprite.visible = false;
        }
        
        this.platformBase.y = -hoverH;

        // plyta = baked tekstura (mobile-crisp); stan aktywnosci przez podmiane tekstury
        this.slabSprite.texture = getMediSlabTexture(isActive);

        // Lasery
        this.laserGfx.clear();
        if (isRepairing) {
            const targetX = PAD_SIZE / 2 + (Math.random() - 0.5) * 5;
            const targetY = PAD_SIZE / 2 + (Math.random() - 0.5) * 5;
            const corners: Array<[number, number]> = [
                [10, 10], [PAD_SIZE - 10, 10],
                [10, PAD_SIZE - 10], [PAD_SIZE - 10, PAD_SIZE - 10],
            ];
            for (const [cx, cy] of corners) {
                this.laserGfx.lineStyle(1.5 + Math.random(), 0xc8ffff, 0.85);
                this.laserGfx.moveTo(cx, cy);
                this.laserGfx.lineTo(targetX, targetY);
                this.laserGfx.lineStyle(0);
                this.laserGfx.beginFill(0xffffff, 1);
                this.laserGfx.drawCircle(cx, cy, 3);
                this.laserGfx.endFill();
            }
        }
        
        // Progress bar
        if (isRepairing) {
            this.progressBarBg.visible = true;
            this.progressBarFill.visible = true;
            this.progressLabel.visible = true;
            
            this.progressBarBg.clear();
            this.progressBarBg.beginFill(0x000000, 0.7);
            this.progressBarBg.drawRoundedRect(PAD_SIZE / 2 - 40, -28, 80, 12, 4);
            this.progressBarBg.endFill();
            
            this.progressBarFill.clear();
            this.progressBarFill.beginFill(0x00ffff);
            this.progressBarFill.drawRoundedRect(PAD_SIZE / 2 - 38, -26, 76 * this.repairProgress, 8, 3);
            this.progressBarFill.endFill();
            
            this.progressLabel.x = PAD_SIZE / 2;
            this.progressLabel.y = -38;
        } else {
            this.progressBarBg.visible = false;
            this.progressBarFill.visible = false;
            this.progressLabel.visible = false;
        }
        
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