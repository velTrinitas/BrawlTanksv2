import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';
import { PICKUP_CONFIG } from '../../config/powers';

/**
 * Gem pickup — drop po zabiciu wroga. Daje XP do super charge.
 */

let _gemTexture: PIXI.Texture | null = null;
function getGemTexture(): PIXI.Texture {
    if (_gemTexture) return _gemTexture;
    const cv = document.createElement('canvas');
    cv.width = 20; cv.height = 24;
    const ctx = cv.getContext('2d')!;
    
    // Diamond shape (cyan/blue)
    ctx.fillStyle = '#00bfff';
    ctx.strokeStyle = '#0080cc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.lineTo(18, 10);
    ctx.lineTo(10, 22);
    ctx.lineTo(2, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Facet highlights
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.lineTo(14, 10);
    ctx.lineTo(10, 12);
    ctx.lineTo(6, 10);
    ctx.closePath();
    ctx.fill();
    
    // Inner shine
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(8, 8, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    _gemTexture = PIXI.Texture.from(cv);
    return _gemTexture;
}

export class Gem {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    public radius: number = 10;
    public value: number = PICKUP_CONFIG.gemValue;
    private bornAt: number;
    
    // Magnet-attracted state
    public attracted: boolean = false;
    private vx: number = 0;
    private vy: number = 0;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        // Lekkie odsunięcie od punktu śmierci
        this.x = x + (Math.random() - 0.5) * 30;
        this.y = y + (Math.random() - 0.5) * 30;
        this.active = true;
        this.bornAt = Date.now();
        
        this.sprite = new PIXI.Sprite(getGemTexture());
        this.sprite.anchor.set(0.5);
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.zIndex = this.y + 3;
        worldContainer.addChild(this.sprite);
    }
    
    update(delta: number, playerX: number, playerY: number): void {
        if (!this.active) return;
        
        // Bobbing animation + lekki spin
        const t = Date.now() / 200;
        this.sprite.scale.set(1 + Math.sin(t + this.x) * 0.08);
        
        // Magnet attraction
        if (this.attracted) {
            const dx = playerX - this.x;
            const dy = playerY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
                this.vx = (dx / dist) * PICKUP_CONFIG.magnetAttractSpeed;
                this.vy = (dy / dist) * PICKUP_CONFIG.magnetAttractSpeed;
                this.x += this.vx * delta;
                this.y += this.vy * delta;
                this.sprite.x = this.x;
                this.sprite.y = this.y;
            }
        }
        
        // Migotanie przed zniknięciem (ostatnie 3s)
        const age = Date.now() - this.bornAt;
        if (age > PICKUP_CONFIG.gemLifetimeMs - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.3;
            this.sprite.alpha = blink;
        }
        
        if (age > PICKUP_CONFIG.gemLifetimeMs) {
            this.destroy();
        }
    }
    
    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        effects.spawnEnemyHitSparks(this.x, this.y, 0x00bfff);
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