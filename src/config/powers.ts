/**
 * Super powers config. Pure data, no logic.
 * W Sesji 4A wprowadzamy tylko Aura. W 4B dorzucimy Mega Bomb + Freeze.
 */

export type PowerId = 'aura' | 'megaBomb' | 'freeze';

export interface PowerConfig {
    id: PowerId;
    name: string;
    emoji: string;
    color: number;          // hex tint dla HUD i efektów
    durationFrames: number; // ile klatek aktywne (60 = 1s)
    chargeNeeded: number;   // ile XP do naładowania (1 gem = 1 XP)
    description: string;
}

export const POWERS: Record<PowerId, PowerConfig> = {
    aura: {
        id: 'aura',
        name: 'Aura',
        emoji: '☄️',
        color: 0xffdd00,
        durationFrames: 480,  // 8 sekund
        chargeNeeded: 100,
        description: 'Pierścień ognia zadaje obrażenia wrogom wokół ciebie przez 8s',
    },
    megaBomb: {
        id: 'megaBomb',
        name: 'Mega Bomba',
        emoji: '💣',
        color: 0xff4400,
        durationFrames: 30,
        chargeNeeded: 100,
        description: '[Sesja 4B] AoE wybuch zabija wszystkich w promieniu 250px',
    },
    freeze: {
        id: 'freeze',
        name: 'Mróz',
        emoji: '❄️',
        color: 0x66ddff,
        durationFrames: 240,
        chargeNeeded: 100,
        description: '[Sesja 4B] Zamraża wszystkich wrogów na 4s',
    },
};

/**
 * Aura specific stats — tylko ten power, reszta w Sesji 4B.
 */
export const AURA_CONFIG = {
    radius: 150,            // promień działania
    tickEveryFrames: 30,    // co ile klatek robi damage tick (30 = co 0.5s)
    damagePerTick: 2,       // ile damage per tick
};

/**
 * Pickup spawning config.
 */
export const PICKUP_CONFIG = {
    // Gems
    gemValue: 1,                       // 1 gem = 1 XP
    gemLifetimeMs: 20000,              // znika po 20s
    gemAutoCollectRadius: 35,          // auto-pickup gdy gracz w tym promieniu
    gemsPerNormalEnemy: 1,
    gemsPerBoss: 5,
    gemsPerMegaBoss: 20,
    
    // Magnet
    magnetSpawnIntervalFrames: 1500,   // co ~25s
    magnetMaxOnMap: 1,
    magnetActiveDurationMs: 5000,      // 5s przyciąga wszystkie gems
    magnetAttractSpeed: 8,
    
    // PowerCube
    powerCubeSpawnIntervalFrames: 1800, // co ~30s
    powerCubeMaxOnMap: 1,
    powerCubeChargePercent: 0.5,        // +50% super charge
};