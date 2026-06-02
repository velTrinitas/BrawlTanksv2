/**
 * Super powers config. Pure data, no logic.
 * Hotfix: zgodne z v4.48 — 10 gemów = +3 charges, MEGA BOMB i FREEZE jako "soon".
 */

export type PowerId = 'aura' | 'megaBomb' | 'freeze';

export interface PowerConfig {
    id: PowerId;
    name: string;
    emoji: string;
    color: number;
    durationFrames: number;
    description: string;
    /** Czy zaimplementowane. false = wyświetlane ale niemożliwe do wyboru/aktywacji */
    implemented: boolean;
}

export const POWERS: Record<PowerId, PowerConfig> = {
    aura: {
        id: 'aura',
        name: 'Aura',
        emoji: '☄️',
        color: 0xffdd00,
        durationFrames: 480,  // 8 sekund (per charge use)
        description: 'Pierścień ognia zadaje obrażenia wrogom wokół ciebie przez 8s',
        implemented: true,
    },
    megaBomb: {
        id: 'megaBomb',
        name: 'Mega Bomba',
        emoji: '💣',
        color: 0xff4400,
        durationFrames: 30,
        description: '[Sesja 4B] AoE wybuch zabija wszystkich w promieniu 250px',
        implemented: false,
    },
    freeze: {
        id: 'freeze',
        name: 'Mróz',
        emoji: '❄️',
        color: 0x66ddff,
        durationFrames: 240,
        description: '[Sesja 4B] Zamraża wszystkich wrogów na 4s',
        implemented: false,
    },
};

/**
 * Charges system — zgodnie z v4.48.
 * Po 10 zebranych gemach gracz dostaje +3 charges (3 użycia super).
 */
export const CHARGE_CONFIG = {
    gemsPerChargeTrigger: 10,    // co 10 gemów
    chargesPerTrigger: 3,         // dostajesz +3 użycia
    maxCharges: 9,                // soft cap (przeciwko stacking)
};

/**
 * Aura specific stats.
 */
export const AURA_CONFIG = {
    radius: 150,
    tickEveryFrames: 30,
    damagePerTick: 2,
};

/**
 * Pickup config. ZMIANA HOTFIX: magnet wolniejszy i z mniejszym range.
 */
export const PICKUP_CONFIG = {
    // Gems (zielone, większe — hotfix)
    gemValue: 1,
    gemLifetimeMs: 20000,
    gemAutoCollectRadius: 35,
    gemsPerNormalEnemy: 1,
    gemsPerBoss: 5,
    gemsPerMegaBoss: 20,
    
    // Magnet — hotfix: range -25%, speed -25%
    magnetSpawnIntervalFrames: 1500,
    magnetMaxOnMap: 1,
    magnetActiveDurationMs: 5000,
    magnetAttractSpeed: 6,        // było 8, -25% = 6
    magnetAttractRange: 400,      // NOWE: max odległość przyciągania (gemy dalej niż to NIE są attracted)
    
    // PowerCube
    powerCubeSpawnIntervalFrames: 1800,
    powerCubeMaxOnMap: 1,
    powerCubeChargePercent: 0.5,
};