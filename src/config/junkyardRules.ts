import type { DifficultyId } from '../types/GameConfig';

/**
 * junkyardRules.ts — ZLOMOWISKO: all tunable numbers in ONE file, versioned (multiplayer-ready rule 3).
 * Both sides of a coop match must run the same ruleset: bump JUNKYARD_RULESET_ID on every balance change.
 */
export const JUNKYARD_RULESET_ID = 'junkyard-v2'; // v2: J6a events + tow truck

export interface PressTuning {
    /** Rest with the plate up (bed safe). ms of sim time. */
    idleMs: number;
    /** Telegraph: stripes flash, beacon spins, shadow grows. Easy longer, Nightmare shorter. */
    telegraphMs: number;
    /** Plate travel down (fast). */
    slamMs: number;
    /** Plate travel back up (hydraulic hiss). */
    riseMs: number;
    /** Player: fraction of max HP lost when crushed (no instakill — 9-12 audience). */
    playerDmgPct: number;
    /** Knockback distance out of the bed (px). */
    playerKnockPx: number;
    /** Boss / mega boss: fraction of max HP per crush. */
    bossDmgPct: number;
    /** Boss stun after a crush (ms). */
    bossStunMs: number;
    /** Ceiling: total press damage to one boss per match (fraction of its max HP). The rest is the tank's job. */
    bossCeilingPct: number;
}

const BASE: PressTuning = {
    idleMs: 12000, telegraphMs: 3000, slamMs: 300, riseMs: 2700,
    playerDmgPct: 0.45, playerKnockPx: 110,
    bossDmgPct: 0.15, bossStunMs: 2000, bossCeilingPct: 0.45,
};

export interface CraneTuning {
    idleMs: number; swingMs: number; liftMs: number; carryMs: number; telegraphMs: number; dropMs: number;
    enemyDmg: number; playerDmgPct: number; wreckHp: number; maxWrecks: number; padHoldMs: number; padCooldownMs: number;
}
const CRANE_BASE: CraneTuning = {
    idleMs: 9000, swingMs: 1400, liftMs: 1600, carryMs: 2600, telegraphMs: 2000, dropMs: 550, // full cycle ~17-18 s
    enemyDmg: 250, playerDmgPct: 0.25, wreckHp: 3, maxWrecks: 6, padHoldMs: 1500, padCooldownMs: 20000,
};
export const CRANE_BY_DIFFICULTY: Record<DifficultyId, CraneTuning> = {
    easy:      { ...CRANE_BASE, telegraphMs: 2400, idleMs: 10000 },
    normal:    { ...CRANE_BASE },
    hard:      { ...CRANE_BASE, telegraphMs: 1800, idleMs: 8000 },
    nightmare: { ...CRANE_BASE, telegraphMs: 1500, idleMs: 7000 },
};

export const PRESS_BY_DIFFICULTY: Record<DifficultyId, PressTuning> = {
    easy:      { ...BASE, telegraphMs: 3500, idleMs: 13000 },
    normal:    { ...BASE },
    hard:      { ...BASE, telegraphMs: 2800, idleMs: 11000 },
    nightmare: { ...BASE, telegraphMs: 2500, idleMs: 10000 },
};

export interface BeltTuning {
    /** Belt speed in px per logic step (60 steps/s): 1.0 = 60 px/s. */
    speedPxPerStep: number;
    /** Player: fraction of max HP lost when the crusher spits them out. */
    playerDmgPct: number;
    /** Spit-out knockback west along the belt (px). */
    spitPx: number;
    /** No double spit while the knockback lands (ms). */
    spitCooldownMs: number;
}
const BELT_BASE: BeltTuning = { speedPxPerStep: 1.25, playerDmgPct: 0.25, spitPx: 220, spitCooldownMs: 1500 }; // REV 5: +25% (playtest)
export const BELT_BY_DIFFICULTY: Record<DifficultyId, BeltTuning> = {
    easy:      { ...BELT_BASE, speedPxPerStep: 1.0 },
    normal:    { ...BELT_BASE },
    hard:      { ...BELT_BASE, speedPxPerStep: 1.5 },
    nightmare: { ...BELT_BASE, speedPxPerStep: 1.75 },
};

/** J6a: yard events (director) — steps = logic steps (60/s), ms = sim clock. */
export interface JunkyardEventsTuning {
    firstEventSteps: number; minGapSteps: number; maxGapSteps: number; cooldownSteps: number;
    hubcapTelegraphMs: number; hubcapCount: number; hubcapSpeed: number; hubcapLifeSteps: number; hubcapSpreadRad: number; hubcapDmg: number;
    saleShowMs: number; saleMin: number; saleMax: number; saleCubeChance: number;
}
const EVENTS_BASE: JunkyardEventsTuning = {
    firstEventSteps: 1500, minGapSteps: 1200, maxGapSteps: 2100, cooldownSteps: 3600, // 25 s, then every 20-35 s, 60 s per event
    hubcapTelegraphMs: 2000, hubcapCount: 8, hubcapSpeed: 5, hubcapLifeSteps: 150, hubcapSpreadRad: 0.5, hubcapDmg: 40,
    saleShowMs: 3000, saleMin: 3, saleMax: 5, saleCubeChance: 0.3,
};
export const EVENTS_BY_DIFFICULTY: Record<DifficultyId, JunkyardEventsTuning> = {
    easy:      { ...EVENTS_BASE, hubcapDmg: 30, hubcapTelegraphMs: 2400 },
    normal:    { ...EVENTS_BASE },
    hard:      { ...EVENTS_BASE, hubcapDmg: 50, hubcapTelegraphMs: 1700 },
    nightmare: { ...EVENTS_BASE, hubcapDmg: 60, hubcapTelegraphMs: 1500, hubcapCount: 10 },
};
/** J6a: Laweta on the outer lane. */
export const TOW_TRUCK = { speedPxPerStep: 1.15, dropIntervalMs: 20000 } as const; // ~70 px/s, a gem every 20 s

/** J6b: opona-trampolina nad prasa (port CastleJump na simNowMs). */
export const TIRE_JUMP = { cooldownMs: 20000, flightFrames: 60, peakLift: 120, triggerRadius: 26, rearmRadius: 52, visualRadius: 34, landRadius: 26 } as const;
