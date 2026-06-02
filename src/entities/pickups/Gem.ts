import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';
import { PICKUP_CONFIG } from '../../config/powers';

/**
 * Gem pickup — zielony heksagonalny diamond.
 * v0.4c: +25% scale, ciągły obrót, większa lewitacja.
 */

let _gemTexture: PIXI.Texture | null = null;
function getGemTexture(): PIXI.Texture {
    if (_gemTexture) return _gemTexture;
    const cv = document.createElement('canvas');
    cv.width = 36; cv.height = 40;
    const ctx = cv.getContext('2d')!;
    
    const cx = 18, cy = 20;
    
    // Glow outline
    const glowGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 18);
    glowGrad.addColorStop(0, 'rgba(46,204,113,0.6)');
    glowGrad.addColorStop(0.6, 'rgba(46,204,113,0.2)');
    glowGrad.addColorStop(1, 'rgba(46,204,113,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, 36, 40);
    
    // Hexagon
    const r = 13;
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    
    ctx.fillStyle = '#1a6b3a';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
    
    const mainGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    mainGrad.addColorStop(0, '#5fdba0');
    mainGrad.addColorStop(0.5, '#2ecc71');
    mainGrad.addColorStop(1, '#27ae60');
    ctx.fillStyle = mainGrad;
    ctx.beginPath();
    const innerR = r - 1.5;
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + innerR * Math.cos(angle);
        const y = cy + innerR * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Facets (3D)
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(points[0][0], points[0][1]);
    ctx.lineTo(points[5][0], points[5][1]);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#0d4d28';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy - 7, 3, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    _gemTexture = PIXI.Texture.from(cv);
    return _gemTexture;
}

const BASE_SCALE = 1.25;        // v0.4c: +25% rozmiar
const ROTATION_SPEED = 0.008;   // v0.4c: continuous slow rotation
const FLOAT_AMPLITUDE = 5;      // v0.4c: większa lewitacja

export class Gem {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    public radius: number = 16;
    public value: number = PICKUP_CONFIG.gemValue;
    private bornAt: number;
    private baseY: number;
    
    public attracted: boolean = false;
    private vx: number = 0;
    private vy: number = 0;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x + (Math.random() - 0.5) * 30;
        this.y = y + (Math.random() - 0.5) * 30;
        this.baseY = this.y;
        this.active = true;
        this.bornAt = Date.now();
        
        this.sprite = new PIXI.Sprite(getGemTexture());
        this.sprite.anchor.set(0.5);
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.scale.set(BASE_SCALE);
        this.sprite.zIndex = this.y + 3;
        worldContainer.addChild(this.sprite);
    }
    
    update(delta: number, playerX: number, playerY: number): void {
        if (!this.active) return;
        
        // Float (lewitacja)
        const t = Date.now() / 250;
        const floatOffset = Math.sin(t + this.x * 0.01) * FLOAT_AMPLITUDE;
        
        // Continuous rotation
        this.sprite.rotation += ROTATION_SPEED * delta;
        
        // Pulse scale (na BASE_SCALE)
        const pulseScale = BASE_SCALE * (1 + Math.sin(t * 1.5) * 0.06);
        this.sprite.scale.set(pulseScale);
        
        // Magnet
        if (this.attracted) {
            const dx = playerX - this.x;
            const dy = playerY - this.baseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < PICKUP_CONFIG.magnetAttractRange && dist > 1) {
                this.vx = (dx / dist) * PICKUP_CONFIG.magnetAttractSpeed;
                this.vy = (dy / dist) * PICKUP_CONFIG.magnetAttractSpeed;
                this.x += this.vx * delta;
                this.baseY += this.vy * delta;
            }
        }
        
        this.sprite.x = this.x;
        this.sprite.y = this.baseY + floatOffset;
        
        const age = Date.now() - this.bornAt;
        if (age > PICKUP_CONFIG.gemLifetimeMs - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.3;
            this.sprite.alpha = blink;
        }
        
        if (age > PICKUP_CONFIG.gemLifetimeMs) this.destroy();
    }
    
    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        effects.spawnEnemyHitSparks(this.x, this.baseY, 0x2ecc71);
        this.destroy();
        return true;
    }
    
    destroy(): void {
        this.active = false;
        if (this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
        this.sprite.destroy();
    }
}