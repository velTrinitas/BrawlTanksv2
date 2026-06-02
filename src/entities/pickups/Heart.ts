import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';

/**
 * Heart pickup — leczy gracza po dotknięciu.
 * HOTFIX: +30% większe + różowy glow outline.
 */

let _heartTexture: PIXI.Texture | null = null;
function getHeartTexture(): PIXI.Texture {
    if (_heartTexture) return _heartTexture;
    const cv = document.createElement('canvas');
    cv.width = 44; cv.height = 44;
    const ctx = cv.getContext('2d')!;
    
    const cx = 22, cy = 22;
    
    // === Glow outline (różowy soft glow) ===
    const glowGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 21);
    glowGrad.addColorStop(0, 'rgba(255,51,102,0.6)');
    glowGrad.addColorStop(0.5, 'rgba(255,51,102,0.3)');
    glowGrad.addColorStop(1, 'rgba(255,51,102,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, 44, 44);
    
    // === Heart shape (większe niż v0.4a) ===
    ctx.fillStyle = '#ff3366';
    ctx.strokeStyle = '#aa0033';
    ctx.lineWidth = 2.5;
    
    // Lewy półokrąg
    ctx.beginPath();
    ctx.arc(cx - 7, cy - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Prawy półokrąg
    ctx.beginPath();
    ctx.arc(cx + 7, cy - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Dolna część (trójkąt)
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 2);
    ctx.lineTo(cx, cy + 16);
    ctx.lineTo(cx + 14, cy - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#aa0033';
    ctx.stroke();
    
    // === Bright highlight (biały błysk top-left) ===
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Drugi mały highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 8, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    _heartTexture = PIXI.Texture.from(cv);
    return _heartTexture;
}

export class Heart {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    public radius: number = 22; // hotfix: większy
    public healAmount: number = 1;
    private bornAt: number;
    private static readonly LIFETIME_MS = 15000;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.active = true;
        this.bornAt = Date.now();
        
        this.sprite = new PIXI.Sprite(getHeartTexture());
        this.sprite.anchor.set(0.5);
        this.sprite.x = x;
        this.sprite.y = y;
        this.sprite.zIndex = y + 5;
        worldContainer.addChild(this.sprite);
    }
    
    update(_delta: number): void {
        if (!this.active) return;
        
        // Puls (scale 0.92-1.12)
        const t = Date.now() / 250;
        this.sprite.scale.set(1 + Math.sin(t) * 0.12);
        
        // Migotanie przed zniknięciem
        const age = Date.now() - this.bornAt;
        if (age > Heart.LIFETIME_MS - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.3;
            this.sprite.alpha = blink;
        }
        
        if (age > Heart.LIFETIME_MS) {
            this.destroy();
        }
    }
    
    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        effects.spawnEnemyHitSparks(this.x, this.y, 0xff3366);
        this.destroy();
        return true;
    }
    
    destroy(): void {
        this.active = false;
        if (this.sprite.parent) {
            this.sprite.parent.removeChild(this.sprite);
        }
        this.sprite.destroy();
    }
}