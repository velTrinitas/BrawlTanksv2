import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';

/**
 * Magnet pickup — rare. Aktywuje 5s podczas których wszystkie gems lecą do gracza.
 */

let _magnetTexture: PIXI.Texture | null = null;
function getMagnetTexture(): PIXI.Texture {
    if (_magnetTexture) return _magnetTexture;
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d')!;
    
    // Stylizowany magnes — kształt podkowy ze końcami N/S
    // Background dim
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    ctx.fillRect(0, 0, 32, 32);
    
    // Czerwona część (N)
    ctx.fillStyle = '#e74c3c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(4, 4, 10, 20, 2);
    ctx.fill();
    ctx.stroke();
    
    // Szara część (S)
    ctx.fillStyle = '#95a5a6';
    ctx.beginPath();
    ctx.roundRect(18, 4, 10, 20, 2);
    ctx.fill();
    ctx.stroke();
    
    // Łącznik środkowy
    ctx.fillStyle = '#7f8c8d';
    ctx.beginPath();
    ctx.roundRect(4, 18, 24, 6, 2);
    ctx.fill();
    ctx.stroke();
    
    // Litery N i S
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 9, 12);
    ctx.fillText('S', 23, 12);
    
    _magnetTexture = PIXI.Texture.from(cv);
    return _magnetTexture;
}

export class Magnet {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    public radius: number = 16;
    private bornAt: number;
    private static readonly LIFETIME_MS = 20000;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.active = true;
        this.bornAt = Date.now();
        
        this.sprite = new PIXI.Sprite(getMagnetTexture());
        this.sprite.anchor.set(0.5);
        this.sprite.x = x;
        this.sprite.y = y;
        this.sprite.zIndex = y + 4;
        worldContainer.addChild(this.sprite);
    }
    
    update(_delta: number): void {
        if (!this.active) return;
        
        // Pulsing scale + lekki obrót
        const t = Date.now() / 300;
        this.sprite.scale.set(1 + Math.sin(t) * 0.12);
        this.sprite.rotation += 0.015;
        
        const age = Date.now() - this.bornAt;
        if (age > Magnet.LIFETIME_MS - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.4;
            this.sprite.alpha = blink;
        }
        
        if (age > Magnet.LIFETIME_MS) {
            this.destroy();
        }
    }
    
    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        // Czerwono-szare iskry
        effects.spawnEnemyHitSparks(this.x, this.y, 0xe74c3c);
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