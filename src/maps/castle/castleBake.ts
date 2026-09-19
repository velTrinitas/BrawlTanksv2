import * as PIXI from 'pixi.js';
import { CASTLE_PALETTE as P, CASTLE_LIGHT as L } from './castlePalette';

/**
 * castleBake.ts — pieczony art zamku (OBRON ZAMEK F2). "Zamek musi byc genialny".
 *
 * ZASADA (Tier3Baker / propBaker): kazda czesc rysowana RAZ w Canvas 2D (gradienty,
 * AA, ktorego mobile renderer nie ma) -> PIXI.Texture -> w meczu TYLKO sprite'y i
 * transformy. Cache modulowy per klucz `${kind}:${orient}:${tier}` — nigdy nie
 * niszczony (~19 malych tekstur na caly czas zycia gry).
 *
 * FAKE 3D — ekstruzja pionowa (ta sama kamera co czolgi w render2d.drawExtrudedSolid):
 * bryla o wysokosci H = sciana poludniowa (pas H px pod gorna sciana) + "wieko"
 * przesuniete o H w gore. Rdzen skopiowany logika z render2d (ts-nocheck) zamiast
 * importu z experimental. Swiatlo T1: slonce NW -> jasne krawedzie N/W, cien SE.
 *
 * ANCHOR: kazdy bake zwraca `ox/oy` = pozycja TOP-LEFT hitboxu (AABB) wewnatrz
 * tekstury, wiec sprite laduje w (x - ox, y - oy) i hitbox == wizual (Czytelnosc).
 */

export interface BakedPart {
    tex: PIXI.Texture;
    /** offset AABB top-left inside the texture */
    ox: number;
    oy: number;
}

export type DamageTier = 0 | 1 | 2 | 3;
export type WallSide = 'N' | 'S' | 'W' | 'E';

export const WALL_H = 34;      // wysokosc muru (px ekranu)
export const MERLON_H = 10;    // blanki nad parapetem
export const TOWER_H = 66;     // beben wiezy (wyzszy: dach-elipsa ma zostawic ~34 px widocznej sciany)
export const TOWER_R = 46;     // promien wizualny (AABB 84 => r hitboxu 42)
export const KEEP_H1 = 56;     // podstawa donzonu
export const KEEP_H2 = 44;     // pietro donzonu
export const GATE_H = 40;      // brama
export const TURRET_H = 60;    // wiezyczki bramne

const cache = new Map<string, BakedPart>();

function baked(key: string, w: number, h: number, ox: number, oy: number,
    draw: (c: CanvasRenderingContext2D) => void): BakedPart {
    const hit = cache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w);
    cv.height = Math.ceil(h);
    const c = cv.getContext('2d');
    if (!c) return { tex: PIXI.Texture.WHITE, ox: 0, oy: 0 };
    draw(c);
    const part = { tex: PIXI.Texture.from(cv), ox, oy };
    cache.set(key, part);
    return part;
}

// ── deterministic rng for cracks/bricks (bake musi byc powtarzalny) ──
function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// =================================================================
// PRIMITIVES
// =================================================================

/** Miekki cien kontaktowy SE pod bryla (rodzina B z T2: ciasny, przy stopie). */
function contactShadow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, H: number): void {
    const spread = Math.round(H * 0.35);
    c.save();
    c.fillStyle = `rgba(10,20,12,${L.shadowAlpha * 0.5})`;
    c.fillRect(x + L.shX + 2, y + L.shY + 2, w + spread * 0.5, h + spread);
    c.fillStyle = `rgba(10,20,12,${L.shadowAlpha * 0.45})`;
    c.fillRect(x + L.shX, y + L.shY, w + spread * 0.25, h + spread * 0.5);
    c.restore();
}

/** Mur ceglany na prostokacie (rzedy 8 px, przesuniete co drugi rzad). */
function bricks(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number, w: number, h: number,
    base: string, joint: string, rowH = 8, brickW = 18, alpha = 1): void {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.globalAlpha = alpha;
    c.fillStyle = base;
    c.fillRect(x, y, w, h);
    c.strokeStyle = joint;
    c.lineWidth = 1;
    for (let row = 0; row * rowH < h + rowH; row++) {
        const yy = y + row * rowH;
        c.beginPath(); c.moveTo(x, yy + 0.5); c.lineTo(x + w, yy + 0.5); c.stroke();
        const off = (row % 2) * (brickW / 2);
        for (let bx = x - brickW + off; bx < x + w + brickW; bx += brickW) {
            c.beginPath(); c.moveTo(bx + 0.5, yy); c.lineTo(bx + 0.5, yy + rowH); c.stroke();
            // losowo jasniejsza/ciemniejsza cegla (zycie w kamieniu)
            if (rng() < 0.18) {
                c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
                c.fillRect(bx + 1, yy + 1, brickW - 2, rowH - 2);
            }
        }
    }
    c.restore();
}

/** Ekstrudowany prostokat: sciana S (gradient) + wieko; zwraca y wieka. */
function extrudeRect(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number, w: number, h: number, H: number,
    opts: { topFill?: string; sideBricks?: boolean; westSliver?: boolean; sunBias?: number } = {}): number {
    // sciana poludniowa: pas (x, y+h-H .. y+h)
    const sy = y + h - H;
    const g = c.createLinearGradient(0, sy, 0, y + h);
    g.addColorStop(0, P.granite);
    g.addColorStop(1, P.graniteDark);
    c.fillStyle = g;
    c.fillRect(x, sy, w, H);
    if (opts.sideBricks !== false) bricks(c, rng, x, sy, w, H, 'rgba(0,0,0,0)', P.graniteJoint, 8, 18, 0.55);
    // v0.196.0 — SWIATLO Z NW na scianie: poziomy gradient (zachod cieplo-jasny -> wschod w cieniu).
    // Jeden fillRect z gradientem na bake — zero kosztu runtime.
    const sg = c.createLinearGradient(x, 0, x + w, 0);
    sg.addColorStop(0, 'rgba(255,238,205,0.12)');
    sg.addColorStop(0.55, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.16)');
    c.fillStyle = sg;
    c.fillRect(x, sy, w, H);
    // cien wlasny przy ziemi (AO) — v0.196.0: wyzszy i ciemniejszy pas, bryla "siedzi" na trawie
    const aoH = Math.min(14, H * 0.4);
    const ao = c.createLinearGradient(0, y + h - aoH, 0, y + h);
    ao.addColorStop(0, 'rgba(0,0,0,0)');
    ao.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = ao;
    c.fillRect(x, y + h - aoH, w, aoH);
    // wschodnia krawedz sciany ciemniejsza (SE w cieniu), zachodnia jasniejsza
    if (opts.westSliver !== false) {
        // v0.196.0: miekki gradient zamiast twardego paska 3 px (AO w naroznik SE)
        const eg = c.createLinearGradient(x + w - 10, 0, x + w, 0);
        eg.addColorStop(0, 'rgba(0,0,0,0)');
        eg.addColorStop(1, 'rgba(0,0,0,0.26)');
        c.fillStyle = eg; c.fillRect(x + w - 10, sy, 10, H);
        c.fillStyle = `rgba(255,255,255,${L.highlightAlpha * 0.6})`; c.fillRect(x, sy, 2, H);
    }
    // wieko
    const ty = y - H;
    c.fillStyle = opts.topFill ?? P.graniteTop;
    c.fillRect(x, ty, w, h);
    // v0.196.0 — wieko w swietle NW: przekatny gradient (jasny naroznik NW -> cien SE).
    const tg = c.createLinearGradient(x, ty, x + w, ty + h);
    tg.addColorStop(0, 'rgba(255,245,220,0.20)');
    tg.addColorStop(0.5, 'rgba(0,0,0,0)');
    tg.addColorStop(1, 'rgba(0,0,0,0.16)');
    c.fillStyle = tg;
    c.fillRect(x, ty, w, h);
    // sunBias: czesc po stronie NW calego zamku lekko jasniejsza, po SE ciemniejsza (+1 / -1)
    const sb = opts.sunBias ?? 0;
    if (sb !== 0) {
        c.fillStyle = sb > 0 ? `rgba(255,240,210,${0.07 * sb})` : `rgba(0,0,0,${-0.08 * sb})`;
        c.fillRect(x, ty, w, h);
        c.fillRect(x, sy, w, H);
    }
    // krawedz wieka: jasna N/W, ciemna S/E
    c.fillStyle = `rgba(255,255,255,${L.highlightAlpha})`;
    c.fillRect(x, ty, w, 2); c.fillRect(x, ty, 2, h);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(x, ty + h - 2, w, 2); c.fillRect(x + w - 2, ty, 2, h);
    return ty;
}

/** Blanki wzdluz krawedzi wieka. edge: ktora krawedz wieka jest ZEWNETRZNA. */
function merlons(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge: WallSide,
    skipEvery: number = 0): void {
    const size = 14, gap = 10, side = MERLON_H;
    const top = P.graniteTop, dark = P.graniteDark, lit = `rgba(255,255,255,${L.highlightAlpha})`;
    let i = 0;
    if (edge === 'N' || edge === 'S') {
        const ey = edge === 'N' ? y : y + h;
        for (let mx = x + 4; mx + size <= x + w - 4; mx += size + gap, i++) {
            if (skipEvery && i % skipEvery === 1) continue;
            const by = (edge === 'N' ? ey : ey - 8) - side; // stopa blanku na parapecie
            c.fillStyle = dark; c.fillRect(mx, by + 6, size, side);      // bok (cien)
            c.fillStyle = top;  c.fillRect(mx, by, size, 8);             // wieko blanku
            c.fillStyle = lit;  c.fillRect(mx, by, size, 1.5); c.fillRect(mx, by, 1.5, 8);
        }
    } else {
        const ex = edge === 'W' ? x : x + w - 8;
        for (let my = y + 4; my + size <= y + h - 4; my += size + gap, i++) {
            if (skipEvery && i % skipEvery === 1) continue;
            const by = my - side;
            c.fillStyle = dark; c.fillRect(ex, by + size - 2, 8, side + 2);
            c.fillStyle = top;  c.fillRect(ex, by, 8, size);
            c.fillStyle = lit;  c.fillRect(ex, by, 8, 1.5); c.fillRect(ex, by, 1.5, size);
        }
    }
}

/** Pekniecia: lamane linie z losowym rozgalezieniem. */
function cracks(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number, w: number, h: number, count: number, width = 1.6): void {
    c.save();
    c.strokeStyle = P.crack;
    c.lineWidth = width;
    c.lineCap = 'round';
    for (let i = 0; i < count; i++) {
        let px = x + rng() * w, py = y + rng() * h;
        c.beginPath(); c.moveTo(px, py);
        const segs = 3 + Math.floor(rng() * 4);
        for (let s = 0; s < segs; s++) {
            px += (rng() - 0.5) * 16; py += (rng() - 0.3) * 12;
            c.lineTo(px, py);
        }
        c.stroke();
        if (rng() < 0.5) { c.beginPath(); c.moveTo(px, py); c.lineTo(px + (rng() - 0.5) * 12, py + rng() * 8); c.stroke(); }
    }
    c.restore();
}

/** Wylom: ciemna nieregularna plama + rozsypane kamienie wokol. */
function breach(c: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number, r: number): void {
    c.save();
    c.fillStyle = P.graniteDeep;
    c.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
        const rr = r * (0.7 + rng() * 0.5);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.7;
        if (a === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    for (let i = 0; i < 9; i++) {
        c.fillStyle = rng() < 0.7 ? P.granite : P.graniteTop;
        const sx = cx + (rng() - 0.5) * r * 3, sy = cy + rng() * r * 1.4;
        c.beginPath(); c.ellipse(sx, sy, 3 + rng() * 4, 2 + rng() * 3, rng(), 0, Math.PI * 2); c.fill();
    }
    c.restore();
}

/** Rumowisko na footprintcie (tier 3 muru/bramy): niski szary kopiec + odlamki. */
function rubble(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number, w: number, h: number): void {
    c.save();
    c.fillStyle = 'rgba(10,20,12,0.22)';
    c.fillRect(x + 3, y + 3, w, h + 4);
    const stones = Math.round((w * h) / 90);
    for (let i = 0; i < stones; i++) {
        const sx = x + rng() * w, sy = y - 6 + rng() * (h + 10);
        const rr = 4 + rng() * 7;
        c.fillStyle = P.graniteDark;
        c.beginPath(); c.ellipse(sx + 1.5, sy + 1.5, rr, rr * 0.65, rng() * Math.PI, 0, Math.PI * 2); c.fill();
        c.fillStyle = rng() < 0.6 ? P.granite : P.graniteTop;
        c.beginPath(); c.ellipse(sx, sy, rr, rr * 0.65, rng() * Math.PI, 0, Math.PI * 2); c.fill();
    }
    // odlamki szkarlatnych dachowek / belek
    for (let i = 0; i < 4; i++) {
        c.fillStyle = rng() < 0.5 ? P.crimson : P.oakDark;
        c.save();
        c.translate(x + rng() * w, y + rng() * h);
        c.rotate(rng() * Math.PI);
        c.fillRect(-6, -2, 12, 4);
        c.restore();
    }
    c.restore();
}

/** Strzelnica (pionowa szczelina) na scianie. */
function arrowSlit(c: CanvasRenderingContext2D, x: number, y: number, h = 10): void {
    c.fillStyle = P.graniteDeep;
    c.fillRect(x - 1.5, y, 3, h);
    c.fillStyle = `rgba(255,255,255,${L.highlightAlpha})`;
    c.fillRect(x - 3, y, 1.5, h);
}

// =================================================================
// WALL SEGMENT — 2 orientacje x 4 tiery
// =================================================================

const WALL_MX = 14;
const WALL_MTOP = WALL_H + MERLON_H + 8;
const WALL_MBOT = 16;

export function bakeWall(w: number, h: number, side: WallSide, tier: DamageTier): BakedPart {
    const key = `wall:${side}:${w}x${h}:${tier}`;
    const tw = w + WALL_MX * 2, th = h + WALL_MTOP + WALL_MBOT;
    return baked(key, tw, th, WALL_MX, WALL_MTOP, (c) => {
        const rng = makeRng(0x57414c4c + tier * 7 + (side.charCodeAt(0) << 3));
        const x = WALL_MX, y = WALL_MTOP;
        if (tier === 3) { rubble(c, rng, x, y, w, h); return; }

        contactShadow(c, x, y, w, h, WALL_H);
        // v0.196.0: mury N/W stoja od strony slonca (NW) -> jasniejsze; E/S w cieniu bryly zamku
        const ty = extrudeRect(c, rng, x, y, w, h, WALL_H, { sunBias: side === 'N' || side === 'W' ? 1 : -1 });
        // wieko: chodnik + parapet wewnetrzny (ciemna linia po stronie podworza)
        const horizontal = w > h;
        c.fillStyle = 'rgba(0,0,0,0.16)';
        if (horizontal) {
            const innerY = side === 'N' ? ty + h - 5 : ty;
            c.fillRect(x, innerY, w, 5);
        } else {
            const innerX = side === 'W' ? x + w - 5 : x;
            c.fillRect(innerX, ty, 5, h);
        }
        // plyty chodnika
        c.strokeStyle = 'rgba(0,0,0,0.14)';
        c.lineWidth = 1;
        if (horizontal) { for (let px = x + 20; px < x + w; px += 24) { c.beginPath(); c.moveTo(px, ty + 2); c.lineTo(px, ty + h - 2); c.stroke(); } }
        else { for (let py = ty + 20; py < ty + h; py += 24) { c.beginPath(); c.moveTo(x + 2, py); c.lineTo(x + w - 2, py); c.stroke(); } }
        // mech przy stopie (NW strona zyje)
        c.fillStyle = P.moss;
        c.globalAlpha = 0.5;
        for (let i = 0; i < Math.round(w / 30); i++) {
            const mx = x + rng() * w, my = y + h - 3 - rng() * 4;
            c.beginPath(); c.ellipse(mx, my, 4 + rng() * 6, 2, 0, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
        // blanki na krawedzi zewnetrznej
        merlons(c, x, ty, w, h, side, tier >= 2 ? 2 : 0);
        // uszkodzenia
        if (tier >= 1) {
            cracks(c, rng, x, y + h - WALL_H, w, WALL_H, tier === 1 ? 3 : 5);
            cracks(c, rng, x, ty, w, h, tier === 1 ? 2 : 3, 1.2);
        }
        if (tier >= 2) {
            // wylom w SRODKU segmentu: mur poziomy -> na scianie S, mur pionowy -> na wieku
            // (jego sciana S to tylko 28 px konca segmentu — wylom tam czytalby sie jako
            // uszkodzenie wiezy/furtki, nie tego muru)
            const bx = x + w * 0.5;
            const by = horizontal ? y + h - WALL_H * 0.45 : ty + h * 0.5;
            breach(c, rng, bx, by, horizontal ? 18 : 15);
            // okopcenie
            c.fillStyle = 'rgba(20,20,20,0.28)';
            c.beginPath();
            if (horizontal) c.ellipse(bx, y + h - WALL_H * 0.6, 42, WALL_H * 0.5, 0, 0, Math.PI * 2);
            else c.ellipse(bx, by, w * 0.8, 40, 0, 0, Math.PI * 2);
            c.fill();
        }
    });
}

// =================================================================
// KEEP — donzon: 2-stopniowa ekstruzja + dach piramidowy + bartyzany + sztandar
// =================================================================

const KEEP_M = 24;
export function bakeKeep(w: number, h: number, tier: DamageTier): BakedPart {
    const t = Math.min(tier, 2) as DamageTier; // donzon nie ma rumowiska (0 HP = koniec meczu)
    const key = `keep:${w}x${h}:${t}`;
    const upW = Math.round(w * 0.74), upH = Math.round(h * 0.74);
    const roofRise = 34;
    const topM = KEEP_H1 + KEEP_H2 + roofRise + 40;
    const tw = w + KEEP_M * 2, th = h + topM + KEEP_M;
    return baked(key, tw, th, KEEP_M, topM, (c) => {
        const rng = makeRng(0x4b454550 + t * 11);
        const x = KEEP_M, y = topM;
        contactShadow(c, x, y, w, h, KEEP_H1 + KEEP_H2);
        // PODSTAWA
        const ty1 = extrudeRect(c, rng, x, y, w, h, KEEP_H1);
        // wrota (na scianie S podstawy): luk + dwie polowy debowe + zlote cwieki
        const doorW = 40, doorH = 30, dx = x + w / 2 - doorW / 2, dy = y + h - doorH;
        c.fillStyle = P.graniteDeep;
        c.beginPath(); c.moveTo(dx - 4, y + h); c.lineTo(dx - 4, dy + 6); c.arc(x + w / 2, dy + 6, doorW / 2 + 4, Math.PI, 0); c.lineTo(dx + doorW + 4, y + h); c.closePath(); c.fill();
        const dg = c.createLinearGradient(dx, dy, dx, y + h);
        dg.addColorStop(0, P.oak); dg.addColorStop(1, P.oakDark);
        c.fillStyle = dg;
        c.beginPath(); c.moveTo(dx, y + h); c.lineTo(dx, dy + 8); c.arc(x + w / 2, dy + 8, doorW / 2, Math.PI, 0); c.lineTo(dx + doorW, y + h); c.closePath(); c.fill();
        c.strokeStyle = P.oakDark; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x + w / 2, dy + 8); c.lineTo(x + w / 2, y + h); c.stroke();
        c.strokeStyle = P.iron; c.lineWidth = 3;
        for (const by of [dy + 14, dy + 22]) { c.beginPath(); c.moveTo(dx + 2, by); c.lineTo(dx + doorW - 2, by); c.stroke(); }
        c.fillStyle = P.gold;
        for (const by of [dy + 14, dy + 22]) for (const bx of [dx + 6, dx + 15, dx + 25, dx + 34]) { c.beginPath(); c.arc(bx, by, 1.6, 0, Math.PI * 2); c.fill(); }
        // strzelnice podstawy (2 rzedy)
        for (let i = 0; i < 4; i++) { arrowSlit(c, x + 24 + i * 24, y + h - KEEP_H1 + 10, 12); arrowSlit(c, x + w - 24 - i * 24, y + h - KEEP_H1 + 10, 12); }
        // PIETRO (wycentrowane na wieku podstawy)
        const ux = x + (w - upW) / 2, uy = ty1 + (h - upH) / 2;
        contactShadow(c, ux, uy, upW, upH, KEEP_H2);
        const ty2 = extrudeRect(c, rng, ux, uy, upW, upH, KEEP_H2);
        for (let i = 0; i < 3; i++) { arrowSlit(c, ux + 22 + i * 22, uy + upH - KEEP_H2 + 8, 11); arrowSlit(c, ux + upW - 22 - i * 22, uy + upH - KEEP_H2 + 8, 11); }
        // SZTANDAR na scianie S pietra: szkarlat + zlota korona
        const bw = 30, bh = 34, bx = ux + upW / 2 - bw / 2, by = uy + upH - KEEP_H2 + 4;
        c.fillStyle = P.crimsonDark; c.fillRect(bx + 2, by + 2, bw, bh);
        c.fillStyle = P.crimson;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + bw, by); c.lineTo(bx + bw, by + bh - 8); c.lineTo(bx + bw / 2, by + bh); c.lineTo(bx, by + bh - 8); c.closePath(); c.fill();
        c.strokeStyle = P.gold; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = P.gold;
        const kx = bx + bw / 2, ky = by + 12;
        c.beginPath(); c.moveTo(kx - 9, ky + 8); c.lineTo(kx - 9, ky); c.lineTo(kx - 4.5, ky + 4); c.lineTo(kx, ky - 4); c.lineTo(kx + 4.5, ky + 4); c.lineTo(kx + 9, ky); c.lineTo(kx + 9, ky + 8); c.closePath(); c.fill();
        c.fillRect(kx - 9, ky + 9, 18, 3);
        // blanki wokol wieka podstawy (na 4 krawedziach, poza pietrem)
        merlons(c, x, ty1, w, h, 'N', t >= 2 ? 2 : 0);
        merlons(c, x, ty1, w, h, 'S', t >= 2 ? 2 : 0);
        merlons(c, x, ty1, w, h, 'W', t >= 2 ? 2 : 0);
        merlons(c, x, ty1, w, h, 'E', t >= 2 ? 2 : 0);
        // DACH piramidowy nad pietrem
        const apexX = ux + upW / 2, apexY = ty2 + upH / 2 - roofRise;
        const corners = [[ux - 6, ty2 - 6], [ux + upW + 6, ty2 - 6], [ux + upW + 6, ty2 + upH + 6], [ux - 6, ty2 + upH + 6]];
        roofFaces(c, corners, apexX, apexY); // v0.196.0: gradienty + rim-light ze slonca NW
        // szwy dachowek
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
        for (let k = 1; k < 5; k++) {
            const f = k / 5;
            c.beginPath();
            for (let i = 0; i < 4; i++) { const p = corners[i]; const px = p[0] + (apexX - p[0]) * f, py = p[1] + (apexY - p[1]) * f; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
            c.closePath(); c.stroke();
        }
        c.strokeStyle = P.gold; c.lineWidth = 2;
        c.beginPath(); c.moveTo(corners[0][0], corners[0][1]); for (let i = 1; i < 4; i++) c.lineTo(corners[i][0], corners[i][1]); c.closePath(); c.stroke();
        // finial + maszt sztandaru glownego
        c.fillStyle = P.gold; c.beginPath(); c.arc(apexX, apexY, 6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = P.goldDark; c.lineWidth = 2.5; c.beginPath(); c.moveTo(apexX, apexY - 4); c.lineTo(apexX, apexY - 34); c.stroke();
        c.fillStyle = P.gold; c.beginPath(); c.arc(apexX, apexY - 35, 3, 0, Math.PI * 2); c.fill();
        // BARTYZANY (4 male bebny na rogach pietra)
        for (const [bxx, byy] of [[ux, ty2], [ux + upW, ty2], [ux, ty2 + upH], [ux + upW, ty2 + upH]]) {
            const br = 11, bH = 14;
            const bg2 = c.createLinearGradient(bxx - br, 0, bxx + br, 0);
            bg2.addColorStop(0, P.graniteTop); bg2.addColorStop(1, P.graniteDeep);
            c.fillStyle = bg2;
            c.beginPath(); c.moveTo(bxx - br, byy - bH); c.lineTo(bxx - br, byy); c.arc(bxx, byy, br, Math.PI, 0, true); c.lineTo(bxx + br, byy - bH); c.closePath(); c.fill();
            const cg = c.createRadialGradient(bxx - 4, byy - bH - 8, 1, bxx, byy - bH - 4, br + 3);
            cg.addColorStop(0, P.crimsonLight); cg.addColorStop(1, P.crimsonDark);
            c.fillStyle = cg;
            c.beginPath(); c.arc(bxx, byy - bH - 3, br + 3, 0, Math.PI * 2); c.fill();
            c.fillStyle = P.gold; c.beginPath(); c.arc(bxx, byy - bH - 3, 2.5, 0, Math.PI * 2); c.fill();
        }
        // USZKODZENIA
        if (t >= 1) { cracks(c, rng, x, y + h - KEEP_H1, w, KEEP_H1, 4); cracks(c, rng, ux, uy + upH - KEEP_H2, upW, KEEP_H2, 3); }
        if (t >= 2) {
            breach(c, rng, x + w * 0.28, y + h - KEEP_H1 * 0.5, 22);
            breach(c, rng, ux + upW * 0.75, uy + upH - KEEP_H2 * 0.5, 16);
            c.fillStyle = 'rgba(20,20,20,0.3)';
            c.beginPath(); c.ellipse(x + w * 0.28, y + h - KEEP_H1 * 0.7, 40, 26, 0, 0, Math.PI * 2); c.fill();
        }
    });
}
/** Kotwica sztandaru glownego donzonu (offset od AABB top-left). */
export function keepPennantAnchor(w: number, h: number): { dx: number; dy: number } {
    const upW = Math.round(w * 0.74), upH = Math.round(h * 0.74);
    const roofRise = 34;
    const topM = KEEP_H1 + KEEP_H2 + roofRise + 40;
    const x = KEEP_M, y = topM;
    const ty1 = y - KEEP_H1;
    const ux = x + (w - upW) / 2, uy = ty1 + (h - upH) / 2;
    const ty2 = uy - KEEP_H2;
    const apexX = ux + upW / 2, apexY = ty2 + upH / 2 - roofRise;
    return { dx: apexX - KEEP_M, dy: (apexY - 35) - topM };
}

// =================================================================
// GATE — brama + 2 wiezyczki (gatehouse). Brama zniszczalna (4 tiery), wiezyczki nie.
// =================================================================

const GATE_MX = 8;
export function bakeGate(gate: { w: number; h: number }, turret: { w: number; h: number }, tier: DamageTier, open = false): BakedPart {
    const key = `gate:${gate.w}x${gate.h}:${tier}:${open ? 'o' : 'c'}`;
    // tekstura obejmuje: turretSW | gate | turretSE — kotwica = AABB bramy
    const totalW = turret.w + gate.w + turret.w + GATE_MX * 2;
    const topM = TURRET_H + 34 + 16;
    const th = Math.max(gate.h, turret.h + 8) + topM + 18;
    const ox = GATE_MX + turret.w, oy = topM;
    return baked(key, totalW, th, ox, oy, (c) => {
        const rng = makeRng(0x47415445 + tier * 5);
        const gx = ox, gy = oy;
        // wiezyczki (kwadratowe, z malymi stozkami) — po obu stronach, niezmienne
        const drawTurret = (tx: number): void => {
            const ty = gy - 8; // turret AABB is 8 px higher than the gate (layout)
            contactShadow(c, tx, ty, turret.w, turret.h, TURRET_H);
            const top = extrudeRect(c, rng, tx, ty, turret.w, turret.h, TURRET_H);
            arrowSlit(c, tx + turret.w / 2, ty + turret.h - TURRET_H + 12, 14);
            merlons(c, tx, top, turret.w, turret.h, 'S');
            merlons(c, tx, top, turret.w, turret.h, 'N');
            // F6 (#1): daszek KWADRATOWY jak donzon (fake 3D spojne z reszta)
            pyramidRoof(c, tx + 6, top + 6, turret.w - 12, turret.h - 12, 18, 4);
        };
        drawTurret(gx - turret.w);
        drawTurret(gx + gate.w);

        if (tier === 3) {
            // zniszczona: rumowisko + strzaskane wrota na ziemi + goly luk (przelot otwarty)
            rubble(c, rng, gx + 10, gy, gate.w - 20, gate.h);
            c.fillStyle = P.oakDark;
            c.save(); c.translate(gx + 30, gy + 6); c.rotate(-0.4); c.fillRect(-14, -4, 28, 8); c.restore();
            c.save(); c.translate(gx + gate.w - 34, gy + 12); c.rotate(0.6); c.fillRect(-16, -4, 32, 8); c.restore();
            return;
        }
        contactShadow(c, gx, gy, gate.w, gate.h, GATE_H);
        // nadproze (mur nad brama) — ekstruzja, ale sciana S ma LUK (otwor)
        const top = extrudeRect(c, rng, gx, gy, gate.w, gate.h, GATE_H);
        merlons(c, gx, top, gate.w, gate.h, 'S', tier >= 2 ? 2 : 0);
        // luk bramny w scianie S: ciemny otwor
        const ax = gx + gate.w / 2, archW = 64, archTop = gy + gate.h - GATE_H + 10;
        c.fillStyle = P.graniteDeep;
        c.beginPath(); c.moveTo(ax - archW / 2, gy + gate.h); c.lineTo(ax - archW / 2, archTop + archW / 2 - 8);
        c.arc(ax, archTop + archW / 2 - 8, archW / 2, Math.PI, 0); c.lineTo(ax + archW / 2, gy + gate.h); c.closePath(); c.fill();
        // brona (zlote koncowki) — zawsze podniesiona do polowy: rzad pretow u gory luku
        c.strokeStyle = P.iron; c.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) { const px = ax - archW / 2 + 8 + i * 9.6; c.beginPath(); c.moveTo(px, archTop + 2); c.lineTo(px, archTop + 12); c.stroke(); c.fillStyle = P.gold; c.beginPath(); c.moveTo(px - 2.5, archTop + 12); c.lineTo(px + 2.5, archTop + 12); c.lineTo(px, archTop + 16); c.closePath(); c.fill(); }
        c.beginPath(); c.moveTo(ax - archW / 2 + 4, archTop + 7); c.lineTo(ax + archW / 2 - 4, archTop + 7); c.stroke();
        // wrota debowe (2 skrzydla) z okuciami; tier 1 pekniete, tier 2 jedno wisi
        const doorTop = archTop + 14, doorBot = gy + gate.h, leafW = archW / 2 - 3;
        const drawLeaf = (lx: number, hanging: boolean): void => {
            c.save();
            if (hanging) { c.translate(lx + leafW, doorBot); c.rotate(0.22); c.translate(-(lx + leafW), -doorBot); }
            const dg = c.createLinearGradient(lx, doorTop, lx, doorBot);
            dg.addColorStop(0, P.oak); dg.addColorStop(1, P.oakDark);
            c.fillStyle = dg; c.fillRect(lx, doorTop, leafW, doorBot - doorTop);
            c.strokeStyle = P.oakDark; c.lineWidth = 1;
            for (let py = doorTop; py < doorBot; py += 6) { c.beginPath(); c.moveTo(lx, py); c.lineTo(lx + leafW, py); c.stroke(); }
            c.strokeStyle = P.iron; c.lineWidth = 2.5;
            for (const by of [doorTop + 5, doorBot - 6]) { c.beginPath(); c.moveTo(lx + 1, by); c.lineTo(lx + leafW - 1, by); c.stroke(); }
            c.fillStyle = P.gold;
            for (const by of [doorTop + 5, doorBot - 6]) for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(lx + 4 + k * ((leafW - 8) / 3), by, 1.5, 0, Math.PI * 2); c.fill(); }
            if (tier >= 1) cracks(c, rng, lx, doorTop, leafW, doorBot - doorTop, 2, 1.3);
            c.restore();
        };
        if (open) {
            // F6 (#3): wrota ROZSUNIETE — skrzydla schowane za oscieza (widac je tylko jako krawedzie),
            // przelot otwarty: gracz wyjezdza, wrogowie w poblizu = brama sie zamyka (CastleSystem).
            c.save(); c.globalAlpha = 0.9;
            drawLeaf(ax - archW / 2 + 3 - leafW * 0.82, false);
            drawLeaf(ax + 3 + leafW * 0.82, false);
            c.restore();
        } else {
            drawLeaf(ax - archW / 2 + 3, false);
            drawLeaf(ax + 3, tier >= 2);
        }
        if (tier >= 1) cracks(c, rng, gx, gy + gate.h - GATE_H, gate.w, GATE_H - 10, tier === 1 ? 2 : 4);
        if (tier >= 2) { breach(c, rng, gx + 22, gy + gate.h - GATE_H * 0.5, 12); breach(c, rng, gx + gate.w - 22, gy + gate.h - GATE_H * 0.55, 12); }
        // heraldyka nad lukiem: zloty krag + szkarlatny sztandar mini
        c.fillStyle = P.crimson; c.fillRect(ax - 9, top + 2, 18, 12);
        c.strokeStyle = P.gold; c.lineWidth = 1; c.strokeRect(ax - 9, top + 2, 18, 12);
    });
}

// =================================================================
// PENNANTS — 2 tekstury (szkarlat/zloto), animacja skew w CastlePennants
// =================================================================

export function bakePennant(color: 'crimson' | 'gold'): PIXI.Texture {
    const key = `pennant:${color}`;
    const hit = cache.get(key);
    if (hit) return hit.tex;
    const w = 30, h = 16;
    const part = baked(key, w, h, 0, 0, (c) => {
        const main = color === 'crimson' ? P.crimson : P.gold;
        const dark = color === 'crimson' ? P.crimsonDark : P.goldDark;
        const g = c.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, main); g.addColorStop(1, dark);
        c.fillStyle = g;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h / 2); c.lineTo(0, h); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = color === 'crimson' ? P.gold : P.crimson;
        c.beginPath(); c.arc(8, h / 2, 2.5, 0, Math.PI * 2); c.fill();
    });
    return part.tex;
}

/** Wymusza upieczenie kompletu tekstur (start meczu = jedna kosztowna chwila, nie hitch w walce). */
export function prebakeCastle(wallW: number, wallH: number, towerAabb: number, keepW: number, keepH: number,
    gate: { w: number; h: number }, turret: { w: number; h: number }): void {
    const t0 = performance.now();
    for (const tier of [0, 1, 2, 3] as DamageTier[]) {
        bakeWall(wallW, wallH, 'N', tier); bakeWall(wallW, wallH, 'S', tier);
        bakeWall(wallH, wallW, 'W', tier); bakeWall(wallH, wallW, 'E', tier);
        bakeGate(gate, turret, tier); bakeGate(gate, turret, tier, true);
        bakeGateV({ w: gate.h, h: gate.w }, turret, tier); bakeGateV({ w: gate.h, h: gate.w }, turret, tier, true);
        bakeKeep(keepW, keepH, tier);
    }
    bakeTowerSquare(towerAabb);
    bakeDoorLeaf(); bakeHay(0); bakeHay(1); bakeCrow(0); bakeCrow(1);
    bakePennant('crimson'); bakePennant('gold');
    console.log(`[castleBake] prebake ${(performance.now() - t0).toFixed(1)} ms, ${cache.size} textures`);
}

// =================================================================
// SIEGE MACHINES (F4) — plaskie sprite'y top-down, obracane rotacja sprite'a
// (nie 2.5D bake pod katami: maszyny sa niskie i drewniane, plaski rzut czyta sie
// dobrze, a 36 katow x 3 archetypy to koszt bake'u, ktorego mobile nie potrzebuje).
// Kierunek "przod" = +X (jak hull.rotation w Enemy). Srodek tekstury = pozycja wroga.
// =================================================================

export type SiegeKind = 'taran' | 'katapulta' | 'trebuchet';

// v0.194.0 (B1, Mariusz: "maszyny sa plaskie") — prymitywy drewna/zelaza w FAKE-3D.
// Swiatlo T1 (slonce NW): kazdy element ma ciemny BOK przesuniety na SE (grubosc bryly),
// wieko z gradientem jasne N/W -> ciemne S/E, gruby kontur (czytelnosc przy zoom 0.6)
// i metal z blikiem. Rozmiary tekstur i geometria elementow BEZ ZMIAN (hitbox = wizual).
const SIEGE_OUTLINE = 'rgba(28,16,6,0.9)';
const SIEGE_DEPTH = 3; // grubosc bryly (px) — bok widoczny od strony cienia SE

/**
 * v0.194.1 (Mariusz: "kola wygladaja jak krecace sie mlynki") — kolo wozu w widoku Z GORY.
 * Maszyna jedzie w +x (leb taranu z przodu), osie ida wzdluz y, wiec kolo toczace sie
 * wzdluz jazdy widac KRAWEDZIA: waski bieznik dlugosci 2r wzdluz x. Na zewnatrz osi
 * (`side` = -1 gora / +1 dol) wystaje czop piasty, a od strony zewnetrznej widac waski
 * pas bocznej tarczy (2.5D). Zadnych szprych na tarczy — to one robily "mlynek".
 */
function wheel(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: -1 | 1): void {
    const t = 7;                    // szerokosc biezika (grubosc kola)
    const x0 = x - r, len = r * 2;
    const y0 = y - t / 2;
    // cien pod kolem (SE)
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x0 + 2, y0 + 3, len, t);
    // boczna tarcza (drewno) — waski pas widoczny od strony zewnetrznej
    const face = side > 0 ? y0 + t - 1 : y0 - 3;
    c.fillStyle = P.oakDark;
    c.fillRect(x0 + 2, face, len - 4, 4);
    // bieznik: zelazna obrecz z gradientem w poprzek (walec)
    const g = c.createLinearGradient(0, y0, 0, y0 + t);
    g.addColorStop(0, '#9aa0aa'); g.addColorStop(0.5, P.iron); g.addColorStop(1, '#23252a');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0 + 2, y0); c.lineTo(x0 + len - 2, y0);
    c.quadraticCurveTo(x0 + len + 1, y0 + t / 2, x0 + len - 2, y0 + t);
    c.lineTo(x0 + 2, y0 + t);
    c.quadraticCurveTo(x0 - 1, y0 + t / 2, x0 + 2, y0);
    c.closePath(); c.fill();
    c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 2; c.stroke();
    // rowki bieznika — poprzeczne, czytaja sie jak "toczy sie wzdluz jazdy"
    c.strokeStyle = 'rgba(20,20,24,0.65)'; c.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) { const xx = x0 + (len * i) / 5; c.beginPath(); c.moveTo(xx, y0 + 1); c.lineTo(xx, y0 + t - 1); c.stroke(); }
    // blik wzdluz gornej krawedzi walca
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0 + 3, y0 + 1.5); c.lineTo(x0 + len - 3, y0 + 1.5); c.stroke();
    // czop piasty wystajacy NA ZEWNATRZ osi
    const hy = side > 0 ? y0 + t + 1 : y0 - 5;
    c.fillStyle = P.iron; c.fillRect(x - 3, hy, 6, 4);
    c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.2; c.strokeRect(x - 3, hy, 6, 4);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(x - 2, hy + 0.5, 1.5, 1.2);
}
function beam(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark = false): void {
    const d = SIEGE_DEPTH;
    // BOK bryly (SE) — ciemny pas pod i na prawo od wieka
    c.fillStyle = dark ? '#2a1a0a' : '#3a2610';
    c.fillRect(x + d, y + d, w, h);
    // WIEKO: gradient w poprzek krotszej osi (jasne N/W -> ciemne S/E)
    const horiz = w >= h;
    const g = horiz ? c.createLinearGradient(0, y, 0, y + h) : c.createLinearGradient(x, 0, x + w, 0);
    const base = dark ? P.oakDark : P.oak;
    g.addColorStop(0, dark ? '#6a4520' : '#9a6a36');
    g.addColorStop(0.45, base);
    g.addColorStop(1, dark ? '#321f0c' : '#4e3217');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    // slojowanie drewna wzdluz dluzszej osi
    c.strokeStyle = 'rgba(30,16,4,0.28)'; c.lineWidth = 1;
    const n = Math.max(1, Math.floor((horiz ? h : w) / 4));
    for (let i = 1; i <= n; i++) {
        c.beginPath();
        if (horiz) { const yy = y + (i * h) / (n + 1); c.moveTo(x + 2, yy); c.lineTo(x + w - 2, yy + 0.6); }
        else { const xx = x + (i * w) / (n + 1); c.moveTo(xx, y + 2); c.lineTo(xx + 0.6, y + h - 2); }
        c.stroke();
    }
    // blik krawedzi N/W
    c.fillStyle = 'rgba(255,235,200,0.30)';
    c.fillRect(x, y, w, 1.5); c.fillRect(x, y, 1.5, h);
    // gruby kontur calej bryly (wieko + bok)
    c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.6;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function ironBand(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    c.fillStyle = '#16171a'; c.fillRect(x + 1.5, y + 1.5, w, h); // bok (cien)
    const horiz = w >= h;
    const g = horiz ? c.createLinearGradient(0, y, 0, y + h) : c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#9aa0aa'); g.addColorStop(0.4, '#5a5f69'); g.addColorStop(1, '#2a2c31');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.4; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // nity: zlote lby + bialy blik
    const rivet = (rx: number, ry: number): void => {
        c.fillStyle = P.goldDark; c.beginPath(); c.arc(rx + 0.6, ry + 0.6, 1.8, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.gold; c.beginPath(); c.arc(rx, ry, 1.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(rx - 0.9, ry - 0.9, 0.9, 0.9);
    };
    if (horiz) { rivet(x + 3, y + h / 2); rivet(x + w - 3, y + h / 2); }
    else { rivet(x + w / 2, y + 3); rivet(x + w / 2, y + h - 3); }
}
/** Glaz w fake-3D: cien SE + radialny gradient + kontur + blik. */
function siegeRock(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x + 1.5, y + 2, r, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r);
    g.addColorStop(0, P.graniteTop); g.addColorStop(0.7, P.granite); g.addColorStop(1, P.graniteDeep);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.4; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, Math.max(1, r * 0.25), 0, Math.PI * 2); c.fill();
}
/** Znak najezdzcy (czerwona tarcza) — fake-3D + kontur, zeby czytal sie z daleka jako WROG. */
function enemyMark(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    c.fillStyle = '#6e1a12'; c.fillRect(x + 1.5, y + 1.5, w, h);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#e85b4a'); g.addColorStop(1, '#8e2419');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.4; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function bakeSiegeMachine(kind: SiegeKind): PIXI.Texture {
    const key = `siege:${kind}`;
    const hit = cache.get(key);
    if (hit) return hit.tex;
    const size = kind === 'trebuchet' ? 132 : kind === 'katapulta' ? 104 : 104;
    // v0.194.0: leb taranu (cx+60) i kosz katapulty (cx-55) wystawaly poza 104 px i byly
    // obciete (trebusz: glaz procy cx-69 przy 132). Plotno poszerzone TYLKO w poziomie i SYMETRYCZNIE: `useCustomSprite` kotwiczy
    // anchor 0.5 (srodek w tym samym punkcie swiata), a pasek HP liczy sie z WYSOKOSCI
    // tekstury — wysokosc zostaje, wiec pasek tez. Hitbox to AABB z logiki, nie tekstura.
    const texW = kind === 'taran' ? 128 : kind === 'katapulta' ? 120 : 144; // trebusz: glaz procy cx-69
    const part = baked(key, texW, size, 0, 0, (c) => {
        const cx = texW / 2, cy = size / 2;
        // v0.194.0 — CIEN: jedna miekka elipsa z gradientem radialnym, ciasno pod obrysem ramy+kol
        // (kilka px zapasu), przesunieta lekko SE, krycie max 0.28 -> 0 na krawedzi.
        // Poprzednio: duza elipsa 0.30 + dwie warstwy roundRect, ktorych kolor `rgba(10,20,12,)`
        // byl NIEPOPRAWNY (brak alfy) — canvas go odrzucal i obie warstwy rysowaly sie
        // poprzednim kolorem 0.30, co dawalo trzy nalozone cienie = czarna plama (trebusz najgorzej).
        // Pol-wymiary [hw, hh] i przesuniecie srodka dx wg obrysu ramy i kol kazdej maszyny.
        const [shDx, shHw, shHh] = kind === 'taran' ? [-7, 37, 26]
            : kind === 'katapulta' ? [0, 38, 28]
            : [0, 52, 36];
        c.save();
        c.translate(cx + shDx + 3, cy + 4);
        c.scale(1, shHh / shHw);
        const shG = c.createRadialGradient(0, 0, shHw * 0.35, 0, 0, shHw);
        shG.addColorStop(0, 'rgba(10,20,12,0.28)');
        shG.addColorStop(0.7, 'rgba(10,20,12,0.16)');
        shG.addColorStop(1, 'rgba(10,20,12,0)');
        c.fillStyle = shG;
        c.beginPath(); c.arc(0, 0, shHw, 0, Math.PI * 2); c.fill();
        c.restore();
        if (kind === 'taran') {
            // rama wozu (kryty dach z desek) + 4 kola + belka z zelaznym lbem wystajaca do przodu
            wheel(c, cx - 26, cy - 22, 9, -1); wheel(c, cx + 14, cy - 22, 9, -1);
            wheel(c, cx - 26, cy + 22, 9, 1); wheel(c, cx + 14, cy + 22, 9, 1);
            beam(c, cx - 40, cy - 17, 66, 34, true);
            // deski dachu (poprzeczne)
            for (let i = 0; i < 6; i++) beam(c, cx - 38 + i * 11, cy - 15, 9, 30);
            ironBand(c, cx - 36, cy - 17, 6, 34); ironBand(c, cx + 18, cy - 17, 6, 34);
            // belka taranu
            beam(c, cx - 30, cy - 5, 78, 10, true);
            c.fillStyle = P.oak; c.fillRect(cx - 28, cy - 3, 72, 6);
            // zelazny leb
            // v0.194.0: leb w fake-3D — bok SE, stalowy gradient, kontur, zloty grot z blikiem
            const ramHead = (ox: number, oy: number): void => {
                c.beginPath(); c.moveTo(cx + 46 + ox, cy - 9 + oy); c.lineTo(cx + 60 + ox, cy - 4 + oy); c.lineTo(cx + 60 + ox, cy + 4 + oy); c.lineTo(cx + 46 + ox, cy + 9 + oy); c.closePath();
            };
            c.fillStyle = '#16171a'; ramHead(1.5, 2); c.fill();
            const rg = c.createLinearGradient(0, cy - 9, 0, cy + 9);
            rg.addColorStop(0, '#a3a9b3'); rg.addColorStop(0.45, '#5a5f69'); rg.addColorStop(1, '#25272c');
            c.fillStyle = rg; ramHead(0, 0); c.fill();
            c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.8; c.stroke();
            c.fillStyle = P.gold; c.fillRect(cx + 50, cy - 2, 6, 4);
            c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(cx + 50, cy - 2, 3, 1);
            // znak wroga na dachu
            enemyMark(c, cx - 14, cy - 12, 14, 8);
        } else if (kind === 'katapulta') {
            wheel(c, cx - 20, cy - 24, 9, -1); wheel(c, cx + 20, cy - 24, 9, -1);
            wheel(c, cx - 20, cy + 24, 9, 1); wheel(c, cx + 20, cy + 24, 9, 1);
            beam(c, cx - 34, cy - 20, 68, 8); beam(c, cx - 34, cy + 12, 68, 8);
            beam(c, cx - 34, cy - 20, 8, 40, true); beam(c, cx + 26, cy - 20, 8, 40, true);
            // os ramienia + ramie skierowane do TYLU (-X), kosz z glazem na koncu
            ironBand(c, cx - 6, cy - 22, 12, 44);
            beam(c, cx - 44, cy - 4, 50, 8);
            // kosz (fake-3D: bok SE + kontur) i glaz w nim
            c.fillStyle = '#2a1a0a'; c.beginPath(); c.arc(cx - 44.5, cy + 2, 9, 0, Math.PI * 2); c.fill();
            c.fillStyle = P.oakDark; c.beginPath(); c.arc(cx - 46, cy, 9, 0, Math.PI * 2); c.fill();
            c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.8; c.stroke();
            siegeRock(c, cx - 46, cy, 6);
            // sznury napiete
            c.strokeStyle = '#c9b88a'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(cx - 30, cy - 18); c.lineTo(cx + 8, cy - 2); c.moveTo(cx - 30, cy + 18); c.lineTo(cx + 8, cy + 2); c.stroke();
            enemyMark(c, cx + 12, cy - 4, 10, 8);
        } else {
            // TREBUCHET: duza platforma, 2 A-ramy, dlugie ramie z przeciwwaga (skrzynia) i proca
            wheel(c, cx - 34, cy - 32, 10, -1); wheel(c, cx + 34, cy - 32, 10, -1);
            wheel(c, cx - 34, cy + 32, 10, 1); wheel(c, cx + 34, cy + 32, 10, 1);
            beam(c, cx - 48, cy - 28, 96, 10); beam(c, cx - 48, cy + 18, 96, 10);
            beam(c, cx - 48, cy - 28, 10, 56, true); beam(c, cx + 38, cy - 28, 10, 56, true);
            // A-ramy (jako pary belek zbiegajacych sie do osi)
            beam(c, cx - 14, cy - 30, 8, 60, true); beam(c, cx + 6, cy - 30, 8, 60, true);
            ironBand(c, cx - 16, cy - 6, 32, 12);
            // ramie: krotki koniec do przodu z przeciwwaga, dlugi do tylu z proca
            beam(c, cx - 58, cy - 5, 80, 10);
            // przeciwwaga (skrzynia z kamieniami) z przodu
            // skrzynia przeciwwagi = wyzsza bryla (bok 5 px) — najciezszy element, ma byc "masywny"
            c.fillStyle = '#24160a'; c.fillRect(cx + 25, cy - 11, 26, 32);
            beam(c, cx + 20, cy - 16, 26, 32, true);
            c.fillStyle = P.oak; c.fillRect(cx + 23, cy - 13, 20, 26);
            c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1; c.strokeRect(cx + 23.5, cy - 12.5, 19, 25);
            ironBand(c, cx + 20, cy - 4, 26, 8);
            for (let i = 0; i < 4; i++) siegeRock(c, cx + 27 + (i % 2) * 10, cy - 7 + Math.floor(i / 2) * 12, 4);
            // proca z glazem z tylu
            c.strokeStyle = '#c9b88a'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(cx - 58, cy); c.lineTo(cx - 62, cy + 14); c.stroke();
            siegeRock(c, cx - 62, cy + 18, 7);
            // sztandar wroga
            c.strokeStyle = P.trunkDark; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 40, cy - 30); c.lineTo(cx - 40, cy - 52); c.stroke();
            c.fillStyle = P.enemyRed; c.beginPath(); c.moveTo(cx - 40, cy - 52); c.lineTo(cx - 24, cy - 47); c.lineTo(cx - 40, cy - 42); c.closePath(); c.fill();
            c.strokeStyle = SIEGE_OUTLINE; c.lineWidth = 1.4; c.stroke();
        }
    });
    return part.tex;
}

/** Glaz katapulty (sprite lecacy po luku) + krater — male, wspolne. */
export function bakeStone(): PIXI.Texture {
    const key = 'siege:stone';
    const hit = cache.get(key);
    if (hit) return hit.tex;
    const s = 28;
    const part = baked(key, s, s, 0, 0, (c) => {
        const g = c.createRadialGradient(s * 0.38, s * 0.36, 2, s / 2, s / 2, s / 2);
        g.addColorStop(0, P.graniteTop); g.addColorStop(0.7, P.granite); g.addColorStop(1, P.graniteDeep);
        c.fillStyle = g;
        c.beginPath();
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const r = s / 2 - 2 - (i % 2) * 2; const px = s / 2 + Math.cos(a) * r, py = s / 2 + Math.sin(a) * r; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
        c.closePath(); c.fill();
        c.strokeStyle = P.crack; c.lineWidth = 1; c.stroke();
    });
    return part.tex;
}

// =================================================================
// F6 (uwagi Mariusza #1/#2): DACHY PIRAMIDOWE — wieze i wiezyczki jak donzon.
// Kwadratowa bryla + 4 trojkaty dachu (N jasny, S ciemny, E/W srednie) + zloty okap,
// gradient + cien kontaktowy = spojne fake 3D z donzonem.
// =================================================================

/**
 * v0.196.0 — polacie dachu piramidowego w swietle NW (wspolne dla donzonu, wiez i wiezyczek).
 * corners: [NW, NE, SE, SW]; polac i = krawedz corners[i] -> corners[i+1]: 0=N, 1=E, 2=S, 3=W.
 * N i W w sloncu (jasne), E i S w cieniu. Kazda polac: gradient od kalenicy (jasniej) do okapu,
 * plus cieply rim-light na kalenicach NW (linie wierzcholek -> naroznik NW) i na okapie N/W.
 */
function roofFaces(c: CanvasRenderingContext2D, corners: number[][], apexX: number, apexY: number): void {
    // hierarchia jasnosci N > W > E > S (slonce NW) — kazda polac wyraznie inna, czyta sie jako bryla
    // indeksy: 0=N, 1=E, 2=S, 3=W
    const top = ['#ef6a70', '#9a1a23', P.crimsonDark, P.crimsonLight];
    const bottom = [P.crimsonLight, P.crimsonDark, '#5e0c12', P.crimson];
    for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const g = c.createLinearGradient(apexX, apexY, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        g.addColorStop(0, top[i]);
        g.addColorStop(1, bottom[i]);
        c.fillStyle = g;
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(apexX, apexY); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.stroke();
    }
    // rim-light: kalenica do naroznika NW + okap N i W (strona slonca)
    c.save();
    c.strokeStyle = 'rgba(255,225,190,0.55)'; c.lineWidth = 1.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(apexX, apexY); c.lineTo(corners[0][0], corners[0][1]); c.stroke();
    c.strokeStyle = 'rgba(255,225,190,0.35)';
    c.beginPath(); c.moveTo(corners[3][0], corners[3][1]); c.lineTo(corners[0][0], corners[0][1]); c.lineTo(corners[1][0], corners[1][1]); c.stroke();
    c.restore();
}

/** Dach piramidowy nad kwadratem (x,y,w,h) — rise = wysokosc wierzcholka nad srodkiem. */
export function pyramidRoof(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rise: number, overhang = 6): void {
    const apexX = x + w / 2, apexY = y + h / 2 - rise;
    const corners = [[x - overhang, y - overhang], [x + w + overhang, y - overhang], [x + w + overhang, y + h + overhang], [x - overhang, y + h + overhang]];
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(x - overhang + 4, y - overhang + 5, w + overhang * 2, h + overhang * 2);
    roofFaces(c, corners, apexX, apexY);
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
        const f = k / 4;
        c.beginPath();
        for (let i = 0; i < 4; i++) { const p = corners[i]; const px = p[0] + (apexX - p[0]) * f, py = p[1] + (apexY - p[1]) * f; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
        c.closePath(); c.stroke();
    }
    c.strokeStyle = P.gold; c.lineWidth = 2;
    c.beginPath(); c.moveTo(corners[0][0], corners[0][1]); for (let i = 1; i < 4; i++) c.lineTo(corners[i][0], corners[i][1]); c.closePath(); c.stroke();
    c.fillStyle = P.gold; c.beginPath(); c.arc(apexX, apexY, Math.max(3, w * 0.06), 0, Math.PI * 2); c.fill();
}

const TOWER_SQ_M = 20;
const TOWER_SQ_RISE = 30;
/** Wieza narozna KWADRATOWA: ekstrudowana bryla AABB x AABB (H = TOWER_H) + dach piramidowy + maszt. */
export function bakeTowerSquare(aabb: number): BakedPart {
    const key = `towerSq:${aabb}`;
    const w = aabb, h = aabb;
    const topM = TOWER_H + TOWER_SQ_RISE + 40 + TOWER_SQ_M;
    const tw = w + TOWER_SQ_M * 2, th = h + topM + TOWER_SQ_M;
    return baked(key, tw, th, TOWER_SQ_M, topM, (c) => {
        const rng = makeRng(0x54574552);
        const x = TOWER_SQ_M, y = topM;
        contactShadow(c, x, y, w, h, TOWER_H);
        const ty = extrudeRect(c, rng, x, y, w, h, TOWER_H);
        arrowSlit(c, x + w * 0.3, y + h - TOWER_H + 16, 14);
        arrowSlit(c, x + w * 0.7, y + h - TOWER_H + 16, 14);
        arrowSlit(c, x + w * 0.5, y + h - TOWER_H + 38, 12);
        c.fillStyle = P.moss; c.globalAlpha = 0.5;
        c.beginPath(); c.ellipse(x + 12, y + h - 3, 9, 3, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        merlons(c, x, ty, w, h, 'N'); merlons(c, x, ty, w, h, 'S'); merlons(c, x, ty, w, h, 'W'); merlons(c, x, ty, w, h, 'E');
        pyramidRoof(c, x + 12, ty + 12, w - 24, h - 24, TOWER_SQ_RISE, 5);
        const apexX = x + w / 2, apexY = ty + h / 2 - TOWER_SQ_RISE;
        c.strokeStyle = P.goldDark; c.lineWidth = 2;
        c.beginPath(); c.moveTo(apexX, apexY - 3); c.lineTo(apexX, apexY - 30); c.stroke();
        c.fillStyle = P.gold; c.beginPath(); c.arc(apexX, apexY - 31, 2.5, 0, Math.PI * 2); c.fill();
    });
}
export function towerSquarePennantAnchor(aabb: number): { dx: number; dy: number } {
    const topM = TOWER_H + TOWER_SQ_RISE + 40 + TOWER_SQ_M;
    const x = TOWER_SQ_M, y = topM;
    const ty = y - TOWER_H;
    const apexY = ty + aabb / 2 - TOWER_SQ_RISE;
    return { dx: (x + aabb / 2) - TOWER_SQ_M, dy: (apexY - 31) - topM };
}

/** Skrzydlo wrot (debris po wylamaniu bramy). */
export function bakeDoorLeaf(): PIXI.Texture {
    const key = 'doorleaf';
    const hit = cache.get(key);
    if (hit) return hit.tex;
    const w = 30, h = 26;
    const part = baked(key, w, h, 0, 0, (c) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, P.oak); g.addColorStop(1, P.oakDark);
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.strokeStyle = P.oakDark; c.lineWidth = 1;
        for (let y = 0; y < h; y += 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        c.strokeStyle = P.iron; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(1, 5); c.lineTo(w - 1, 5); c.moveTo(1, h - 6); c.lineTo(w - 1, h - 6); c.stroke();
        c.fillStyle = P.gold;
        for (const bx of [4, 12, 20, 27]) { c.beginPath(); c.arc(bx, 5, 1.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(bx, h - 6, 1.5, 0, Math.PI * 2); c.fill(); }
    });
    return part.tex;
}

/** Chatka wioski (F6 #9): podmurowka + sciany muru pruskiego (ekstruzja) + strzecha (kalenica). */
export function bakeCottage(w: number, h: number, seed: number): BakedPart {
    const key = `cottage:${w}x${h}:${seed}`;
    const H = 40, RISE = 26, M = 18;
    const topM = H + RISE + 20 + M;
    return baked(key, w + M * 2, h + topM + M, M, topM, (c) => {
        const rng = makeRng(seed);
        const x = M, y = topM;
        contactShadow(c, x, y, w, h, H);
        const sy = y + h - H;
        const g = c.createLinearGradient(0, sy, 0, y + h);
        g.addColorStop(0, '#e6d9b8'); g.addColorStop(1, '#bfae8a');
        c.fillStyle = g; c.fillRect(x, sy, w, H);
        c.strokeStyle = P.oakDark; c.lineWidth = 3;
        c.strokeRect(x + 1.5, sy + 1.5, w - 3, H - 3);
        for (let bx = x + w / 3; bx < x + w - 4; bx += w / 3) { c.beginPath(); c.moveTo(bx, sy); c.lineTo(bx, y + h); c.stroke(); }
        c.beginPath(); c.moveTo(x, sy + H / 2); c.lineTo(x + w / 3, y + h); c.moveTo(x + w, sy + H / 2); c.lineTo(x + w * 2 / 3, y + h); c.stroke();
        c.fillStyle = P.graniteDark; c.fillRect(x, y + h - 8, w, 8);
        c.fillStyle = P.oakDark; c.fillRect(x + w / 2 - 8, y + h - 24, 16, 24);
        c.fillStyle = P.gold; c.beginPath(); c.arc(x + w / 2 + 4, y + h - 12, 1.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7fb3c9'; c.fillRect(x + 12, sy + 12, 14, 12); c.fillRect(x + w - 26, sy + 12, 14, 12);
        c.strokeStyle = P.oakDark; c.lineWidth = 2; c.strokeRect(x + 12, sy + 12, 14, 12); c.strokeRect(x + w - 26, sy + 12, 14, 12);
        c.beginPath(); c.moveTo(x + 19, sy + 12); c.lineTo(x + 19, sy + 24); c.moveTo(x + w - 19, sy + 12); c.lineTo(x + w - 19, sy + 24); c.stroke();
        const ty = y - H;
        const ridgeInset = w * 0.22;
        const apexL = { x: x + ridgeInset, y: ty + h / 2 - RISE }, apexR = { x: x + w - ridgeInset, y: ty + h / 2 - RISE };
        const o = 8;
        const corners = [[x - o, ty - o], [x + w + o, ty - o], [x + w + o, ty + h + o], [x - o, ty + h + o]];
        const faces: Array<[number[], number[], { x: number; y: number }, { x: number; y: number }, string]> = [
            [corners[0], corners[1], apexR, apexL, '#c9a45a'],
            [corners[1], corners[2], apexR, apexR, '#a8843e'],
            [corners[2], corners[3], apexL, apexR, '#8a6a2e'],
            [corners[3], corners[0], apexL, apexL, '#a8843e'],
        ];
        for (const [a, b, p1, p2, col] of faces) {
            c.fillStyle = col;
            c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.stroke();
        }
        c.strokeStyle = 'rgba(60,40,10,0.35)'; c.lineWidth = 1;
        for (let i = 0; i < 18; i++) { const fx = x - o + rng() * (w + o * 2), fy = ty - o + rng() * (h + o * 2); c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 2, fy + 5); c.stroke(); }
        c.strokeStyle = P.oakDark; c.lineWidth = 3; c.beginPath(); c.moveTo(apexL.x, apexL.y); c.lineTo(apexR.x, apexR.y); c.stroke();
        c.fillStyle = P.graniteDark; c.fillRect(apexR.x - 14, apexR.y - 4, 8, 14);
        c.fillStyle = P.graniteTop; c.fillRect(apexR.x - 15, apexR.y - 6, 10, 3);
    });
}

/** Snop siana (F6 #9): niszczalny, 2 stany (caly / naruszony). */
export function bakeHay(tier: 0 | 1): PIXI.Texture {
    const key = `hay:${tier}`;
    const hit = cache.get(key);
    if (hit) return hit.tex;
    const s = 64;
    const part = baked(key, s, s, 0, 0, (c) => {
        const cx = s / 2, cy = s / 2 + 4;
        c.fillStyle = 'rgba(10,20,12,0.28)';
        c.beginPath(); c.ellipse(cx + 4, cy + 14, 22, 9, 0, 0, Math.PI * 2); c.fill();
        const g = c.createRadialGradient(cx - 8, cy - 14, 4, cx, cy, 26);
        g.addColorStop(0, '#f0d47a'); g.addColorStop(0.6, P.wheat); g.addColorStop(1, P.wheatDark);
        c.fillStyle = g;
        c.beginPath(); c.moveTo(cx - 22, cy + 10); c.quadraticCurveTo(cx - 24, cy - 22, cx, cy - 24); c.quadraticCurveTo(cx + 24, cy - 22, cx + 22, cy + 10); c.closePath(); c.fill();
        c.fillStyle = P.wheatDark; c.beginPath(); c.ellipse(cx, cy + 10, 22, 7, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(120,90,20,0.5)'; c.lineWidth = 1;
        for (let i = 0; i < 14; i++) { const a = -Math.PI + (i / 14) * Math.PI; c.beginPath(); c.moveTo(cx, cy + 6); c.lineTo(cx + Math.cos(a) * 20, cy + 6 + Math.sin(a) * 26); c.stroke(); }
        c.strokeStyle = P.oakDark; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 20, cy - 4); c.quadraticCurveTo(cx, cy + 2, cx + 20, cy - 4); c.stroke();
        if (tier === 1) {
            c.fillStyle = '#3d4247'; c.globalAlpha = 0.5;
            c.beginPath(); c.ellipse(cx + 6, cy - 6, 9, 6, 0.4, 0, Math.PI * 2); c.fill();
            c.globalAlpha = 1;
            c.strokeStyle = P.wheatDark; c.lineWidth = 2;
            for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(cx + 18 + i * 2, cy + 8 + i * 2); c.lineTo(cx + 26 + i * 3, cy + 2 + i); c.stroke(); }
        }
    });
    return part.tex;
}

/** Kruk (F6): ciemny ptak, 2 klatki lopotu. */
export function bakeCrow(frame: 0 | 1): PIXI.Texture {
    const key = `crow:${frame}`;
    const hit = cache.get(key);
    if (hit) return hit.tex;
    const s = 28;
    const part = baked(key, s, s, 0, 0, (c) => {
        const cx = s / 2, cy = s / 2;
        const up = frame === 0 ? -7 : 5;
        c.fillStyle = '#15161a';
        c.beginPath(); c.moveTo(cx - 13, cy + up); c.quadraticCurveTo(cx - 5, cy - 2, cx, cy); c.quadraticCurveTo(cx + 5, cy - 2, cx + 13, cy + up); c.quadraticCurveTo(cx + 6, cy + 2, cx, cy + 4); c.quadraticCurveTo(cx - 6, cy + 2, cx - 13, cy + up); c.fill();
        c.beginPath(); c.ellipse(cx, cy + 1, 4, 2.5, 0, 0, Math.PI * 2); c.fill();
    });
    return part.tex;
}

// =================================================================
// GATE VERTICAL (bramy W/E) — 4 BRAMY (decyzja Mariusza). Mur pionowy nie ma widocznej
// sciany bocznej, wiec wrota rysujemy Z GORY: dwa skrzydla debowe w szczelinie miedzy
// wiezyczkami (u gory/dolu). Otwarte = skrzydla zlozone wzdluz muru (przelot czysty).
// Kotwica = AABB bramy (28 x 150); tekstura obejmuje turret1 | gate | turret2.
// =================================================================

export function bakeGateV(gate: { w: number; h: number }, turret: { w: number; h: number }, tier: DamageTier, open = false): BakedPart {
    const key = `gateV:${gate.w}x${gate.h}:${tier}:${open ? 'o' : 'c'}`;
    const MX = 16;
    const totalH = turret.h + gate.h + turret.h + 8;
    const topM = TURRET_H + 34 + 16;
    const tw = Math.max(gate.w, turret.w) + MX * 2 + 8;
    const th = totalH + topM + 18;
    const ox = MX + 8, oy = topM + turret.h;
    return baked(key, tw, th, ox, oy, (c) => {
        const rng = makeRng(0x47415456 + tier * 5);
        const gx = ox, gy = oy;
        const drawTurret = (ty: number): void => {
            const tx = gx - 8; // turret AABB is 8 px further out (layout)
            contactShadow(c, tx, ty, turret.w, turret.h, TURRET_H);
            const top = extrudeRect(c, rng, tx, ty, turret.w, turret.h, TURRET_H);
            arrowSlit(c, tx + turret.w / 2, ty + turret.h - TURRET_H + 12, 14);
            merlons(c, tx, top, turret.w, turret.h, 'W');
            merlons(c, tx, top, turret.w, turret.h, 'E');
            pyramidRoof(c, tx + 6, top + 6, turret.w - 12, turret.h - 12, 18, 4);
        };
        drawTurret(gy - turret.h);
        drawTurret(gy + gate.h);
        if (tier === 3) {
            rubble(c, rng, gx, gy + 10, gate.w, gate.h - 20);
            c.fillStyle = P.oakDark;
            c.save(); c.translate(gx + 6, gy + 30); c.rotate(0.5); c.fillRect(-4, -14, 8, 28); c.restore();
            c.save(); c.translate(gx + gate.w - 6, gy + gate.h - 34); c.rotate(-0.4); c.fillRect(-4, -16, 8, 32); c.restore();
            return;
        }
        // prog kamienny w szczelinie (widoczny, gdy wrota otwarte)
        c.fillStyle = P.cobble; c.fillRect(gx, gy, gate.w, gate.h);
        c.strokeStyle = P.cobbleJoint; c.lineWidth = 1;
        for (let y = gy + 10; y < gy + gate.h; y += 12) { c.beginPath(); c.moveTo(gx, y); c.lineTo(gx + gate.w, y); c.stroke(); }
        // dwa skrzydla debowe widziane z gory: zamkniete = poprzek szczeliny (kazde polowa wysokosci),
        // otwarte = przylozone do wiezyczek (krotkie paski przy koncach)
        const leafLen = open ? 18 : gate.h / 2 - 3;
        const leafW = gate.w - 4;
        const drawLeaf = (ly: number, hanging: boolean): void => {
            c.save();
            if (hanging) { c.translate(gx + 2, ly); c.rotate(-0.25); c.translate(-(gx + 2), -ly); }
            const dg = c.createLinearGradient(gx, 0, gx + leafW, 0);
            dg.addColorStop(0, P.oak); dg.addColorStop(1, P.oakDark);
            c.fillStyle = dg; c.fillRect(gx + 2, ly, leafW, leafLen);
            c.strokeStyle = P.oakDark; c.lineWidth = 1;
            for (let x = gx + 2; x < gx + 2 + leafW; x += 5) { c.beginPath(); c.moveTo(x, ly); c.lineTo(x, ly + leafLen); c.stroke(); }
            c.strokeStyle = P.iron; c.lineWidth = 2.5;
            c.beginPath(); c.moveTo(gx + 3, ly + 4); c.lineTo(gx + 1 + leafW, ly + 4); c.moveTo(gx + 3, ly + leafLen - 4); c.lineTo(gx + 1 + leafW, ly + leafLen - 4); c.stroke();
            c.fillStyle = P.gold; c.beginPath(); c.arc(gx + 2 + leafW / 2, ly + 4, 1.5, 0, Math.PI * 2); c.fill();
            if (tier >= 1) cracks(c, rng, gx + 2, ly, leafW, leafLen, 1, 1.2);
            c.restore();
        };
        drawLeaf(gy + 3, false);
        drawLeaf(open ? gy + gate.h - 3 - leafLen : gy + gate.h / 2, tier >= 2 && !open);
        // brona nad szczelina: krotkie prety u konca kazdej wiezyczki
        c.strokeStyle = P.iron; c.lineWidth = 2.5;
        for (const yy of [gy - 2, gy + gate.h + 2]) { c.beginPath(); c.moveTo(gx, yy); c.lineTo(gx + gate.w, yy); c.stroke(); }
        if (tier >= 2) { breach(c, rng, gx + gate.w / 2, gy + 30, 8); breach(c, rng, gx + gate.w / 2, gy + gate.h - 30, 8); }
        // heraldyka: mini sztandar na kazdej wiezyczce
        c.fillStyle = P.crimson; c.fillRect(gx + gate.w / 2 - 6, gy - turret.h + 6 - TURRET_H, 12, 8);
    });
}
