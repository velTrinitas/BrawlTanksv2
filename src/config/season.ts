/**
 * season.ts — SEASON-1/2 (v0.118.0). Roadmapa sezonow + progi nagrod Season Tracku.
 *
 * SEASON-2: SEZONY SA LISTA (roadmapa do 08.2027, sezon = 2 miesiace) i biezacy
 * wybiera sie AUTOMATYCZNIE po dacie (getCurrentSeason) — zero recznych podmian
 * przez rok. Decyzja Mariusza: S2 Arena konczy sie 31.08.2026, a 01.09.2026
 * (premiera dla testerow) startuje S3 Back to School.
 *
 * Trofea sezonowe = trofea zdobyte W TRAKCIE sezonu (licznik od 0, niezalezny od
 * trofeow konta; konto NIGDY nie jest resetowane). Zmiana sezonu => klient sam
 * resetuje liczniki (ProgressionService.ensureSeason, wzorzec dayKey rozkazow).
 * Nagrody progow = sigmy + skrzynki przez istniejace mechanizmy (bolts/
 * cratesEarned) — zero nowej ekonomii.
 */
import type { TranslationKey } from '../i18n/i18n';

export interface SeasonConfig {
    /**
     * NIERUCHOMY id ('s2', 's3'...). To NIE jest numer sezonu pokazywany graczowi —
     * numer siedzi w tekscie i18n pod `nameKey`. Id jest KLUCZEM ZAPISU STANU:
     *   - ProgressionService.ensureSeason (307): obce id kasuje `trophies` I `claimed`,
     *   - kolumna `seasonId` w chmurze (571) + warunek merge przy syncPull (835),
     *   - nazwa pliku artu `public/seasons/<id>.jpg` (SeasonOverlay:31).
     *
     * PO STARCIE SEZONU ID SIE NIE ZMIENIA. Proba 2026-08-25 (przenumerowanie calej
     * roadmapy o 1 w dol, zeby numer zgadzal sie z artem promo) zostala COFNIETA,
     * bo dawala dwie szkody:
     *   1) reset licznika i listy `claimed` u wszystkich w trakcie trwajacego sezonu
     *      => nagrody Season Tracku do odebrania po raz drugi;
     *   2) gorsze: PRZEKORZYSTANIE zwolnionego id dla INNEGO sezonu. Stare wiersze
     *      w Supabase maja seasonId 's2' (Arena), a po przenumerowaniu 's2' oznacza
     *      Back to School — warunek w syncPull przechodzi, wiec stary postep wlewa
     *      sie do nowego sezonu, a `seasonClaimed` idzie unia i oznacza progi jako
     *      odebrane, choc nikt ich nie zdobyl. Mina odpala dopiero w dniu startu.
     *
     * Chcesz zmienic numer widziany przez gracza? Zmien TEKST w pl.ts/en.ts.
     */
    readonly id: string;
    readonly nameKey: TranslationKey;
    /** ISO lokalne (bez strefy = czas lokalny gracza — wystarczajace dla gry casual). */
    readonly start: string;
    readonly end: string;
    /** Motyw do pillu/popupu (fallback grafiki sezonu). */
    readonly emoji: string;
    readonly accentColor: string;
    /** Bullet-lista "co wprowadza sezon" w popupie (SeasonOverlay). */
    readonly bulletKeys: readonly TranslationKey[];
}

export interface SeasonMilestone {
    /** Prog trofeow SEZONOWYCH. */
    readonly threshold: number;
    readonly bolts: number;
    /** Opcjonalnie skrzynki (cratesEarned += n). */
    readonly crates?: number;
}

/** Roadmapa sezonow (propozycja 6 nowych zatwierdzona 2026-08-24). */
export const SEASONS: readonly SeasonConfig[] = [
    {
        id: 's2', nameKey: 'season.s2.name', emoji: '🎖️', accentColor: '#f1c40f',
        start: '2026-08-01T00:00:00', end: '2026-08-31T23:59:59',
        bulletKeys: ['season.s2.b1', 'season.s2.b2', 'season.s2.b3'],
    },
    {
        id: 's3', nameKey: 'season.s3.name', emoji: '🎒', accentColor: '#3aa0e0',
        start: '2026-09-01T00:00:00', end: '2026-10-31T23:59:59',
        bulletKeys: ['season.s3.b1', 'season.s3.b2', 'season.s3.b3'],
    },
    {
        id: 's4', nameKey: 'season.s4.name', emoji: '🎄', accentColor: '#2ecc71',
        start: '2026-11-01T00:00:00', end: '2026-12-31T23:59:59',
        bulletKeys: ['season.s4.b1', 'season.s4.b2', 'season.s4.b3'],
    },
    {
        id: 's5', nameKey: 'season.s5.name', emoji: '🧊', accentColor: '#4dd7c8',
        start: '2027-01-01T00:00:00', end: '2027-02-28T23:59:59',
        bulletKeys: ['season.s5.b1', 'season.s5.b2', 'season.s5.b3'],
    },
    {
        id: 's6', nameKey: 'season.s6.name', emoji: '🐣', accentColor: '#a3e635',
        start: '2027-03-01T00:00:00', end: '2027-04-30T23:59:59',
        bulletKeys: ['season.s6.b1', 'season.s6.b2', 'season.s6.b3'],
    },
    {
        id: 's7', nameKey: 'season.s7.name', emoji: '🌭', accentColor: '#ff9f43',
        start: '2027-05-01T00:00:00', end: '2027-06-30T23:59:59',
        bulletKeys: ['season.s7.b1', 'season.s7.b2', 'season.s7.b3'],
    },
    {
        id: 's8', nameKey: 'season.s8.name', emoji: '🏖️', accentColor: '#37a0e0',
        start: '2027-07-01T00:00:00', end: '2027-08-31T23:59:59',
        bulletKeys: ['season.s8.b1', 'season.s8.b2', 'season.s8.b3'],
    },
];

/**
 * Progi Season Tracku (wspolne dla sezonow — kalibracja per sezon mozliwa pozniej;
 * sezon ~2 miesiace, swietna gra daje ~50 trofeow/mecz => 1500 = ~30 dobrych meczy).
 */
export const SEASON_MILESTONES: readonly SeasonMilestone[] = [
    { threshold: 100, bolts: 100 },
    { threshold: 250, bolts: 150, crates: 1 },
    { threshold: 500, bolts: 250 },
    { threshold: 900, bolts: 400, crates: 1 },
    { threshold: 1500, bolts: 600, crates: 1 },
];

// ══════════════════════════════════════════════════════════════════════════
// PODGLAD SEZONU (dev) — ?season=<id> [&seasonday=N]
// ══════════════════════════════════════════════════════════════════════════
/**
 * Sezon wybiera sie po dacie, wiec sezonu, ktory jeszcze nie wystartowal, NIE DA
 * SIE zobaczyc — a to znaczy, ze nie da sie go tez odebrac przed premiera. Flaga
 * przesuwa ZEGAR (nie podmienia wyboru), dzieki czemu wszystkie cztery funkcje
 * ponizej — lacznie z odliczaniem dni — sa spojne same z soba.
 *
 *   ?season=s3              -> pierwszy dzien sezonu s3
 *   ?season=s3&seasonday=40 -> 40. dzien sezonu s3 (test "koniec sie zbliza")
 *   ?seasonday=40           -> 40. dzien BIEZACEGO sezonu
 *
 * Wzorzec flag URL jak ?hub= / ?zoom= / ?superv2 w main.ts.
 *
 * UWAGA — podglad jest ODCIETY OD CHMURY. `isSeasonOverridden()` wylacza syncPush
 * w ProgressionService: bez tego rozegranie meczu w podgladzie zapisaloby do
 * Supabase `seasonId` sezonu, ktory jeszcze nie wystartowal, i przy prawdziwej
 * premierze ten wiersz zmergowalby sie jako "postep juz zdobyty". Dokladnie ta
 * klasa szkody, ktora naprawialismy 26.08.2026.
 */
let _devNowCache: number | null | undefined;

function devNowOverride(): number | null {
    if (_devNowCache !== undefined) return _devNowCache;
    _devNowCache = null;
    try {
        if (typeof window === 'undefined') return _devNowCache;
        const q = new URLSearchParams(window.location.search);
        const wantId = q.get('season');
        const dayRaw = q.get('seasonday');
        if (!wantId && dayRaw === null) return _devNowCache;

        const day = Math.max(0, Math.floor(Number(dayRaw ?? 0)) || 0);
        const base = wantId
            ? SEASONS.find(s => s.id === wantId)
            : SEASONS.find(s => Date.now() <= Date.parse(s.end)) ?? SEASONS[SEASONS.length - 1];
        if (!base) {
            console.warn(`[season] ?season=${wantId} — nie ma takiego sezonu. Znane: ${SEASONS.map(s => s.id).join(', ')}`);
            return _devNowCache;
        }
        // +12 h, zeby wyladowac w srodku doby, a nie na granicy start/end
        _devNowCache = Date.parse(base.start) + day * 86_400_000 + 43_200_000;
        console.warn(
            `[season] PODGLAD: udaje ${base.id}, dzien ${day} (${new Date(_devNowCache).toISOString().slice(0, 10)}). ` +
            'Sync progresji do chmury WYLACZONY.',
        );
    } catch {
        _devNowCache = null;   // sandbox bez URLSearchParams — zachowuj sie normalnie
    }
    return _devNowCache;
}

/** True gdy dziala podglad sezonu — ProgressionService blokuje wtedy syncPush. */
export function isSeasonOverridden(): boolean {
    return devNowOverride() !== null;
}

/** Zegar dla logiki sezonowej: przesuniety w podgladzie, normalny w produkcji. */
function seasonNow(): number {
    return devNowOverride() ?? Date.now();
}

/**
 * Biezacy sezon wg daty: pierwszy z konca >= teraz (sezony stykaja sie datami).
 * Po ostatnim wpisie roadmapy => ostatni sezon w stanie "zakonczony"
 * (isSeasonActive=false) — przypomnienie o przedluzeniu roadmapy.
 */
export function getCurrentSeason(now: number = seasonNow()): SeasonConfig {
    return SEASONS.find(s => now <= Date.parse(s.end)) ?? SEASONS[SEASONS.length - 1];
}

export function isSeasonActive(now: number = seasonNow()): boolean {
    const s = getCurrentSeason(now);
    return now >= Date.parse(s.start) && now <= Date.parse(s.end);
}

/** Pelne dni do konca biezacego sezonu (ceil; 0 gdy skonczony). */
export function seasonDaysLeft(now: number = seasonNow()): number {
    const ms = Date.parse(getCurrentSeason(now).end) - now;
    return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Numer do pillu na belce ('S2'/'S3'...) — z id, bez i18n. */
export function seasonShortLabel(now: number = seasonNow()): string {
    return getCurrentSeason(now).id.toUpperCase();
}
