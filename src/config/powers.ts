/**
 * Super powers + pickup config.
 * v0.4c: magnetSpawnInterval 1500→900 (szybszy spawn, łatwiej go zobaczyć).
 */

export type PowerId = 'aura' | 'megaBomb' | 'freeze';

export interface PowerConfig {
    id: PowerId;
    name: string;
    emoji: string;
    color: number;
    durationFrames: number;
    description: string;
    implemented: boolean;
}

export const POWERS: Record<PowerId, PowerConfig> = {
    aura: {
        id: 'aura',
        name: 'Aura',
        emoji: '☄️',
        color: 0xffdd00,
        durationFrames: 480,
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

export const CHARGE_CONFIG = {
    gemsPerChargeTrigger: 10,
    chargesPerTrigger: 3,
    maxCharges: 9,
};

export const AURA_CONFIG = {
    radius: 150,
    tickEveryFrames: 24,
    damagePerTick: 3,
};

export const PICKUP_CONFIG = {
    gemValue: 1,
    gemLifetimeMs: 20000,
    gemAutoCollectRadius: 35,
    gemsPerNormalEnemy: 1,
    gemsPerBoss: 5,
    gemsPerMegaBoss: 20,
    
    // Magnet — v0.4c: szybszy spawn (15s zamiast 25s)
    magnetSpawnIntervalFrames: 900,
    magnetMaxOnMap: 1,
    magnetActiveDurationMs: 5000,
    magnetAttractSpeed: 6,
    magnetAttractRange: 400,
};