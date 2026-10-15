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
import { getCosmetic } from './cosmetics'; // v0.206.0 — walidacja nagrody za komplet

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

/**
 * v0.250.0 SEZON v2 — SZLAK SEZONU. Jeden tor nagrod napedzany sezoniakami:
 *  - 'points': suma punktow sezoniakow (`season.collected`) >= need,
 *  - 'set':    liczba ROZNYCH zebranych sezoniakow (1..6) >= need,
 *  - 'complete': liczba zdobytych POZOSTALYCH tierow >= need (nagroda za ukonczony sezon; tier na koncu listy).
 * Klucz odbioru = `trk:<id>` (NIE wartosc progu) — progi mozna stroic bez podwojnych wyplat.
 * Id tieru jest NIERUCHOME jak id sezonu: zmiana id = ponowna wyplata.
 */
export type SeasonTrackKind = 'points' | 'set' | 'complete';

export interface SeasonTrackReward {
    readonly bolts?: number;
    readonly crates?: number;
    /** Id z rejestru cosmetics.ts (zwykle `season: '<id>'` — tylko z toru). */
    readonly cosmetic?: string;
    /** Miejsce na CZOLG SEZONU (osobna faza). Do tego czasu tier placi bolts/crates. */
    readonly seasonTank?: true;
}

export interface SeasonTrackTier {
    readonly id: string;
    readonly kind: SeasonTrackKind;
    readonly need: number;
    readonly reward: SeasonTrackReward;
}

export interface SeasonContentDef {
    readonly seasonId: string;
    /** v0.250.0 — Szlak Sezonu (SEZON v2). Brak = sezon bez toru (stary model). */
    readonly track?: readonly SeasonTrackTier[];
    /** v0.250.0 — ikona licznika sezoniakow (sterta przedmiotow sezonu), wzgledem BASE_URL. */
    readonly counterIcon?: string;
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
    /**
     * v0.206.0 — CO DAJA bramki `title` (5/5) i `full` (6/6). Do v0.205.0 config mial tylko
     * tablice `value[]`, a UI pokazywalo 🏅 i 👑 za nagrody, ktorych `creditSeasonRewards`
     * NIE wyplacal — obietnica bez pokrycia. Teraz nagroda jest DANYMI sezonu (zasada
     * SEASON_ENGINE: nowy sezon = wpis w manifescie, zero kodu):
     *  - `titleBolts`   — sigmy za 5/5 (ikona = art sigmy),
     *  - `fullCosmetic` — id kosmetyku z rejestru `cosmetics.ts` za komplet 6/6
     *                     (ikona = miniatura). Walidowany w `assertSeasonContent`.
     */
    readonly setRewards: {
        readonly titleBolts: number;
        readonly fullCosmetic: string;
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
 * v0.126.0 — KONIEC PLACEHOLDEROW. Szesc pozycji wskazywalo na trzy istniejace
 * ksiazki (`assets/items/book_*.png`), zeby mechanika byla testowalna przed artem.
 * Mariusz dostarczyl paczke `public/seasons/s3/item1..6.png`, wiec podmiana wyszla
 * dokladnie tak, jak zapowiadal SEASON_ENGINE.md: szesc stringow, zero zmian w kodzie.
 */
const S3_ITEMS: readonly SeasonItemDef[] = [
    { value: 1, nameKey: 'season.s3.item1', asset: 'seasons/s3/item1.png', glow: 0x54d17a, weight: 40 },
    { value: 2, nameKey: 'season.s3.item2', asset: 'seasons/s3/item2.png', glow: 0x7fe39a, weight: 25 },
    { value: 3, nameKey: 'season.s3.item3', asset: 'seasons/s3/item3.png', glow: 0x4aa8f0, weight: 15 },
    { value: 4, nameKey: 'season.s3.item4', asset: 'seasons/s3/item4.png', glow: 0x86c9ff, weight: 10 },
    { value: 5, nameKey: 'season.s3.item5', asset: 'seasons/s3/item5.png', glow: 0xa46cf0, weight: 7 },
    { value: 6, nameKey: 'season.s3.item6', asset: 'seasons/s3/item6.png', glow: 0xff5e6a, weight: 3 },
];

// ══════════════════════════════════════════════════════════════════════════
// SEZON 2 — "Arena" (BIEZACY, do 31.08)
// ══════════════════════════════════════════════════════════════════════════
/**
 * v0.126.0 (prosba Mariusza) — sezon 2 dostaje znajdzki, zeby silnik sezonowy byl
 * WIDOCZNY JUZ TERAZ, a nie dopiero 01.09. Do v0.125.0 manifest mial wylacznie `s3`,
 * wiec w biezacym sezonie nie spawnowalo sie nic: ani licznik w HUD, ani zakladka
 * SEZON w profilu, ani tory nagrod.
 *
 * ⚠️ ART I NAZWY SA WSPOLNE Z S3 — Mariusz skopiowal te sama paczke do
 * `public/seasons/s2/`. To szkolne przybory w sezonie „Arena", czyli tematyczna
 * niespojnosc na jeden dzien; SWIADOMA, bo alternatywa byloby wymyslanie „arenowych"
 * nazw do obrazkow przedstawiajacych olowek i globus, czyli klamanie o zawartosci.
 * Sezon 2 konczy sie 31.08 — przy S4 kazdy sezon dostaje wlasna paczke.
 *
 * Reguly (wagi, progi, bramki, pity) sa IDENTYCZNE z S3, zeby to, co Mariusz
 * przetestuje teraz, bylo tym samym mechanizmem, ktory wystartuje 01.09.
 */
const S2_ITEMS: readonly SeasonItemDef[] = [
    { value: 1, nameKey: 'season.s2.item1', asset: 'seasons/s2/item1.png', glow: 0x54d17a, weight: 40 },
    { value: 2, nameKey: 'season.s2.item2', asset: 'seasons/s2/item2.png', glow: 0x7fe39a, weight: 25 },
    { value: 3, nameKey: 'season.s2.item3', asset: 'seasons/s2/item3.png', glow: 0x4aa8f0, weight: 15 },
    { value: 4, nameKey: 'season.s2.item4', asset: 'seasons/s2/item4.png', glow: 0x86c9ff, weight: 10 },
    { value: 5, nameKey: 'season.s2.item5', asset: 'seasons/s2/item5.png', glow: 0xa46cf0, weight: 7 },
    { value: 6, nameKey: 'season.s2.item6', asset: 'seasons/s2/item6.png', glow: 0xff5e6a, weight: 3 },
];

const SEASON_CONTENT: readonly SeasonContentDef[] = [
    {
        // Reguly celowo 1:1 z S3 — to, co gracz przetestuje teraz, ma byc dokladnie
        // tym mechanizmem, ktory wystartuje 01.09. Zadnych „testowych" wartosci.
        seasonId: 's2',
        items: S2_ITEMS,
        pointThresholds: [
            { points: 60, crates: 1 },
            { points: 120, crates: 1 },
            { points: 200, crates: 2 },
        ],
        varietyGates: {
            crate: [1, 2, 3],
            title: [1, 2, 3, 4, 5],
            full: [1, 2, 3, 4, 5, 6],
        },
        // S2 nie ma wlasnego dekoru (art szkolny byl jednodniowa pozyczka pod S3), wiec
        // za komplet dostaje ten sam skin — spojne z tym, ze itemy tez sa wspolne.
        setRewards: { titleBolts: 200, fullCosmetic: 'ps_s3_school' },
        spawn: { maxAlive: 3, everyMs: 4000, pityAfter: 40, pityStepPct: 2 },
        size: 51,
        radius: 38,
    },
    {
        seasonId: 's3',
        items: S3_ITEMS,
        counterIcon: 'seasons/s3/sezoniaki.png',
        // v0.250.0 SEZON v2 — tor zatwierdzony przez Mariusza 2026-10-14: 7 progow punktowych
        // (stare 60/120/200 x1.25 = 75/150/250 + 4 nizsze) i 3 komplety (3/6, 5/6, 6/6).
        // E0 (dane s3, 29 graczy): mediana ~1.5 pkt/mecz — 250 pkt to cel dlugi, swiadomie.
        track: [
            { id: 'p10',  kind: 'points', need: 10,  reward: { bolts: 100 } },
            { id: 'p25',  kind: 'points', need: 25,  reward: { cosmetic: 'bg_s3_school' } },
            { id: 'p45',  kind: 'points', need: 45,  reward: { bolts: 150, crates: 1 } },
            { id: 'p75',  kind: 'points', need: 75,  reward: { cosmetic: 'fr_s3_school', bolts: 200 } },
            { id: 'p110', kind: 'points', need: 110, reward: { cosmetic: 'tp_s3_notebook' } },
            { id: 'p150', kind: 'points', need: 150, reward: { cosmetic: 'mt_s3_school', bolts: 300 } },
            { id: 'p250', kind: 'points', need: 250, reward: { bolts: 600, crates: 2, seasonTank: true } },
            { id: 'set3', kind: 'set',    need: 3,   reward: { crates: 1, bolts: 150 } },
            { id: 'set5', kind: 'set',    need: 5,   reward: { cosmetic: 'nc_s3_school', bolts: 200 } },
            { id: 'set6', kind: 'set',    need: 6,   reward: { cosmetic: 'ps_s3_school' } },
            // v0.250.0 — UKONCZONY SEZON (wszystkie 10 nagrod): +500 sigm + gratulacje + odznaka w profilu/muzeum.
            { id: 'done', kind: 'complete', need: 10, reward: { bolts: 500 } },
        ],
        // Progi rosnace, zestrojone tak, zeby nagrody padaly rytmicznie przez sezon,
        // a nie klebily sie na koncu. Wartosci startowe do kalibracji po playtescie.
        pointThresholds: [
            { points: 60, crates: 1 },
            { points: 120, crates: 1 },
            { points: 200, crates: 2 },
        ],
        varietyGates: {
            crate: [1, 2, 3],
            title: [1, 2, 3, 4, 5],
            full: [1, 2, 3, 4, 5, 6],
        },
        // 200 Σ za 5/5 (decyzja Mariusza 24.09 — sigmy, nie kolejna skrzynka: skrzynki
        // juz placa z czterech kranow). Komplet 6/6 = skin profilu „Powrot do Szkoly".
        setRewards: { titleBolts: 200, fullCosmetic: 'ps_s3_school' },
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
    // v0.206.0 — nagroda za komplet musi istniec w rejestrze kosmetykow, inaczej gracz
    // zbierze 6/6 i dostanie NIC (dokladnie ten blad, ktory naprawiamy).
    if (!getCosmetic(c.setRewards.fullCosmetic)) {
        errs.push(`setRewards.fullCosmetic='${c.setRewards.fullCosmetic}' nie istnieje w cosmetics.ts`);
    }
    if (!(c.setRewards.titleBolts >= 0)) errs.push(`setRewards.titleBolts=${c.setRewards.titleBolts}`);
    // v0.250.0 — Szlak Sezonu: unikalne id, rosnace progi w obrebie rodzaju, istniejace kosmetyki.
    if (c.track) {
        const ids = new Set<string>();
        const prevByKind: Record<string, number> = {};
        for (const tr of c.track) {
            if (ids.has(tr.id)) errs.push(`track: zdublowane id ${tr.id}`);
            ids.add(tr.id);
            if (tr.need <= (prevByKind[tr.kind] ?? 0)) errs.push(`track: nierosnacy prog ${tr.kind} ${tr.id}`);
            prevByKind[tr.kind] = tr.need;
            if (tr.kind === 'set' && tr.need > 6) errs.push(`track: ${tr.id} need>6`);
            if (tr.kind === 'complete' && tr.need > c.track.filter(x => x.kind !== 'complete').length) errs.push(`track: ${tr.id} need > liczba tierow`);
            if (tr.reward.cosmetic && !getCosmetic(tr.reward.cosmetic)) errs.push(`track: ${tr.id} kosmetyk '${tr.reward.cosmetic}' nie istnieje`);
        }
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
 * @param rnd zrodlo losowosci [0,1) — przy SEZON v2 worldRng (spawn to stan gry w koopie)
 */
export function rollSeasonItem(c: SeasonContentDef, missStreak: number, rnd: () => number = Math.random): SeasonItemDef {
    const top = c.items.find(i => i.value === 6)!;
    const bonusPct = Math.max(0, missStreak - c.spawn.pityAfter) * c.spawn.pityStepPct;
    const topWeight = Math.min(100, top.weight + bonusPct);

    if (bonusPct > 0 && rnd() * 100 < topWeight) return top;

    // zwykle losowanie wazone po pozostalych (albo po wszystkich, gdy pity nieaktywne)
    const pool = bonusPct > 0 ? c.items.filter(i => i.value !== 6) : c.items;
    const total = pool.reduce((s, i) => s + i.weight, 0);
    let r = rnd() * total; // v0.250.0: rnd = worldRng przy SEZON v2 (determinizm koopa)
    for (const it of pool) {
        r -= it.weight;
        if (r <= 0) return it;
    }
    return pool[pool.length - 1];
}
