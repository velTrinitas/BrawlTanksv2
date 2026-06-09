/**
 * GameConfig.ts — single source of truth dla aktualnej rozgrywki.
 *
 * v0.19.0 i18n refactor:
 * - Display strings przeniesione do src/i18n/translations/
 * - DIFFICULTY_CONFIGS zawiera TranslationKey references
 *
 * Wzorzec architektoniczny: Menu (FAZA 6) PRODUKUJE GameConfig przez Builder,
 * Game Logic (FAZA 6.5+) KONSUMUJE go jako immutable input.
 *
 * Multiplayer-ready: sessionId, mode field przygotowane na 'coop'/'pvp'.
 * Analytics-ready: timestamp + sessionId pozwalaja trackowac kazda rozgrywke.
 * Profile-ready: profileId (FAZA 7 wypelni prawdziwym ID).
 */

import type { MapId } from './MapType';
import type { ScenarioId } from './Scenario';
import type { TranslationKey } from '../i18n/i18n';

export type DifficultyId = 'easy' | 'normal' | 'hard' | 'nightmare';

export type GameMode = 'solo' | 'coop' | 'pvp';

/**
 * Immutable game configuration object.
 * Stworzony przez GameConfigBuilder, frozen przed przekazaniem do gry.
 */
export interface GameConfig {
    readonly scenario: ScenarioId;
    readonly map: MapId;                  // tylko playable MapId — locked mapy filtrowane w menu
    readonly difficulty: DifficultyId;
    readonly brawlerId: string;
    readonly profileId: string;           // 'default' do FAZY 7, potem prawdziwy ID
    readonly mode: GameMode;              // 'solo' only w obecnej fazie
    readonly sessionId: string;           // UUID v4 — unique per game session
    readonly timestamp: number;           // Date.now() — analytics + last-session
}

export interface DifficultyConfig {
    /** Translation key dla labelu (np. 'difficulty.easy.label'). */
    labelKey: TranslationKey;
    /** Translation key dla opisu (np. 'difficulty.easy.desc'). */
    descKey: TranslationKey;
    /** Accent color karty (hex). */
    color: string;
}

export const DIFFICULTY_CONFIGS: Record<DifficultyId, DifficultyConfig> = {
    easy:      { labelKey: 'difficulty.easy.label',      descKey: 'difficulty.easy.desc',      color: '#27ae60' },
    normal:    { labelKey: 'difficulty.normal.label',    descKey: 'difficulty.normal.desc',    color: '#e67e22' },
    hard:      { labelKey: 'difficulty.hard.label',      descKey: 'difficulty.hard.desc',      color: '#c0392b' },
    nightmare: { labelKey: 'difficulty.nightmare.label', descKey: 'difficulty.nightmare.desc', color: '#7d1f1f' },
};

/**
 * Builder pattern dla immutable GameConfig.
 * Menu akumuluje wybory przez .setX() methods, na koncu .build() produkuje frozen obiekt.
 *
 * Przyklad uzycia:
 *   const config = new GameConfigBuilder()
 *     .setScenario('ktb')
 *     .setMap('desert')
 *     .setDifficulty('normal')
 *     .setBrawlerId('shadow')
 *     .build();
 */
export class GameConfigBuilder {
    private _scenario?: ScenarioId;
    private _map?: MapId;
    private _difficulty: DifficultyId = 'normal';
    private _brawlerId?: string;
    private _profileId: string = 'default';
    private _mode: GameMode = 'solo';

    setScenario(scenario: ScenarioId): this {
        this._scenario = scenario;
        return this;
    }

    setMap(map: MapId): this {
        this._map = map;
        return this;
    }

    setDifficulty(difficulty: DifficultyId): this {
        this._difficulty = difficulty;
        return this;
    }

    setBrawlerId(brawlerId: string): this {
        this._brawlerId = brawlerId;
        return this;
    }

    setProfileId(profileId: string): this {
        this._profileId = profileId;
        return this;
    }

    setMode(mode: GameMode): this {
        this._mode = mode;
        return this;
    }

    /** Check if all required fields are set */
    isValid(): boolean {
        return !!this._scenario && !!this._map && !!this._brawlerId;
    }

    /** Returns list of missing field names for debugging */
    getMissingFields(): string[] {
        const missing: string[] = [];
        if (!this._scenario) missing.push('scenario');
        if (!this._map) missing.push('map');
        if (!this._brawlerId) missing.push('brawlerId');
        return missing;
    }

    /**
     * Build immutable frozen GameConfig.
     * Rzuca Error jesli brakuje required fields.
     */
    build(): GameConfig {
        if (!this.isValid()) {
            const missing = this.getMissingFields().join(', ');
            throw new Error(`[GameConfigBuilder] Cannot build — missing fields: ${missing}`);
        }
        const config: GameConfig = Object.freeze({
            scenario: this._scenario!,
            map: this._map!,
            difficulty: this._difficulty,
            brawlerId: this._brawlerId!,
            profileId: this._profileId,
            mode: this._mode,
            sessionId: generateSessionId(),
            timestamp: Date.now(),
        });
        return config;
    }
}

/**
 * Generate UUID v4 (multiplayer-ready session identifier).
 * Uzywa crypto.randomUUID() gdy dostepne (nowoczesne przegladarki),
 * fallback do Math.random dla starszych.
 */
export function generateSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // RFC 4122 v4 fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Helper — pretty-print GameConfig dla console.log debug.
 */
export function describeGameConfig(config: GameConfig): string {
    return `[GameConfig] ${config.scenario.toUpperCase()} | ${config.map} | ${config.difficulty} | ${config.brawlerId} | session=${config.sessionId.slice(0, 8)}...`;
}