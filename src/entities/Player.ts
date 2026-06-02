import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import { getBrawlerTextures } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';

interface KeysState {
    w: boolean; a: boolean; s: boolean; d: boolean;
}

const SUPER_SHOT_DURATION_MS = 5000;  // v4.48: 5s super-shot mode
const SUPER_MAX_CHARGES = 9;            // soft cap (3 cycles × 3 charges)
const SUPER_TINT = 0xc850ff;

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
    
    // === Super-shot state (v0.5 Etap 2) ===
    public superCharges: number = 0;
    public superActive: boolean = false;
    public superEndTime: number = 0;
    private superRingGfx: PIXI.Graphics;
    
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
        
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        
        // Super-shot ring (fioletowy, pulsujący gdy są charges)
        this.superRingGfx = new PIXI.Graphics();
        this.superRingGfx.visible = false;
        
        this.container.addChild(this.superRingGfx); // pod sprite'ami
        this.container.addChild(this.hull);
        this.container.addChild(this.turret);
        worldContainer.addChild(this.container);
    }
    
    takeDamage(amount: number, isInvulnerable: boolean = false): boolean {
        if (isInvulnerable) return false; // Aura tarcza blokuje wszystko
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
    
    // ==========================================
    // SUPER-SHOT API (v0.5 Etap 2)
    // ==========================================
    
    /**
     * Dodaj N charges (wywoływane po zebraniu 10 gemów).
     */
    addSuperCharge(amount: number): void {
        this.superCharges = Math.min(SUPER_MAX_CHARGES, this.superCharges + amount);
    }
    
    /**
     * Try to activate or continue super-shot mode (called per shoot).
     * AUTO-aktywacja (Q1🅰️): jeśli charges > 0 i super nie aktywny, włącz na 5s.
     * Jeśli super już aktywny, return true (kontynuuj).
     * @returns isSuperShot — czy ten strzał jest super
     */
    tryActivateOrContinueSuperShot(): boolean {
        const now = Date.now();
        
        // Sprawdź czy aktywny super wciąż trwa
        if (this.superActive && now < this.superEndTime) {
            return true;
        }
        
        // Super wygasł — odznacz
        if (this.superActive && now >= this.superEndTime) {
            this.superActive = false;
        }
        
        // Aktywuj nowy super jeśli są charges
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
            // Intensywny ring podczas super-shot (większy + mocniejszy pulse)
            const r = 38 + Math.sin(t * 1.5) * 3;
            this.superRingGfx.lineStyle(5, SUPER_TINT, pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.lineStyle(3, 0xffffff, pulse * 0.7);
            this.superRingGfx.drawCircle(0, 0, r - 6);
            this.superRingGfx.beginFill(SUPER_TINT, 0.08 * pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.endFill();
            
            // Iskry orbitujące
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
            // Idle ring (charges > 0 ale nie aktywne) — subtelny fioletowy
            const r = 35;
            this.superRingGfx.lineStyle(2.5, SUPER_TINT, pulse * 0.6);
            this.superRingGfx.drawCircle(0, 0, r);
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
        
        // Hull tint: turbo = pomarańczowy, super = fioletowy, normal = brak
        if (this.isSuperShotActive) {
            this.hull.tint = SUPER_TINT;
        } else if (this.hasSpeedBoost) {
            this.hull.tint = 0xffcc66;
        } else {
            this.hull.tint = 0xffffff;
        }
        
        // Super-shot: auto-dezaktywacja gdy czas wygasł
        if (this.superActive && Date.now() >= this.superEndTime) {
            this.superActive = false;
        }
        
        // Update fioletowego ringa
        this.updateSuperRing();
        
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