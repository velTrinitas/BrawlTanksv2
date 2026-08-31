    /**
     * i18n.ts — internationalization service.
     *
     * Pattern:
     * - 2 jezyki: 'pl' (no diacritics) + 'en'
     * - localStorage persistuje wybor miedzy sesjami
     * - Type-safe: TranslationKey = keyof typeof pl, en wymusza ten sam shape
     * - Fallback chain: missing key in current lang → fallback to PL → return raw key (dev visibility)
     * - Parameter substitution: t('hello.name', { name: 'X' }) — replaces {name} placeholders
     *
     * Usage:
     *   import { t, i18n } from '../i18n/i18n';
     *   const label = t('hub.play');                              // "GRAJ" / "PLAY"
     *   const cta = t('scenario.ktb.cta.desert');                 // "Wyrusz na Pustynie! 🐪"
     *   const continueMsg = t('hub.continue', { brawler: 'Shadow', map: 'Pustynia' });
     *   i18n.setLanguage('en');                                   // switch to English
     *   i18n.onLanguageChange(lang => rerenderUI());              // subscribe to changes
     */

    import { pl } from './translations/pl';
    import { en } from './translations/en';

    export type Language = 'pl' | 'en';

    /** Type-safe translation keys derived from pl.ts structure. */
    export type TranslationKey = keyof typeof pl;

    /** Parameters for substitution in translations (e.g., {name} → 'value'). */
    export type TranslationParams = Record<string, string | number>;

    const ALL_TRANSLATIONS: Record<Language, typeof pl> = {
        pl,
        en,
    };

    const STORAGE_KEY = 'brawltanks.language.v1';
    const DEFAULT_LANGUAGE: Language = 'pl';

    /**
     * v0.134.0 — JEZYK Z PRZEGLADARKI. Jedyne zrodlo tej reguly w calej grze.
     *
     * POWOD. Autodetekcja istniala juz wczesniej, ale WYLACZNIE w `IdentityScreen`,
     * czyli odpalala sie dopiero przy zakladaniu konta. Skutek: gracz z zagranicy
     * ogladal ekran startowy i CALY onboarding (nick, awatar, flaga) po polsku,
     * a gra przelaczala sie na angielski dopiero po zatwierdzeniu profilu — czyli
     * pierwsze wrazenie dostawal w jezyku, ktorego nie rozumie.
     *
     * CZYTAMY CALA LISTE `navigator.languages`, nie sam `navigator.language`.
     * Telefon ustawiony na „angielski, potem polski" nalezy niemal zawsze do Polaka;
     * odwrotny przypadek (anglojezyczne dziecko z polskim na liscie) praktycznie nie
     * wystepuje. Przy grupie docelowej 9-12 lat z Polski to jest wlasciwa strona,
     * po ktorej warto sie mylic.
     *
     * Fallback na polski takze przy braku API — grupa docelowa jest polska.
     */
    export function detectBrowserLanguage(): Language {
        try {
            const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
            return tags.some(l => l?.toLowerCase().startsWith('pl')) ? 'pl' : 'en';
        } catch {
            return DEFAULT_LANGUAGE;
        }
    }

    /**
     * I18nService — singleton zarzadzajacy aktualnym jezykiem i tlumaczeniami.
     * Eksportowany jako `i18n` na koncu pliku.
     */
    class I18nService {
        private currentLang: Language = DEFAULT_LANGUAGE;
        private translations: typeof pl = pl;
        private listeners: Array<(lang: Language) => void> = [];

        constructor() {
            this.loadPersistedLanguage();
        }

        /**
         * Kolejnosc pierwszenstwa (v0.134.0):
         *   1. zapisany WYBOR gracza z Ustawien  — zawsze wygrywa,
         *   2. jezyk PROFILU                     — dosypuje `main.ts` po boocie,
         *   3. jezyk PRZEGLADARKI                — tutaj, gdy nie ma 1 ani 2,
         *   4. polski                            — gdy nic nie zadziala.
         *
         * WYKRYTEGO JEZYKA CELOWO NIE ZAPISUJEMY do localStorage. Zapis oznaczalby
         * „gracz wybral", a to tylko domysl: ma sie aktualizowac, gdy ktos zmieni
         * ustawienia przegladarki, a nie zamarzac na pierwszym trafieniu. Zapisuje
         * wylacznie `setLanguage()`, czyli swiadoma zmiana w Ustawieniach.
         */
        private loadPersistedLanguage(): void {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved === 'pl' || saved === 'en') {
                    this.currentLang = saved;
                    this.translations = ALL_TRANSLATIONS[saved];
                    return;
                }
            } catch (e) {
                console.warn('[i18n] Failed to load persisted language', e);
            }
            // Brak zapisanego wyboru => pytamy przegladarke. Bez tego kroku gra
            // startowala twardo po polsku dla calego swiata.
            const detected = detectBrowserLanguage();
            this.currentLang = detected;
            this.translations = ALL_TRANSLATIONS[detected];
        }

        /**
         * Zmien aktualny jezyk.
         * Zapisuje wybor do localStorage i powiadamia listeners.
         * Idempotent — wywolanie z aktualnym jezykiem nic nie zmienia.
         */
        setLanguage(lang: Language): void {
            if (this.currentLang === lang) return;
            this.currentLang = lang;
            this.translations = ALL_TRANSLATIONS[lang];
            try {
                localStorage.setItem(STORAGE_KEY, lang);
            } catch (e) {
                console.warn('[i18n] Failed to persist language', e);
            }
            for (const fn of this.listeners) {
                try {
                    fn(lang);
                } catch (e) {
                    console.warn('[i18n] Listener error', e);
                }
            }
        }

        /** Aktualny jezyk ('pl' lub 'en'). */
        getLanguage(): Language {
            return this.currentLang;
        }

        /**
         * Translate a key. Optional parameter substitution.
         *
         * Fallback chain:
         * 1. Translation in current language
         * 2. Translation in PL (default fallback)
         * 3. Raw key (so developer sees what's missing)
         */
        t(key: TranslationKey, params?: TranslationParams): string {
            let raw: string;
            const fromCurrent = this.translations[key];
            if (typeof fromCurrent === 'string') {
                raw = fromCurrent;
            } else {
                // Fallback to PL
                const fromPl = pl[key];
                if (typeof fromPl === 'string') {
                    raw = fromPl;
                    console.warn(`[i18n] Missing key in ${this.currentLang}: "${key}" — falling back to PL`);
                } else {
                    console.warn(`[i18n] Unknown key: "${key}"`);
                    return key;
                }
            }

            if (!params) return raw;

            // Replace {paramName} placeholders
            return Object.keys(params).reduce((acc, k) => {
                return acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
            }, raw);
        }

        /**
         * Subscribe to language changes.
         * Returns unsubscribe function (call to remove listener).
         */
        onLanguageChange(fn: (lang: Language) => void): () => void {
            this.listeners.push(fn);
            return () => {
                this.listeners = this.listeners.filter(l => l !== fn);
            };
        }

        /**
         * Helper — czy klucz istnieje w obecnym jezyku?
         * Uzywaj dla optional features (np. tutorial steps ktore moga byc niedostepne).
         */
        hasKey(key: TranslationKey): boolean {
            return typeof this.translations[key] === 'string';
        }
    }

    // ============================================================
    // Singleton + convenience function
    // ============================================================

    /** Singleton instance — import jako `i18n` dla setLanguage/onLanguageChange. */
    export const i18n = new I18nService();

    /**
     * Convenience shortcut — import jako `t` dla najczestszego use case.
     * Bound do singleton, mozna swobodnie destrukturyzowac lub przekazywac.
     *
     * @example
     *   import { t } from '../i18n/i18n';
     *   const label = t('hub.play');
     */
    export const t: (key: TranslationKey, params?: TranslationParams) => string =
        i18n.t.bind(i18n);