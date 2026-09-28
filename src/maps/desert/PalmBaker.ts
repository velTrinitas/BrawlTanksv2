import * as PIXI from 'pixi.js';

/**
 * PalmBaker — DESERT ART v2 (uwaga Mariusza 2026-09-28): palmy daktylowe od nowa,
 * realistyczne, fake-3D, „juicy" gradienty.
 *
 * Canvas 2D (jak Tier3Baker / IceCube), bo potrzebne sa PRAWDZIWE gradienty liniowe
 * i radialne, ktorych PIXI.Graphics nie ma. Pieczone RAZ na wariant (4 warianty,
 * cache modulowy) w rozdzielczosci x2 i wyswietlane w skali 0.5 = ostre krawedzie
 * mimo wylaczonego MSAA na dotyku.
 *
 * Budowa (slonce NW, wspolne dla mapy):
 *  - dwa cienie: pnia przy podstawie i KORONY daleko na SE (korona jest wysoko = fake-3D),
 *  - pien: lekki luk, gradient walca (jasny NW -> ciemny SE), luski po nasadach lisci,
 *  - pioropusz: tylne liscie ciemniejsze i krotsze, przednie jasne; kazdy lisc = osadka
 *    z gradientem nasada -> koniec + dziesiatki listkow bocznych (pierzasty lisc daktylowca),
 *    blik na osadce, lekkie opadanie koncowek,
 *  - kisc daktyli pod korona (radialne gradienty = blyszczace owoce).
 */

const SCALE = 2;            // pieczenie x2
const W = 170, H = 170;     // kadr w jednostkach swiata
const BASE_X = 85, BASE_Y = 150;
const VARIANTS = 4;

const _cache: (PIXI.Texture | null)[] = new Array(VARIANTS).fill(null);

function rngFor(seed: number): () => number {
    let a = (seed * 2654435761) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function getPalmTexture(variant: number): PIXI.Texture {
    const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
    const hit = _cache[v];
    if (hit && !hit.destroyed) return hit;
    const cv = document.createElement('canvas');
    cv.width = W * SCALE;
    cv.height = H * SCALE;
    const c = cv.getContext('2d')!;
    c.scale(SCALE, SCALE);
    c.translate(BASE_X, BASE_Y);
    drawPalm(c, rngFor(v + 11), v);
    const tex = PIXI.Texture.from(cv);
    _cache[v] = tex;
    return tex;
}

/** Sprite palmy z kotwica w podstawie pnia (do Y-sortu z czolgami). */
export function makePalmSprite(variant: number, scale: number, mirror: boolean): PIXI.Sprite {
    const s = new PIXI.Sprite(getPalmTexture(variant));
    s.anchor.set(BASE_X / W, BASE_Y / H);
    s.scale.set((mirror ? -1 : 1) * scale / SCALE, scale / SCALE);
    return s;
}

function drawPalm(c: CanvasRenderingContext2D, rnd: () => number, v: number): void {
    const trunkH = 78 + rnd() * 18;
    const lean = (rnd() - 0.5) * 26;
    const topX = lean, topY = -trunkH;

    // ── 1. Cienie: pien przy ziemi + korona daleko na SE ──
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    c.ellipse(10, 2, 14, 4, 0.2, 0, Math.PI * 2);
    c.fill();
    const shX = topX * 0.4 + trunkH * 0.42, shY = trunkH * 0.1;
    const sg = c.createRadialGradient(shX, shY, 4, shX, shY, 46);
    sg.addColorStop(0, 'rgba(0,30,0,0.30)');
    sg.addColorStop(1, 'rgba(0,30,0,0)');
    c.fillStyle = sg;
    c.beginPath();
    c.ellipse(shX, shY, 46, 16, 0.15, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // ── 2. Pien: luk z gradientem walca + luski ──
    const N = 16;
    const pt = (t: number) => {
        // bezier kwadratowy baza -> szczyt, luk w strone przechylu
        const cx = lean * 0.15, cy = -trunkH * 0.55;
        const x = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * cx + t * t * topX;
        const y = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * cy + t * t * topY;
        return { x, y, w: 7.5 - t * 3 };
    };
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
        const p = pt(i / N);
        left.push({ x: p.x - p.w, y: p.y });
        right.push({ x: p.x + p.w, y: p.y });
    }
    const tg = c.createLinearGradient(-8, 0, 8, 0);
    tg.addColorStop(0, '#d9ab70');
    tg.addColorStop(0.35, '#a8743f');
    tg.addColorStop(0.75, '#6e4420');
    tg.addColorStop(1, '#3e2410');
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(left[0].x, left[0].y);
    for (const p of left) c.lineTo(p.x, p.y);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
    c.closePath();
    c.fill();
    // luski (nasady starych lisci): ciemne luki + jasna krawedz
    for (let i = 1; i < 22; i++) {
        const t = i / 22;
        const p = pt(t);
        c.strokeStyle = 'rgba(50,28,10,0.55)';
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(p.x - p.w, p.y - 1);
        c.quadraticCurveTo(p.x, p.y + 2.6, p.x + p.w, p.y - 1);
        c.stroke();
        c.strokeStyle = 'rgba(255,225,170,0.35)';
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(p.x - p.w * 0.9, p.y - 2.2);
        c.quadraticCurveTo(p.x - p.w * 0.2, p.y + 0.4, p.x + p.w * 0.1, p.y - 1.8);
        c.stroke();
    }

    // ── 3. Kisc daktyli pod korona ──
    const dates = (x: number, y: number, n: number) => {
        for (let i = 0; i < n; i++) {
            const dx = x + (rnd() - 0.5) * 10, dy = y + rnd() * 9;
            const g = c.createRadialGradient(dx - 0.8, dy - 0.8, 0.3, dx, dy, 2.6);
            g.addColorStop(0, '#ffcf6a');
            g.addColorStop(0.5, '#e07a1c');
            g.addColorStop(1, '#7a3208');
            c.fillStyle = g;
            c.beginPath();
            c.ellipse(dx, dy, 2.2, 2.7, 0, 0, Math.PI * 2);
            c.fill();
        }
    };
    dates(topX - 7, topY + 4, 9);
    dates(topX + 6, topY + 5, 8);

    // ── 4. Pioropusz: tylne (ciemne) -> przednie (jasne) ──
    const FRONDS = 13;
    const fronds: { a: number; len: number; back: boolean }[] = [];
    for (let i = 0; i < FRONDS; i++) {
        const a = (i / FRONDS) * Math.PI * 2 + rnd() * 0.25 + v * 0.3;
        const back = Math.sin(a) < -0.15;          // wskazujace „w gore ekranu" = dalej od widza
        fronds.push({ a, len: (back ? 40 : 48) + rnd() * 14, back });
    }
    fronds.sort((p, q) => Number(q.back) - Number(p.back) || Math.sin(p.a) - Math.sin(q.a));
    for (const f of fronds) drawFrond(c, topX, topY, f.a, f.len, f.back, rnd);

    // Srodek korony (serce) + mlode, sztywne liscie w gore
    const hg = c.createRadialGradient(topX - 2, topY - 3, 1, topX, topY, 8);
    hg.addColorStop(0, '#9ccf4a');
    hg.addColorStop(0.6, '#4e8a24');
    hg.addColorStop(1, '#264a12');
    c.fillStyle = hg;
    c.beginPath();
    c.ellipse(topX, topY, 8, 5.5, 0, 0, Math.PI * 2);
    c.fill();
    for (let k = -1; k <= 1; k++) {
        c.strokeStyle = '#8fd048';
        c.lineWidth = 2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(topX, topY);
        c.quadraticCurveTo(topX + k * 4, topY - 12, topX + k * 7, topY - 18);
        c.stroke();
    }
}

/** Pierzasty lisc daktylowca: osadka z gradientem + listki boczne, koncowka opada. */
function drawFrond(
    c: CanvasRenderingContext2D, ox: number, oy: number, a: number, len: number, back: boolean, rnd: () => number,
): void {
    const side = Math.abs(Math.cos(a));
    const droop = 10 + side * 16;                           // boczne opadaja mocniej
    const tipX = ox + Math.cos(a) * len;
    const tipY = oy + Math.sin(a) * len * 0.62 + droop;     // 0.62 = splaszczenie (widok z gory/z boku)
    const cx = ox + Math.cos(a) * len * 0.5;
    const cy = oy + Math.sin(a) * len * 0.31 - 8;           // luk w gore, potem opad
    const bez = (t: number) => ({
        x: (1 - t) * (1 - t) * ox + 2 * (1 - t) * t * cx + t * t * tipX,
        y: (1 - t) * (1 - t) * oy + 2 * (1 - t) * t * cy + t * t * tipY,
    });
    const grad = c.createLinearGradient(ox, oy, tipX, tipY);
    if (back) {
        grad.addColorStop(0, '#1e4a14');
        grad.addColorStop(0.55, '#2f6a1c');
        grad.addColorStop(1, '#5a8a2a');
    } else {
        grad.addColorStop(0, '#2c6a1a');
        grad.addColorStop(0.5, '#56a82c');
        grad.addColorStop(1, '#c6e862');
    }
    // Listki boczne (pierzaste) — rysowane przed osadka
    const LEAF = 18;
    c.strokeStyle = grad;
    c.lineCap = 'round';
    for (let i = 2; i <= LEAF; i++) {
        const t = i / LEAF;
        const p = bez(t);
        const p2 = bez(Math.min(1, t + 0.02));
        const dx = p2.x - p.x, dy = p2.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l;
        const ll = (1 - Math.abs(t - 0.45) * 1.4) * 13 + 3; // najdluzsze w srodku
        c.lineWidth = 1.6 - t * 0.6;
        for (const s of [1, -1]) {
            // listek skierowany do przodu i lekko w dol (grawitacja)
            const ex = p.x + nx * s * ll + (dx / l) * ll * 0.45;
            const ey = p.y + ny * s * ll + (dy / l) * ll * 0.45 + ll * 0.35;
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.quadraticCurveTo(p.x + nx * s * ll * 0.6, p.y + ny * s * ll * 0.6 - 1, ex, ey);
            c.stroke();
        }
    }
    // Osadka (grubsza u nasady) + blik slonca
    c.lineWidth = back ? 2.2 : 2.8;
    c.strokeStyle = back ? '#3a5a1a' : '#6a9a2e';
    c.beginPath();
    c.moveTo(ox, oy);
    c.quadraticCurveTo(cx, cy, tipX, tipY);
    c.stroke();
    if (!back) {
        c.lineWidth = 1;
        c.strokeStyle = 'rgba(240,255,170,0.65)';
        c.beginPath();
        c.moveTo(ox, oy - 1);
        c.quadraticCurveTo(cx, cy - 1.2, tipX - (tipX - ox) * 0.2, tipY - (tipY - oy) * 0.2 - 1);
        c.stroke();
    }
    void rnd;
}
