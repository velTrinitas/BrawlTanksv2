/**
 * flagArt.ts — PROFILE-1 (v0.118.0). DOKLADNY art 18 flag dla UI profilu.
 *
 * Programmatic mini-SVG per id (Constitution §10: inline kod = programmatic art,
 * zero external assets; bundle cost ~4KB). Uzywane w DOM przez data-URI <img>.
 * Flaga NA CZOLGU (PIXI) dalej idzie z FlagRenderer + pattern-aproksymacji
 * w config/flags.ts — tam paski wystarczaja (mala flaga), tu musi byc
 * ROZPOZNAWALNIE (Czytelnosc: 9-latek ma poznac kraj po fladze bez podpisu).
 *
 * viewBox 60x40 (3:2). Kolory oficjalne-przyblizone.
 */
import type { TranslationKey } from '../i18n/i18n';
import { i18n, t } from '../i18n/i18n';
import { FLAG_IDS } from '../config/flags';
import type { FlagId } from '../types/Profile';

/** Literalowe klucze nazw krajow (aria-label + sortowanie alfabetyczne per jezyk). */
export const FLAG_NAME_KEY: Record<FlagId, TranslationKey> = {
    ar: 'profile.flag.ar',
    br: 'profile.flag.br',
    ca: 'profile.flag.ca',
    de: 'profile.flag.de',
    es: 'profile.flag.es',
    fr: 'profile.flag.fr',
    gb: 'profile.flag.gb',
    il: 'profile.flag.il',
    it: 'profile.flag.it',
    jp: 'profile.flag.jp',
    kr: 'profile.flag.kr',
    nl: 'profile.flag.nl',
    pl: 'profile.flag.pl',
    pt: 'profile.flag.pt',
    se: 'profile.flag.se',
    tr: 'profile.flag.tr',
    ua: 'profile.flag.ua',
    us: 'profile.flag.us',
};

/**
 * Flagi w kolejnosci alfabetycznej wg nazwy kraju W BIEZACYM JEZYKU gry
 * (decyzja Mariusza: EN => Argentina..USA, PL => Argentyna..Wlochy).
 */
export function sortedFlagIds(): FlagId[] {
    const lang = i18n.getLanguage();
    return [...FLAG_IDS].sort((a, b) =>
        t(FLAG_NAME_KEY[a]).localeCompare(t(FLAG_NAME_KEY[b]), lang));
}

// ── SVG builders ────────────────────────────────────────────────────────────

const H2 = (top: string, bottom: string) =>
    `<rect width="60" height="40" fill="${top}"/><rect y="20" width="60" height="20" fill="${bottom}"/>`;
const H3 = (a: string, b: string, c: string) =>
    `<rect width="60" height="40" fill="${a}"/><rect y="13.33" width="60" height="13.34" fill="${b}"/><rect y="26.67" width="60" height="13.33" fill="${c}"/>`;
const V3 = (a: string, b: string, c: string) =>
    `<rect width="60" height="40" fill="${a}"/><rect x="20" width="20" height="40" fill="${b}"/><rect x="40" width="20" height="40" fill="${c}"/>`;

/** Gwiazda 5-ramienna (polygon points) wokol (cx,cy). */
function star(cx: number, cy: number, rOut: number, rIn: number, fill: string): string {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rOut : rIn;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

/** Grupa 3 kresek trygramu (flaga Korei), obrocona wokol srodka grupy. */
function trigram(cx: number, cy: number, deg: number): string {
    const bars = [-3, 0, 3].map(dy =>
        `<rect x="${cx - 4}" y="${cy + dy - 0.9}" width="8" height="1.8" fill="#000"/>`).join('');
    return `<g transform="rotate(${deg} ${cx} ${cy})">${bars}</g>`;
}

const FLAG_SHAPES: Record<FlagId, string> = {
    ar: H3('#74ACDF', '#FFFFFF', '#74ACDF') + `<circle cx="30" cy="20" r="4.2" fill="#F6B40E"/>`,
    br: `<rect width="60" height="40" fill="#009C3B"/>` +
        `<polygon points="30,4 55,20 30,36 5,20" fill="#FFDF00"/>` +
        `<circle cx="30" cy="20" r="7.5" fill="#002776"/>` +
        `<path d="M23 22 A14 14 0 0 1 37 19" stroke="#FFFFFF" stroke-width="1.6" fill="none"/>`,
    ca: `<rect width="60" height="40" fill="#FFFFFF"/>` +
        `<rect width="15" height="40" fill="#FF0000"/><rect x="45" width="15" height="40" fill="#FF0000"/>` +
        `<path d="M30 8 L32.5 13.5 L37.5 11.5 L36 17.5 L41.5 17.5 L37 22.5 L39.5 28.5 L32.5 26.5 L31.8 33 L28.2 33 L27.5 26.5 L20.5 28.5 L23 22.5 L18.5 17.5 L24 17.5 L22.5 11.5 L27.5 13.5 Z" fill="#FF0000"/>`,
    de: H3('#000000', '#DD0000', '#FFCE00'),
    es: `<rect width="60" height="40" fill="#F1BF00"/>` +
        `<rect width="60" height="10" fill="#AA151B"/><rect y="30" width="60" height="10" fill="#AA151B"/>`,
    fr: V3('#002395', '#FFFFFF', '#ED2939'),
    gb: `<rect width="60" height="40" fill="#012169"/>` +
        `<path d="M0 0 L60 40 M60 0 L0 40" stroke="#FFFFFF" stroke-width="8"/>` +
        `<path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102F" stroke-width="3"/>` +
        `<rect x="24" width="12" height="40" fill="#FFFFFF"/><rect y="14" width="60" height="12" fill="#FFFFFF"/>` +
        `<rect x="26.5" width="7" height="40" fill="#C8102F"/><rect y="16.5" width="60" height="7" fill="#C8102F"/>`,
    il: `<rect width="60" height="40" fill="#FFFFFF"/>` +
        `<rect y="4" width="60" height="5" fill="#0038B8"/><rect y="31" width="60" height="5" fill="#0038B8"/>` +
        `<polygon points="30,11.5 37.5,24.5 22.5,24.5" fill="none" stroke="#0038B8" stroke-width="1.8"/>` +
        `<polygon points="30,28.5 22.5,15.5 37.5,15.5" fill="none" stroke="#0038B8" stroke-width="1.8"/>`,
    it: V3('#009246', '#FFFFFF', '#CE2B37'),
    jp: `<rect width="60" height="40" fill="#FFFFFF"/><circle cx="30" cy="20" r="9" fill="#BC002D"/>`,
    kr: `<rect width="60" height="40" fill="#FFFFFF"/>` +
        `<path d="M22 20 A8 8 0 0 1 38 20 Z" fill="#CD2E3A"/>` +
        `<path d="M22 20 A8 8 0 0 0 38 20 Z" fill="#0047A0"/>` +
        trigram(9, 9, -34) + trigram(51, 9, 34) + trigram(9, 31, 34) + trigram(51, 31, -34),
    nl: H3('#AE1C28', '#FFFFFF', '#21468B'),
    pl: H2('#FFFFFF', '#DC143C'),
    pt: `<rect width="60" height="40" fill="#DA291C"/><rect width="24" height="40" fill="#046A38"/>` +
        `<circle cx="24" cy="20" r="6" fill="none" stroke="#FFE900" stroke-width="2.4"/>`,
    se: `<rect width="60" height="40" fill="#006AA7"/>` +
        `<rect x="17" width="8" height="40" fill="#FECC02"/><rect y="16" width="60" height="8" fill="#FECC02"/>`,
    tr: `<rect width="60" height="40" fill="#E30A17"/>` +
        `<circle cx="24" cy="20" r="8" fill="#FFFFFF"/><circle cx="26.5" cy="20" r="6.4" fill="#E30A17"/>` +
        star(37, 20, 4.4, 1.8, '#FFFFFF'),
    ua: H2('#005BBB', '#FFD500'),
    us: (() => {
        const stripeH = 40 / 13;
        let s = `<rect width="60" height="40" fill="#FFFFFF"/>`;
        for (let i = 0; i < 13; i += 2) {
            s += `<rect y="${(i * stripeH).toFixed(2)}" width="60" height="${stripeH.toFixed(2)}" fill="#B22234"/>`;
        }
        s += `<rect width="26" height="${(7 * stripeH).toFixed(2)}" fill="#3C3B6E"/>`;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 5; c++) {
                s += `<circle cx="${(3 + c * 5).toFixed(1)}" cy="${(2.7 + r * 5.3).toFixed(1)}" r="1" fill="#FFFFFF"/>`;
            }
        }
        return s;
    })(),
};

/** data-URI SVG flagi (crisp w kazdym rozmiarze, zero requestow). */
export function flagImgSrc(id: FlagId): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">${FLAG_SHAPES[id]}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Gotowy <img> flagi (alt = nazwa kraju w biezacym jezyku). */
export function flagImgHtml(id: FlagId, cls: string): string {
    return `<img class="${cls}" src="${flagImgSrc(id)}" alt="${t(FLAG_NAME_KEY[id])}" draggable="false">`;
}
