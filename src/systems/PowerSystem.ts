import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import {
    POWERS, POWER_ORDER, getPowerDef,
    type PowerId, type LoadoutPair, type PowerActivationCtx, type ActivationResult,
} from '../config/powers';

export type { ActivationResult } from '../config/powers';

/**
 * Super power system — PROG-F7a: WYKONAWCA REJESTRU (zero if-chain po id mocy).
 *
 * Zachowanie mocy zyje w PowerDef (config/powers.ts): onActivate/onTick/onEnd.
 * Ten plik trzyma tylko stan wspolny: loadout (2 sloty), cooldowny per-moc,
 * aktywny efekt czasowy, wizual aury, magnes.
 *
 * KONTRAKT PUBLICZNY (petla gry na tym stoi — semantyka 1:1 z legacy):
 *  isInvulnerable / isFreezeActive / freezeUntil / magnetActive / activePowerId /
 *  framesLeft / getCooldownProgress / getCooldownSecondsLeft / getActiveSecondsLeft.
 *
 * Loadout wstrzykiwany w konstruktorze (system powstaje od nowa per mecz w startGame;
 * reset() nie istnieje — nie byl nigdzie wolany).
 */
export class PowerSystem {
    /** 2 sloty z GARAZU, rozwiazane pod scenariusz (resolveLoadoutForMatch w startGame). */
    public readonly loadout: readonly [PowerId, PowerId];

    /** Date.now() timestamps gdy cooldown wygasa per moc (klucze z rejestru). */
    public powerCooldowns: Record<PowerId, number>;

    /**
     * DESKTOP: slot wybrany scrollem — SPACJA/PPM odpala ten slot (feedback Mariusza:
     * scroll+PPM to pamiec miesniowa z legacy). Widoczny w HUD (strzalka), wiec NIE jest
     * ukrytym stanem — pasek HUD rysuje sie tylko na desktopie. Touch tego nie uzywa
     * (kazdy slot ma wlasny przycisk). Po kazdej aktywacji przeskakuje na uzyty slot.
     */
    public selectedSlot: 0 | 1 = 0;

    /** Aktualnie aktywny efekt czasowy (lub null). */
    public activePowerId: PowerId | null = null;
    public framesLeft: number = 0;
    /** Absolutny timestamp konca freeze — mrozenie wrogow spawnowanych PODCZAS (fix v0.87.1). */
    public freezeUntil: number = 0;

    // Aura shield visual
    private auraGfx: PIXI.Graphics;

    // Magnet (osobna mechanika od super powers)
    public magnetActive: boolean = false;
    public magnetEndTime: number = 0;

    constructor(worldContainer: PIXI.Container, loadout: readonly [PowerId, PowerId]) {
        this.loadout = loadout;
        this.powerCooldowns = Object.fromEntries(
            POWER_ORDER.map(id => [id, 0]),
        ) as Record<PowerId, number>;
        this.auraGfx = new PIXI.Graphics();
        this.auraGfx.visible = false;
        this.auraGfx.zIndex = 400;
        worldContainer.addChild(this.auraGfx);
    }

    /** Moc w danym slocie. */
    getSlotPower(slot: 0 | 1): PowerId {
        return this.loadout[slot];
    }

    /** Scroll na desktopie: przesun wybor slotu (przy 2 slotach = toggle; skaluje sie na 3+). */
    cycleSlot(direction: number): void {
        const n = this.loadout.length;
        this.selectedSlot = (((this.selectedSlot + direction) % n) + n) % n as 0 | 1;
    }

    /**
     * Czy moc jest gotowa do aktywacji? (cooldown minal + zaden efekt czasowy nie trwa —
     * blokada "jedna moc naraz" zostaje: dwa rownoczesne efekty to osobna decyzja balansowa.)
     */
    canActivate(id: PowerId): boolean {
        if (this.activePowerId !== null) return false;
        return Date.now() >= (this.powerCooldowns[id] ?? 0);
    }

    canActivateSlot(slot: 0 | 1): boolean {
        return this.canActivate(this.loadout[slot]);
    }

    /** Cooldown progress 0..1 (0 = gotowy, 1 = pelny cooldown). */
    getCooldownProgress(id: PowerId): number {
        const power = POWERS[id];
        const remaining = (this.powerCooldowns[id] ?? 0) - Date.now();
        if (remaining <= 0) return 0;
        return Math.min(1, remaining / power.cooldownMs);
    }

    /** Pozostale sekundy cooldownu (lub 0 jesli gotowy). */
    getCooldownSecondsLeft(id: PowerId): number {
        const remaining = (this.powerCooldowns[id] ?? 0) - Date.now();
        return Math.max(0, remaining / 1000);
    }

    /** Wyzeruj cooldowny + aktywny efekt (tutorial / handoff do meczu — zamiast literalow w main.ts). */
    clearCooldowns(): void {
        for (const id of Object.keys(this.powerCooldowns) as PowerId[]) {
            this.powerCooldowns[id] = 0;
        }
        this.activePowerId = null;
        this.framesLeft = 0;
        this.auraHide();
    }

    /**
     * Aktywacja mocy ze slotu — wykonuje definicje z rejestru.
     * Efekty/notif/audio robi PowerDef.onActivate; wraca tylko to, co musi przejsc
     * przez petle gry (cele mega bomby).
     */
    activate(slot: 0 | 1, ctx: Omit<PowerActivationCtx, 'system'>): ActivationResult {
        const id = this.loadout[slot];
        if (!this.canActivate(id)) {
            return { activated: false };
        }
        const def = POWERS[id];
        console.log(`[PowerSystem] Activating ${id} (slot ${slot + 1}), cooldown ${def.cooldownMs}ms`);
        this.powerCooldowns[id] = Date.now() + def.cooldownMs;
        return def.onActivate({ ...ctx, system: this });
    }

    /**
     * Rozpocznij efekt czasowy mocy (wolane przez PowerDef.onActivate).
     * durationFrames bierze z rejestru — moc nie dubluje wlasnej stalej.
     */
    beginTimedEffect(id: PowerId): void {
        this.activePowerId = id;
        this.framesLeft = POWERS[id].durationFrames;
        if (id === 'aura') this.auraGfx.visible = true; // wizual aury zyje w tym systemie
    }

    activateMagnet(durationMs: number): void {
        this.magnetActive = true;
        this.magnetEndTime = Date.now() + durationMs;
    }

    /** Czy gracz aktualnie ma tarcze (invulnerability)? */
    get isInvulnerable(): boolean {
        return this.activePowerId === 'aura';
    }

    /** Czy aktualnie freeze jest aktywny? */
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

        // Generyczny tick efektu czasowego — zachowanie per-moc w PowerDef.onTick/onEnd.
        if (this.activePowerId !== null) {
            const def = getPowerDef(this.activePowerId);
            this.framesLeft -= delta;
            def?.onTick?.(this, player);
            if (this.framesLeft <= 0) {
                this.activePowerId = null;
                def?.onEnd?.(this, player, effects);
            }
        }
    }

    // ── Hooki wizualu aury (wolane przez PowerDef.onTick/onEnd — gfx jest prywatny) ──

    auraTick(playerX: number, playerY: number): void {
        this.drawAuraShield(playerX, playerY);
    }

    auraHide(): void {
        this.auraGfx.visible = false;
        this.auraGfx.clear();
    }

    /**
     * Visual tarczy (zamiast "ognisty pierscien") — wnetrze pulsujace, deflection-style.
     */
    private drawAuraShield(playerX: number, playerY: number): void {
        this.auraGfx.x = playerX;
        this.auraGfx.y = playerY;
        this.auraGfx.clear();

        const t = Date.now() / 100;
        const pulse = 0.7 + Math.sin(t) * 0.3;
        const r = 55; // tarcza bezposrednio wokol gracza

        // Zewnetrzny pierscien
        this.auraGfx.lineStyle(4, 0xffdd00, pulse);
        this.auraGfx.drawCircle(0, 0, r);

        // Wewnetrzny ring (cienszy)
        this.auraGfx.lineStyle(2, 0xffffaa, pulse * 0.5);
        this.auraGfx.drawCircle(0, 0, r - 6);

        // Subtelne wypelnienie (transparent shield)
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

    /** Pozostaly czas aktywnego super w sekundach (do HUD). */
    getActiveSecondsLeft(): number {
        return this.framesLeft / 60;
    }
}

export type { LoadoutPair };
