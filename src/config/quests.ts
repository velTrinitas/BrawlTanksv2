/**
 * quests.ts — rejestr ROZKAZOW (PROG-F3 / HUB-3).
 *
 * Design: BT_Progression_System_Design_v1.md §5 + §17, z korektami wynikajacymi z
 * REALNEGO kodu v0.99.0 i kalibracji prod 2026-08-02:
 *   - licznik FAL nie istnieje w silniku  => questy "przetrwaj do fali X" zastapione czasem,
 *   - realny rekord score to 748 (nie 3000) => progi punktowe zjechaly do 150/400,
 *   - "wygraj run" (= ubity mega boss) jest dla mediany graczy nieosiagalne => tylko tygodniowka,
 *   - Punkty Sezonu odrzucone (decyzja walutowa Menu Hub: 2 waluty) => nagrody = srubki + skrzynki.
 *
 * FILOZOFIA GRADACJI (§17.2, krzywa Clash Royale) — kazdy tier ma INNA funkcje:
 *   ŁATWY       domknie sie sam przy normalnej grze  -> ochrona slabego gracza przed frustracja
 *   SREDNI      1-2 runy albo jeden dobry run        -> nagroda za skupienie
 *   KIERUNKOWY  wypycha na nietknieta mechanike      -> cichy tutor (taran/stealth/pady/freeze)
 *   TYGODNIOWY  kumulacja + kolekcja + skill-gate    -> kotwica tygodnia
 * Komplet dnia (3/3) placi SKRZYNKA — dziecko wraca po Zrzut, nie po walute.
 *
 * SKLADNIA ROZKAZU (§17.1 pkt 2): 1 ikona + 1 czasownik + 1 liczba. Zero zdan zlozonych.
 *
 * Wszystkie liczby siedza w QUEST_TARGETS = jeden tuning pass po danych (supabase/quest_calibration.sql).
 */

import type { TranslationKey } from '../i18n/i18n';
import type { MapId } from '../types/MapType';

// ── Metryki (kazda mapuje sie na ISTNIEJACE zdarzenie w silniku) ─────────────
export type QuestMetric =
    | 'kill' | 'boss_kill' | 'gem' | 'heart' | 'magnet' | 'cube'
    | 'super_power' | 'super_shot'
    | 'frozen_kill' | 'ramming_kill' | 'stealth_kill' | 'medi_pad' | 'flag_capture'
    | 'match' | 'seconds' | 'trophies' | 'map_played' | 'perfect_run'
    | 'run_score' | 'run_trophies' | 'run_gems' | 'run_seconds' | 'combo' | 'bomb_multikill';

/**
 * Wersja konfiguracji rozkazow. Podbicie wymusza PRZELOSOWANIE aktywnych zestawow
 * (i wyczyszczenie ich postepu) przy najblizszym wejsciu — inaczej gracz zostalby ze
 * starymi celami zapisanymi w localStorage az do zmiany doby/tygodnia, albo — gorzej —
 * z rozkazem, ktorego definicja juz nie istnieje. Podbijaj przy KAZDEJ zmianie puli/celow.
 */
export const QUEST_CONFIG_VERSION = 3;

/**
 * sum = kumuluje sie miedzy meczami · max = liczy NAJLEPSZY pojedynczy mecz
 * set = zbiera unikalne wartosci (np. 3 rozne mapy — punch card §17.4)
 */
export type QuestMode = 'sum' | 'max' | 'set';

export type QuestTier = 'easy' | 'medium' | 'directional' | 'weekly' | 'special';

export interface QuestDef {
    readonly id: string;
    readonly tier: QuestTier;
    readonly metric: QuestMetric;
    readonly mode: QuestMode;
    /** Cel BAZOWY (Akt I). Skalowany przez getQuestScale() wg trofeow konta. */
    readonly target: number;
    readonly icon: string;
    readonly labelKey: TranslationKey;
    readonly bolts: number;
    readonly crates?: number;
    /** Pula wartosci parametru (np. mapa dnia) — rozwiazywana seedem przy losowaniu. */
    readonly paramPool?: readonly string[];
}

/** Rozkaz wylosowany na dany okres: definicja + cel po skalowaniu + rozwiazany parametr. */
export interface ActiveQuest {
    /** Stabilny klucz w obrebie okresu (id + param). Uzywany w progresie i w claimed. */
    readonly key: string;
    readonly def: QuestDef;
    readonly target: number;
    readonly param?: string;
}

// ── Stale ekonomii rozkazow (JEDEN blok = jeden tuning pass) ─────────────────
export const QUEST_UNLOCK_TROPHIES = 120;   // prog Szlaku (istniejacy milestone) — §5: nie przytlaczac w 1. sesji
export const DAILY_QUEST_COUNT = 3;         // 1x latwy + 1x sredni + 1x kierunkowy
export const DAILY_SET_BOLTS = 30;          // bonus za komplet dnia...
export const DAILY_SET_CRATES = 1;          // ...+ skrzynka (glowny hak dnia)

export const QUEST_BOLTS = {
    easy: 25,
    medium: 45,
    directional: 35,
} as const;

/**
 * Skalowanie celow wraz z progresja konta (Akty Szlaku). Gracz rosnie => rozkazy rosna,
 * bez duplikowania puli. Granice aktow jak w Doc v1.2 §C.
 *
 * TUNING 2026-08-06 (decyzja Mariusza): bazy podniesione o 100% (patrz QUEST_TARGETS nizej).
 * Skoro +100% siedzi juz w BAZACH, stromizna aktow wraca do lagodniejszej (1.35/1.7) —
 * inaczej Akt II dostalby 3.2x wzgledem stanu wyjsciowego, czego nikt nie zamawial.
 * Dane: mediana 5 meczow/dzien, p75 15.5 (sesja dev, prawdziwa kalibracja po Q7 na realnych statach).
 */
export const QUEST_SCALE_BY_ACT = { act1: 1.0, act2: 1.35, act3: 1.7 } as const;

export function getQuestScale(trophies: number): number {
    if (trophies >= 3500) return QUEST_SCALE_BY_ACT.act3;
    if (trophies >= 750) return QUEST_SCALE_BY_ACT.act2;
    return QUEST_SCALE_BY_ACT.act1;
}

/** Mapy KTB dopuszczone jako "mapa dnia" (fortified_ruins to CTF — ma wlasny rozkaz flagowy). */
export const QUEST_MAP_POOL: readonly MapId[] = ['city', 'desert', 'tropics', 'arctic', 'mars'];

/** Etykiety map — literalne klucze (dynamiczne t(var) nie kompiluje sie w tym projekcie). */
export const MAP_LABEL_KEY: Record<string, TranslationKey> = {
    city: 'leaderboard.map.city',
    desert: 'leaderboard.map.desert',
    tropics: 'leaderboard.map.tropics',
    arctic: 'leaderboard.map.arctic',
    mars: 'leaderboard.map.mars',
};

// ── PULA ŁATWA (domyka sie sama przy normalnej grze) ────────────────────────
export const EASY_QUESTS: readonly QuestDef[] = [
    { id: 'e_kill',      tier: 'easy', metric: 'kill',        mode: 'sum', target: 80,   icon: '💀', labelKey: 'quest.e_kill',      bolts: QUEST_BOLTS.easy },
    { id: 'e_gem',       tier: 'easy', metric: 'gem',         mode: 'sum', target: 64,   icon: '💎', labelKey: 'quest.e_gem',       bolts: QUEST_BOLTS.easy },
    { id: 'e_heart',     tier: 'easy', metric: 'heart',       mode: 'sum', target: 10,   icon: '❤️', labelKey: 'quest.e_heart',     bolts: QUEST_BOLTS.easy },
    { id: 'e_supershot', tier: 'easy', metric: 'super_shot',  mode: 'sum', target: 16,   icon: '🔫', labelKey: 'quest.e_supershot', bolts: QUEST_BOLTS.easy },
    { id: 'e_superpwr',  tier: 'easy', metric: 'super_power', mode: 'sum', target: 14,   icon: '⚡', labelKey: 'quest.e_superpwr',  bolts: QUEST_BOLTS.easy },
    { id: 'e_seconds',   tier: 'easy', metric: 'seconds',     mode: 'sum', target: 1200, icon: '⏱️', labelKey: 'quest.e_seconds',  bolts: QUEST_BOLTS.easy },
    { id: 'e_match',     tier: 'easy', metric: 'match',       mode: 'sum', target: 6,    icon: '🎮', labelKey: 'quest.e_match',     bolts: QUEST_BOLTS.easy },
];

// ── PULA ŚREDNIA (1-2 runy / jeden dobry run) ──────────────────────────────
export const MEDIUM_QUESTS: readonly QuestDef[] = [
    { id: 'm_kill',     tier: 'medium', metric: 'kill',         mode: 'sum', target: 180, icon: '💀', labelKey: 'quest.m_kill',     bolts: QUEST_BOLTS.medium },
    { id: 'm_boss',     tier: 'medium', metric: 'boss_kill',    mode: 'sum', target: 10,  icon: '👹', labelKey: 'quest.m_boss',     bolts: QUEST_BOLTS.medium },
    { id: 'm_magnet',   tier: 'medium', metric: 'magnet',       mode: 'sum', target: 6,   icon: '🧲', labelKey: 'quest.m_magnet',   bolts: QUEST_BOLTS.medium },
    { id: 'm_cube',     tier: 'medium', metric: 'cube',         mode: 'sum', target: 14,  icon: '📦', labelKey: 'quest.m_cube',     bolts: QUEST_BOLTS.medium },
    { id: 'm_combo',    tier: 'medium', metric: 'combo',        mode: 'max', target: 10,  icon: '🔥', labelKey: 'quest.m_combo',    bolts: QUEST_BOLTS.medium },
    // TROFEA zamiast surowego score: skala punktow rozni sie miedzy mapami ~5x (p90 city 55
    // vs arctic 264), wiec "150 pkt w meczu" bylo trywialne na Arktyce i prawie nieosiagalne
    // na Pustyni. Trofea sa juz znormalizowane per mapa (F1), wiec rozkaz jest MAPOWO UCZCIWY.
    { id: 'm_trophies', tier: 'medium', metric: 'run_trophies', mode: 'max', target: 60,  icon: '🏆', labelKey: 'quest.m_trophies', bolts: QUEST_BOLTS.medium },
    { id: 'm_runtime',  tier: 'medium', metric: 'run_seconds',  mode: 'max', target: 480, icon: '⏱️', labelKey: 'quest.m_runtime',  bolts: QUEST_BOLTS.medium },
    { id: 'm_rungems',  tier: 'medium', metric: 'run_gems',     mode: 'max', target: 90,  icon: '💎', labelKey: 'quest.m_rungems',  bolts: QUEST_BOLTS.medium },
];

// ── PULA KIERUNKOWA (cichy tutor — uczy mechanik, ktorych gracz sam nie tknie) ──
export const DIRECTIONAL_QUESTS: readonly QuestDef[] = [
    { id: 'd_frozen',   tier: 'directional', metric: 'frozen_kill',    mode: 'sum', target: 24,  icon: '🥶', labelKey: 'quest.d_frozen',   bolts: QUEST_BOLTS.directional },
    // WYJATEK OD x2: "wrogowie w JEDNEJ bombie" ogranicza promien mega bomby i liczba wrogow
    // stojacych obok siebie — 10 nie da sie zebrac w kupe wiarygodnie. 8 = gorna granica realna.
    { id: 'd_bomb',     tier: 'directional', metric: 'bomb_multikill', mode: 'max', target: 8,   icon: '💣', labelKey: 'quest.d_bomb',     bolts: QUEST_BOLTS.directional },
    { id: 'd_ram',      tier: 'directional', metric: 'ramming_kill',   mode: 'sum', target: 10,  icon: '🛡️', labelKey: 'quest.d_ram',      bolts: QUEST_BOLTS.directional },
    { id: 'd_stealth',  tier: 'directional', metric: 'stealth_kill',   mode: 'sum', target: 12,  icon: '🌾', labelKey: 'quest.d_stealth',  bolts: QUEST_BOLTS.directional },
    { id: 'd_medipad',  tier: 'directional', metric: 'medi_pad',       mode: 'sum', target: 6,   icon: '✚', labelKey: 'quest.d_medipad',  bolts: QUEST_BOLTS.directional },
    { id: 'd_flag',     tier: 'directional', metric: 'flag_capture',   mode: 'sum', target: 6,   icon: '🚩', labelKey: 'quest.d_flag',     bolts: QUEST_BOLTS.directional },
    { id: 'd_trophies', tier: 'directional', metric: 'trophies',       mode: 'sum', target: 120, icon: '⭐', labelKey: 'quest.d_trophies', bolts: QUEST_BOLTS.directional },
    {
        id: 'd_map', tier: 'directional', metric: 'map_played', mode: 'sum', target: 1,
        icon: '🗺️', labelKey: 'quest.d_map', bolts: QUEST_BOLTS.directional, paramPool: QUEST_MAP_POOL,
    },
];

// ── TYGODNIOWE (2 stale + 1 aspiracyjny "Rozkaz Specjalny Generala") ────────
export const WEEKLY_ANCHOR: QuestDef = {
    id: 'w_trophies', tier: 'weekly', metric: 'trophies', mode: 'sum', target: 800,
    icon: '🏆', labelKey: 'quest.w_trophies', bolts: 60, crates: 1,
};

export const WEEKLY_CHECKLIST: QuestDef = {
    // WYJATEK OD x2: to KOLEKCJA map, nie licznik. Map jest 5 (4 KTB + fortified_ruins z CTF),
    // wiec 6 byloby nieosiagalne. 4 = wszystkie mapy KTB, bez wymuszania CTF.
    id: 'w_maps', tier: 'weekly', metric: 'map_played', mode: 'set', target: 4,
    icon: '🗺️', labelKey: 'quest.w_maps', bolts: 50, crates: 1,
};

/** Aspiracyjne (zlota ramka) — moze sie NIE udac i to jest OK (§17.4). Rotacja tygodniowa. */
export const WEEKLY_SPECIALS: readonly QuestDef[] = [
    // WYJATEK OD x2: to warunek ZERO-JEDYNKOWY (mecz bez utraty zycia) — nie ma czego mnozyc.
    { id: 's_perfect',  tier: 'special', metric: 'perfect_run',   mode: 'sum', target: 1,  icon: '✨', labelKey: 'quest.s_perfect',  bolts: 100, crates: 1 },
    { id: 's_combo',    tier: 'special', metric: 'combo',         mode: 'max', target: 16, icon: '🔥', labelKey: 'quest.s_combo',    bolts: 100, crates: 1 },
    // WYJATEK OD x2: SUFIT SILNIKA. Trofea z runa = min(score/dzielnik, TROPHY_CAP_PER_RUN=75)
    // + bonusy (5+5+10) => absolutne maksimum to 95. Cel 120 bylby NIEOSIAGALNY z definicji.
    // 75 = pelny cap "za wynik" — aspiracyjne, ale mapowo uczciwe (trofea sa znormalizowane).
    { id: 's_trophies', tier: 'special', metric: 'run_trophies', mode: 'max', target: 75, icon: '🏆', labelKey: 'quest.s_trophies', bolts: 100, crates: 1 },
];

/** Wszystkie definicje w jednym miejscu — lookup po id (odtwarzanie stanu z localStorage). */
export const ALL_QUEST_DEFS: readonly QuestDef[] = [
    ...EASY_QUESTS, ...MEDIUM_QUESTS, ...DIRECTIONAL_QUESTS,
    WEEKLY_ANCHOR, WEEKLY_CHECKLIST, ...WEEKLY_SPECIALS,
];

const _DEF_BY_ID: Record<string, QuestDef> = Object.fromEntries(ALL_QUEST_DEFS.map(q => [q.id, q]));

export function getQuestDef(id: string): QuestDef | undefined { return _DEF_BY_ID[id]; }

// ── Deterministyczne losowanie (ten sam zestaw u WSZYSTKICH graczy danego dnia) ──

/** mulberry32 — maly, deterministyczny PRNG. Seed z klucza daty => zero stanu. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Klucz okresu ("2026-08-04" / "2026-W32") -> liczbowy seed. */
function seedFromKey(key: string): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function scaleTarget(base: number, scale: number): number {
    return Math.max(1, Math.round(base * scale));
}

function instantiate(def: QuestDef, rng: () => number, scale: number): ActiveQuest {
    let param: string | undefined;
    if (def.paramPool && def.paramPool.length > 0) {
        param = def.paramPool[Math.floor(rng() * def.paramPool.length)];
    }
    return {
        key: param ? `${def.id}:${param}` : def.id,
        def,
        target: scaleTarget(def.target, scale),
        param,
    };
}

function pickOne(pool: readonly QuestDef[], rng: () => number, scale: number): ActiveQuest {
    const def = pool[Math.floor(rng() * pool.length)];
    return instantiate(def, rng, scale);
}

/**
 * 3 rozkazy dnia: zawsze 1x ŁATWY + 1x ŚREDNI + 1x KIERUNKOWY (§17.3).
 * Deterministyczne po dayKey => wszyscy gracze maja ten sam zestaw (social glue §17.1 pkt 9).
 * `allowCtf` odcina rozkaz flagowy gdy scenariusz jeszcze niedostepny (filtr stanu konta §5).
 */
export function pickDailyQuests(
    dayKey: string,
    trophies: number,
    opts: { allowCtf?: boolean } = {},
): ActiveQuest[] {
    const rng = mulberry32(seedFromKey(dayKey));
    const scale = getQuestScale(trophies);
    const directional = opts.allowCtf === false
        ? DIRECTIONAL_QUESTS.filter(q => q.metric !== 'flag_capture')
        : DIRECTIONAL_QUESTS;
    return [
        pickOne(EASY_QUESTS, rng, scale),
        pickOne(MEDIUM_QUESTS, rng, scale),
        pickOne(directional, rng, scale),
    ];
}

/** 3 tygodniowki: kotwica (trofea) + punch-card (3 mapy) + 1 aspiracyjna z rotacji. */
export function pickWeeklyQuests(weekKey: string, trophies: number): ActiveQuest[] {
    const rng = mulberry32(seedFromKey(weekKey));
    const scale = getQuestScale(trophies);
    return [
        instantiate(WEEKLY_ANCHOR, rng, scale),
        instantiate(WEEKLY_CHECKLIST, rng, 1),   // 3 mapy to kolekcja, nie liczba do skalowania
        pickOne(WEEKLY_SPECIALS, rng, scale),
    ];
}

/**
 * Wartosc do WYSWIETLENIA. Metryki czasowe trzymamy w sekundach (tak liczy silnik),
 * ale dziecku pokazujemy minuty — "Przetrwaj 360 sekund" jest nieczytelne, "6 min" nie.
 * floor (nie round), zeby licznik nigdy nie pokazal celu przed jego osiagnieciem.
 */
export function questDisplayValue(metric: QuestMetric, value: number): number {
    if (metric === 'seconds' || metric === 'run_seconds') return Math.floor(value / 60);
    return value;
}

/** Ile 1-linijek Generala jest w i18n (quest.general.1..12) — rotacja per dzien. */
export const GENERAL_LINE_COUNT = 12;

/** Deterministyczny indeks tekstu Generala na dany dzien (1..GENERAL_LINE_COUNT). */
export function generalLineIndex(dayKey: string): number {
    return (seedFromKey(dayKey) % GENERAL_LINE_COUNT) + 1;
}
