/**
 * Scenario.ts — definicja scenariuszy gry (FAZA 6).
 *
 * v0.19.0 i18n refactor:
 * - Display strings przeniesione do src/i18n/translations/
 * - Config zawiera TYLKO structural data + TranslationKey references
 * - UI components uzywaja t() do resolve display strings
 *
 * v0.20.2-fix2 (FAZA 6.5.2b-fix2):
 * - CTF + Castle zmienione na `available: false` z `comingSoonKey: 'common.locked'`
 *   bo mechanika tych scenariuszy nie jest jeszcze zaimplementowana w main.ts
 *   (handluje tylko 'city' + 'desert' map types). Implementacja w FAZA 9+.
 * - SaveKing pozostaje locked jak wczesniej.
 * - Tylko KTB ('city' + 'desert') jest klikalne dla pelnego gameplay.
 *
 * Separation of concerns: config = structural, UI = display.
 */

import type { MapId } from './MapType';
import type { TranslationKey } from '../i18n/i18n';
import { isCastleMode } from '../config/castleFlag'; // OBRON ZAMEK F1
import { isQueenMode } from '../config/queenFlag'; // SAVE THE QUEEN Q1
import { isRangeMode } from '../config/rangeFlag'; // STRZELNICA v0.209.0 (dev-only)

export type ScenarioId = 'ktb' | 'ctf' | 'castle' | 'save_queen' | 'range'; // range = STRZELNICA (poligon pomiarowy, dev) // Q1: save_king (placeholder v0.93, nigdy niezbudowany) -> save_queen

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
        // FAZA CTF F1: unlocked — mapa 'fortified_ruins' zintegrowana modularnie
        // (legacy ctf.html bridge usuniety). Mechanika CTF wchodzi w F2.
        available: true,
        fixedMapId: 'fortified_ruins',
    },
    castle: {
        id: 'castle',
        nameKey: 'scenario.castle.name',
        descKey: 'scenario.castle.desc',
        emoji: '🏰',
        color: '#2d5016',
        // OBRON ZAMEK F1 (2026-09-10): odblokowany TYLKO za ?castle=1 (castleFlag.ts).
        // Modularny rewrite (nie port castle.html — legacy bridge usuniety). Bez flagi
        // karta zostaje z klodka i toastem "wkrotce" — hub bit-identyczny z v0.161.0.
        available: isCastleMode(),
        comingSoonKey: 'common.locked',
        fixedMapId: 'castle_grounds',
    },
    save_queen: {
        id: 'save_queen',
        nameKey: 'scenario.save_queen.name',
        descKey: 'scenario.save_queen.desc',
        emoji: '👸',
        color: '#8e44ad', // krolewski fiolet (lock: zloto = Enigma)
        // SAVE THE QUEEN Q1 (2026-09-11): przejmuje slot save_king (placeholder v0.93, nigdy
        // niezbudowany). Odblokowany TYLKO za ?queen=1 (queenFlag.ts). Bez flagi hub
        // bit-identyczny (kafel nierenderowany w BattleSection, jak dotad save_king).
        available: isQueenMode(),
        comingSoonKey: 'common.locked',
        fixedMapId: 'dungeon',
    },
    range: {
        id: 'range',
        nameKey: 'scenario.range.name',
        descKey: 'scenario.range.desc',
        emoji: '🎯',
        color: '#7f8c8d',
        // STRZELNICA (v0.209.0): narzedzie pomiarowe balansu, NIE tryb dla graczy. Dostepne
        // WYLACZNIE za ?range=1 (RANGE_LIVE = false na stale); bez flagi kafel nierenderowany.
        available: isRangeMode(),
        comingSoonKey: 'common.locked',
        fixedMapId: 'arctic',
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
        SCENARIO_CONFIGS.save_queen,
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