/**
 * GameSession.ts — runtime gameplay state container (FAZA 6.5.1).
 *
 * Trzyma logical session state (score, combo, time) + reference do immutable config.
 *
 * Wzorzec architektoniczny (3 warstwy):
 *
 *   1. GameConfig (immutable input)
 *      "Co gramy" - scenariusz, mapa, czolg, trudnosc.
 *      Stworzony przez GameConfigBuilder w startGame(), frozen.
 *
 *   2. GameSession (mutable runtime state) <- TEN PLIK
 *      "Jak nam idzie" - score, combo, elapsed time, config reference.
 *      Singleton-per-game: nowa instancja per startGame(), zniszczona po
 *      victory/gameOver, GC ja zbiera.
 *
 *   3. Frame transients (w main.ts module-level)
 *      "Co dzieje sie w tej klatce" - oasis stealth state machine, sand kick
 *      counter. Reset per startGame, NIE czesc GameSession (rozne lifecycle).
 *
 * WAZNE: NIE myl z SessionService.ts!
 *   - SessionService = persistence layer (localStorage snapshot dla "Kontynuuj")
 *   - GameSession = runtime state (in-memory tylko, no persistence)
 *
 * FAZA 6.5.2: MainMenu wpiety -> startGame(config) zastapi startGame() (no args).
 * FAZA 7: profileId wypelni rzeczywisty profil, sessionId trafia do backend score sync.
 * v0.44.0 FAZA 8.6: dorzucony tracking PowerCube (cubesTotal, dmgBonus, hpCubesPicked, dmgCubesPicked).
 * v0.46.0 HP/DMG x100: POWERCUBE_HP_BONUS_PER_PICKUP 0.25 -> 25 (widoczny bump HP).
 *
 * v0.49.0 Scoring v2:
 *   - score jest TERAZ computed (recomputeScore() po kazdym addKillScore/addGemScore).
 *   - Sub-totale: scoreFromKillsBase, scoreFromCombo, scoreFromGems.
 *   - Difficulty multiplier aplikowany na FINALNY subtotal (single point of truth).
 *   - Combo multiplier (1.0/1.2/1.5/2.0) dziala TYLKO przy bullet killu w main.ts
 *     (registerKill() wywolane PRZED addKillScore — opcja A: 2. kill = DOUBLE ×1.2).
 *   - Mega bomba/kolizja: addKillScore() uzywa AKTUALNEGO comboMult (jezeli combo
 *     juz aktywne z poprzedniego bullet killa, AOE kill tez dostaje mnoznik).
 *   - getScoreBreakdown() — uzywane przez end-screen do live rozbicia
 *     "Killy X · Combo +Y · Gemy Z · Hard ×1.2".
 *   - score_version BUMP DO 2 wymagany przy commitcie (TODO przed merge!).
 */

import type { GameConfig } from '../types/GameConfig';
import { getDifficultyMultiplier } from '../types/GameConfig';

/**
 * Tier indicator combo (1-4+). Uzywany jako toast text label ("DOUBLE!"/"TRIPLE!"/"MEGA").
 * NIE myl z COMBO_SCORE_MULTIPLIERS (ponizej).
 */
const MAX_COMBO_TIER = 4;

/**
 * v0.49.0 — Score multiplier per tier comba.
 * Index = comboCount (cap = MAX_COMBO_TIER, czyli MEGA KILL = 4+).
 *
 * Opcja A: pierwszy kill (comboCount=1) = ×1.0 (brak premii). Drugi kill (DOUBLE)
 * dostaje ×1.2 — gracz widzi toast "DOUBLE!" i wie ze ma +20% za ten kill.
 *
 *   idx 0: 1.0   (fallback dla 0 — practically nieosiagalny po registerKill)
 *   idx 1: 1.0   (SINGLE kill)
 *   idx 2: 1.2   (DOUBLE  +20%)
 *   idx 3: 1.5   (TRIPLE  +50%)
 *   idx 4: 2.0   (MEGA KILL +100%, CAP)
 */
const COMBO_SCORE_MULTIPLIERS = [1.0, 1.0, 1.2, 1.5, 2.0] as const;

// ============================================================
// v0.50.0 Scoring v2.1 — Skill bonuses (frozen / multi-kill / ramming)
// ============================================================
//
// Trzy nagrody za "swiadomy skill" (nie za przypadkowe killy):
//
// 1. FROZEN KILL — premiuje kapitalizacje super powera Freeze.
//    Skalowane per-difficulty bo na Nightmare freeze jest ratunkiem.
//    Dziala na WSZYSTKIE rodzaje killow (bullet/mega bomb/collision)
//    o ile enemy byl frozen w momencie killa.
//
// 2. MULTI-KILL — premiuje pozycjonowanie + timing przy odpaleniu Mega Bomby.
//    Aplikowany RAZ na bombe gdy zabila >=3 wrogow. Bonus = +50% sumy base values.
//    Stale (nie skalowane) — matematyka grupowania niezalezna od difficulty.
//
// 3. RAMMING — premiuje swiadomy trade HP <-> score (collision kill).
//    +100% base value. Stale. Self-limiting (~6 ramming killow = smierc).
//
// Wszystkie bonusy STACKUJA SIE i z comba, i ze soba (np. mega bomb 4 frozen
// wrogow daje: kill score x combo + frozen bonus per kill + multi-kill bonus).
// Bonus laduje w scoreFromBonus (4. sub-total), tracking osobny per typ
// (bonusFrozen / bonusMultiKill / bonusCollision) na potrzeby przyszlego analytics.

const FROZEN_KILL_BONUS_PER_DIFFICULTY: Record<import('../types/GameConfig').DifficultyId, number> = {
    easy:      0.50,
    normal:    0.75,
    hard:      1.00,
    nightmare: 1.25,
};

/** Mega bomb musi zabic >= tylu wrogow zeby wyzwolic multi-kill bonus. */
const MULTI_KILL_THRESHOLD = 3;

/** % bonus dla multi-killa (od sumy base values zabitych wrogow). */
const MULTI_KILL_BONUS_PCT = 0.50;

/** % bonus dla ramming killa (od base value pojedynczego wroga). */
const COLLISION_KILL_BONUS_PCT = 1.00;

/**
 * v0.50.0 Scoring v2.2 — PERFECT RUN bonus.
 *
 * Game-end achievement: gracz zwyciezyl bez ANI JEDNEGO trafienia.
 * Bonus aplikowany POST difficulty mult (jako stala, nie skalowane przez diff).
 * Dzieki temu liczby ktore gracz widzi (+50 / +75 / +100 / +125) sa dokladnie te
 * w tabeli ponizej — bez "ukrytego" przemnozenia.
 *
 * Implementacja:
 *   - tookDamageThisMatch flag — SET przy KAZDYM applied damage (heart pickup NIE resetuje)
 *   - applyPerfectRunBonus() wolane RAZ na koncu (w triggerVictory) przed score submit
 *   - Aura (powerSystem.isInvulnerable) BLOKUJE damage → Perfect Run ZACHOWANY
 *     (aura kosztuje cooldown 30s, nie jest free taktyka)
 *
 * Stosowane tylko przy Victory:
 *   - Game over = HP=0 = damage musial byc applied = flag = true, bonus nie zadziala anyway
 *   - Victory bez damage = rzadki wyczyn = wlasciwy moment na +50..+125 bonus
 */
const PERFECT_RUN_BONUS_PER_DIFFICULTY: Record<import('../types/GameConfig').DifficultyId, number> = {
    easy:      50,
    normal:    75,
    hard:      100,
    nightmare: 125,
};

// ============================================================
// v0.44.0 FAZA 8.6 — PowerCube constants
// ============================================================

/**
 * Maksymalna ilosc PowerCube'ow ktore moga zespawnowac w jednej rozgrywce.
 * Po 10 dropach, dalsze enemy kills daja tylko gemy (cap check w main.ts handleEnemyDrop).
 */
export const MAX_POWERCUBES_PER_MATCH = 10;

/**
 * Damage bonus per dmg-type pickup. Capped naturalnie przez MAX_POWERCUBES_PER_MATCH:
 * jesli wszystkie 10 cubes typu 'dmg', max dmgBonus = 0.50 (+50% damage).
 * v0.46.0: NIETKNIETE (procent dziala z kazda skala).
 */
export const POWERCUBE_DMG_BONUS_PER_PICKUP = 0.05;

/**
 * Health bonus per hp-type pickup.
 * v0.46.0 HP/DMG x100: 0.25 -> 25. Max +250 HP (i +250 maxHp) jesli wszystkie 10 cubes hp.
 * Widoczny bump na pasku HP (cel refactora: gracz CZUJE ze uroosl).
 */
export const POWERCUBE_HP_BONUS_PER_PICKUP = 25;

/**
 * v0.49.0 — Score breakdown struct dla end-screen.
 * Wszystkie liczby PRZED zaokraglaniem do int (do display: Math.round).
 * `total` = round((killsBase + combo + gems + bonus) * multiplier) + staticBonus.
 *
 * v0.50.0 — dodane `bonus` (total) + sub-fields per typ skill bonusu
 * (bonusFrozen / bonusMultiKill / bonusCollision) na potrzeby live breakdown UI.
 *
 * v0.50.0 v2.2 — dodane `staticBonus` (Perfect Run — POST difficulty mult,
 * jako stala dodawana do final score).
 */
export interface ScoreBreakdown {
    /** Baza za killy (sum scoreValue, bez combo, bez difficulty, bez skill bonusow). */
    killsBase: number;
    /** Bonus za combo (sum baseValue * (comboMult - 1), bez difficulty). */
    combo: number;
    /** Punkty za gemy (sum gem.value, bez difficulty). */
    gems: number;
    /** v0.50.0 — sum wszystkich skill bonusow (frozen + multiKill + collision). */
    bonus: number;
    /** v0.50.0 — bonus za frozen killy (per-difficulty). */
    bonusFrozen: number;
    /** v0.50.0 — bonus za mega bomb multi-kille (>= 3 wrogow). */
    bonusMultiKill: number;
    /** v0.50.0 — bonus za ramming killy (collision z graczem). */
    bonusCollision: number;
    /** killsBase + combo + gems + bonus (przed difficulty). */
    subtotal: number;
    /** Difficulty multiplier (1.0 / 1.0 / 1.2 / 1.4). */
    multiplier: number;
    /** v0.50.0 v2.2 — bonusy POST difficulty mult (Perfect Run). NIE skalowane przez diff. */
    staticBonus: number;
    /** v0.50.0 v2.2 — Perfect Run bonus (50/75/100/125 per difficulty). 0 gdy nie zdobyty. */
    bonusPerfectRun: number;
    /** round(subtotal * multiplier) + staticBonus — finalny score do submit. */
    total: number;
}

export class GameSession {
    /** Immutable game configuration (frozen przez GameConfigBuilder). */
    public readonly config: GameConfig;

    /**
     * Akumulowany score (computed: subtotal * difficulty multiplier).
     * v0.49.0: NIE inkrementuj bezposrednio — uzywaj addKillScore() / addGemScore().
     * Recomputed po kazdej zmianie sub-totala.
     */
    public score: number = 0;

    // ────────────────────────────────────────────────────────
    // v0.49.0 Scoring v2 — sub-totale (przed difficulty mult)
    // ────────────────────────────────────────────────────────

    /** Suma baseScoreValue ze wszystkich killow (bez combo, bez difficulty). */
    public scoreFromKillsBase: number = 0;

    /** Suma bonusow comba (baseValue * (comboMult - 1)) — tylko gdy combo aktywne. */
    public scoreFromCombo: number = 0;

    /** Suma wartosci gemow (1 per gem na ten moment). */
    public scoreFromGems: number = 0;

    // ────────────────────────────────────────────────────────
    // v0.50.0 Scoring v2.1 — skill bonuses (frozen / multiKill / collision)
    // ────────────────────────────────────────────────────────

    /** Suma wszystkich skill bonusow (bonusFrozen + bonusMultiKill + bonusCollision). */
    public scoreFromBonus: number = 0;

    /** Bonus za zabicia zamrozonych wrogow (skalowane per difficulty). */
    public bonusFrozen: number = 0;

    /** Bonus za mega bomb multi-killi (>=3 wrogow w jednej bombie). */
    public bonusMultiKill: number = 0;

    /** Bonus za ramming killy (collision z graczem). */
    public bonusCollision: number = 0;

    // ────────────────────────────────────────────────────────
    // v0.50.0 Scoring v2.2 — static bonuses (POST difficulty mult)
    // ────────────────────────────────────────────────────────

    /**
     * Sub-total bonusow POST difficulty mult. Nie podlega recomputeScore * diff.
     * Aktualnie tylko Perfect Run. W przyszlosci moga dolaczyc inne game-end achievements.
     */
    public scoreFromStaticBonus: number = 0;

    /** Bonus Perfect Run (zwyciestwo bez damage). 0 gdy nie zdobyty albo zdobyty na innym trybie. */
    public bonusPerfectRun: number = 0;

    /**
     * Flag — czy gracz dostal damage applied w tym matchu.
     * SET RAZ przy pierwszym hicie (markDamageTaken), NIE resetowana przez heart pickup.
     * Aura (isInvulnerable) blokuje damage → flag NIE jest setowana → Perfect Run zachowany.
     */
    public tookDamageThisMatch: boolean = false;

    /** Aktualny streak combo (1, 2, 3, 4+). Reset gdy comboEndTime < now. */
    public comboCount: number = 0;

    /** Date.now() po ktorym combo wygasa (domyslnie 2000ms po ostatnim killu). */
    public comboEndTime: number = 0;

    /** Date.now() z momentu utworzenia sesji (== config.timestamp). */
    public readonly startTime: number;

    // ────────────────────────────────────────────────────────
    // v0.44.0 FAZA 8.6 — PowerCube tracking
    // ────────────────────────────────────────────────────────

    /**
     * Łączna ilosc PowerCube'ow zebranych w tej rozgrywce.
     * Uzywane dla drop logic cap check (w main.ts handleEnemyDrop):
     * gdy cubesTotal >= MAX_POWERCUBES_PER_MATCH, drop wraca do "100% gem".
     *
     * Wyswietlane w game-over/victory stats (NIE w HUD podczas gameplay - decyzja Q4 C).
     */
    public cubesTotal: number = 0;

    /**
     * Skumulowany damage bonus (0.0 do 0.50). Wartosc 0.0 = no bonus,
     * 0.05 = +5%, 0.50 = +50% (10 dmg cubes wszystkie zebrane).
     *
     * Aplikowany w main.ts przy tworzeniu kazdego player bullet:
     * `bullet.dmg = Math.round(bullet.dmg * (1 + currentSession.dmgBonus))`.
     */
    public dmgBonus: number = 0;

    /**
     * Ilosc HP-type cubes zebranych (dla statystyk game-over).
     * Aktualny +maxHp i +heal w main.ts (wymaga reference do Player, nie tutaj).
     */
    public hpCubesPicked: number = 0;

    /**
     * Ilosc DMG-type cubes zebranych (dla statystyk game-over).
     */
    public dmgCubesPicked: number = 0;

    // v0.46.0 — staty dla rozbudowanego endcard (8 statow)
    /** Najwyzszy osiagniety streak combo w meczu (do endcard). */
    public maxCombo: number = 0;
    /** Ilosc zebranych apteczek (Heart pickups) — inkrement w main.ts. */
    public heartsHealed: number = 0;
    /** Ilosc uzytych supermocy (aura/bomba/freeze) — inkrement w main.ts. */
    public superPowersUsed: number = 0;

    constructor(config: GameConfig) {
        this.config = config;
        this.startTime = config.timestamp;
    }

    /** Czas trwania sesji w sekundach (do wyswietlania w endcard). */
    getElapsedSeconds(): number {
        return Math.round((Date.now() - this.startTime) / 1000);
    }

    /**
     * Tier indicator combo (1.0 / 2.0 / 3.0 / 4.0) — uzywany jako "ktory tier comba".
     * NIE jest mnoznikiem score! Dla scoringu: getComboScoreMultiplier().
     * Zostawiony dla back-compat (gdyby zewnetrzny kod chcial sprawdzic tier).
     */
    getComboMultiplier(): number {
        if (Date.now() >= this.comboEndTime) {
            return 1;
        }
        return Math.min(MAX_COMBO_TIER, this.comboCount);
    }

    /**
     * v0.49.0 — Score multiplier dla aktualnego comba (1.0 / 1.2 / 1.5 / 2.0).
     * Wygasa do 1.0 gdy comboEndTime < now (auto reset).
     *
     * Uzywany przez addKillScore() do obliczenia bonusu comba per kill.
     */
    getComboScoreMultiplier(): number {
        if (Date.now() >= this.comboEndTime) {
            return COMBO_SCORE_MULTIPLIERS[0]; // 1.0
        }
        const idx = Math.min(COMBO_SCORE_MULTIPLIERS.length - 1, this.comboCount);
        return COMBO_SCORE_MULTIPLIERS[idx];
    }

    /** True gdy combo aktywne (jeszcze nie wygaslo). */
    isComboActive(): boolean {
        return Date.now() < this.comboEndTime;
    }

    /**
     * Zarejestruj kill - inkrementuje combo lub resetuje na 1.
     * Wywoluje sie z game loop po killu enemy.
     * Zwraca aktualny combo count (do hud.comboText).
     *
     * v0.49.0 WAZNE: Wywoluj PRZED addKillScore(), zeby addKillScore() uzylo
     * NOWEGO comboMult (opcja A: drugi kill w serii dostaje ×1.2 DOUBLE).
     */
    registerKill(comboWindowMs: number = 2000): number {
        const now = Date.now();
        if (now < this.comboEndTime) {
            this.comboCount++;
        } else {
            this.comboCount = 1;
        }
        this.comboEndTime = now + comboWindowMs;
        if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
        return this.comboCount;
    }

    /** Reset combo (np. po graczu pauzie). */
    resetCombo(): void {
        this.comboCount = 0;
        this.comboEndTime = 0;
    }

    /**
     * v0.49.0 Scoring v2 — zarejestruj score za killa wroga.
     *
     * Aplikuje aktualny comboScoreMultiplier (1.0/1.2/1.5/2.0):
     *   - scoreFromKillsBase += baseValue        (zawsze)
     *   - scoreFromCombo     += baseValue * (comboMult - 1)  (bonus tylko gdy comboMult > 1)
     *
     * @param baseValue — enemy.scoreValue (2 regular, 20 boss, 100 mega).
     * @returns rozbicie tego konkretnego killa (added = co dodano do total, comboBonus = ile z tego z comba).
     *
     * UWAGA: Dla bullet killow wywoluj PO registerKill(), zeby comboCount=2 zwracal ×1.2
     * (opcja A). Dla mega bomby/kolizji NIE wywoluj registerKill() — combo nie inkrementuje
     * przy AOE/przypadkowych killach, ale jesli combo bylo juz aktywne, mnoznik dziala.
     */
    addKillScore(baseValue: number): { added: number; comboBonus: number } {
        const comboMult = this.getComboScoreMultiplier();
        const comboBonus = baseValue * (comboMult - 1);
        this.scoreFromKillsBase += baseValue;
        this.scoreFromCombo += comboBonus;
        this.recomputeScore();
        return { added: baseValue * comboMult, comboBonus };
    }

    /**
     * v0.49.0 Scoring v2 — zarejestruj score za zebranie gema.
     * Gemy NIE skaluja combo (pasywny pickup, nie skill expression).
     * Dostaja TYLKO difficulty multiplier przy recomputeScore().
     *
     * @param value — wartosc gema (default 1, zgodne z istniejacym Gem pickup).
     */
    addGemScore(value: number = 1): void {
        this.scoreFromGems += value;
        this.recomputeScore();
    }

    // ────────────────────────────────────────────────────────
    // v0.50.0 Scoring v2.1 — skill bonus methods
    // ────────────────────────────────────────────────────────

    /**
     * v0.50.0 — bonus za zabicie zamrozonego wroga (skalowane per difficulty).
     * Aplikowany OBOK addKillScore (oba stackuja sie). Wolaj gdy wykryto ze enemy.frozenUntil > Date.now()
     * w momencie kill detection (snapshot PRZED enemy.takeDamage).
     *
     * Mnozniki (% dodane do baseValue):
     *   Easy:      +50%    (0.50 * baseValue)
     *   Normal:    +75%    (0.75 * baseValue)
     *   Hard:      +100%   (1.00 * baseValue)
     *   Nightmare: +125%   (1.25 * baseValue)
     *
     * @param baseValue — enemy.scoreValue (2 regular, 20 boss, 100 mega).
     * @returns ile dodano do scoreFromBonus.
     */
    addFrozenKillBonus(baseValue: number): { added: number } {
        const mult = FROZEN_KILL_BONUS_PER_DIFFICULTY[this.config.difficulty];
        const bonus = baseValue * mult;
        this.scoreFromBonus += bonus;
        this.bonusFrozen += bonus;
        this.recomputeScore();
        return { added: bonus };
    }

    /**
     * v0.50.0 — bonus za mega bomb multi-kill (>=3 wrogow w jednej bombie).
     * Wolaj RAZ po pelnej petli mega bomby, z suma base values zabitych wrogow.
     * Jezeli killCount < MULTI_KILL_THRESHOLD (3), NIE wolaj — wewnetrzny guard
     * zwraca 0 dla bezpieczenstwa.
     *
     * Bonus = +50% sumy base values. Stale dla wszystkich difficulty.
     *
     * @param sumBaseValues — sum enemy.scoreValue z wszystkich zabitych w tej bombie.
     * @param killCount — ile wrogow zabilo (do guarda, normalnie ten sam length co dla sumy).
     * @returns ile dodano do scoreFromBonus (0 gdy killCount < threshold).
     */
    addMultiKillBonus(sumBaseValues: number, killCount: number): { added: number } {
        if (killCount < MULTI_KILL_THRESHOLD) {
            return { added: 0 };
        }
        const bonus = sumBaseValues * MULTI_KILL_BONUS_PCT;
        this.scoreFromBonus += bonus;
        this.bonusMultiKill += bonus;
        this.recomputeScore();
        return { added: bonus };
    }

    /**
     * v0.50.0 — bonus za ramming kill (collision player <-> enemy w main.ts).
     * Stale +100% baseValue (czyli kill DOUBLE punkty). Stale dla wszystkich difficulty.
     *
     * Self-limiting: ~6 collision killow = smierc gracza (200 dmg per collision vs zwykle ~1500 HP),
     * wiec nie da sie farmowac. To swiadomy trade HP <-> score.
     *
     * @param baseValue — enemy.scoreValue (zwykle regular = 2, kolizje z bossami nie killa).
     * @returns ile dodano do scoreFromBonus.
     */
    addCollisionKillBonus(baseValue: number): { added: number } {
        const bonus = baseValue * COLLISION_KILL_BONUS_PCT;
        this.scoreFromBonus += bonus;
        this.bonusCollision += bonus;
        this.recomputeScore();
        return { added: bonus };
    }

    // ────────────────────────────────────────────────────────
    // v0.50.0 Scoring v2.2 — Perfect Run flag + bonus
    // ────────────────────────────────────────────────────────

    /**
     * v0.50.0 — oznacz ze gracz dostal applied damage w tym matchu (zlamane Perfect Run).
     * Wolaj w main.ts ZARAZ po `player.takeDamage(...)` gdy `!powerSystem.isInvulnerable`.
     * Aura blokuje damage → NIE wolaj → flag pozostaje false → Perfect Run zachowany.
     *
     * Idempotent: kolejne wolania nic nie zmieniaja (raz true = zawsze true do konca matchu).
     * Heart pickup NIE resetuje (kara za hit zostaje nawet po heal).
     */
    markDamageTaken(): void {
        this.tookDamageThisMatch = true;
    }

    /**
     * v0.50.0 — sprawdz Perfect Run + aplikuj bonus (50/75/100/125 per difficulty).
     * Wolaj RAZ na koncu matchu w `triggerVictory()` PRZED `scoreService.submitScore(...)`.
     *
     * - Jezeli tookDamageThisMatch === true: brak bonusu, return { applied: false, bonus: 0 }
     * - Jezeli false: bonus dodany do scoreFromStaticBonus + bonusPerfectRun, recompute.
     *
     * Nie wolaj w triggerGameOver — gracz zginal = damage applied = flag = true defacto.
     * Brak guardow przed double-call (caller odpowiada za jednokrotne uzycie).
     */
    applyPerfectRunBonus(): { applied: boolean; bonus: number } {
        if (this.tookDamageThisMatch) {
            return { applied: false, bonus: 0 };
        }
        const bonus = PERFECT_RUN_BONUS_PER_DIFFICULTY[this.config.difficulty];
        this.scoreFromStaticBonus += bonus;
        this.bonusPerfectRun += bonus;
        this.recomputeScore();
        return { applied: true, bonus };
    }

    /**
     * v0.49.0 — przelicz score z sub-totali + difficulty multiplier.
     * Wolane automatycznie po addKillScore/addGemScore/addBonus*. Single point of truth dla score.
     *
     * v0.50.0 — uwzglednia scoreFromBonus (frozen + multiKill + collision).
     * v0.50.0 v2.2 — scoreFromStaticBonus dodawane PO multiplier (Perfect Run niezalezne od diff).
     *
     * Wzor: score = round((killsBase + combo + gems + bonus) * diff) + staticBonus
     */
    private recomputeScore(): void {
        const diffMult = getDifficultyMultiplier(this.config.difficulty);
        const subtotal = this.scoreFromKillsBase + this.scoreFromCombo + this.scoreFromGems + this.scoreFromBonus;
        this.score = Math.round(subtotal * diffMult) + this.scoreFromStaticBonus;
    }

    /**
     * v0.49.0 — pelny breakdown score do display na end-screen.
     * Liczby PRZED zaokraglaniem do int (caller robi Math.round dla wyswietlenia).
     *
     * v0.50.0 — dodane skill bonuses (bonus total + bonusFrozen/MultiKill/Collision).
     * v0.50.0 v2.2 — dodane staticBonus (Perfect Run) i bonusPerfectRun.
     *
     * Display format (przyklad):
     *   "Killy 380 · Combo +180 · Gemy 150 · Bonusy +95 · Hard ×1.2 · PerfectRun +100 = 1066"
     */
    getScoreBreakdown(): ScoreBreakdown {
        const diffMult = getDifficultyMultiplier(this.config.difficulty);
        const subtotal = this.scoreFromKillsBase + this.scoreFromCombo + this.scoreFromGems + this.scoreFromBonus;
        return {
            killsBase: this.scoreFromKillsBase,
            combo: this.scoreFromCombo,
            gems: this.scoreFromGems,
            bonus: this.scoreFromBonus,
            bonusFrozen: this.bonusFrozen,
            bonusMultiKill: this.bonusMultiKill,
            bonusCollision: this.bonusCollision,
            subtotal,
            multiplier: diffMult,
            staticBonus: this.scoreFromStaticBonus,
            bonusPerfectRun: this.bonusPerfectRun,
            total: Math.round(subtotal * diffMult) + this.scoreFromStaticBonus,
        };
    }

    /**
     * v0.44.0 FAZA 8.6: zarejestruj pickup PowerCube.
     *
     * @param type — 'dmg' (+5% damage bonus) lub 'hp' (heal + maxHp grow w main.ts).
     *
     * Increments cubesTotal (uzywane dla drop cap check w main.ts).
     * Dla 'dmg': dorzuca POWERCUBE_DMG_BONUS_PER_PICKUP do dmgBonus.
     * Dla 'hp': bumping wlasnego counter; aktualna heal + maxHp grow happens w main.ts
     *           bo wymaga reference do Player instance (GameSession nie zna Player).
     */
    registerCubePickup(type: 'dmg' | 'hp'): void {
        this.cubesTotal++;
        if (type === 'dmg') {
            this.dmgBonus += POWERCUBE_DMG_BONUS_PER_PICKUP;
            this.dmgCubesPicked++;
        } else {
            this.hpCubesPicked++;
        }
    }

    /**
     * Pretty-print dla console.log debug.
     * Format: [GameSession] score=1250 combo=3x time=45s cubes=4(+15%DMG) config=KTB|desert|normal|shadow
     */
    describe(): string {
        const comboPart = this.isComboActive() ? `combo=${this.comboCount}x` : 'combo=-';
        const dmgPct = Math.round(this.dmgBonus * 100);
        const cubesPart = this.cubesTotal > 0
            ? `cubes=${this.cubesTotal}${dmgPct > 0 ? `(+${dmgPct}%DMG)` : ''}`
            : 'cubes=0';
        const configPart = `${this.config.scenario.toUpperCase()}|${this.config.map}|${this.config.difficulty}|${this.config.brawlerId}`;
        return `[GameSession] score=${this.score} ${comboPart} time=${this.getElapsedSeconds()}s ${cubesPart} config=${configPart}`;
    }
}