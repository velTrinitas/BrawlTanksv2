import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import { getBrawlerTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';

interface KeysState {
    w: boolean; a: boolean; s: boolean; d: boolean;
}

const SUPER_SHOT_DURATION_MS = 5000;
const SUPER_MAX_CHARGES = 9;
const SUPER_TINT = 0xc850ff;

// Target sizes dla external sprites (v0.8 Sesja 6: King AI sprite)
const TARGET_HULL_SIZE = 100;
const TARGET_TURRET_SIZE = 80;

export class Player {
    public brawler: Brawler;
    public x: number;
    public y: number;
    public baseSpeed: number;
    public maxHp: number;
    public hp: number;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    
    // Speed boost state (PowerPad)
    public speedBoostMult: number = 1;
    public speedBoostEnd: number = 0;
    
    // Super-shot state (v0.5 Etap 2)
    public superCharges: number = 0;
    public superActive: boolean = false;
    public superEndTime: number = 0;
    private superRingGfx: PIXI.Graphics;
    
    // Flag (v0.8 Sesja 6 init) — child hull, rotuje z hull
    private flagGfx: PIXI.Graphics;
    
    // Per-brawler aura (v0.8 Sesja 6 final) — child container, world space
    private auraGfx: PIXI.Graphics;
    
    private trackTimer: number = 0;
    private lastMoveAngle: number = 0;
    public isMoving: boolean = false;
    
    constructor(brawlerData: Brawler, worldContainer: PIXI.Container) {
        this.brawler = brawlerData;
        this.x = 800;
        this.y = 800;
        this.baseSpeed = brawlerData.speed;
        this.maxHp = brawlerData.hp;
        this.hp = this.maxHp;
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        
        const tex = getBrawlerTextures(this.brawler);
        
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        
        // Flag (child hull, za wieżyczką)
        this.flagGfx = new PIXI.Graphics();
        this.flagGfx.x = -15;
        this.flagGfx.y = 0;
        this.hull.addChild(this.flagGfx);
        this.drawFlag(this.brawler.flag ?? 'PL');
        
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        
        // External sprite scaling (v0.8 Sesja 6: King AI sprite)
        if (this.brawler.useExternalSprite) {
            this.applyUniformScale(this.hull, TARGET_HULL_SIZE);
            this.applyUniformScale(this.turret, TARGET_TURRET_SIZE);
        }
        
        // Super-shot ring
        this.superRingGfx = new PIXI.Graphics();
        this.superRingGfx.visible = false;
        
        // Aura (per-brawler glow, najniższa warstwa w container)
        this.auraGfx = new PIXI.Graphics();
        
        // Order: aura (bottom) -> super-shot ring -> hull -> turret
        this.container.addChild(this.auraGfx);
        this.container.addChild(this.superRingGfx);
        this.container.addChild(this.hull);
        this.container.addChild(this.turret);
        worldContainer.addChild(this.container);
    }
    
    /**
     * Skaluje sprite tak, aby max(width, height) = targetSize (aspect ratio preserved).
     * Obsługuje async loading PNG — jeśli texture nie załadowana, czeka na event 'loaded'.
     */
    private applyUniformScale(sprite: PIXI.Sprite, targetSize: number): void {
        const t = sprite.texture;
        if (t.baseTexture.valid && t.width > 1 && t.height > 1) {
            const maxDim = Math.max(t.width, t.height);
            sprite.scale.set(targetSize / maxDim);
        } else {
            t.baseTexture.once('loaded', () => {
                const maxDim = Math.max(sprite.texture.width, sprite.texture.height);
                sprite.scale.set(targetSize / maxDim);
            });
        }
    }
    
    /**
     * Rysuje flagę narodową na kadłubie (v0.8 Sesja 6 init).
     * Wspierane: PL, UA, DE, JP, FR. Domyślnie szara dla nieznanych.
     */
    drawFlag(countryCode: string): void {
        this.flagGfx.clear();
        
        const flagW = 14;
        const flagH = 9;
        const poleW = 1.5;
        const poleH = flagH + 4;
        const flagX = poleW / 2;
        
        // Drzewce brązowe
        this.flagGfx.beginFill(0x4a3520);
        this.flagGfx.drawRect(-poleW / 2, -poleH / 2, poleW, poleH);
        this.flagGfx.endFill();
        
        switch (countryCode.toUpperCase()) {
            case 'PL':
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagX, -flagH / 2, flagW, flagH / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xdc143c);
                this.flagGfx.drawRect(flagX, 0, flagW, flagH / 2);
                this.flagGfx.endFill();
                break;
            case 'UA':
                this.flagGfx.beginFill(0x0057b8);
                this.flagGfx.drawRect(flagX, -flagH / 2, flagW, flagH / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffd700);
                this.flagGfx.drawRect(flagX, 0, flagW, flagH / 2);
                this.flagGfx.endFill();
                break;
            case 'DE':
                this.flagGfx.beginFill(0x000000);
                this.flagGfx.drawRect(flagX, -flagH / 2, flagW, flagH / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xdd0000);
                this.flagGfx.drawRect(flagX, -flagH / 2 + flagH / 3, flagW, flagH / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffce00);
                this.flagGfx.drawRect(flagX, flagH / 2 - flagH / 3, flagW, flagH / 3);
                this.flagGfx.endFill();
                break;
            case 'JP':
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagX, -flagH / 2, flagW, flagH);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xbc002d);
                this.flagGfx.drawCircle(flagX + flagW / 2, 0, flagH / 3.5);
                this.flagGfx.endFill();
                break;
            case 'FR':
                this.flagGfx.beginFill(0x0055a4);
                this.flagGfx.drawRect(flagX, -flagH / 2, flagW / 3, flagH);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagX + flagW / 3, -flagH / 2, flagW / 3, flagH);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xef4135);
                this.flagGfx.drawRect(flagX + 2 * flagW / 3, -flagH / 2, flagW / 3, flagH);
                this.flagGfx.endFill();
                break;
            default:
                this.flagGfx.beginFill(0xaaaaaa);
                this.flagGfx.drawRect(flagX, -flagH / 2, flagW, flagH);
                this.flagGfx.endFill();
        }
        
        // Obwódka + złota kulka na czubku
        this.flagGfx.lineStyle(0.6, 0x000000, 0.7);
        this.flagGfx.drawRect(flagX, -flagH / 2, flagW, flagH);
        this.flagGfx.lineStyle(0);
        this.flagGfx.beginFill(0xd4af37);
        this.flagGfx.drawCircle(0, -poleH / 2 - 0.5, 1.3);
        this.flagGfx.endFill();
    }
    
    takeDamage(amount: number, isInvulnerable: boolean = false): boolean {
        if (isInvulnerable) return false;
        this.hp -= amount;
        return this.hp <= 0;
    }
    
    applyTurboBoost(durationMs: number, multiplier: number): void {
        this.speedBoostMult = multiplier;
        this.speedBoostEnd = Date.now() + durationMs;
    }
    
    get currentSpeed(): number {
        if (Date.now() > this.speedBoostEnd) {
            this.speedBoostMult = 1;
        }
        return this.baseSpeed * this.speedBoostMult;
    }
    
    get hasSpeedBoost(): boolean {
        return Date.now() < this.speedBoostEnd && this.speedBoostMult > 1;
    }
    
    addSuperCharge(amount: number): void {
        this.superCharges = Math.min(SUPER_MAX_CHARGES, this.superCharges + amount);
    }
    
    tryActivateOrContinueSuperShot(): boolean {
        const now = Date.now();
        if (this.superActive && now < this.superEndTime) return true;
        if (this.superActive && now >= this.superEndTime) this.superActive = false;
        if (!this.superActive && this.superCharges > 0) {
            this.superActive = true;
            this.superEndTime = now + SUPER_SHOT_DURATION_MS;
            this.superCharges--;
            return true;
        }
        return false;
    }
    
    get isSuperShotActive(): boolean {
        return this.superActive && Date.now() < this.superEndTime;
    }
    
    get superShotSecondsLeft(): number {
        if (!this.superActive) return 0;
        return Math.max(0, (this.superEndTime - Date.now()) / 1000);
    }
    
    private updateSuperRing(): void {
        const showRing = this.superCharges > 0 || this.isSuperShotActive;
        if (!showRing) {
            this.superRingGfx.visible = false;
            return;
        }
        this.superRingGfx.visible = true;
        this.superRingGfx.clear();
        const t = Date.now() / 100;
        const pulse = 0.6 + Math.sin(t) * 0.4;
        const isActive = this.isSuperShotActive;
        if (isActive) {
            const r = 38 + Math.sin(t * 1.5) * 3;
            this.superRingGfx.lineStyle(5, SUPER_TINT, pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.lineStyle(3, 0xffffff, pulse * 0.7);
            this.superRingGfx.drawCircle(0, 0, r - 6);
            this.superRingGfx.beginFill(SUPER_TINT, 0.08 * pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.endFill();
            const sparkCount = 6;
            const baseRot = Date.now() / 150;
            for (let i = 0; i < sparkCount; i++) {
                const angle = baseRot + (i / sparkCount) * Math.PI * 2;
                const sx = Math.cos(angle) * r;
                const sy = Math.sin(angle) * r;
                this.superRingGfx.beginFill(0xffffff, pulse);
                this.superRingGfx.drawCircle(sx, sy, 2.5);
                this.superRingGfx.endFill();
            }
        } else {
            const r = 35;
            this.superRingGfx.lineStyle(2.5, SUPER_TINT, pulse * 0.6);
            this.superRingGfx.drawCircle(0, 0, r);
        }
    }
    
    /**
     * Aura per-brawler. Dispatch po brawler.id.
     * v0.8 Sesja 6: tylko King ma aurę (gold royal glow).
     */
    private updateAura(): void {
        this.auraGfx.clear();
        
        if (this.brawler.id === 'king') {
            this.drawKingAura();
        }
    }
    
    /**
     * King aura: 2 gold pulse rings + crown halo + 4 orbiting sparkles.
     */
    private drawKingAura(): void {
        const time = Date.now();
        const pulse = 0.4 + Math.sin(time / 700) * 0.3;
        
        // Gold pulse ring 1 (zewnętrzny, grubszy)
        const r1 = 55 + Math.sin(time / 500) * 3;
        this.auraGfx.lineStyle(2.5, 0xffd700, pulse * 0.55);
        this.auraGfx.drawCircle(0, 0, r1);
        
        // Gold pulse ring 2 (wewnętrzny, cieńszy, jaśniejszy)
        const r2 = r1 - 8;
        this.auraGfx.lineStyle(1.5, 0xfff4a3, pulse * 0.35);
        this.auraGfx.drawCircle(0, 0, r2);
        
        // Crown glow halo — subtelny gold halo nad turret center
        const haloPulse = 0.3 + Math.sin(time / 800) * 0.2;
        this.auraGfx.beginFill(0xffd700, haloPulse * 0.12);
        this.auraGfx.drawCircle(0, 0, 30);
        this.auraGfx.endFill();
        
        // 4 sparkle dust orbitujące
        this.auraGfx.lineStyle(0);
        const sparkleCount = 4;
        for (let i = 0; i < sparkleCount; i++) {
            const angle = time / 1200 + (i / sparkleCount) * Math.PI * 2;
            const dist = 48 + Math.sin(time / 500 + i * 0.8) * 5;
            const sx = Math.cos(angle) * dist;
            const sy = Math.sin(angle) * dist;
            const sa = 0.5 + Math.sin(time / 280 + i * 1.7) * 0.5;
            
            // Outer glow
            this.auraGfx.beginFill(0xffd700, sa * 0.35);
            this.auraGfx.drawCircle(sx, sy, 4);
            this.auraGfx.endFill();
            // Inner spark (biały rdzeń)
            this.auraGfx.beginFill(0xffffff, sa);
            this.auraGfx.drawCircle(sx, sy, 1.5);
            this.auraGfx.endFill();
        }
    }
    
    update(keys: KeysState, mouseWorldX: number, mouseWorldY: number, buildings: CyberBuilding[], effects: EffectsManager): void {
        let dx = 0, dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        
        this.isMoving = false;
        
        if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            const len = Math.sqrt(dx * dx + dy * dy);
            const speed = this.currentSpeed;
            const nx = this.x + (dx / len) * speed;
            const ny = this.y + (dy / len) * speed;
            
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
            
            this.lastMoveAngle = Math.atan2(dy, dx);
            this.hull.rotation = this.lastMoveAngle;
        }
        
        this.container.x = this.x;
        this.container.y = this.y;
        this.turret.rotation = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);
        this.container.zIndex = this.y + 19;
        
        if (this.isSuperShotActive) {
            this.hull.tint = SUPER_TINT;
        } else if (this.hasSpeedBoost) {
            this.hull.tint = 0xffcc66;
        } else {
            this.hull.tint = 0xffffff;
        }
        
        if (this.superActive && Date.now() >= this.superEndTime) {
            this.superActive = false;
        }
        
        this.updateSuperRing();
        this.updateAura();  // 👈 NEW (v0.8 Sesja 6)
        
        if (this.isMoving) {
            this.trackTimer++;
            const trackInterval = this.hasSpeedBoost ? 2 : 4;
            if (this.trackTimer >= trackInterval) {
                this.trackTimer = 0;
                const perpX = -Math.sin(this.lastMoveAngle) * 12;
                const perpY = Math.cos(this.lastMoveAngle) * 12;
                effects.spawnTrackMark(this.x + perpX, this.y + perpY, this.lastMoveAngle);
                effects.spawnTrackMark(this.x - perpX, this.y - perpY, this.lastMoveAngle);
            }
        }
    }
}