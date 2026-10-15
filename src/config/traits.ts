/**
 * traits.ts — v0.246.0 CECHY CZOLGOW (4. slot): jedna NIEBOJOWA zdolnosc na czolg. Decyzja Mariusza 2026-10-11.
 *
 * Rejestr (bez if-chainow po brawlerze): BRAWLER -> TraitId -> TRAIT_DEFS (liczby + ikona + i18n). Logika:
 * src/systems/TraitSystem.ts. Art: src/rendering/TraitArt.ts. Wszystkie liczby TU (jeden tuning pass).
 *
 * Za flaga TRAITS_LIVE (`?traits=1` do testu, rollback `?traits=0` po flipie). Flip = bump SIM_VERSION
 * (+ decyzja o SCORE_VERSION — cechy podnosza sufit wyniku).
 *
 * NETCODE (COOP/MP): `traitRulesetId()` idzie do handshake'u obok SIM_VERSION. Aktywacja przez PlayerInput.trait
 * (bit flagi w ramce), czasy na zegarze meczu (simNowMs), zero Math.random.
 */
import type { TraitIconArt } from '../rendering/traitIcons';
/** Id czolgu = Brawler.id (string w configu brawlers.ts). */
type BrawlerId = string;

export const TRAITS_LIVE = true; // v0.248.0 flip (rollback ?traits=0)

let cached: boolean | null = null;
export function isTraitsEnabled(): boolean {
    if (cached !== null) return cached;
    let v = TRAITS_LIVE;
    try {
        const q = new URLSearchParams(location.search).get('traits');
        if (q === '0') v = false;
        else if (q === '1') v = true;
    } catch { /* node/test */ }
    cached = v;
    return v;
}

export function traitRulesetId(): 't0' | 't1' { return isTraitsEnabled() ? 't1' : 't0'; }

export type TraitId = 'sandbags' | 'ram' | 'cloak' | 'blink' | 'fence' | 'bigJump' | 'smoke' | 'ceasefire' | 'repair' | 'summon';

export interface TraitDef {
    id: TraitId;
    /** Emoji na kafelku / przycisku (spojnie z ikonami mocy). */
    icon: string;
    /** v0.246.1: glif (nie emoji) rysowany TYM kolorem — np. zielony krzyzyk naprawy Enigmy. */
    iconColor?: string;
    /** v0.246.4: wlasna ikona rysowana kodem (src/rendering/traitIcons.ts) — ma pierwszenstwo przed emoji. */
    iconArt?: TraitIconArt;
    /** Kolor akcentu (poswiata kafelka, efekty). */
    color: string;
    cooldownMs: number;
    /** Czas trwania efektu (0 = natychmiastowy). */
    durationMs: number;
}

/** Proponowane wartosci do strojenia playtestem (plan fazy, tabela "sprawiedliwosci"). */
export const TRAIT_DEFS: Record<TraitId, TraitDef> = {
    sandbags:  { id: 'sandbags',  icon: '🎒', iconArt: 'sandbag', color: '#c8a46a', cooldownMs: 25_000, durationMs: 10_000 },
    ram:       { id: 'ram',       icon: '🦏', color: '#e67e22', cooldownMs: 15_000, durationMs: 0 },
    cloak:     { id: 'cloak',     icon: '🕶️', color: '#9fd8ff', cooldownMs: 30_000, durationMs: 8_000 },
    blink:     { id: 'blink',     icon: '✨', color: '#b18cff', cooldownMs: 12_000, durationMs: 0 },
    fence:     { id: 'fence',     icon: '⚡', color: '#3fd8ff', cooldownMs: 25_000, durationMs: 10_000 },
    bigJump:   { id: 'bigJump',   icon: '💥', color: '#ff5fa2', cooldownMs: 24_000, durationMs: 0 },
    smoke:     { id: 'smoke',     icon: '💨', color: '#b8bec8', cooldownMs: 30_000, durationMs: 6_000 },
    ceasefire: { id: 'ceasefire', icon: '✋', color: '#f1c40f', cooldownMs: 35_000, durationMs: 5_000 },
    repair:    { id: 'repair',    icon: '✚', iconColor: '#2ecc71', color: '#2ecc71', cooldownMs: 50_000, durationMs: 8_000 },
    // PUMPKIN (sezon 4): WEZWANIE "CALACA" — szkielet-mariachi na rowerku: wabik + nuty (malo dmg, lekkie spowolnienie)
    summon:    { id: 'summon',    icon: '💀', iconArt: 'calaca', color: '#ff5fa2', cooldownMs: 30_000, durationMs: 8_000 },
};

export const BRAWLER_TRAIT: Readonly<Record<BrawlerId, TraitId>> = {
    twardy: 'sandbags',
    heavy: 'ram',
    scout: 'cloak',
    sniper: 'blink',
    plasma: 'fence',
    shadow: 'bigJump',
    pyro: 'smoke',
    king: 'ceasefire',
    enigma: 'repair',
    pumpkin: 'summon',
};

/** Liczby szczegolowe efektow (jeden tuning pass). */
export const TRAIT_TUNING = {
    // Barykada / plot: rozwarty trapez bez podstawy przed czolgiem, z bloczkow AABB.
    barrierAhead: 90,          // px od srodka czolgu do frontu
    barrierFront: 150,         // dlugosc frontu (v0.246.1: 120 -> 150)
    barrierWing: 120,          // dlugosc skrzydla (v0.246.1: 70 -> 120 — 'wiecej workow po bokach')
    barrierBlock: 30,          // bok bloczka collidera
    // Taran (Pancerny)
    ramDistance: 520, ramStepPx: 16, // v0.246.2: dluzsza prosta (Mariusz)
    ramDamage: 300, ramHitRadius: 48, ramStunMs: 400,
    // Niewidka (Zwiad): strzal skraca do tylu ms
    cloakShotGraceMs: 500,
    // Teleport (Snajper)
    blinkDistance: 450, blinkMin: 380, blinkMax: 520, blinkFanDeg: 35, // v0.246.1: dalej (w kadrze przy zoom 0.6)
    // Plot (Tech): porazenie co ile ms, ile dmg, ogluszenie (= "magnetyzacja", spowolnienie)
    fenceZapEveryMs: 500, fenceZapDamage: 20, fenceZapStunMs: 250, fenceTouchRadius: 34,
    // Wielki skok (Shadow)
    jumpDistance: 220, jumpFlightMs: 1100, jumpPeakScale: 1.85, // v0.246.1: wyzej i wolniej (jak trampolina)
    jumpStunRadius: 275, jumpStunMs: 3000, jumpStunBossMs: 1500, jumpStunMegaMs: 1000,
    // Dym (Ogniarz)
    smokeRadius: 220, smokePuffs: 11,
    // Naprawa (Enigma)
    repairTotalHp: 125,
    // Wezwanie CALACA (Pumpkin): wabik jak Widmo, ale z HP; co noteEveryMs nuta w promieniu (dmg + spowolnienie)
    calacaHp: 200, calacaLureRadius: 300, calacaAbsorbRadius: 30, calacaBossIgnoreMs: 2000,
    calacaNoteEveryMs: 1200, calacaNoteRadius: 120, calacaNoteDamage: 8, calacaSlowMult: 0.85, calacaSlowMs: 600,
    calacaOrbitRx: 70, calacaOrbitRy: 50, calacaSpeedPx: 3.4, calacaSeekRadius: 520,
} as const;
