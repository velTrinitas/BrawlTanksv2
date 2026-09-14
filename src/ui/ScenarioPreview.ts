/**
 * ScenarioPreview.ts — programmatic SVG IKONY SCENARIUSZY (hub: karty "Wybierz scenariusz").
 *
 * v0.177.0 — nowa RODZINA 4 ikon wg briefu art directora Mariusza (2026-09-14, tryb B = art
 * programistyczny, Konstytucja §10): cel-shading 2-3 stopnie, grube ciemne kontury, speculary,
 * rim light, winieta, niska heroiczna kamera, JEDEN dominujacy subject na ~75% kadru, tlo
 * tematyczne lekko zmiekczone. Kadr: media karty to kwadrat 92 px => viewBox 140x140 (slice),
 * zero tekstu/UI (etykiety naklada gra). Animacja = warstwa CSS (menu-styles.css, .bt-sp-icon):
 * oddech subjectu (.sc-hero), shimmer (.sc-shimmer), 3-5 czastek tematycznych (.sc-p),
 * prefers-reduced-motion respektowane. Zero assetow, zero wagi bundla.
 *
 * Wzorzec: MapPreview.ts (inline SVG string, klasy dla CSS). Renderowane do .cd-media (BattleSection).
 */

export type ScenarioPreviewId = 'ktb' | 'ctf' | 'castle' | 'save_queen';

const RENDERERS: Record<ScenarioPreviewId, () => string> = {
    ktb: renderKTB,
    ctf: renderCTF,
    castle: renderCastle,
    save_queen: renderQueen,
};

export function renderScenarioPreview(id: ScenarioPreviewId): string {
    const renderer = RENDERERS[id];
    return renderer ? renderer() : '';
}

// ── wspolne klocki rodziny ────────────────────────────────────────────────
const INK = '#1a1024';          // kontur (ciemny fiolet-czern; cieplejszy niz czysta czern)
const SW = 3;                   // grubosc konturu subjectu

function open(cls: string): string {
    return `<svg viewBox="0 0 140 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-scenario-preview-svg bt-sp-icon ${cls}" aria-hidden="true">`;
}

/** Winieta (radialna, wspolna) + shimmer (ukosny pas swiatla, animowany w CSS) — na koncu kazdej karty. */
function finish(id: string, shimmerOpacity = 0.22): string {
    return `
  <defs>
    <radialGradient id="${id}-vig" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="70%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="${id}-shim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fff" stop-opacity="${shimmerOpacity}"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="sc-shimmer"><rect x="-30" y="-20" width="38" height="200" fill="url(#${id}-shim)" transform="skewX(-22)"/></g>
  <rect width="140" height="140" fill="url(#${id}-vig)"/>
</svg>`;
}

/** Czastki tematyczne (3-5 kolek), unosza sie i gasna (CSS bt-sc-float). */
function particles(color: string, pts: [number, number, number][]): string {
    return pts.map(([x, y, r], i) => `<circle class="sc-p sc-p${i + 1}" cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`).join('\n  ');
}

/**
 * Czolg w ujeciu 3/4 z lekkiego dolu (heroiczna kamera): gasienice, kadlub, wieza, lufa.
 * base/top/dark = 3 stopnie cel; lufa w kierunku dir (-1 = w lewo-dol, 1 = w prawo-dol).
 */
function tank(x: number, y: number, s: number, base: string, top: string, dark: string, dir: 1 | -1, extra = ''): string {
    const g = (v: number): number => v * s;
    return `
  <g transform="translate(${x} ${y})">
    <!-- cien -->
    <ellipse cx="${g(2)}" cy="${g(30)}" rx="${g(40)}" ry="${g(9)}" fill="${INK}" opacity="0.35"/>
    <!-- gasienice -->
    <rect x="${g(-38)}" y="${g(10)}" width="${g(76)}" height="${g(18)}" rx="${g(8)}" fill="#2a2333" stroke="${INK}" stroke-width="${SW}"/>
    <g fill="#4a4258">${[-30, -18, -6, 6, 18].map(k => `<rect x="${g(k)}" y="${g(13)}" width="${g(7)}" height="${g(12)}" rx="${g(2)}"/>`).join('')}</g>
    <!-- kadlub -->
    <rect x="${g(-34)}" y="${g(-8)}" width="${g(68)}" height="${g(24)}" rx="${g(7)}" fill="${base}" stroke="${INK}" stroke-width="${SW}"/>
    <rect x="${g(-31)}" y="${g(-6)}" width="${g(62)}" height="${g(9)}" rx="${g(4)}" fill="${top}"/>
    <rect x="${g(-31)}" y="${g(8)}" width="${g(62)}" height="${g(6)}" rx="${g(3)}" fill="${dark}"/>
    <!-- lufa -->
    <g transform="rotate(${dir * 18})">
      <rect x="${dir === 1 ? g(6) : g(-56)}" y="${g(-15)}" width="${g(50)}" height="${g(10)}" rx="${g(4)}" fill="${dark}" stroke="${INK}" stroke-width="${SW}"/>
      <rect x="${dir === 1 ? g(8) : g(-54)}" y="${g(-14)}" width="${g(46)}" height="${g(3)}" rx="${g(1.5)}" fill="${top}" opacity="0.8"/>
      <rect x="${dir === 1 ? g(46) : g(-60)}" y="${g(-17)}" width="${g(12)}" height="${g(14)}" rx="${g(3)}" fill="${base}" stroke="${INK}" stroke-width="${SW}"/>
    </g>
    <!-- wieza -->
    <circle cx="0" cy="${g(-10)}" r="${g(17)}" fill="${base}" stroke="${INK}" stroke-width="${SW}"/>
    <circle cx="${g(-4)}" cy="${g(-14)}" r="${g(11)}" fill="${top}"/>
    <circle cx="${g(-7)}" cy="${g(-17)}" r="${g(4)}" fill="#fff" opacity="0.85"/>
    <path d="M ${g(-12)} ${g(-2)} Q 0 ${g(6)} ${g(12)} ${g(-2)}" fill="none" stroke="${dark}" stroke-width="${g(3)}" stroke-linecap="round"/>
    <!-- rim light (gorna-lewa krawedz) -->
    <path d="M ${g(-32)} ${g(-6)} L ${g(20)} ${g(-6)}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="${g(2)}" stroke-linecap="round"/>
    ${extra}
  </g>`;
}

// ============================================================
// 1. UBIJ BOSSA — pustynia o zachodzie, zlowrogi BOSS TANK (fiolet, korona z kolcami, czaszka)
// ============================================================
function renderKTB(): string {
    return `${open('bt-sp-ktb')}
  <defs>
    <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5a1a3a"/>
      <stop offset="45%" stop-color="#d9532b"/>
      <stop offset="75%" stop-color="#ffa62b"/>
      <stop offset="100%" stop-color="#ffd27a"/>
    </linearGradient>
    <radialGradient id="sk-sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff2b0"/>
      <stop offset="60%" stop-color="#ffb347"/>
      <stop offset="100%" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sk-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c850ff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#c850ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="140" height="140" fill="url(#sk-sky)"/>
  <circle cx="70" cy="62" r="34" fill="url(#sk-sun)"/>
  <!-- wydmy (zmiekczone plany) -->
  <path d="M -10 96 Q 30 78 70 92 Q 110 104 150 86 L 150 140 L -10 140 Z" fill="#8a3b2a" opacity="0.75"/>
  <path d="M -10 112 Q 40 98 80 110 Q 120 120 150 108 L 150 140 L -10 140 Z" fill="#5c2620"/>
  <!-- zar (czastki) -->
  ${particles('#ffb347', [[30, 118, 2.2], [104, 124, 1.8], [58, 128, 1.6], [118, 112, 2.4]])}
  <!-- BOSS -->
  <g class="sc-hero">
    <circle cx="70" cy="70" r="46" fill="url(#sk-glow)" opacity="0.55"/>
    ${tank(70, 78, 1.15, '#5b2a8a', '#8e44ad', '#341552', -1, `
      <!-- korona z kolcami -->
      <path d="M -16 -32 L -11 -18 L -6 -30 L 0 -18 L 6 -30 L 11 -18 L 16 -32 L 16 -22 L -16 -22 Z" fill="#2a1240" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
      <path d="M -13 -22 L 13 -22" stroke="#c850ff" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="0" cy="-28" r="2.6" fill="#ffd54a"/><circle cx="-1" cy="-29" r="1" fill="#fff"/>
      <!-- czaszka-emblemat -->
      <g transform="translate(20 2)">
        <ellipse cx="0" cy="0" rx="7" ry="6.5" fill="#f2ecf5" stroke="${INK}" stroke-width="2"/>
        <circle cx="-2.6" cy="-0.5" r="1.8" fill="${INK}"/><circle cx="2.6" cy="-0.5" r="1.8" fill="${INK}"/>
        <rect x="-3" y="3.5" width="6" height="3" fill="${INK}"/>
      </g>
      <!-- swiecace akcenty -->
      <rect x="-30" y="11" width="60" height="2.5" rx="1.2" fill="#c850ff" opacity="0.9"/>
      <circle cx="-24" cy="-2" r="2.2" fill="#e39bff"/><circle cx="26" cy="-2" r="2.2" fill="#e39bff"/>
    `)}
  </g>
  ${finish('sk')}`;
}

// ============================================================
// 2. ZABIERZ FLAGE — ruiny fortecy o swicie, czolg-bohater z WIELKA czerwona flaga
// ============================================================
function renderCTF(): string {
    return `${open('bt-sp-ctf')}
  <defs>
    <linearGradient id="sf-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f7a8c"/>
      <stop offset="55%" stop-color="#5fc3c9"/>
      <stop offset="100%" stop-color="#ffe0a8"/>
    </linearGradient>
    <linearGradient id="sf-flag" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff6b3d"/>
      <stop offset="100%" stop-color="#d81e2c"/>
    </linearGradient>
  </defs>
  <rect width="140" height="140" fill="url(#sf-sky)"/>
  <!-- ruiny (zmiekczone): kolumny + luk -->
  <g fill="#c99a5e" stroke="#7a5424" stroke-width="2" opacity="0.9">
    <rect x="8" y="46" width="14" height="60" rx="2"/><rect x="4" y="42" width="22" height="7" rx="2"/>
    <rect x="116" y="56" width="14" height="50" rx="2"/><rect x="112" y="52" width="22" height="7" rx="2"/>
    <path d="M 22 60 Q 70 18 118 60 L 118 70 Q 70 30 22 70 Z"/>
    <rect x="40" y="86" width="26" height="14" rx="2"/><rect x="86" y="80" width="20" height="20" rx="2"/>
  </g>
  <path d="M -10 104 Q 40 96 80 102 Q 120 108 150 100 L 150 140 L -10 140 Z" fill="#d8b070"/>
  <path d="M -10 116 Q 60 108 150 114 L 150 140 L -10 140 Z" fill="#b8884a"/>
  <!-- pyl -->
  ${particles('#fff1c8', [[24, 122, 2], [110, 126, 1.8], [64, 130, 1.5], [128, 118, 1.6], [44, 126, 1.4]])}
  <g class="sc-hero">
    <!-- maszt + FLAGA (gwiazda ikony) -->
    <rect x="90" y="18" width="4" height="70" rx="2" fill="#3a2a1a" stroke="${INK}" stroke-width="2"/>
    <circle cx="92" cy="17" r="4" fill="#ffd54a" stroke="${INK}" stroke-width="2"/>
    <path d="M 94 22 Q 118 14 138 26 Q 122 34 138 46 Q 116 38 94 50 Z" fill="url(#sf-flag)" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
    <path d="M 96 26 Q 114 20 130 28" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M 100 44 Q 116 36 132 42" fill="none" stroke="#8a0f1a" stroke-opacity="0.6" stroke-width="2.5" stroke-linecap="round"/>
    ${tank(62, 92, 1.0, '#2e7db3', '#5fb4e8', '#1b4f7a', 1, `<rect x="-14" y="-4" width="28" height="4" rx="2" fill="#ffd54a"/>`)}
  </g>
  ${finish('sf', 0.26)}`;
}

// ============================================================
// 3. OBRON ZAMEK — zielona dolina, zabawkowy ZAMEK z choragwiami + straznik przy bramie
// ============================================================
function renderCastle(): string {
    return `${open('bt-sp-castle')}
  <defs>
    <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3f8fd8"/>
      <stop offset="60%" stop-color="#9fd6f2"/>
      <stop offset="100%" stop-color="#dff3fb"/>
    </linearGradient>
    <linearGradient id="sc-stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9ccd6"/>
      <stop offset="100%" stop-color="#8d92a3"/>
    </linearGradient>
  </defs>
  <rect width="140" height="140" fill="url(#sc-sky)"/>
  <g fill="#fff" opacity="0.9"><ellipse cx="26" cy="26" rx="16" ry="6"/><ellipse cx="34" cy="22" rx="10" ry="5"/><ellipse cx="116" cy="34" rx="14" ry="5"/></g>
  <!-- wzgorza -->
  <path d="M -10 96 Q 40 80 80 92 Q 120 102 150 88 L 150 140 L -10 140 Z" fill="#7cc56a"/>
  <path d="M -10 112 Q 50 100 100 110 Q 130 116 150 108 L 150 140 L -10 140 Z" fill="#4f9f4a"/>
  <!-- najezdzcy na krawedziach (sylwetki) -->
  <g fill="#2a2333" opacity="0.35"><rect x="2" y="96" width="14" height="7" rx="2"/><rect x="5" y="92" width="6" height="5" rx="1"/><rect x="124" y="100" width="14" height="7" rx="2"/><rect x="128" y="96" width="6" height="5" rx="1"/></g>
  <!-- pylek + listki -->
  ${particles('#e9ffb0', [[20, 120, 1.8], [118, 126, 1.6], [52, 132, 1.4], [98, 128, 1.9], [136, 118, 1.5]])}
  <g class="sc-hero">
    <!-- ZAMEK -->
    <g stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round">
      <rect x="34" y="52" width="72" height="44" rx="4" fill="url(#sc-stone)"/>
      <rect x="26" y="36" width="20" height="60" rx="3" fill="url(#sc-stone)"/>
      <rect x="94" y="36" width="20" height="60" rx="3" fill="url(#sc-stone)"/>
      <rect x="58" y="40" width="24" height="56" rx="3" fill="url(#sc-stone)"/>
      <!-- dachy wiez (stozki) -->
      <path d="M 24 38 L 36 20 L 48 38 Z" fill="#3f6fd8"/>
      <path d="M 92 38 L 104 20 L 116 38 Z" fill="#3f6fd8"/>
      <path d="M 56 42 L 70 24 L 84 42 Z" fill="#e0b53c"/>
      <!-- brama -->
      <path d="M 60 96 L 60 78 Q 70 68 80 78 L 80 96 Z" fill="#4a3320"/>
    </g>
    <!-- blanki (bez konturu, jasne) -->
    <g fill="#e6e8ee">${[36, 44, 96, 104].map(x => `<rect x="${x - 3}" y="47" width="6" height="6" rx="1"/>`).join('')}${[60, 70, 80].map(x => `<rect x="${x - 3}" y="52" width="6" height="6" rx="1"/>`).join('')}</g>
    <!-- krata bramy + choragwie -->
    <g stroke="#1f2226" stroke-width="1.5">${[64, 70, 76].map(x => `<line x1="${x}" y1="76" x2="${x}" y2="96"/>`).join('')}</g>
    <g stroke="${INK}" stroke-width="2" stroke-linejoin="round">
      <path d="M 36 20 L 36 10 L 48 14 L 36 18 Z" fill="#ffd54a"/>
      <path d="M 104 20 L 104 10 L 116 14 L 104 18 Z" fill="#ffd54a"/>
      <path d="M 70 24 L 70 12 L 84 17 L 70 22 Z" fill="#3f6fd8"/>
    </g>
    <!-- speculary kamienia -->
    <g fill="#fff" opacity="0.5"><rect x="28" y="38" width="4" height="40" rx="2"/><rect x="96" y="38" width="4" height="40" rx="2"/><rect x="60" y="42" width="4" height="30" rx="2"/></g>
    <!-- straznik przy bramie -->
    ${tank(70, 112, 0.62, '#2f8f4a', '#6fd48a', '#1c5a2e', 1)}
  </g>
  ${finish('sc', 0.2)}`;
}

// ============================================================
// 4. URATUJ KROLOWA — lochy, Krolowa za pekniętymi kratami, czolg przebija mur (zlota poswiata)
// ============================================================
function renderQueen(): string {
    return `${open('bt-sp-queen')}
  <defs>
    <linearGradient id="sq-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#151020"/>
      <stop offset="100%" stop-color="#2b2438"/>
    </linearGradient>
    <radialGradient id="sq-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd54a" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#ff9f1a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ff9f1a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="140" height="140" fill="url(#sq-bg)"/>
  <!-- bloki kamienne sciany (zmiekczone) -->
  <g fill="#3a3149" stroke="#1e1729" stroke-width="1.5" opacity="0.9">
    ${[0, 22, 44, 66, 88, 110].map((y, r) => [-10, 20, 50, 80, 110].map(x => `<rect x="${x + (r % 2 ? 15 : 0)}" y="${y}" width="28" height="20" rx="2"/>`).join('')).join('')}
  </g>
  <!-- zlota poswiata z wyrwy -->
  <circle cx="62" cy="86" r="58" fill="url(#sq-glow)"/>
  <!-- iskry alarmowe (czerwone) + pyl zlota -->
  ${particles('#ff3b3b', [[34, 70, 1.8], [96, 60, 1.6], [50, 52, 1.4]])}
  <g class="sc-hero">
    <!-- cela: pekniete kraty + KROLOWA -->
    <rect x="76" y="30" width="52" height="66" rx="5" fill="#0f0a16" stroke="${INK}" stroke-width="${SW}"/>
    <g transform="translate(102 66)">
      <!-- suknia perlowa + peleryna -->
      <path d="M -13 -4 Q -18 20 -15 26 L 15 26 Q 18 20 13 -4 Z" fill="#8e44ad" stroke="${INK}" stroke-width="2.5"/>
      <path d="M -9 -4 Q -12 18 -10 26 L 10 26 Q 12 18 9 -4 Z" fill="#f2ecf5"/>
      <rect x="-9" y="2" width="18" height="4" fill="#c2247a"/>
      <!-- glowa + wlosy + tiara zlota -->
      <circle cx="0" cy="-12" r="9" fill="#f3d9c6" stroke="${INK}" stroke-width="2.5"/>
      <path d="M -9 -14 Q 0 -26 9 -14" fill="#4a2c22"/>
      <path d="M -8 -20 L -5 -27 L -2 -22 L 0 -29 L 2 -22 L 5 -27 L 8 -20 Z" fill="#ffd54a" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="0" cy="-24" r="1.6" fill="#ff5fb0"/>
      <circle cx="-3" cy="-12" r="1.2" fill="${INK}"/><circle cx="3" cy="-12" r="1.2" fill="${INK}"/>
      <path d="M -3 -8 Q 0 -6 3 -8" fill="none" stroke="#c2247a" stroke-width="1.2"/>
    </g>
    <!-- kraty (jedna pekniętą) -->
    <g stroke="#7a8190" stroke-width="4" stroke-linecap="round">
      <line x1="86" y1="32" x2="86" y2="94"/><line x1="98" y1="32" x2="98" y2="94"/>
      <line x1="110" y1="32" x2="110" y2="60"/><line x1="112" y1="70" x2="110" y2="94"/>
      <line x1="122" y1="32" x2="122" y2="94"/>
    </g>
    <g stroke="#c4cad6" stroke-width="1.5" stroke-linecap="round" opacity="0.8"><line x1="85" y1="34" x2="85" y2="60"/><line x1="121" y1="34" x2="121" y2="56"/></g>
    <!-- wyrwa w murze (ciemny otwor + zlote swiatlo) -->
    <path d="M 22 66 L 40 58 L 58 62 L 66 78 L 60 98 L 42 106 L 24 100 L 16 84 Z" fill="#ffd54a" opacity="0.9"/>
    <path d="M 26 68 L 40 62 L 56 66 L 62 78 L 58 96 L 42 102 L 26 98 L 20 84 Z" fill="#fff3b8"/>
    <!-- odlamki cegiel -->
    <g fill="#a84a3b" stroke="${INK}" stroke-width="1.5"><rect x="58" y="54" width="9" height="7" rx="1" transform="rotate(20 62 57)"/><rect x="66" y="96" width="10" height="7" rx="1" transform="rotate(-25 71 99)"/><rect x="14" y="60" width="8" height="6" rx="1" transform="rotate(15 18 63)"/></g>
    <!-- CZOLG-bohater przebija sie (z dolu-lewo, lufa ku celi) -->
    ${tank(42, 96, 0.92, '#d9532b', '#ffb347', '#8a1e0a', 1, `<rect x="-14" y="-4" width="28" height="4" rx="2" fill="#ffd54a"/>`)}
  </g>
  ${finish('sq', 0.18)}`;
}
