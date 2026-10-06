import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';
import { getGlowTexture } from '../../rendering/Effects';

/**
 * TROPICS ART v2 / T6.3b — KOMBAJN fake-3D (zamiast plaskiego traktora patrolowego; prosba Mariusza:
 * "ma wygladac jak czolg — z efektem 3d, realistyczny, bardzo juicy, tani na mobile").
 *
 * Technika jak w bakerach czolgow: kazda czesc to BRYLA (prostopadloscian w ukladzie maszyny), rzutowana
 * na ekran z wysokoscia = przesuniecie w gore. Gorna sciana z gradientem swiatla (NW), boczne sciany
 * widoczne od poludnia cieniowane wg normalnej, czesci sortowane od najdalszej. Pieczone RAZ dla
 * 24 kierunkow jazdy (swiatlo zawsze z NW — jak u czolgow), w meczu tylko podmiana tekstury.
 * Animacja = czastki (kurz spod kol, sieczka, dym z komina) + poswiaty ADD w szale.
 */
const FRAMES = 24;
const SIZE = 240;         // px klatki (srodek = srodek maszyny na ziemi)
const RES = 1;            // 24 x 240^2 x 4 B ~ 5.5 MB (dluzsza maszyna = wieksza klatka)
const GROUND_DY = 26;     // srodek maszyny ponizej srodka klatki (miejsce na kabine/komin)
const S = 0.9;            // skala calej maszyny w klatce
// Rzut jak u czolgow (render2d): pochylenie kamery + wysokosc z -> przesuniecie w gore ekranu.
const TILT = 0.866;
const Z_SCR = 0.78;
const LIGHT_X = -0.62, LIGHT_Y = -0.78; // swiatlo z NW, stale w ekranie
const OUTLINE = '#140c06';

function hexToRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex(r: number, g: number, b: number): string { const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
function darken(h: string, f: number): string { const [r, g, b] = hexToRgb(h); return toHex(r * f, g * f, b * f); }
function lighten(h: string, f: number): string { const [r, g, b] = hexToRgb(h); return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
function lerpColor(c1: string, c2: string, t: number): string { const a = hexToRgb(c1), b = hexToRgb(c2); return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }

/** Bryla w ukladzie maszyny: f = do przodu, r = w prawo, prostokat z zaokragleniem, wysokosc z0..z1. */
interface Part {
    f: number; r: number; L: number; W: number; z0: number; z1: number; round: number;
    main: string;            // kolor gornej sciany
    side?: string;           // kolor scian bocznych (domyslnie przyciemniony main)
    layer: 0 | 1 | 2;        // 0 = przy ziemi (sort po glebokosci), 1 = nadbudowa, 2 = najwyzsze
    glare?: boolean;
    detail?: (c: CanvasRenderingContext2D) => void; // rysowane w ukladzie gornej sciany (lokalnie, srodek bryly = 0,0)
}

/** Ukosne pasy ostrzegawcze zolto-czarne w prostokacie (lokalnie). */
function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 7): void {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = '#f5c518'; c.fillRect(x, y, w, h);
    c.fillStyle = '#1a1208';
    for (let i = -h; i < w + h; i += step * 2) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + step, y); c.lineTo(x + i + step - h, y + h); c.lineTo(x + i - h, y + h); c.closePath(); c.fill(); }
    c.restore();
    c.strokeStyle = OUTLINE; c.lineWidth = 1.2; c.strokeRect(x, y, w, h);
}

function rivet(c: CanvasRenderingContext2D, x: number, y: number, r = 1.8): void {
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(x + 0.6, y + 0.8, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); c.fill();
}

/** Bieznik opony na gornej scianie kola (os kola = r, toczy sie wzdluz f). */
function tyreTread(L: number, W: number) {
    return (c: CanvasRenderingContext2D) => {
        c.strokeStyle = '#0a0a0a'; c.lineWidth = 2.6;
        for (let f = -L / 2 + 3; f < L / 2 - 1; f += 5) { c.beginPath(); c.moveTo(f, -W / 2 + 1.5); c.lineTo(f + 2.5, 0); c.lineTo(f, W / 2 - 1.5); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-L / 2 + 2, -W / 2 + 1, L - 4, 2);
    };
}

function parts(): Part[] {
    const G = '#3c8f34', GD = '#24591f', Y = '#f2c230', RED = '#d8321e', STEEL = '#b9c3c9', TYRE = '#2b2b2b';
    return [
        // KOLA — przednie OLBRZYMIE (chunky), tylne skretne mniejsze
        { f: -46, r: -31, L: 20, W: 13, z0: 0, z1: 17, round: 6, main: TYRE, side: '#151515', layer: 0, detail: tyreTread(20, 13) },
        { f: -46, r: 31, L: 20, W: 13, z0: 0, z1: 17, round: 6, main: TYRE, side: '#151515', layer: 0, detail: tyreTread(20, 13) },
        { f: 16, r: -38, L: 38, W: 18, z0: 0, z1: 32, round: 10, main: TYRE, side: '#151515', layer: 0, detail: tyreTread(38, 18) },
        { f: 16, r: 38, L: 38, W: 18, z0: 0, z1: 32, round: 10, main: TYRE, side: '#151515', layer: 0, detail: tyreTread(38, 18) },
        // KORPUS — dlugi, masywny
        { f: -6, r: 0, L: 108, W: 56, z0: 10, z1: 38, round: 9, main: G, side: GD, layer: 0, glare: true,
          detail: (c) => {
              // zolty pas wzdluz burt + nity
              c.fillStyle = Y; c.fillRect(-52, -27, 100, 4); c.fillRect(-52, 23, 100, 4);
              c.strokeStyle = OUTLINE; c.lineWidth = 1; c.strokeRect(-52, -27, 100, 4); c.strokeRect(-52, 23, 100, 4);
              for (let f = -46; f <= 44; f += 15) { rivet(c, f, -20); rivet(c, f, 20); }
              // pasy ostrzegawcze na nosie
              hazard(c, 40, -24, 10, 48, 6);
          } },
        // PRZENOSNIK (szyja hedera)
        { f: 50, r: 0, L: 16, W: 32, z0: 6, z1: 26, round: 3, main: darken(G, 0.85), side: GD, layer: 0,
          detail: (c) => { c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; for (let r = -12; r <= 12; r += 6) { c.beginPath(); c.moveTo(-7, r); c.lineTo(7, r); c.stroke(); } } },
        // HEDER — szeroka zolta paszcza z pasami ostrzegawczymi
        { f: 66, r: 0, L: 22, W: 118, z0: 2, z1: 16, round: 4, main: Y, side: '#a8780f', layer: 0,
          detail: (c) => {
              hazard(c, 4, -57, 6, 114, 6);
              c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-9, -55); c.lineTo(-9, 55); c.stroke();
              // ZEBY — stalowe, grube, wystajace do przodu
              for (let r = -54; r <= 54; r += 9) {
                  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.moveTo(10, r - 3.5 + 1); c.lineTo(22, r + 1); c.lineTo(10, r + 3.5 + 1); c.closePath(); c.fill();
                  const g = c.createLinearGradient(10, r - 4, 10, r + 4); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, STEEL); g.addColorStop(1, '#5d676d');
                  c.fillStyle = g; c.beginPath(); c.moveTo(10, r - 4); c.lineTo(22, r); c.lineTo(10, r + 4); c.closePath(); c.fill();
                  c.strokeStyle = OUTLINE; c.lineWidth = 1; c.stroke();
              }
          } },
        // NAGARNIACZ — czerwony walec z listwami i kolcami
        { f: 61, r: 0, L: 14, W: 108, z0: 20, z1: 32, round: 7, main: RED, side: '#7d1a0e', layer: 1, glare: true,
          detail: (c) => {
              c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.6;
              for (let r = -50; r <= 50; r += 10) { c.beginPath(); c.moveTo(-6, r); c.lineTo(6, r); c.stroke(); }
              c.strokeStyle = OUTLINE; c.lineWidth = 1.2;
              for (let r = -48; r <= 48; r += 10) { c.beginPath(); c.moveTo(6, r); c.lineTo(11, r + 2); c.stroke(); }
              // piasty ramion
              for (const r of [-54, 54]) { c.fillStyle = '#444'; c.beginPath(); c.arc(0, r, 4, 0, Math.PI * 2); c.fill(); c.strokeStyle = OUTLINE; c.stroke(); }
          } },
        // POKLAD SILNIKA z tylu (kratka)
        { f: -44, r: 0, L: 26, W: 48, z0: 38, z1: 45, round: 4, main: darken(G, 0.8), side: GD, layer: 1,
          detail: (c) => {
              c.fillStyle = '#0d0d0d'; c.fillRect(-10, -18, 20, 36);
              c.fillStyle = '#3a3a3a'; for (let r = -16; r < 17; r += 5) c.fillRect(-9, r, 18, 2.5);
              c.strokeStyle = OUTLINE; c.lineWidth = 1.2; c.strokeRect(-10, -18, 20, 36);
          } },
        // ZBIORNIK ZIARNA — otwarty, pelny zlotego ziarna
        { f: -10, r: 0, L: 46, W: 50, z0: 38, z1: 58, round: 6, main: darken(G, 1.05), side: GD, layer: 1, glare: true,
          detail: (c) => {
              const g = c.createRadialGradient(-4, -6, 2, 0, 0, 24); g.addColorStop(0, '#ffe680'); g.addColorStop(0.6, '#e9b52a'); g.addColorStop(1, '#a87412');
              c.fillStyle = g; c.beginPath(); c.roundRect(-19, -21, 38, 42, 4); c.fill();
              c.strokeStyle = OUTLINE; c.lineWidth = 1.5; c.stroke();
              c.fillStyle = 'rgba(120,70,0,0.55)'; for (let i = 0; i < 26; i++) { const a = i * 2.4, d = (i * 7) % 17; c.fillRect(Math.cos(a) * d - 1, Math.sin(a) * d - 0.5, 2, 1); }
          } },
        // KABINA — ciemne przyciemniane szyby, groznie
        { f: 30, r: 0, L: 28, W: 34, z0: 38, z1: 68, round: 6, main: '#2d2f33', side: '#1b2a33', layer: 2, glare: true,
          detail: (c) => {
              c.fillStyle = '#3d4046'; c.beginPath(); c.roundRect(-11, -14, 22, 28, 4); c.fill();
              c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.stroke();
              hazard(c, -12, -15, 24, 4, 4);
              // listwa swiatel na dachu (czerwone "oczy")
              c.fillStyle = '#111'; c.fillRect(11, -14, 4, 28);
              for (const r of [-9, -3, 3, 9]) { c.fillStyle = '#ff3a1a'; c.beginPath(); c.arc(13, r, 1.8, 0, Math.PI * 2); c.fill(); }
          } },
        // RURA WYSYPOWA — wysiegnik na lewo z wylotem
        { f: -14, r: -44, L: 9, W: 42, z0: 50, z1: 57, round: 4, main: G, side: GD, layer: 2,
          detail: (c) => { c.fillStyle = '#111'; c.beginPath(); c.ellipse(0, -21, 4, 3, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = Y; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -14); c.lineTo(0, 14); c.stroke(); } },
        // KOMIN — wysoki, czarny
        { f: -34, r: 20, L: 7, W: 7, z0: 45, z1: 82, round: 3, main: '#2a2a2a', side: '#141414', layer: 2,
          detail: (c) => { c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, 2.4, 0, Math.PI * 2); c.fill(); } },
    ];
}

/** Ustawia transform ukladu maszyny na wysokosci z (jak applyTransform w render2d). */
function at(c: CanvasRenderingContext2D, cx: number, cy: number, z: number, a: number): void {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.translate(cx, cy - z * Z_SCR * S);
    c.scale(S, S * TILT);
    c.rotate(a);
}

function partPath(c: CanvasRenderingContext2D, p: Part): void {
    c.beginPath(); c.roundRect(p.f - p.L / 2, p.r - p.W / 2, p.L, p.W, p.round);
}

/** Ekstruzja jak extrudeV2 czolgow: stos warstw deep->side + gradient swiatla w ekranie na kazdej warstwie. */
function drawPart(c: CanvasRenderingContext2D, p: Part, cx: number, cy: number, a: number): void {
    const side = p.side ?? darken(p.main, 0.6);
    const deep = darken(side, 0.55);
    const zH = p.z1 - p.z0, layers = Math.max(1, Math.ceil(zH * Z_SCR * S));
    const span = 110;
    c.lineJoin = 'round';
    for (let i = 0; i <= layers; i++) {
        const z = p.z0 + (zH * i) / layers;
        at(c, cx, cy, z, a); partPath(c, p);
        c.fillStyle = lerpColor(deep, side, i / layers); c.fill();
        c.save(); c.clip(); c.setTransform(1, 0, 0, 1, 0, 0);
        const g = c.createLinearGradient(cx + LIGHT_X * span, cy + LIGHT_Y * span, cx - LIGHT_X * span, cy - LIGHT_Y * span);
        g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
        c.fillStyle = g; c.fillRect(0, 0, SIZE, SIZE);
        c.restore();
    }
    // obrys podstawy (kontakt z podloga / nadbudowa)
    at(c, cx, cy, p.z0, a); partPath(c, p); c.strokeStyle = OUTLINE; c.lineWidth = 2.2 / S; c.stroke();
    // GORNA SCIANA: kolor + gradient swiatla ekranowy + faza krawedzi + blik
    at(c, cx, cy, p.z1, a); partPath(c, p);
    c.fillStyle = p.main; c.fill();
    c.save(); c.clip();
    c.setTransform(1, 0, 0, 1, 0, 0);
    const tg = c.createLinearGradient(cx + LIGHT_X * span, cy + LIGHT_Y * span, cx - LIGHT_X * span, cy - LIGHT_Y * span);
    tg.addColorStop(0, 'rgba(255,255,255,0.28)'); tg.addColorStop(0.5, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = tg; c.fillRect(0, 0, SIZE, SIZE);
    c.restore();
    // detale w ukladzie bryly
    if (p.detail) { at(c, cx, cy, p.z1, a); c.translate(p.f, p.r); c.save(); c.beginPath(); c.roundRect(-p.L / 2 - 14, -p.W / 2 - 14, p.L + 28, p.W + 28, 0); c.clip(); p.detail(c); c.restore(); }
    // faza: jasna krawedz od swiatla, ciemna po przeciwnej (offset w ekranie)
    at(c, cx, cy, p.z1, a);
    const m = c.getTransform().inverse();
    const lx = m.a * LIGHT_X + m.c * LIGHT_Y, ly = m.b * LIGHT_X + m.d * LIGHT_Y, ll = Math.hypot(lx, ly) || 1;
    c.save(); partPath(c, p); c.clip();
    c.lineWidth = 2.6 / S;
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.save(); c.translate(-lx / ll * 1.6, -ly / ll * 1.6); partPath(c, p); c.stroke(); c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.save(); c.translate(lx / ll * 1.6, ly / ll * 1.6); partPath(c, p); c.stroke(); c.restore();
    if (p.glare) { // blysk "anime" 45 st. w ekranie
        c.setTransform(1, 0, 0, 1, 0, 0); c.translate(cx, cy - p.z1 * Z_SCR * S); c.rotate(-Math.PI / 4);
        const g = c.createLinearGradient(-60, 0, 60, 0);
        g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.26)'); g.addColorStop(0.58, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(-120, -120, 240, 240);
    }
    c.restore();
    at(c, cx, cy, p.z1, a); partPath(c, p); c.strokeStyle = OUTLINE; c.lineWidth = 2.4 / S; c.stroke();
}

function bakeFrame(a: number): PIXI.Texture {
    const cv = document.createElement('canvas'); cv.width = SIZE * RES; cv.height = SIZE * RES;
    const c = cv.getContext('2d')!; c.scale(RES, RES);
    drawCombineFrame(c, a);
    return PIXI.Texture.from(cv, { resolution: RES } as PIXI.IBaseTextureOptions);
}

/** Rysuje jedna klatke kombajnu (kat jazdy a) — eksport tylko dla podgladu dev. */
export function drawCombineFrame(c: CanvasRenderingContext2D, a: number): void {
    const base = c.getTransform();
    const cx = SIZE / 2, cy = SIZE / 2 + GROUND_DY;
    // at() resetuje transform — przesuwamy wiec srodek o bazowy transform callera (podglad rysuje siatke)
    const ox = base.e, oy = base.f;
    const X = cx + ox, Y = cy + oy;
    // cien rzucony (SE), miekki — shadowBlur jest darmowy w bake
    c.save();
    at(c, X + 10, Y + 9, 0, a);
    c.shadowColor = 'rgba(10,25,5,0.55)'; c.shadowBlur = 10;
    c.fillStyle = 'rgba(10,25,5,0.34)';
    c.beginPath(); c.roundRect(-62, -34, 112, 68, 14); c.fill();
    c.beginPath(); c.roundRect(52, -60, 30, 120, 6); c.fill();
    c.restore();
    // kolejnosc: warstwa (ziemia -> nadbudowa), w warstwie od najdalszej (mniejsze y ekranu)
    const sy = (p: Part) => (p.f * Math.sin(a) + p.r * Math.cos(a)) * TILT;
    const ps = parts().sort((p, q) => (p.layer - q.layer) || (sy(p) - sy(q)));
    // przednie kola wchodza POD korpus — boczne kolo blizej kamery rysujemy po korpusie
    const body = ps.find(p => p.L === 108)!;
    const ground = ps.filter(p => p.layer === 0);
    const farWheels = ground.filter(p => p.main === '#2b2b2b' && sy(p) <= sy(body));
    const nearWheels = ground.filter(p => p.main === '#2b2b2b' && sy(p) > sy(body));
    const rest0 = ground.filter(p => p.main !== '#2b2b2b');
    for (const p of [...farWheels, ...rest0, ...nearWheels, ...ps.filter(p => p.layer > 0)]) {
        c.save(); drawPart(c, p, X, Y, a); c.restore();
    }
    c.setTransform(base);
}

/** Pozycja ekranowa punktu maszyny (f, r, z) wzgledem srodka na ziemi — dla poswiat w meczu. */
function screenOf(f: number, r: number, z: number, a: number): [number, number] {
    const ux = Math.cos(a), uy = Math.sin(a);
    return [(f * ux - r * uy) * S, (f * uy + r * ux) * S * TILT - z * Z_SCR * S];
}

const _frames: PIXI.Texture[] = [];
function frames(): PIXI.Texture[] {
    if (_frames.length === 0) for (let i = 0; i < FRAMES; i++) _frames.push(bakeFrame((i / FRAMES) * Math.PI * 2));
    return _frames;
}

export class CombineVisual {
    private readonly sprite: PIXI.Sprite;
    private readonly beacon: PIXI.Sprite;
    private readonly heads: PIXI.Sprite[] = [];
    private t = 0;

    constructor(world: PIXI.Container, private readonly effects: EffectsManager) {
        const f = frames();
        this.sprite = new PIXI.Sprite(f[0]);
        this.sprite.anchor.set(0.5, (SIZE / 2 + GROUND_DY) / SIZE);
        world.addChild(this.sprite);
        this.beacon = new PIXI.Sprite(getGlowTexture()); // kogut na kabinie (ADD) — w szale czerwony
        this.beacon.anchor.set(0.5); this.beacon.blendMode = PIXI.BLEND_MODES.ADD; this.beacon.scale.set(1.6);
        world.addChild(this.beacon);
        for (let i = 0; i < 2; i++) {
            const h = new PIXI.Sprite(getGlowTexture()); h.anchor.set(0.5); h.blendMode = PIXI.BLEND_MODES.ADD; h.tint = 0xfff2b0; h.scale.set(1.4, 0.9);
            world.addChild(h); this.heads.push(h);
        }
    }

    /** heading z PatrolTractor (sprite "gora" = N => kierunek jazdy = heading - PI/2). */
    update(x: number, y: number, heading: number, rage: 'idle' | 'telegraph' | 'rage', moving: boolean, visible: boolean): void {
        this.t++;
        const move = heading - Math.PI / 2;
        const ang = ((move % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.round(ang / (Math.PI * 2 / FRAMES)) % FRAMES;
        this.sprite.visible = this.beacon.visible = visible;
        for (const h of this.heads) h.visible = visible;
        if (!visible) return;
        this.sprite.texture = frames()[idx];
        const shake = rage === 'rage' ? Math.sin(this.t * 1.7) * 1.2 : 0;
        this.sprite.x = x + shake; this.sprite.y = y;
        this.sprite.zIndex = Math.floor(y) + 50;
        const ux = Math.cos(move), uy = Math.sin(move);
        // kogut na kabinie
        const bp = screenOf(30, 0, 72, move); this.beacon.x = x + bp[0]; this.beacon.y = y + bp[1]; this.beacon.zIndex = this.sprite.zIndex + 1;
        if (rage === 'idle') { this.beacon.tint = 0xffb020; this.beacon.alpha = 0.35 + 0.35 * Math.abs(Math.sin(this.t * 0.08)); }
        else { this.beacon.tint = 0xff2a1a; this.beacon.alpha = (this.t >> 3) % 2 ? 1 : 0.2; this.beacon.scale.set(2.4); }
        if (rage === 'idle') this.beacon.scale.set(1.6);
        // reflektory przodu
        for (let i = 0; i < 2; i++) {
            const r = i ? 16 : -16;
            const hp = screenOf(44, r, 60, move); this.heads[i].x = x + hp[0]; this.heads[i].y = y + hp[1];
            this.heads[i].zIndex = this.sprite.zIndex + 1;
            this.heads[i].alpha = rage === 'idle' ? 0.25 : 0.85;
            this.heads[i].tint = rage === 'idle' ? 0xfff2b0 : 0xff6a3a;
        }
        // czastki: kurz spod kol, sieczka z tylu, dym z komina (tanie, z puli)
        if (moving && this.t % 5 === 0) this.effects.spawnSoftPuff(x - ux * 34 + (Math.random() - 0.5) * 30, y - uy * 34 + (Math.random() - 0.5) * 20, 0xc8a878, 3);
        if (this.t % (rage === 'rage' ? 4 : 12) === 0) this.effects.spawnSoftPuff(x - ux * 22 + uy * 18, y - uy * 22 - ux * 18 - 60, 0x555555, rage === 'rage' ? 3.2 : 2.4);
        if (moving && this.t % (rage === 'rage' ? 3 : 9) === 0) this.effects.spawnHayBits(x - ux * 44, y - uy * 44, rage === 'rage' ? 2 : 1, false);
    }
}
