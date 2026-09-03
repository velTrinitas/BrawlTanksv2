/**
 * statArt.ts — ikony kafli STATYSTYK i REKORDOW na stronie PROFILU (v0.145.0).
 *
 * PO CO. Do v0.144.0 kafle mialy emoji nad mala liczba (`.bt-hub0-stat .i`,
 * font-size 20px). Makieta Mariusza pokazala duza ilustracje po lewej + powiekszona,
 * kolorowa liczbe po prawej. Emoji tego nie udzwignie: jest systemowe (inny ksztalt
 * na kazdym urzadzeniu), nie da sie go pokolorowac ani powiekszyc bez rozmycia.
 *
 * DLACZEGO INLINE SVG, A NIE PIXI. Art Dir rekomendowal `PIXI.Graphics` +
 * `RenderTexture`, ale to rada dla warstwy SILNIKA. Strona profilu jest w 100% DOM-owa
 * (`ProfileSpriteCache` ma zero konsumentow w `src/ui/hub/`, hub nie montuje canvasu),
 * wiec wdrozenie tamtej rady oznaczaloby DOLOZENIE Pixi tam, gdzie go nie ma. Jego
 * intencje przetlumaczone na nasza warstwe:
 *   - watermark z alpha 0.1-0.15   -> grupa `.sa-wm` z `opacity`
 *   - "zamrozone" czasteczki       -> statyczne elementy SVG (przegladarka rasteryzuje raz)
 *   - wypieczony cien wewnetrzny   -> `box-shadow: inset` w CSS (tansze niz filtr GPU)
 *   - gradienty radialne w teksturze -> `<radialGradient>` w `<defs>`
 *
 * WZORZEC: `src/ui/MapPreview.ts` — czysta funkcja `(): string` zwracajaca kompletny
 * SVG, wstrzykiwana przez `innerHTML`, stylowana i animowana wylacznie CSS-em.
 *
 * CZEGO TU NIE MA: sigmy i gema. Te dwa maja kanoniczny art gry (`assets/sigma.png`,
 * `assets/gem.png`) i musza wygladac DOKLADNIE tak, jak przedmiot, ktory gracz zbiera
 * na mapie — decyzja z v0.128.0, kiedy emoji 💎 zostalo wymienione na prawdziwego gema
 * wlasnie dlatego, ze pokazywalo inny ksztalt. Nie podmieniam ich na wlasne rysunki.
 *
 * Kazda ikona: viewBox 0 0 64 64, bez tekstu, `aria-hidden` nadaje kontener w kaflu.
 */

export type StatArtId =
    | 'trophy'      // Przeglad: TROFEA
    | 'games'       // Przeglad: ROZEGRANE GRY
    | 'milestone'   // Przeglad: KAMIENIE MILOWE
    | 'skull'       // Przeglad + Rekordy: POKONANI WROGOWIE
    | 'clock'       // Przeglad + Rekordy: CZAS / NAJDLUZSZY MECZ
    | 'target'      // Przeglad + Rekordy: CELNOSC
    | 'rank'        // Przeglad: MIEJSCE W RANKINGU
    | 'best'        // Rekordy: NAJLEPSZY WYNIK
    | 'flame';      // Rekordy: NAJWYZSZE COMBO

/**
 * Kolor akcentu kafla — ten sam odcien dostaje liczba i poswiata pod ikona, zeby kafel
 * czytal sie jako jedna calosc (makieta: puchar zloty, czaszka czerwona, gem zielony,
 * zegar fioletowy, radar bialy, plomien pomaranczowy).
 */
export const STAT_ACCENT: Record<StatArtId, string> = {
    trophy:    '#f1c40f',
    games:     '#5dade2',
    milestone: '#ffd75e',
    skull:     '#e8604c',
    clock:     '#b07ef7',
    target:    '#d7dfe5',
    rank:      '#e0a92c',
    best:      '#f1c40f',
    flame:     '#e8863a',
};

const wrap = (id: StatArtId, body: string): string => `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="sa-svg sa-${id}" aria-hidden="true">${body}</svg>`.trim();

// ── TROFEA — puchar z uchwytami, gwiazda i iskrami ──────────────────────────
function renderTrophy(): string {
    return wrap('trophy', `
  <defs>
    <linearGradient id="sa-tr-cup" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe89a"/><stop offset="45%" stop-color="#f1c40f"/><stop offset="100%" stop-color="#a97a08"/>
    </linearGradient>
  </defs>
  <g class="sa-wm">
    <path d="M14,12 h36 v13 a18,20 0 0 1 -36,0 Z" fill="url(#sa-tr-cup)"/>
    <path d="M14,12 h9 v13 a18,20 0 0 0 5,13 a18,20 0 0 1 -14,-13 Z" fill="#fff3c4" opacity="0.55"/>
    <path d="M14,15 h-5 a7,7 0 0 0 7,10" fill="none" stroke="#d9a80c" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M50,15 h5 a7,7 0 0 1 -7,10" fill="none" stroke="#d9a80c" stroke-width="3.4" stroke-linecap="round"/>
    <rect x="29" y="42" width="6" height="8" fill="#c9930c"/>
    <path d="M20,50 h24 l3,6 h-30 Z" fill="#e0a92c"/>
    <rect x="15" y="56" width="34" height="4" rx="2" fill="#c9930c"/>
    <path d="M32,19 l2.4,5 5.5,0.8 -4,3.8 1,5.4 -4.9,-2.6 -4.9,2.6 1,-5.4 -4,-3.8 5.5,-0.8 Z" fill="#fff8dc" opacity="0.9"/>
  </g>
  <g fill="#fff3c4" class="sa-spark">
    <circle cx="52" cy="10" r="2.1"/><circle cx="10" cy="30" r="1.5"/><circle cx="55" cy="36" r="1.2"/>
  </g>`);
}

// ── NAJLEPSZY WYNIK — medal z jedynka na wstedze ────────────────────────────
function renderBest(): string {
    return wrap('best', `
  <defs>
    <linearGradient id="sa-be-m" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#ffe89a"/><stop offset="50%" stop-color="#f1c40f"/><stop offset="100%" stop-color="#9c700a"/>
    </linearGradient>
  </defs>
  <g class="sa-wm">
    <path d="M20,6 l8,20 -8,4 -6,-18 Z" fill="#c0392b"/>
    <path d="M44,6 l-8,20 8,4 6,-18 Z" fill="#e74c3c"/>
    <circle cx="32" cy="40" r="17" fill="url(#sa-be-m)"/>
    <circle cx="32" cy="40" r="12.5" fill="none" stroke="#a97a08" stroke-width="1.6" opacity="0.8"/>
    <path d="M28,33 l5,-2 v20 h-4 v-15 l-3,1 Z" fill="#fff8dc"/>
    <path d="M22,29 a13,13 0 0 1 9,-4" fill="none" stroke="#fff8dc" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>
  </g>
  <g fill="#fff3c4" class="sa-spark">
    <circle cx="52" cy="26" r="1.9"/><circle cx="12" cy="46" r="1.4"/>
  </g>`);
}

// ── POKONANI WROGOWIE — czaszka z zarem ─────────────────────────────────────
function renderSkull(): string {
    return wrap('skull', `
  <defs>
    <radialGradient id="sa-sk-glow" cx="0.5" cy="0.55" r="0.5">
      <stop offset="0%" stop-color="#ff8a5c" stop-opacity="0.65"/><stop offset="100%" stop-color="#ff8a5c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="34" r="24" fill="url(#sa-sk-glow)"/>
  <g class="sa-wm">
    <path d="M32,8 a20,20 0 0 1 20,20 v6 a10,10 0 0 1 -6,9 v6 a4,4 0 0 1 -4,4 h-20 a4,4 0 0 1 -4,-4 v-6 a10,10 0 0 1 -6,-9 v-6 a20,20 0 0 1 20,-20 Z" fill="#e8e2d6"/>
    <path d="M32,8 a20,20 0 0 0 -20,20 v6 a10,10 0 0 0 6,9 v6 a4,4 0 0 0 2,3.5 a20,20 0 0 1 -2,-44.5 Z" fill="#fffaf0" opacity="0.6"/>
    <ellipse cx="23" cy="30" rx="6.4" ry="7.2" fill="#2b2723"/>
    <ellipse cx="41" cy="30" rx="6.4" ry="7.2" fill="#2b2723"/>
    <circle cx="24.6" cy="28" r="1.9" fill="#ff7043"/>
    <circle cx="42.6" cy="28" r="1.9" fill="#ff7043"/>
    <path d="M32,38 l-3.4,6 h6.8 Z" fill="#2b2723"/>
    <g fill="#2b2723">
      <rect x="24" y="48" width="3" height="6" rx="1"/><rect x="30.5" y="48" width="3" height="6" rx="1"/><rect x="37" y="48" width="3" height="6" rx="1"/>
    </g>
  </g>
  <g fill="#ff8a3d" class="sa-spark">
    <circle cx="14" cy="18" r="1.8"/><circle cx="50" cy="14" r="1.4"/><circle cx="54" cy="44" r="1.6"/>
  </g>`);
}

// ── CZAS / NAJDLUZSZY MECZ — zegar na tle zebatki ───────────────────────────
function renderClock(): string {
    const teeth = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const x = 44 + Math.cos(a) * 15;
        const y = 40 + Math.sin(a) * 15;
        return `<rect x="${(x - 3).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="6" height="6" rx="1.5" transform="rotate(${(i * 36).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('');
    return wrap('clock', `
  <defs>
    <linearGradient id="sa-cl-face" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#e6dcff"/><stop offset="100%" stop-color="#9b7fd4"/>
    </linearGradient>
  </defs>
  <g fill="#7e63b8" opacity="0.55">${teeth}<circle cx="44" cy="40" r="9"/></g>
  <g class="sa-wm">
    <circle cx="27" cy="28" r="19" fill="#6f57a6"/>
    <circle cx="27" cy="28" r="15.5" fill="url(#sa-cl-face)"/>
    <g stroke="#4a3a72" stroke-width="1.8" stroke-linecap="round">
      <path d="M27,16 v3"/><path d="M27,37 v3"/><path d="M15,28 h3"/><path d="M36,28 h3"/>
    </g>
    <path d="M27,28 v-9" stroke="#3b2f5c" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M27,28 l6.5,4" stroke="#3b2f5c" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="27" cy="28" r="2.2" fill="#3b2f5c"/>
    <path d="M16,20 a15.5,15.5 0 0 1 8,-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0.5"/>
  </g>
  <g fill="#d9c8ff" class="sa-spark">
    <circle cx="52" cy="16" r="1.6"/><circle cx="10" cy="48" r="1.3"/>
  </g>`);
}

// ── CELNOSC — radar z krzyzem celownika ─────────────────────────────────────
function renderTarget(): string {
    return wrap('target', `
  <defs>
    <radialGradient id="sa-ta-g" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="26" fill="url(#sa-ta-g)"/>
  <g class="sa-wm" fill="none" stroke="#cfd8e0" stroke-width="2.4">
    <circle cx="32" cy="32" r="21"/><circle cx="32" cy="32" r="14" opacity="0.85"/><circle cx="32" cy="32" r="7" opacity="0.7"/>
  </g>
  <g class="sa-wm" stroke="#e8eef3" stroke-width="2.6" stroke-linecap="round">
    <path d="M32,4 v9"/><path d="M32,51 v9"/><path d="M4,32 h9"/><path d="M51,32 h9"/>
  </g>
  <circle cx="32" cy="32" r="3.4" fill="#e74c3c"/>
  <g fill="#ffffff" class="sa-spark" opacity="0.85">
    <circle cx="45" cy="19" r="1.6"/><circle cx="18" cy="45" r="1.3"/>
  </g>`);
}

// ── COMBO — plomien warstwowy ───────────────────────────────────────────────
function renderFlame(): string {
    return wrap('flame', `
  <defs>
    <linearGradient id="sa-fl-a" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#d63a1e"/><stop offset="55%" stop-color="#f0761f"/><stop offset="100%" stop-color="#ffc93c"/>
    </linearGradient>
    <linearGradient id="sa-fl-b" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#ffb02e"/><stop offset="100%" stop-color="#fff2a8"/>
    </linearGradient>
  </defs>
  <g class="sa-wm">
    <path d="M32,4 c8,11 4,15 9,19 c3,-2 4,-6 4,-6 c7,9 7,15 7,19 a20,20 0 0 1 -40,0 c0,-7 4,-13 8,-17 c1,3 3,5 5,5 c3,-6 -1,-12 7,-20 Z" fill="url(#sa-fl-a)"/>
    <path d="M32,26 c4,6 2,9 5,11 c2,4 1,9 -2,11 a9,9 0 0 1 -9,-9 c0,-5 4,-9 6,-13 Z" fill="url(#sa-fl-b)"/>
  </g>
  <g fill="#ffd27a" class="sa-spark">
    <circle cx="14" cy="20" r="1.8"/><circle cx="50" cy="16" r="1.5"/><circle cx="52" cy="40" r="1.2"/>
  </g>`);
}

// ── ROZEGRANE GRY — pad ─────────────────────────────────────────────────────
function renderGames(): string {
    return wrap('games', `
  <defs>
    <linearGradient id="sa-ga-b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7cc6ef"/><stop offset="100%" stop-color="#2b6d99"/>
    </linearGradient>
  </defs>
  <g class="sa-wm">
    <path d="M18,20 h28 a14,14 0 0 1 13,17 l-3,12 a8,8 0 0 1 -14,3 l-4,-6 h-12 l-4,6 a8,8 0 0 1 -14,-3 l-3,-12 a14,14 0 0 1 13,-17 Z" fill="url(#sa-ga-b)"/>
    <rect x="16" y="31" width="12" height="3.6" rx="1.8" fill="#123449"/>
    <rect x="20.2" y="26.8" width="3.6" height="12" rx="1.8" fill="#123449"/>
    <circle cx="42" cy="30" r="3.1" fill="#e74c3c"/>
    <circle cx="49" cy="35" r="3.1" fill="#f1c40f"/>
    <circle cx="42" cy="40" r="3.1" fill="#39d98a"/>
    <path d="M20,22 a14,14 0 0 0 -9,10" fill="none" stroke="#cdeaff" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
  </g>
  <g fill="#cdeaff" class="sa-spark">
    <circle cx="54" cy="18" r="1.5"/><circle cx="9" cy="48" r="1.3"/>
  </g>`);
}

// ── KAMIENIE MILOWE — gwiazda z poswiata ────────────────────────────────────
function renderMilestone(): string {
    return wrap('milestone', `
  <defs>
    <radialGradient id="sa-ms-g" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffe066" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffe066" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sa-ms-s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff3b0"/><stop offset="100%" stop-color="#e0a92c"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="26" fill="url(#sa-ms-g)"/>
  <g class="sa-wm">
    <path d="M32,7 l7.6,15.8 17.4,2.4 -12.6,12.1 3.1,17.2 -15.5,-8.3 -15.5,8.3 3.1,-17.2 -12.6,-12.1 17.4,-2.4 Z" fill="url(#sa-ms-s)"/>
    <path d="M32,7 l7.6,15.8 -7.6,1 Z" fill="#fffbe0" opacity="0.75"/>
  </g>
  <g fill="#fff3b0" class="sa-spark">
    <circle cx="12" cy="16" r="1.7"/><circle cx="53" cy="47" r="1.5"/>
  </g>`);
}

// ── MIEJSCE W RANKINGU — medal na wstedze z laurem ──────────────────────────
function renderRank(): string {
    return wrap('rank', `
  <defs>
    <linearGradient id="sa-rk-m" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#ffe08a"/><stop offset="100%" stop-color="#b07f14"/>
    </linearGradient>
  </defs>
  <g class="sa-wm">
    <path d="M23,6 l7,17 -7,3 -5,-16 Z" fill="#3a7bd5"/>
    <path d="M41,6 l-7,17 7,3 5,-16 Z" fill="#5dade2"/>
    <circle cx="32" cy="41" r="16" fill="url(#sa-rk-m)"/>
    <circle cx="32" cy="41" r="11.5" fill="#8a6210" opacity="0.35"/>
    <path d="M20,41 a12,12 0 0 0 6,10" fill="none" stroke="#fff3c4" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>
    <path d="M44,41 a12,12 0 0 1 -6,10" fill="none" stroke="#fff3c4" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>
    <path d="M32,33 l2.6,5.4 5.9,0.8 -4.3,4.1 1,5.9 -5.2,-2.8 -5.2,2.8 1,-5.9 -4.3,-4.1 5.9,-0.8 Z" fill="#fff8dc"/>
  </g>
  <g fill="#ffe08a" class="sa-spark">
    <circle cx="52" cy="22" r="1.6"/><circle cx="11" cy="30" r="1.3"/>
  </g>`);
}

const ART: Record<StatArtId, () => string> = {
    trophy: renderTrophy,
    best: renderBest,
    skull: renderSkull,
    clock: renderClock,
    target: renderTarget,
    flame: renderFlame,
    games: renderGames,
    milestone: renderMilestone,
    rank: renderRank,
};

/**
 * SVG ikony kafla. Bezpieczne na nieznane id (pusty string) — ta sama umowa co
 * `renderMapPreview`.
 *
 * Cache module-level: kafle sa NIEZMIENNE, a przelaczenie zakladki profilu przebudowuje
 * cale drzewo (`ProfileSection.render`), wiec bez tego 9 SVG powstawaloby od nowa przy
 * kazdym tapnieciu w „Przeglad"/„Rekordy".
 */
const _cache: Partial<Record<StatArtId, string>> = {};
export function renderStatArt(id: StatArtId): string {
    const fn = ART[id];
    if (!fn) return '';
    return (_cache[id] ??= fn());
}
