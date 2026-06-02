import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import { POWERS, AURA_CONFIG, type PowerId } from '../config/powers';

/**
 * Stan + logika super powera. Jeden aktywny power per game (na razie tylko Aura).
 */
export class PowerSystem {
    public currentPowerId: PowerId = 'aura';
    public charge: number = 0;              // 0..chargeNeeded
    public maxCharge: number;
    public isActive: boolean = false;
    public framesLeft: number = 0;          // klatki pozostałe gdy aktywne
    
    // Aura wizualne (gdy aktywna)
    private auraGfx: PIXI.Graphics;
    private auraTickFrames: number = 0;
    
    // Magnet active state
    public magnetActive: boolean = false;
    public magnetEndTime: number = 0;
    
    constructor(worldContainer: PIXI.Container) {
        this.maxCharge = POWERS[this.currentPowerId].chargeNeeded;
        
        this.auraGfx = new PIXI.Graphics();
        this.auraGfx.visible = false;
        this.auraGfx.zIndex = 400; // nad efektami ale pod HUD
        worldContainer.addChild(this.auraGfx);
    }
    
    /**
     * Dodaje XP do super charge. Wywoływane gdy gracz zbiera gem / PowerCube.
     */
    addCharge(amount: number): void {
        if (this.isActive) return; // nie ładuje gdy aktywne
        this.charge = Math.min(this.maxCharge, this.charge + amount);
    }
    
    /**
     * Dodaje % charge (PowerCube).
     */
    addChargePercent(percent: number): void {
        if (this.isActive) return;
        this.charge = Math.min(this.maxCharge, this.charge + this.maxCharge * percent);
    }
    
    /**
     * Aktywuje super power (jeśli naładowany i nie aktywny).
     * @returns true jeśli aktywowane
     */
    activate(): boolean {
        if (this.isActive || this.charge < this.maxCharge) return false;
        
        this.isActive = true;
        this.framesLeft = POWERS[this.currentPowerId].durationFrames;
        this.charge = 0;
        this.auraGfx.visible = true;
        this.auraTickFrames = 0;
        return true;
    }
    
    /**
     * Aktywuje magnet.
     */
    activateMagnet(durationMs: number): void {
        this.magnetActive = true;
        this.magnetEndTime = Date.now() + durationMs;
    }
    
    /**
     * Sprawdza czy enemy znajduje się w zasięgu aury.
     */
    private isInAuraRange(enemy: Enemy, playerX: number, playerY: number): boolean {
        const dx = enemy.x - playerX;
        const dy = enemy.y - playerY;
        return (dx * dx + dy * dy) < (AURA_CONFIG.radius * AURA_CONFIG.radius);
    }
    
    /**
     * Update — wywoływane co klatkę w gameLoop.
     * Zwraca array enemies do których trzeba zadać damage tick (jeśli aura active i tick frame).
     */
    update(
        delta: number,
        player: Player,
        enemies: Enemy[],
        worldContainer: PIXI.Container,
        effects: EffectsManager
    ): Enemy[] {
        // Magnet timeout
        if (this.magnetActive && Date.now() >= this.magnetEndTime) {
            this.magnetActive = false;
        }
        
        const enemiesToDamage: Enemy[] = [];
        
        if (this.isActive) {
            this.framesLeft -= delta;
            this.auraTickFrames += delta;
            
            // Rysuj pierścień aury
            this.drawAuraRing(player.x, player.y);
            
            // Damage tick co AURA_CONFIG.tickEveryFrames
            if (this.auraTickFrames >= AURA_CONFIG.tickEveryFrames) {
                this.auraTickFrames = 0;
                for (const enemy of enemies) {
                    if (enemy.active && this.isInAuraRange(enemy, player.x, player.y)) {
                        enemiesToDamage.push(enemy);
                    }
                }
            }
            
            // Wygaśnięcie aury
            if (this.framesLeft <= 0) {
                this.isActive = false;
                this.auraGfx.visible = false;
                this.auraGfx.clear();
                effects.spawnExplosionAndWreck(player.x, player.y, POWERS.aura.color);
            }
        }
        
        return enemiesToDamage;
    }
    
    private drawAuraRing(playerX: number, playerY: number): void {
        this.auraGfx.x = playerX;
        this.auraGfx.y = playerY;
        this.auraGfx.clear();
        
        const t = Date.now() / 100;
        const pulse = 0.7 + Math.sin(t) * 0.3;
        const r = AURA_CONFIG.radius;
        
        // Outer ring
        this.auraGfx.lineStyle(6, 0xffdd00, pulse);
        this.auraGfx.drawCircle(0, 0, r);
        
        // Inner ring (cieńszy)
        this.auraGfx.lineStyle(2, 0xffffaa, pulse * 0.7);
        this.auraGfx.drawCircle(0, 0, r - 8);
        
        // Pulsating fill (semi-transparent)
        this.auraGfx.beginFill(0xffaa00, 0.08 * pulse);
        this.auraGfx.drawCircle(0, 0, r);
        this.auraGfx.endFill();
        
        // Rotujące "iskry" na obwodzie
        const sparkCount = 8;
        const baseRot = Date.now() / 200;
        for (let i = 0; i < sparkCount; i++) {
            const a = baseRot + (i / sparkCount) * Math.PI * 2;
            const sx = Math.cos(a) * r;
            const sy = Math.sin(a) * r;
            this.auraGfx.beginFill(0xffffff, pulse);
            this.auraGfx.drawCircle(sx, sy, 3);
            this.auraGfx.endFill();
        }
    }
    
    getChargePercent(): number {
        return this.charge / this.maxCharge;
    }
    
    isReady(): boolean {
        return this.charge >= this.maxCharge && !this.isActive;
    }
    
    reset(): void {
        this.charge = 0;
        this.isActive = false;
        this.framesLeft = 0;
        this.magnetActive = false;
        this.magnetEndTime = 0;
        this.auraGfx.visible = false;
        this.auraGfx.clear();
    }
}