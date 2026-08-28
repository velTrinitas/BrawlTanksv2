/**
 * seasonContent.ts — MANIFEST SEZONU: 6 znajdziek, wagi spawnu, progi nagrod.
 *
 * Silnik sezonowy, warstwy 1-3 (projekt: docs/season-kit/SEASON_ENGINE.md).
 * Nowy sezon = NOWY WPIS w SEASON_CONTENT + paczka plikow w public/seasons/<id>/.
 * Zero nowego kodu mechaniki — silnik czyta manifest.
 *
 * PODZIAL ODPOWIEDZIALNOSCI: ten plik mowi CO i ILE. `SeasonPickup.ts` wie tylko,
 * JAK to narysowac i jak sie zachowuje. `main.ts` spina spawn i zbieranie.
 *
 * Sezon bez wpisu nie ma znajdziek i to jest POPRAWNY stan (Arena to sezon sprzed
 * kitu, roadmapa 2027 nie jest zaprojektowana). Kazdy kod wolajacy musi radzic
 * sobie z `null` z getSeasonContent().
 *
 * KONWENCJA INDEKSOWANIA (projekt ma historie bugow off-by-one): wszystkie reguly
 * — progi, bramki zbiorow, pity — klucz-ujemy po `value` (1..6), NIGDY po indeksie
 * tablicy. Tablica moze byc 0-based; `value` jest 1-based i to jest jedyny "numer
 * przedmiotu" w regulach.
 */
import type { TranslationKey } from '../i18n/i18n';

/** Wartosc = numer przedmiotu w regulach = punkty za sztuke = tier celebracji. */
export type SeasonItemValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface SeasonItemDef {
    readonly value: SeasonItemValue;
    readonly nameKey: TranslationKey;
    /** Sciezka wzgledem BASE_URL. Docelowo `seasons/<id>/itemN.png` (128x128 RGBA). */
    readonly asset: string;
    /** Kolor poswiaty — niesie rzadkosc, bo rozmiar jest jednakowy dla wszystkich. */
    readonly glow: number;
    /** Waga losowania spawnu; sumuja sie do 100. */
    readonly weight: number;
}

/** Prog toru ILOSCI: za `points` punktow leci `crates` skrzynek sezonowych. */
export interface SeasonPointThreshold {
    readonly points: number;
    readonly crates: number;
}

export interface SeasonContentDef {
    readonly seasonId: string;
    /** Nazwa licznika w HUD/endcardzie ("ksiazki"). */
    readonly counterKey: TranslationKey;
    /** DOKLADNIE 6 pozycji — walidowane w runtime przez assertSeasonContent(). */
    readonly items: readonly SeasonItemDef[];
    /** Tor ILOSCI. Progi rosnace; nagroda w istniejacej ekonomii (skrzynki). */
    readonly pointThresholds: readonly SeasonPointThreshold[];
    /**
     * Tor ROZNORODNOSCI — bramki SET-based po `value`, kolejnosc zdobycia bez
     * znaczenia. Gracz moze trafic "szostke" pierwsza; liczy sie tylko komplet zbioru.
     */
    readonly varietyGates: {
        readonly crate: readonly SeasonItemValue[];
        readonly title: readonly SeasonItemValue[];
        readonly full: readonly SeasonItemValue[];
    };
    readonly spawn: {
        readonly maxAlive: number;
        readonly everyMs: number;
        /** Po ilu nieudanych probach o "szostke" zaczyna rosnac jej szansa. */
        readonly pityAfter: number;
        /** O ile punktow procentowych rosnie szansa za kazda kolejna probe. */
        readonly pityStepPct: number;
    };
    /** Rozmiar na mapie — JEDNAKOWY dla wszystkich szesciu (rzadkosc niesie kolor). */
    readonly size: number;
    readonly radius: number;
}

// ══════════════════════════════════════════════════════════════════════════
// SEZON 3 — "Powrot do Szkoly"
// ══════════════════════════════════════════════════════════════════════════
/**
 * Lista zatwierdzona przez Mariusza 28.08.2026 (dec. A w SEASON_ENGINE.md).
 *
 * ⚠️ ASSETY SA TYMCZASOWE. Paczka `public/seasons/s3/item1..6.png` jeszcze nie
 * istnieje — do czasu jej dostarczenia szesc pozycji wskazuje na TRZY istniejace
 * ksiazki, zeby cala mechanika (wagi, pity, bramki zbiorow, progi) byla testowalna
 * juz teraz. Podmiana na docelowa paczke = zmiana szesciu stringow `asset`,
 * zero zmian w kodzie. Bramka G3 pilnuje kompletnosci paczki, gdy ta powstanie.
 */
const TMP_GREEN = 'assets/items/book_green_100.png';
const TMP_BLUE = 'assets/items/book_blue_100.png';
const TMP_GOLD = 'assets/items/book_golden_100.png';

const S3_ITEMS: readonly SeasonItemDef[] = [
    { value: 1, nameKey: 'season.s3.item1', asset: TMP_GREEN, glow: 0x54d17a, weight: 40 },
    { value: 2, nameKey: 'season.s3.item2', asset: TMP_GREEN, glow: 0x7fe39a, weight: 25 },
    { value: 3, nameKey: 'season.s3.item3', asset: TMP_BLUE,  glow: 0x4aa8f0, weight: 15 },
    { value: 4, nameKey: 'season.s3.item4', asset: TMP_BLUE,  glow: 0x86c9ff, weight: 10 },
    { value: 5, nameKey: 'season.s3.item5', asset: TMP_GOLD,  glow: 0xa46cf0, weight: 7 },
    { value: 6, nameKey: 'season.s3.item6', asset: TMP_GOLD,  glow: 0xff5e6a, weight: 3 },
];

const SEASON_CONTENT: readonly SeasonContentDef[] = [
    {
        seasonId: 's3',
        counterKey: 'season.s3.counter',
        items: S3_ITEMS,
        // Progi rosnace, zestrojone tak, zeby nagrody padaly rytmicznie przez sezon,
        // a nie klebily sie na koncu. Wartosci startowe do kalibracji po playtescie.
        pointThresholds: [
            { points: 25, crates: 1 },
            { points: 60, crates: 1 },
            { points: 120, crates: 1 },
            { points: 200, crates: 2 },
        ],
        varietyGates: {
            crate: [1, 2, 3],
            title: [1, 2, 3, 4, 5],
            full: [1, 2, 3, 4, 5, 6],
        },
        spawn: { maxAlive: 3, everyMs: 4000, pityAfter: 40, pityStepPct: 2 },
        size: 51,
        radius: 38,
    },
];

/**
 * Walidacja manifestu w runtime. Silnik ma krzyknac PRZY STARCIE, a nie objawic
 * sie graczowi dziura w kolekcji, ktorej nie da sie ukonczyc.
 */
function assertSeasonContent(c: SeasonContentDef): boolean {
    const errs: string[] = [];
    if (c.items.length !== 6) errs.push(`items.length=${c.items.length}, wymagane 6`);
    const values = c.items.map(i => i.value).sort((a, b) => a - b).join(',');
    if (values !== '1,2,3,4,5,6') errs.push(`wartosci=[${values}], wymagane 1..6 bez powtorzen`);
    const w = c.items.reduce((s, i) => s + i.weight, 0);
    if (Math.abs(w - 100) > 0.01) errs.push(`suma wag=${w}, wymagane 100`);
    let prev = 0;
    for (const t of c.pointThresholds) {
        if (t.points <= prev) errs.push(`progi punktowe nierosnace: ${prev} -> ${t.points}`);
        prev = t.points;
    }
    if (errs.length) {
        console.error(`[season] MANIFEST ${c.seasonId} NIEPOPRAWNY: ${errs.join(' | ')}`);
        return false;
    }
    return true;
}

/** Tresc biezacego sezonu albo null, gdy sezon nie ma znajdziek lub manifest jest zly. */
export function getSeasonContent(seasonId: string): SeasonContentDef | null {
    const c = SEASON_CONTENT.find(x => x.seasonId === seasonId);
    if (!c) return null;
    return assertSeasonContent(c) ? c : null;
}

/** Definicja przedmiotu po jego WARTOSCI (nie po indeksie tablicy). */
export function getItemByValue(c: SeasonContentDef, value: number): SeasonItemDef | null {
    return c.items.find(i => i.value === value) ?? null;
}

/**
 * Losowanie przedmiotu wg wag, z PITY na "szostke".
 *
 * Pity nie jest opcja, tylko wymogiem dla wieku 9-12: przy wadze 3% gracz moze
 * przez caly sezon nie zobaczyc przedmiotu wartosci 6, czyli nigdy nie skompletowac
 * kolekcji. Zasada brzmi "nagradzamy pilnosc, nie szczescie": im dluzej szostka nie
 * wypadla, tym wieksza jej szansa.
 *
 * @param missStreak ile prob z rzedu NIE dalo przedmiotu o wartosci 6
 */
export function rollSeasonItem(c: SeasonContentDef, missStreak: number): SeasonItemDef {
    const top = c.items.find(i => i.value === 6)!;
    const bonusPct = Math.max(0, missStreak - c.spawn.pityAfter) * c.spawn.pityStepPct;
    const topWeight = Math.min(100, top.weight + bonusPct);

    if (bonusPct > 0 && Math.random() * 100 < topWeight) return top;

    // zwykle losowanie wazone po pozostalych (albo po wszystkich, gdy pity nieaktywne)
    const pool = bonusPct > 0 ? c.items.filter(i => i.value !== 6) : c.items;
    const total = pool.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const it of pool) {
        r -= it.weight;
        if (r <= 0) return it;
    }
    return pool[pool.length - 1];
}
