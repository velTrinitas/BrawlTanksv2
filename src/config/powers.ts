/**
 * Super powers config — PROG-F7a: REGISTRY PATTERN (rule .claude/rules/super-powers.md §1).
 *
 * Kazda moc = PowerDef z pelna definicja zachowania (onActivate/onTick/onEnd).
 * PowerSystem WYKONUJE definicje — zero `if (id === 'aura')` w silniku. Dodanie mocy
 * w F7b = wpis w POWERS + i18n, NIE nowa galaz if w main.ts/PowerSystem.
 *
 * Podzial odpowiedzialnosci (swiadomy, zeby registry nie bylo wydmuszka):
 *  - onActivate(ctx) robi WSZYSTKO co moc robi sama: stan, efekty, notif, audio, freeze wrogow.
 *  - ActivationResult wraca do main.ts TYLKO z tym, co musi przejsc przez petle gry
 *    (cele mega bomby => kill-path z registerKill/drop/combo NALEZY do petli, nie do configu).
 *
 * Historia: v0.5 per-super cooldowns; v0.46.0 MEGA_BOMB damage x100; F7a registry + loadout.
 */

import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { EffectsManager } from '../rendering/Effects';
import type { PowerSystem } from '../systems/PowerSystem';
import type { TranslationKey } from '../i18n/i18n';
import type { ScenarioId } from '../types/Scenario';
import { t } from '../i18n/i18n';

export type PowerId = 'aura' | 'megaBomb' | 'freeze';

/** Loadout gracza: 2 sloty (GARAZ). null = pusty slot (nie powinno sie zdarzyc po normalizacji). */
export type LoadoutPair = readonly [PowerId | null, PowerId | null];

/** Domyslny loadout (legacy default = aura pierwsza; bomba jako druga — instant, czytelna). */
export const DEFAULT_LOADOUT: LoadoutPair = ['aura', 'megaBomb'];

/**
 * Kontekst wstrzykiwany do onActivate/onEnd — waskie typy strukturalne, zeby config
 * nie ciagnal runtime-owych zaleznosci (import type => zero cykli).
 */
export interface PowerActivationCtx {
    player: Player;
    enemies: Enemy[];
    effects: EffectsManager;
    audio: { playSuperActivate(powerId: PowerId): void };
    hud: { addNotif(text: string, color: string): void };
    /** System wykonujacy definicje — moc ustawia przez niego stan czasowy (beginTimedEffect). */
    system: PowerSystem;
}

/**
 * Result aktywacji — kontrakt zwrotny do main.ts. TYLKO to, co musi wrocic do petli gry.
 */
export interface ActivationResult {
    activated: boolean;
    powerId?: PowerId;
    /** Mega Bomb: cele do kill-path w main.ts (registerKill/score/drop/multi-kill/victory). */
    megaBombTargets?: Enemy[];
}

export interface PowerDef {
    id: PowerId;
    /** Legacy display name (canvas HUD desktop). DOM UI uzywa labelKey przez t(). */
    name: string;
    /** Etykieta i18n (typowana zmienna TranslationKey — kompiluje sie, wzorzec quests.ts). */
    labelKey: TranslationKey;
    emoji: string;
    color: number;
    cooldownMs: number;
    /** Czas trwania efektu w klatkach (0 = instant). */
    durationFrames: number;
    /**
     * Prog trofeow odblokowania na Szlaku. F7a: wszystkie 3 obecne moce = 0 (kazdy ma je
     * od startu — zablokowanie czegos, co gracze maja dzis, byloby regresja). Pierwsze
     * realne odblokowanie = pierwsza NOWA moc w F7b.
     */
    unlockAtTrophies: number;
    /** Pelne zachowanie aktywacji (stan + efekty + audio + notif). */
    onActivate: (ctx: PowerActivationCtx) => ActivationResult;
    /** Per-frame podczas trwania efektu (np. rysowanie tarczy aury). */
    onTick?: (system: PowerSystem, player: Player) => void;
    /** Koniec efektu czasowego (sprzatanie + feedback). */
    onEnd?: (system: PowerSystem, player: Player, effects: EffectsManager) => void;
}

/**
 * Mega Bomb stats.
 * v0.46.0: damage x100 (8 -> 800). blastRadius to dystans, NIETKNIETY.
 */
export const MEGA_BOMB_CONFIG = {
    blastRadius: 250,
    damage: 800,
};

// ── REJESTR (F7a: trzy obecne moce przeniesione 1:1 — wartosci bez zmian) ────
export const POWERS: Record<PowerId, PowerDef> = {
    aura: {
        id: 'aura',
        name: 'Aura',
        labelKey: 'power.aura',
        emoji: '🛡️',
        color: 0xffdd00,
        cooldownMs: 30000,       // v4.48: 30s
        durationFrames: 480,     // 8s (v4.48 mialo 5s — zachowujemy buff)
        unlockAtTrophies: 0,
        onActivate: (ctx) => {
            ctx.system.beginTimedEffect('aura');
            ctx.hud.addNotif(t('hud.shieldActive'), '#ffdd00');
            ctx.effects.shake(4, 6);
            ctx.audio.playSuperActivate('aura');
            return { activated: true, powerId: 'aura' };
        },
        onTick: (system, player) => system.auraTick(player.x, player.y),
        onEnd: (system, player, effects) => {
            system.auraHide();
            effects.spawnEnemyHitSparks(player.x, player.y, 0xffdd00);
        },
    },
    megaBomb: {
        id: 'megaBomb',
        name: 'Bomba',
        labelKey: 'power.megaBomb',
        emoji: '💣',
        color: 0xff4400,
        cooldownMs: 20000,       // v4.48: 20s
        durationFrames: 0,       // instant
        unlockAtTrophies: 0,
        onActivate: (ctx) => {
            // Instant — znajdz wrogow w radiusie. Kill-path (damage/score/drop) robi main.ts.
            const blastR2 = MEGA_BOMB_CONFIG.blastRadius * MEGA_BOMB_CONFIG.blastRadius;
            const targets = ctx.enemies.filter(e => {
                if (!e.active) return false;
                const dx = e.x - ctx.player.x;
                const dy = e.y - ctx.player.y;
                return (dx * dx + dy * dy) < blastR2;
            });
            ctx.effects.spawnMegaBomb(ctx.player.x, ctx.player.y);
            ctx.hud.addNotif(t('hud.megaBombHit', { count: targets.length }), '#ff4400');
            ctx.audio.playSuperActivate('megaBomb');
            return { activated: true, powerId: 'megaBomb', megaBombTargets: targets };
        },
    },
    freeze: {
        id: 'freeze',
        name: 'Mróz',
        labelKey: 'power.freeze',
        emoji: '❄️',
        color: 0x66ddff,
        cooldownMs: 25000,       // v4.48: 25s
        durationFrames: 300,     // 5s
        unlockAtTrophies: 0,
        onActivate: (ctx) => {
            ctx.system.beginTimedEffect('freeze');
            // freezeUntil PUBLICZNE na systemie — fix v0.87.1: wrogowie spawnowani PODCZAS
            // freeze sa mrozeni do tego samego czasu (main.ts czyta system.freezeUntil).
            const freezeUntil = Date.now() + (POWERS.freeze.durationFrames / 60) * 1000;
            ctx.system.freezeUntil = freezeUntil;
            for (const enemy of ctx.enemies) {
                if (enemy.active) enemy.freeze(freezeUntil);
            }
            ctx.effects.spawnFreezeOverlay(300);
            ctx.hud.addNotif(t('hud.freezeAll'), '#66ddff');
            ctx.effects.shake(3, 8);
            ctx.audio.playSuperActivate('freeze');
            return { activated: true, powerId: 'freeze' };
        },
    },
};

/** Kolejnosc wyswietlania (GARAZ picker). */
export const POWER_ORDER: readonly PowerId[] = ['aura', 'megaBomb', 'freeze'];

export function getPowerDef(id: string): PowerDef | undefined {
    return (POWERS as Record<string, PowerDef>)[id];
}

/**
 * Macierz dozwolonych mocy per scenariusz (rule §ZALEZNOSCI). null = pelna pula.
 * F7a: WSZEDZIE pelna pula — dzis gracz ma w meczu dostep do wszystkich 3 mocy
 * (scroll/long-press cycle), wiec zawezenie TERAZ byloby regresja vs live. Mechanizm
 * jest gotowy; CTF zawęzimy gdy dojda moce, ktore lamia jego mete (F7b+).
 */
export const ALLOWED_POWERS: Record<ScenarioId, readonly PowerId[] | null> = {
    ktb: null,
    ctf: null,
    castle: null,
    save_king: null,
};

/**
 * Loadout przefiltrowany pod scenariusz + walidacja id. Niedozwolony/nieznany slot
 * dostaje pierwsza dozwolona moc spoza drugiego slotu (gracz NIGDY nie wchodzi w mecz
 * z pustym przyciskiem). Czysta funkcja — testowalna.
 */
export function resolveLoadoutForMatch(loadout: LoadoutPair, scenario: ScenarioId): [PowerId, PowerId] {
    const allowed = ALLOWED_POWERS[scenario] ?? null;
    const pool = (allowed ?? POWER_ORDER).filter(id => !!getPowerDef(id));
    const ok = (id: PowerId | null): id is PowerId => !!id && !!getPowerDef(id) && pool.includes(id);

    let a = ok(loadout[0]) ? loadout[0] : null;
    let b = ok(loadout[1]) ? loadout[1] : null;
    if (a === b) b = null; // duplikat (zmajstrowany zapis) => drugi slot do uzupelnienia
    if (a === null) a = pool.find(id => id !== b) ?? pool[0];
    if (b === null) b = pool.find(id => id !== a) ?? pool[0];
    return [a, b];
}

/**
 * Pickup config (gem, magnet).
 * UWAGA: gemValue zostaje, ale w Etapie 1 gemy NIE laduja super powers.
 * W Etapie 2 laduja super-shot broni.
 *
 * v0.46.0: gemValue NIETKNIETE (to score, nie HP/DMG).
 */
export const PICKUP_CONFIG = {
    gemValue: 1,
    gemLifetimeMs: 20000,
    gemAutoCollectRadius: 35,
    gemsPerNormalEnemy: 1,
    gemsPerBoss: 5,
    gemsPerMegaBoss: 20,

    magnetSpawnIntervalFrames: 900,
    magnetMaxOnMap: 1,
    magnetActiveDurationMs: 5000,
    magnetAttractSpeed: 6,
    magnetAttractRange: 400,
};
