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

export type PreviewType = 'desert' | 'cyberpunk' | 'tropics' | 'arctic';

/**
 * Map z generators per type.
 * Eksportowane oddzielnie zeby umozliwic czesciowy import (np. tylko desert dla testu).
 */
export const MapPreviews: Record<PreviewType, () => string> = {
    desert:    renderDesert,
    cyberpunk: renderCyberpunk,
    tropics:   renderTropics,
    arctic:    renderArctic,
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
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-desert" aria-hidden="true">
  <defs>
    <linearGradient id="bt-d-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffd89b"/>
      <stop offset="55%"  stop-color="#ffb976"/>
      <stop offset="100%" stop-color="#f4a55a"/>
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

  <!-- Sun + rays -->
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
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-cyberpunk" aria-hidden="true">
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
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-tropics" aria-hidden="true">
  <defs>
    <linearGradient id="bt-t-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#7be3a6"/>
      <stop offset="60%"  stop-color="#3da876"/>
      <stop offset="100%" stop-color="#1a6e4a"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect x="0" y="0" width="240" height="140" fill="url(#bt-t-sky)"/>

  <!-- Sun -->
  <circle cx="60" cy="32" r="10" fill="#ffeb88" opacity="0.75"/>
  <circle cx="60" cy="32" r="6"  fill="#fff5b0" opacity="0.6"/>

  <!-- Distant mountains -->
  <path d="M0,80 Q40,58 80,72 Q120,52 160,68 Q200,48 240,66 L240,100 L0,100 Z" fill="#2e8556" opacity="0.85"/>

  <!-- Waterfall (animated) -->
  <g>
    <rect x="168" y="60" width="22" height="56" fill="#a7e9c8" opacity="0.5"/>
    <line class="mpt-fall mpt-fl1" x1="172" y1="60" x2="172" y2="116" stroke="#fff" stroke-width="0.9" opacity="0.55"/>
    <line class="mpt-fall mpt-fl2" x1="178" y1="60" x2="178" y2="116" stroke="#fff" stroke-width="0.9" opacity="0.7"/>
    <line class="mpt-fall mpt-fl3" x1="184" y1="60" x2="184" y2="116" stroke="#fff" stroke-width="0.9" opacity="0.6"/>
    <!-- Waterfall splash -->
    <ellipse cx="179" cy="116" rx="14" ry="2" fill="#fff" opacity="0.5"/>
  </g>

  <!-- Foreground river -->
  <path d="M0,108 Q60,106 120,110 T240,108 L240,140 L0,140 Z" fill="#2da575"/>
  <!-- River shimmer -->
  <line x1="30"  y1="120" x2="60"  y2="120" stroke="#a7e9c8" stroke-width="0.8" opacity="0.5"/>
  <line x1="100" y1="125" x2="140" y2="125" stroke="#a7e9c8" stroke-width="0.8" opacity="0.5"/>
  <line x1="170" y1="122" x2="210" y2="122" stroke="#a7e9c8" stroke-width="0.8" opacity="0.5"/>

  <!-- Palm tree 1 (left) -->
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

  <!-- Palm tree 2 (right, smaller) -->
  <g class="mpt-palm mpt-palm-2" transform="translate(195,12) scale(0.78)">
    <line x1="20" y1="118" x2="18" y2="62" stroke="#5d3a1a" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M18,62 Q-2,57 -12,67 Q1,58 18,64 Z" fill="#1e6e3a"/>
    <path d="M18,62 Q7,47 -3,52 Q11,50 18,64 Z" fill="#28854a"/>
    <path d="M18,62 Q29,47 39,52 Q25,50 18,64 Z" fill="#1e6e3a"/>
    <circle cx="15" cy="66" r="1.4" fill="#3d2510"/>
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
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-map-preview-svg bt-mp-arctic" aria-hidden="true">
  <defs>
    <linearGradient id="bt-a-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#bce0f5"/>
      <stop offset="60%"  stop-color="#5dade2"/>
      <stop offset="100%" stop-color="#2c5f8a"/>
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

  <!-- Smaller ice peak (right) -->
  <g>
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

  <!-- Snowflakes (8) -->
  <g fill="#fff">
    <circle class="mpa-snow mpa-s1" cx="20"  cy="20"  r="1"/>
    <circle class="mpa-snow mpa-s2" cx="60"  cy="35"  r="1.2"/>
    <circle class="mpa-snow mpa-s3" cx="110" cy="15"  r="0.9"/>
    <circle class="mpa-snow mpa-s4" cx="160" cy="28"  r="1.1"/>
    <circle class="mpa-snow mpa-s5" cx="200" cy="42"  r="1"/>
    <circle class="mpa-snow mpa-s6" cx="80"  cy="10"  r="0.8"/>
    <circle class="mpa-snow mpa-s7" cx="220" cy="22"  r="1"/>
    <circle class="mpa-snow mpa-s8" cx="40"  cy="50"  r="1.1"/>
  </g>
</svg>`.trim();
}