import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import { POWERS, MEGA_BOMB_CONFIG, type PowerId } from '../config/powers';

/**
 * Result aktywacji super powera — main.ts używa do triggers efektów + damage.
 */
export interface ActivationResult {
    activated: boolean;
    powerId?: PowerId;
    // Mega Bomb: enemies do zaaplikowania damage
    megaBombTargets?: Enemy[];
    // Freeze: enemies do zamrożenia
    freezeUntil?: number;
}

/**
 * Super power system z per-super cooldowns (zgodne z v4.48).
 * Brak charges — supery dostępne od początku, ograniczone tylko cooldownami.
 */
export class PowerSystem {
    public selectedPowerId: PowerId = 'aura';
    
    /** Date.now() timestamps gdy cooldown wygasa per super */
    public powerCooldowns: Record<PowerId, number> = {
        aura: 0,
        megaBomb: 0,
        freeze: 0,
    };
    
    /** Aktualnie aktywny super (lub null) */
    public activePowerId: PowerId | null = null;
    public framesLeft: number = 0;
    
    // Aura shield visual
    private auraGfx: PIXI.Graphics;
    
    // Magnet (osobna mechanika od super powers)
    public magnetActive: boolean = false;
    public magnetEndTime: number = 0;
    
    constructor(worldContainer: PIXI.Container) {
        this.auraGfx = new PIXI.Graphics();
        this.auraGfx.visible = false;
        this.auraGfx.zIndex = 400;
        worldContainer.addChild(this.auraGfx);
    }
    
    /**
     * Cycle wybór super powera (scroll).
     */
    cycleSelected(direction: number): void {
        const order: PowerId[] = ['aura', 'megaBomb', 'freeze'];
        const idx = order.indexOf(this.selectedPowerId);
        const newIdx = (idx + direction + order.length) % order.length;
        this.selectedPowerId = order[newIdx];
    }
    
    /**
     * Czy wybrany super jest gotowy do aktywacji?
     */
    canActivate(id: PowerId = this.selectedPowerId): boolean {
        if (this.activePowerId !== null) return false; // jakiś inny super aktywny
        return Date.now() >= this.powerCooldowns[id];
    }
    
    /**
     * Cooldown progress 0..1 (0 = gotowy, 1 = pełny cooldown).
     */
    getCooldownProgress(id: PowerId): number {
        const power = POWERS[id];
        const remaining = this.powerCooldowns[id] - Date.now();
        if (remaining <= 0) return 0;
        return Math.min(1, remaining / power.cooldownMs);
    }
    
    /**
     * Pozostałe sekundy cooldownu dla super (lub 0 jeśli gotowy).
     */
    getCooldownSecondsLeft(id: PowerId): number {
        const remaining = this.powerCooldowns[id] - Date.now();
        return Math.max(0, remaining / 1000);
    }
    
    /**
     * Aktywacja wybranego super powera.
     * @param player gracz (potrzebny dla Mega Bomb/Freeze do referencji pozycji)
     * @param enemies lista wrogów (dla Mega Bomb damage + Freeze)
     */
    activate(player: Player, enemies: Enemy[]): ActivationResult {
        if (!this.canActivate()) {
            return { activated: false };
        }
        
        const id = this.selectedPowerId;
        const power = POWERS[id];
        
        console.log(`[PowerSystem] Activating ${id}, cooldown set for ${power.cooldownMs}ms`);
        
        // Ustaw cooldown TYLKO dla tego super
        this.powerCooldowns[id] = Date.now() + power.cooldownMs;
        
        if (id === 'aura') {
            this.activePowerId = 'aura';
            this.framesLeft = power.durationFrames;
            this.auraGfx.visible = true;
            return { activated: true, powerId: 'aura' };
        }
        
        if (id === 'megaBomb') {
            // Instant — znajdź wrogów w radiusie
            const blastR2 = MEGA_BOMB_CONFIG.blastRadius * MEGA_BOMB_CONFIG.blastRadius;
            const targets = enemies.filter(e => {
                if (!e.active) return false;
                const dx = e.x - player.x;
                const dy = e.y - player.y;
                return (dx * dx + dy * dy) < blastR2;
            });
            return { activated: true, powerId: 'megaBomb', megaBombTargets: targets };
        }
        
        if (id === 'freeze') {
            this.activePowerId = 'freeze';
            this.framesLeft = power.durationFrames;
            const freezeUntil = Date.now() + (power.durationFrames / 60) * 1000;
            return { activated: true, powerId: 'freeze', freezeUntil };
        }
        
        return { activated: false };
    }
    
    activateMagnet(durationMs: number): void {
        this.magnetActive = true;
        this.magnetEndTime = Date.now() + durationMs;
    }
    
    /**
     * Czy gracz aktualnie ma tarczę (invulnerability)?
     */
    get isInvulnerable(): boolean {
        return this.activePowerId === 'aura';
    }
    
    /**
     * Czy aktualnie freeze jest aktywny?
     */
    get isFreezeActive(): boolean {
        return this.activePowerId === 'freeze';
    }
    
    update(
        delta: number,
        player: Player,
        _enemies: Enemy[],
        _worldContainer: PIXI.Container,
        effects: EffectsManager
    ): void {
        if (this.magnetActive && Date.now() >= this.magnetEndTime) {
            this.magnetActive = false;
        }
        
        if (this.activePowerId === 'aura') {
            this.framesLeft -= delta;
            this.drawAuraShield(player.x, player.y);
            
            if (this.framesLeft <= 0) {
                this.activePowerId = null;
                this.auraGfx.visible = false;
                this.auraGfx.clear();
                effects.spawnEnemyHitSparks(player.x, player.y, 0xffdd00);
            }
        } else if (this.activePowerId === 'freeze') {
            this.framesLeft -= delta;
            
            if (this.framesLeft <= 0) {
                this.activePowerId = null;
            }
        }
    }
    
    /**
     * Visual tarczy (zamiast "ognisty pierścień") — wnętrze pulsujące, deflection-style.
     */
    private drawAuraShield(playerX: number, playerY: number): void {
        this.auraGfx.x = playerX;
        this.auraGfx.y = playerY;
        this.auraGfx.clear();
        
        const t = Date.now() / 100;
        const pulse = 0.7 + Math.sin(t) * 0.3;
        const r = 55; // tarcza bezpośrednio wokół gracza
        
        // Zewnętrzny pierścień
        this.auraGfx.lineStyle(4, 0xffdd00, pulse);
        this.auraGfx.drawCircle(0, 0, r);
        
        // Wewnętrzny ring (cieńszy)
        this.auraGfx.lineStyle(2, 0xffffaa, pulse * 0.5);
        this.auraGfx.drawCircle(0, 0, r - 6);
        
        // Subtelne wypełnienie (transparent shield)
        this.auraGfx.beginFill(0xffdd00, 0.05 * pulse);
        this.auraGfx.drawCircle(0, 0, r);
        this.auraGfx.endFill();
        
        // Heksagonalny pattern shield (segmenty)
        const segments = 6;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2 + Date.now() / 800;
            const sx = Math.cos(angle) * r;
            const sy = Math.sin(angle) * r;
            this.auraGfx.beginFill(0xffffff, pulse * 0.8);
            this.auraGfx.drawCircle(sx, sy, 2);
            this.auraGfx.endFill();
        }
    }
    
    /**
     * Pozostały czas aktywnego super w sekundach (do HUD).
     */
    getActiveSecondsLeft(): number {
        return this.framesLeft / 60;
    }
    
    reset(): void {
        this.powerCooldowns = { aura: 0, megaBomb: 0, freeze: 0 };
        this.activePowerId = null;
        this.framesLeft = 0;
        this.magnetActive = false;
        this.magnetEndTime = 0;
        this.auraGfx.visible = false;
        this.auraGfx.clear();
        this.selectedPowerId = 'aura';
    }
}