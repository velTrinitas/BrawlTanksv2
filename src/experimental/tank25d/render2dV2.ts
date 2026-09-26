// @ts-nocheck
/**
 * render2dV2.ts — TANK ART v2: paintery czolgow GRACZA (bake: TankSpriteBaker, Garaz: tankTurntable, podglad: tankart-preview.html).
 *
 * @ts-nocheck jak render2d.ts (ten sam precedens: art Canvas2D, obiekty brawlera bez typow).
 *
 * Osobny modul painterow "rebuild" 8 czolgow gracza. Uzywa TEJ SAMEJ kamery co gra
 * (applyTransform / CAMERA_TILT_Y / Z_TO_SCREEN z render2d) i tych samych wymiarow
 * kadlubow/wiez/luf (BRAWLERS z render2d), wiec podglad jest wierna kopia tego, co
 * upieklby TankSpriteBaker. render2d.ts (produkcja, wrogowie) NIE jest modyfikowany.
 *
 * Co jest nowe wzgledem v1 (wspolne dla 8 czolgow):
 *  - swiatlo STALE W SWIECIE (gora-lewo): scianki ekstruzji cieniowane w przestrzeni
 *    ekranu (nie obracaja sie z czolgiem), AO pod wieza, faza krawedzi hull top,
 *  - gasienice v2: grubsze ogniwa z gumowymi nakladkami, 3 kola jezdne/strone,
 *    wieksza zebatka i napinacz — wszystko obraca sie z `treadShift`,
 *  - obrys 2 px (czytelnosc przy zoom 0.6),
 *  - dekale: flaga (18 flag z config/flags.ts) + NUMER czolgu (stencil geometryczny,
 *    zero fontu) na tyle wiezy i na kadlubie,
 *  - per czolg: nowy kadlub / wieza / lufa dopasowane do nazwy (patrz painterzy nizej).
 *
 * Determinizm: painterzy NIE czytaja performance.now(). Faza animacji (puls neonu,
 * plomien pilotowy itd.) idzie WYLACZNIE z `opts.phase` (0..1) — bake podaje stala.
 * `opts.liveCanvas` = true (Garaz/podglad): zero shadowBlur, halo rysowane elipsami.
 */
import { applyTransform, CAMERA_TILT_Y, Z_TO_SCREEN, derive, BRAWLERS } from './render2d';
import { getFlag } from '../../config/flags';

// ─────────────────────────────────────────────────────────────────────────────
// Kolory / helpery
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgb(h) { return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }; }
function rgbToHex(r, g, b) { const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
function darken(h, f) { const { r, g, b } = hexToRgb(h); return rgbToHex(r * f, g * f, b * f); }
function lighten(h, f) { const { r, g, b } = hexToRgb(h); return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
function lerpColor(c1, c2, t) { const a = hexToRgb(c1), b = hexToRgb(c2); return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t); }
function numToHex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6); }
function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function flashColors(c, k) {
  return { main: lerpColor(c.main, '#ffffff', k), light: lerpColor(c.light, '#ffffff', k), bright: lerpColor(c.bright, '#ffffff', k),
    dark: lerpColor(c.dark, '#ffffff', k * 0.85), deep: lerpColor(c.deep, '#ffffff', k * 0.85), outline: lerpColor(c.outline, '#ffffff', k * 0.7) };
}

/** Kierunek swiatla w przestrzeni EKRANU (gora-lewo), spojny z drop shadow (+5,+12). */
const LIGHT_X = -0.62, LIGHT_Y = -0.78;
/** Obrys v2: 2 px (v1: 1.5). */
const OUTLINE_W = 2;
/** Z ekstruzji kadluba (v1: 8). Pancerny dostaje 10 (+5% budzet). */
const HULL_Z = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Konfiguracja v2 (rozszerza BRAWLERS z render2d — wymiary NIE zmienione)
// ─────────────────────────────────────────────────────────────────────────────
const V2_EXTRA = {
  twardy: { hullZ: 8,  theme: 'veteran',  outline: null },
  // Pancerny: barrelType 'twin' => getMuzzlePos (lab/fire.ts) daje 2 wyloty (+-8) = 2 pociski z 2 luf.
  heavy:  { hullZ: 10, theme: 'fortress', outline: null, barrelType: 'twin' },
  // Zwiad: +8% (Mariusz: "wizualnie zbyt maly") — przekracza budzet 5% o 3 pkt, do decyzji.
  scout:  { hullZ: 7,  theme: 'hornet',   outline: null, size: 1.08 },
  sniper: { hullZ: 8,  theme: 'hawk',     outline: null },
  plasma: { hullZ: 8,  theme: 'reactor',  outline: null },
  pyro:   { hullZ: 9,  theme: 'dragon',   outline: null },
  // Shadow: najciemniejszy czolg — obrys JASNIEJSZY niz dark (czytelnosc na ciemnych mapach).
  shadow: { hullZ: 8,  theme: 'wraith',   outline: '#8a84ac' },
  king:   { hullZ: 9,  theme: 'monarch',  outline: null },
};

export const BRAWLERS_V2 = BRAWLERS.map(b => {
  const ex = V2_EXTRA[b.id] || { hullZ: HULL_Z, theme: 'veteran', outline: null };
  const colors = { ...b.colors };
  if (ex.outline) colors.outline = ex.outline;
  return { ...b, ...ex, look: 'v2', colors };
});

export function brawlerV2(id) { return BRAWLERS_V2.find(b => b.id === id) || BRAWLERS_V2[0]; }

/** Skin (SKIN-1) na v2: podmiana palety jak w TankSpriteBaker (color + colors). */
export function withSkin(b, hex) {
  if (!hex) return b;
  const colors = derive(hex);
  if (b.outline) colors.outline = b.outline;
  return { ...b, color: hex, colors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prymitywy
// ─────────────────────────────────────────────────────────────────────────────
function roundRectPath(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

/** Ksztalty kadluba v2. 'wedge' (Zwiad) i 'faceted' (Shadow) sa nowe; reszta = v1 (te same wymiary). */
function hullPath(ctx, shape, w, h) {
  const hx = w / 2, hy = h / 2;
  ctx.beginPath();
  if (shape === 'angular' || shape === 'faceted') {
    const c = 12;
    ctx.moveTo(-hx + c, -hy); ctx.lineTo(hx - c, -hy); ctx.quadraticCurveTo(hx, -hy, hx, -hy + c);
    ctx.lineTo(hx, hy - c); ctx.quadraticCurveTo(hx, hy, hx - c, hy); ctx.lineTo(-hx + c, hy);
    ctx.quadraticCurveTo(-hx, hy, -hx, hy - c); ctx.lineTo(-hx, -hy + c); ctx.quadraticCurveTo(-hx, -hy, -hx + c, -hy); ctx.closePath();
  } else if (shape === 'wedge') {
    const fr = hy * 0.62;
    ctx.moveTo(-hx + 10, -hy); ctx.lineTo(hx - 22, -hy); ctx.lineTo(hx - 2, -fr);
    ctx.quadraticCurveTo(hx + 1, 0, hx - 2, fr); ctx.lineTo(hx - 22, hy); ctx.lineTo(-hx + 10, hy);
    ctx.quadraticCurveTo(-hx, hy, -hx, hy - 10); ctx.lineTo(-hx, -hy + 10); ctx.quadraticCurveTo(-hx, -hy, -hx + 10, -hy); ctx.closePath();
  } else {
    ctx.roundRect(-hx, -hy, w, h, 13);
  }
}

/** Ksztalty wiezy v2 (same rozmiary co v1). */
function turretPath(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'chamfered_cube' || shape === 'chamfered_cube_tech') {
    const w = r * 1.05, h = r * 1.0, c = r * 0.28;
    ctx.moveTo(-w + c, -h); ctx.lineTo(w - c, -h); ctx.lineTo(w, -h + c); ctx.lineTo(w, h - c); ctx.lineTo(w - c, h);
    ctx.lineTo(-w + c, h); ctx.lineTo(-w, h - c); ctx.lineTo(-w, -h + c); ctx.closePath();
  } else if (shape === 'heavy_octagon') {
    const rr = r * 1.05;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.closePath();
  } else if (shape === 'low_oval') {
    ctx.ellipse(0, 0, r * 1.15, r * 0.78, 0, 0, Math.PI * 2);
  } else if (shape === 'scout_rect') {
    // Zwiad: prostokat, DLUZSZY bok wzdluz osi lufy; lufa wychodzi z KROTSZEJ krawedzi (przod).
    const w = r * 1.25, h = r * 0.8, rad = r * 0.18;
    ctx.moveTo(-w + rad, -h); ctx.lineTo(w - rad, -h); ctx.quadraticCurveTo(w, -h, w, -h + rad); ctx.lineTo(w, h - rad);
    ctx.quadraticCurveTo(w, h, w - rad, h); ctx.lineTo(-w + rad, h); ctx.quadraticCurveTo(-w, h, -w, h - rad);
    ctx.lineTo(-w, -h + rad); ctx.quadraticCurveTo(-w, -h, -w + rad, -h); ctx.closePath();
  } else if (shape === 'tall_rect') {
    const w = r * 0.78, h = r * 1.15, rad = r * 0.22;
    ctx.moveTo(-w + rad, -h); ctx.lineTo(w - rad, -h); ctx.quadraticCurveTo(w, -h, w, -h + rad); ctx.lineTo(w, h - rad);
    ctx.quadraticCurveTo(w, h, w - rad, h); ctx.lineTo(-w + rad, h); ctx.quadraticCurveTo(-w, h, -w, h - rad);
    ctx.lineTo(-w, -h + rad); ctx.quadraticCurveTo(-w, -h, -w + rad, -h); ctx.closePath();
  } else if (shape === 'wide_cylinder') {
    ctx.ellipse(0, 0, r * 1.25, r * 0.95, 0, 0, Math.PI * 2);
  } else if (shape === 'faceted_hex') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = Math.cos(a) * r, py = Math.sin(a) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

/**
 * Ekstruzja v2 = stos warstw (jak v1, bezpieczny przy obrocie) + CIENIOWANIE W PRZESTRZENI
 * EKRANU: clip do sumy warstw i gradient swiatla (lewa-gora jasniej, prawa-dol ciemniej).
 * Bryla ma "strone oswietlona" niezaleznie od kata czolgu. Top face rysuje caller PO tym.
 */
function extrudeV2(ctx, pathFn, tx, ty, baseZ, rot, sc, tiltMul, colorSide, colorDeep, colorOutline, zH, shadeK = 1) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const layers = Math.max(1, Math.ceil(zH));
  const zStep = zH / layers;
  const mats = [];
  for (let i = 0; i <= layers; i++) {
    ctx.save();
    applyTransform(ctx, tx, ty, baseZ + i * zStep, rot, sc, tiltMul);
    mats.push(ctx.getTransform());
    ctx.fillStyle = lerpColor(colorDeep, colorSide, i / layers);
    pathFn(); ctx.fill();
    ctx.restore();
  }
  // Swiatlo w ekranie: jedna sciezka = suma wszystkich warstw (nonzero), gradient wzdluz LIGHT.
  ctx.save();
  const p = new Path2D();
  for (const m of mats) {
    ctx.save(); ctx.setTransform(m); pathFn(); ctx.restore();
    // pathFn zbudowal sciezke w ctx — przepisz do Path2D przez ponowne wywolanie z macierza
  }
  // (Canvas nie pozwala odczytac sciezki z ctx, wiec budujemy clip inaczej: kazda warstwa
  //  osobno przez wielokrotny clip nie dziala (przeciecie). Rysujemy wiec gradient przez
  //  'source-atop' na tymczasowym zlozeniu: warstwy juz sa na plotnie, wiec source-atop
  //  ograniczony do bboxa bryly zabarwilby tez to, co pod spodem. Zamiast tego: nakladamy
  //  gradient warstwa po warstwie (kazda warstwa = clip + fill) — koszt bake-time, zero runtime.)
  ctx.restore();
  const m0 = mats[0]; const cx = m0.e, cy = m0.f; const span = 90 * Math.max(Math.abs(m0.a), Math.abs(m0.d));
  for (let i = 0; i <= layers; i++) {
    ctx.save();
    ctx.setTransform(mats[i]); pathFn(); ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(cx + LIGHT_X * span, cy + LIGHT_Y * span, cx - LIGHT_X * span, cy - LIGHT_Y * span);
    g.addColorStop(0, `rgba(255,255,255,${0.22 * shadeK})`);
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.38 * shadeK})`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - span * 2, cy - span * 2, span * 4, span * 4);
    ctx.restore();
  }
  // Obrys dolnej krawedzi (kontakt z podloga) — grubszy, czytelny.
  ctx.save(); ctx.setTransform(mats[0]);
  ctx.strokeStyle = colorOutline; ctx.lineWidth = OUTLINE_W; pathFn(); ctx.stroke();
  ctx.restore();
}

/** Gradient walca (pionowy, w ukladzie lufy): gora jasna -> dol ciemny = fake 3D. */
function vgrad(ctx, y, th, color) {
  const g = ctx.createLinearGradient(0, y - th / 2, 0, y + th / 2);
  g.addColorStop(0, lighten(color, 0.55)); g.addColorStop(0.28, lighten(color, 0.18)); g.addColorStop(0.62, color); g.addColorStop(1, darken(color, 0.45));
  return g;
}

/** Wylot lufy z glebia: pierscien (rant) + otwor + polksiezyc swiatla na krawedzi. */
function muzzleHole(ctx, x, y, th, side, ol) {
  ctx.fillStyle = darken(side, 0.55); ctx.beginPath(); ctx.ellipse(x, y, th * 0.3, th * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.ellipse(x + 0.4, y, th * 0.2, th * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, th * 0.3, th * 0.5, 0, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(x - th * 0.06, y - th * 0.14, th * 0.08, th * 0.14, 0, 0, Math.PI * 2); ctx.fill();
}

/** Lufa-cylinder v2 (os pozioma w ukladzie lufy): obrys, gradient walca, cien, blik, wylot z glebia. */
function cylinder(ctx, x1, y1, x2, y2, th, side, top, ol, noHole = false) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = ol; ctx.lineWidth = th + 3.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = vgrad(ctx, y1, th, side); ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = Math.max(1, th * 0.14); ctx.beginPath(); ctx.moveTo(x1 + 2, y1 - th * 0.26); ctx.lineTo(x2 - 2, y2 - th * 0.26); ctx.stroke();
  ctx.lineCap = 'butt';
  if (!noHole) muzzleHole(ctx, x2, y2, th, side, ol);
}

/** Klocek (hamulec/kolnierz/mocowanie) z gradientem walca. */
function block(ctx, x, y, w, h, r, side, ol) {
  ctx.fillStyle = vgrad(ctx, y + h / 2, h, side); roundRectPath(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = ol; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.12));
}

/** Pierscien/kolnierz na lufie (prostopadly do osi). */
function ring(ctx, x, th, w, fill, ol) { block(ctx, x - w / 2, -th / 2, w, th, 1.5, fill, ol); }

/** Halo (glow). bake => shadowBlur (darmowe w bake); live => 3 kola alfa (Garaz bez blur). */
function glow(ctx, x, y, r, color, alpha, live) {
  if (!live) {
    ctx.save(); ctx.shadowBlur = r * 1.6; ctx.shadowColor = color;
    ctx.fillStyle = rgba(color, alpha); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  } else {
    ctx.fillStyle = rgba(color, alpha * 0.35); ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(color, alpha * 0.6); ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(color, alpha); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function rivet(ctx, x, y, c, r = 1.9) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 0.6, y + 0.8, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.outline; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.light; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.5, 0, Math.PI * 2); ctx.fill();
}

// ─────────────────────────────────────────────────────────────────────────────
// DEKALE: numer (stencil geometryczny) + flaga (18 flag z config/flags.ts)
// ─────────────────────────────────────────────────────────────────────────────
const DIGITS = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};
/** Numer czolgu: plytka stencil (ciemna) + biale cyfry. (x,y) = srodek, h = wysokosc cyfr. */
export function drawStencilNumber(ctx, text, x, y, h, opts = {}) {
  const str = String(text).padStart(2, '0').slice(-2);
  const cell = h / 5; const gap = cell * 0.9;
  const dw = cell * 3; const totalW = str.length * dw + (str.length - 1) * gap;
  const pad = cell * 0.9;
  ctx.save(); ctx.translate(x, y);
  if (opts.rotate) ctx.rotate(opts.rotate);
  ctx.fillStyle = opts.plate || 'rgba(10,8,14,0.72)';
  roundRectPath(ctx, -totalW / 2 - pad, -h / 2 - pad, totalW + pad * 2, h + pad * 2, cell * 0.8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = opts.color || '#f2f2ee';
  let ox = -totalW / 2;
  for (const ch of str) {
    const bm = DIGITS[ch] || DIGITS['0'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (bm[r][c] === '1') ctx.fillRect(ox + c * cell, -h / 2 + r * cell, cell + 0.15, cell + 0.15);
    }
    ox += dw + gap;
  }
  ctx.restore();
}

function drawProfileFlag(ctx, flagId, w, h) {
  let cfg = null;
  try { cfg = getFlag(flagId); } catch { cfg = null; }
  if (!cfg) return;
  const p = numToHex(cfg.colors.primary), s = numToHex(cfg.colors.secondary), t = numToHex(cfg.colors.tertiary ?? cfg.colors.primary);
  const x = -w / 2, y = -h / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (cfg.pattern === 'horizontal_2') { ctx.fillStyle = p; ctx.fillRect(x, y - 1, w, h / 2 + 1); ctx.fillStyle = s; ctx.fillRect(x, y + h / 2, w, h / 2 + 1); }
  else if (cfg.pattern === 'horizontal_3') { ctx.fillStyle = p; ctx.fillRect(x, y - 1, w, h / 3 + 1); ctx.fillStyle = s; ctx.fillRect(x, y + h / 3, w, h / 3); ctx.fillStyle = t; ctx.fillRect(x, y + 2 * h / 3, w, h / 3 + 1); }
  else { ctx.fillStyle = p; ctx.fillRect(x, y - 1, w / 3, h + 2); ctx.fillStyle = s; ctx.fillRect(x + w / 3, y - 1, w / 3, h + 2); ctx.fillStyle = t; ctx.fillRect(x + 2 * w / 3, y - 1, w / 3, h + 2); }
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(x + w * 0.55, y - 1, w * 0.12, h + 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,10,30,0.75)'; ctx.lineWidth = 0.9; ctx.strokeRect(x, y, w, h);
}

/**
 * Flaga: LEZY na kadlubie z tylu (dekal, bez masztu), NIE wystaje za obrys — 2 px marginesu
 * od tylnej krawedzi kadluba. Rozmiar 18x12, biala obwodka (czytelnosc przy zoom 0.6).
 */
function drawFlagOnHull(ctx, b, c, flagId) {
  if (!flagId) return;
  const hx = b.hullW / 2; const FW = 18, FH = 12;
  ctx.save(); ctx.translate(-hx + 2 + FW / 2, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-FW / 2 - 0.6, -FH / 2 + 0.8, FW + 1.6, FH + 1.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.3; ctx.strokeRect(-FW / 2, -FH / 2, FW, FH);
  drawProfileFlag(ctx, flagId, FW, FH);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// CIEN + GASIENICE v2
// ─────────────────────────────────────────────────────────────────────────────
function dropShadow(ctx, x, y, b, hullAngle) {
  const sz = b.size;
  ctx.save(); ctx.translate(x + 5 * sz, y + 12 * sz); ctx.scale(1, CAMERA_TILT_Y); ctx.rotate(hullAngle);
  const w = (b.hullW + 12) * sz * 1.04, h = (b.hullH + 22) * sz * 1.02;
  ctx.fillStyle = 'rgba(20,10,30,0.20)'; roundRectPath(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 16); ctx.fill();
  ctx.fillStyle = 'rgba(20,10,30,0.30)'; roundRectPath(ctx, -w / 2, -h / 2, w, h, 13); ctx.fill();
  ctx.restore();
}

/** Gasienice v2. `treadShift` ciagly. 1 ogniwo (TREAD_LINK) = 1 zab zebatki (obrot spojny). */
export const TREAD_LINK = 6;
function treadsV2(ctx, b, c, treadShift) {
  const w = b.hullW, h = b.hullH;
  const treadW = w + 10, treadOff = h / 2 + 4, treadH = 15, innerH = 11;
  const ts = treadShift || 0;
  const shift = ((-ts % TREAD_LINK) + TREAD_LINK) % TREAD_LINK;
  for (const side of [-1, 1]) {
    const ty = side * treadOff;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRectPath(ctx, -treadW / 2 + 1, ty - treadH / 2 + 2.5, treadW, treadH, 5); ctx.fill();
    ctx.fillStyle = '#07040c'; roundRectPath(ctx, -treadW / 2, ty - treadH / 2, treadW, treadH, 5); ctx.fill();
    ctx.fillStyle = '#1f1733'; roundRectPath(ctx, -treadW / 2 + 1.5, ty - innerH / 2, treadW - 3, innerH, 3.5); ctx.fill();
    const linkW = TREAD_LINK - 1.6, linkH = innerH - 2;
    for (let x = -treadW / 2 + 5 + shift - TREAD_LINK; x < treadW / 2 - 6; x += TREAD_LINK) {
      ctx.fillStyle = '#000'; roundRectPath(ctx, x + 0.5, ty - linkH / 2 + 0.6, linkW, linkH, 1); ctx.fill();
      ctx.fillStyle = '#3b2b52'; roundRectPath(ctx, x, ty - linkH / 2, linkW, linkH, 1); ctx.fill();
      ctx.fillStyle = '#6a5a86'; roundRectPath(ctx, x + 0.9, ty - linkH / 2 + 0.7, linkW - 1.8, linkH * 0.42, 0.8); ctx.fill();
      ctx.fillStyle = '#8c7cab'; ctx.fillRect(x + 1.1, ty - linkH / 2 + 0.9, linkW - 2.2, 0.9);
    }
    ctx.strokeStyle = 'rgba(170,150,205,0.35)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-treadW / 2 + 5, ty - treadH / 2 + 1.2); ctx.lineTo(treadW / 2 - 5, ty - treadH / 2 + 1.2); ctx.stroke();
  }
  const rot = (ts / TREAD_LINK) * (Math.PI * 2 / 8);
  const wheel = (x, ty, r, teeth, spokes) => {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + 1, ty + 1.2, r + 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b4b70'; ctx.beginPath(); ctx.arc(x, ty, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#07040c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#2b1f40';
    if (teeth) for (let t = 0; t < teeth; t++) {
      const a = (t / teeth) * Math.PI * 2 + rot;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.18) * (r - 1.2), ty + Math.sin(a - 0.18) * (r - 1.2));
      ctx.lineTo(x + Math.cos(a) * (r + 1.3), ty + Math.sin(a) * (r + 1.3));
      ctx.lineTo(x + Math.cos(a + 0.18) * (r - 1.2), ty + Math.sin(a + 0.18) * (r - 1.2)); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#8c7cab'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, ty, r * 0.68, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#2b1f40'; ctx.lineWidth = 1;
    for (let s = 0; s < spokes; s++) { const a = (s / spokes) * Math.PI * 2 + rot; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 1.5, ty + Math.sin(a) * 1.5); ctx.lineTo(x + Math.cos(a) * (r * 0.66), ty + Math.sin(a) * (r * 0.66)); ctx.stroke(); }
    ctx.fillStyle = '#8c7cab'; ctx.beginPath(); ctx.arc(x, ty, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b1f40'; ctx.beginPath(); ctx.arc(x, ty, 0.9, 0, Math.PI * 2); ctx.fill();
  };
  for (const side of [-1, 1]) {
    const ty = side * treadOff;
    wheel(treadW / 2 - 5, ty, 5.6, 8, 4);
    wheel(-treadW / 2 + 5, ty, 4.8, 0, 3);
    const n = 3; const x0 = -treadW / 2 + 14, x1 = treadW / 2 - 14;
    for (let i = 0; i < n; i++) wheel(x0 + (x1 - x0) * (i / (n - 1)), ty, 3.6, 0, 3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WSPOLNE ELEMENTY HULL TOP
// ─────────────────────────────────────────────────────────────────────────────
function hullTopBase(ctx, b, c, shape, isSuper) {
  const w = b.hullW, h = b.hullH; const hx = w / 2, hy = h / 2;
  ctx.fillStyle = isSuper ? c.bright : c.main;
  hullPath(ctx, shape, w, h); ctx.fill();
  ctx.save(); hullPath(ctx, shape, w, h); ctx.clip();
  const g = ctx.createLinearGradient(-hx, 0, hx, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,0.10)');
  ctx.fillStyle = g; ctx.fillRect(-hx, -hy, w, h);
  ctx.restore();
}

/** Faza krawedzi w przestrzeni ekranu: jasna od swiatla, ciemna po przeciwnej. */
function bevelScreen(ctx, pathFn, strength = 1) {
  ctx.save(); pathFn(); ctx.clip();
  const m = ctx.getTransform();
  const inv = m.inverse();
  const lx = inv.a * LIGHT_X + inv.c * LIGHT_Y, ly = inv.b * LIGHT_X + inv.d * LIGHT_Y;
  const len = Math.hypot(lx, ly) || 1; const ux = lx / len * 1.6, uy = ly / len * 1.6;
  ctx.lineWidth = 2.6 * strength;
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * strength})`; ctx.save(); ctx.translate(ux, uy); pathFn(); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = `rgba(0,0,0,${0.5 * strength})`; ctx.save(); ctx.translate(-ux, -uy); pathFn(); ctx.stroke(); ctx.restore();
  ctx.restore();
}

/** Blysk "anime" 45 st. w ekranie (jak v1, ciut slabszy). */
function glareScreen(ctx, pathFn, w, h, alpha = 0.32) {
  ctx.save(); pathFn(); ctx.clip();
  const m = ctx.getTransform(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(m.e, m.f); ctx.rotate(-Math.PI / 4);
  const len = Math.hypot(w, h) * Math.max(Math.abs(m.a), Math.abs(m.d)) * 1.5;
  const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  g.addColorStop(0.40, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${alpha})`); g.addColorStop(0.60, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(-len, -len, len * 2, len * 2);
  ctx.restore();
}

/** AO pod wieza (na hull top, w warstwie kadluba — kolo = niezalezne od kata wiezy). */
function turretAO(ctx, b) {
  const r = b.turretRadius * 1.18;
  const g = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
  g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
}

function engineGrill(ctx, x, y, w, h, c, slats = 4) {
  ctx.fillStyle = c.deep; roundRectPath(ctx, x, y, w, h, 1.5); ctx.fill();
  ctx.strokeStyle = c.outline; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = '#0a0810';
  for (let i = 0; i < slats; i++) { const sx = x + 2 + i * ((w - 4) / slats); ctx.fillRect(sx, y + 1.5, (w - 4) / slats - 1.2, h - 3); }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 1, y + 0.8, w - 2, 0.9);
}

function hatch(ctx, x, y, r, c) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 0.8, y + 1, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.dark; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = c.outline; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = c.main; ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.outline; ctx.fillRect(x - r * 0.9, y - 0.6, r * 0.5, 1.2);
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINTERZY PER CZOLG — HULL TOP
// ─────────────────────────────────────────────────────────────────────────────
const HULL_SHAPE_V2 = { twardy: 'standard', heavy: 'armored', scout: 'wedge', sniper: 'slim', plasma: 'tech', pyro: 'wide', shadow: 'faceted', king: 'royal' };

function hullTopV2(ctx, b, c, o) {
  const id = b.id; const w = b.hullW, h = b.hullH; const hx = w / 2, hy = h / 2;
  const shape = HULL_SHAPE_V2[id] || 'standard';
  const path = () => hullPath(ctx, shape, w, h);
  const live = o.liveCanvas; const ph = o.phase || 0;
  hullTopBase(ctx, b, c, shape, o.isSuper);
  if (o.drawSkin) { ctx.save(); path(); ctx.clip(); o.drawSkin(ctx, b, c, 'hull'); ctx.restore(); }

  if (id === 'twardy') {
    // WETERAN: duze plamy moro, przednia plyta z workami z piaskiem, zapasowe ogniwa, grill silnika
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = '#1b5a22';
    [[-hx * 0.5, -hy * 0.35, 10, 7, 0.4], [hx * 0.1, -hy * 0.55, 7, 10, -0.3], [-hx * 0.15, hy * 0.45, 12, 7, 0.6], [hx * 0.55, hy * 0.35, 8, 9, -0.5], [-hx * 0.75, hy * 0.1, 6, 8, 0.8]]
      .forEach(([sx, sy, sw, sh, r]) => { ctx.save(); ctx.translate(sx, sy); ctx.rotate(r); ctx.beginPath(); ctx.ellipse(0, 0, sw, sh, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    ctx.fillStyle = 'rgba(120,110,50,0.45)';
    [[-hx * 0.3, -hy * 0.15, 5, 6], [hx * 0.35, hy * 0.55, 6, 4], [-hx * 0.5, hy * 0.5, 4, 5]].forEach(([sx, sy, sw, sh]) => { ctx.beginPath(); ctx.ellipse(sx, sy, sw, sh, 0.3, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    ctx.fillStyle = c.light; roundRectPath(ctx, hx - 19, -hy + 3, 16, h - 6, 4); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1; ctx.stroke();
    // plyta czolowa: dodatkowe ogniwa gasienicy jako pancerz (2 pasy) + haki holownicze
    ctx.fillStyle = '#1a1525';
    for (let y = -hy + 6; y < -hy + 16; y += 3.4) { roundRectPath(ctx, hx - 16, y, 10, 2.6, 0.6); ctx.fill(); }
    for (let y = hy - 16; y < hy - 6; y += 3.4) { roundRectPath(ctx, hx - 16, y, 10, 2.6, 0.6); ctx.fill(); }
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.6; ctx.strokeRect(hx - 16.5, -hy + 5.5, 11, 11.5); ctx.strokeRect(hx - 16.5, hy - 16.5, 11, 11.5);
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx - 4, -hy + 7, 2, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(hx - 4, hy - 7, 2, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.fillStyle = '#efe4a8'; ctx.beginPath(); ctx.ellipse(hx - 8, 0, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1a2a0a'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(hx - 8.6, -0.8, 0.8, 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1525';
    for (let x = -hx + 26; x < -hx + 46; x += 4) { roundRectPath(ctx, x, -hy + 4, 3.2, 6, 0.6); ctx.fill(); }
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.6; ctx.strokeRect(-hx + 25.5, -hy + 3.5, 21, 7);
    engineGrill(ctx, -hx + 6, -8, 14, 16, c, 4);
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-15, -hy); ctx.lineTo(-15, hy); ctx.moveTo(12, -hy); ctx.lineTo(12, hy); ctx.stroke();
    [[-hx + 6, -hy + 6], [hx - 6, -hy + 6], [-hx + 6, hy - 6], [hx - 6, hy - 6], [0, -hy + 5], [0, hy - 5]].forEach(([x, y]) => rivet(ctx, x, y, c));
    ctx.strokeStyle = c.deep; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-hx + 8, -hy + 10); ctx.lineTo(-hx + 14, -hy + 18); ctx.lineTo(-hx + 10, -hy + 25); ctx.lineTo(-hx + 16, hy - 8); ctx.stroke();
    drawStencilNumber(ctx, o.number, -hx + 33, hy - 7, 6.5);
  }

  else if (id === 'heavy') {
    // FORTECA: plyty na rogach, blok silnika z wlotami, lemiesz z zebami, wielkie nity
    ctx.fillStyle = c.dark;
    [[-hx + 4, -hy + 4], [hx - 14, -hy + 4], [-hx + 4, hy - 14], [hx - 14, hy - 14]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 10, py); ctx.lineTo(px, py + 10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.stroke();
    });
    ctx.fillStyle = c.deep; roundRectPath(ctx, -hx + 5, -hy * 0.62, 20, hy * 1.24, 2.5); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(-hx + 6, -hy * 0.62 + 1, 18, 1.2);
    engineGrill(ctx, -hx + 8, -hy * 0.5, 14, hy * 0.42, c, 3); engineGrill(ctx, -hx + 8, hy * 0.08, 14, hy * 0.42, c, 3);
    const bf = hx + 4, bm = hx - 3;
    ctx.fillStyle = '#3a2540'; ctx.beginPath(); ctx.moveTo(bf, -hy * 0.68); ctx.lineTo(bm, -hy * 0.96); ctx.lineTo(bm, hy * 0.96); ctx.lineTo(bf, hy * 0.68); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a0a20'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#d9d2c4';
    for (let i = 0; i < 5; i++) { const y = -hy * 0.55 + i * (hy * 1.1 / 4); ctx.beginPath(); ctx.moveTo(bf - 0.5, y - 3); ctx.lineTo(bf + 3.5, y); ctx.lineTo(bf - 0.5, y + 3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#1a0a20'; ctx.lineWidth = 0.6; ctx.stroke(); }
    ctx.fillStyle = c.light; ctx.fillRect(bm, -hy * 0.9, 1.6, hy * 1.8);
    ctx.fillStyle = '#1a0a20'; [-hy * 0.7, -hy * 0.35, 0, hy * 0.35, hy * 0.7].forEach(by => { ctx.beginPath(); ctx.arc(bm + 3.5, by, 1.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.save(); ctx.translate(-hx + 32, hy - 13); ctx.rotate(-0.15); ctx.fillStyle = darken(c.main, 0.7); ctx.fillRect(-7, -7, 14, 14); ctx.strokeStyle = '#1a0a1f'; ctx.lineWidth = 0.9; ctx.strokeRect(-7, -7, 14, 14);
    ctx.strokeStyle = '#7a6a8c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-hx + 28, -hy); ctx.lineTo(-hx + 28, hy); ctx.moveTo(hx - 24, -hy); ctx.lineTo(hx - 24, hy); ctx.stroke();
    [[-hx + 7, -hy + 7], [hx - 20, -hy + 7], [-hx + 7, hy - 7], [hx - 20, hy - 7], [4, -hy + 6], [4, hy - 6]].forEach(([x, y]) => rivet(ctx, x, y, c, 2.6));
    drawStencilNumber(ctx, o.number, 2, hy - 8, 7);
  }

  else if (id === 'scout') {
    // SZERSZEN: klin, czarne pasy ostrzegawcze po skosie, pasy wyscigowe, nos-strzalka
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = '#17140a';
    for (let i = 0; i < 3; i++) { const x = -hx * 0.55 + i * 9; ctx.beginPath(); ctx.moveTo(x, -hy); ctx.lineTo(x + 5, -hy); ctx.lineTo(x + 5 - 12, hy); ctx.lineTo(x - 12, hy); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(-hx * 0.2, -hy * 0.3, w * 0.62, 1.6); ctx.fillRect(-hx * 0.2, hy * 0.3 - 1.6, w * 0.62, 1.6);
    ctx.restore();
    ctx.fillStyle = c.dark; ctx.beginPath(); ctx.moveTo(hx - 4, -hy * 0.42); ctx.lineTo(hx + 0.5, 0); ctx.lineTo(hx - 4, hy * 0.42); ctx.lineTo(hx - 10, hy * 0.26); ctx.lineTo(hx - 13, 0); ctx.lineTo(hx - 10, -hy * 0.26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.ellipse(hx - 6, -hy * 0.2, 1.4, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(hx - 6, hy * 0.2, 1.4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(-hx + 10, -hy - 1); ctx.fillStyle = darken(c.main, 0.6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -3); ctx.lineTo(20, 1); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#3a2a1f'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore();
    engineGrill(ctx, -hx + 5, -6, 10, 12, c, 3);
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-hx + 18, -hy); ctx.lineTo(-hx + 18, hy); ctx.stroke();
    [[-hx + 6, -hy + 6], [-hx + 6, hy - 6], [hx - 26, -hy + 5], [hx - 26, hy - 5]].forEach(([x, y]) => rivet(ctx, x, y, c, 1.6));
    drawStencilNumber(ctx, o.number, hx - 22, 0, 6.5);
  }

  else if (id === 'sniper') {
    // SOKOLE OKO: kanciaste deflektory z przodu, linie katamaranu, kanister, wsporniki
    ctx.fillStyle = c.dark; ctx.beginPath(); ctx.moveTo(hx - 2, -hy + 3); ctx.lineTo(hx - 14, -hy + 3); ctx.lineTo(hx - 20, 0); ctx.lineTo(hx - 14, hy - 3); ctx.lineTo(hx - 2, hy - 3); ctx.lineTo(hx - 2, hy * 0.5); ctx.lineTo(hx - 10, 0); ctx.lineTo(hx - 2, -hy * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(hx - 14, -hy + 3); ctx.lineTo(hx - 20, 0); ctx.lineTo(hx - 18, 0); ctx.lineTo(hx - 12.5, -hy + 4); ctx.closePath(); ctx.fill();
    for (const side of [-1, 1]) {
      const ty = side * hy;
      ctx.fillStyle = c.dark; ctx.beginPath(); ctx.moveTo(-hx + 8, ty); ctx.lineTo(-hx + 4, ty + side * 4); ctx.lineTo(-hx + 14, ty + side * 4); ctx.lineTo(-hx + 18, ty); ctx.closePath(); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#0a1525'; ctx.fillRect(-hx * 0.8, side * hy * 0.3 - 0.5, w * 0.8, 1);
    }
    ctx.fillStyle = '#4c6b3a'; roundRectPath(ctx, -hx + 8, -hy + 4, 9, 7, 1); ctx.fill(); ctx.strokeStyle = '#1e2c14'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.fillStyle = '#1e2c14'; ctx.fillRect(-hx + 11, -hy + 3, 3, 1.4); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-hx + 9, -hy + 5, 7, 0.8);
    engineGrill(ctx, -hx + 6, -3, 12, 10, c, 3);
    ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.arc(hx - 26, -hy + 9, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a0a0a'; ctx.beginPath(); ctx.arc(hx - 26, -hy + 9, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-14, -hy); ctx.lineTo(-14, hy); ctx.moveTo(14, -hy); ctx.lineTo(14, hy); ctx.stroke();
    [[-hx + 6, -hy + 6], [-hx + 6, hy - 6], [hx - 8, -hy + 6], [hx - 8, hy - 6]].forEach(([x, y]) => rivet(ctx, x, y, c, 1.7));
    drawStencilNumber(ctx, o.number, -hx + 30, hy - 7, 6.5);
  }

  else if (id === 'plasma') {
    // REAKTOR: linie paneli, kratka wentylacji, szwy neonu, wezly, dioda
    const pulse = 0.55 + Math.sin(ph * Math.PI * 2) * 0.45;
    ctx.save(); path(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,30,0.6)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-hx * 0.4, -hy); ctx.lineTo(-hx * 0.4, hy); ctx.moveTo(hx * 0.25, -hy); ctx.lineTo(hx * 0.25, hy); ctx.moveTo(-hx * 0.4, 0); ctx.lineTo(hx * 0.25, 0); ctx.stroke();
    const neon = '#00d4ff';
    const seam = (x, y, lw, lh) => { if (!live) { ctx.save(); ctx.shadowBlur = 7 * pulse; ctx.shadowColor = neon; ctx.fillStyle = rgba(neon, 0.4 + pulse * 0.5); ctx.fillRect(x, y, lw, lh); ctx.restore(); }
      else { ctx.fillStyle = rgba(neon, 0.18 * pulse); ctx.fillRect(x - 1.5, y - 1.5, lw + 3, lh + 3); ctx.fillStyle = rgba(neon, 0.4 + pulse * 0.5); ctx.fillRect(x, y, lw, lh); } };
    seam(-hx * 0.85, -hy * 0.58, w * 0.7, 1.7); seam(-hx * 0.85, hy * 0.58 - 1.7, w * 0.7, 1.7); seam(-hx * 0.85, -hy * 0.2, w * 0.66, 1); seam(-hx * 0.85, hy * 0.2 - 1, w * 0.66, 1);
    // dekor PCB: cienkie ciemniejsze sciezki z zagieciami 45 st. + pady (kolka)
    const trace = darken(c.main, 0.62);
    ctx.strokeStyle = trace; ctx.lineWidth = 0.7; ctx.lineJoin = 'miter';
    const paths = [
      [[-hx * 0.3, -hy * 0.45], [hx * 0.05, -hy * 0.45], [hx * 0.15, -hy * 0.32], [hx * 0.5, -hy * 0.32]],
      [[-hx * 0.3, hy * 0.45], [hx * 0.1, hy * 0.45], [hx * 0.2, hy * 0.32], [hx * 0.55, hy * 0.32]],
      [[-hx * 0.75, -hy * 0.1], [-hx * 0.55, -hy * 0.1], [-hx * 0.48, 0], [-hx * 0.55, hy * 0.1], [-hx * 0.75, hy * 0.1]],
      [[hx * 0.35, -hy * 0.12], [hx * 0.7, -hy * 0.12], [hx * 0.78, -hy * 0.02]],
      [[hx * 0.35, hy * 0.12], [hx * 0.7, hy * 0.12], [hx * 0.78, hy * 0.02]],
    ];
    for (const p of paths) { ctx.beginPath(); p.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.stroke(); const e = p[p.length - 1]; const s0 = p[0]; ctx.fillStyle = trace; ctx.beginPath(); ctx.arc(e[0], e[1], 1.1, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(s0[0], s0[1], 1.1, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = lighten(c.main, 0.45); ctx.beginPath(); ctx.arc(e[0], e[1], 0.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineJoin = 'round';
    ctx.restore();
    ctx.fillStyle = '#0d1a2a'; roundRectPath(ctx, -hx + 5, -8, 15, 16, 1.5); ctx.fill(); ctx.strokeStyle = '#0a1525'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#1f3a55'; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) ctx.fillRect(-hx + 6.5 + q * 4.4, -6.5 + r * 5, 3.4, 4);
    ctx.fillStyle = c.bright; ctx.globalAlpha = 0.5;
    [[0, -11], [-6, 0], [6, 0], [0, 11]].forEach(([nx, ny]) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = nx + Math.cos(a) * 3.2, py = ny + Math.sin(a) * 3.2; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); });
    ctx.globalAlpha = 1;
    glow(ctx, hx * 0.5, 0, 3, '#7ff0ff', 0.85 + pulse * 0.15, live);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx * 0.5, 0, 1.3, 0, Math.PI * 2); ctx.fill();
    glow(ctx, hx - 10, hy - 8, 1.8, '#00ffaa', 0.5 + pulse * 0.5, live);
    [[-hx + 6, -hy + 6], [hx - 6, -hy + 6], [-hx + 6, hy - 6], [hx - 6, hy - 6]].forEach(([x, y]) => rivet(ctx, x, y, c, 1.6));
    drawStencilNumber(ctx, o.number, hx - 22, -hy + 8, 6.5, { plate: 'rgba(5,20,40,0.78)', color: '#bff4ff' });
  }

  else if (id === 'pyro') {
    // SMOK: PLOMIENIE na przedniej plycie (zawsze NAD skinem — rysowane po drawSkin), zbiorniki, zebra, sadza
    ctx.fillStyle = '#2a1508'; roundRectPath(ctx, hx - 15, -hy + 4, 12, h - 8, 2); ctx.fill(); ctx.strokeStyle = '#150800'; ctx.lineWidth = 1; ctx.stroke();
    const flame = (x, y, s, rot) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, -2, 3.5, 3); ctx.quadraticCurveTo(2.5, 5.5, 0, 5.5); ctx.quadraticCurveTo(-2.5, 5.5, -3.5, 3); ctx.quadraticCurveTo(-5, -2, 0, -6); ctx.fill();
      ctx.fillStyle = '#ffd33a'; ctx.beginPath(); ctx.moveTo(0, -3.2); ctx.quadraticCurveTo(2.6, -0.8, 1.6, 2.4); ctx.quadraticCurveTo(0, 3.6, -1.6, 2.4); ctx.quadraticCurveTo(-2.6, -0.8, 0, -3.2); ctx.fill();
      ctx.fillStyle = '#fff5c0'; ctx.beginPath(); ctx.ellipse(0, 1.2, 0.8, 1.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
    ctx.save(); hullPath(ctx, shape, w, h); ctx.clip();
    flame(hx - 9, -hy * 0.55, 1.15, Math.PI / 2 + 0.25); flame(hx - 9, 0, 1.4, Math.PI / 2); flame(hx - 9, hy * 0.55, 1.15, Math.PI / 2 - 0.25);
    flame(hx - 22, -hy * 0.3, 0.8, Math.PI / 2 + 0.15); flame(hx - 22, hy * 0.3, 0.8, Math.PI / 2 - 0.15);
    ctx.restore();
    for (const side of [-1, 1]) {
      const ty = side * hy * 0.45;
      ctx.fillStyle = '#3a1a0a'; roundRectPath(ctx, -hx + 5, ty - 4.5, 18, 9, 3.5); ctx.fill(); ctx.strokeStyle = '#1a0500'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-hx + 8, ty - 3.3, 13, 1.3);
      ctx.fillStyle = '#5a2a15'; ctx.beginPath(); ctx.arc(-hx + 7, ty, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1a0500'; ctx.stroke();
      ctx.fillStyle = '#f4c842'; ctx.beginPath(); ctx.arc(-hx + 7, ty, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 0.9; [hx * 0.36, hx * 0.46, hx * 0.56].forEach(rx => { ctx.beginPath(); ctx.moveTo(rx, -hy * 0.55); ctx.lineTo(rx, hy * 0.55); ctx.stroke(); });
    const hp = 0.5 + Math.sin(ph * Math.PI * 2) * 0.3;
    glow(ctx, -hx + 15, 0, 3.2, '#ff6a20', 0.35 * hp + 0.2, live);
    ctx.fillStyle = 'rgba(20,10,5,0.55)'; ctx.beginPath(); ctx.ellipse(hx - 22, 2, 11, 7, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-hx + 27, -hy); ctx.lineTo(-hx + 27, hy); ctx.stroke();
    [[-hx + 6, -hy + 6], [hx - 6, -hy + 6], [-hx + 6, hy - 6], [hx - 6, hy - 6], [2, -hy + 5], [2, hy - 5]].forEach(([x, y]) => rivet(ctx, x, y, c, 2));
    drawStencilNumber(ctx, o.number, -hx + 33, -hy + 8, 6.5);
  }

  else if (id === 'shadow') {
    // WIDMO: fasety (jasne/ciemne = sciete krawedzie), oko sensora, wentyle, pekniecia
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(-hx, -hy); ctx.lineTo(hx, -hy); ctx.lineTo(hx * 0.3, -hy * 0.25); ctx.lineTo(-hx * 0.5, -hy * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(-hx, -hy); ctx.lineTo(-hx * 0.5, -hy * 0.3); ctx.lineTo(-hx * 0.5, hy * 0.3); ctx.lineTo(-hx, hy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.moveTo(-hx, hy); ctx.lineTo(hx, hy); ctx.lineTo(hx * 0.3, hy * 0.25); ctx.lineTo(-hx * 0.5, hy * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.moveTo(hx, -hy); ctx.lineTo(hx, hy); ctx.lineTo(hx * 0.3, hy * 0.25); ctx.lineTo(hx * 0.3, -hy * 0.25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,200,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-hx, -hy); ctx.lineTo(-hx * 0.5, -hy * 0.3); ctx.lineTo(hx * 0.3, -hy * 0.25); ctx.lineTo(hx, -hy); ctx.moveTo(-hx, hy); ctx.lineTo(-hx * 0.5, hy * 0.3); ctx.lineTo(hx * 0.3, hy * 0.25); ctx.lineTo(hx, hy); ctx.moveTo(-hx * 0.5, -hy * 0.3); ctx.lineTo(-hx * 0.5, hy * 0.3); ctx.moveTo(hx * 0.3, -hy * 0.25); ctx.lineTo(hx * 0.3, hy * 0.25); ctx.stroke();
    ctx.restore();
    glow(ctx, hx - 9, 0, 2.2, '#b48cff', 0.9, live); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx - 9, 0, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a050f'; [-6, -2.5, 1, 4.5].forEach(y => { roundRectPath(ctx, -hx + 4, y, 10, 1.6, 0.6); ctx.fill(); });
    ctx.strokeStyle = darken(c.deep, 0.7); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-hx + 12, hy - 5); ctx.lineTo(-hx + 22, hy - 15); ctx.lineTo(-hx + 18, hy - 22); ctx.lineTo(-hx + 28, hy - 18); ctx.stroke();
    // nity +25%: 4 rogi + wzdluz obu dlugich krawedzi (razem 8 + 4 na fasetach)
    const sr = { outline: '#0a050f', light: '#8a84ac' };
    [[-hx + 8, -hy + 7], [hx - 8, -hy + 7], [-hx + 8, hy - 7], [hx - 8, hy - 7], [-hx * 0.5, -hy + 5], [hx * 0.3, -hy + 5], [-hx * 0.5, hy - 5], [hx * 0.3, hy - 5],
      [-hx * 0.5, -hy * 0.3], [-hx * 0.5, hy * 0.3], [hx * 0.3, -hy * 0.25], [hx * 0.3, hy * 0.25]].forEach(([x, y]) => rivet(ctx, x, y, sr, 1.5));
    drawStencilNumber(ctx, o.number, hx - 24, hy - 8, 6.5, { plate: 'rgba(0,0,0,0.6)', color: '#d8d2f0' });
  }

  else if (id === 'king') {
    // MONARCHA: zlota rama, wytloczona korona z przodu, kolumny, proporzec
    ctx.strokeStyle = '#f4c842'; ctx.lineWidth = 1.8; roundRectPath(ctx, -hx + 2.5, -hy + 2.5, w - 5, h - 5, 7); ctx.stroke();
    ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 0.6; roundRectPath(ctx, -hx + 4, -hy + 4, w - 8, h - 8, 6); ctx.stroke();
    ctx.fillStyle = '#5a0a18'; ctx.beginPath(); const cf = hx - 6;
    ctx.moveTo(cf, -hy * 0.42); ctx.lineTo(cf - 1, -hy * 0.52); ctx.lineTo(cf - 4, -hy * 0.46); ctx.lineTo(cf - 6, -hy * 0.64); ctx.lineTo(cf - 8, -hy * 0.46); ctx.lineTo(cf - 10, -hy * 0.58); ctx.lineTo(cf - 12, -hy * 0.42);
    ctx.lineTo(cf - 12, hy * 0.42); ctx.lineTo(cf - 10, hy * 0.58); ctx.lineTo(cf - 8, hy * 0.46); ctx.lineTo(cf - 6, hy * 0.64); ctx.lineTo(cf - 4, hy * 0.46); ctx.lineTo(cf - 1, hy * 0.52); ctx.lineTo(cf, hy * 0.42); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f4c842'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = '#f4c842'; ctx.beginPath(); ctx.arc(cf - 6, 0, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cf - 6.5, -0.5, 0.7, 0, Math.PI * 2); ctx.fill();
    [-hx * 0.4, 0, hx * 0.2].forEach(px => { for (const side of [-1, 1]) { const ty = side * hy * 0.72; ctx.fillStyle = '#1a0a08'; ctx.fillRect(px - 1.2, ty - 2.5, 2.4, 5); ctx.fillStyle = '#f4c842'; ctx.fillRect(px - 2, ty - 3, 4, 0.9); ctx.fillRect(px - 2, ty + 2.1, 4, 0.9); } });
    ctx.save(); ctx.translate(-hx + 9, hy - 5); ctx.rotate(0.35); ctx.fillStyle = '#8b6914'; ctx.fillRect(0, -13, 1, 13); ctx.fillStyle = '#d4213d'; ctx.beginPath(); ctx.moveTo(1, -13); ctx.lineTo(10, -10.5); ctx.lineTo(1, -8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#f4c842'; ctx.beginPath(); ctx.moveTo(1, -10.5); ctx.lineTo(10, -10.5); ctx.lineTo(1, -8); ctx.closePath(); ctx.fill(); ctx.restore();
    engineGrill(ctx, -hx + 7, -7, 12, 14, c, 3);
    [[-hx + 7, -hy + 7], [hx - 7, -hy + 7], [-hx + 7, hy - 7], [hx - 7, hy - 7]].forEach(([x, y]) => { ctx.fillStyle = '#8b6914'; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f4c842'; ctx.beginPath(); ctx.arc(x - 0.4, y - 0.4, 1.1, 0, Math.PI * 2); ctx.fill(); });
    drawStencilNumber(ctx, o.number, hx - 26, -hy + 8, 6.5, { plate: 'rgba(40,5,12,0.8)', color: '#ffe9a8' });
  }

  glareScreen(ctx, path, w, h, id === 'shadow' ? 0.18 : 0.3);
  bevelScreen(ctx, path, 1);
  ctx.strokeStyle = c.outline; ctx.lineWidth = OUTLINE_W; path(); ctx.stroke();
  turretAO(ctx, b);
  drawFlagOnHull(ctx, b, c, o.flagId); // PO AO i blysku — flaga nie jest przyciemniana
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINTERZY PER CZOLG — WIEZA (top face) i LUFA
// ─────────────────────────────────────────────────────────────────────────────
const TURRET_SHAPE_V2 = { twardy: 'chamfered_cube', heavy: 'heavy_octagon', scout: 'scout_rect', sniper: 'tall_rect', plasma: 'chamfered_cube_tech', pyro: 'wide_cylinder', shadow: 'faceted_hex', king: 'crowned_cylinder' };

function turretTopV2(ctx, b, c, o) {
  const id = b.id; const r = b.turretRadius; const live = o.liveCanvas; const ph = o.phase || 0;
  const shape = TURRET_SHAPE_V2[id] || 'round';
  const path = () => turretPath(ctx, shape, r);
  ctx.fillStyle = o.isSuper ? c.bright : c.main; path(); ctx.fill();
  ctx.save(); path(); ctx.clip();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.2);
  g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.55, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
  ctx.restore();
  if (o.drawSkin) { ctx.save(); path(); ctx.clip(); o.drawSkin(ctx, b, c, 'turret'); ctx.restore(); }

  if (id === 'twardy') {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 1.5]); ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.55); ctx.lineTo(r * 0.5, -r * 0.55); ctx.moveTo(-r * 0.6, r * 0.55); ctx.lineTo(r * 0.5, r * 0.55); ctx.stroke(); ctx.setLineDash([]);
    hatch(ctx, -r * 0.35, -r * 0.35, 5.5, c);
    ctx.fillStyle = '#0a1a0a'; roundRectPath(ctx, 3, -7, 12, 3.2, 1); ctx.fill(); roundRectPath(ctx, 3, 3.8, 12, 3.2, 1); ctx.fill();
    ctx.fillStyle = 'rgba(150,220,150,0.7)'; ctx.fillRect(4, -6.4, 10, 0.8); ctx.fillRect(4, 4.4, 10, 0.8);
    ctx.save(); ctx.translate(r * 0.15, r * 0.55); emblem(ctx, 'helmet', c); ctx.restore();
    drawStencilNumber(ctx, o.number, -r * 0.5, r * 0.4, 7);
  } else if (id === 'heavy') {
    ctx.strokeStyle = c.deep; ctx.lineWidth = 3; turretPath(ctx, shape, r * 0.86); ctx.stroke();
    ctx.fillStyle = '#1a0820'; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 1.3, 0, Math.PI * 2); ctx.fill(); }
    [[-r * 0.15, -r * 0.62], [r * 0.25, -r * 0.62], [-r * 0.15, r * 0.42], [r * 0.25, r * 0.42]].forEach(([x, y]) => { ctx.fillStyle = c.deep; roundRectPath(ctx, x, y, 7, 5, 1); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x + 0.8, y + 0.8, 5.4, 1); });
    hatch(ctx, -r * 0.4, 0, 6.5, c);
    ctx.save(); ctx.translate(r * 0.5, r * 0.05); ctx.scale(1.3, 1.3); emblem(ctx, 'shield', c); ctx.restore();
    drawStencilNumber(ctx, o.number, -r * 0.05, -r * 0.05, 7);
  } else if (id === 'scout') {
    // prostokatna wieza: peryskop ze szklem (przod-lewo), antena (tyl), luneta-emblemat (przod-prawo), numer (tyl)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.8); ctx.lineTo(r * 0.35, r * 0.8); ctx.stroke();
    ctx.fillStyle = c.dark; roundRectPath(ctx, r * 0.4, -r * 0.7, 9, 5.5, 1.5); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = '#5fd7ff'; ctx.beginPath(); ctx.ellipse(r * 0.4 + 7, -r * 0.7 + 2.75, 2, 1.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.4 + 6.4, -r * 0.7 + 2.1, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.5); ctx.lineTo(-r * 1.35, -r * 1.1); ctx.stroke(); ctx.fillStyle = '#e04040'; ctx.beginPath(); ctx.arc(-r * 1.35, -r * 1.1, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(r * 0.7, r * 0.35); ctx.scale(0.9, 0.9); emblem(ctx, 'scope', c); ctx.restore();
    drawStencilNumber(ctx, o.number, -r * 0.5, 0, 6);
  } else if (id === 'sniper') {
    const sx0 = -r * 0.5, sx1 = r * 0.95, sy = -r * 0.62;
    ctx.strokeStyle = c.outline; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); ctx.stroke();
    ctx.strokeStyle = '#1e2d40'; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx0 + 2, sy - 1.3); ctx.lineTo(sx1 - 2, sy - 1.3); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#0a1525'; ctx.fillRect(sx0 + 4, sy - 3, 2, 6); ctx.fillRect(sx1 - 8, sy - 3, 2, 6);
    glow(ctx, sx1 + 0.5, sy, 2.4, '#7fe8ff', 1, live); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx1, sy - 0.7, 0.8, 0, Math.PI * 2); ctx.fill();
    hatch(ctx, -r * 0.2, r * 0.45, 4.5, c);
    ctx.save(); ctx.translate(r * 0.45, r * 0.35); emblem(ctx, 'crosshair', c); ctx.restore();
    drawStencilNumber(ctx, o.number, -r * 0.35, 0, 6);
  } else if (id === 'plasma') {
    const pulse = 0.55 + Math.sin(ph * Math.PI * 2) * 0.45;
    for (let i = 0; i < 5; i++) { const y = -r * 0.6 + i * (r * 1.2 / 4); const on = ((i + Math.floor(ph * 5)) % 5) < 3; if (!live && on) { ctx.save(); ctx.shadowBlur = 4; ctx.shadowColor = '#00d4ff'; } ctx.fillStyle = on ? rgba('#00e5ff', 0.6 + pulse * 0.4) : 'rgba(0,60,90,0.8)'; roundRectPath(ctx, -r * 0.95, y - 1.2, 4, 2.4, 0.8); ctx.fill(); if (!live && on) ctx.restore(); }
    ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.4); ctx.lineTo(-r * 0.85, -r * 1.15); ctx.stroke(); glow(ctx, -r * 0.85, -r * 1.15, 1.6, '#00e5ff', 0.9, live);
    ctx.fillStyle = '#5a7a9a'; ctx.beginPath(); ctx.ellipse(-r * 0.25, r * 0.5, 5, 3.6, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = '#d3e2ee'; ctx.beginPath(); ctx.ellipse(-r * 0.25, r * 0.5, 3.8, 2.7, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a2a3a'; ctx.beginPath(); ctx.arc(-r * 0.25, r * 0.5, 0.9, 0, Math.PI * 2); ctx.fill();
    // WLAZ fake 3D: kolnierz (ciemny pierscien + cien), pokrywa z gradientem swiatla, zawias, klamka
    { const hxx = r * 0.3, hyy = -r * 0.3, hr = 6;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(hxx + 1, hyy + 1.4, hr + 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.deep; ctx.beginPath(); ctx.arc(hxx, hyy, hr + 1.2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 1; ctx.stroke();
      const hg = ctx.createRadialGradient(hxx - hr * 0.4, hyy - hr * 0.45, 0.5, hxx, hyy, hr); hg.addColorStop(0, lighten(c.main, 0.5)); hg.addColorStop(0.6, c.main); hg.addColorStop(1, c.dark);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hxx, hyy, hr - 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hxx, hyy, hr - 1.2, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(hxx, hyy, hr - 1.2, Math.PI * 0.1, Math.PI * 0.75); ctx.stroke();
      ctx.fillStyle = c.outline; ctx.fillRect(hxx - hr - 0.5, hyy - 1.8, 2.2, 3.6); ctx.fillStyle = '#00d4ff'; ctx.fillRect(hxx + 1.5, hyy - 0.6, 3, 1.2); }
    ctx.save(); ctx.translate(-r * 0.05, r * 0.55); ctx.scale(0.9, 0.9); emblem(ctx, 'chip', c); ctx.restore();
    drawStencilNumber(ctx, o.number, r * 0.35, r * 0.45, 6, { plate: 'rgba(5,20,40,0.78)', color: '#bff4ff' });
  } else if (id === 'pyro') {
    ctx.fillStyle = 'rgba(20,8,4,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, 0, r * 0.55, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0800'; [-r * 0.45, -r * 0.15, r * 0.15, r * 0.45].forEach(y => { roundRectPath(ctx, -r * 1.0, y - 1.5, 9, 3, 1); ctx.fill(); });
    const hp = 0.5 + Math.sin(ph * Math.PI * 2) * 0.5; ctx.fillStyle = rgba('#ff7a2a', 0.35 + hp * 0.45); [-r * 0.45, -r * 0.15, r * 0.15, r * 0.45].forEach(y => ctx.fillRect(-r * 0.95, y - 0.7, 7, 1.4));
    hatch(ctx, r * 0.1, -r * 0.5, 5, c);
    ctx.save(); ctx.translate(r * 0.55, r * 0.3); ctx.scale(1.3, 1.3); emblem(ctx, 'flame', c); ctx.restore();
    drawStencilNumber(ctx, o.number, -r * 0.2, r * 0.5, 6);
  } else if (id === 'shadow') {
    ctx.save(); path(); ctx.clip();
    const la = Math.atan2(LIGHT_Y, LIGHT_X);
    for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2; const mid = (a0 + a1) / 2; const lit = 0.5 + 0.5 * Math.cos(mid - la); ctx.fillStyle = `rgba(${lit > 0.5 ? '255,255,255' : '0,0,0'},${Math.abs(lit - 0.5) * 0.5})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r); ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(170,160,210,0.35)'; ctx.lineWidth = 0.8; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
    ctx.restore();
    glow(ctx, r * 0.55, -r * 0.25, 1.8, '#b48cff', 0.95, live);
    ctx.save(); ctx.translate(r * 0.1, r * 0.45); emblem(ctx, 'moon', c); ctx.restore();
    drawStencilNumber(ctx, o.number, -r * 0.4, 0, 6, { plate: 'rgba(0,0,0,0.6)', color: '#d8d2f0' });
  } else if (id === 'king') {
    ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(0, 0, r - 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f4c842'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r - 2.5, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const bx = Math.cos(a) * (r - 2), by = Math.sin(a) * (r - 2); const tx = Math.cos(a) * (r + 4.5), ty = Math.sin(a) * (r + 4.5);
      const px = Math.cos(a + Math.PI / 2) * 2.6, py = Math.sin(a + Math.PI / 2) * 2.6;
      ctx.fillStyle = '#f4c842'; ctx.beginPath(); ctx.moveTo(bx + px, by + py); ctx.lineTo(tx, ty); ctx.lineTo(bx - px, by - py); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.arc(tx, ty, 1, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d4213d'; ctx.beginPath(); ctx.arc(r * 0.5, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#ff9aa8'; ctx.beginPath(); ctx.arc(r * 0.45, -0.8, 1.1, 0, Math.PI * 2); ctx.fill();
    hatch(ctx, -r * 0.3, -r * 0.3, 5, c);
    drawStencilNumber(ctx, o.number, -r * 0.25, r * 0.4, 6, { plate: 'rgba(40,5,12,0.8)', color: '#ffe9a8' });
  }
  bevelScreen(ctx, path, 0.9);
  ctx.strokeStyle = c.outline; ctx.lineWidth = OUTLINE_W; path(); ctx.stroke();
}

function emblem(ctx, e, c) {
  if (e === 'shield') { ctx.fillStyle = c.light; ctx.strokeStyle = c.outline; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, -2); ctx.lineTo(4, 2); ctx.lineTo(0, 5); ctx.lineTo(-4, 2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = c.deep; ctx.fillRect(-0.6, -3, 1.2, 6); }
  else if (e === 'helmet') { ctx.fillStyle = c.deep; ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI, 0); ctx.lineTo(4, 2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.5, 0, Math.PI * 2); ctx.fill(); }
  else if (e === 'scope') { ctx.strokeStyle = c.deep; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = c.deep; ctx.fillRect(-0.7, -4.5, 1.4, 9); ctx.fillRect(-4.5, -0.7, 9, 1.4); }
  else if (e === 'crosshair') { ctx.strokeStyle = c.deep; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(0, 6.5); ctx.moveTo(-6.5, 0); ctx.lineTo(6.5, 0); ctx.stroke(); ctx.fillStyle = '#e03030'; ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, Math.PI * 2); ctx.fill(); }
  else if (e === 'chip') { ctx.fillStyle = c.deep; ctx.fillRect(-4, -4, 8, 8); ctx.fillStyle = c.bright; ctx.fillRect(-3, -3, 6, 6); ctx.fillStyle = c.deep; [[-3, -1], [-3, 1], [3, -1], [3, 1], [-1, -3], [1, -3], [-1, 3], [1, 3]].forEach(([px, py]) => ctx.fillRect(px - 0.5, py - 0.5, 1, 1)); }
  else if (e === 'flame') { ctx.fillStyle = '#f9aa1f'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(4, -2, 3, 3); ctx.quadraticCurveTo(2, 5, 0, 5); ctx.quadraticCurveTo(-2, 5, -3, 3); ctx.quadraticCurveTo(-4, -2, 0, -5); ctx.fill(); ctx.fillStyle = '#ffe17a'; ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(2, -1, 1, 2); ctx.quadraticCurveTo(0, 3, -1, 2); ctx.quadraticCurveTo(-2, -1, 0, -3); ctx.fill(); }
  else if (e === 'moon') { ctx.fillStyle = '#d8d2f0'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c.main; ctx.beginPath(); ctx.arc(1.8, -0.6, 4.4, 0, Math.PI * 2); ctx.fill(); }
}

function barrelV2(ctx, b, c, o) {
  const id = b.id; const live = o.liveCanvas; const ph = o.phase || 0;
  const base = o.isSuper ? '#d946ef' : c.deep; const side = o.isSuper ? '#a020bf' : c.dark; const ol = o.isSuper ? '#7c0eaa' : c.outline;
  const top = o.isSuper ? '#f0a0ff' : lighten(c.deep, 0.25);
  if (id === 'twardy') {
    cylinder(ctx, 16, 0, 52, 0, 12, base, top, ol, true);
    ring(ctx, 30, 15, 6, side, ol);
    block(ctx, 44, -8, 10, 16, 2, side, ol);
    ctx.fillStyle = '#000'; [-5.5, -1.2, 3.1].forEach(y => ctx.fillRect(46, y, 6, 2.4));
    muzzleHole(ctx, 54, 0, 12, side, ol);
  } else if (id === 'heavy') {
    [-9, 9].forEach(y => { cylinder(ctx, 16, y, 50, y, 12, base, top, ol, true); });
    [-9, 9].forEach(y => { ctx.save(); ctx.translate(0, y); ring(ctx, 28, 15, 4, side, ol); ctx.restore(); });
    block(ctx, 38, -18, 9, 36, 2, side, ol);
    [-9, 9].forEach(y => { block(ctx, 46, y - 7.5, 6, 15, 1.5, base, ol); muzzleHole(ctx, 52, y, 12, base, ol); });
  } else if (id === 'scout') {
    // GATLING: 6 luf na obracajacym sie bebnie (fake 3D: lufy z tylu ciemniejsze i wezsze),
    // plaszcz chlodzacy z rozgrzanymi otworami, piasta z przodu. Obrot = opts.spin (rad).
    const spin = (o.spin || 0);
    block(ctx, 15, -8.5, 13, 17, 3, side, ol);
    const N = 6; const R = 4.6;
    const order = []; for (let i = 0; i < N; i++) { const a = spin + (i / N) * Math.PI * 2; order.push({ i, a, z: Math.cos(a), y: Math.sin(a) * R }); }
    order.sort((p, q) => p.z - q.z); // tyl -> przod
    for (const p of order) {
      const front = (p.z + 1) / 2; // 0 tyl, 1 przod
      const th = 2.6 + front * 1.4; const col = lerpColor('#1c1810', '#7a7050', front);
      cylinder(ctx, 28, p.y, 44, p.y, th, col, lighten(col, 0.3), '#0a0806', true);
      muzzleHole(ctx, 44, p.y, th * 1.1, col, '#0a0806');
    }
    block(ctx, 27, -7.5, 8, 15, 2, base, ol); // plaszcz chlodzacy
    const heat = 0.55 + Math.sin(ph * Math.PI * 2) * 0.35;
    [29.5, 32.5].forEach(x => [-4, 0, 4].forEach(y => glow(ctx, x, y, 0.9, '#f1c40f', heat, live)));
    // obrecz przednia (kolnierz) — widac "beben"
    ctx.strokeStyle = ol; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(41, 0, 2.2, R + 2.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = lighten(base, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(41, 0, 2.2, R + 2.2, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 0, 6, side); ctx.beginPath(); ctx.ellipse(45, 0, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 0.9; ctx.stroke();
  } else if (id === 'sniper') {
    // RAILGUN (w duchu starej lufy): 2 szyny z gradientem walca, 6 cewek swiecacych po kolei
    // (opts.charge 0..1 = reload), luk miedzy szynami przy pelnym naladowaniu, wylot 2 szyn + dwojnog.
    const RS = 16, RL = 44; const charge = (o.charge == null) ? 1 : o.charge;
    ctx.strokeStyle = ol; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(42, -9); ctx.moveTo(30, 0); ctx.lineTo(42, 9); ctx.stroke();
    block(ctx, 15, -7.5, 12, 15, 2.5, side, ol);
    for (const ry of [-4.2, 4.2]) cylinder(ctx, RS + 8, ry, RS + RL, ry, 3.4, base, top, ol, true);
    for (let i = 0; i < 6; i++) {
      const cx = RS + 12 + i * 6.2; const lit = charge > (i / 6);
      block(ctx, cx - 1.6, -6.8, 3.2, 13.6, 0.8, '#1a2a3a', '#0a1525');
      const k = lit ? (0.7 + Math.sin(ph * Math.PI * 2 + i) * 0.3) : 0.15;
      if (lit) { glow(ctx, cx, -5.4, 1.2, '#3498db', k, live); glow(ctx, cx, 5.4, 1.2, '#3498db', k, live); }
      else { ctx.fillStyle = 'rgba(52,152,219,0.25)'; ctx.fillRect(cx - 1.4, -6, 2.8, 1.2); ctx.fillRect(cx - 1.4, 4.8, 2.8, 1.2); }
    }
    if (charge >= 1) {
      ctx.save(); ctx.strokeStyle = `rgba(140,210,255,${0.5 + Math.sin(ph * Math.PI * 6) * 0.4})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(RS + 10, 0); for (let x = RS + 10; x < RS + RL - 4; x += 4) ctx.lineTo(x + 2, Math.sin(x * 1.7 + ph * 40) * 2.2); ctx.lineTo(RS + RL - 4, 0); ctx.stroke(); ctx.restore();
    }
    block(ctx, RS + RL - 4, -7.5, 9, 15, 1.5, side, ol);
    ctx.fillStyle = '#7fd0ff'; ctx.fillRect(RS + RL + 3, -5.4, 2.6, 1.6); ctx.fillRect(RS + RL + 3, 3.8, 2.6, 1.6);
    ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.ellipse(RS + RL + 5, 0, 1.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    glow(ctx, RS + RL + 5, 0, 1.2, '#7fd0ff', 0.6 * charge, live);
  } else if (id === 'plasma') {
    // EMITER PLAZMY: rura akceleratora z 4 pierscieniami cewek (gradient cyjan->bialy), 2 symetryczne
    // widelce z elektrodami, kula plazmy w rozwidleniu + luki. Lufa = technologia, nie stal.
    // +25% dlugosci (Mariusz): cala geometria lufy skalowana w osi X od nasady 15.
    const pb = c.deep, pol = c.outline; const pulse = 0.7 + Math.sin(ph * Math.PI * 2) * 0.3;
    ctx.save(); ctx.translate(15, 0); ctx.scale(1.25, 1); ctx.translate(-15, 0);
    block(ctx, 15, -8.5, 12, 17, 3, side, pol);
    cylinder(ctx, 26, 0, 42, 0, 9, '#1c3550', '#4a7aa0', pol, true);
    [29, 33, 37, 41].forEach((x, i) => { const col = lerpColor('#00d4ff', '#ffffff', i * 0.22); ctx.fillStyle = vgrad(ctx, 0, 13, '#20405a'); roundRectPath(ctx, x - 1.5, -6.5, 3, 13, 0.8); ctx.fill(); ctx.strokeStyle = pol; ctx.lineWidth = 0.8; ctx.stroke();
      if (!live) { ctx.save(); ctx.shadowBlur = 5 * pulse; ctx.shadowColor = '#00d4ff'; } ctx.fillStyle = rgba(col, 0.55 + pulse * 0.45); ctx.fillRect(x - 1, -6, 2, 2.4); ctx.fillRect(x - 1, 3.6, 2, 2.4); if (!live) ctx.restore(); });
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = vgrad(ctx, sgn * 6, 7, pb); ctx.beginPath(); ctx.moveTo(41, sgn * 4); ctx.lineTo(50, sgn * 9); ctx.lineTo(55, sgn * 7.5); ctx.lineTo(55, sgn * 4.5); ctx.lineTo(48, sgn * 3); ctx.lineTo(41, sgn * 1.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = pol; ctx.lineWidth = 1.1; ctx.stroke();
      glow(ctx, 54, sgn * 6, 1.8, '#00d4ff', 0.9 * pulse, live);
    }
    const bs = 5.2;
    glow(ctx, 49, 0, bs * 1.4, o.isSuper ? '#ff77ff' : '#00d4ff', 0.5 * pulse, live);
    const cg = ctx.createRadialGradient(48, -1, 0.5, 49, 0, bs); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.45, o.isSuper ? '#ff99ff' : '#8ef0ff'); cg.addColorStop(1, o.isSuper ? '#c040e0' : '#0090c0');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(49, 0, bs, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; for (let a0 = 0; a0 < 3; a0++) { const a1 = (a0 / 3) * Math.PI * 2 + ph * Math.PI * 2; ctx.beginPath(); ctx.moveTo(49 + Math.cos(a1) * bs, Math.sin(a1) * bs); ctx.lineTo(49 + Math.cos(a1 + 0.3) * (bs + 2), Math.sin(a1 + 0.3) * (bs + 2)); ctx.lineTo(49 + Math.cos(a1 + 0.6) * bs, Math.sin(a1 + 0.6) * bs); ctx.stroke(); }
    ctx.restore();
  } else if (id === 'pyro') {
    // JEDNA GRUBA LUFA miotacza: kolnierz, walec 16, dzwon wylotowy, plomyk pilotowy
    block(ctx, 15, -10, 11, 20, 3, side, ol);
    cylinder(ctx, 24, 0, 42, 0, 16, base, top, ol, true);
    ring(ctx, 31, 19, 4, side, ol);
    ctx.fillStyle = vgrad(ctx, 0, 22, base); ctx.beginPath(); ctx.moveTo(40, -7.5); ctx.lineTo(49, -11); ctx.lineTo(49, 11); ctx.lineTo(40, 7.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1.2; ctx.stroke();
    muzzleHole(ctx, 49, 0, 20, base, ol);
    const fp = 0.6 + Math.sin(ph * Math.PI * 2) * 0.4;
    glow(ctx, 50.5, 0, 3.2, '#ff6a20', 0.5 + fp * 0.4, live); ctx.fillStyle = '#ffe070'; ctx.beginPath(); ctx.ellipse(51, 0, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'shadow') {
    // DLUGA PROSTA LUFA (jedna bryla, bez tlumika): walec 9, 2 subtelne pierscienie, wylot z glebia
    block(ctx, 15, -7, 9, 14, 2.5, side, ol);
    cylinder(ctx, 23, 0, 56, 0, 9, base, top, ol, true);
    ctx.strokeStyle = '#8a84ac'; ctx.lineWidth = 1; [34, 46].forEach(x => { ctx.beginPath(); ctx.moveTo(x, -4.2); ctx.lineTo(x, 4.2); ctx.stroke(); });
    muzzleHole(ctx, 56, 0, 9, base, ol);
    ctx.fillStyle = 'rgba(180,140,255,0.5)'; ctx.beginPath(); ctx.ellipse(56.4, 0, 0.7, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'king') {
    cylinder(ctx, 15, 0, 52, 0, 12, base, top, ol, true);
    [28, 40].forEach(x => ring(ctx, x, 12.5, 3, '#7a1020', '#3a0810'));
    ctx.fillStyle = vgrad(ctx, 0, 17, '#f4c842'); ctx.beginPath(); ctx.moveTo(50, -6); ctx.lineTo(58, -8.5); ctx.lineTo(58, 8.5); ctx.lineTo(50, 6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 1.2; ctx.stroke();
    muzzleHole(ctx, 58, 0, 16, '#c9a030', '#8b6914');
    ctx.fillStyle = 'rgba(255,120,80,0.5)'; ctx.beginPath(); ctx.ellipse(58.4, 0, 1.4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKLADANIE: warstwy hull / turret (1:1 z bakeHullLayer / bakeTurretLayer) + drawTankV2
// ─────────────────────────────────────────────────────────────────────────────
function makeOpts(opts) {
  return { liveCanvas: !!(opts && opts.liveCanvas), phase: (opts && typeof opts.phase === 'number') ? opts.phase : 0,
    number: (opts && opts.number != null) ? opts.number : 7, flagId: (opts && opts.flagId !== undefined) ? opts.flagId : 'pl',
    isSuper: !!(opts && opts.isSuper), drawSkin: opts && opts.drawSkin,
    spin: (opts && opts.spin) || 0, charge: (opts && opts.charge != null) ? opts.charge : 1 };
}

export function bakeHullLayerV2(ctx, t, opts) {
  const b = t.brawler; const sz = b.size; const o = makeOpts(opts);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const pitch = t.pitch || 0; const pitchZ = pitch * 3 * sz; const tiltMul = 1 + pitch * 0.015;
  const flashing = (t.hitFlashTimer || 0) > 0; const colors = flashing ? flashColors(b.colors, Math.min(1, t.hitFlashTimer * 14) * 0.85) : b.colors;
  const hullZ = b.hullZ || HULL_Z;
  const ex = t.x, ey = t.y - pitchZ;
  dropShadow(ctx, t.x, t.y, b, t.hullAngle);
  ctx.save(); applyTransform(ctx, ex, ey, 0, t.hullAngle, sz, tiltMul); treadsV2(ctx, b, colors, t.treadShift || 0); ctx.restore();
  const shape = HULL_SHAPE_V2[b.id] || 'standard';
  extrudeV2(ctx, () => hullPath(ctx, shape, b.hullW * 0.985, b.hullH * 0.985), ex, ey, 0, t.hullAngle, sz, tiltMul, colors.dark, colors.deep, colors.outline, hullZ, 1);
  ctx.save(); applyTransform(ctx, ex, ey, hullZ, t.hullAngle, sz, tiltMul); hullTopV2(ctx, b, colors, o); ctx.restore();
}

export function bakeTurretLayerV2(ctx, t, opts) {
  const b = t.brawler; const sz = b.size; const o = makeOpts(opts);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const pitch = t.pitch || 0; const pitchZ = pitch * 3 * sz;
  const flashing = (t.hitFlashTimer || 0) > 0; const colors = flashing ? flashColors(b.colors, Math.min(1, t.hitFlashTimer * 14) * 0.85) : b.colors;
  const hullZ = b.hullZ || HULL_Z;
  const ex = t.x, ey = t.y - pitchZ;
  const tz = Math.round(b.turretRadius * 0.5);
  const shape = TURRET_SHAPE_V2[b.id] || 'round';
  extrudeV2(ctx, () => turretPath(ctx, shape, b.turretRadius), ex, ey, hullZ, t.turretAngle, sz, 1, colors.main, colors.dark, colors.outline, tz, 0.9);
  const behind = Math.sin(t.turretAngle) < 0; const topZ = hullZ + tz;
  const rec = (t.recoil || 0) * 8 * sz; const rx = -Math.cos(t.turretAngle) * rec, ry = -Math.sin(t.turretAngle) * rec * CAMERA_TILT_Y;
  const rTop = () => { ctx.save(); applyTransform(ctx, ex, ey, topZ, t.turretAngle, sz, 1); turretTopV2(ctx, b, colors, o); ctx.restore(); };
  const rB = () => { ctx.save(); applyTransform(ctx, ex + rx, ey + ry, hullZ + Math.floor(tz / 2), t.turretAngle, sz, 1); barrelV2(ctx, b, colors, o); ctx.restore(); };
  if (behind) { rB(); rTop(); } else { rTop(); rB(); }
}

/** Pelny czolg (Garaz / podglad): hull + turret. `t` jak w render2d.drawTank. */
export function drawTankV2(ctx, t, opts) {
  bakeHullLayerV2(ctx, t, opts);
  bakeTurretLayerV2(ctx, t, opts);
}

/** Pozycja wylotu lufy (jak render2d.getMuzzlePos — muzzleDist v1 bez zmian). */
export function getMuzzlePosV2(t, ang) {
  const md = t.brawler.muzzleDist, sz = t.brawler.size;
  const rec = (t.recoil || 0) * 8 * sz;
  return { x: t.x + (md * sz - rec) * Math.cos(ang), y: t.y + (md * sz - rec) * Math.sin(ang) * CAMERA_TILT_Y - 14 * Z_TO_SCREEN * sz };
}

// ─────────────────────────────────────────────────────────────────────────────
// POCISKI v2 (bake: BulletSpriteBaker). Tylko czolgi, ktorym Mariusz zmienil LOOK pocisku:
//   scout  = mala beczka z gradientem (fake 3D), heavy = masywniejszy krysztal, sniper = +2 px szerzej,
//   king   = korona z 3 zebami, zolta, glow, fake 3D. Reszta = dotychczasowy drawBulletWithFx.
// Rysowane w prawo (vx=1); rotacja/spin w Bullet.ts. Efekty runtime (luki, ogien, orbitery) — Bullet.ts.
// ─────────────────────────────────────────────────────────────────────────────
export const BULLET_V2_IDS = ['scout', 'heavy', 'sniper', 'king'];

export function drawBulletV2(ctx, id, b, fallback) {
  const x = b.x, y = b.y, s = b.size, sup = !!b.isSuper;
  if (id === 'scout') {
    // BECZKA: walec z 2 obreczami, gradient gora->dol, blik; super = zlota obrecz + poswiata
    const L = s * 1.7, R = s * 0.85;
    if (sup) { const g = ctx.createRadialGradient(x, y, 0, x, y, R * 2.6); g.addColorStop(0, 'rgba(255,233,77,0.55)'); g.addColorStop(1, 'rgba(255,233,77,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRectPath(ctx, -L / 2 + 0.8, -R + 1.2, L, R * 2, R * 0.5); ctx.fill();
    ctx.fillStyle = vgrad(ctx, 0, R * 2, sup ? '#c9a020' : '#a06a12'); roundRectPath(ctx, -L / 2, -R, L, R * 2, R * 0.5); ctx.fill();
    ctx.strokeStyle = '#3a2408'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 0, R * 2.2, sup ? '#ffe94d' : '#f1c40f');
    [-L * 0.28, L * 0.28].forEach(bx => { roundRectPath(ctx, bx - 1.3, -R - 0.4, 2.6, R * 2 + 0.8, 0.8); ctx.fill(); ctx.strokeStyle = '#3a2408'; ctx.lineWidth = 0.7; ctx.stroke(); });
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; roundRectPath(ctx, -L / 2 + 2, -R * 0.75, L - 4, R * 0.35, R * 0.15); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(L / 2, 0, R * 0.32, R * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sup ? '#ffe94d' : '#e8a91a'; ctx.beginPath(); ctx.ellipse(L / 2 + 0.3, 0, R * 0.2, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  if (id === 'heavy') {
    // MASYWNY KRYSZTAL: ten sam ksztalt co dzis, x1.35 + ciezki gradient + krawedz + glow
    const S = s * 1.35 * 1.3; const col = sup ? ['#a020bf', '#7c0eaa', '#ffccff'] : ['#9b30d0', '#5e1a7a', '#d89bf0']; // +35% +30% (tylko look)
    ctx.fillStyle = 'rgba(155,48,208,0.3)'; ctx.beginPath(); ctx.arc(x, y, S * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(S * 1.7 + 0.8, 1.2); ctx.lineTo(0.8, S * 0.95 + 1.2); ctx.lineTo(-S * 1.2 + 0.8, 1.2); ctx.lineTo(0.8, -S * 0.95 + 1.2); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(0, -S, 0, S); g.addColorStop(0, lighten(col[0], 0.35)); g.addColorStop(0.5, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(S * 1.7, 0); ctx.lineTo(0, S * 0.95); ctx.lineTo(-S * 1.2, 0); ctx.lineTo(0, -S * 0.95); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = darken(col[1], 0.6); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = col[2]; ctx.beginPath(); ctx.moveTo(S * 1.2, 0); ctx.lineTo(0, -S * 0.55); ctx.lineTo(-S * 0.7, 0); ctx.lineTo(0, S * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(S * 0.35, -S * 0.25, S * 0.35, S * 0.18, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  if (id === 'sniper') {
    // LASER: dzisiejszy, +2 px szerzej (6->8 / 3->5 / 1.2->2.2); super z fioletem jak dotad
    ctx.save(); ctx.translate(x, y);
    if (sup) {
      ctx.fillStyle = 'rgba(217,70,239,0.24)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.78, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(217,70,239,0.7)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.8, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(52,152,219,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, s, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (id === 'king') {
    // KORONA z 3 zebami: zolta, glow, fake 3D (podstawa ciemniejsza, zeby jasne, rubin)
    const S = s * 1.25;
    // super: wiecej POMARANCZU (sam zolty = swiecaca kula bez ksztaltu) — poswiata i korona w pomaranczu, zeby zeby byly czytelne
    const g = ctx.createRadialGradient(x, y, 0, x, y, S * 2.4); g.addColorStop(0, sup ? 'rgba(255,150,40,0.55)' : 'rgba(255,230,80,0.6)'); g.addColorStop(1, sup ? 'rgba(255,90,20,0)' : 'rgba(255,200,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, S * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y);
    const crown = (ox, oy) => { ctx.beginPath(); ctx.moveTo(-S, S * 0.7 + oy); ctx.lineTo(-S, -S * 0.2 + oy); ctx.lineTo(-S * 0.5, S * 0.15 + oy); ctx.lineTo(0, -S * 0.95 + oy); ctx.lineTo(S * 0.5, S * 0.15 + oy); ctx.lineTo(S, -S * 0.2 + oy); ctx.lineTo(S, S * 0.7 + oy); ctx.closePath(); };
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; crown(0, 1.4); ctx.fill();
    const cg = ctx.createLinearGradient(0, -S, 0, S);
    if (sup) { cg.addColorStop(0, '#ffe08a'); cg.addColorStop(0.45, '#ffa030'); cg.addColorStop(1, '#c45a10'); } else { cg.addColorStop(0, '#fff3a0'); cg.addColorStop(0.5, '#ffd83a'); cg.addColorStop(1, '#c98a10'); }
    ctx.fillStyle = cg; crown(0, 0); ctx.fill(); ctx.strokeStyle = sup ? '#7a2a08' : '#7a5008'; ctx.lineWidth = sup ? 1.5 : 1.1; ctx.stroke();
    ctx.fillStyle = sup ? '#b04a0c' : '#a86a0c'; ctx.fillRect(-S, S * 0.45, S * 2, S * 0.25);
    ctx.fillStyle = '#fff8d0'; [[-S * 0.5, S * 0.15], [0, -S * 0.95], [S * 0.5, S * 0.15]].forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py + S * 0.12, S * 0.14, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#d4213d'; ctx.beginPath(); ctx.arc(0, S * 0.35, S * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-S * 0.05, S * 0.28, S * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  fallback(ctx, b);
}
