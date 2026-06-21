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
 * `total` = round((killsBase + combo + gems) * multiplier).
 */
export interface ScoreBreakdown {
    /** Baza za killy (sum scoreValue, bez combo, bez difficulty). */
    killsBase: number;
    /** Bonus za combo (sum baseValue * (comboMult - 1), bez difficulty). */
    combo: number;
    /** Punkty za gemy (sum gem.value, bez difficulty). */
    gems: number;
    /** killsBase + combo + gems (przed difficulty). */
    subtotal: number;
    /** Difficulty multiplier (1.0 / 1.0 / 1.2 / 1.4). */
    multiplier: number;
    /** round(subtotal * multiplier) — finalny score do submit. */
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

    /**
     * v0.49.0 — przelicz score z sub-totali + difficulty multiplier.
     * Wolane automatycznie po addKillScore/addGemScore. Single point of truth dla score.
     */
    private recomputeScore(): void {
        const diffMult = getDifficultyMultiplier(this.config.difficulty);
        const subtotal = this.scoreFromKillsBase + this.scoreFromCombo + this.scoreFromGems;
        this.score = Math.round(subtotal * diffMult);
    }

    /**
     * v0.49.0 — pelny breakdown score do display na end-screen.
     * Liczby PRZED zaokraglaniem do int (caller robi Math.round dla wyswietlenia).
     *
     * Display format (przyklad):
     *   "Killy 380 · Combo +180 · Gemy 150 · Hard ×1.2 = 852"
     */
    getScoreBreakdown(): ScoreBreakdown {
        const diffMult = getDifficultyMultiplier(this.config.difficulty);
        const subtotal = this.scoreFromKillsBase + this.scoreFromCombo + this.scoreFromGems;
        return {
            killsBase: this.scoreFromKillsBase,
            combo: this.scoreFromCombo,
            gems: this.scoreFromGems,
            subtotal,
            multiplier: diffMult,
            total: Math.round(subtotal * diffMult),
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