/**
 * queenTuning.ts — JEDYNE zrodlo liczb scenariusza SAVE THE QUEEN (wzorzec castleWaves.ts).
 *
 * Jeden tuning pass = jeden plik. Wszystkie wartosci to PROPOZYCJE z design doc v1
 * (2026-09-11) do playtestu. GameSession / QueenSystem / HUD czytaja STAD — zero
 * duplikatow literalnych (lekcja driftu endBonus* w Zamku).
 *
 * Trudnosc (decyzja 5): easy/normal/hard/nightmare skaluje napor wrogow + HP cegiel
 * (enemyHpMult), NIE zegar. Zegar staly 2:30.
 */

export type QueenPhaseId = 'calm' | 'siege' | 'panic';

export interface QueenPhaseDef {
    id: QueenPhaseId;
    /** faza trwa, dopoki zegar (ms pozostalych) > untilMs */
    untilMs: number;
    spawnIntervalFrames: number;
    cap: number;
    /** co ktory spawn to Budowniczy (0 = brak) */
    builderEvery: number;
    builderCap: number;
}

export const QUEEN_TUNING = Object.freeze({
    matchMs: 150_000,
    firstSpawnDelayMs: 8_000,
    spawnInvulMs: 5_000,     // Q6 (Mariusz): 5 s laski z widoczna AURA

    // wiezienie
    brickHp: 300,            // Normal (v4: mur 10x14 + skrzydla 3x5 = 168 slotow; v3 10x10 -> min droga 18 cegiel + 2 Zworniki ~22 s); x enemyHpMult
    keystoneHp: 600,         // tylko super / AoE / dynamit ("heavy")
    brickGemChance: 0.07,    // Q4.5 (Mariusz: "w murze nie moze spawnowac tyle gemu" -> -75% z 0.28)
    /** sloty minimalnej drogi = 2 rzedy bramy x 10 kol (w tym 2 Zworniki) — pasek drogi w HUD */
    pathSlots: 20,

    // Krolowa
    queenHeartEveryMs: 30_000,
    queenTouchPad: 8,        // AABB czolgu ∩ AABB Krolowej + 8 px (kontrakt padow K9)
    rescueFlourishMs: 2_500,
    capturedSeqMs: 1_800,
    capturedDeathSeqMs: 600,

    // (Budowniczowie USUNIECI w POLISH-1 — mur odrasta sam; tempo domurowania po odroscie:)
    repairPctPerSec: 0.16,
    // POLISH-1 (Mariusz 2026-09-14): mur ODRASTA SAM (Budowniczowie usunieci — chaos). Slot wraca po brickRegenMs
    // (telegraf duch cegly brickRegenTelegraphMs), z brickRegenHp i domurowuje sie repairPctPerSec/s.
    // Kalibracja: min droga 18 cegiel ~22 s czystego ognia => 25 s daje przejscie tunelem, ale odwrot juz zarasta.
    brickRegenMs: 25_000,
    brickRegenTelegraphMs: 2_000,
    brickRegenHp: 0.25,
    /** slot nie odrasta, gdy czolg gracza jest blizej niz tyle px (fair: nie zamurowujemy gracza) */
    brickRegenPlayerClear: 90,

    concurrentCap: 14,
    /** Q4.5: szpaler startowy w kolumnadzie (raiderzy) + boss — czekaja na gracza od 1. klatki */
    startRankRaiders: 5,
    startRankBoss: true,
    // Zlowroga Wieza (Q4.5)
    towerHp: 4000,
    towerFireMs: 750,
    towerTelegraphMs: 250,
    towerRange: 900,
    towerOrbSpeed: 7,
    towerOrbDmg: 45,
    towerOrbR: 13,
    towerScore: 200,          // Q4.6: ZERO gemow za wieze (Mariusz: "za duzo gemow")
    // Zloty Klucz + stalowe drzwi (Q4.6)
    keyPickupR: 46,
    doorTouchPad: 26,
    keyHintEveryMs: 4_000,
    /** ile s po pierwszym dotknieciu zamknietych drzwi HUD pokazuje strzalke do klucza (Czytelnosc dla 9-12 lat) */
    keyArrowAfterDoorTouch: true,
    /** Q4: ile ukrytych slotow dynamitu w froncie (worldRng, poza kolumna bramy) */
    dynamiteCount: 3,
    /** Q4: lawa — odstep miedzy iskrami przy kontakcie (ms) */
    lavaSparkMs: 250,
    /** Q3/Q6: dzielnik interwalu fazy => 1 raider co spawnIntervalFrames/batchSize */
    batchSize: 3,
    /** Q6: punkt spawnu nie blizej niz tyle px od gracza (fair: nikt nie wyjezdza "na glowie") */
    spawnMinDistFromPlayer: 380,

    // lawa / gejzery / dynamit (Q4)
    lavaDmgPerTick: 40, lavaTickMs: 500, lavaSlowMult: 0.5,
    geyserTelegraphMs: 1_200, geyserEveryMs: 4_000, geyserDmg: 150, geyserR: 90,
    dynamiteFuseMs: 1_500, dynamiteR: 120, dynamiteEnemyDmg: 300, dynamitePlayerDmg: 100, dynamitePlayerR: 80,

    phases: [
        // Q6: cap = tylko RAIDERZY (Budowniczowie liczeni osobno, builderCap); szpaler startowy = 6 => calm 9 daje ciagly doplyw
        { id: 'calm', untilMs: 90_000, spawnIntervalFrames: 220, cap: 9, builderEvery: 0, builderCap: 0 },
        { id: 'siege', untilMs: 30_000, spawnIntervalFrames: 140, cap: 12, builderEvery: 4, builderCap: 2 },
        { id: 'panic', untilMs: 0, spawnIntervalFrames: 90, cap: 14, builderEvery: 3, builderCap: 4 },
    ] as readonly QueenPhaseDef[],

    // wynik (prowizoryczny — ranking po 23.09)
    score: {
        brick: 1,             // floating "+1" za cegle (Sensoryka; do wyniku statyczny bonus 1)
        builder: 10,
        rescue: 150,
        timeBonusPerSec: 2,
        dynamiteChain: 15,
        lastSecond: 50,       // ratunek przy <= lastSecondSec
        lastSecondSec: 5,
        lightning: 50,        // ratunek przy >= lightningSec pozostalych
        lightningSec: 60,
    },
});

/** Faza dla danej liczby ms pozostalych na zegarze. */
export function queenPhaseFor(remainingMs: number): QueenPhaseDef {
    for (const p of QUEEN_TUNING.phases) if (remainingMs > p.untilMs) return p;
    return QUEEN_TUNING.phases[QUEEN_TUNING.phases.length - 1];
}
