import type { CastleLaneId } from '../../maps/CastleMap';

/**
 * castleWaves.ts — dane scenariusza OBRON ZAMEK (F3): tuning + tabela 6 fal.
 * JEDEN plik = jeden tuning pass (jak progression.ts dla mocy). Wartosci to
 * propozycje do strojenia playtestem (Normal); liczby skaluje DifficultyModifiers.
 */

export const CASTLE_TUNING = Object.freeze({
    /** HP struktur (x100 int, NIE skalowane trudnoscia — skalowane sa obrazenia wrogow). */
    wallHp: 1400,
    gateHp: 1400,
    keepHp: 4000,
    /** Obrazenia struktur wg zrodla. */
    contactDmg: 30,
    contactCooldownMs: 3000,
    bossContactDmg: 200,
    bossContactCooldownMs: 2000,
    enemyBulletDmg: 15,
    taranDmg: 250,
    katapultaDmg: 120,
    katapultaSplashR: 90,
    katapultaPlayerDmg: 120,
    /** Odleglosc srodka wroga od AABB celu, przy ktorej liczy sie kontakt (po dojezdzie). */
    contactReach: 70,
    /** Fazy. */
    buildPhaseMs: 15000,
    firstWaveDelayMs: 12000, // F6: miejsce na 3 podpowiedzi intro
    respawnMs: 5000,
    spawnInvulMs: 3000,
    /** Naprawa w fazie budowy: % maxHp na sekunde, zasieg, minimalny wynik odbudowy. */
    repairPctPerSec: 0.08,
    repairRange: 110,
    /** P1: strzalka krawedziowa wylomu gasnie po tym czasie (ms). */
    breachArrowMs: 20000,
    rebuildCapPct: 0.4,
    /** Moc NAPRAWA: natychmiastowy % maxHp najblizszej czesci w zasiegu. */
    powerRepairPct: 0.30,
    powerRepairRange: 160,
    /** Sieger strzela do gracza tylko z bliska. */
    siegerAimPlayerRange: 260,
    /** Predkosc oblegajacych (legacy x1.25). */
    siegerSpeedMult: 1.25,
    /** Batch spawnu: ilu naraz z jednego lane'u, co ile ms. */
    batchSize: 3,
    batchIntervalMs: 4000,
    /** Cap jednoczesnych wrogow fal (mobile). */
    concurrentCap: 14,
    /** Wezel osiagniety (px) i anty-grind. */
    nodeReach: 40,
    stuckMoveMin: 8,
    stuckFrames: 90,
    /** AI oblezenia: commit celu (ms), promien "gracz broni tej strony", kara flankowania w score. */
    objectiveCommitMs: 6000,
    defendedRadius: 260,
    flankPenalty: 2.2,
    /** Re-ewaluacja celu (px kontra ms). */
    retargetMs: 500,
    /** Mega boss w fali 6: opoznienie i telegraf. */
    megaDelayMs: 20000,
    /** Bonusy (statyczne, po mnozniku trudnosci). */
    waveBonus: [30, 40, 50, 60, 80, 120] as readonly number[],
    earlyStartPerSec: 3,
    earlyStartMax: 45,
    endBonusKeepHalf: 50,
    endBonusGateIntact: 40,
    endBonusWallsHalf: 40,
    endBonusMega: 100,
    endBonusRepairs3: 20,
    trebuchetKillBonus: 40,
});

export type CastleRole = 'raider' | 'sieger' | 'taran' | 'katapulta' | 'trebuchet';

export interface CastleWaveDef {
    /** i18n key fragment: castle.wave.name.N */
    idx: number;
    sieger: number;
    raider: number;
    taran: number;
    katapulta: number;
    trebuchet: number;
    boss: number;
    mega: boolean;
    lanes: readonly CastleLaneId[];
    /** Lane'y maszyn (przypisanie w kolejnosci spawnu). */
    machineLanes: readonly CastleLaneId[];
}

export const CASTLE_WAVES: readonly CastleWaveDef[] = [
    { idx: 1, sieger: 8,  raider: 1, taran: 0, katapulta: 0, trebuchet: 0, boss: 0, mega: false, lanes: ['S', 'W'],           machineLanes: [] },
    { idx: 2, sieger: 10, raider: 2, taran: 1, katapulta: 0, trebuchet: 0, boss: 0, mega: false, lanes: ['S', 'E'],           machineLanes: ['S'] },
    { idx: 3, sieger: 11, raider: 3, taran: 1, katapulta: 2, trebuchet: 0, boss: 1, mega: false, lanes: ['N', 'E', 'S', 'W'], machineLanes: ['W', 'E', 'W'] },
    { idx: 4, sieger: 14, raider: 4, taran: 2, katapulta: 2, trebuchet: 0, boss: 1, mega: false, lanes: ['N', 'E', 'S', 'W'], machineLanes: ['N', 'W', 'E', 'S'] },
    { idx: 5, sieger: 18, raider: 5, taran: 3, katapulta: 2, trebuchet: 1, boss: 2, mega: false, lanes: ['N', 'E', 'S', 'W'], machineLanes: ['S', 'N', 'E', 'W', 'S', 'S'] },
    { idx: 6, sieger: 8,  raider: 3, taran: 2, katapulta: 1, trebuchet: 1, boss: 0, mega: true,  lanes: ['N', 'E', 'S', 'W'], machineLanes: ['E', 'W', 'N', 'S'] },
];

export const CASTLE_WAVES_TOTAL = CASTLE_WAVES.length;
