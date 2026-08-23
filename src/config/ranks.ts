/**
 * ranks.ts — RANKS-1 (v0.118.0). RANGA CZOLGISTY — drabinka 10 rang PER GRACZ.
 *
 * ZMIANA KONCEPCJI (decyzja Mariusza 2026-08-24 vs docs/crew-ranks-v1.md):
 * rangi zdobywa GRACZ (czolgista) liczba ZWYCIESTW dowolnym czolgiem — jedna
 * drabinka, nie 8 per-brawler. Progi i wstegi EN z doc §3-4 zostaja.
 *
 * Zwyciestwo = triggerVictory z meczem >= RANK_MIN_SECONDS (anty-farm, doc §5);
 * liczone lokalnie (KTB + CTF), backfill z historii scores = KTB
 * (mega_boss_defeated, CTF nie submituje). Ranga LICZONA z wins (nie
 * przechowywana) => zmiana progow samonaprawialna. Nagrody = sigmy + skrzynki
 * przez istniejace mechanizmy (granty kosmetykow rangowych z doc §6 — pozniej).
 *
 * Badge: KOMPLET 10 PNG w public/ranks/ (art Mariusza, 500px). Zloty hex
 * z numerem (rankBadge.ts) zostaje jako fallback dla rang bez `img`.
 */

export interface RankDef {
    /** Poziom 1-10. */
    readonly level: number;
    /** Wstega badge — ZAWSZE EN, caps (decyzja Mariusza w crew-ranks doc). */
    readonly name: string;
    /** Prog ZWYCIESTW (kumulatywnie). */
    readonly wins: number;
    /** Nagroda za awans (auto-grant). */
    readonly bolts: number;
    readonly crates?: number;
    /** Plik badge w public/ranks/ (tylko L1/L2 na razie). */
    readonly img?: string;
}

/** Minimalny czas meczu, by zwyciestwo liczylo sie do rangi (anty-farm). */
export const RANK_MIN_SECONDS = 60;

// Art Mariusza 2026-08-24: komplet 10 badge 500px (nazwy plikow 1:1 z dysku —
// L5/L6 maja myslnik, L8 w nazwie "Hero" ale to poziom CHAMPION; rzadzi `level`).
export const RANKS: readonly RankDef[] = [
    { level: 1,  name: 'ROOKIE',    wins: 1,    bolts: 50,                 img: 'L1_Rookie_500.png' },
    { level: 2,  name: 'GUNNER',    wins: 3,    bolts: 100,  crates: 1,    img: 'L2_Gunner_500.png' },
    { level: 3,  name: 'VETERAN',   wins: 8,    bolts: 150,                img: 'L3_Veteran_500.png' },
    { level: 4,  name: 'SERGEANT',  wins: 20,   bolts: 300,  crates: 1,    img: 'L4_Sergeant_500.png' },
    { level: 5,  name: 'ELITE',     wins: 50,   bolts: 500,                img: 'L5-Elite_500.png' },
    { level: 6,  name: 'ACE',       wins: 100,  bolts: 800,  crates: 1,    img: 'L6-Ace_500.png' },
    { level: 7,  name: 'HERO',      wins: 200,  bolts: 1200,               img: 'L7_Hero_500.png' },
    { level: 8,  name: 'CHAMPION',  wins: 350,  bolts: 2000, crates: 1,    img: 'L8_Hero_500.png' },
    { level: 9,  name: 'LEGEND',    wins: 600,  bolts: 3000,               img: 'L9_Legend_500.png' },
    { level: 10, name: 'COMMANDER', wins: 1000, bolts: 5000, crates: 2,    img: 'L10_Commander_500.png' },
];

/** Rzymskie numery do hex-badge L3-10 (programmatic placeholder). */
export const RANK_ROMAN: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Najwyzsza osiagnieta ranga (null = jeszcze zadna, 0 zwyciestw). */
export function getRankForWins(wins: number): RankDef | null {
    let current: RankDef | null = null;
    for (const r of RANKS) {
        if (wins >= r.wins) current = r;
        else break;
    }
    return current;
}

/** Nastepna ranga do zdobycia (null = COMMANDER osiagniety). */
export function getNextRank(wins: number): RankDef | null {
    return RANKS.find(r => wins < r.wins) ?? null;
}
