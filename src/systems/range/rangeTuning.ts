/**
 * rangeTuning.ts — JEDYNE zrodlo liczb STRZELNICY (wzorzec castleWaves.ts / queenTuning.ts).
 *
 * Uklad stanowisk jest DANYMI Z WERSJA: zmiana tutaj = inne pomiary, wiec kazdy raport
 * balansu nosi `RANGE_LAYOUT_ID`. Porownuj tylko raporty z tym samym id.
 *
 * Mapa: arctic (najplasciej). Centrum = (1500,1500). Dla scenariusza 'range' main.ts NIE buduje
 * kostek lodu ani sniezycy (najblizsza kostka lezala 264 px od centrum — wchodzilaby w S1).
 * Reszta przeszkod arctic (stacja 620..1120 x 300..415, igloo ~2450x2520, przereble) lezy
 * poza kwadratem 800..2200 — math-verified skryptem przed wpisaniem promieni.
 *
 * Stanowiska (sekwencyjnie, HP gracza odnawiane miedzy nimi):
 *  S1 TARCZE   — 6 statycznych ENEMY_NORMAL na 200/300/450 px: surowe DPS x pole trafienia x celnosc.
 *  S2 NATARCIE — 2 fale po 4 ENEMY_NORMAL z pelnym AI z 700 px: TTK pod presja + DYSTANS zabic.
 *  S3 BOSS     — 1 ENEMY_BOSS (3000 HP) z 500 px: "gabka" — tu widac progi 2 vs 3 strzaly i pierce.
 * Limit 60 s (3600 krokow) na stanowisko -> timeout, run idzie dalej (jedna wpadka nie zeruje pomiaru).
 */

export const RANGE_LAYOUT_ID = 'range-v1';

/** Punkt spawnu wzgledem centrum: promien [px] + azymut [deg], 0 = wschod, rosnie zgodnie z ruchem wskazowek. */
export interface RangeSpawnPoint { readonly r: number; readonly deg: number }

export type RangeStationDef =
    | { readonly id: 'targets'; readonly kind: 'static'; readonly points: readonly RangeSpawnPoint[] }
    | { readonly id: 'assault'; readonly kind: 'approach'; readonly waves: readonly (readonly RangeSpawnPoint[])[] }
    | { readonly id: 'boss'; readonly kind: 'boss'; readonly point: RangeSpawnPoint };

export const RANGE_TUNING = Object.freeze({
    center: Object.freeze({ x: 1500, y: 1500 }),
    /** 60 s przy 60 Hz. Liczone w KROKACH logiki (delta), nie w ms — determinizm pod ?bot=1. */
    stationTimeoutSteps: 3600,
    /** Pelne HP na starcie kazdego stanowiska — S2 mierzy presje, nie kumuluje kary z S1. */
    healBetweenStations: true,
    stations: Object.freeze([
        {
            id: 'targets', kind: 'static',
            points: [
                { r: 200, deg: 0 }, { r: 200, deg: 180 },
                { r: 300, deg: 60 }, { r: 300, deg: 240 },
                { r: 450, deg: 120 }, { r: 450, deg: 300 },
            ],
        },
        {
            id: 'assault', kind: 'approach',
            waves: [
                [{ r: 700, deg: 0 }, { r: 700, deg: 90 }, { r: 700, deg: 180 }, { r: 700, deg: 270 }],
                [{ r: 700, deg: 45 }, { r: 700, deg: 135 }, { r: 700, deg: 225 }, { r: 700, deg: 315 }],
            ],
        },
        { id: 'boss', kind: 'boss', point: { r: 500, deg: 0 } },
    ] as readonly RangeStationDef[]),
});

/** Wspolrzedne swiata punktu stanowiska. */
export function rangePointXY(p: RangeSpawnPoint): { x: number; y: number } {
    const a = (p.deg * Math.PI) / 180;
    return { x: Math.round(RANGE_TUNING.center.x + Math.cos(a) * p.r), y: Math.round(RANGE_TUNING.center.y + Math.sin(a) * p.r) };
}
