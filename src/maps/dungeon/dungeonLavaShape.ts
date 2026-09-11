/**
 * dungeonLavaShape.ts — NIEREGULARNY obrys basenu lawy (SAVE THE QUEEN Q2 polish).
 *
 * Decyzja Mariusza (2. playtest v3): lawa ma byc zywa i nieregularna, "czasem sie wylewa
 * z kontenera". Obrys = prostokat strefy z WYPUKLYMI lobami na zewnatrz (0..MAX_BULGE px)
 * + 2-3 male rozlewiska (spills) tuz za krawedzia. Strefa DoT (Q4) pozostaje AABB z layoutu;
 * wizual jest ZAWSZE >= strefy, wiec gracz stojacy na krawedzi rysunku NIE dostaje obrazen
 * "znikad" (Czytelnosc: hitbox nie wychodzi poza to, co widac).
 *
 * Wspoldzielone przez bake gruntu (Canvas 2D, DungeonMap) i warstwe animowana (PIXI,
 * DungeonLava) — ten sam seed => ten sam ksztalt w obu warstwach.
 */

export interface LavaSpill { x: number; y: number; rx: number; ry: number; rot: number }
export interface LavaOutline {
    /** zamkniety wielokat [x0,y0,x1,y1,...] (rysowac krzywa przez srodki odcinkow) */
    pts: number[];
    spills: LavaSpill[];
}

export const LAVA_MAX_BULGE = 24; // <= margines skorupy w bake (26)

function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function lavaPoolOutline(r: { x: number; y: number; w: number; h: number }, seed: number): LavaOutline {
    const rng = mulberry(seed);
    const STEP = 34;
    // punkty obwodu prostokata (zgodnie z ruchem wskazowek) + normalne na zewnatrz
    const base: { x: number; y: number; nx: number; ny: number }[] = [];
    const along = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): void => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(2, Math.round(len / STEP));
        for (let i = 0; i < n; i++) { const t = i / n; base.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny }); }
    };
    along(r.x, r.y, r.x + r.w, r.y, 0, -1);
    along(r.x + r.w, r.y, r.x + r.w, r.y + r.h, 1, 0);
    along(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, 1);
    along(r.x, r.y + r.h, r.x, r.y, -1, 0);
    // szum wygladzony (srednia z sasiadow) => loby, nie zabki
    const raw = base.map(() => rng());
    const n = raw.length;
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
        const s = (raw[(i + n - 1) % n] + raw[i] * 2 + raw[(i + 1) % n]) / 4;
        const bulge = 3 + s * (LAVA_MAX_BULGE - 3);
        const p = base[i];
        // w rogach normalna = przekatna (zaokraglenie)
        const corner = (p.x === r.x || p.x === r.x + r.w) && (p.y === r.y || p.y === r.y + r.h);
        const nx = corner ? (p.x === r.x ? -0.7 : 0.7) : p.nx;
        const ny = corner ? (p.y === r.y ? -0.7 : 0.7) : p.ny;
        pts.push(p.x + nx * bulge, p.y + ny * bulge);
    }
    // rozlewiska: 2-3 elipsy tuz za krawedzia (losowy bok), male (nie strefa!)
    const spills: LavaSpill[] = [];
    const count = 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
        const side = Math.floor(rng() * 4);
        const t = 0.15 + rng() * 0.7;
        const rx = 14 + rng() * 16, ry = 8 + rng() * 8;
        const off = LAVA_MAX_BULGE + 6 + rng() * 10;
        let x: number, y: number;
        if (side === 0) { x = r.x + r.w * t; y = r.y - off; }
        else if (side === 1) { x = r.x + r.w + off; y = r.y + r.h * t; }
        else if (side === 2) { x = r.x + r.w * t; y = r.y + r.h + off; }
        else { x = r.x - off; y = r.y + r.h * t; }
        spills.push({ x, y, rx, ry, rot: rng() * Math.PI });
    }
    return { pts, spills };
}

/** Sciezka wygladzona (krzywe kwadratowe przez srodki odcinkow) — ten sam algorytm dla Canvas i PIXI. */
export function traceSmooth(ctx: { moveTo(x: number, y: number): unknown; quadraticCurveTo(cx: number, cy: number, x: number, y: number): unknown }, pts: number[]): void {
    const n = pts.length / 2;
    const mx = (i: number): number => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
    const my = (i: number): number => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
    ctx.moveTo(mx(0), my(0));
    for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(pts[(i % n) * 2], pts[(i % n) * 2 + 1], mx(i), my(i));
}
