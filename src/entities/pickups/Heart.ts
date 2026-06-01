import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';

/**
 * Heart pickup — leczy gracza po dotknięciu.
 * Pulsujący sprite z efektem przy pickup'ie.
 */

let _heartTexture: PIXI.Texture | null = null;
function getHeartTexture(): PIXI.Texture {
    if (_heartTexture) return _heartTexture;
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d')!;
    
    // Heart kształt — dwa półokręgi + trójkąt na dole
    ctx.fillStyle = '#ff3366';
    ctx.strokeStyle = '#aa0033';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(11, 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(21, 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Trójkątna dolna część serca
    ctx.beginPath();
    ctx.moveTo(5, 14);
    ctx.lineTo(16, 28);
    ctx.lineTo(27, 14);
    ctx.closePath();
    ctx.fillStyle = '#ff3366';
    ctx.fill();
    ctx.strokeStyle = '#aa0033';
    ctx.stroke();
    
    // Highlight (mały biały błysk top-left)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(9, 10, 2, 0, Math.PI * 2);
    ctx.fill();
    
    _heartTexture = PIXI.Texture.from(cv);
    return _heartTexture;
}

export class Heart {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    public radius: number = 18;
    public healAmount: number = 1;
    private bornAt: number;
    private static readonly LIFETIME_MS = 15000; // znika po 15s jeśli nie podniesione
    
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
    
    update(delta: number): void {
        if (!this.active) return;
        
        // Puls (scale 0.9-1.1)
        const t = Date.now() / 250;
        this.sprite.scale.set(1 + Math.sin(t) * 0.1);
        
        // Migotanie przed zniknięciem (ostatnie 3s)
        const age = Date.now() - this.bornAt;
        if (age > Heart.LIFETIME_MS - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.3;
            this.sprite.alpha = blink;
        }
        
        // Auto-destroy po lifetime
        if (age > Heart.LIFETIME_MS) {
            this.destroy();
        }
    }
    
    /**
     * Wywoływane gdy gracz dotknie. Zwraca true jeśli zostało podniesione.
     */
    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        // Efekt: czerwone particles + sound (audio later)
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