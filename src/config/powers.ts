/**
 * Super powers config — v0.5 (Sesja 4B Etap 1).
 * Refactor: per-super cooldowns, brak charges-as-cost, aura jako tarcza.
 *
 * v0.46.0 HP/DMG Scale x100: MEGA_BOMB_CONFIG.damage x100 + opis.
 * NIETKNIETE: PICKUP_CONFIG.gemValue (to score, formula bez zmian -> score_version 1).
 */

export type PowerId = 'aura' | 'megaBomb' | 'freeze';

export interface PowerConfig {
    id: PowerId;
    name: string;
    emoji: string;
    color: number;
    cooldownMs: number;        // czas regeneracji po użyciu
    durationFrames: number;    // czas trwania efektu (0 = instant)
    description: string;
    implemented: boolean;
}

export const POWERS: Record<PowerId, PowerConfig> = {
    aura: {
        id: 'aura',
        name: 'Aura',
        emoji: '🛡️',
        color: 0xffdd00,
        cooldownMs: 30000,       // v4.48: 30s
        durationFrames: 480,     // 8s u nas (v4.48 miało 5s — zachowujemy buff)
        description: 'Tarcza ochronna — blokuje wszystkie obrażenia przez 8s',
        implemented: true,
    },
    megaBomb: {
        id: 'megaBomb',
        name: 'Bomba',
        emoji: '💣',
        color: 0xff4400,
        cooldownMs: 20000,       // v4.48: 20s
        durationFrames: 0,       // instant
        description: 'AoE wybuch — 800 obrażeń w promieniu 250px',
        implemented: true,
    },
    freeze: {
        id: 'freeze',
        name: 'Mróz',
        emoji: '❄️',
        color: 0x66ddff,
        cooldownMs: 25000,       // v4.48: 25s
        durationFrames: 300,     // 5s
        description: 'Zamraża wszystkich wrogów na 5s',
        implemented: true,
    },
};

/**
 * Mega Bomb stats.
 * v0.46.0: damage x100 (8 -> 800). blastRadius to dystans, NIETKNIETY.
 */
export const MEGA_BOMB_CONFIG = {
    blastRadius: 250,
    damage: 800,
};

/**
 * Pickup config (gem, magnet).
 * UWAGA: gemValue zostaje, ale w Etapie 1 gemy NIE ładują super powers.
 * W Etapie 2 będą ładować super-shot broni.
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