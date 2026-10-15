import type { CastleRect } from '../CastleMap';

/**
 * castleMoatLoop.ts — CASTLE ART v2: geometria fosy jako JEDNEGO pierscienia (a nie 8 osobnych pasow).
 * Wspolna dla bake'u gruntu (dno, warstwy glebi, nabrzeze, piana) i runtime (strumienie krazace CW).
 *
 * Linia srodkowa = kwadrat z zaokraglonymi rogami (promien = pol szerokosci kanalu), wiec nurt
 * zakreca lukiem na rogach zamiast urywac sie na koncu prostej. Offset `o` > 0 = na zewnatrz.
 * Kolejnosc CW: N (+x) -> E (+y) -> S (-x) -> W (-y) — jak legacy CastleMoat.
 */
export interface MoatLoop {
    o0: number; o1: number;      // zewnetrzny brzeg (kwadrat)
    i0: number; i1: number;      // wewnetrzny brzeg
    half: number;                // pol szerokosci kanalu
    c0: number; c1: number;      // linia srodkowa (proste)
    straight: number;            // dlugosc prostej miedzy lukami
    perimeter: number;
}

export function moatLoopFrom(strips: readonly CastleRect[]): MoatLoop {
    const o0 = Math.min(...strips.map(s => s.x));
    const o1 = Math.max(...strips.map(s => s.x + s.w));
    const thick = Math.min(...strips.map(s => Math.min(s.w, s.h)));
    const half = thick / 2;
    const c0 = o0 + half, c1 = o1 - half;
    const straight = (c1 - c0) - 2 * half;
    const perimeter = 4 * straight + 2 * Math.PI * half;
    return { o0, o1, i0: o0 + thick, i1: o1 - thick, half, c0, c1, straight, perimeter };
}

/** Punkt na petli: s = droga od poczatku prostej N (CW), o = offset boczny (+ na zewnatrz). */
export function moatLoopPoint(L: MoatLoop, s: number, o: number, out: { x: number; y: number; a: number }): void {
    const arc = (Math.PI / 2) * L.half;
    const seg = L.straight + arc;
    s = ((s % L.perimeter) + L.perimeter) % L.perimeter;
    const side = Math.floor(s / seg);           // 0 N, 1 E, 2 S, 3 W
    const t = s - side * seg;
    const lo = L.c0 + L.half, hi = L.c1 - L.half; // zakres prostej
    const r = L.half + o;
    if (t < L.straight) {
        switch (side) {
            case 0: out.x = lo + t; out.y = L.c0 - o; out.a = 0; return;
            case 1: out.x = L.c1 + o; out.y = lo + t; out.a = Math.PI / 2; return;
            case 2: out.x = hi - t; out.y = L.c1 + o; out.a = Math.PI; return;
            default: out.x = L.c0 - o; out.y = hi - t; out.a = -Math.PI / 2; return;
        }
    }
    const k = (t - L.straight) / arc;           // 0..1 po luku
    // srodki lukow: NE (hi,lo), SE (hi,hi), SW (lo,hi), NW (lo,lo); kat startu wg strony
    const centers = [[hi, lo], [hi, hi], [lo, hi], [lo, lo]];
    const start = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][side];
    const ang = start + k * (Math.PI / 2);
    out.x = centers[side][0] + Math.cos(ang) * r;
    out.y = centers[side][1] + Math.sin(ang) * r;
    out.a = ang + Math.PI / 2;
}

/** Sciezka zaokraglonego kwadratu na offsecie o (do stroke w bake). */
export function moatLoopPath(c: CanvasRenderingContext2D, L: MoatLoop, o: number, rounded: boolean): void {
    const a = L.c0 - o, b = L.c1 + o;
    const r = rounded ? Math.max(2, L.half + o) : 0;
    c.beginPath();
    if (r > 0) c.roundRect(a, a, b - a, b - a, r); else c.rect(a, a, b - a, b - a);
}
