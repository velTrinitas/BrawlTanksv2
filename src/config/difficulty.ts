/**
 * difficulty.ts — single source of truth dla balance modifiers per difficulty
 * (v0.50.0 Difficulty Balance v1).
 *
 * Naprawia exploit z v0.49.0: do tej pory `config.difficulty` wplywal TYLKO na
 * score mult (DIFFICULTY_SCORE_MULTIPLIERS w GameConfig.ts). Nightmare dawal
 * +40% score bez realnego ryzyka. Ten plik dorzuca PRAWDZIWE skalowanie trudnosci
 * — enemy stats, spawn rate, max enemies, boss thresholds.
 *
 * Wzorzec architektoniczny:
 * - `enemies.ts` (raw EnemyConfig + SPAWN_CONFIG) zostaje jako "Normal baseline".
 *   NIETKNIETE — istniejacy kod referencuje tamte stale.
 * - `SpawnSystem` w konstruktorze dostaje DifficultyModifiers i robi override:
 *   - SPAWN_CONFIG defaults: spawnIntervalFrames, timeScaling, maxEnemiesOnMap,
 *     bossKillTrigger, megaBossKillThreshold
 *   - EnemyConfig per spawn: hp x mult, dmg x mult, bulletDmg x mult, speed x mult
 * - `Enemy.ts` NIETKNIETE — dostaje juz przeskalowany config w konstruktorze.
 *
 * Co NIE jest skalowane przez ten plik:
 * - scoreValue (zostaje raw — to skalowanie robi GameSession.recomputeScore przez
 *   DIFFICULTY_SCORE_MULTIPLIERS, rownolegly system)
 * - shootIntervalMs (rate of fire wrogow — celowo nieskalowane, zbyt agresywne
 *   skalowanie ROF na Nightmare prowadziłoby do "bullet hell" niedostosowanego
 *   do audience 9-12)
 * - bulletSpeed (predkosc pociskow — celowo nieskalowane, szybsze pociski =
 *   trudne do unikniecia, niezamierzona kara dla mniej refleksowych graczy)
 * - HEART_CONFIG / PICKUP_CONFIG (pickup spawn rate — nieskalowane w v1, jezeli
 *   Nightmare okaze sie za trudny, mozna w v2 podbic intensywnosc heartow)
 */

import type { DifficultyId } from '../types/GameConfig';

export interface DifficultyModifiers {
    // ── Enemy stats (aplikowane do KAZDEGO spawn w SpawnSystem.scaleConfig) ──

    /** Mnoznik HP wszystkich wrogow (regular + boss + megaBoss). */
    enemyHpMult: number;

    /** Mnoznik damage (collision dmg + bullet dmg razem). */
    enemyDmgMult: number;

    /** Mnoznik speed (speedMin + speedMax). */
    enemySpeedMult: number;

    // ── Spawn config overrides (SpawnSystem zastepuje SPAWN_CONFIG defaults) ──

    /** Startowy spawn interval w klatkach (override SPAWN_CONFIG.diffBase). */
    spawnIntervalFrames: number;

    /** Ile klatek odejmuje sie per sekunda gameplay (override SPAWN_CONFIG.timeScaling). */
    timeScaling: number;

    /** Hard cap na ekranie (override SPAWN_CONFIG.maxEnemiesOnMap). */
    maxEnemiesOnMap: number;

    /** Co ile regular killow spawn boss (override SPAWN_CONFIG.bossKillTrigger). */
    bossKillTrigger: number;

    /** Ile regular killow do mega bossa (override SPAWN_CONFIG.megaBossKillThreshold). */
    megaBossKillThreshold: number;
}

/**
 * Tabela balansu Difficulty v1.
 *
 * Decyzje (sesja v0.50.0, zatwierdzone z Mariuszem):
 *
 * | Atrybut               | Easy  | Normal | Hard  | Nightmare |
 * |-----------------------|-------|--------|-------|-----------|
 * | enemyHpMult           | 0.85  | 1.0    | 1.10  | 1.20      |
 * | enemyDmgMult          | 0.85  | 1.0    | 1.10  | 1.20      |
 * | enemySpeedMult        | 1.0   | 1.0    | 1.10  | 1.20      |
 * | spawnIntervalFrames   | 175   | 150    | 125   | 100       |
 * | timeScaling           | 0.7   | 1.0    | 1.3   | 1.6       |
 * | maxEnemiesOnMap       | 15    | 20     | 25    | 30        |
 * | bossKillTrigger       | 25    | 20     | 17    | 15        |
 * | megaBossKillThreshold | 100   | 100    | 102   | 105       |
 *
 * Math verification — czas do mega bossa (base spawn rate, bez time scaling):
 *   Easy:      100 * 2.92s = ~4:52
 *   Normal:    100 * 2.50s = ~4:10
 *   Hard:      102 * 2.08s = ~3:33
 *   Nightmare: 105 * 1.67s = ~2:55
 *
 * +5 megaBossKillThreshold na Nightmare zapobiega kuriozalnemu "mega boss po 2min
 * bo spawny non-stop". Stabilizuje pacing mimo szybszego spawn rate.
 */
export const DIFFICULTY_MODIFIERS: Record<DifficultyId, DifficultyModifiers> = {
    easy: {
        enemyHpMult: 0.85,
        enemyDmgMult: 0.85,
        enemySpeedMult: 1.0,
        spawnIntervalFrames: 175,
        timeScaling: 0.7,
        maxEnemiesOnMap: 15,
        bossKillTrigger: 25,
        megaBossKillThreshold: 100,
    },
    normal: {
        enemyHpMult: 1.0,
        enemyDmgMult: 1.0,
        enemySpeedMult: 1.0,
        spawnIntervalFrames: 150,
        timeScaling: 1.0,
        maxEnemiesOnMap: 20,
        bossKillTrigger: 20,
        megaBossKillThreshold: 100,
    },
    hard: {
        enemyHpMult: 1.10,
        enemyDmgMult: 1.10,
        enemySpeedMult: 1.10,
        spawnIntervalFrames: 125,
        timeScaling: 1.3,
        maxEnemiesOnMap: 25,
        bossKillTrigger: 17,
        megaBossKillThreshold: 102,
    },
    nightmare: {
        enemyHpMult: 1.20,
        enemyDmgMult: 1.20,
        enemySpeedMult: 1.20,
        spawnIntervalFrames: 100,
        timeScaling: 1.6,
        maxEnemiesOnMap: 30,
        bossKillTrigger: 15,
        megaBossKillThreshold: 105,
    },
};

/**
 * Helper — zwraca DifficultyModifiers dla danego poziomu.
 * Uzywany w main.ts przy tworzeniu SpawnSystem (`new SpawnSystem(getDifficultyModifiers(config.difficulty))`).
 */
export function getDifficultyModifiers(difficulty: DifficultyId): DifficultyModifiers {
    return DIFFICULTY_MODIFIERS[difficulty];
}
