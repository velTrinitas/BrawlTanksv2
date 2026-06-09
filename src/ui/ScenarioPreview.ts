/**
 * ScenarioPreview.ts — programmatic SVG backgrounds dla scenario card previews (FAZA 6 polish Runda 1.27).
 *
 * Tematy:
 * - KTB (Kill the Boss): pale wine/blood gradient + distant skull silhouettes + crossbones corners + red mist
 * - CTF (Capture the Flag): sky + sandy ground + fortified ruins (columns, broken walls)
 * - Castle (Defend the Castle): blue sky gradient + background cloud + parallax hills + grass blades
 *
 * Pattern matches MapPreview.ts — viewBox 240/140, programmatic art, no external assets.
 * Renderowane do .bt-scenario-card-preview, BEHIND emoji + ::before pseudo overlay.
 */

export type ScenarioPreviewId = 'ktb' | 'ctf' | 'castle';

const RENDERERS: Record<ScenarioPreviewId, () => string> = {
    ktb: renderKTB,
    ctf: renderCTF,
    castle: renderCastle,
};

export function renderScenarioPreview(id: ScenarioPreviewId): string {
    const renderer = RENDERERS[id];
    return renderer ? renderer() : '';
}

// ============================================================
// KTB — Kill the Boss
// Wine/blood red gradient, distant skull silhouettes, red mist, crossbones
// ============================================================
function renderKTB(): string {
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-scenario-preview-svg bt-sp-ktb" aria-hidden="true">
  <defs>
    <linearGradient id="bt-s-ktb-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#3a0e0e"/>
      <stop offset="45%" stop-color="#7a2a2a"/>
      <stop offset="80%" stop-color="#b86060"/>
      <stop offset="100%" stop-color="#d49090"/>
    </linearGradient>
    <radialGradient id="bt-s-ktb-mist" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#c84545" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#c84545" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Sky/atmosphere -->
  <rect width="240" height="140" fill="url(#bt-s-ktb-sky)"/>

  <!-- Red mist patches (atmospheric depth) -->
  <circle cx="60"  cy="50" r="30" fill="url(#bt-s-ktb-mist)"/>
  <circle cx="180" cy="40" r="35" fill="url(#bt-s-ktb-mist)"/>
  <circle cx="120" cy="90" r="40" fill="url(#bt-s-ktb-mist)"/>

  <!-- Distant skull silhouettes (background layer) -->
  <g opacity="0.18" fill="#1a0606">
    <!-- Skull silhouette left -->
    <ellipse cx="35" cy="108" rx="14" ry="11"/>
    <ellipse cx="35" cy="120" rx="11" ry="6"/>
    <!-- Skull silhouette right -->
    <ellipse cx="205" cy="105" rx="13" ry="10"/>
    <ellipse cx="205" cy="116" rx="10" ry="5"/>
  </g>

  <!-- Crossbones at bottom corners (decorative) -->
  <g opacity="0.32" stroke="#2a0808" stroke-width="2.5" stroke-linecap="round" fill="none">
    <!-- Left crossbone -->
    <line x1="8"  y1="132" x2="22" y2="118"/>
    <line x1="8"  y1="118" x2="22" y2="132"/>
    <!-- Right crossbone -->
    <line x1="218" y1="132" x2="232" y2="118"/>
    <line x1="218" y1="118" x2="232" y2="132"/>
  </g>

  <!-- Vignette darkening edges -->
  <rect width="240" height="140" fill="url(#bt-s-ktb-sky)" opacity="0" />
</svg>`;
}

// ============================================================
// CTF — Capture the Flag (Fortified Ruins)
// Pale sky + sandy ground + broken columns + ruined walls
// ============================================================
function renderCTF(): string {
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-scenario-preview-svg bt-sp-ctf" aria-hidden="true">
  <defs>
    <linearGradient id="bt-s-ctf-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#c4d8e8"/>
      <stop offset="55%"  stop-color="#e8d8b8"/>
      <stop offset="100%" stop-color="#c8a878"/>
    </linearGradient>
  </defs>

  <!-- Sky + ground gradient -->
  <rect width="240" height="140" fill="url(#bt-s-ctf-sky)"/>

  <!-- Distant ruined wall (left, 3rd plane) -->
  <g fill="#6b5e52" opacity="0.55">
    <rect x="18" y="68" width="22" height="48"/>
    <rect x="14" y="64" width="30" height="6"/>
    <!-- Broken top corner -->
    <polygon points="44,64 50,64 47,72 44,72"/>
    <!-- Crack -->
    <line x1="29" y1="72" x2="27" y2="100" stroke="#4a3d30" stroke-width="1"/>
  </g>

  <!-- Distant ruined wall (right, 3rd plane) -->
  <g fill="#6b5e52" opacity="0.55">
    <rect x="200" y="58" width="22" height="58"/>
    <rect x="196" y="54" width="30" height="6"/>
    <!-- Broken notch (top corner missing) -->
    <polygon points="222,54 222,70 216,70 218,54"/>
    <line x1="211" y1="60" x2="209" y2="95" stroke="#4a3d30" stroke-width="1"/>
  </g>

  <!-- Central broken column (2nd plane, focal) -->
  <g>
    <!-- Column shaft -->
    <rect x="113" y="48" width="14" height="68" fill="#857668"/>
    <!-- Column capital (top, broken) -->
    <rect x="109" y="44" width="22" height="6" fill="#9a8b7c"/>
    <polygon points="131,44 131,50 134,50" fill="#9a8b7c"/>
    <!-- Column base -->
    <rect x="109" y="114" width="22" height="6" fill="#9a8b7c"/>
    <!-- Vertical crack -->
    <polyline points="120,52 122,70 119,90 121,108" stroke="#5a4d40" stroke-width="1.2" fill="none"/>
    <!-- Horizontal break line (mid column) -->
    <line x1="113" y1="82" x2="127" y2="82" stroke="#5a4d40" stroke-width="1"/>
  </g>

  <!-- Scattered rubble in foreground -->
  <g fill="#8a7d70" opacity="0.55">
    <rect x="58" y="118" width="14" height="9" rx="1"/>
    <rect x="78" y="122" width="9" height="6" rx="1"/>
    <rect x="158" y="120" width="11" height="7" rx="1"/>
    <polygon points="180,127 188,120 192,127"/>
  </g>

  <!-- Sandy ground line -->
  <rect x="0" y="126" width="240" height="14" fill="#b89460" opacity="0.55"/>

  <!-- Tiny grass tufts (sparse desert vegetation) -->
  <g fill="#7a8a4a" opacity="0.6">
    <polygon points="50,128 52,123 54,128"/>
    <polygon points="100,128 102,122 104,128"/>
    <polygon points="140,128 142,124 144,128"/>
  </g>
</svg>`;
}

// ============================================================
// Castle — Defend the Castle
// Blue sky gradient + cloud (3rd plane) + hills + grass (foreground)
// ============================================================
function renderCastle(): string {
    return `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" class="bt-scenario-preview-svg bt-sp-castle" aria-hidden="true">
  <defs>
    <linearGradient id="bt-s-castle-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#5da9d8"/>
      <stop offset="55%" stop-color="#a8d8ec"/>
      <stop offset="100%" stop-color="#dceef5"/>
    </linearGradient>
  </defs>

  <!-- Sky with gradation -->
  <rect width="240" height="140" fill="url(#bt-s-castle-sky)"/>

  <!-- Cloud (3rd plane, distant atmospheric) -->
  <g fill="#ffffff" opacity="0.95">
    <!-- Main cloud body -->
    <ellipse cx="175" cy="32" rx="24" ry="9"/>
    <ellipse cx="163" cy="36" rx="16" ry="7"/>
    <ellipse cx="187" cy="38" rx="18" ry="8"/>
    <ellipse cx="178" cy="28" rx="14" ry="6"/>
  </g>
  <!-- Cloud underside shadow -->
  <g fill="#bccfd8" opacity="0.5">
    <ellipse cx="175" cy="42" rx="22" ry="3"/>
  </g>

  <!-- Distant hills (3rd plane, hazy blue-green) -->
  <path d="M 0 92 Q 40 78, 80 88 Q 130 78, 175 86 Q 215 80, 240 90 L 240 140 L 0 140 Z" fill="#7aa685" opacity="0.85"/>

  <!-- Foreground hills (2nd plane) -->
  <path d="M 0 108 Q 50 90, 110 102 Q 160 92, 210 100 Q 230 98, 240 102 L 240 140 L 0 140 Z" fill="#8ec47e"/>

  <!-- Subtle hill shading (depth) -->
  <path d="M 0 108 Q 50 90, 110 102 Q 160 92, 210 100 Q 230 98, 240 102 L 240 116 Q 230 112, 210 114 Q 160 110, 110 116 Q 50 110, 0 122 Z" fill="#7ab46a" opacity="0.5"/>

  <!-- Grass blades (foreground texture) -->
  <g fill="#4d8a5b">
    <polygon points="10,138 13,128 16,138"/>
    <polygon points="32,138 35,130 38,138"/>
    <polygon points="58,138 61,127 64,138"/>
    <polygon points="86,138 89,131 92,138"/>
    <polygon points="118,138 121,128 124,138"/>
    <polygon points="148,138 151,129 154,138"/>
    <polygon points="178,138 181,127 184,138"/>
    <polygon points="208,138 211,130 214,138"/>
    <polygon points="228,138 231,128 234,138"/>
  </g>
</svg>`;
}