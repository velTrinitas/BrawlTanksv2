/**
 * TowerBaker — v0.190.0 (FAZA 3, redesign wg concept-referencu Mariusza).
 *
 * Wieza MG (super moc) byla PLASKA: zywe `PIXI.Graphics`, zero gradientow, cien = plaska elipsa.
 * Pierwsze podejscie (v0.189.0) przerobilo sam FILAR — Mariusz: "nie podoba mi sie kopula tej
 * wiezy, jest wg starego wygladu, zmieniles tylko filar". Ta wersja przebudowuje CALOSC wg
 * konceptu: ciezkie automatyczne dzialo strazujace.
 *
 * ZALOZENIA Z KONCEPTU:
 *  - **cel-shading**: plaskie PASY swiatla (gora-lewo jasno, dol-prawo ciemno) + grube, czyste
 *    konturY. Swiadomie NIE miekki airbrush — to jest kreskowka, nie render.
 *  - **ciezar sylwetki**: szeroka, niska, TRAPEZOWA baza (navy -> charcoal), fazowane plyty,
 *    grube sruby, zloty rant, "wrosniety" kolnierz przy gruncie.
 *  - **glowica obrotowa**: teal RDZEN ENERGII osadzony jak oko w oczodole, poswiata MALA
 *    i kontrolowana (regula mobile-first §3 zabrania duzych glow — fill-rate).
 *  - **lufy**: grube, z zebrami chlodzacymi, hamulcem wylotowym; **pomaranczowy zar WYLACZNIE
 *    na wylotach**. Kontrast temperatur (zimny teal rdzen vs cieply pomaranczowy wylot) to
 *    glowny haczyk wizualny.
 *  - **teal = "to jest TWOJE"** — ten sam sygnal co tealowe tracery gracza.
 *
 * MODULARNOSC: baza i glowica to DWIE osobne tekstury, bo glowica sie obraca niezaleznie.
 *
 * Wysokosc bryly zostaje bez zmian (`TOWER_TOP_LIFT`) — animacje zrzutu z nieba, przysiadu
 * i pozycja wrapa lufy sa na niej oparte; zmiana proporcji wymagalaby ruszenia logiki.
 *
 * Rollback: `?towerbake=0` przywraca zywe Graphics sprzed v0.189.0.
 */

import * as PIXI from 'pixi.js';

const C = {
    // Baza: navy -> charcoal, plaskie pasy (bez gradientu — cel-shading)
    baseLit: '#3d4a63',
    base: '#2a3548',
    baseDark: '#1b2231',
    baseDeep: '#121826',
    outline: '#0a0e17',
    gold: '#d9a441',
    goldLit: '#f5d17a',
    // Glowica
    headLit: '#5a6880',
    head: '#3a4559',
    headDark: '#222a39',
    // Teal — sygnal "to Twoje"
    teal: '#4dd7c8',
    tealLit: '#b8fff5',
    tealDark: '#17756c',
    // Lufy + zar wylotu
    barrelLit: '#6d7889',
    barrel: '#48525f',
    barrelDark: '#2b323c',
    heat: '#ff8a2b',
    heatCore: '#ffd9a0',
};

/** Kadr tekstury bazy. Punkt gruntu (0,0) wypada w (PAD_X, GROUND_Y). */
const BODY_W = 92;
const BODY_H = 92;
const PAD_X = 46;
const GROUND_Y = 66;

/** Kadr glowicy — kwadrat wysrodkowany na osi obrotu. */
const TUR = 128;
const TUR_C = TUR / 2;

let _bodyTex: PIXI.Texture | null = null;
let _turretTex: PIXI.Texture | null = null;

export function isTowerBakeEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('towerbake') !== '0';
}

export const TOWER_BODY_ANCHOR = { x: PAD_X / BODY_W, y: GROUND_Y / BODY_H };

function ctx2d(w: number, h: number): CanvasRenderingContext2D {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv.getContext('2d')!;
}

/** Gruby, czysty kontur — podstawa stylu kreskowkowego (rysowany PO wypelnieniu). */
function outline(c: CanvasRenderingContext2D, w = 2.4): void {
    c.strokeStyle = C.outline;
    c.lineWidth = w;
    c.lineJoin = 'round';
    c.stroke();
}

function poly(c: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
}

/** Gruba sruba: ciemne gniazdo + jasny lb — czyta sie jako element montazowy, nie kropka. */
function bolt(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    c.fillStyle = C.baseDeep;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = C.baseLit;
    c.beginPath(); c.arc(x - r * 0.25, y - r * 0.28, r * 0.52, 0, Math.PI * 2); c.fill();
}

/**
 * BAZA — trapez "wrosniety" w grunt: kolnierz, dwie fazowane plyty, zloty rant, sruby.
 * @param topLift wysokosc gniazda glowicy nad gruntem (TOWER_TOP_LIFT — jedno zrodlo prawdy)
 */
function bakeBody(topLift: number): PIXI.Texture {
    const c = ctx2d(BODY_W, BODY_H);
    const gx = PAD_X, gy = GROUND_Y;
    const topY = gy - topLift;

    // ── KOLNIERZ PRZY GRUNCIE ("planted lip") — pokazuje, ze dzialo jest WBITE w ziemie ──
    c.fillStyle = C.baseDeep;
    c.beginPath(); c.ellipse(gx, gy + 6, 31, 9, 0, 0, Math.PI * 2); c.fill();
    outline(c, 2.2);
    c.fillStyle = C.baseDark;
    c.beginPath(); c.ellipse(gx, gy + 4, 27, 7.5, 0, 0, Math.PI * 2); c.fill();

    // ── DOLNA PLYTA TRAPEZU (najszersza, najciezsza) ──
    poly(c, [[gx - 28, gy + 4], [gx + 28, gy + 4], [gx + 22, gy - 14], [gx - 22, gy - 14]]);
    c.fillStyle = C.base; c.fill(); outline(c);
    // pas swiatla: gora-lewo
    poly(c, [[gx - 22, gy - 14], [gx + 22, gy - 14], [gx + 19, gy - 8], [gx - 25, gy - 8]]);
    c.fillStyle = C.baseLit; c.fill();
    // pas cienia: dol-prawo
    poly(c, [[gx + 10, gy + 4], [gx + 28, gy + 4], [gx + 22, gy - 14], [gx + 13, gy - 14]]);
    c.fillStyle = C.baseDark; c.fill();
    bolt(c, gx - 18, gy - 3, 3.2);
    bolt(c, gx + 18, gy - 3, 3.2);

    // ── GORNA PLYTA TRAPEZU (wezsza — schodkowanie daje ciezar) ──
    poly(c, [[gx - 21, gy - 12], [gx + 21, gy - 12], [gx + 16, gy - 26], [gx - 16, gy - 26]]);
    c.fillStyle = C.base; c.fill(); outline(c);
    poly(c, [[gx - 16, gy - 26], [gx + 16, gy - 26], [gx + 14, gy - 21], [gx - 18, gy - 21]]);
    c.fillStyle = C.baseLit; c.fill();
    poly(c, [[gx + 8, gy - 12], [gx + 21, gy - 12], [gx + 16, gy - 26], [gx + 9, gy - 26]]);
    c.fillStyle = C.baseDark; c.fill();
    bolt(c, gx - 12, gy - 18, 2.8);
    bolt(c, gx + 12, gy - 18, 2.8);

    // ── ZLOTY RANT — akcent sojusznika, oddziela baze od gniazda glowicy ──
    poly(c, [[gx - 17, gy - 25], [gx + 17, gy - 25], [gx + 15, gy - 30], [gx - 15, gy - 30]]);
    c.fillStyle = C.gold; c.fill(); outline(c, 2);
    c.fillStyle = C.goldLit;
    c.fillRect(gx - 14, gy - 29.5, 26, 1.6);

    // ── SZYJA / GNIAZDO GLOWICY — waski slup do wysokosci topLift ──
    const neckTop = topY - 2;
    poly(c, [[gx - 13, gy - 28], [gx + 13, gy - 28], [gx + 11, neckTop], [gx - 11, neckTop]]);
    c.fillStyle = C.base; c.fill(); outline(c);
    poly(c, [[gx - 11, neckTop], [gx - 4, neckTop], [gx - 6, gy - 28], [gx - 13, gy - 28]]);
    c.fillStyle = C.baseLit; c.fill();
    poly(c, [[gx + 5, neckTop], [gx + 11, neckTop], [gx + 13, gy - 28], [gx + 7, gy - 28]]);
    c.fillStyle = C.baseDark; c.fill();

    // Oczodol pod glowice — ciemne gniazdo, zeby glowica "siedziala", a nie lezala na slupie.
    c.fillStyle = C.baseDeep;
    c.beginPath(); c.ellipse(gx, neckTop, 13, 5, 0, 0, Math.PI * 2); c.fill();
    outline(c, 2);

    return PIXI.Texture.from(c.canvas);
}

/**
 * GLOWICA OBROTOWA — korpus + teal "oko" + blizniacze lufy z zebrami i zarem na wylotach.
 * Lufy celuja w PRAWO (kierunek +x), bo sprite jest obracany rotacja kontenera.
 */
function bakeTurret(): PIXI.Texture {
    const c = ctx2d(TUR, TUR);
    const cx = TUR_C, cy = TUR_C;

    // ── LUFY (pod korpusem, zeby korpus je "trzymal") ──
    for (const oy of [-7.5, 3]) {
        const y = cy + oy;
        // trzon lufy
        c.fillStyle = C.barrel;
        c.beginPath(); c.rect(cx + 6, y, 30, 4.5); c.closePath(); c.fill(); outline(c, 2);
        // pas swiatla na gorze (cel-shading: jeden plaski pas, nie gradient)
        c.fillStyle = C.barrelLit;
        c.fillRect(cx + 6, y + 0.4, 30, 1.4);
        // ZEBRA CHLODZACE — grube prazki, czytelne przy zoomie 0.6
        c.fillStyle = C.barrelDark;
        for (let i = 0; i < 5; i++) c.fillRect(cx + 10 + i * 4, y, 1.6, 4.5);
        // HAMULEC WYLOTOWY — szerszy blok z wyciecim
        c.fillStyle = C.barrel;
        c.beginPath(); c.rect(cx + 36, y - 1.2, 7, 6.9); c.closePath(); c.fill(); outline(c, 2);
        c.fillStyle = C.barrelDark;
        c.fillRect(cx + 38, y - 1.2, 1.4, 6.9);
        // ZAR WYLOTU — jedyne cieple zrodlo; maly i kontrolowany (fill-rate)
        c.save();
        c.shadowColor = C.heat;
        c.shadowBlur = 6;
        c.fillStyle = C.heat;
        c.beginPath(); c.ellipse(cx + 43.5, y + 2.2, 2.2, 2.6, 0, 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;
        c.fillStyle = C.heatCore;
        c.beginPath(); c.ellipse(cx + 43.5, y + 2.2, 1, 1.3, 0, 0, Math.PI * 2); c.fill();
        c.restore();
    }

    // ── KORPUS GLOWICY — osmiokat zamiast kola: czyta sie jak pancerz, nie balon ──
    const R = 15;
    const oct: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        oct.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.92]);
    }
    poly(c, oct);
    c.fillStyle = C.head; c.fill(); outline(c, 2.6);
    // pas swiatla gora-lewo
    poly(c, [oct[4], oct[5], oct[6], [cx, cy]]);
    c.fillStyle = C.headLit; c.fill();
    // pas cienia dol-prawo
    poly(c, [oct[0], oct[1], oct[2], [cx, cy]]);
    c.fillStyle = C.headDark; c.fill();

    // Policzki pancerza po bokach luf — spinaja glowice z lufami
    c.fillStyle = C.headDark;
    c.beginPath(); c.rect(cx + 8, cy - 11, 6, 22); c.closePath(); c.fill(); outline(c, 2);
    c.fillStyle = C.headLit;
    c.fillRect(cx + 8, cy - 11, 6, 1.6);

    // ── TEAL "OKO" — rdzen energii osadzony w oczodole ──
    c.fillStyle = C.outline;
    c.beginPath(); c.arc(cx - 1, cy, 8.2, 0, Math.PI * 2); c.fill();      // oczodol
    c.fillStyle = C.tealDark;
    c.beginPath(); c.arc(cx - 1, cy, 6.6, 0, Math.PI * 2); c.fill();      // pierscien
    c.save();
    c.shadowColor = C.teal;
    c.shadowBlur = 9;                                                      // MALA, kontrolowana poswiata
    const eye = c.createRadialGradient(cx - 2.6, cy - 2.2, 0.5, cx - 1, cy, 5.2);
    eye.addColorStop(0, C.tealLit);
    eye.addColorStop(0.5, C.teal);
    eye.addColorStop(1, C.tealDark);
    c.fillStyle = eye;
    c.beginPath(); c.arc(cx - 1, cy, 5.2, 0, Math.PI * 2); c.fill();
    c.restore();
    // blik soczewki
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.ellipse(cx - 3, cy - 2.6, 1.7, 1.1, -0.5, 0, Math.PI * 2); c.fill();

    // Zlota obreczka mocowania — domyka tozsamosc sojusznika (ten sam akcent co baza)
    c.strokeStyle = C.gold;
    c.lineWidth = 1.6;
    c.beginPath(); c.arc(cx - 1, cy, 9.6, Math.PI * 0.78, Math.PI * 1.55); c.stroke();

    return PIXI.Texture.from(c.canvas);
}

export function getTowerBodyTexture(topLift: number): PIXI.Texture {
    if (!_bodyTex || _bodyTex.destroyed) _bodyTex = bakeBody(topLift);
    return _bodyTex;
}

export function getTowerTurretTexture(): PIXI.Texture {
    if (!_turretTex || _turretTex.destroyed) _turretTex = bakeTurret();
    return _turretTex;
}

/** Zwalnia obie tekstury (cache modulowy zyje na sesje, jak Tier3Baker). */
export function disposeTowerTextures(): void {
    for (const t of [_bodyTex, _turretTex]) {
        try { if (t && !t.destroyed) t.destroy(true); } catch (e) { console.error('[TowerBaker] destroy', (e as Error).stack); }
    }
    _bodyTex = null;
    _turretTex = null;
}
