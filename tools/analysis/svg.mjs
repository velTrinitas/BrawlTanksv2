/**
 * svg.mjs — wykresy jako inline SVG do raportu PDF.
 *
 * PO CO WLASNE, A NIE BIBLIOTEKA: raport idzie do druku i ma dzialac offline,
 * bez CDN-a i bez JS-a w docelowym PDF-ie. Kazdy slupek dostaje etykiete z wartoscia,
 * wiec kolor NIGDY nie jest jedynym nosnikiem informacji — to warunek czytelnosci
 * na wydruku czarno-bialym i przy daltonizmie.
 *
 * Paleta zwalidowana `scripts/validate_palette.js` (dataviz):
 *   kategoryczna [#2a78d6, #eb6834] — light: WSZYSTKIE testy PASS
 *   porzadkowa lejka (5 krokow jednego odcienia) — light: WSZYSTKIE testy PASS
 */

export const C = {
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#8a8880',
    grid: '#e4e2dd',
    surface: '#fcfcfb',
    s1: '#2a78d6',   // slot kategoryczny 1
    s2: '#eb6834',   // slot kategoryczny 2
    good: '#008300',
    bad: '#e34948',
    warn: '#eda100',
    ramp: ['#0d366b', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef'],
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => (n === null || n === undefined ? '—' : String(n));

/** Otoczka SVG — `role="img"` + `<title>` daje czytnikowi ekranu tresc wykresu. */
function wrap(w, h, title, body) {
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(title)}">`
        + `<title>${esc(title)}</title>${body}</svg>`;
}

/**
 * Poziome slupki — forma dla porownania WIELKOSCI miedzy kategoriami o dlugich
 * nazwach (mapy, czolgi, scenariusze). Pionowe wymusilyby obrocone etykiety.
 */
export function barsH(items, opts = {}) {
    const {
        width = 720, rowH = 26, gap = 7, labelW = 150, valueW = 92,
        color = C.s1, max = null, title = '', colorFn = null, valueFn = null,
    } = opts;
    if (!items.length) return '';

    const plotW = width - labelW - valueW;
    const top = 4;
    const h = top + items.length * (rowH + gap);
    const vmax = max ?? Math.max(...items.map(i => i.value), 1);

    const body = items.map((it, i) => {
        const y = top + i * (rowH + gap);
        // Minimum 2px szerokosci: zero musi byc widoczne jako slad, nie jako nic.
        const w = Math.max(it.value > 0 ? 2 : 0, Math.round(it.value / vmax * plotW));
        const fill = colorFn ? colorFn(it, i) : color;
        const label = valueFn ? valueFn(it) : fmt(it.value);
        return `<text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="lbl">${esc(it.label)}</text>`
            // rx=4: zaokraglony koniec danych, przyklejony do linii bazowej (spec marks)
            + `<rect x="${labelW}" y="${y}" width="${w}" height="${rowH}" rx="4" fill="${fill}"/>`
            + `<text x="${labelW + w + 8}" y="${y + rowH / 2 + 4}" class="val">${esc(label)}</text>`;
    }).join('');

    return wrap(width, h, title || 'Wykres slupkowy', `<line x1="${labelW}" y1="0" x2="${labelW}" y2="${h}" stroke="${C.grid}"/>${body}`);
}

/**
 * Slupki zgrupowane — DWIE serie na tej samej osi (nigdy dwie osie Y).
 * Uzycie: "zagrane vs zapisane w rankingu" — obie w tej samej jednostce (mecze).
 */
export function barsGrouped(items, seriesNames, opts = {}) {
    const { width = 720, rowH = 15, innerGap = 4, groupGap = 16, labelW = 150, valueW = 92, title = '' } = opts;
    if (!items.length) return '';

    const plotW = width - labelW - valueW;
    const groupH = rowH * 2 + innerGap;
    const h = 4 + items.length * (groupH + groupGap);
    const vmax = Math.max(...items.flatMap(i => i.values), 1);
    const colors = [C.s1, C.s2];

    const body = items.map((it, i) => {
        const gy = 4 + i * (groupH + groupGap);
        const rows = it.values.map((v, k) => {
            const y = gy + k * (rowH + innerGap);
            const w = Math.max(v > 0 ? 2 : 0, Math.round(v / vmax * plotW));
            return `<rect x="${labelW}" y="${y}" width="${w}" height="${rowH}" rx="4" fill="${colors[k]}"/>`
                + `<text x="${labelW + w + 8}" y="${y + rowH / 2 + 4}" class="val">${fmt(v)}</text>`;
        }).join('');
        return `<text x="${labelW - 10}" y="${gy + groupH / 2 + 4}" text-anchor="end" class="lbl">${esc(it.label)}</text>${rows}`;
    }).join('');

    const legend = seriesNames.map((n, k) =>
        `<span class="key"><i style="background:${colors[k]}"></i>${esc(n)}</span>`).join('');

    return `<div class="legend">${legend}</div>`
        + wrap(width, h, title || 'Wykres zgrupowany', `<line x1="${labelW}" y1="0" x2="${labelW}" y2="${h}" stroke="${C.grid}"/>${body}`);
}

/**
 * Mediana z rozstepem cwiartkowym — jedna liczba punktowa klamie przy danych
 * z dzikiej gry (patrz metodologia: ten sam czolg daje 22-82 zabicia). Wasy
 * pokazuja, jak szeroki jest rozrzut, wiec czytelnik widzi, czy roznica jest realna.
 */
export function medianRange(items, opts = {}) {
    const {
        width = 720, rowH = 24, gap = 9, labelW = 150, valueW = 118, title = '', unit = '',
        // Formater liczb — raport jest polski, wiec separatorem dziesietnym jest przecinek.
        fmtNum = fmt,
    } = opts;
    if (!items.length) return '';

    const plotW = width - labelW - valueW;
    const h = 8 + items.length * (rowH + gap);
    const vmax = Math.max(...items.map(i => i.p75 ?? i.median ?? 0), 1);
    const x = (v) => labelW + Math.round((v ?? 0) / vmax * plotW);

    const body = items.map((it, i) => {
        const y = 8 + i * (rowH + gap), cy = y + rowH / 2;
        const faint = it.reliable === false ? ' opacity="0.45"' : '';
        return `<text x="${labelW - 10}" y="${cy + 4}" text-anchor="end" class="lbl${it.reliable === false ? ' weak' : ''}">${esc(it.label)}</text>`
            // Pasmo p25-p75
            + `<rect${faint} x="${x(it.p25)}" y="${cy - 5}" width="${Math.max(2, x(it.p75) - x(it.p25))}" height="10" rx="4" fill="${C.s1}" opacity="0.28"/>`
            // Znacznik mediany — 2px obrys w kolorze tla, zeby nie zlewal sie z pasmem
            + `<rect${faint} x="${x(it.median) - 2}" y="${cy - 11}" width="4" height="22" rx="2" fill="${C.s1}" stroke="${C.surface}" stroke-width="2"/>`
            + `<text x="${width - valueW + 8}" y="${cy + 4}" class="val">${fmtNum(it.median)}${unit}`
            + `<tspan class="muted"> (${fmtNum(it.p25)}–${fmtNum(it.p75)})</tspan></text>`;
    }).join('');

    return wrap(width, h, title || 'Mediana z rozstepem', `<line x1="${labelW}" y1="0" x2="${labelW}" y2="${h}" stroke="${C.grid}"/>${body}`);
}

/** Szereg czasowy dzienny jako slupki — jedna seria, wiec bez legendy. */
export function timeBars(items, opts = {}) {
    const { width = 720, height = 150, title = '', color = C.s1, labelEvery = 2 } = opts;
    if (!items.length) return '';

    const padL = 34, padB = 26, padT = 12;
    const plotW = width - padL - 8, plotH = height - padB - padT;
    const vmax = Math.max(...items.map(i => i.value), 1);
    const bw = Math.max(3, Math.floor(plotW / items.length) - 3);

    // Trzy linie siatki: wystarcza do odczytania rzedu wielkosci, nie zaglusza danych.
    const ticks = [0, 0.5, 1].map(f => {
        const y = padT + plotH - f * plotH;
        return `<line x1="${padL}" y1="${y}" x2="${width - 8}" y2="${y}" stroke="${C.grid}"/>`
            + `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="tick">${Math.round(f * vmax)}</text>`;
    }).join('');

    const body = items.map((it, i) => {
        const x = padL + Math.round(i * (plotW / items.length));
        const bh = Math.max(it.value > 0 ? 2 : 0, Math.round(it.value / vmax * plotH));
        const y = padT + plotH - bh;
        const lab = i % labelEvery === 0
            ? `<text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle" class="tick">${esc(it.label)}</text>` : '';
        const top = it.value === vmax
            ? `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="val">${it.value}</text>` : '';
        return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${color}"/>${lab}${top}`;
    }).join('');

    return wrap(width, height, title || 'Szereg czasowy', ticks + body);
}

/** Lejek — kroki uporzadkowane, wiec rampa PORZADKOWA jednego odcienia, nie kategoryczna. */
export function funnel(steps, opts = {}) {
    const { width = 720, rowH = 34, gap = 9, labelW = 210, valueW = 150 } = opts;
    if (!steps.length) return '';

    const plotW = width - labelW - valueW;
    const h = 4 + steps.length * (rowH + gap);
    const base = steps[0].value || 1;

    const body = steps.map((s, i) => {
        const y = 4 + i * (rowH + gap);
        const w = Math.max(s.value > 0 ? 2 : 0, Math.round(s.value / base * plotW));
        const share = Math.round(s.value / base * 100);
        const drop = i > 0 && steps[i - 1].value
            ? Math.round((steps[i - 1].value - s.value) / steps[i - 1].value * 100) : null;
        return `<text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="lbl">${esc(s.label)}</text>`
            + `<rect x="${labelW}" y="${y}" width="${w}" height="${rowH}" rx="4" fill="${C.ramp[Math.min(i, C.ramp.length - 1)]}"/>`
            + `<text x="${labelW + w + 10}" y="${y + rowH / 2 + 4}" class="val"><tspan class="big">${s.value}</tspan>`
            + `<tspan class="muted"> · ${share}% bazy${drop !== null ? ` · −${drop}%` : ''}</tspan></text>`;
    }).join('');

    return wrap(width, h, 'Lejek', body);
}
