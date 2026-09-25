/**
 * Typ dla danych czołga (brawler). Pure type, no implementation.
 */

export type BrawlerType = 'standard' | 'fast' | 'plasma' | 'spread';

export interface Brawler {
    id: string;
    emoji: string;
    icon: string;        // ścieżka do JPG, np. 'assets/tanks/twardy.jpg'
    name: string;
    colorMain: string;   // hex color, np. '#27ae60'
    hp: number;
    speed: number;
    dmg: number;
    reload: number;      // ms między strzałami
    type: BrawlerType;
    flag?: string;  // 👈 DODAJ TĘ LINIJKĘ
    useExternalSprite?: boolean;  // 👈 DODAJ TĘ LINIJKĘ
    // ── BALANCE_V2 (v0.200.0) — pola obecne TYLKO przy aktywnym rulesecie v2 ──────────────
    // W v1 sa `undefined`, a kazdy konsument ma zachowac dzisiejsza sciezke (globalne 1000,
    // mapy w Bullet.ts, offsety z main.ts). Patrz `src/config/balanceRules.ts`.
    /** Zasieg pocisku w px (S2). */
    maxDist?: number;
    /** Promien pocisku — UKRYTA statystyka celnosci (trafienie = 30 + radius). */
    bulletRadius?: number;
    /** Salwa: liczba pociskow + kat rozrzutu w radianach. */
    volley?: { count: number; spread: number };
    /** Tech: przebicie do N wrogow (S3). */
    pierce?: number;
    /** v0.211.0 Snajper: dmg dla kolejnych celow po pierwszym trafieniu (pierce z redukcja). */
    pierceDmgAfter?: number;
    /** v0.211.0 Zwiad/Shadow: mnoznik bonusu czerwonej kostki. */
    cubeDmgMult?: number;
    /** Shadow: dash bez klatek nietykalnosci (S3). */
    dash?: boolean;
}