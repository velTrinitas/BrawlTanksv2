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
    shootIntervalMs: 1870,  // P5: 15% szybciej (bylo 2200)
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
    shootIntervalMs: 1000,  // P4: agresywniej (bylo 1400) + twin burst 2 w Enemy.ts = grozny finał
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
 * FAZA CTF F2 — straznik flagi (guard).
 *
 * Rola: orbituje wokol swojej flagi (PATROL), goni gracza w detRadius (CHASE),
 * sciga zlodzieja flagi (ALERT). Ruch NIE uzywa speedMin/speedMax — predkosc
 * liczona per klatke w CtfSystem wg formuly D2: (2.2 + esc*0.4) * (ALERT? 1.25)
 * * (esc>=2? 1.20) * difficultySpeedMult. speedMin/Max = 2.2 zostawione dla
 * spojnosci typu (Enemy konstruktor je losuje, guard branch ich nie czyta).
 * Statsy bojowe = ENEMY_NORMAL scale (D1). Tint pomaranczowy — w bake mode
 * tint nie dziala, wiec identyfikacje strażnika daje kolorowy badge flagi
 * (rysowany w Enemy dla guard configu).
 */
export const ENEMY_GUARD: EnemyConfig = {
    hp: 300,
    speedMin: 2.2,
    speedMax: 2.2,
    scale: 1.0,
    tint: 0xe67e22,
    dmg: 200,
    shootIntervalMs: 2200,  // baza; realny fire rate per klatke: 2200 - esc*300 (CtfSystem)
    bulletSpeed: 8,
    bulletDmg: 100,
    bulletColor: 0xffa040,
    scoreValue: 2,          // guard liczy sie jak regular kill (legacy 1:1)
};

/**
 * FAZA CTF F2 — super-boss pilnujacy flagi (3 sztuki, po jednym na flage).
 *
 * Legacy: normalne AI poscigu (isGuard=false), triple-spread (burst 3 w Enemy
 * dla isBoss), cooldown 800 ms, strzal dopiero z dist<400 (shootRangeOverride
 * w Enemy). Respawn 60 s po smierci na pozycji spawnu (D3). Tint 0x8e44ad.
 */
export const ENEMY_CTF_BOSS: EnemyConfig = {
    hp: 3000,
    speedMin: 1.0,
    speedMax: 1.8,
    scale: 1.45,
    tint: 0x8e44ad,
    dmg: 300,
    shootIntervalMs: 800,   // legacy CTF: cd 800 ms (agresywniejszy niz KTB boss)
    bulletSpeed: 7,
    bulletDmg: 200,
    bulletColor: 0xc78fff,
    scoreValue: 20,
};

/** FAZA CTF F2 — zasieg strzalu super-bossa CTF (legacy: dist<400). */
export const CTF_BOSS_SHOOT_RANGE = 400;

/**
 * Heart pickup config.
 * v0.46.0: healAmount x100 (spojne z Heart.ts instance value).
 */
export const HEART_CONFIG = {
    spawnIntervalFrames: 360, // co ~8.7s
    healAmount: 100,
    maxOnMap: 3,
};