/**
 * MapPreview.ts — programmatic animated SVG previews dla kart map (FAZA 6b).
 *
 * Filozofia:
 * - All programmatic SVG (no external assets) — zgodne z reguly projektu
 * - Pure functions — kazdy generator zwraca SVG string, no side effects, no DOM
 * - Reusable — generatory mozna wywolac samodzielnie (test page, screenshots, etc.)
 * - Animacje przez CSS klasy (mpd-, mpc-, mpt-, mpa-) — keyframes w menu-styles.css
 *
 * Uzycie:
 *   import { renderMapPreview } from './MapPreview';
 *   const svgString = renderMapPreview('desert');
 *   element.innerHTML = svgString;
 *
 * Performance:
 * - SVG inline (no extra HTTP requests)
 * - CSS animations (GPU-accelerated)
 * - prefers-reduced-motion respected (w menu-styles.css)
 */

export type PreviewType = 'desert' | 'cyberpunk' | 'tropics' | 'arctic' | 'mars' | 'range'
    // v0.143.0 — kafle wyboru mapy dla CTF: mapa grywalna + dwie zapowiedzi.
    | 'ruins' | 'destroyed_city' | 'moon';

/**
 * Map z generators per type.
 * Eksportowane oddzielnie zeby umozliwic czesciowy import (np. tylko desert dla testu).
 */
export const MapPreviews: Record<PreviewType, () => string> = {
    desert:    renderDesert,
    cyberpunk: renderCyberpunk,
    tropics:   renderTropics,
    arctic:    renderArctic,
    mars:      renderMars,
    range:     renderRange,
    ruins:          renderRuins,
    destroyed_city: renderDestroyedCity,
    moon:           renderMoon,
};

/**
 * Glowna funkcja API — zwraca SVG string dla danego typu mapy.
 * Bezpieczna na nieznane typy (zwraca empty string).
 */
export function renderMapPreview(type: PreviewType): string {
    const fn = MapPreviews[type];
    return fn ? fn() : '';
}

// =============================================================
// DESERT — Pustynia (egipska)
// =============================================================
// Skladniki:
// - Sky gradient (peach → amber)
// - Sun (top-right, pulsujace via CSS .mpd-sun)
// - Sun rays (8 promieni)
// - 3 warstwy wydm (parallax effect, back/mid/front)
// - Piramida (center, 2 sciany dla 3D feel)
// - Sand particles (subtle drift right via CSS .mpd-particle)
// =============================================================
function renderDesert(): string {
    // v0.119.0 (iteracja 7): preserveAspectRatio SLICE = pelne wypelnienie
    // kwadratowego boxa karty (kadr = centrum sceny, strefa bezpieczna x~50-190);
    // slonce przesuniete do kadru, +chmurka dryfujaca (juice).
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-desert" aria-hidden="true">
  <defs>
    <linearGradient id="bt-d-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffdf9e"/>
      <stop offset="55%"  stop-color="#ffb163"/>
      <stop offset="100%" stop-color="#f79b45"/>
    </linearGradient>
    <linearGradient id="bt-d-sand-back" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#d49c5e"/>
      <stop offset="100%" stop-color="#b77a3a"/>
    </linearGradient>
    <linearGradient id="bt-d-sand-mid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#e4b069"/>
      <stop offset="100%" stop-color="#d4944b"/>
    </linearGradient>
    <linearGradient id="bt-d-sand-front" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#f4c878"/>
      <stop offset="100%" stop-color="#e8b65c"/>
    </linearGradient>
    <radialGradient id="bt-d-sun" cx="0.35" cy="0.35" r="0.7">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="40%"  stop-color="#ffeb3b"/>
      <stop offset="100%" stop-color="#ff9800"/>
    </radialGradient>
  </defs>

  <!-- Sky -->
  <rect x="0" y="0" width="240" height="105" fill="url(#bt-d-sky)"/>

  <!-- Chmurka dryfujaca (juice, iteracja 7) -->
  <g class="mp7-cloud" opacity="0.8">
    <ellipse cx="0" cy="20" rx="14" ry="5" fill="#fff" opacity="0.85"/>
    <ellipse cx="10" cy="17" rx="9" ry="4.5" fill="#fff" opacity="0.75"/>
    <ellipse cx="-9" cy="18" rx="8" ry="4" fill="#fff" opacity="0.7"/>
  </g>

  <!-- Sun + rays (wrapper-translate do strefy kadru slice; animacja na wewnetrznej
       grupie .mpd-sun — transform animacji nie nadpisuje przesuniecia) -->
  <g transform="translate(-33,4)">
  <g class="mpd-sun">
    <circle cx="195" cy="28" r="13" fill="url(#bt-d-sun)"/>
    <g opacity="0.45" stroke="#fff200" stroke-width="2" stroke-linecap="round">
      <line x1="195" y1="9"  x2="195" y2="14"/>
      <line x1="195" y1="42" x2="195" y2="47"/>
      <line x1="176" y1="28" x2="171" y2="28"/>
      <line x1="214" y1="28" x2="219" y2="28"/>
      <line x1="181" y1="14" x2="178" y2="11"/>
      <line x1="209" y1="14" x2="212" y2="11"/>
      <line x1="181" y1="42" x2="178" y2="45"/>
      <line x1="209" y1="42" x2="212" y2="45"/>
    </g>
  </g>
  </g>

  <!-- Back dunes -->
  <path d="M0,92 Q40,80 80,88 T160,84 T240,88 L240,108 L0,108 Z" fill="url(#bt-d-sand-back)"/>

  <!-- Pyramid -->
  <g class="mpd-pyramid">
    <ellipse cx="118" cy="102" rx="36" ry="2.5" fill="#000" opacity="0.18"/>
    <path d="M118,42 L150,102 L118,102 Z" fill="#7d4f1c"/>
    <path d="M118,42 L118,102 L86,102 Z" fill="#c68b3a"/>
    <line x1="118" y1="42" x2="118" y2="102" stroke="#e8c68a" stroke-width="0.7" opacity="0.55"/>
    <!-- Brick lines for texture -->
    <line x1="98"  y1="80" x2="138" y2="80" stroke="#000" stroke-width="0.3" opacity="0.25"/>
    <line x1="93"  y1="90" x2="143" y2="90" stroke="#000" stroke-width="0.3" opacity="0.25"/>
  </g>

  <!-- Mid dunes -->
  <path d="M0,104 Q60,96 120,100 T240,98 L240,116 L0,116 Z" fill="url(#bt-d-sand-mid)"/>

  <!-- Front dunes -->
  <path d="M0,118 Q40,110 80,115 T160,113 T240,115 L240,140 L0,140 Z" fill="url(#bt-d-sand-front)"/>

  <!-- Sand particles -->
  <g fill="#ffffff" opacity="0.7">
    <circle class="mpd-particle mpd-p1" cx="40"  cy="130" r="0.9"/>
    <circle class="mpd-particle mpd-p2" cx="120" cy="125" r="0.8"/>
    <circle class="mpd-particle mpd-p3" cx="200" cy="128" r="1"/>
  </g>
</svg>`.trim();
}

// =============================================================
// CYBERPUNK — Neonowe miasto
// =============================================================
// Skladniki:
// - Sky gradient (deep purple → navy)
// - Distant stars + far buildings (atmospheric depth)
// - 3 main buildings + 2 backdrop buildings
// - Animated neon windows (cyan + magenta flicker)
// - Glowing antenna on tallest building
// - Drone flying across (left → right, looped)
// =============================================================
function renderCyberpunk(): string {
    // v0.119.0 (iteracja 7): slice = pelne wypelnienie boxa (hero building juz
    // centralny); +drugi mrugajacy neon-szyld na hero (juice).
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-cyberpunk" aria-hidden="true">
  <defs>
    <!-- Runda 1.26: synthwave sunset gradient zamiast dark purple
         (per feedback Mariusza: "mocno zachodzace slonce, bylo za ciemne") -->
    <linearGradient id="bt-c-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ff5e8e"/>
      <stop offset="30%"  stop-color="#ff8c54"/>
      <stop offset="55%"  stop-color="#a83377"/>
      <stop offset="80%"  stop-color="#3a1a6e"/>
      <stop offset="100%" stop-color="#1a0d3e"/>
    </linearGradient>
    <radialGradient id="bt-c-sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#fff5b8"/>
      <stop offset="40%"  stop-color="#ffa544"/>
      <stop offset="100%" stop-color="#ff6b3a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bt-c-bld" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#2a1f4a"/>
      <stop offset="100%" stop-color="#0d0d1e"/>
    </linearGradient>
    <filter id="bt-c-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Sunset Sky -->
  <rect x="0" y="0" width="240" height="140" fill="url(#bt-c-sky)"/>

  <!-- Sun disc (behind buildings, partial silhouette) -->
  <circle cx="125" cy="68" r="32" fill="url(#bt-c-sun)" opacity="0.95"/>

  <!-- Distant stars / city lights (top of sky, where it's still dark enough) -->
  <g opacity="0.45">
    <circle cx="30"  cy="10" r="0.5" fill="#fff"/>
    <circle cx="80"  cy="6"  r="0.7" fill="#9bd2ff"/>
    <circle cx="200" cy="12" r="0.6" fill="#fff"/>
    <circle cx="220" cy="20" r="0.4" fill="#ffe0c4"/>
  </g>

  <!-- Far back buildings (atmospheric) -->
  <rect x="8"   y="62" width="18" height="78" fill="#1a1232" opacity="0.7"/>
  <rect x="208" y="58" width="22" height="82" fill="#1a1232" opacity="0.7"/>
  <rect x="225" y="75" width="15" height="65" fill="#1a1232" opacity="0.6"/>

  <!-- Building 1 (left) -->
  <g>
    <rect x="32" y="55" width="28" height="85" fill="url(#bt-c-bld)"/>
    <!-- Top sign -->
    <rect x="36" y="52" width="20" height="3" fill="#ff00ff" filter="url(#bt-c-glow)" opacity="0.9"/>
    <!-- Neon windows -->
    <rect class="mpc-window mpc-w1" x="36" y="62" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="42" y="62" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window mpc-w2" x="48" y="62" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="54" y="62" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window"        x="36" y="72" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window mpc-w3" x="42" y="72" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="48" y="72" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window"        x="54" y="72" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="36" y="82" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window mpc-w4" x="48" y="82" width="3" height="3" fill="#ff00ff"/>
  </g>

  <!-- Center building (tallest, hero) -->
  <g>
    <rect x="78" y="30" width="44" height="110" fill="url(#bt-c-bld)"/>
    <!-- Window grid (6 cols x 5 rows) -->
    <g>
      <!-- Row 1 -->
      <rect class="mpc-window mpc-w5" x="84"  y="42" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="90"  y="42" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window mpc-w6" x="96"  y="42" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="102" y="42" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window"        x="108" y="42" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="114" y="42" width="3" height="3" fill="#ff00ff"/>
      <!-- Row 2 -->
      <rect class="mpc-window"        x="84"  y="52" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window mpc-w5" x="90"  y="52" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="96"  y="52" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window"        x="102" y="52" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window mpc-w3" x="108" y="52" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window"        x="114" y="52" width="3" height="3" fill="#00ffff"/>
      <!-- Row 3 -->
      <rect class="mpc-window"        x="84"  y="62" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="90"  y="62" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window mpc-w4" x="96"  y="62" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="102" y="62" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window"        x="108" y="62" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window mpc-w2" x="114" y="62" width="3" height="3" fill="#ff00ff"/>
      <!-- Row 4 -->
      <rect class="mpc-window mpc-w6" x="84"  y="72" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window"        x="90"  y="72" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="96"  y="72" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window mpc-w1" x="102" y="72" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="108" y="72" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window"        x="114" y="72" width="3" height="3" fill="#00ffff"/>
      <!-- Row 5 (last visible) -->
      <rect class="mpc-window"        x="84"  y="82" width="3" height="3" fill="#00ffff"/>
      <rect class="mpc-window"        x="96"  y="82" width="3" height="3" fill="#ff00ff"/>
      <rect class="mpc-window mpc-w2" x="108" y="82" width="3" height="3" fill="#00ffff"/>
    </g>
    <!-- Top antenna -->
    <line x1="100" y1="30" x2="100" y2="18" stroke="#00ffff" stroke-width="1.2" filter="url(#bt-c-glow)" opacity="0.9"/>
    <circle class="mpc-antenna-light" cx="100" cy="16" r="2.2" fill="#ff0066" filter="url(#bt-c-glow)"/>
    <!-- Pionowy neon-szyld na hero (mruga — juice, iteracja 7) -->
    <rect class="mp7-neon" x="120" y="36" width="2.5" height="18" fill="#00ffe1" filter="url(#bt-c-glow)"/>
  </g>

  <!-- Building 3 (right) -->
  <g>
    <rect x="135" y="58" width="35" height="82" fill="url(#bt-c-bld)"/>
    <!-- Decorative top -->
    <path d="M135,58 L152,49 L170,58 Z" fill="#1a1140"/>
    <!-- Neon sign vertical -->
    <rect x="148" y="63" width="2" height="14" fill="#ff00ff" filter="url(#bt-c-glow)" opacity="0.85"/>
    <!-- Windows -->
    <rect class="mpc-window mpc-w3" x="139" y="68" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="158" y="68" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window mpc-w4" x="164" y="68" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="139" y="78" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window mpc-w5" x="158" y="78" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="164" y="78" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window"        x="139" y="88" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window mpc-w2" x="158" y="88" width="3" height="3" fill="#ff00ff"/>
  </g>

  <!-- Smaller building (far right) -->
  <g>
    <rect x="175" y="78" width="22" height="62" fill="url(#bt-c-bld)"/>
    <rect class="mpc-window mpc-w1" x="179" y="86" width="3" height="3" fill="#ff00ff"/>
    <rect class="mpc-window"        x="187" y="86" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window"        x="179" y="96" width="3" height="3" fill="#00ffff"/>
    <rect class="mpc-window mpc-w6" x="187" y="96" width="3" height="3" fill="#ff00ff"/>
  </g>

  <!-- Animated drone -->
  <g class="mpc-drone">
    <ellipse cx="0" cy="0" rx="3.5" ry="1.4" fill="#1a1a2e" stroke="#3a3a5e" stroke-width="0.3"/>
    <circle cx="0" cy="0" r="0.8" fill="#ff0066" filter="url(#bt-c-glow)"/>
    <line x1="-3.5" y1="-0.2" x2="-5" y2="-2" stroke="#666" stroke-width="0.4"/>
    <line x1="3.5"  y1="-0.2" x2="5"  y2="-2" stroke="#666" stroke-width="0.4"/>
    <circle cx="-5" cy="-2" r="0.8" fill="#00ffff" opacity="0.7"/>
    <circle cx="5"  cy="-2" r="0.8" fill="#00ffff" opacity="0.7"/>
  </g>
</svg>`.trim();
}

// =============================================================
// TROPICS — Locked (Tropiki, dzungla i wodospady)
// =============================================================
// Skladniki:
// - Lush green sky gradient
// - Distant mountain range
// - 2 palm trees (subtle sway)
// - Animated waterfall (3 lines, staggered)
// - Foreground river
// - Sun (warm, soft)
// =============================================================
function renderTropics(): string {
    // v0.119.0 (iteracja 7): slice = pelne wypelnienie boxa; wodospad i palmy
    // przesuniete do strefy kadru (x~50-190); +ptak przelatujacy petla (juice).
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-tropics" aria-hidden="true">
  <defs>
    <linearGradient id="bt-t-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#84f0ae"/>
      <stop offset="60%"  stop-color="#37b478"/>
      <stop offset="100%" stop-color="#137a4c"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect x="0" y="0" width="240" height="140" fill="url(#bt-t-sky)"/>

  <!-- Sun -->
  <circle cx="60" cy="32" r="10" fill="#ffeb88" opacity="0.75"/>
  <circle cx="60" cy="32" r="6"  fill="#fff5b0" opacity="0.6"/>

  <!-- Distant mountains -->
  <path d="M0,80 Q40,58 80,72 Q120,52 160,68 Q200,48 240,66 L240,100 L0,100 Z" fill="#2e8556" opacity="0.85"/>

  <!-- Waterfall (animated; wrapper-translate do strefy kadru slice) -->
  <g transform="translate(-28,0)">
    <rect x="168" y="60" width="22" height="56" fill="#a7e9c8" opacity="0.5"/>
    <line class="mpt-fall mpt-fl1" x1="172" y1="60" x2="172" y2="116" stroke="#fff" stroke-width="0.9" opacity="0.55"/>
    <line class="mpt-fall mpt-fl2" x1="178" y1="60" x2="178" y2="116" stroke="#fff" stroke-width="0.9" opacity="0.7"/>
    <line class="mpt-fall mpt-fl3" x1="184" y1="60" x2="184" y2="116" stroke="#fff" stroke-width="0.9" opacity="0.6"/>
    <!-- Waterfall splash -->
    <ellipse cx="179" cy="116" rx="14" ry="2" fill="#fff" opacity="0.5"/>
  </g>

  <!-- Ptak przelatujacy petla (juice, iteracja 7) -->
  <g class="mp7-bird" stroke="#1a4d33" stroke-width="1.4" stroke-linecap="round" fill="none">
    <path d="M-4,0 Q-1,-3 0,0 Q1,-3 4,0"/>
  </g>

  <!-- Foreground river -->
  <path d="M0,108 Q60,106 120,110 T240,108 L240,140 L0,140 Z" fill="#2da575"/>
  <!-- River shimmer -->
  <line x1="30"  y1="120" x2="60"  y2="120" stroke="#a7e9c8" stroke-width="0.8" opacity="0.5"/>
  <line x1="100" y1="125" x2="140" y2="125" stroke="#a7e9c8" stroke-width="0.8" opacity="0.5"/>
  <line x1="170" y1="122" x2="210" y2="122" stroke="#a7e9c8" stroke-width="0.8" opacity="0.5"/>

  <!-- Palm tree 1 (left; wrapper-translate do strefy kadru slice) -->
  <g transform="translate(27,0)">
  <g class="mpt-palm mpt-palm-1" transform="translate(25,0)">
    <line x1="20" y1="118" x2="16" y2="62" stroke="#5d3a1a" stroke-width="2.8" stroke-linecap="round"/>
    <!-- Leaves -->
    <path d="M16,62 Q-4,57 -14,67 Q-1,58 16,64 Z" fill="#1e6e3a"/>
    <path d="M16,62 Q5,47 -5,52 Q9,50 16,64 Z" fill="#28854a"/>
    <path d="M16,62 Q27,47 37,52 Q23,50 16,64 Z" fill="#1e6e3a"/>
    <path d="M16,62 Q35,57 46,67 Q33,58 16,64 Z" fill="#28854a"/>
    <!-- Coconut -->
    <circle cx="13" cy="66" r="1.5" fill="#3d2510"/>
    <circle cx="18" cy="66" r="1.5" fill="#3d2510"/>
  </g>
  </g>

  <!-- Palm tree 2 (right, smaller; wrapper-translate do strefy kadru slice) -->
  <g transform="translate(-38,0)">
  <g class="mpt-palm mpt-palm-2" transform="translate(195,12) scale(0.78)">
    <line x1="20" y1="118" x2="18" y2="62" stroke="#5d3a1a" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M18,62 Q-2,57 -12,67 Q1,58 18,64 Z" fill="#1e6e3a"/>
    <path d="M18,62 Q7,47 -3,52 Q11,50 18,64 Z" fill="#28854a"/>
    <path d="M18,62 Q29,47 39,52 Q25,50 18,64 Z" fill="#1e6e3a"/>
    <circle cx="15" cy="66" r="1.4" fill="#3d2510"/>
  </g>
  </g>
</svg>`.trim();
}

// =============================================================
// ARCTIC — Locked (Arktyka, lodowa pustynia)
// =============================================================
// Skladniki:
// - Cold blue sky gradient
// - Distant mountain range (icy peaks)
// - 2 ice peaks (foreground, 3D feel)
// - Frozen lake foreground z ice cracks
// - 8 snowflakes (animated falling, staggered)
// =============================================================
function renderArctic(): string {
    // v0.119.0 (iteracja 7): slice = pelne wypelnienie boxa; prawy szczyt i platki
    // w strefie kadru (x~50-190); +pas zorzy delikatnie pulsujacy (juice).
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-arctic" aria-hidden="true">
  <defs>
    <linearGradient id="bt-a-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#c6e7fb"/>
      <stop offset="60%"  stop-color="#54aae5"/>
      <stop offset="100%" stop-color="#245a8c"/>
    </linearGradient>
    <linearGradient id="bt-a-aurora" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#7ef0a8" stop-opacity="0"/>
      <stop offset="35%"  stop-color="#7ef0c8" stop-opacity="0.8"/>
      <stop offset="65%"  stop-color="#b07ef7" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#b07ef7" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bt-a-ice-light" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#bcdcf0"/>
    </linearGradient>
    <linearGradient id="bt-a-ice-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#d6eaf8"/>
      <stop offset="100%" stop-color="#5d8aae"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect x="0" y="0" width="240" height="140" fill="url(#bt-a-sky)"/>

  <!-- Pas zorzy (juice, iteracja 7 — pulsuje opacity) -->
  <path class="mp7-aurora" d="M50,20 Q95,6 140,16 T230,10 L230,24 Q160,30 110,26 T50,32 Z"
        fill="url(#bt-a-aurora)" opacity="0.55"/>

  <!-- Distant mountain range -->
  <path d="M0,80 L25,58 L55,72 L95,42 L140,65 L180,48 L215,60 L240,55 L240,95 L0,95 Z" fill="url(#bt-a-ice-dark)"/>
  <!-- Snow caps -->
  <path d="M95,42 L102,50 L88,50 Z" fill="#fff"/>
  <path d="M180,48 L186,55 L174,55 Z" fill="#fff"/>

  <!-- Main ice peak (front center) -->
  <g>
    <path d="M55,95 L92,38 L128,95 Z" fill="url(#bt-a-ice-light)"/>
    <!-- Right face (darker) -->
    <path d="M92,38 L128,95 L105,95 Z" fill="#a6cbe5" opacity="0.85"/>
    <!-- Snow cap -->
    <path d="M88,46 L92,38 L96,46 Z" fill="#fff"/>
    <!-- Crystalline highlight -->
    <line x1="92" y1="38" x2="92" y2="92" stroke="#fff" stroke-width="0.4" opacity="0.6"/>
  </g>

  <!-- Smaller ice peak (right; w strefie kadru slice) -->
  <g transform="translate(-16,0)">
    <path d="M148,90 L175,52 L203,90 Z" fill="url(#bt-a-ice-light)"/>
    <path d="M175,52 L203,90 L188,90 Z" fill="#a6cbe5" opacity="0.7"/>
    <path d="M172,58 L175,52 L178,58 Z" fill="#fff"/>
  </g>

  <!-- Frozen lake foreground -->
  <rect x="0" y="100" width="240" height="40" fill="#d6eaf8" opacity="0.92"/>
  <rect x="0" y="100" width="240" height="40" fill="url(#bt-a-ice-light)" opacity="0.4"/>

  <!-- Ice cracks -->
  <line x1="30" y1="115" x2="80"  y2="118" stroke="#5dade2" stroke-width="0.5" opacity="0.55"/>
  <line x1="80" y1="118" x2="95"  y2="125" stroke="#5dade2" stroke-width="0.5" opacity="0.55"/>
  <line x1="120" y1="122" x2="170" y2="116" stroke="#5dade2" stroke-width="0.5" opacity="0.55"/>
  <line x1="170" y1="116" x2="185" y2="125" stroke="#5dade2" stroke-width="0.5" opacity="0.55"/>
  <!-- Reflection (subtle) -->
  <ellipse cx="92" cy="103" rx="35" ry="2" fill="#fff" opacity="0.35"/>

  <!-- Snowflakes (8; rozlozone w strefie kadru slice x~55-185) -->
  <g fill="#fff">
    <circle class="mpa-snow mpa-s1" cx="58"  cy="20"  r="1"/>
    <circle class="mpa-snow mpa-s2" cx="76"  cy="35"  r="1.2"/>
    <circle class="mpa-snow mpa-s3" cx="110" cy="15"  r="0.9"/>
    <circle class="mpa-snow mpa-s4" cx="146" cy="28"  r="1.1"/>
    <circle class="mpa-snow mpa-s5" cx="168" cy="42"  r="1"/>
    <circle class="mpa-snow mpa-s6" cx="92"  cy="10"  r="0.8"/>
    <circle class="mpa-snow mpa-s7" cx="182" cy="22"  r="1"/>
    <circle class="mpa-snow mpa-s8" cx="66"  cy="50"  r="1.1"/>
  </g>
</svg>`.trim();
}

// =============================================================
// MARS — Rdzawy Swit (opuszczona baza + UFO)
// =============================================================
// Skladniki (FAZA MARS M2):
// - Rusty-pink dawn sky gradient (paleta MARS_PALETTE — NIE czerwien Wulkanow)
// - Pale sun + drugi maly ksiezyc (Fobos)
// - Distant ridge + kratery na regolicie
// - Baza: 2 biale kopuly + tunel, cyjan TYLKO w oknach (detal — regula F1)
// - UFO przelatujace (reuse keyframes .mpc-drone) z zielona poswiata Obcych
// - Drobiny pylu (reuse .mpd-particle) — zero nowych keyframes w CSS
// =============================================================
function renderMars(): string {
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-mars" aria-hidden="true">
  <defs>
    <linearGradient id="bt-m-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#f2b49a"/>
      <stop offset="55%"  stop-color="#d98a6e"/>
      <stop offset="100%" stop-color="#8a4a5a"/>
    </linearGradient>
    <linearGradient id="bt-m-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#c97b62"/>
      <stop offset="100%" stop-color="#a35844"/>
    </linearGradient>
    <linearGradient id="bt-m-dome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#c9d4dc"/>
    </linearGradient>
    <radialGradient id="bt-m-ufo-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%"   stop-color="#39d98a" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#39d98a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Sky (rdzawy swit) -->
  <rect x="0" y="0" width="240" height="140" fill="url(#bt-m-sky)"/>

  <!-- Blade slonce + Fobos -->
  <circle cx="70" cy="26" r="8" fill="#ffe8cc" opacity="0.85"/>
  <circle cx="70" cy="26" r="12" fill="#ffe8cc" opacity="0.25"/>
  <circle cx="168" cy="16" r="2.4" fill="#e8c4b0" opacity="0.8"/>

  <!-- Distant ridge -->
  <path d="M0,86 L35,70 L70,80 L110,62 L150,76 L190,64 L222,74 L240,68 L240,100 L0,100 Z"
        fill="#b0604a" opacity="0.9"/>

  <!-- Baza: kopula A (hero) + tunel + kopula B; cyjan TYLKO okna (F1) -->
  <g transform="translate(-4,0)">
    <!-- cien SE pod baza -->
    <ellipse cx="128" cy="99" rx="52" ry="3.5" fill="#5c2f33" opacity="0.30"/>
    <!-- kopula A -->
    <path d="M86,99 A30,26 0 0 1 146,99 Z" fill="url(#bt-m-dome)"/>
    <path d="M116,73 A30,26 0 0 1 146,99 L131,99 A16,22 0 0 0 116,73 Z" fill="#9fb2bf" opacity="0.55"/>
    <!-- tunel -->
    <rect x="144" y="88" width="16" height="11" rx="3" fill="#d7dfe5"/>
    <!-- kopula B (mniejsza) -->
    <path d="M158,99 A21,18 0 0 1 200,99 Z" fill="url(#bt-m-dome)"/>
    <path d="M179,81 A21,18 0 0 1 200,99 L189,99 A11,15 0 0 0 179,81 Z" fill="#9fb2bf" opacity="0.5"/>
    <!-- okna (cyjan detal, mrugaja — reuse .mpc-window) -->
    <rect class="mpc-window mpc-w1" x="102" y="88" width="4" height="3.2" rx="0.8" fill="#37d0e6"/>
    <rect class="mpc-window mpc-w3" x="112" y="84" width="4" height="3.2" rx="0.8" fill="#37d0e6"/>
    <rect class="mpc-window"        x="122" y="88" width="4" height="3.2" rx="0.8" fill="#37d0e6"/>
    <rect class="mpc-window mpc-w5" x="174" y="90" width="3.4" height="2.8" rx="0.7" fill="#37d0e6"/>
    <!-- maszt anteny -->
    <line x1="116" y1="73" x2="116" y2="63" stroke="#d7dfe5" stroke-width="1.2"/>
    <circle class="mpc-antenna-light" cx="116" cy="61.5" r="1.7" fill="#ff5e6a"/>
  </g>

  <!-- Grunt (regolit) -->
  <path d="M0,98 Q60,94 120,98 T240,96 L240,140 L0,140 Z" fill="url(#bt-m-ground)"/>

  <!-- Kratery (pasywny dekor — niski kontrast) -->
  <g>
    <ellipse cx="52" cy="116" rx="14" ry="4.5" fill="#8a4a3c" opacity="0.5"/>
    <path d="M38,115 A14,4.5 0 0 1 66,115" fill="none" stroke="#e0997f" stroke-width="1" opacity="0.6"/>
    <ellipse cx="196" cy="124" rx="17" ry="5.5" fill="#8a4a3c" opacity="0.5"/>
    <path d="M179,123 A17,5.5 0 0 1 213,123" fill="none" stroke="#e0997f" stroke-width="1" opacity="0.6"/>
    <ellipse cx="126" cy="130" rx="9" ry="3" fill="#8a4a3c" opacity="0.4"/>
  </g>

  <!-- Slady lazika -->
  <path d="M10,134 Q60,128 110,132" fill="none" stroke="#93503f" stroke-width="1.1" opacity="0.55"/>
  <path d="M10,138 Q60,132 110,136" fill="none" stroke="#93503f" stroke-width="1.1" opacity="0.55"/>

  <!-- UFO (reuse keyframes .mpc-drone — przelatuje petla) -->
  <g class="mpc-drone">
    <circle cx="0" cy="2" r="9" fill="url(#bt-m-ufo-glow)"/>
    <ellipse cx="0" cy="0" rx="7" ry="2.4" fill="#4a5560" stroke="#39d98a" stroke-width="0.5"/>
    <path d="M-3.4,-1.6 A3.6,2.6 0 0 1 3.4,-1.6 Z" fill="#8b5cf6" opacity="0.85"/>
    <circle cx="-4" cy="1" r="0.7" fill="#39d98a"/>
    <circle cx="0"  cy="1.6" r="0.7" fill="#39d98a"/>
    <circle cx="4"  cy="1" r="0.7" fill="#39d98a"/>
  </g>

  <!-- Drobiny pylu (reuse .mpd-particle — dryf) -->
  <g fill="#f0b898" opacity="0.8">
    <circle class="mpd-particle mpd-p1" cx="45"  cy="122" r="0.9"/>
    <circle class="mpd-particle mpd-p2" cx="125" cy="118" r="0.8"/>
    <circle class="mpd-particle mpd-p3" cx="205" cy="120" r="1"/>
  </g>
</svg>`.trim();
}
// =============================================================
// RANGE — Poligon wojskowy (LOCKED zapowiedz, M5d)
// =============================================================
// Skladniki: khaki teren + tory przeszkod + tarcze strzelnicze (obracaja sie),
// flagi na wietrze, kurz + KLODKA z pulsem "wkrotce".
// Reuse istniejacych keyframes: .mpd-particle (kurz), .mpc-antenna-light (puls
// klodki), .mpt-palm (kolysanie flag) — zero nowych regul CSS.
// =============================================================
function renderRange(): string {
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-range" aria-hidden="true">
  <defs>
    <linearGradient id="bt-r-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#c8d4a8"/>
      <stop offset="55%"  stop-color="#9aad74"/>
      <stop offset="100%" stop-color="#6d7d4c"/>
    </linearGradient>
    <linearGradient id="bt-r-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#8a9a5b"/>
      <stop offset="100%" stop-color="#5d6b3c"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="240" height="140" fill="url(#bt-r-sky)"/>
  <path d="M0,78 L40,66 L80,74 L120,60 L160,72 L200,62 L240,70 L240,140 L0,140 Z" fill="#7a8a55" opacity="0.9"/>
  <path d="M0,92 Q60,86 120,92 T240,90 L240,140 L0,140 Z" fill="url(#bt-r-ground)"/>

  <!-- tory przeszkod: opony + belki -->
  <g opacity="0.85">
    <ellipse cx="40" cy="112" rx="9" ry="4" fill="#3a3a32"/>
    <ellipse cx="58" cy="116" rx="9" ry="4" fill="#3a3a32"/>
    <ellipse cx="76" cy="112" rx="9" ry="4" fill="#3a3a32"/>
    <rect x="150" y="104" width="52" height="5" rx="2" fill="#6b5a3c"/>
    <rect x="156" y="109" width="5" height="12" fill="#5a4a30"/>
    <rect x="191" y="109" width="5" height="12" fill="#5a4a30"/>
  </g>

  <!-- tarcze strzelnicze (obracaja sie jak dron) -->
  <g class="mpc-drone">
    <circle cx="0" cy="0" r="11" fill="#efe6d2"/>
    <circle cx="0" cy="0" r="7.5" fill="#d94a3d"/>
    <circle cx="0" cy="0" r="4" fill="#efe6d2"/>
    <circle cx="0" cy="0" r="1.6" fill="#d94a3d"/>
  </g>
  <g transform="translate(196,66)">
    <rect x="-1.5" y="0" width="3" height="22" fill="#5a4a30"/>
    <circle cx="0" cy="-4" r="10" fill="#efe6d2"/>
    <circle cx="0" cy="-4" r="6.5" fill="#d94a3d"/>
    <circle cx="0" cy="-4" r="3" fill="#efe6d2"/>
  </g>

  <!-- flagi kierunkowe (kolysza sie) -->
  <g class="mpt-palm mpt-palm-1" transform="translate(30,52)">
    <rect x="0" y="0" width="2" height="30" fill="#4a4a3a"/>
    <path d="M2,2 L18,7 L2,12 Z" fill="#d94a3d"/>
  </g>
  <g class="mpt-palm mpt-palm-2" transform="translate(112,44)">
    <rect x="0" y="0" width="2" height="34" fill="#4a4a3a"/>
    <path d="M2,2 L17,7 L2,12 Z" fill="#e8b53d"/>
  </g>

  <!-- kurz -->
  <g fill="#d8dcc0" opacity="0.7">
    <circle class="mpd-particle mpd-p1" cx="52"  cy="126" r="1"/>
    <circle class="mpd-particle mpd-p2" cx="130" cy="122" r="0.9"/>
    <circle class="mpd-particle mpd-p3" cx="205" cy="128" r="1.1"/>
  </g>

  <!-- KLODKA: to jest zapowiedz, nie mapa do grania -->
  <g transform="translate(120,70)">
    <ellipse cx="0" cy="2" rx="30" ry="26" fill="#12160f" opacity="0.45"/>
    <path d="M-9,-4 a9,10 0 0 1 18,0 v6 h-5 v-6 a4,5 0 0 0 -8,0 v6 h-5 Z" fill="#e8d9a8"/>
    <rect class="mpc-antenna-light" x="-13" y="2" width="26" height="20" rx="4" fill="#e8d9a8"/>
    <circle cx="0" cy="11" r="3" fill="#5a4a30"/>
    <rect x="-1.4" y="11" width="2.8" height="6" fill="#5a4a30"/>
  </g>
</svg>`.trim();
}

// =============================================================
// RUINS — Ufortyfikowane Ruiny (mapa CTF, v0.143.0)
// =============================================================
// Skladniki: mur fortecy + wojskowy hangar w moro (baza gracza) + trzy maszty
// z proporcami w kolorach flag (ALFA niebieski / BRAVO czerwony / CHARLIE zolty)
// + pulsujacy beacon dostawy + kurz. Paleta 1:1 z mapa (RuinsHangar/FortifiedRuinsMap),
// zeby kafel w menu obiecywal to, co gracz realnie zobaczy.
// Reuse keyframes: .mpc-antenna-light (beacon), .mpc-window (okna), .mpd-particle (kurz).
// =============================================================
function renderRuins(): string {
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-ruins" aria-hidden="true">
  <defs>
    <linearGradient id="bt-ru-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#b9c3cc"/>
      <stop offset="55%"  stop-color="#95a2ac"/>
      <stop offset="100%" stop-color="#6e7a83"/>
    </linearGradient>
    <linearGradient id="bt-ru-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#7a7668"/>
      <stop offset="100%" stop-color="#565348"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="240" height="140" fill="url(#bt-ru-sky)"/>

  <!-- Mur fortecy w tle: blanki + wyrwa (ruiny, nie zamek) -->
  <g fill="#8c8577">
    <rect x="0" y="58" width="240" height="26"/>
    <rect x="6"   y="50" width="13" height="9"/>
    <rect x="30"  y="50" width="13" height="9"/>
    <rect x="54"  y="50" width="13" height="9"/>
    <rect x="122" y="50" width="13" height="9"/>
    <rect x="146" y="50" width="13" height="9"/>
    <rect x="196" y="50" width="13" height="9"/>
    <rect x="220" y="50" width="13" height="9"/>
  </g>
  <path d="M78,58 L96,84 L112,58 Z" fill="#95a2ac"/>
  <g fill="#6f695c" opacity="0.8">
    <rect x="0" y="80" width="240" height="5"/>
    <rect x="168" y="62" width="7" height="7"/>
    <rect x="40"  y="66" width="6" height="6"/>
  </g>

  <!-- Klepisko poligonu -->
  <path d="M0,84 Q60,80 120,85 T240,83 L240,140 L0,140 Z" fill="url(#bt-ru-ground)"/>
  <g stroke="#4a473f" stroke-width="1.4" opacity="0.55">
    <path d="M0,104 L240,101"/>
    <path d="M96,84 L96,140"/>
  </g>

  <!-- Hangar w moro (baza gracza) -->
  <g>
    <ellipse cx="52" cy="122" rx="42" ry="4" fill="#3a382f" opacity="0.35"/>
    <rect x="16" y="92" width="72" height="30" rx="3" fill="#55663e"/>
    <path d="M16,92 L52,78 L88,92 Z" fill="#39422c"/>
    <rect x="24" y="100" width="16" height="12" rx="2" fill="#6b5a38"/>
    <rect x="62" y="98" width="18" height="24" rx="2" fill="#2e3628"/>
    <g fill="#d4b048">
      <rect class="mpc-window mpc-w2" x="66" y="102" width="10" height="3"/>
      <rect class="mpc-window mpc-w4" x="66" y="108" width="10" height="3"/>
    </g>
    <path d="M46,82 L52,76 L58,82 L52,86 Z" fill="#d4b048"/>
  </g>

  <!-- Strefa dostawy "H" + beacon -->
  <g transform="translate(140,104)">
    <rect x="-26" y="-13" width="52" height="26" rx="3" fill="#6e6a5c" opacity="0.9"/>
    <g fill="#d4b048">
      <rect x="-13" y="-8" width="5" height="16"/>
      <rect x="8"   y="-8" width="5" height="16"/>
      <rect x="-13" y="-2" width="26" height="4"/>
    </g>
    <circle class="mpc-antenna-light" cx="0" cy="0" r="19" fill="none" stroke="#f1c40f" stroke-width="2.5" opacity="0.9"/>
  </g>

  <!-- Trzy maszty z proporcami (kolory flag CTF) -->
  <g>
    <rect x="188" y="70" width="2.6" height="34" fill="#8a8a82"/>
    <path d="M190.6,71 L206,76 L190.6,81 Z" fill="#3498db"/>
    <rect x="206" y="74" width="2.6" height="30" fill="#8a8a82"/>
    <path d="M208.6,75 L222,79.5 L208.6,84 Z" fill="#e74c3c"/>
    <rect x="222" y="78" width="2.6" height="26" fill="#8a8a82"/>
    <path d="M224.6,79 L236,83 L224.6,87 Z" fill="#f1c40f"/>
  </g>

  <!-- Kurz -->
  <g fill="#cdc6b4" opacity="0.75">
    <circle class="mpd-particle" cx="70" cy="126" r="2"/>
    <circle class="mpd-particle mpd-p2" cx="150" cy="132" r="1.6"/>
    <circle class="mpd-particle mpd-p3" cx="200" cy="120" r="1.4"/>
  </g>
</svg>`.trim();
}

// =============================================================
// DESTROYED CITY — Zniszczone Miasto (LOCKED zapowiedz CTF, v0.143.0)
// =============================================================
// Post-apo: wypalone wiezowce z wyrwami, przechylony blok, dym, tlace sie ognie.
// Reuse keyframes: .mpc-window (migoczace okna + ogien), .mpd-particle (dym),
// .mpc-antenna-light (lune pozaru). Zero nowych regul CSS.
// =============================================================
function renderDestroyedCity(): string {
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-dcity" aria-hidden="true">
  <defs>
    <linearGradient id="bt-dc-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#4a3b46"/>
      <stop offset="55%"  stop-color="#8a5a45"/>
      <stop offset="100%" stop-color="#c47a44"/>
    </linearGradient>
    <linearGradient id="bt-dc-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#5a5148"/>
      <stop offset="100%" stop-color="#3a352f"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="240" height="140" fill="url(#bt-dc-sky)"/>
  <circle class="mpc-antenna-light" cx="196" cy="44" r="26" fill="#e8863a" opacity="0.22"/>

  <!-- Sylwetki wiezowcow: polamane szczyty -->
  <g fill="#2f2a33">
    <path d="M10,120 L10,44 L34,44 L34,30 L48,30 L48,120 Z"/>
    <path d="M58,120 L58,58 L74,52 L88,58 L88,120 Z"/>
    <path d="M150,120 L150,38 L164,38 L164,26 L176,26 L176,120 Z"/>
    <path d="M186,120 L186,60 L214,60 L214,120 Z"/>
  </g>
  <g transform="translate(112,120) rotate(-13)" fill="#38313c">
    <rect x="-14" y="-66" width="28" height="66"/>
  </g>
  <g fill="#8a5a45" opacity="0.55">
    <path d="M20,70 L30,64 L34,78 L22,82 Z"/>
    <path d="M160,74 L172,68 L174,84 L162,86 Z"/>
    <path d="M194,86 L206,82 L208,96 L196,96 Z"/>
  </g>

  <!-- Okna: nieliczne, migocza (prad ledwo zyje) -->
  <g fill="#f2c14e">
    <rect class="mpc-window"        x="14"  y="52" width="5" height="4"/>
    <rect class="mpc-window mpc-w3" x="26"  y="88" width="5" height="4"/>
    <rect class="mpc-window mpc-w5" x="64"  y="70" width="5" height="4"/>
    <rect class="mpc-window mpc-w2" x="156" y="52" width="5" height="4"/>
    <rect class="mpc-window mpc-w6" x="200" y="70" width="5" height="4"/>
  </g>

  <!-- Ulica + gruz + lej -->
  <path d="M0,108 Q60,104 120,110 T240,106 L240,140 L0,140 Z" fill="url(#bt-dc-ground)"/>
  <ellipse cx="128" cy="126" rx="26" ry="7" fill="#2b2721" opacity="0.8"/>
  <g fill="#6b6157">
    <path d="M40,126 L52,118 L60,128 Z"/>
    <path d="M170,130 L182,122 L192,132 Z"/>
    <rect x="86" y="126" width="18" height="5" rx="2"/>
  </g>

  <!-- Ogien + dym -->
  <path class="mpc-window mpc-w4" d="M212,120 q-5,-11 0,-16 q5,7 9,-1 q5,10 -1,17 Z" fill="#e8632a"/>
  <g fill="#b9b0a4" opacity="0.5">
    <circle class="mpd-particle" cx="212" cy="104" r="6"/>
    <circle class="mpd-particle mpd-p2" cx="120" cy="92" r="7"/>
    <circle class="mpd-particle mpd-p3" cx="70" cy="84" r="5"/>
  </g>
</svg>`.trim();
}

// =============================================================
// MOON — Podboj Ksiezyca (LOCKED zapowiedz CTF, v0.143.0)
// =============================================================
// Szary regolit + kratery + Ziemia na czarnym niebie + ladownik z antena
// + satelita przelatujaca nad horyzontem + pyl.
// Reuse keyframes: .mpc-drone (satelita), .mpc-antenna-light (beacon ladownika),
// .mpc-window (migot gwiazd), .mpd-particle (pyl).
// =============================================================
function renderMoon(): string {
    return `
<svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-moon" aria-hidden="true">
  <defs>
    <linearGradient id="bt-mo-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#05060d"/>
      <stop offset="100%" stop-color="#141a2b"/>
    </linearGradient>
    <linearGradient id="bt-mo-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#b8b6b0"/>
      <stop offset="100%" stop-color="#7d7b76"/>
    </linearGradient>
    <linearGradient id="bt-mo-earth" x1="0.2" y1="0" x2="0.9" y2="1">
      <stop offset="0%"   stop-color="#5aa9e6"/>
      <stop offset="100%" stop-color="#1c4f80"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="240" height="140" fill="url(#bt-mo-sky)"/>

  <!-- Gwiazdy (migocza) -->
  <g fill="#ffffff">
    <circle class="mpc-window"        cx="26"  cy="20" r="1.5"/>
    <circle class="mpc-window mpc-w2" cx="72"  cy="12" r="1.2"/>
    <circle class="mpc-window mpc-w3" cx="118" cy="26" r="1.6"/>
    <circle class="mpc-window mpc-w5" cx="186" cy="14" r="1.3"/>
    <circle class="mpc-window mpc-w6" cx="222" cy="34" r="1.5"/>
    <circle cx="52"  cy="38" r="1" opacity="0.7"/>
    <circle cx="150" cy="8"  r="1" opacity="0.7"/>
  </g>

  <!-- Ziemia nad horyzontem -->
  <g transform="translate(46,44)">
    <circle r="21" fill="url(#bt-mo-earth)"/>
    <path d="M-15,-6 q7,-6 14,-1 q6,4 12,0 q-4,9 -13,10 q-9,1 -13,-9 Z" fill="#3f9350" opacity="0.9"/>
    <path d="M-6,10 q8,-3 15,2 q-7,5 -15,-2 Z" fill="#3f9350" opacity="0.75"/>
    <circle r="21" fill="none" stroke="#9fd4ff" stroke-width="1.2" opacity="0.45"/>
  </g>

  <!-- Satelita (przelot) -->
  <g class="mpc-drone">
    <rect x="-5"  y="-2" width="10" height="4" rx="1" fill="#d7dfe5"/>
    <rect x="-13" y="-3" width="7"  height="6" fill="#2f6fb0"/>
    <rect x="6"   y="-3" width="7"  height="6" fill="#2f6fb0"/>
  </g>

  <!-- Regolit + kratery -->
  <path d="M0,84 Q40,74 80,82 T160,78 T240,86 L240,140 L0,140 Z" fill="url(#bt-mo-ground)"/>
  <g fill="#9c9a94">
    <ellipse cx="52"  cy="104" rx="22" ry="7"/>
    <ellipse cx="150" cy="120" rx="30" ry="9"/>
    <ellipse cx="216" cy="98"  rx="14" ry="5"/>
  </g>
  <g fill="#cfcdc7" opacity="0.7">
    <ellipse cx="52"  cy="102" rx="22" ry="6"/>
    <ellipse cx="150" cy="118" rx="30" ry="8"/>
  </g>

  <!-- Ladownik z beaconem + flaga -->
  <g transform="translate(190,96)">
    <path d="M-14,0 L-9,-14 L9,-14 L14,0 Z" fill="#d7dfe5"/>
    <rect x="-10" y="-20" width="20" height="7" rx="2" fill="#a8b4bd"/>
    <path d="M-12,0 L-17,10 M12,0 L17,10" stroke="#8a949c" stroke-width="2.6"/>
    <circle class="mpc-antenna-light" cx="0" cy="-24" r="3.2" fill="#f1c40f"/>
    <rect x="20" y="-22" width="1.8" height="22" fill="#8a949c"/>
    <path d="M21.8,-22 L34,-18 L21.8,-14 Z" fill="#e74c3c"/>
  </g>

  <!-- Pyl -->
  <g fill="#e8e6df" opacity="0.6">
    <circle class="mpd-particle" cx="96" cy="126" r="2"/>
    <circle class="mpd-particle mpd-p2" cx="40" cy="132" r="1.6"/>
    <circle class="mpd-particle mpd-p3" cx="170" cy="134" r="1.4"/>
  </g>
</svg>`.trim();
}
