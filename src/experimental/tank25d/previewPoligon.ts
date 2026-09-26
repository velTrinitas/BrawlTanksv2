// @ts-nocheck
/**
 * previewPoligon.ts — POLIGON pelnej skali dla podgladu Tank Art v2 (dev-only).
 * Jeden czolg (art v1/v2), REALNE pociski z laba (fire.ts = te same drawBullet, ktore piecze
 * BulletSpriteBaker), zwykly + SUPER, juice v2 (rozblysk/dym/iskry/smuga/trafienie/kick/shake).
 * Sterowanie: WASD jazda, mysz = cel, LPM (trzymaj) = ogien, SPACJA/przycisk = super.
 */
import { drawTank, BRAWLERS, getMuzzlePos } from './render2d';
import { drawTankV2, brawlerV2, withSkin } from './render2dV2';
import { fireWeapon, stepBullet, drawBulletWithFx, drawTankSuperAura, getSuperTint, getReload, SUPER_DURATION } from './fire';
import { state, DPR, NAMES, setupCanvas, hexA, $, BAKE_DISPLAY_SCALE, MOBILE_ZOOM } from './previewV2';

const P = {
  id: 'twardy', art: 'v2', scaleMode: 'desktop',
  tank: null, bullets: [], flashes: [], fx: [], keys: {},
  pointer: { x: 500, y: 200, down: false }, lastFire: 0,
  superActive: false, superEnd: 0, kickX: 0, kickY: 0, spin: 0, spinV: 0, treadShift: 0, hullAngle: 0,
  shake: 0, wallHits: [],
};
const pcv = document.getElementById('poligon');
const PW = 1000, PH = 420;
const pctx = setupCanvas(pcv, PW, PH);
function pScale() { return P.scaleMode === 'mobile' ? BAKE_DISPLAY_SCALE * MOBILE_ZOOM : BAKE_DISPLAY_SCALE; }
function makeTank() {
  const b = P.art === 'v1' ? BRAWLERS.find(x => x.id === P.id) : (state.skinHex ? withSkin(brawlerV2(P.id), state.skinHex) : brawlerV2(P.id));
  const prev = P.tank;
  P.tank = { brawler: b, x: prev ? prev.x : 200, y: prev ? prev.y : 170, hullAngle: P.hullAngle, turretAngle: 0, recoil: 0, pitch: 0, treadShift: P.treadShift, hitFlashTimer: 0, isIdle: true };
}
makeTank();
document.querySelectorAll('[data-ptank]').forEach(btn => { btn.onclick = () => { P.id = btn.getAttribute('data-ptank'); document.querySelectorAll('[data-ptank]').forEach(x => x.classList.toggle('on', x === btn)); makeTank(); }; });
$('p-art').onchange = e => { P.art = e.target.value; makeTank(); };
$('p-scale').onchange = e => { P.scaleMode = e.target.value; };
$('skin').addEventListener('change', makeTank);
function activateSuper() { const now = performance.now(); if (P.superActive) return; P.superActive = true; P.superEnd = now + SUPER_DURATION; }
$('p-super').onclick = activateSuper;
window.addEventListener('keydown', e => { P.keys[e.key.toLowerCase()] = true; if (e.key === ' ' && document.activeElement === document.body) { e.preventDefault(); activateSuper(); } });
window.addEventListener('keyup', e => { P.keys[e.key.toLowerCase()] = false; });
function toUnits(e) { const r = pcv.getBoundingClientRect(); const s = pScale(); return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; }
pcv.addEventListener('pointermove', e => { const u = toUnits(e); P.pointer.x = u.x; P.pointer.y = u.y; });
pcv.addEventListener('pointerdown', e => { P.pointer.down = true; pcv.setPointerCapture(e.pointerId); const u = toUnits(e); P.pointer.x = u.x; P.pointer.y = u.y; });
pcv.addEventListener('pointerup', () => { P.pointer.down = false; });
pcv.addEventListener('pointercancel', () => { P.pointer.down = false; });
pcv.style.touchAction = 'none'; pcv.style.cursor = 'crosshair';

const WALL_X = 760; // sciana celu (units)
function spawnImpact(x, y, color, big) { P.fx.push({ kind: 'impact', x, y, t: 0, color, big }); P.wallHits.push({ x, y, t: 0 }); if (P.wallHits.length > 8) P.wallHits.shift(); P.shake = Math.max(P.shake, big ? 4 : 1.5); }

function pStep(dt, now) {
  const t = P.tank; const b = t.brawler;
  let dx = 0, dy = 0; if (P.keys.w) dy -= 1; if (P.keys.s) dy += 1; if (P.keys.a) dx -= 1; if (P.keys.d) dx += 1;
  const moving = dx !== 0 || dy !== 0;
  if (moving) { const l = Math.hypot(dx, dy); const sp = (b.speed || 5) * 60 * 0.8; t.x += dx / l * sp * dt; t.y += dy / l * sp * dt; P.hullAngle = Math.atan2(dy, dx); P.treadShift += sp * dt * 0.5; t.x = Math.max(60, Math.min(WALL_X - 80, t.x)); t.y = Math.max(60, Math.min(PH / pScale() - 60, t.y)); }
  t.hullAngle = P.hullAngle; t.treadShift = P.treadShift; t.isIdle = !moving;
  t.turretAngle = Math.atan2(P.pointer.y - t.y, P.pointer.x - t.x);
  if (P.superActive && now > P.superEnd) P.superActive = false;
  const reload = getReload(b, P.superActive);
  if (P.pointer.down && now - P.lastFire > reload) {
    P.lastFire = now;
    fireWeapon(t, t.turretAngle, now, P.bullets, P.flashes, P.superActive, P.pointer);
    b._lastFireT = now;
    P.kickX = -Math.cos(t.turretAngle) * 2.4; P.kickY = -Math.sin(t.turretAngle) * 2.4; t.pitch = Math.min(0.8, t.pitch + 0.2);
    if (P.id === 'scout') P.spinV = 18;
    P.fx.push({ kind: 'shot', t: 0, ang: t.turretAngle, color: P.superActive ? getSuperTint(P.id) : b.color, big: P.superActive, mi: P.id === 'heavy' ? 2 : 1 });
  }
  const fr = dt * 60; t.recoil *= Math.pow(0.82, fr); P.kickX *= Math.pow(0.7, fr); P.kickY *= Math.pow(0.7, fr); t.pitch += (0 - t.pitch) * 9 * dt;
  P.spinV *= Math.pow(0.93, fr); P.spin += (2 + P.spinV) * dt;
  P.shake *= Math.pow(0.8, fr);
  const W = PW / pScale(), H = PH / pScale();
  for (let i = P.bullets.length - 1; i >= 0; i--) {
    const bl = P.bullets[i];
    if (bl.behavior !== 'wave' && bl.x >= WALL_X - (bl.size || 6) * 0.5 && bl.vx > 0) { spawnImpact(WALL_X, bl.y, bl.superTint || b.color, !!bl.isSuper); P.bullets.splice(i, 1); continue; }
    if (!stepBullet(bl, t, dt, P.bullets, W + 200, H + 200)) P.bullets.splice(i, 1);
  }
  for (const f of P.flashes) f.life -= dt; P.flashes = P.flashes.filter(f => f.life > 0);
  for (const f of P.fx) f.t += dt; P.fx = P.fx.filter(f => f.t < 0.9);
  for (const h of P.wallHits) h.t += dt; P.wallHits = P.wallHits.filter(h => h.t < 6);
}

function pDraw(now) {
  const s = pScale(); const t = P.tank; const b = t.brawler;
  pctx.setTransform(DPR, 0, 0, DPR, 0, 0); pctx._lwBase = DPR;
  pctx.fillStyle = state.bg; pctx.fillRect(0, 0, PW, PH);
  pctx.strokeStyle = 'rgba(0,0,0,0.08)'; pctx.lineWidth = 1; for (let x = 0; x < PW; x += 50 * s) { pctx.beginPath(); pctx.moveTo(x, 0); pctx.lineTo(x, PH); pctx.stroke(); } for (let y = 0; y < PH; y += 50 * s) { pctx.beginPath(); pctx.moveTo(0, y); pctx.lineTo(PW, y); pctx.stroke(); }
  const shx = (Math.random() - 0.5) * P.shake, shy = (Math.random() - 0.5) * P.shake;
  pctx.translate(shx, shy); pctx.scale(s, s);
  pctx.fillStyle = '#4a3a2c'; pctx.fillRect(WALL_X, -50, 80, PH / s + 100); pctx.fillStyle = '#6a5a48'; pctx.fillRect(WALL_X, -50, 6, PH / s + 100);
  pctx.strokeStyle = 'rgba(0,0,0,0.35)'; pctx.lineWidth = 1; for (let y = 0; y < PH / s; y += 24) { pctx.beginPath(); pctx.moveTo(WALL_X, y); pctx.lineTo(WALL_X + 80, y); pctx.stroke(); }
  for (const h of P.wallHits) { const k = Math.max(0, 1 - h.t / 6); pctx.fillStyle = `rgba(15,10,8,${0.6 * k})`; pctx.beginPath(); pctx.ellipse(WALL_X + 2, h.y, 3, 5, 0, 0, Math.PI * 2); pctx.fill(); }
  const tk = { ...t, x: t.x + P.kickX, y: t.y + P.kickY - t.pitch * 3 };
  if (P.superActive) drawTankSuperAura(pctx, tk, now);
  const charge = Math.min(1, (now - P.lastFire) / getReload(b, false));
  if (P.art === 'v1') drawTank(pctx, tk, P.superActive);
  else drawTankV2(pctx, tk, { liveCanvas: true, phase: (now * 0.0005) % 1, number: state.number, flagId: state.flagId, isSuper: P.superActive, spin: P.spin, charge });
  if (P.art === 'v1') for (const f of P.flashes) { const k = f.life / f.max; pctx.fillStyle = hexA('#ffee44', k); pctx.beginPath(); pctx.arc(f.x, f.y, (f.big ? 14 : 9) * k, 0, Math.PI * 2); pctx.fill(); }
  else for (const f of P.fx) if (f.kind === 'shot') drawShotJuice(pctx, tk, f);
  for (const bl of P.bullets) {
    if (P.art !== 'v1' && bl.behavior !== 'wave') drawTracer(pctx, bl);
    drawBulletWithFx(pctx, bl);
  }
  for (const f of P.fx) if (f.kind === 'impact') drawImpact(pctx, f, P.art !== 'v1');
  pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  pctx.fillStyle = 'rgba(0,0,0,0.5)'; pctx.fillRect(8, 8, 360, 22); pctx.fillStyle = '#fff'; pctx.font = '12px sans-serif';
  pctx.fillText(`${NAMES[P.id]} ${P.art.toUpperCase()} | ${P.scaleMode} | ${P.superActive ? 'SUPER ' + ((P.superEnd - now) / 1000).toFixed(1) + 's' : 'zwykly strzal'} | pociski: ${P.bullets.length}`, 14, 23);
}

function drawShotJuice(ctx, t, f) {
  const tt = f.t; const c = f.color; const ang = f.ang; const big = f.big;
  const muzzles = f.mi === 2 ? [getMuzzlePos(t, ang, 0), getMuzzlePos(t, ang, 1)] : [getMuzzlePos(t, ang, 0)];
  for (const m of muzzles) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
    const S = big ? 1.6 : 1;
    if (tt < 0.12) {
      const k = 1 - tt / 0.12; ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18 * S * (0.6 + k)); g.addColorStop(0, `rgba(255,255,230,${0.9 * k})`); g.addColorStop(0.35, hexA(c, 0.75 * k)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(30 * S * (0.7 + k), -(12 * k + 3) * S); ctx.lineTo(36 * S * (0.7 + k), 0); ctx.lineTo(30 * S * (0.7 + k), (12 * k + 3) * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.95 * k})`; ctx.beginPath(); ctx.arc(0, 0, (5 * k + 1.5) * S, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 3; i++) { const ts = tt - i * 0.03; if (ts > 0 && ts < 0.7) { const k = ts / 0.7; ctx.fillStyle = `rgba(120,115,110,${0.42 * (1 - k)})`; ctx.beginPath(); ctx.arc(8 + ts * 40 + i * 4, -ts * 16 * (i - 1), (3 + k * 9) * S, 0, Math.PI * 2); ctx.fill(); } }
    for (let i = 0; i < 4; i++) { if (tt < 0.25) { const a = (i - 1.5) * 0.35; const d = tt * 120; ctx.fillStyle = hexA('#ffe08a', 1 - tt / 0.25); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.6, 1.6 * S, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }
}
function drawTracer(ctx, bl) {
  const sp = Math.hypot(bl.vx, bl.vy); if (sp < 1) return;
  const c = bl.superTint || P.tank.brawler.color; const len = Math.min(44, (bl.dist || 0) * 0.5 + 6) * (bl.isSuper ? 1.5 : 1);
  const ux = bl.vx / sp, uy = bl.vy / sp; const w = (bl.size || 6) * 0.9;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(bl.x - ux * len, bl.y - uy * len, bl.x, bl.y); g.addColorStop(0, hexA(c, 0)); g.addColorStop(1, hexA(c, 0.8));
  ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bl.x - ux * len, bl.y - uy * len); ctx.lineTo(bl.x, bl.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, w * 0.3); ctx.beginPath(); ctx.moveTo(bl.x - ux * len * 0.6, bl.y - uy * len * 0.6); ctx.lineTo(bl.x, bl.y); ctx.stroke();
  ctx.restore();
}
function drawImpact(ctx, f, v2) {
  const ht = f.t; const c = f.color; const ix = f.x, iy = f.y; const S = f.big ? 1.7 : 1;
  if (!v2) { if (ht < 0.2) { ctx.fillStyle = hexA('#ffffff', 1 - ht / 0.2); ctx.beginPath(); ctx.arc(ix, iy, 6, 0, Math.PI * 2); ctx.fill(); } return; }
  if (ht < 0.08) { ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - ht / 0.08)})`; ctx.fillRect(WALL_X, iy - 30 * S, 80, 60 * S); }
  if (ht < 0.3) { const k = ht / 0.3; ctx.strokeStyle = hexA(c, 1 - k); ctx.lineWidth = (4 - k * 3) * S; ctx.beginPath(); ctx.arc(ix, iy, (4 + k * 24) * S, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ix, iy, (2 + k * 19) * S, 0, Math.PI * 2); ctx.stroke(); }
  if (ht < 0.1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const k = 1 - ht / 0.1; ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.beginPath(); ctx.arc(ix, iy, (9 * k + 2) * S, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  for (let i = 0; i < 8; i++) { if (ht < 0.35) { const a = Math.PI + (i / 8 - 0.5) * 2.4; const sp = 90 + (i % 3) * 30; const d = ht * sp * S; const k = 1 - ht / 0.35; ctx.fillStyle = i < 6 ? hexA(c, k) : `rgba(255,255,255,${k})`; ctx.beginPath(); ctx.arc(ix + Math.cos(a) * d, iy + Math.sin(a) * d * 0.7 + ht * ht * 120, 1.8 * S, 0, Math.PI * 2); ctx.fill(); } }
}

let pLast = performance.now();
function pLoop(now) { requestAnimationFrame(pLoop); const dt = Math.min(0.05, (now - pLast) / 1000); pLast = now; pStep(dt, now); pDraw(now); }
requestAnimationFrame(pLoop);
