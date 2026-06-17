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
 */

import type { GameConfig } from '../types/GameConfig';

/**
 * Maksymalny mnoznik combo (cap dla wyswietlania).
 * 2x = DOUBLE, 3x = TRIPLE, 4x+ = MEGA KILL.
 */
const MAX_COMBO_MULTIPLIER = 4;

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
 */
export const POWERCUBE_DMG_BONUS_PER_PICKUP = 0.05;

/**
 * Health bonus per hp-type pickup. Capped naturalnie: max +2.5 HP (i +2.5 maxHp)
 * jesli wszystkie 10 cubes typu 'hp'.
 */
export const POWERCUBE_HP_BONUS_PER_PICKUP = 0.25;

export class GameSession {
    /** Immutable game configuration (frozen przez GameConfigBuilder). */
    public readonly config: GameConfig;

    /** Akumulowany score (punkty z killow + gemow + pickupow). */
    public score: number = 0;

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
     * `bullet.dmg *= (1 + currentSession.dmgBonus)`.
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

    constructor(config: GameConfig) {
        this.config = config;
        this.startTime = config.timestamp;
    }

    /** Czas trwania sesji w sekundach (do wyswietlania w endcard). */
    getElapsedSeconds(): number {
        return Math.round((Date.now() - this.startTime) / 1000);
    }

    /**
     * Aktualny multiplier combo (1.0 = brak combo, 2.0 = double, ..., 4.0 = mega).
     * Auto-resetuje sie do 1 gdy comboEndTime wygasl.
     */
    getComboMultiplier(): number {
        if (Date.now() >= this.comboEndTime) {
            return 1;
        }
        return Math.min(MAX_COMBO_MULTIPLIER, this.comboCount);
    }

    /** True gdy combo aktywne (jeszcze nie wygaslo). */
    isComboActive(): boolean {
        return Date.now() < this.comboEndTime;
    }

    /**
     * Zarejestruj kill - inkrementuje combo lub resetuje na 1.
     * Wywoluje sie z game loop po killu enemy.
     * Zwraca aktualny combo count (do hud.comboText).
     */
    registerKill(comboWindowMs: number = 2000): number {
        const now = Date.now();
        if (now < this.comboEndTime) {
            this.comboCount++;
        } else {
            this.comboCount = 1;
        }
        this.comboEndTime = now + comboWindowMs;
        return this.comboCount;
    }

    /** Reset combo (np. po graczu pauzie). */
    resetCombo(): void {
        this.comboCount = 0;
        this.comboEndTime = 0;
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