import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import { POWERS, AURA_CONFIG, CHARGE_CONFIG, type PowerId } from '../config/powers';

export class PowerSystem {
    public selectedPowerId: PowerId = 'aura';
    public charges: number = 0;
    public gemsSinceLastCharge: number = 0;
    
    public isActive: boolean = false;
    public framesLeft: number = 0;
    public activePowerId: PowerId | null = null;
    
    private auraGfx: PIXI.Graphics;
    private auraTickFrames: number = 0;
    
    public magnetActive: boolean = false;
    public magnetEndTime: number = 0;
    
    constructor(worldContainer: PIXI.Container) {
        this.auraGfx = new PIXI.Graphics();
        this.auraGfx.visible = false;
        this.auraGfx.zIndex = 400;
        worldContainer.addChild(this.auraGfx);
    }
    
    onGemCollected(): void {
        this.gemsSinceLastCharge++;
        if (this.gemsSinceLastCharge >= CHARGE_CONFIG.gemsPerChargeTrigger) {
            this.gemsSinceLastCharge = 0;
            this.charges = Math.min(CHARGE_CONFIG.maxCharges, this.charges + CHARGE_CONFIG.chargesPerTrigger);
        }
    }
    
    cycleSelected(direction: number): void {
        const order: PowerId[] = ['aura', 'megaBomb', 'freeze'];
        const idx = order.indexOf(this.selectedPowerId);
        let newIdx = (idx + direction + order.length) % order.length;
        let attempts = 0;
        while (!POWERS[order[newIdx]].implemented && attempts < order.length) {
            newIdx = (newIdx + direction + order.length) % order.length;
            attempts++;
        }
        this.selectedPowerId = order[newIdx];
    }
    
    activate(): boolean {
        // Debug log diagnozujący punkt #1 z user feedback
        console.log('[PowerSystem] activate() called:', {
            isActive: this.isActive,
            charges: this.charges,
            selectedPowerId: this.selectedPowerId,
            implemented: POWERS[this.selectedPowerId].implemented,
        });
        
        if (this.isActive) return false;
        if (this.charges <= 0) return false;
        const power = POWERS[this.selectedPowerId];
        if (!power.implemented) return false;
        
        this.isActive = true;
        this.activePowerId = this.selectedPowerId;
        this.framesLeft = power.durationFrames;
        this.charges--;
        this.auraGfx.visible = true;
        this.auraTickFrames = 0;
        return true;
    }
    
    activateMagnet(durationMs: number): void {
        this.magnetActive = true;
        this.magnetEndTime = Date.now() + durationMs;
    }
    
    private isInAuraRange(enemy: Enemy, playerX: number, playerY: number): boolean {
        const dx = enemy.x - playerX;
        const dy = enemy.y - playerY;
        return (dx * dx + dy * dy) < (AURA_CONFIG.radius * AURA_CONFIG.radius);
    }
    
    update(
        delta: number,
        player: Player,
        enemies: Enemy[],
        _worldContainer: PIXI.Container,
        effects: EffectsManager
    ): Enemy[] {
        if (this.magnetActive && Date.now() >= this.magnetEndTime) {
            this.magnetActive = false;
        }
        
        const enemiesToDamage: Enemy[] = [];
        
        if (this.isActive && this.activePowerId === 'aura') {
            this.framesLeft -= delta;
            this.auraTickFrames += delta;
            
            this.drawAuraRing(player.x, player.y);
            
            if (this.auraTickFrames >= AURA_CONFIG.tickEveryFrames) {
                this.auraTickFrames = 0;
                for (const enemy of enemies) {
                    if (enemy.active && this.isInAuraRange(enemy, player.x, player.y)) {
                        enemiesToDamage.push(enemy);
                    }
                }
            }
            
            if (this.framesLeft <= 0) {
                this.isActive = false;
                this.activePowerId = null;
                this.auraGfx.visible = false;
                this.auraGfx.clear();
                effects.spawnExplosionAndWreck(player.x, player.y, 0xffdd00);
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
        
        this.auraGfx.lineStyle(6, 0xffdd00, pulse);
        this.auraGfx.drawCircle(0, 0, r);
        this.auraGfx.lineStyle(2, 0xffffaa, pulse * 0.7);
        this.auraGfx.drawCircle(0, 0, r - 8);
        this.auraGfx.beginFill(0xffaa00, 0.08 * pulse);
        this.auraGfx.drawCircle(0, 0, r);
        this.auraGfx.endFill();
        
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
    
    getGemProgress(): number {
        return this.gemsSinceLastCharge / CHARGE_CONFIG.gemsPerChargeTrigger;
    }
    
    isReady(): boolean {
        return this.charges > 0 && !this.isActive && POWERS[this.selectedPowerId].implemented;
    }
    
    reset(): void {
        this.charges = 0;
        this.gemsSinceLastCharge = 0;
        this.isActive = false;
        this.activePowerId = null;
        this.framesLeft = 0;
        this.magnetActive = false;
        this.magnetEndTime = 0;
        this.auraGfx.visible = false;
        this.auraGfx.clear();
        this.selectedPowerId = 'aura';
    }
}