import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import { POWERS, AURA_CONFIG, CHARGE_CONFIG, type PowerId } from '../config/powers';

/**
 * Power System z charges (hotfix v0.4b).
 * - Zbieranie 10 gemów → +3 charges
 * - Każda aktywacja = -1 charge
 * - Scroll wybór super (tylko implemented można wybrać)
 * - PPM lub SPACE = aktywacja
 */
export class PowerSystem {
    public selectedPowerId: PowerId = 'aura'; // wybór gracza
    public charges: number = 0;                 // ile zostało użyć
    public gemsSinceLastCharge: number = 0;     // licznik do +3
    
    public isActive: boolean = false;
    public framesLeft: number = 0;
    public activePowerId: PowerId | null = null; // który power aktualnie aktywny
    
    // Aura wizualne
    private auraGfx: PIXI.Graphics;
    private auraTickFrames: number = 0;
    
    // Magnet
    public magnetActive: boolean = false;
    public magnetEndTime: number = 0;
    
    constructor(worldContainer: PIXI.Container) {
        this.auraGfx = new PIXI.Graphics();
        this.auraGfx.visible = false;
        this.auraGfx.zIndex = 400;
        worldContainer.addChild(this.auraGfx);
    }
    
    /**
     * Zarejestruj zebrany gem. Co 10 gemów → +3 charges.
     */
    onGemCollected(): void {
        this.gemsSinceLastCharge++;
        if (this.gemsSinceLastCharge >= CHARGE_CONFIG.gemsPerChargeTrigger) {
            this.gemsSinceLastCharge = 0;
            this.charges = Math.min(CHARGE_CONFIG.maxCharges, this.charges + CHARGE_CONFIG.chargesPerTrigger);
            return; // sygnał że dostał charges (caller może pokazać notyfikację)
        }
    }
    
    /**
     * PowerCube — instant +50% od triggera (= 5 gemów).
     */
    addPowerCubeBonus(): void {
        const gemsBonus = Math.ceil(CHARGE_CONFIG.gemsPerChargeTrigger * 0.5);
        this.gemsSinceLastCharge += gemsBonus;
        if (this.gemsSinceLastCharge >= CHARGE_CONFIG.gemsPerChargeTrigger) {
            this.gemsSinceLastCharge = 0;
            this.charges = Math.min(CHARGE_CONFIG.maxCharges, this.charges + CHARGE_CONFIG.chargesPerTrigger);
        }
    }
    
    /**
     * Przełącz selected power (scroll).
     * direction = 1 (right) lub -1 (left)
     */
    cycleSelected(direction: number): void {
        const order: PowerId[] = ['aura', 'megaBomb', 'freeze'];
        const idx = order.indexOf(this.selectedPowerId);
        let newIdx = (idx + direction + order.length) % order.length;
        // Tylko implemented można wybrać
        let attempts = 0;
        while (!POWERS[order[newIdx]].implemented && attempts < order.length) {
            newIdx = (newIdx + direction + order.length) % order.length;
            attempts++;
        }
        this.selectedPowerId = order[newIdx];
    }
    
    /**
     * Aktywacja aktualnie wybranego super powera.
     * @returns true jeśli aktywowane
     */
    activate(): boolean {
        if (this.isActive || this.charges <= 0) return false;
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
    
    /**
     * Progress do następnego charge trigger (0..1).
     */
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