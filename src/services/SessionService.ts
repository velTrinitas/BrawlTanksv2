/**
 * SessionService.ts — persistencja "Last Session" dla MainHub "Kontynuuj" shortcut.
 *
 * Pattern:
 * - Gracz uruchamia grę → main.ts zapisuje session snapshot (po build GameConfig)
 * - Gracz wraca do menu → MainHub czyta lastSession i pokazuje:
 *   "Kontynuuj jako [brawler] na [mapa]" z guzikiem 🔁
 * - Kliknięcie shortcut = od razu BrawlerPicker z auto-fill (jeden klik do GRAJ!)
 *
 * Zakres FAZA 6: zapis/odczyt podstawowy.
 * FAZA 7: rozszerzenie o per-profileId namespace (każdy gracz ma swoje last session).
 */

import type { MapId } from '../types/MapType';
import type { ScenarioId } from '../types/Scenario';
import type { DifficultyId, GameMode } from '../types/GameConfig';

/**
 * Snapshot ostatniej sesji — minimalne pola dla "Continue" shortcut.
 * NIE zawiera sessionId/timestamp — to robi nowy snapshot przy submit.
 */
export interface LastSession {
    brawlerId: string;
    scenario: ScenarioId;
    map: MapId;
    difficulty: DifficultyId;
    mode: GameMode;
    /** Kiedy gracz ostatnio uruchomił grę (Date.now()). */
    lastPlayedAt: number;
    /** Display info — żeby MainHub mógł pokazać "Kontynuuj jako X na Y" bez dodatkowych lookups. */
    brawlerName: string;
    mapName: string;
    scenarioName: string;
}

const STORAGE_KEY = 'brawltanks.lastSession.v1';

/**
 * Maksymalny wiek lastSession w dniach.
 * Po tym czasie shortcut nie wyświetla się (zbyt stara sesja = pewnie inny gracz).
 */
const SESSION_MAX_AGE_DAYS = 30;

export class SessionService {
    /**
     * Zapisz aktualną sesję.
     * Wywoływane z main.ts po startGame() przed entry do PLAYING state.
     */
    saveLastSession(session: LastSession): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (e) {
            console.warn('[SessionService] Failed to save lastSession', e);
        }
    }

    /**
     * Odczytaj ostatnią sesję.
     * Zwraca null jeśli:
     * - localStorage pusty
     * - JSON broken
     * - sesja starsza niż SESSION_MAX_AGE_DAYS
     */
    getLastSession(): LastSession | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;

            const parsed = JSON.parse(raw) as Partial<LastSession>;

            // Validate required fields
            if (!parsed.brawlerId || !parsed.scenario || !parsed.map || !parsed.lastPlayedAt) {
                return null;
            }

            // Check age
            const ageDays = (Date.now() - parsed.lastPlayedAt) / (1000 * 60 * 60 * 24);
            if (ageDays > SESSION_MAX_AGE_DAYS) {
                this.clearLastSession();
                return null;
            }

            return parsed as LastSession;
        } catch (e) {
            console.warn('[SessionService] Failed to parse lastSession', e);
            return null;
        }
    }

    /** Wyczyść lastSession (np. przy "zacznij od nowa" w UI). */
    clearLastSession(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[SessionService] Failed to clear lastSession', e);
        }
    }

    /** Czy istnieje valid lastSession do pokazania w MainHub? */
    hasValidLastSession(): boolean {
        return this.getLastSession() !== null;
    }
}

// Singleton
export const sessionService = new SessionService();