import * as PIXI from 'pixi.js';

/**
 * DesertHeartPad — desert wariant HoverRepairPad ("Serce Pustyni").
 * 
 * v0.18.6 FIX 3:
 *  - WYRAZISTSZY GLOW: texture 260px (było 180), alpha runtime 0.7-0.95 (było 0.4-0.7)
 *  - HEART ICON: ten sam style co Heart pickup (2 koła + trójkąt + white highlight)
 *    zamiast bezier curves — wizualna spójność z pickup'em na mapie.
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 60;
const REPAIR_TIME_MS = 2250;
const COOLDOWN_MS = 60000;

let _rubyGlowTexture: PIXI.Texture | null = null;
function getRubyGlowTexture(): PIXI.Texture {
    if (_rubyGlowTexture) return _rubyGlowTexture;
    // v0.18.6 FIX 3: powiększony 180 → 260px + wzmocniony alpha
    const size = 260;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 8, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,51,102,0.75)');     // jasny czerwono-różowy core
    grad.addColorStop(0.35, 'rgba(255,30,60,0.45)');   // mid magenta-red
    grad.addColorStop(0.7, 'rgba(180,10,30,0.18)');    // dark fade
    grad.addColorStop(1, 'rgba(120,0,20,0)');
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
    private heartGfx: PIXI.Graphics;
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
        
        // Piaszczysta podsypka wokół ołtarza
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
        
        // v0.18.6 FIX 3 — heart graphic jako osobny gfx (re-drawn co frame dla active toggle)
        this.heartGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.heartGfx);
        
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
        
        // v0.18.6 FIX 3: GLOW DUŻO WYRAZISTSZY
        // Idle: alpha ~0.7 z subtle pulse; Repairing: 0.85-1.0 z chaotic flicker
        if (isActive) {
            this.glowSprite.visible = true;
            if (isRepairing) {
                this.glowSprite.alpha = 0.85 + Math.random() * 0.15;
                // Subtle pulse scale podczas repair (1.0 - 1.08)
                const repairPulse = 1.0 + Math.sin(time * 12) * 0.04;
                this.glowSprite.scale.set(repairPulse);
            } else {
                // Idle pulse: powolny breath effect
                this.glowSprite.alpha = 0.70 + Math.sin(time * 1.8) * 0.15;
                const idlePulse = 1.0 + Math.sin(time * 2.2) * 0.06;
                this.glowSprite.scale.set(idlePulse);
            }
        } else {
            this.glowSprite.visible = false;
        }
        
        this.platformBase.y = -elevation;
        
        // Wapień
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
        
        // v0.18.6 FIX 3 — HEART ICON jak Heart pickup
        // Heart pickup używa: 2 circles (cx-7,cy-4)/(cx+7,cy-4) r=8 + triangle + biały highlight
        // Tutaj skalujemy ×1.6 żeby pasowało do padu (PAD_SIZE=100, serce ~36px)
        const HEART_SCALE = 0.8;  // v0.18.6-fix1: 50% mniejsze (było 1.6, przytłaczało pad)
        const heartCx = PAD_SIZE / 2;
        const heartCy = PAD_SIZE / 2 - 2;
        const r = 8 * HEART_SCALE;
        const lobeOffsetX = 7 * HEART_SCALE;
        const lobeOffsetY = 4 * HEART_SCALE;
        const triBottomY = 16 * HEART_SCALE;
        const triSideX = 14 * HEART_SCALE;
        const triTopY = 2 * HEART_SCALE;
        
        this.heartGfx.clear();
        
        if (isActive) {
            // Cień na kamieniu (osadzone w ołtarzu)
            this.heartGfx.beginFill(0x501010, 0.7);
            this.heartGfx.drawCircle(heartCx - lobeOffsetX, heartCy - lobeOffsetY + 2, r);
            this.heartGfx.drawCircle(heartCx + lobeOffsetX, heartCy - lobeOffsetY + 2, r);
            this.heartGfx.drawPolygon([
                heartCx - triSideX, heartCy - triTopY + 2,
                heartCx,            heartCy + triBottomY + 2,
                heartCx + triSideX, heartCy - triTopY + 2,
            ]);
            this.heartGfx.endFill();
            
            // Główna część serca — ten sam czerwony jak Heart pickup (#ff3366)
            this.heartGfx.lineStyle(2.5, 0xaa0033, 1);
            this.heartGfx.beginFill(0xff3366);
            this.heartGfx.drawCircle(heartCx - lobeOffsetX, heartCy - lobeOffsetY, r);
            this.heartGfx.drawCircle(heartCx + lobeOffsetX, heartCy - lobeOffsetY, r);
            this.heartGfx.endFill();
            
            this.heartGfx.lineStyle(0);
            this.heartGfx.beginFill(0xff3366);
            this.heartGfx.drawPolygon([
                heartCx - triSideX, heartCy - triTopY,
                heartCx,            heartCy + triBottomY,
                heartCx + triSideX, heartCy - triTopY,
            ]);
            this.heartGfx.endFill();
            
            // White highlight top-left (jak w Heart pickup)
            this.heartGfx.beginFill(0xffffff, 0.7);
            this.heartGfx.drawCircle(heartCx - 6 * HEART_SCALE, heartCy - 6 * HEART_SCALE, 3 * HEART_SCALE);
            this.heartGfx.endFill();
            this.heartGfx.beginFill(0xffffff, 0.4);
            this.heartGfx.drawCircle(heartCx - 3 * HEART_SCALE, heartCy - 8 * HEART_SCALE, 1.5 * HEART_SCALE);
            this.heartGfx.endFill();
        } else {
            // Inactive: serce przygaszone w jednolitym ciemnym czerwonym
            this.heartGfx.lineStyle(2, 0x3a0010, 1);
            this.heartGfx.beginFill(0x551111);
            this.heartGfx.drawCircle(heartCx - lobeOffsetX, heartCy - lobeOffsetY, r);
            this.heartGfx.drawCircle(heartCx + lobeOffsetX, heartCy - lobeOffsetY, r);
            this.heartGfx.endFill();
            this.heartGfx.lineStyle(0);
            this.heartGfx.beginFill(0x551111);
            this.heartGfx.drawPolygon([
                heartCx - triSideX, heartCy - triTopY,
                heartCx,            heartCy + triBottomY,
                heartCx + triSideX, heartCy - triTopY,
            ]);
            this.heartGfx.endFill();
        }
        
        // Magic aura (czerwony okrąg + iskry życia)
        this.magicAuraGfx.clear();
        if (isRepairing) {
            const auraRadius = 30 + Math.sin(time * 10) * 6;
            this.magicAuraGfx.lineStyle(2, 0xff5555, 0.7);
            this.magicAuraGfx.beginFill(0xff2222, 0.18);
            this.magicAuraGfx.drawCircle(heartCx, heartCy, auraRadius);
            this.magicAuraGfx.endFill();
            
            for (let i = 0; i < 5; i++) {
                const sparkX = heartCx + (Math.random() - 0.5) * 26;
                const sparkY = heartCy + (Math.random() - 0.5) * 26 - (Math.random() * 16);
                this.magicAuraGfx.lineStyle(0);
                this.magicAuraGfx.beginFill(0xffccaa, Math.random());
                this.magicAuraGfx.drawCircle(sparkX, sparkY, 1.5 + Math.random() * 1.5);
                this.magicAuraGfx.endFill();
            }
        }
        
        // Progress bar
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
        
        // Cooldown
        if (!isActive) {
            this.cooldownLabel.visible = true;
            const cdLeft = Math.ceil((this.cooldownEnd - Date.now()) / 1000);
            this.cooldownLabel.text = `${cdLeft}s`;
            this.cooldownLabel.x = PAD_SIZE / 2;
            this.cooldownLabel.y = PAD_SIZE / 2 + 14;  // pod sercem (zmniejszone z 22)
        } else {
            this.cooldownLabel.visible = false;
        }
    }
}