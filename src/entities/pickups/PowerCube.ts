import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';

/**
 * PowerCube pickup — rare. Daje natychmiastowe +50% super power charge.
 */

let _powerCubeTexture: PIXI.Texture | null = null;
function getPowerCubeTexture(): PIXI.Texture {
    if (_powerCubeTexture) return _powerCubeTexture;
    const cv = document.createElement('canvas');
    cv.width = 28; cv.height = 28;
    const ctx = cv.getContext('2d')!;
    
    // 3D-ish izometric cube — top + front + side faces
    // Top face (jasny żółty)
    ctx.fillStyle = '#ffdd44';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(14, 3);
    ctx.lineTo(24, 8);
    ctx.lineTo(14, 13);
    ctx.lineTo(4, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Front face (średni)
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(14, 13);
    ctx.lineTo(14, 25);
    ctx.lineTo(4, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Side face (ciemny)
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.moveTo(14, 13);
    ctx.lineTo(24, 8);
    ctx.lineTo(24, 20);
    ctx.lineTo(14, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Energy crackle (mała iskra w środku)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(14, 14, 2, 0, Math.PI * 2);
    ctx.fill();
    
    _powerCubeTexture = PIXI.Texture.from(cv);
    return _powerCubeTexture;
}

export class PowerCube {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    public radius: number = 16;
    private bornAt: number;
    private static readonly LIFETIME_MS = 18000;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.active = true;
        this.bornAt = Date.now();
        
        this.sprite = new PIXI.Sprite(getPowerCubeTexture());
        this.sprite.anchor.set(0.5);
        this.sprite.x = x;
        this.sprite.y = y;
        this.sprite.zIndex = y + 4;
        worldContainer.addChild(this.sprite);
    }
    
    update(_delta: number): void {
        if (!this.active) return;
        
        // Float up-down + slight rotation
        const t = Date.now() / 250;
        this.sprite.y = this.y + Math.sin(t) * 4;
        this.sprite.scale.set(1 + Math.sin(t * 1.3) * 0.08);
        
        const age = Date.now() - this.bornAt;
        if (age > PowerCube.LIFETIME_MS - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.4;
            this.sprite.alpha = blink;
        }
        
        if (age > PowerCube.LIFETIME_MS) {
            this.destroy();
        }
    }
    
    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        // Żółto-złote iskry
        effects.spawnEnemyHitSparks(this.x, this.y, 0xffdd00);
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