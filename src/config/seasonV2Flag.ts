/**
 * seasonV2Flag.ts — FAZA SEZON v2 (v0.250.0): sezoniaki = JEDYNY licznik sezonu.
 *
 * Przy fladze ON:
 *  - pucharki sezonowe (`season.trophies` + szlak na stronie PUCHARKI) nie sa naliczane ani pokazywane,
 *  - nagrody sezonu placi SZLAK SEZONU (`SeasonContentDef.track`, 7 progow punktowych + 3 komplety),
 *    klucze odbioru po ID tieru (`trk:<id>`), wiec progi mozna stroic bez podwojnych wyplat,
 *  - losowanie sezoniaka idzie z worldRng (determinizm koopa) — flip = bump SIM_VERSION,
 *  - front nie pokazuje numeru sezonu (id `s3` zostaje kluczem zapisu).
 * Przed flipem: `?seasonv2=1` do testu, po flipie rollback `?seasonv2=0`.
 */
export const SEASON_V2_LIVE = false;

export function isSeasonV2Enabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('seasonv2');
        if (q === '0') return false;
        if (SEASON_V2_LIVE) return true;
        return q === '1';
    } catch { return SEASON_V2_LIVE; }
}

/**
 * Dev-podglad `?seasondemo=N` (tylko z SEZON v2): profil dostaje w PAMIECI N punktow sezoniakow i 6/6
 * przedmiotow, a ProgressionService NIE zapisuje niczego (ani localStorage, ani chmura). Przeladowanie
 * bez parametru = prawdziwy stan gracza. Sluzy do obejrzenia nagrod, motywu i gratulacji bez grania.
 */
export function seasonDemoPoints(): number | null {
    try {
        const v = new URLSearchParams(location.search).get('seasondemo');
        if (v === null || !isSeasonV2Enabled()) return null;
        const n = Math.max(0, Math.floor(Number(v)));
        return Number.isFinite(n) ? n : null;
    } catch { return null; }
}
