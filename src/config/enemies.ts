/**
 * Statystyki wrogów. Pure data, no logic.
 * Wartości pochodzą z v4.48 (Season 1).
 *
 * v0.46.0 HP/DMG Scale x100: hp + dmg + bulletDmg pomnozone x100.
 * NIETKNIETE: speed, scale, tint, shootIntervalMs, bulletSpeed, scoreValue
 * (scoreValue zostaje bo score formula sie nie zmienia -> score_version dalej 1).
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
    hp: 300,
    speedMin: 1.5,
    speedMax: 3.0,
    scale: 1.0,
    tint: 0xff4444,         // czerwony
    dmg: 200,               // collision damage
    shootIntervalMs: 1800,  // strzela co 1.8s
    bulletSpeed: 8,
    bulletDmg: 100,
    bulletColor: 0xff6644,
    scoreValue: 2,
};

export const ENEMY_BOSS: EnemyConfig = {
    hp: 3000,               // 10× zwykły
    speedMin: 1.0,
    speedMax: 1.8,
    scale: 1.45,
    tint: 0x7d3c98,         // fioletowy
    dmg: 300,
    shootIntervalMs: 2200,  // salwa co 2.2s
    bulletSpeed: 7,
    bulletDmg: 200,
    bulletColor: 0xc78fff,
    scoreValue: 20,
};

/**
 * Spawn rate config — wartości z v4.48 (linia 5585).
 * Difficulty na razie hardcoded 'normal'. Wprowadzimy 4 poziomy w późniejszej sesji.
 */
export const SPAWN_CONFIG = {
    diffBase: 150,           // klatki między spawnami (start)
    minSpawnFrames: 30,      // minimum (cap)
    timeScaling: 1,        // ile szybciej co sekundę
    maxEnemiesOnMap: 20,     // hard cap
    bossKillTrigger: 20,     // co ile killów spawn boss
    megaBossKillThreshold: 100, // ile regular killów do mega boss (3B)
};
/**
 * Mega Boss config — jeden raz na grę po 100 regular killach + wszyscy bossy martwi.
 * 3 fazy AI: rush (>60% HP) → strafe (30-60%) → flee+spread (<30%).
 */
export const ENEMY_MEGA_BOSS: EnemyConfig = {
    hp: 2000,
    speedMin: 2.0,
    speedMax: 2.8,
    scale: 2.0,
    tint: 0xf1c40f,         // złoty
    dmg: 400,               // collision damage większy
    shootIntervalMs: 1400,  // strzela częściej niż boss
    bulletSpeed: 8,
    bulletDmg: 200,
    bulletColor: 0xffdd44,
    scoreValue: 100,        // duża nagroda
};

/**
 * v0.58.0 Warstwa C2 — Armored Pursuit Vehicle (woz poscigowy).
 *
 * Spawnowany JEDNORAZOWO gdy reaktor osiagnie stan krytyczny (ecoCrimeActive),
 * wyjezdza z PoliceStation (helipad). NIE przez SpawnSystem — event-driven z main.ts.
 *
 * Charakter: napastliwy poscig. Szybszy niz wszyscy (3.2-4.0 vs normal 1.5-3.0,
 * megaboss 2.0-2.8). Karabin maszynowy: krotki shootIntervalMs (600ms) + burst 3
 * (logika burst w Enemy.ts dla isPursuit). Niski bulletDmg per pocisk (60) bo
 * DPS rozlozony na czeste salwy. scoreValue boss-tier (15) — twardy cel wart punktow.
 *
 * AI: strafe-dodge (4. sciezka w Enemy.update, isPursuit) — orbituje gracza na
 * idealnym dystansie ~200px (blizej niz megaboss 280, bo to poscig nie ostrozny boss),
 * z czestszymi unikami niz megaboss strafe.
 *
 * HP 500: powyzej normal (300), znacznie ponizej boss (3000). Twardszy od zwyklego
 * wroga (kilka trafien), ale nie boss-gabka. Decyzja Mariusza v0.58.0.
 */
export const ENEMY_PURSUIT: EnemyConfig = {
    hp: 500,
    speedMin: 3.2,
    speedMax: 4.0,
    scale: 1.0,            // v0.58.0 fix: rozmiar zwyklego czolgu przeciwnika (bylo 1.25)
    tint: 0x2c3e50,         // granatowy policyjny (pasuje do PoliceStation)
    dmg: 250,               // collision ciut wyzej niz normal (200)
    shootIntervalMs: 500,   // karabin maszynowy — szybkie salwy
    bulletSpeed: 9,         // szybsze niz normal (8)
    bulletDmg: 60,          // niski per-pocisk (burst 3 + czeste = DPS rozlozony)
    bulletColor: 0x4488ff,  // niebieski policyjny
    scoreValue: 15,         // boss-tier reward (normal=2, boss=20)
};

/**
 * Heart pickup config.
 * v0.46.0: healAmount x100 (spojne z Heart.ts instance value).
 */
export const HEART_CONFIG = {
    spawnIntervalFrames: 360, // co ~8.7s
    healAmount: 100,
    maxOnMap: 3,
};