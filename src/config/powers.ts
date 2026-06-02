/**
 * Super powers config + pad config.
 * Hotfix v0.4b: usunięty PowerCube (zastąpiony PowerHoverPad jako część mapy).
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
    tickEveryFrames: 30,
    damagePerTick: 2,
};

/**
 * Pickup config (gem, magnet — PowerCube usunięty).
 */
export const PICKUP_CONFIG = {
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
    magnetAttractSpeed: 6,
    magnetAttractRange: 400,
};