/**
 * Scenario.ts — definicja scenariuszy gry (FAZA 6).
 *
 * v0.19.0 i18n refactor:
 * - Display strings przeniesione do src/i18n/translations/
 * - Config zawiera TYLKO structural data + TranslationKey references
 * - UI components uzywaja t() do resolve display strings
 *
 * Separation of concerns: config = structural, UI = display.
 *
 * KTB jest jedynym scenariuszem gdzie gracz wybiera mape (Desert/Cyberpunk).
 * Pozostale scenariusze maja zdefiniowane fixed maps lub sa locked.
 */

import type { MapId } from './MapType';
import type { TranslationKey } from '../i18n/i18n';

export type ScenarioId = 'ktb' | 'ctf' | 'castle' | 'save_king';

export interface ScenarioConfig {
    id: ScenarioId;
    /** Translation key dla wyswietlanej nazwy (np. 'scenario.ktb.name'). */
    nameKey: TranslationKey;
    /** Translation key dla krotkiego opisu pod karta. */
    descKey: TranslationKey;
    /** Emoji ikona — Unicode, nie wymaga tlumaczenia. */
    emoji: string;
    /** Accent color karty (hex). */
    color: string;
    /** Czy klikalne (false = locked). */
    available: boolean;
    /** Translation key dla badge tekstu gdy locked (np. 'common.locked'). */
    comingSoonKey?: TranslationKey;
    /** null = user choice (KTB), string = enforced map. */
    fixedMapId: string | null;
    /**
     * Legacy bridge — osobny HTML plik dla CTF/Castle.
     * FAZA 6.5+ zlikwidujemy gdy zintegrujemy modularnie.
     */
    externalFile?: string;
}

export const SCENARIO_CONFIGS: Record<ScenarioId, ScenarioConfig> = {
    ktb: {
        id: 'ktb',
        nameKey: 'scenario.ktb.name',
        descKey: 'scenario.ktb.desc',
        emoji: '💀',
        color: '#e74c3c',
        available: true,
        fixedMapId: null, // user wybiera Desert lub Cyberpunk
    },
    ctf: {
        id: 'ctf',
        nameKey: 'scenario.ctf.name',
        descKey: 'scenario.ctf.desc',
        emoji: '🚩',
        color: '#3498db',
        available: true,
        fixedMapId: 'fortified_ruins',
        externalFile: 'ctf.html',
    },
    castle: {
        id: 'castle',
        nameKey: 'scenario.castle.name',
        descKey: 'scenario.castle.desc',
        emoji: '🏰',
        color: '#2d5016',
        available: true,
        fixedMapId: 'castle_grounds',
        externalFile: 'castle.html',
    },
    save_king: {
        id: 'save_king',
        nameKey: 'scenario.save_king.name',
        descKey: 'scenario.save_king.desc',
        emoji: '👑',
        color: '#8e44ad',
        available: false,
        comingSoonKey: 'common.locked',
        fixedMapId: null,
    },
};

export function getScenarioConfig(id: ScenarioId): ScenarioConfig {
    return SCENARIO_CONFIGS[id];
}

export function isScenarioAvailable(id: ScenarioId): boolean {
    return SCENARIO_CONFIGS[id].available;
}

/**
 * Zwraca liste scenariuszy w kolejnosci wyswietlania w UI.
 * Available scenariusze idą pierwsze, locked na koncu.
 */
export function getOrderedScenarios(): ScenarioConfig[] {
    return [
        SCENARIO_CONFIGS.ktb,
        SCENARIO_CONFIGS.ctf,
        SCENARIO_CONFIGS.castle,
        SCENARIO_CONFIGS.save_king,
    ];
}

/**
 * Resolve CTA translation key dla danego scenariusza + opcjonalnie mapy.
 *
 * Logic:
 * - KTB ma rozne CTA per mapa: 'scenario.ktb.cta.desert' / 'scenario.ktb.cta.city'
 * - Pozostale scenariusze maja jeden CTA: 'scenario.{id}.cta'
 *
 * Usage:
 *   const ctaText = t(getCtaKey('ktb', 'desert'));  // "Wyrusz na Pustynie! 🐪"
 *   const ctaText = t(getCtaKey('ctf', null));      // "Zdobadz Flagi! 🚩"
 */
export function getCtaKey(scenarioId: ScenarioId, mapId: MapId | null): TranslationKey {
    if (scenarioId === 'ktb' && mapId) {
        return `scenario.ktb.cta.${mapId}` as TranslationKey;
    }
    return `scenario.${scenarioId}.cta` as TranslationKey;
}