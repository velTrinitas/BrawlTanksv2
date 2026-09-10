/**
 * hubChoose.ts — GARAZ-2 (v0.156.0): flaga trybu "wybor czolgu w Garazu".
 *
 * Wzorzec 1:1 z shop.ts/multiplayer.ts. Przy OFF (default) hub renderuje sie
 * DOKLADNIE jak dotad — obie sekcje (Garaz/Bitwa) rozgaleziaja render na samej
 * gorze, galaz OFF to nietkniety dzisiejszy kod (warunek odbioru: bit-tozsamosc).
 *
 * ON (?choose=1): Garaz = obrotnica czolgu + WYBIERZ CZOLG + loadout wywindowany;
 * Bitwa = tylko scenariusz/mapa + trudnosc (grid czolgow znika).
 */

/**
 * GARAZ-4 (2026-09-10): DEFAULT ON po akceptacji pada LADOWISKO przez Mariusza.
 * Rollback bez rebuildu: ?choose=0 (wzorzec ?hub=0).
 */
export const CHOOSE_LIVE = true;

/**
 * GARAZ-2.5 (v0.157.0): czolgi z gotowym zestawem klatek 3/4
 * (public/assets/tanks/turn/<id>/atlas.webp + meta.json) — dostaja viewer
 * tankTurn360; reszta zostaje na tankTurntable (fallback, zero regresji).
 *
 * GARAZ-4 (2026-09-10): ZAPARKOWANE — lista pusta, wszystkie czolgi ida przez
 * tankTurntable (pad LADOWISKO). Powod: atlas 360 to piksele z wideo AI —
 * wzory skinow (skinPatterns.ts) sa na nim niemozliwe, a kazdy skin = nowe
 * wideo + ciecie per czolg. Kod tankTurn360.ts, cutter i atlas KROLA zostaja;
 * wlaczenie = dopisanie id do listy.
 */
export const TURN360_TANKS: string[] = [];

/** Tryb GARAZ-2 aktywny? Kill switch kompilowany; ?choose=1 wlacza, ?choose=0 wylacza. */
export function isChooseMode(): boolean {
    try {
        const v = new URLSearchParams(location.search).get('choose');
        if (v === '0') return false;
        if (v === '1') return true;
        return CHOOSE_LIVE;
    } catch { return CHOOSE_LIVE; }
}
