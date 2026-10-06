import * as PIXI from 'pixi.js';

/**
 * TROPICS ART v2 / T6 — FAKE-3D zwierzeta ZDARZEN (Szarza Byka, Szalone Kurczaki).
 * Mariusz: "byk i kurczaki maja byc bardziej fake 3d" — styl jak bakery czolgow:
 * kazda czesc ciala to BRYLA (stos warstw ciemny spod -> bok), gorna sciana z gradientem
 * swiatla z NW, faza krawedzi (jasna od swiatla / ciemna po przeciwnej), blik, gruby obrys.
 * Osobny modul (izolacja per feature): ambientowe zwierzeta FarmAnimals zostaja nietkniete.
 * Wymiary klatek = jak w FarmAnimals (anchory i hitboxy zdarzen bez zmian). Pieczone RAZ.
 */
export type EventAnimalKind = 'bull' | 'hen' | 'hen_brown' | 'rooster';
export type EventPose = 'stand' | 'walkA' | 'walkB' | 'graze';

const RES = 2;
const OUTLINE = '#1a0f08';
const DIM: Record<EventAnimalKind, [number, number]> = { bull: [84, 64], hen: [26, 26], hen_brown: [26, 26], rooster: [30, 32] };

function rgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lerp(a: string, b: string, t: number): string { const x = rgb(a), y = rgb(b); return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`; }

/**
 * Bryla-elipsa: stos warstw (dark -> mid) o wysokosci h (w gore ekranu), na wierzchu gorna sciana
 * z gradientem NW, faza i blik. (x, y) = srodek GORNEJ sciany.
 */
function blob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, h: number, light: string, mid: string, dark: string, ol = 1.4, rot = 0): void {
    const n = Math.max(1, Math.ceil(h * 2));
    // obrys calej bryly (sylweta) — czytelnosc przy zoomie 0.6
    c.fillStyle = OUTLINE;
    c.beginPath(); c.ellipse(x, y + h, rx + ol, ry + ol, rot, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x, y, rx + ol, ry + ol, rot, 0, Math.PI * 2); c.fill();
    c.fillRect(x - rx - ol, y, (rx + ol) * 2, h);
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        c.fillStyle = lerp(dark, mid, t * 0.85);
        c.beginPath(); c.ellipse(x, y + h * (1 - t), rx, ry, rot, 0, Math.PI * 2); c.fill();
    }
    // gorna sciana: gradient swiatla z NW
    const g = c.createLinearGradient(x - rx * 0.7, y - ry * 0.9, x + rx * 0.7, y + ry * 0.9);
    g.addColorStop(0, light); g.addColorStop(0.55, mid); g.addColorStop(1, lerp(mid, dark, 0.5));
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
    // faza krawedzi
    c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.clip();
    c.lineWidth = Math.max(1, Math.min(rx, ry) * 0.22);
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(x + 0.8, y + 0.8, rx, ry, rot, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x - 0.8, y - 0.8, rx, ry, rot, 0, Math.PI * 2); c.stroke();
    c.restore();
    // blik
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(x - rx * 0.32, y - ry * 0.42, rx * 0.34, ry * 0.18, -0.25, 0, Math.PI * 2); c.fill();
}

/** Noga-walec z gradientem (jasna strona od swiatla) + kopyto/stopa. */
function leg(c: CanvasRenderingContext2D, x: number, top: number, len: number, w: number, col: string, dark: string, swing: number, hoof?: string): void {
    const bx = x + swing, by = top + len;
    c.lineCap = 'round';
    c.strokeStyle = OUTLINE; c.lineWidth = w + 2.4; c.beginPath(); c.moveTo(x, top); c.lineTo(bx, by); c.stroke();
    const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, col); g.addColorStop(1, dark);
    c.strokeStyle = g; c.lineWidth = w; c.beginPath(); c.moveTo(x, top); c.lineTo(bx, by); c.stroke();
    if (hoof) { c.fillStyle = hoof; c.beginPath(); c.ellipse(bx, by, w * 0.62, w * 0.4, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.stroke(); }
}

function contactShadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
    const g = c.createRadialGradient(x, y, 1, x, y, rx);
    g.addColorStop(0, 'rgba(10,20,5,0.45)'); g.addColorStop(1, 'rgba(10,20,5,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}

function swingOf(pose: EventPose, i: number, amp: number): number {
    return pose === 'walkA' ? (i % 2 ? amp : -amp) : pose === 'walkB' ? (i % 2 ? -amp : amp) : 0;
}

/** BYK: masywny, garb, rogi-bryly, kolczyk, czerwone oczy. Bok = sylweta, z gory = grzbiet. */
function drawBull(c: CanvasRenderingContext2D, pose: EventPose): void {
    const charge = pose === 'graze';
    contactShadow(c, 42, 52, 34, 8);
    // nogi dalsze (ciemniejsze) -> tulow -> nogi blizsze
    [31, 57].forEach((x, i) => leg(c, x, 34, 15, 7, '#3e2414', '#1a0d06', swingOf(pose, i + 1, 4), '#0d0704'));
    // ogon z kita
    c.strokeStyle = OUTLINE; c.lineWidth = 4.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(15, 26); c.quadraticCurveTo(6, 34, 9, 44); c.stroke();
    c.strokeStyle = '#4a2a16'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(15, 26); c.quadraticCurveTo(6, 34, 9, 44); c.stroke();
    c.fillStyle = '#1a0d06'; c.beginPath(); c.ellipse(9, 45, 2.6, 3.6, 0.2, 0, Math.PI * 2); c.fill();
    // tulow — wysoka bryla
    blob(c, 40, 24, 27, 13, 9, '#a8693e', '#6a3a1a', '#24120a', 1.6);
    // garb nad lopatkami
    blob(c, 56, 18, 11, 9, 6, '#946038', '#5a3018', '#24120a', 1.4);
    [26, 52].forEach((x, i) => leg(c, x, 36, 15, 7.5, '#5a3418', '#24120a', swingOf(pose, i, 4), '#0d0704'));
    // glowa — nisko przy szarzy
    const hx = charge ? 72 : 70, hy = charge ? 34 : 20;
    blob(c, hx, hy, 10, 8.5, 5, '#8e5a34', '#4a2a14', '#1e0e06', 1.4);
    // pysk
    blob(c, hx + 7, hy + 3.5, 5.5, 4.2, 2, '#e0a080', '#b8765a', '#6a3a28', 1.1);
    c.fillStyle = '#3a1a10'; c.beginPath(); c.arc(hx + 6, hy + 3, 0.9, 0, Math.PI * 2); c.arc(hx + 9, hy + 4, 0.9, 0, Math.PI * 2); c.fill();
    // kolczyk
    c.strokeStyle = OUTLINE; c.lineWidth = 2.6; c.beginPath(); c.arc(hx + 8, hy + 8, 2.6, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#f2c84a'; c.lineWidth = 1.5; c.stroke();
    // oczy — czerwone, swiecace
    c.fillStyle = 'rgba(255,40,20,0.35)'; c.beginPath(); c.arc(hx - 0.5, hy - 2, 3.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff3020'; c.beginPath(); c.arc(hx - 0.5, hy - 2, 1.9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(hx - 1, hy - 2.6, 0.6, 0, Math.PI * 2); c.fill();
    // rogi — grube, z gradientem walca
    for (const [x0, x1, x2, y2] of [[hx - 4, hx - 15, hx - 11, hy - 19], [hx + 3, hx + 13, hx + 9, hy - 21]]) {
        c.lineCap = 'round';
        c.strokeStyle = OUTLINE; c.lineWidth = 6; c.beginPath(); c.moveTo(x0, hy - 5); c.quadraticCurveTo(x1, hy - 9, x2, y2); c.stroke();
        c.strokeStyle = '#d9cdb0'; c.lineWidth = 4; c.beginPath(); c.moveTo(x0, hy - 5); c.quadraticCurveTo(x1, hy - 9, x2, y2); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0 - 1, hy - 6); c.quadraticCurveTo(x1 - 1, hy - 10, x2 - 0.5, y2 + 1); c.stroke();
    }
    // para z nozdrzy przy szarzy
    if (charge) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(hx + 14, hy + 2, 2.2, 0, Math.PI * 2); c.arc(hx + 16, hy + 5, 1.6, 0, Math.PI * 2); c.fill(); }
}

/** KURA / KOGUT: pekata bryla, skrzydlo-bryla, grzebien, dziob — wszystko z wysokoscia. */
function drawHen(c: CanvasRenderingContext2D, pose: EventPose, kind: EventAnimalKind): void {
    const rooster = kind === 'rooster', brown = kind === 'hen_brown';
    const L = brown ? '#e8a46a' : '#ffffff', M = brown ? '#b8682e' : '#e6e6e6', D = brown ? '#5a2a0c' : '#8a8a8a';
    const ox = rooster ? 2 : 0, oy = rooster ? 4 : 0;
    contactShadow(c, 13 + ox, 22 + oy, 9, 3);
    const sw = pose === 'walkA' ? 2 : pose === 'walkB' ? -2 : 0;
    leg(c, 11 + ox, 16 + oy, 6, 1.8, '#f2b030', '#b87818', sw);
    leg(c, 15 + ox, 16 + oy, 6, 1.8, '#f2b030', '#b87818', -sw);
    // ogon
    if (rooster) {
        for (const [col, a] of [['#1f8a4a', -0.9], ['#3a2aa8', -0.5], ['#d8402b', -0.2]] as const) {
            c.lineCap = 'round';
            c.strokeStyle = OUTLINE; c.lineWidth = 4.6; c.beginPath(); c.moveTo(8 + ox, 12 + oy); c.quadraticCurveTo(2 + ox, 4 + oy + a * 4, 4 + ox, 0 + oy + a * 3); c.stroke();
            c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(8 + ox, 12 + oy); c.quadraticCurveTo(2 + ox, 4 + oy + a * 4, 4 + ox, 0 + oy + a * 3); c.stroke();
        }
    } else {
        c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(8, 13); c.lineTo(2, 6); c.lineTo(10, 10); c.closePath(); c.fill();
        c.fillStyle = M; c.beginPath(); c.moveTo(8, 12.5); c.lineTo(3.2, 7.2); c.lineTo(9.5, 10.4); c.closePath(); c.fill();
    }
    // tulow
    blob(c, 13 + ox, 11 + oy, 7.5, 5.5, 3, L, M, D, 1.1);
    // skrzydlo — mniejsza bryla na tulowiu
    blob(c, 12 + ox, 10.5 + oy, 4.2, 2.8, 1.2, lerpHex(L, M), M, D, 0.8);
    // glowa
    const graze = pose === 'graze';
    const hx = (graze ? 20 : 19) + ox, hy = (graze ? 15 : 6) + oy;
    blob(c, hx, hy, 3.6, 3.2, 1.6, L, M, D, 1);
    // grzebien
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(hx - 0.5, hy - 3.6, rooster ? 3.6 : 2.4, rooster ? 2.8 : 1.9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff3a2a'; c.beginPath(); c.ellipse(hx - 0.5, hy - 3.6, rooster ? 2.8 : 1.7, rooster ? 2.1 : 1.3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(hx - 1.2, hy - 4.3, 0.7, 0, Math.PI * 2); c.fill();
    // dziob
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(hx + 2.4, hy - 1.2); c.lineTo(hx + 7, hy + 0.5); c.lineTo(hx + 2.4, hy + 2.2); c.closePath(); c.fill();
    c.fillStyle = '#f7b830'; c.beginPath(); c.moveTo(hx + 3, hy - 0.6); c.lineTo(hx + 6, hy + 0.5); c.lineTo(hx + 3, hy + 1.6); c.closePath(); c.fill();
    // oko — szalone (biale z mala zrenica)
    c.fillStyle = '#fff'; c.beginPath(); c.arc(hx + 0.8, hy - 0.6, 1.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 1.2, hy - 0.6, 0.6, 0, Math.PI * 2); c.fill();
    if (rooster) { c.fillStyle = '#ff3a2a'; c.beginPath(); c.ellipse(hx + 2, hy + 3, 1.3, 1.9, 0, 0, Math.PI * 2); c.fill(); }
}

function lerpHex(a: string, b: string): string {
    const x = rgb(a), y = rgb(b);
    const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
    return '#' + h((x[0] + y[0]) / 2) + h((x[1] + y[1]) / 2) + h((x[2] + y[2]) / 2);
}

const _tex = new Map<string, PIXI.Texture>();

/** Tekstura zwierzecia zdarzenia (pieczona raz na rodzaj+poze). */
export function eventAnimalTexture(kind: EventAnimalKind, pose: EventPose): PIXI.Texture {
    const key = kind + ':' + pose;
    const hit = _tex.get(key); if (hit) return hit;
    const [w, h] = DIM[kind];
    const cv = document.createElement('canvas'); cv.width = w * RES; cv.height = h * RES;
    const c = cv.getContext('2d')!; c.scale(RES, RES);
    drawEventAnimal(c, kind, pose);
    const t = PIXI.Texture.from(cv, { resolution: RES } as PIXI.IBaseTextureOptions);
    _tex.set(key, t);
    return t;
}

/** AGRO PERF: upiecz wszystkie klatki przy starcie mapy (nie przy pierwszym zdarzeniu = brak przyciecia w meczu). */
export function warmEventAnimals(): void {
    for (const k of ['bull', 'hen', 'hen_brown', 'rooster'] as const) for (const p of ['stand', 'walkA', 'walkB', 'graze'] as const) eventAnimalTexture(k, p);
}

/** Eksport dla podgladu dev. */
export function drawEventAnimal(c: CanvasRenderingContext2D, kind: EventAnimalKind, pose: EventPose): void {
    c.lineJoin = 'round';
    if (kind === 'bull') drawBull(c, pose); else drawHen(c, pose, kind);
}
