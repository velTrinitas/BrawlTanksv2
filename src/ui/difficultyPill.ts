/**
 * difficultyPill.ts — v0.246.0: pill POZIOMU TRUDNOSCI w rankingu (wiersz + hub top-5 + filtr).
 *
 * Kolory = DIFFICULTY_COLORS z GameConfig (te same co w pickerze poziomu — gracz kojarzy je od startu meczu).
 * Ikona + etykieta; `compact` = sama ikona (hub, waskie wiersze). KOSZMAR dostaje zloty obrys i puls (Flex):
 * wynik na najtrudniejszym poziomie ma byc widoczny z daleka.
 * i18n: literalne t() w switchu (dynamiczne t(varName) sie nie kompiluje).
 */
import { t } from '../i18n/i18n';
import type { DifficultyId } from '../types/GameConfig';

export const DIFFICULTY_ORDER: readonly DifficultyId[] = ['easy', 'normal', 'hard', 'nightmare'];

export function difficultyIcon(d: DifficultyId): string {
    switch (d) {
        case 'easy': return '🌱';
        case 'normal': return '⚔️';
        case 'hard': return '🔥';
        case 'nightmare': return '💀';
    }
}

export function difficultyLabel(d: DifficultyId): string {
    switch (d) {
        case 'easy': return t('difficulty.easy.label');
        case 'normal': return t('difficulty.normal.label');
        case 'hard': return t('difficulty.hard.label');
        case 'nightmare': return t('difficulty.nightmare.label');
    }
}

/** Pill trudnosci. null = brak danych (stare RPC) => pusty string, wiersz wyglada jak przed v0.246.0. */
export function difficultyPillHtml(d: DifficultyId | null, compact = false): string {
    if (!d) return '';
    const label = difficultyLabel(d);
    return `<span class="bt-diff-pill bt-diff-pill--${d}${compact ? ' is-compact' : ''}" title="${label}" aria-label="${label}">`
        + `<span class="bt-diff-pill-ic" aria-hidden="true">${difficultyIcon(d)}</span>`
        + (compact ? '' : `<span class="bt-diff-pill-tx">${label}</span>`)
        + `</span>`;
}
