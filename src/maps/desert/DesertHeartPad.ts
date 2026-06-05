import * as PIXI from 'pixi.js';

/**
 * DesertHeartPad — desert wariant HoverRepairPad ("Serce Pustyni").
 * Visual: kamienny ołtarz z rubinowym kryształem w kształcie serca + magic aura.
 * Mechanika: IDENTYCZNA z HoverRepairPad (city) — TYLKO wygląd różni się.
 * 
 * Game balance: 3s repair / 60s CD / range 60 — match city pads (user requested Opcja A).
 * Jeśli zmienisz wartości w city HoverRepairPad, ZMIEŃ TEŻ TUTAJ żeby balans był spójny.
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 60;       // MATCH city HoverRepairPad
const REPAIR_TIME_MS = 2250;     // MATCH city HoverRepairPad
const COOLDOWN_MS = 60000;       // MATCH city HoverRepairPad

let _rubyGlowTexture: PIXI.Texture | null = null;
function getRubyGlowTexture(): PIXI.Texture {
    if (_rubyGlowTexture) return _rubyGlowTexture;
    const size = 180;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 5, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,40,40,0.4)');
    grad.addColorStop(0.5, 'rgba(200,10,10,0.15)');
    grad.addColorStop(1, 'rgba(150,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _rubyGlowTexture = PIXI.Texture.from(cv);
    return _rubyGlowTexture;
}

export interface PadInteractionResult {
    healed: boolean;
}

export class DesertHeartPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    public repairProgress: number = 0;
    private _repairStart: number | null = null;
    
    public container: PIXI.Container;
    private floorShadow: PIXI.Graphics;
    private glowSprite: PIXI.Sprite;
    private platformBase: PIXI.Container;
    private wallGfx: PIXI.Graphics;
    private surfaceGfx: PIXI.Graphics;
    private magicAuraGfx: PIXI.Graphics;
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
        this.container.zIndex = y + 5;
        worldContainer.addChild(this.container);
        
        // Piaszczysta podsypka wokół kamienia
        this.floorShadow = new PIXI.Graphics();
        this.floorShadow.beginFill(0x8a6a42, 0.4);
        this.floorShadow.drawRoundedRect(-5, -5, PAD_SIZE + 10, PAD_SIZE + 10, 8);
        this.floorShadow.endFill();
        this.container.addChild(this.floorShadow);
        
        this.glowSprite = new PIXI.Sprite(getRubyGlowTexture());
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
        
        this.magicAuraGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.magicAuraGfx);
        
        this.progressBarBg = new PIXI.Graphics();
        this.progressBarBg.visible = false;
        this.platformBase.addChild(this.progressBarBg);
        
        this.progressBarFill = new PIXI.Graphics();
        this.progressBarFill.visible = false;
        this.platformBase.addChild(this.progressBarFill);
        
        this.progressLabel = new PIXI.Text('ODNOWA...', {
            fontFamily: 'Courier New',
            fontSize: 10,
            fontWeight: 'bold',
            fill: 0xffddaa,
        });
        this.progressLabel.anchor.set(0.5);
        this.progressLabel.visible = false;
        this.platformBase.addChild(this.progressLabel);
        
        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial',
            fontSize: 11,
            fontWeight: 'bold',
            fill: 0x5a3a10,
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
        const elevation = isActive ? 4 : 2;
        
        if (isActive) {
            this.glowSprite.visible = true;
            this.glowSprite.alpha = isRepairing ? 0.7 + Math.random() * 0.3 : 0.4 + Math.sin(time * 2) * 0.2;
        } else {
            this.glowSprite.visible = false;
        }
        
        this.platformBase.y = -elevation;
        
        // Wapień (jasny kamień), aktywny vs nieaktywny
        const wallColor = isActive ? 0xc8aa80 : 0x8a7a60;
        this.wallGfx.clear();
        this.wallGfx.beginFill(wallColor);
        this.wallGfx.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 6);
        this.wallGfx.moveTo(6, elevation);
        this.wallGfx.lineTo(6, 0);
        this.wallGfx.lineTo(PAD_SIZE - 6, 0);
        this.wallGfx.lineTo(PAD_SIZE - 6, elevation);
        this.wallGfx.endFill();
        
        // Powierzchnia ołtarza
        this.surfaceGfx.clear();
        this.surfaceGfx.beginFill(isActive ? 0xebd2a8 : 0x9a8a70);
        this.surfaceGfx.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 6);
        this.surfaceGfx.endFill();
        
        // Wykute rowki
        this.surfaceGfx.lineStyle(2, isActive ? 0xb09260 : 0x706040, 1);
        this.surfaceGfx.drawRoundedRect(4, 4, PAD_SIZE - 8, PAD_SIZE - 8, 4);
        
        // Serce w centrum ołtarza
        const cx = PAD_SIZE / 2;
        const cy = PAD_SIZE / 2 - 4;
        
        // Cień (osadzone w kamieniu)
        this.surfaceGfx.lineStyle(0);
        this.surfaceGfx.beginFill(0x503020, 0.8);
        this.drawHeartPath(this.surfaceGfx, cx, cy + 2, 18);
        this.surfaceGfx.endFill();
        
        // Rubinowy kryształ
        this.surfaceGfx.beginFill(isActive ? 0xff2030 : 0x551111);
        if (isActive) {
            this.surfaceGfx.lineStyle(1.5, 0xffaaaa, 0.8);
        }
        this.drawHeartPath(this.surfaceGfx, cx, cy, 18);
        this.surfaceGfx.endFill();
        
        // Magic aura (czerwony okrąg + iskry życia)
        this.magicAuraGfx.clear();
        if (isRepairing) {
            const auraRadius = 25 + Math.sin(time * 10) * 5;
            this.magicAuraGfx.lineStyle(2, 0xff5555, 0.6);
            this.magicAuraGfx.beginFill(0xff2222, 0.15);
            this.magicAuraGfx.drawCircle(cx, cy, auraRadius);
            this.magicAuraGfx.endFill();
            
            for (let i = 0; i < 4; i++) {
                const sparkX = cx + (Math.random() - 0.5) * 20;
                const sparkY = cy + (Math.random() - 0.5) * 20 - (Math.random() * 15);
                this.magicAuraGfx.lineStyle(0);
                this.magicAuraGfx.beginFill(0xffccaa, Math.random());
                this.magicAuraGfx.drawCircle(sparkX, sparkY, 1.5 + Math.random() * 1.5);
                this.magicAuraGfx.endFill();
            }
        }
        
        // Antyczny pasek postępu
        if (isRepairing) {
            this.progressBarBg.visible = true;
            this.progressBarFill.visible = true;
            this.progressLabel.visible = true;
            
            this.progressBarBg.clear();
            this.progressBarBg.beginFill(0x4a2a10, 0.85);
            this.progressBarBg.lineStyle(1, 0x9a7a40, 1);
            this.progressBarBg.drawRoundedRect(PAD_SIZE / 2 - 40, -32, 80, 12, 2);
            this.progressBarBg.endFill();
            
            this.progressBarFill.clear();
            this.progressBarFill.lineStyle(0);
            this.progressBarFill.beginFill(0xff3333);
            this.progressBarFill.drawRoundedRect(PAD_SIZE / 2 - 38, -30, 76 * this.repairProgress, 8, 1);
            this.progressBarFill.endFill();
            
            this.progressLabel.x = PAD_SIZE / 2;
            this.progressLabel.y = -42;
        } else {
            this.progressBarBg.visible = false;
            this.progressBarFill.visible = false;
            this.progressLabel.visible = false;
        }
        
        // Cooldown licznik
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
    
    private drawHeartPath(gfx: PIXI.Graphics, x: number, y: number, scale: number): void {
        gfx.moveTo(x, y + scale * 0.8);
        gfx.bezierCurveTo(
            x - scale * 1.5, y - scale * 0.2,
            x - scale * 0.8, y - scale * 1.2,
            x, y - scale * 0.4
        );
        gfx.bezierCurveTo(
            x + scale * 0.8, y - scale * 1.2,
            x + scale * 1.5, y - scale * 0.2,
            x, y + scale * 0.8
        );
    }
}