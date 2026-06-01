/**
 * Statystyki wrogów. Pure data, no logic.
 * Wartości pochodzą z v4.48 (Season 1).
 */

export interface EnemyConfig {
    hp: number;
    speedMin: number;        // base random range min
    speedMax: number;        // base random range max
    scale: number;
    tint: number;            // hex color (PIXI format: 0xRRGGBB)
    dmg: number;             // damage od collision
    shootIntervalMs: number; // co ile strzela (0 = nie strzela)
    bulletSpeed: number;
    bulletDmg: number;
    bulletColor: number;
    scoreValue: number;      // ile pkt za zabicie
}

export const ENEMY_NORMAL: EnemyConfig = {
    hp: 3,
    speedMin: 1.5,
    speedMax: 3.0,
    scale: 1.0,
    tint: 0xff4444,         // czerwony
    dmg: 2,                 // collision damage
    shootIntervalMs: 1800,  // strzela co 1.8s
    bulletSpeed: 8,
    bulletDmg: 1,
    bulletColor: 0xff6644,
    scoreValue: 2,
};

export const ENEMY_BOSS: EnemyConfig = {
    hp: 30,                 // 10× zwykły
    speedMin: 1.0,
    speedMax: 1.8,
    scale: 1.45,
    tint: 0x7d3c98,         // fioletowy
    dmg: 3,
    shootIntervalMs: 2200,  // salwa co 2.2s
    bulletSpeed: 7,
    bulletDmg: 2,
    bulletColor: 0xc78fff,
    scoreValue: 20,
};

/**
 * Spawn rate config — wartości z v4.48 (linia 5585).
 * Difficulty na razie hardcoded 'normal'. Wprowadzimy 4 poziomy w późniejszej sesji.
 */
export const SPAWN_CONFIG = {
    diffBase: 120,           // klatki między spawnami (start)
    minSpawnFrames: 20,      // minimum (cap)
    timeScaling: 1.5,        // ile szybciej co sekundę
    maxEnemiesOnMap: 25,     // hard cap
    bossKillTrigger: 20,     // co ile killów spawn boss
    megaBossKillThreshold: 100, // ile regular killów do mega boss (3B)
};
/**
 * Mega Boss config — jeden raz na grę po 100 regular killach + wszyscy bossy martwi.
 * 3 fazy AI: rush (>60% HP) → strafe (30-60%) → flee+spread (<30%).
 */
export const ENEMY_MEGA_BOSS: EnemyConfig = {
    hp: 20,
    speedMin: 2.0,
    speedMax: 2.8,
    scale: 2.0,
    tint: 0xf1c40f,         // złoty
    dmg: 4,                 // collision damage większy
    shootIntervalMs: 1400,  // strzela częściej niż boss
    bulletSpeed: 8,
    bulletDmg: 2,
    bulletColor: 0xffdd44,
    scoreValue: 100,        // duża nagroda
};

/**
 * Heart pickup config.
 */
export const HEART_CONFIG = {
    spawnIntervalFrames: 522, // co ~8.7s
    healAmount: 1,
    maxOnMap: 3,
};