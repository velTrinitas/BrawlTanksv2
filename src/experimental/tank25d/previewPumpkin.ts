// @ts-nocheck
/**
 * previewPumpkin.ts — PUMPKIN (czolg sezonu 4, Dia de los Muertos): symulator dev-only, strona pumpkin-preview.html.
 * Wzorzec 1:1 z previewEnigma.ts: obrotnica 36 katow + skala meczu, skorki ze sklepu, strzelnica z celami 300 HP,
 * DPS/TTK, tabela balansu 10 czolgow. Do tego juice Pumpkina:
 *  - strzal: dynia (prawdziwy painter drawBulletV2), blysk + pestki z wylotu, rozprysk + PLAMA na celu (3 s, zero dmg),
 *  - super (spacja): salwa 5 dyn w wachlarzu, kazda z inna mina; trafienie = konfetti papel picado,
 *  - cecha T: CALACA — szkielet-mariachi na rowerku: wabik (cele "celuja" w niego), nuta co 1,2 s = 8 dmg + spowolnienie.
 * Wszystkie efekty z limitami (pule) — te same liczby trafia do gry. Nie dotyka gry: zadnych importow z main/encji.
 */
import { drawTankV2, brawlerV2, withSkin, getMuzzlePosV2, drawBulletV2 } from './render2dV2';
import { CAMERA_TILT_Y, drawSkinPattern } from './render2d';
import { SKIN_PATTERNS } from './skinPatterns';
import { COSMETICS } from '../../config/cosmetics';
import { BALANCE_V2_STATS } from '../../config/balanceRules';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const BAKE_DISPLAY_SCALE = 1.25;
const LOGIC_STEP_MS = 1000 / 60;
const $ = (id) => document.getElementById(id);
function setupCanvas(cv, w, h) {
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx._lwBase = DPR; return ctx;
}

// ── liczby (propozycja planu; te same pojda do configu gry) ─────────────────
const TUNE = {
  bulletSpeed: 430, bulletSize: 9, // +50% (Mariusz 15.10) superFanDeg: 24, superCount: 5, superSpeedMul: 1.05,
  splatMs: 3000, maxSplats: 1,                 // 1 plama na cel (odswiezana)
  wallSplatMs: 4000, maxWallSplats: 10,        // plamy na scianach: pula 10 sprite'ow z 1 tekstury
  maxSeeds: 40, maxConfetti: 60,               // pule czastek
  calacaMs: 8000, calacaCdMs: 30000, calacaHp: 200, noteEveryMs: 1200, noteRadius: 120, noteDmg: 8, slowPct: 0.15, slowMs: 600, lureRadius: 300,
};

// ── stan ─────────────────────────────────────────────────────────────────────
const S = { angleIdx: 31, autoRotate: true, rotT: 0, mobile: false, skinHex: '', pattern: '', reload: 480, dmg: 135, sdmg: 110, superOn: false, sound: true, phase: 0 };

const SKINS = [{ id: '', label: 'Dynia (domyslna Pumpkina)', hex: '', pattern: '' },
  ...COSMETICS.filter(c => c.type === 'tankSkin' && c.hex).map(c => ({ id: c.id, label: c.id.replace(/^(tp_|skin_)/, '') + (c.pattern ? ' (wzor)' : ''), hex: c.hex, pattern: c.pattern && SKIN_PATTERNS[c.pattern] ? c.pattern : '' }))];
$('palette').innerHTML = SKINS.map((s, i) => `<option value="${i}">${s.label}</option>`).join('');
$('palette').onchange = e => { const s = SKINS[parseInt(e.target.value, 10)]; S.skinHex = s.hex; S.pattern = s.pattern; };
$('auto').onchange = e => { S.autoRotate = e.target.checked; };
$('mobile').onchange = e => { S.mobile = e.target.checked; };
$('angle').oninput = e => { S.angleIdx = parseInt(e.target.value, 10); S.autoRotate = false; $('auto').checked = false; };
const bindRange = (id, key, fmt) => { const el = $(id); const out = $(id + 'V'); const f = () => { S[key] = parseFloat(el.value); out.textContent = fmt(S[key]); }; el.oninput = f; f(); };
bindRange('reload', 'reload', v => `${v} ms`);
bindRange('dmg', 'dmg', v => `${v}`);
bindRange('sdmg', 'sdmg', v => `${v} ×5`);
$('super').onchange = e => { S.superOn = e.target.checked; };
$('sound').onchange = e => { S.sound = e.target.checked; };
$('resetStats').onclick = () => { dmgLog.length = 0; ttks.length = 0; shots = 0; };
$('trait').onclick = () => summonCalaca(performance.now(), true);

// ── dzwiek: synteza (pop / plask / trabka) — w grze to samo wyrenderowane do MP3 ─
let ac = null;
const unlockAudio = () => { if (!ac) try { ac = new AudioContext(); } catch { /* brak */ } };
function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!ac || !S.sound) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, hp = 600) {
  if (!ac || !S.sound) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  f.type = 'lowpass'; f.frequency.value = hp; g.gain.value = vol; src.buffer = buf; src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
}
const sfxShot = (sup) => { tone('sine', sup ? 420 : 260, 90, 0.16, 0.35); noise(0.08, 0.25, 1800); };
const sfxSplat = () => { noise(0.14, 0.45, 700); tone('triangle', 180, 60, 0.12, 0.2); };
const sfxPop = () => { tone('square', 900, 1400, 0.05, 0.08); noise(0.05, 0.15, 3000); };
const sfxTrumpet = (i) => { const f = [392, 494, 587, 659][i % 4]; tone('sawtooth', f, f * 1.01, 0.22, 0.09); tone('square', f * 2, f * 2, 0.18, 0.03); };

function pumpkinBrawler() {
  let b = brawlerV2('pumpkin');
  if (S.skinHex) b = withSkin(b, S.skinHex);
  if (S.pattern) b = { ...b, skinPattern: S.pattern, _skinPhase: S.phase };
  return b;
}
const tankOpts = (extra) => ({ liveCanvas: true, phase: S.phase, number: 7, flagId: 'pl', drawSkin: S.pattern ? drawSkinPattern : undefined, ...extra });

// ── OBROTNICA ────────────────────────────────────────────────────────────────
const TW = 1100, TH = 330;
const turn = setupCanvas($('turn'), TW, TH);
function drawTurntable() {
  const ctx = turn; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx._lwBase = DPR;
  ctx.fillStyle = '#8fbf5a'; ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = '#7aad48'; for (let x = 0; x < TW; x += 40) for (let y = 0; y < TH; y += 40) if (((x + y) / 40) % 2) ctx.fillRect(x, y, 40, 40);
  const a = (S.angleIdx / 36) * Math.PI * 2;
  const big = { brawler: pumpkinBrawler(), x: 0, y: 0, hullAngle: a, turretAngle: a, recoil: 0, pitch: 0, treadShift: performance.now() * 0.02, hitFlashTimer: 0 };
  ctx.save(); ctx.translate(200, 175); ctx.scale(2.5, 2.5); drawTankV2(ctx, big, tankOpts({})); ctx.restore();
  ctx.fillStyle = '#1a2a10'; ctx.font = '13px sans-serif'; ctx.fillText(`PUMPKIN — kat ${S.angleIdx * 10}° (${S.angleIdx + 1}/36)`, 20, 22);
  const z = BAKE_DISPLAY_SCALE * (S.mobile ? 0.6 : 1);
  ['pumpkin', 'twardy', 'enigma', 'pyro'].forEach((id, i) => {
    const bx = 470 + i * 160, by = 190;
    const b = id === 'pumpkin' ? pumpkinBrawler() : brawlerV2(id);
    const t = { brawler: b, x: 0, y: 0, hullAngle: a, turretAngle: a, recoil: 0, pitch: 0, treadShift: 0, hitFlashTimer: 0 };
    ctx.save(); ctx.translate(bx, by); ctx.scale(z, z); drawTankV2(ctx, t, tankOpts({ drawSkin: id === 'pumpkin' && S.pattern ? drawSkinPattern : undefined })); ctx.restore();
    ctx.fillStyle = '#1a2a10'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(id.toUpperCase(), bx, by + 70 * z); ctx.textAlign = 'left';
  });
  ctx.fillText(S.mobile ? 'skala meczu MOBILE (zoom 0.6)' : 'skala meczu DESKTOP', 470, 22);
}

// ── STRZELNICA ───────────────────────────────────────────────────────────────
const RZ = BAKE_DISPLAY_SCALE;
const RW = 1100 / RZ, RH = 480 / RZ;
const rng = setupCanvas($('range'), 1100, 480);
const ENEMY_HP = 300;
const tank = { brawler: null, x: 150, y: 200, hullAngle: 0, turretAngle: 0, recoil: 0, pitch: 0, treadShift: 0, hitFlashTimer: 0 };
const keys = {}; const mouse = { x: 700, y: 260, down: false };
const targets = [0, 1, 2].map(i => ({ x: 650 + (i % 2) * 90, y: 100 + i * 100, r: 22, hp: ENEMY_HP, dead: 0, firstHit: 0, flash: 0, splat: 0, splatRot: 0, slowUntil: 0 }));
const bullets = [], flashes = [], seeds = [], confetti = [], floaters = [], rings = [], wallSplats = [];
// sciany (budynki) do testu plam na zabudowie
const walls = [{ x: 440, y: 40, w: 30, h: 110 }, { x: 440, y: 300, w: 30, h: 110 }];
const enemyBrawler = withSkin(brawlerV2('heavy'), '#5d6168');
let lastFire = 0, shots = 0, superReady = true;
const dmgLog = [], ttks = [];
let calaca = null, calacaCdUntil = 0;

addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); keys[k] = true; unlockAudio();
  if (e.code === 'Space') { fireSuper(performance.now()); e.preventDefault(); }
  if (k === 't') summonCalaca(performance.now(), e.shiftKey);
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const rc = $('range');
rc.addEventListener('mousemove', e => { const r = rc.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / RZ; mouse.y = (e.clientY - r.top) / RZ; });
rc.addEventListener('mousedown', e => { mouse.down = true; unlockAudio(); e.preventDefault(); });
addEventListener('mouseup', () => { mouse.down = false; });
rc.addEventListener('contextmenu', e => e.preventDefault());

function effectiveInterval() { return Math.ceil(S.reload / LOGIC_STEP_MS) * LOGIC_STEP_MS; }
const SEED_COLORS = ['#fff1c8', '#ffd27a', '#f6e6b0'];
const CONF_COLORS = ['#E8318A', '#22C3B5', '#FFB21E', '#8e44ad', '#ffffff'];
function pushSeed(x, y, vx, vy, col) { if (seeds.length >= TUNE.maxSeeds) seeds.shift(); seeds.push({ x, y, vx, vy, t: 0, col, rot: Math.random() * 6 }); }
function pushConfetti(x, y) { for (let k = 0; k < 8; k++) { if (confetti.length >= TUNE.maxConfetti) confetti.shift(); const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120; confetti.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, col: CONF_COLORS[k % 5], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18 }); } }

function spawnPumpkin(ang, dmg, sup, face) {
  const m = getMuzzlePosV2(tank, tank.turretAngle);
  const sp = TUNE.bulletSpeed * (sup ? TUNE.superSpeedMul : 1);
  bullets.push({ x: m.x, y: m.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * CAMERA_TILT_Y, life: 750 / sp, size: TUNE.bulletSize, dmg, sup, face, spin: 0, hist: [] });
}
function muzzleFx(sup) {
  const m = getMuzzlePosV2(tank, tank.turretAngle);
  flashes.push({ x: m.x, y: m.y, a: tank.turretAngle, t: 0, sup });
  for (let k = 0; k < 3; k++) { const a = tank.turretAngle + (Math.random() - 0.5) * 0.9; pushSeed(m.x, m.y, Math.cos(a) * 120, Math.sin(a) * 120 * CAMERA_TILT_Y, SEED_COLORS[k % 3]); }
  tank.recoil = Math.min(1, tank.recoil + (sup ? 0.6 : 0.4));
}
function fire(now) {
  spawnPumpkin(tank.turretAngle, S.dmg, false, 0); muzzleFx(false); shots++; sfxShot(false);
}
/** SUPER: 5 dyn w wachlarzu ±superFanDeg, kazda z inna mina; mala kaskada 40 ms (czytelne "tra-ta-ta"). */
function fireSuper(now) {
  if (!superReady) return; superReady = false; setTimeout(() => { superReady = true; }, 600);
  const n = TUNE.superCount, fan = TUNE.superFanDeg * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) * 2 - 1, order = [2, 1, 3, 0, 4][i];
    setTimeout(() => { spawnPumpkin(tank.turretAngle + k * fan, S.sdmg, true, i); if (i === 0) muzzleFx(true); sfxShot(true); }, order * 40);
  }
  shots += n;
}
/** CECHA: CALACA (szkielet-mariachi na rowerku). */
function summonCalaca(now, force) {
  if (calaca || (!force && now < calacaCdUntil)) return;
  calaca = { x: tank.x + 40, y: tank.y + 30, born: now, hp: TUNE.calacaHp, lastNote: now, notes: 0, dir: 1, bob: 0, hits: 0 };
  calacaCdUntil = now + TUNE.calacaCdMs;
  pushConfetti(calaca.x, calaca.y - 10); tone('sawtooth', 330, 660, 0.3, 0.08);
}

function hitTarget(t, b, now) {
  if (t.hp === ENEMY_HP) t.firstHit = now;
  t.hp -= b.dmg; t.flash = 0.08; dmgLog.push({ t: now, d: b.dmg });
  t.splat = TUNE.splatMs / 1000; t.splatRot = Math.random() * 6; // PLAMA: odswiezana, 1 na cel
  floaters.push({ x: t.x + (Math.random() - 0.5) * 20, y: t.y - 40, v: Math.round(b.dmg), t: 0, sup: b.sup });
  for (let k = 0; k < 5; k++) { const a = Math.random() * Math.PI * 2; pushSeed(b.x, b.y, Math.cos(a) * 150, Math.sin(a) * 150 - 40, SEED_COLORS[k % 3]); }
  rings.push({ x: b.x, y: b.y, t: 0, max: 0.25, r0: 6, r1: b.sup ? 34 : 26, col: '255,160,40' });
  if (b.sup) { pushConfetti(b.x, b.y); sfxPop(); } else sfxSplat();
  if (t.hp <= 0) {
    t.dead = 0.8; ttks.push((now - t.firstHit) / 1000);
    if (b.sup && b.face === 2) { for (let k = 0; k < 3; k++) pushConfetti(t.x, t.y - 20); rings.push({ x: t.x, y: t.y - 10, t: 0, max: 0.4, r0: 10, r1: 70, col: '255,178,30' }); } // mini-fajerwerk srodkowej
  }
}

function stepRange(dt, now) {
  let mx = 0, my = 0; if (keys['w']) my--; if (keys['s']) my++; if (keys['a']) mx--; if (keys['d']) mx++;
  if (mx || my) { const l = Math.hypot(mx, my); tank.x += mx / l * 160 * dt; tank.y += my / l * 160 * dt; tank.hullAngle = Math.atan2(my, mx); tank.treadShift += 160 * dt; }
  tank.x = Math.max(50, Math.min(400, tank.x)); tank.y = Math.max(60, Math.min(RH - 40, tank.y));
  tank.turretAngle = Math.atan2((mouse.y - tank.y) / CAMERA_TILT_Y, mouse.x - tank.x);
  if (mouse.down && now - lastFire >= effectiveInterval()) { lastFire = now; fire(now); }
  tank.recoil = Math.max(0, tank.recoil - dt * 5); tank.pitch = tank.recoil * 0.35;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.spin += dt * (b.sup ? 14 : 9);
    b.hist.push(b.x, b.y); if (b.hist.length > 14) b.hist.splice(0, 2);
    let hit = false;
    for (const w of walls) if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) {
      hit = true; if (wallSplats.length >= TUNE.maxWallSplats) wallSplats.shift();
      const lx = b.vx > 0 ? w.x : w.x + w.w; wallSplats.push({ x: lx, y: b.y, t: TUNE.wallSplatMs / 1000, rot: Math.random() * 6, sup: b.sup });
      for (let k = 0; k < 5; k++) { const a = Math.PI + (Math.random() - 0.5) * 2; pushSeed(lx, b.y, Math.cos(a) * 140, Math.sin(a) * 140 - 40, SEED_COLORS[k % 3]); }
      rings.push({ x: lx, y: b.y, t: 0, max: 0.25, r0: 6, r1: 24, col: '255,140,30' }); if (b.sup) { pushConfetti(lx, b.y); sfxPop(); } else sfxSplat(); break;
    }
    if (!hit) for (const t of targets) {
      if (t.dead > 0) continue;
      if ((b.x - t.x) ** 2 + ((b.y - (t.y - 10)) / CAMERA_TILT_Y) ** 2 < (t.r + b.size) ** 2) { hitTarget(t, b, now); hit = true; break; }
    }
    if (hit || b.life <= 0 || b.x > RW + 20) bullets.splice(i, 1);
  }
  for (const t of targets) {
    t.flash = Math.max(0, t.flash - dt); t.splat = Math.max(0, t.splat - dt);
    if (t.dead > 0) { t.dead -= dt; if (t.dead <= 0) { t.dead = 0; t.hp = ENEMY_HP; t.splat = 0; } }
  }
  // CALACA
  if (calaca) {
    const c = calaca, age = now - c.born;
    let tgt = null, best = 1e9; for (const t of targets) { if (t.dead) continue; const d = Math.hypot(t.x - c.x, t.y - c.y); if (d < best) { best = d; tgt = t; } }
    if (tgt) { // krazy wokol celu 70 px — "przeszkadza", nie szarzuje
      const ang = Math.atan2(c.y - tgt.y, c.x - tgt.x) + dt * 1.6;
      const gx = tgt.x + Math.cos(ang) * 70, gy = tgt.y + Math.sin(ang) * 50;
      c.dir = gx >= c.x ? 1 : -1; c.x += (gx - c.x) * Math.min(1, dt * 2.2); c.y += (gy - c.y) * Math.min(1, dt * 2.2);
    }
    c.bob += dt * 14;
    if (now - c.lastNote >= TUNE.noteEveryMs) {
      c.lastNote = now; sfxTrumpet(c.notes++);
      rings.push({ x: c.x, y: c.y - 8, t: 0, max: 0.45, r0: 10, r1: TUNE.noteRadius, col: '232,49,138' });
      for (const t of targets) if (!t.dead && Math.hypot(t.x - c.x, (t.y - c.y) / CAMERA_TILT_Y) < TUNE.noteRadius) {
        hitTarget(t, { dmg: TUNE.noteDmg, x: t.x, y: t.y - 10, sup: false, face: 0 }, now); t.slowUntil = now + TUNE.slowMs; t.splat = 0;
      }
    }
    if (age > TUNE.calacaMs) { for (let k = 0; k < 3; k++) pushConfetti(c.x, c.y - 10); calaca = null; }
  }
  for (let i = wallSplats.length - 1; i >= 0; i--) { wallSplats[i].t -= dt; if (wallSplats[i].t <= 0) wallSplats.splice(i, 1); }
  for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 0.08) flashes.splice(i, 1); }
  for (let i = seeds.length - 1; i >= 0; i--) { const s = seeds[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt; s.vx *= 0.97; s.rot += dt * 10; if (s.t > 0.5) seeds.splice(i, 1); }
  for (let i = confetti.length - 1; i >= 0; i--) { const s = confetti[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.vx *= 0.95; s.rot += s.vr * dt; if (s.t > 0.9) confetti.splice(i, 1); }
  for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].max) rings.splice(i, 1); }
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; f.y -= 40 * dt; if (f.t > 0.6) floaters.splice(i, 1); }
  while (dmgLog.length && now - dmgLog[0].t > 3000) dmgLog.shift();
}

/** PLAMA dyni na celu: 1 ksztalt (wypiekany w grze jako 1 tekstura), obrot losowy, zanik w ostatniej sekundzie. */
function drawSplat(ctx, x, y, r, rot, a, tilt = CAMERA_TILT_Y) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a;
  ctx.save(); ctx.rotate(rot); ctx.scale(1, tilt);
  const blob = (k) => { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const an = i / 12 * Math.PI * 2, rr = r * k * (i % 2 ? 0.66 : 1) * (1 + 0.12 * Math.sin(i * 2.3)); i ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); };
  ctx.fillStyle = 'rgba(60,20,0,0.35)'; ctx.translate(1.2, 1.6); blob(1); ctx.fill(); ctx.translate(-1.2, -1.6); // cien = grubosc mazi
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 1, 0, 0, r); g.addColorStop(0, '#ffb04a'); g.addColorStop(0.6, '#e8701a'); g.addColorStop(1, '#b84a0a');
  ctx.fillStyle = g; blob(1); ctx.fill();
  [[r * 1.15, 0.3, 3.4], [-r * 1.0, 2.2, 2.8], [r * 0.5, 4.1, 2.4], [r * 1.25, 5.3, 1.8]].forEach(([d, an, sz]) => { ctx.fillStyle = '#d8621a'; ctx.beginPath(); ctx.arc(Math.cos(an) * d, Math.sin(an) * d, sz, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#fff1c8'; [[0.2, -0.3], [-0.35, 0.2], [0.3, 0.35], [-0.1, 0.5]].forEach(([px, py]) => { ctx.beginPath(); ctx.ellipse(px * r, py * r, 2.6, 1.4, px * 3, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.28, r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill(); // polysk
  ctx.restore();
  // zacieki splywajace w dol (ekran) — rosna w pierwszych 0,5 s
  ctx.fillStyle = '#d8621a'; [-0.4, 0.15, 0.5].forEach((k, i) => { const L = r * (0.5 + i * 0.25); ctx.beginPath(); roundRectLocal(ctx, k * r - 1.4, r * 0.2, 2.8, L); ctx.fill(); ctx.beginPath(); ctx.arc(k * r, r * 0.2 + L, 2, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}
function roundRectLocal(ctx, x, y, w, h) { ctx.roundRect(x, y, w, h, w / 2); }

/** CALACA: szkielet w sombrero na rowerku (w grze: 2 wypieczone klatki pedalowania + bob). */
function drawCalaca(ctx, c, now) {
  const age = now - c.born, k = Math.min(1, age / 250), out = Math.max(0, 1 - (TUNE.calacaMs - age) / 300);
  const SC = 1.45; ctx.save(); ctx.translate(c.x, c.y); ctx.scale(SC * c.dir * (0.6 + 0.4 * k) * (1 - out * 0.6), SC * (0.6 + 0.4 * k) * (1 - out * 0.6));
  const bob = Math.sin(c.bob) * 1.5, ped = c.bob * 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 6, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  // rowerek: 2 kola + rama (turkus)
  for (const wx of [-10, 10]) { ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx, 0, 6, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(wx + Math.cos(ped) * 5, Math.sin(ped) * 5); ctx.lineTo(wx - Math.cos(ped) * 5, -Math.sin(ped) * 5); ctx.stroke(); }
  ctx.strokeStyle = '#22C3B5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-2, -8); ctx.lineTo(8, -8); ctx.lineTo(10, 0); ctx.moveTo(-2, -8); ctx.lineTo(0, 0); ctx.stroke();
  // nogi (kosci) pedaluja
  ctx.strokeStyle = '#f6eedc'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-2, -12 + bob); ctx.lineTo(Math.cos(ped) * 3, Math.sin(ped) * 3 - 1); ctx.stroke();
  // tulow (zebra) + reka z trabka
  ctx.fillStyle = '#1a1020'; ctx.beginPath(); ctx.ellipse(-1, -17 + bob, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f6eedc'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-4, -20 + i * 3 + bob); ctx.lineTo(2, -20 + i * 3 + bob); ctx.stroke(); }
  ctx.fillStyle = '#FFB21E'; ctx.beginPath(); ctx.moveTo(4, -21 + bob); ctx.lineTo(14, -24 + bob); ctx.lineTo(16, -19 + bob); ctx.closePath(); ctx.fill(); // trabka
  ctx.beginPath(); ctx.ellipse(15.5, -21.5 + bob, 1.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  // czaszka-cukrowka
  ctx.fillStyle = '#f6eedc'; ctx.beginPath(); ctx.arc(1, -28 + bob, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4A2008'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = '#1a0d06'; [-1.5, 3.5].forEach(ex => { ctx.beginPath(); ctx.arc(ex, -29 + bob, 1.7, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#E8318A'; [-1.5, 3.5].forEach(ex => { ctx.beginPath(); ctx.arc(ex, -29 + bob, 0.7, 0, Math.PI * 2); ctx.fill(); });
  ctx.strokeStyle = '#1a0d06'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-1, -25 + bob); ctx.lineTo(4, -25 + bob); ctx.stroke();
  // sombrero
  ctx.fillStyle = '#E8318A'; ctx.beginPath(); ctx.ellipse(1, -33 + bob, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c72576'; ctx.beginPath(); ctx.ellipse(1, -36 + bob, 4.5, 4, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#FFB21E'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(1 + i * 4, -33 + bob, 0.9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // pasek czasu nad glowa
  const left = 1 - age / TUNE.calacaMs;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(c.x - 16, c.y - 48, 32, 4); ctx.fillStyle = '#E8318A'; ctx.fillRect(c.x - 15, c.y - 47, 30 * left, 2);
}

function drawRange(now) {
  const ctx = rng; ctx.setTransform(DPR * RZ, 0, 0, DPR * RZ, 0, 0); ctx._lwBase = DPR * RZ;
  ctx.fillStyle = '#c9a86a'; ctx.fillRect(0, 0, RW, RH);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1; for (let x = 0; x < RW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, RH); ctx.stroke(); } for (let y = 0; y < RH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(RW, y); ctx.stroke(); }
  for (const t of targets) {
    if (t.dead > 0) { ctx.fillStyle = `rgba(80,40,20,${t.dead})`; ctx.beginPath(); ctx.ellipse(t.x, t.y, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 4, 24, 11, 0, 0, Math.PI * 2); ctx.fill();
    drawTankV2(ctx, { brawler: enemyBrawler, x: t.x, y: t.y, hullAngle: Math.PI, turretAngle: Math.PI, recoil: 0, pitch: 0, treadShift: 0, hitFlashTimer: t.flash }, tankOpts({ drawSkin: undefined }));
    if (t.splat > 0) drawSplat(ctx, t.x + 2, t.y - 16, 20, t.splatRot, Math.min(1, t.splat));
    if (now < t.slowUntil) { ctx.font = '14px sans-serif'; ctx.fillText('🎵', t.x + 14, t.y - 26); }
    if (calaca) { ctx.strokeStyle = 'rgba(232,49,138,0.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(t.x, t.y - 10); ctx.lineTo(calaca.x, calaca.y - 10); ctx.stroke(); ctx.setLineDash([]); } // wabik: cel "celuje" w Calace
    ctx.fillStyle = '#222'; ctx.fillRect(t.x - 26, t.y - 46, 52, 7); ctx.fillStyle = t.hp > 120 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(t.x - 25, t.y - 45, 50 * Math.max(0, t.hp) / ENEMY_HP, 5);
  }
  for (const w of walls) { // budynek: sciana z cegly (fake 3D: wieko + front)
    ctx.fillStyle = '#5a4636'; ctx.fillRect(w.x, w.y + w.h - 14, w.w, 14);
    ctx.fillStyle = '#8a6e52'; ctx.fillRect(w.x, w.y - 14, w.w, w.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; for (let yy = w.y - 6; yy < w.y + w.h - 14; yy += 10) { ctx.beginPath(); ctx.moveTo(w.x, yy); ctx.lineTo(w.x + w.w, yy); ctx.stroke(); }
    ctx.strokeStyle = '#2a1e14'; ctx.lineWidth = 1.5; ctx.strokeRect(w.x, w.y - 14, w.w, w.h + 14);
  }
  for (const ws of wallSplats) drawSplat(ctx, ws.x, ws.y - 14, ws.sup ? 14 : 16, ws.rot, Math.min(1, ws.t), 1);
  tank.brawler = pumpkinBrawler();
  drawTankV2(ctx, tank, tankOpts({}));
  if (calaca) drawCalaca(ctx, calaca, now);
  // pierscienie (rozprysk / nuta)
  for (const r of rings) { const k = r.t / r.max; ctx.strokeStyle = `rgba(${r.col},${1 - k})`; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, (r.r0 + (r.r1 - r.r0) * k) * CAMERA_TILT_Y, 0, 0, Math.PI * 2); ctx.stroke(); }
  // blysk wylotu (ADD) — pomaranczowy "puf"
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of flashes) { const k = 1 - f.t / 0.08, R = (f.sup ? 20 : 14) * k; const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R * 1.6); g.addColorStop(0, `rgba(255,220,140,${0.9 * k})`); g.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R * 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // dynie: prawdziwy painter gry, obracaja sie w locie
  const FACE_COL = ['232,49,138', '34,195,181', '255,178,30', '155,89,255', '255,90,60'];
  for (const b of bullets) { // smuga (zwezajaca sie, ADD) + cien na ziemi (nieobracany, ~14 px pod dynia)
    const h = b.hist, col = b.sup ? FACE_COL[b.face % 5] : '255,122,18';
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 2; i < h.length; i += 2) { const k = i / h.length; ctx.strokeStyle = 'rgba(' + col + ',' + (0.55 * k) + ')'; ctx.lineWidth = b.size * 1.6 * k; ctx.beginPath(); ctx.moveTo(h[i - 2], h[i - 1]); ctx.lineTo(h[i], h[i + 1]); ctx.stroke(); }
    if (h.length >= 2) { ctx.strokeStyle = 'rgba(' + col + ',0.6)'; ctx.lineWidth = b.size * 1.7; ctx.beginPath(); ctx.moveTo(h[h.length - 2], h[h.length - 1]); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 14, b.size * 1.2, b.size * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of bullets) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.sin(b.spin) * 0.35); ctx.translate(-b.x, -b.y);
    drawBulletV2(ctx, 'pumpkin', { x: b.x, y: b.y, size: b.size, isSuper: b.sup, face: b.face, noShadow: true }, () => {});
    ctx.restore();
  }
  for (const s of seeds) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - s.t / 0.5; ctx.fillStyle = s.col; ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  for (const s of confetti) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - s.t / 0.9; ctx.fillStyle = s.col; ctx.fillRect(-3, -2, 6, 4); ctx.restore(); }
  for (const f of floaters) { ctx.globalAlpha = 1 - f.t / 0.6; ctx.fillStyle = f.sup ? '#ffb21e' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = `bold ${f.sup ? 15 : 12}px sans-serif`; ctx.strokeText(String(f.v), f.x, f.y); ctx.fillText(String(f.v), f.x, f.y); ctx.globalAlpha = 1; }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y); ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke();
  // HUD cechy (podglad ikony + cooldown)
  const cd = Math.max(0, calacaCdUntil - now);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(RW - 150, 10, 140, 26); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
  ctx.fillText(calaca ? 'CALACA gra!' : cd > 0 ? `CALACA za ${(cd / 1000).toFixed(0)} s (Shift+T)` : 'CALACA gotowa (T)', RW - 144, 27);
  ctx.fillText(`czastki: pestki ${seeds.length}/${TUNE.maxSeeds} · konfetti ${confetti.length}/${TUNE.maxConfetti}`, 10, RH - 10);
}

function updateStats() {
  const dps = dmgLog.reduce((s, e) => s + e.d, 0) / 3;
  const iv = effectiveInterval(), perSec = 1000 / iv, theoDps = perSec * S.dmg;
  const theoTtk = (Math.ceil(ENEMY_HP / S.dmg) - 1) * iv / 1000;
  const avgTtk = ttks.length ? ttks.reduce((a, b) => a + b, 0) / ttks.length : 0;
  $('stats').innerHTML =
    `<b>Kadencja realna:</b> ${perSec.toFixed(2)} strz/s (co ${iv.toFixed(1)} ms) · <b>DPS teoretyczny:</b> ${theoDps.toFixed(0)} · <b>zmierzony (3 s):</b> ${dps.toFixed(0)} · porownanie: Twardy ≈ 357, King ≈ 355<br>` +
    `<b>TTK 300 HP:</b> teoretyczny ${theoTtk.toFixed(2)} s · sredni ${ttks.length ? avgTtk.toFixed(2) : '—'} s (${ttks.length} zabic) · strzalow ${shots}<br>` +
    `<b>SUPER:</b> ${TUNE.superCount} × ${S.sdmg} = ${TUNE.superCount * S.sdmg} (wachlarz ±${TUNE.superFanDeg}°; na jeden cel trafiaja zwykle 2–3 dynie = ${2 * S.sdmg}–${3 * S.sdmg}) · ` +
    `<b>CALACA:</b> ${TUNE.calacaMs / 1000} s, nuta co ${TUNE.noteEveryMs / 1000} s = ${TUNE.noteDmg} dmg + spowolnienie ${TUNE.slowPct * 100}% (${Math.floor(TUNE.calacaMs / TUNE.noteEveryMs)} nut ≈ ${Math.floor(TUNE.calacaMs / TUNE.noteEveryMs) * TUNE.noteDmg} dmg na cel), wabik ${TUNE.lureRadius} px, ${TUNE.calacaHp} HP, odnowienie ${TUNE.calacaCdMs / 1000} s`;
}

const STAT_MAX = { hp: 700, dmg: 400, speed: 7.5, tempo: 5, range: 1400 };
const NAMES = { pyro: 'OGNIARZ', scout: 'ZWIAD', sniper: 'SNAJPER', twardy: 'TWARDY', heavy: 'PANCERNY', shadow: 'SHADOW', plasma: 'TECH', king: 'KING', enigma: 'ENIGMA' };
const E = { hp: 425, speed: 5.6, range: 750 };
const stepMs = (ms) => Math.ceil(ms / LOGIC_STEP_MS) * LOGIC_STEP_MS;
function metrics(dmgPerShot, perShot, reloadMs) {
  const shotDmg = dmgPerShot * perShot, shots = Math.ceil(ENEMY_HP / shotDmg), iv = stepMs(reloadMs) / 1000, dps = shotDmg / iv;
  return { shots, ttk: (shots - 1) * iv, cycle: shots * iv, dps, model: 0.068 * dps * (38 / 40) ** 2 + 14.6 };
}
$('eHp').oninput = e => { E.hp = +e.target.value || 0; };
$('eSpeed').oninput = e => { E.speed = +e.target.value || 0; };
$('eRange').oninput = e => { E.range = +e.target.value || 0; };
const bar = (label, val, max, shown, note = '') => { const pct = Math.min(100, Math.round(val / max * 100)); return `<div class="st"><em>${label}</em><span class="bar"><b style="width:${pct}%"></b></span><u>${shown}</u>${note ? `<i>${note}</i>` : ''}</div>`; };
function updateBalance() {
  const tempoUi = Math.round(1000 / S.reload * 10) / 10;
  $('statPanel').innerHTML = bar('HP', E.hp, STAT_MAX.hp, E.hp) + bar('DMG', S.dmg, STAT_MAX.dmg, S.dmg) + bar('SPEED', E.speed, STAT_MAX.speed, E.speed) + bar('TEMPO', tempoUi, STAT_MAX.tempo, tempoUi) + bar('ZASIEG', E.range, STAT_MAX.range, E.range);
  const rows = Object.entries(BALANCE_V2_STATS).map(([id, b]) => {
    const n = b.volley ? b.volley.count : (id === 'heavy' ? 2 : 1);
    return { id, name: NAMES[id] || id, hp: b.hp, dmgTxt: n > 1 ? `${b.dmg}×${n}` : `${b.dmg}`, reload: b.reload, speed: b.speed, range: b.maxDist, extra: b.pierce ? `przebicie ${b.pierce}` : (b.dash ? 'dash' : ''), m: metrics(b.dmg, n, b.reload) };
  });
  const pm = metrics(S.dmg, 1, S.reload);
  rows.push({ id: 'pumpkin', name: 'PUMPKIN', hp: E.hp, dmgTxt: `${S.dmg}`, reload: S.reload, speed: E.speed, range: E.range, extra: 'kola, duzy pocisk (r 11)', m: pm, me: true });
  rows.sort((a, b) => a.m.cycle - b.m.cycle);
  const nextDmg = pm.shots > 1 ? Math.ceil(ENEMY_HP / (pm.shots - 1)) : null;
  $('balance').innerHTML =
    `<table><tr><th>czolg</th><th>HP</th><th>DMG</th><th>reload ms (realny)</th><th>SPEED</th><th>zasieg</th><th>strzalow na 300 HP</th><th>TTK 1 celu</th><th>s / zabicie</th><th>DPS</th><th>model bota</th><th>cecha</th></tr>` +
    rows.map(r => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.hp}</td><td>${r.dmgTxt}</td><td>${r.reload} (${stepMs(r.reload).toFixed(0)})</td><td>${r.speed}</td><td>${r.range}</td><td>${r.m.shots}</td><td>${r.m.ttk.toFixed(2)} s</td><td>${r.m.cycle.toFixed(2)}</td><td>${r.m.dps.toFixed(0)}</td><td>${r.m.model.toFixed(0)}</td><td>${r.extra}</td></tr>`).join('') +
    `</table><p class="tip"><b>Progi Pumpkina:</b> ${pm.shots} strzaly na 300 HP` + (nextDmg ? ` · DMG <b>${nextDmg}</b> = ${pm.shots - 1} strzaly (s/zabicie ${metrics(nextDmg, 1, S.reload).cycle.toFixed(2)})` : '') +
    `. Zalozenie: DPS ponizej Twardego/Kinga, w zamian szybszy na kolach i wiekszy pocisk (latwiej trafic). Sortowanie: od najszybszego zabijania.</p>`;
}

let last = performance.now(), statT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  S.phase = (S.phase + dt * 0.6) % 1;
  if (S.autoRotate) { S.rotT += dt; if (S.rotT > 0.15) { S.rotT = 0; S.angleIdx = (S.angleIdx + 1) % 36; $('angle').value = String(S.angleIdx); } }
  stepRange(dt, now);
  drawTurntable();
  drawRange(now);
  statT += dt; if (statT > 0.2) { statT = 0; updateStats(); updateBalance(); }
}
requestAnimationFrame(frame);
/** Portret 200x200 do galerii/garazu (tools/pumpkin-portrait.mjs): 3/4 widoku, tlo bialy (png) albo noc fiesty (jpg). */
function portrait(kind) {
  const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400; const ctx = cv.getContext('2d'); ctx._lwBase = 2;
  if (kind === 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 400, 400); }
  else { const g = ctx.createRadialGradient(200, 230, 20, 200, 200, 300); g.addColorStop(0, '#6a2a4a'); g.addColorStop(1, '#1a0a18'); ctx.fillStyle = g; ctx.fillRect(0, 0, 400, 400);
    ['#E8318A', '#FFB21E', '#22C3B5', '#E8318A', '#FFB21E', '#22C3B5', '#E8318A'].forEach((c, i) => { const x = 20 + i * 56, y = 40 + Math.sin(i / 6 * Math.PI) * 18; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y); ctx.lineTo(x + 40, y + 34); ctx.lineTo(x + 20, y + 26); ctx.lineTo(x, y + 34); ctx.closePath(); ctx.fill(); }); }
  const a = -0.6;
  const t = { brawler: brawlerV2('pumpkin'), x: 0, y: 0, hullAngle: a, turretAngle: a, recoil: 0, pitch: 0, treadShift: 0, hitFlashTimer: 0 };
  ctx.save(); ctx.translate(200, 225); ctx.scale(3.2, 3.2); drawTankV2(ctx, t, { liveCanvas: false, phase: 0.25, number: 7, flagId: 'pl' }); ctx.restore();
  const o = document.createElement('canvas'); o.width = 200; o.height = 200; const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(cv, 0, 0, 200, 200);
  return o.toDataURL(kind === 'png' ? 'image/png' : 'image/jpeg', 0.9);
}
window.__pumpkin = { portrait, S, mouse, tank, TUNE, fireBurst: (ms) => { mouse.down = true; setTimeout(() => { mouse.down = false; }, ms); }, fireSuper: () => fireSuper(performance.now()), summon: () => summonCalaca(performance.now(), true) };
