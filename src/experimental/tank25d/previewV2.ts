// @ts-nocheck
/**
 * previewV2.ts — PODGLAD TANK ART v2 (dev-only, strona tankart-preview.html).
 *
 * Kolumny: DZIS (prawdziwy render2d.drawTank = produkcja v0.210.0) | v2 (skala meczu desktop)
 *          | v2 MOBILE (zoom 0.6) | v2 GARAZ (powiekszenie).
 * Skala meczu = render2d units * BAKE_DISPLAY_SCALE (1.25, Player.ts) * zoom swiata.
 * Do tego prosta symulacja JUICE'U strzalu v2 (Canvas2D, ten sam pomysl, ktory poszedlby do PIXI).
 * Zero importow do gry poza render2d (lab) i render2dV2 (prototyp).
 */
import { drawTank, BRAWLERS, CAMERA_TILT_Y, getMuzzlePos } from './render2d';
import { drawTankV2, brawlerV2, withSkin, TREAD_LINK, getMuzzlePosV2 } from './render2dV2';
import { fireWeapon, stepBullet, drawBulletWithFx, drawTankSuperAura, getSuperTint, getReload, SUPER_DURATION } from './fire';

export const BAKE_DISPLAY_SCALE = 1.25;
export const MOBILE_ZOOM = 0.6;
export const DPR = Math.min(window.devicePixelRatio || 1, 2);
const IDS = ['twardy', 'heavy', 'scout', 'sniper', 'plasma', 'pyro', 'shadow', 'king'];
export const NAMES = { twardy: 'TWARDY', heavy: 'PANCERNY', scout: 'ZWIAD', sniper: 'SNAJPER', plasma: 'TECH', pyro: 'OGNIARZ', shadow: 'SHADOW', king: 'KING' };

export const state = {
  rotate: true, treads: true, fire: false, superShot: false, number: 7, flagId: 'pl', bg: '#c9a86a',
  hull: -Math.PI / 4, turret: -Math.PI / 4, tread: 0, phase: 0, skinHex: null, angleLock: false,
};

// ── DOM ────────────────────────────────────────────────────────────────────
const grid = document.getElementById('grid');
const rows = [];
for (const id of IDS) {
  const row = document.createElement('div'); row.className = 'row';
  const label = document.createElement('div'); label.className = 'label'; label.textContent = NAMES[id]; row.appendChild(label);
  const cells = {};
  for (const col of ['v1', 'v2', 'mob', 'big']) {
    const wrap = document.createElement('div'); wrap.className = 'cell ' + col;
    const cv = document.createElement('canvas'); wrap.appendChild(cv); row.appendChild(wrap);
    cells[col] = cv;
  }
  grid.appendChild(row);
  rows.push({ id, cells, fx: [] });
}

const SIZES = { v1: [220, 150], v2: [220, 150], mob: [150, 110], big: [300, 220] };
const SCALES = { v1: BAKE_DISPLAY_SCALE, v2: BAKE_DISPLAY_SCALE, mob: BAKE_DISPLAY_SCALE * MOBILE_ZOOM, big: 2.4 };
export function setupCanvas(cv, w, h) {
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx._lwBase = DPR; return ctx;
}
for (const r of rows) for (const col of Object.keys(r.cells)) setupCanvas(r.cells[col], SIZES[col][0], SIZES[col][1]);

// ── controls ────────────────────────────────────────────────────────────────
export const $ = (id) => document.getElementById(id);
$('rotate').onchange = e => { state.rotate = e.target.checked; };
$('treads').onchange = e => { state.treads = e.target.checked; };
$('super').onchange = e => { state.superShot = e.target.checked; };
$('number').oninput = e => { state.number = Math.max(1, Math.min(99, parseInt(e.target.value || '7', 10))); };
$('flag').onchange = e => { state.flagId = e.target.value; };
$('skin').onchange = e => { state.skinHex = e.target.value || null; };
document.querySelectorAll('[data-bg]').forEach(b => { b.onclick = () => { state.bg = b.getAttribute('data-bg'); }; });
$('fire').onclick = () => { for (const r of rows) fireRow(r); };
$('angle').oninput = e => { const a = parseFloat(e.target.value) * Math.PI / 180; state.hull = a; state.turret = a; state.angleLock = true; };
$('angle').onchange = () => { state.angleLock = false; };

// ── FX (symulacja juice'u strzalu v2 — Canvas2D odpowiednik tego, co poszloby do PIXI) ──
function fireRow(r) {
  const b = brawlerV2(r.id); const col = b.color;
  r.fx.push({ t: 0, kind: 'shot', color: col, recoil: 1 });
}
function stepFx(r, dt) {
  for (const f of r.fx) f.t += dt;
  r.fx = r.fx.filter(f => f.t < 1.1);
}
/** Rysuje FX w ukladzie sceny komorki (skala s), czolg w (0,0), cel w (180,0) render2d-units. */
function drawFx(ctx, r, s, tank) {
  const TARGET_X = 150;
  // cel (skrzynka)
  ctx.save(); ctx.scale(s, s);
  ctx.fillStyle = '#5a4634'; ctx.fillRect(TARGET_X - 10, -14, 20, 24); ctx.strokeStyle = '#2a1f14'; ctx.lineWidth = 1.5; ctx.strokeRect(TARGET_X - 10, -14, 20, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(TARGET_X - 9, -13, 18, 2);
  for (const f of r.fx) {
    const t = f.t; const c = f.color;
    const m = getMuzzlePosV2(tank, 0); const mx = m.x, my = m.y;
    const hitT = 0.28; // czas dolotu
    // 1) rozblysk stozkowy (ADD) 0..0.12 s
    if (t < 0.12) {
      const k = 1 - t / 0.12; ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 16 * (0.6 + k)); g.addColorStop(0, `rgba(255,255,230,${0.9 * k})`); g.addColorStop(0.35, hexA(c, 0.7 * k)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 30 * (0.7 + k), my - 12 * k - 3); ctx.lineTo(mx + 34 * (0.7 + k), my); ctx.lineTo(mx + 30 * (0.7 + k), my + 12 * k + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * k})`; ctx.beginPath(); ctx.arc(mx, my, 5 * k + 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 2) dym z lufy (3 klebki) 0..0.7 s
    for (let i = 0; i < 3; i++) { const tt = t - i * 0.03; if (tt > 0 && tt < 0.7) { const k = tt / 0.7; ctx.fillStyle = `rgba(120,115,110,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.arc(mx + 8 + tt * 40 + i * 4, my - 4 - tt * 18 * (i - 1), 3 + k * 9, 0, Math.PI * 2); ctx.fill(); } }
    // 3) iskry z lufy
    for (let i = 0; i < 4; i++) { if (t < 0.25) { const a = (i - 1.5) * 0.35; const d = t * 120; ctx.fillStyle = hexA('#ffe08a', 1 - t / 0.25); ctx.beginPath(); ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.6, 1.6, 0, Math.PI * 2); ctx.fill(); } }
    // 4) pocisk + smuga ADD (1 sprite w PIXI)
    if (t < hitT) {
      const p = t / hitT; const bx = mx + (TARGET_X - 10 - mx) * p; const len = Math.min(46, p * 160);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(bx - len, my, bx, my); g.addColorStop(0, hexA(c, 0)); g.addColorStop(1, hexA(c, 0.85));
      ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - len, my); ctx.lineTo(bx, my); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx - len * 0.6, my); ctx.lineTo(bx, my); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(bx, my, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx - 1, my - 1, 2, 0, Math.PI * 2); ctx.fill();
    }
    // 5) trafienie: flash celu + pierscien + iskry w kolorze + slad
    const ht = t - hitT;
    if (ht >= 0) {
      const ix = TARGET_X - 10, iy = my;
      if (ht < 0.08) { ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - ht / 0.08)})`; ctx.fillRect(TARGET_X - 10, -14, 20, 24); }
      if (ht < 0.3) { const k = ht / 0.3; ctx.strokeStyle = hexA(c, 1 - k); ctx.lineWidth = 4 - k * 3; ctx.beginPath(); ctx.arc(ix, iy, 4 + k * 22, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ix, iy, 2 + k * 18, 0, Math.PI * 2); ctx.stroke(); }
      if (ht < 0.1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const k = 1 - ht / 0.1; ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.beginPath(); ctx.arc(ix, iy, 9 * k + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      for (let i = 0; i < 8; i++) { if (ht < 0.35) { const a = Math.PI + (i / 8 - 0.5) * 2.4; const sp = 90 + (i % 3) * 30; const d = ht * sp; const k = 1 - ht / 0.35; ctx.fillStyle = i < 6 ? hexA(c, k) : `rgba(255,255,255,${k})`; ctx.beginPath(); ctx.arc(ix + Math.cos(a) * d, iy + Math.sin(a) * d * 0.7 + ht * ht * 120, 1.8, 0, Math.PI * 2); ctx.fill(); } }
      // slad na celu (zostaje do konca fx)
      ctx.fillStyle = 'rgba(20,15,10,0.55)'; ctx.beginPath(); ctx.arc(ix + 2, iy, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
export function hexA(hex, a) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; }

// ── loop ────────────────────────────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.rotate && !state.angleLock) { state.hull += dt * 0.5; state.turret = state.hull + Math.sin(now * 0.0012) * 0.6; }
  if (state.treads) state.tread += dt * 30;
  state.phase = (state.phase + dt * 0.5) % 1;

  for (const r of rows) {
    stepFx(r, dt);
    const recoilK = r.fx.reduce((m, f) => Math.max(m, Math.max(0, 1 - f.t / 0.25)), 0);
    const v1b = BRAWLERS.find(b => b.id === r.id);
    let v2b = brawlerV2(r.id); if (state.skinHex) v2b = withSkin(v2b, state.skinHex);
    for (const col of ['v1', 'v2', 'mob', 'big']) {
      const cv = r.cells[col]; const ctx = cv.getContext('2d');
      const [w, h] = SIZES[col]; const s = SCALES[col];
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx._lwBase = DPR;
      ctx.fillStyle = state.bg; ctx.fillRect(0, 0, w, h);
      // siatka podlogi (kontekst skali)
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; for (let x = 0; x < w; x += 25 * s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 25 * s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const cx = col === 'big' ? w / 2 : w * 0.32, cy = h * 0.55;
      const fireMode = r.fx.length > 0;
      const hullA = fireMode ? 0 : state.hull, turA = fireMode ? 0 : state.turret;
      const tank = { brawler: col === 'v1' ? v1b : v2b, x: 0, y: 0, hullAngle: hullA, turretAngle: turA, recoil: recoilK, pitch: recoilK * 0.3, treadShift: state.tread, hitFlashTimer: 0, isIdle: false };
      ctx.save(); ctx.translate(cx + (fireMode ? -recoilK * 2.4 * s : 0), cy); ctx.scale(s, s);
      if (col === 'v1') drawTank(ctx, tank, state.superShot);
      else drawTankV2(ctx, tank, { liveCanvas: true, phase: state.phase, number: state.number, flagId: state.flagId, isSuper: state.superShot, spin: state.phase * Math.PI * 2, charge: 1 });
      ctx.restore();
      if (col !== 'v1' && r.fx.length) { ctx.save(); ctx.translate(cx, cy); drawFx(ctx, r, s, tank); ctx.restore(); }
      if (col === 'v1' && r.fx.length) { ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); const m = getMuzzlePosV2(tank, 0); const f = r.fx[0]; if (f.t < 0.15) { ctx.fillStyle = `rgba(255,238,68,${1 - f.t / 0.15})`; ctx.beginPath(); ctx.arc(m.x + f.t * 30, m.y, 4, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    }
  }
}
requestAnimationFrame(frame);
