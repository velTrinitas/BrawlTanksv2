// @ts-nocheck
/**
 * previewEnigma.ts — ENIGMA ETAP 1: symulator 9. czolgu (gatling). Dev-only, strona enigma-preview.html.
 *
 * Obrotnica 36 katow (Enigma duzo + skala meczu obok Twardego/Pancernego/Ogniarza), skorki (paleta + wzor),
 * strzelnica z celami HP 300 (wrog V2), przelacznik zwykly/super, suwaki kadencji/obrazen/rozrzutu,
 * liczniki DPS i TTK. Juice gatlinga: rozpedzanie luf, blysk z kolejnych luf, zlote smugi, luski (max 24),
 * odrzut wiezy. Dzwiek: GatlingSfx (WebAudio). Rysunek = PRAWDZIWY painter render2dV2 (ten sam co baker gry).
 * Nie dotyka gry: zadnych importow z main/encji.
 */
import { drawTankV2, brawlerV2, withSkin, getMuzzlePosV2 } from './render2dV2';
import { CAMERA_TILT_Y, drawSkinPattern } from './render2d';
import { SKIN_PATTERNS } from './skinPatterns';
import { GatlingSfx } from './gatlingSfx';
import { COSMETICS } from '../../config/cosmetics';
import { BALANCE_V2_STATS } from '../../config/balanceRules';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const BAKE_DISPLAY_SCALE = 1.25;          // skala czolgu w meczu (Player.ts)
const LOGIC_STEP_MS = 1000 / 60;          // krok logiki gry — kadencja zaokraglana w gore do krokow
const $ = (id) => document.getElementById(id);

function setupCanvas(cv, w, h) {
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx._lwBase = DPR; return ctx;
}

// ── stan ─────────────────────────────────────────────────────────────────────
const S = {
  angleIdx: 31, autoRotate: true, rotT: 0, mobile: false, skinHex: '', pattern: '',
  reload: 70, dmg: 38, spreadDeg: 3, superOn: false, sound: true,
  phase: 0,
};
const sfx = new GatlingSfx();

// kontrolki
// Skorki DOKLADNIE jak w grze/sklepie: kazda skorka = paleta bazowa (hex) + opcjonalny wzor (cosmetics.ts).
// Wzor zawsze idzie ze swoja paleta — boki kadluba/wiezy (ekstruzja) maja kolor pasujacy do wierzchu.
const SKINS = [{ id: '', label: 'Zloto (domyslna Enigmy)', hex: '', pattern: '' },
  ...COSMETICS.filter(c => c.type === 'tankSkin' && c.hex).map(c => ({ id: c.id, label: c.id.replace(/^(tp_|skin_)/, '') + (c.pattern ? ' (wzor)' : ''), hex: c.hex, pattern: c.pattern && SKIN_PATTERNS[c.pattern] ? c.pattern : '' }))];
$('palette').innerHTML = SKINS.map((s, i) => `<option value="${i}">${s.label}</option>`).join('');
$('palette').onchange = e => { const s = SKINS[parseInt(e.target.value, 10)]; S.skinHex = s.hex; S.pattern = s.pattern; };
$('auto').onchange = e => { S.autoRotate = e.target.checked; };
$('mobile').onchange = e => { S.mobile = e.target.checked; };
$('angle').oninput = e => { S.angleIdx = parseInt(e.target.value, 10); S.autoRotate = false; $('auto').checked = false; };
const bindRange = (id, key, fmt) => { const el = $(id); const out = $(id + 'V'); const f = () => { S[key] = parseFloat(el.value); out.textContent = fmt(S[key]); }; el.oninput = f; f(); };
bindRange('reload', 'reload', v => `${v} ms`);
bindRange('dmg', 'dmg', v => `${v}`);
bindRange('spread', 'spreadDeg', v => `±${v}°`);
$('super').onchange = e => { S.superOn = e.target.checked; };
$('sound').onchange = e => { S.sound = e.target.checked; sfx.enabled = S.sound; };
$('sfxMode').onchange = e => { sfx.mode = e.target.value; };
// MP3 dekodowane raz, przy pierwszym gescie (AudioContext musi juz istniec)
let samplesRequested = false;
const unlockAudio = () => { sfx.unlock(); if (!samplesRequested) { samplesRequested = true; void sfx.loadSamples(import.meta.env.BASE_URL + 'sfx/shoot_gatling.mp3', import.meta.env.BASE_URL + 'sfx/shoot_gatling_super.mp3'); } };
$('resetStats').onclick = () => { dmgLog.length = 0; ttks.length = 0; shots = 0; };

function enigmaBrawler() {
  let b = brawlerV2('enigma');
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
  const spin = performance.now() * 0.004;
  // duza Enigma (garaz)
  const big = { brawler: enigmaBrawler(), x: 0, y: 0, hullAngle: a, turretAngle: a, recoil: 0, pitch: 0, treadShift: performance.now() * 0.02, hitFlashTimer: 0 };
  ctx.save(); ctx.translate(200, 175); ctx.scale(2.5, 2.5); drawTankV2(ctx, big, tankOpts({ spin })); ctx.restore();
  ctx.fillStyle = '#1a2a10'; ctx.font = '13px sans-serif'; ctx.fillText(`ENIGMA — kat ${S.angleIdx * 10}° (${S.angleIdx + 1}/36)`, 20, 22);
  // skala meczu: Enigma obok obecnych czolgow
  const z = BAKE_DISPLAY_SCALE * (S.mobile ? 0.6 : 1);
  const ids = ['enigma', 'twardy', 'heavy', 'pyro'];
  ids.forEach((id, i) => {
    const bx = 470 + i * 160, by = 190;
    const b = id === 'enigma' ? enigmaBrawler() : brawlerV2(id);
    const t = { brawler: b, x: 0, y: 0, hullAngle: a, turretAngle: a, recoil: 0, pitch: 0, treadShift: 0, hitFlashTimer: 0 };
    ctx.save(); ctx.translate(bx, by); ctx.scale(z, z); drawTankV2(ctx, t, tankOpts({ spin, drawSkin: id === 'enigma' && S.pattern ? drawSkinPattern : undefined })); ctx.restore();
    ctx.fillStyle = '#1a2a10'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(id.toUpperCase(), bx, by + 70 * z); ctx.textAlign = 'left';
  });
  ctx.fillText(S.mobile ? 'skala meczu MOBILE (zoom 0.6)' : 'skala meczu DESKTOP', 470, 22);
}

// ── STRZELNICA ───────────────────────────────────────────────────────────────
const RZ = BAKE_DISPLAY_SCALE;              // cala scena strzelnicy w skali meczu
const RW = 1100 / RZ, RH = 480 / RZ;          // wymiary w jednostkach swiata
const rng = setupCanvas($('range'), 1100, 480);
const ENEMY_HP = 300; // wrog V2 (balanceRules.ts)
const tank = { brawler: null, x: 150, y: 200, hullAngle: 0, turretAngle: 0, recoil: 0, pitch: 0, treadShift: 0, hitFlashTimer: 0 };
const keys = {}; let mouse = { x: 700, y: 260, down: false };
const targets = [0, 1, 2].map(i => ({ x: 650 + (i % 2) * 90, y: 100 + i * 100, r: 22, hp: ENEMY_HP, dead: 0, firstHit: 0, flash: 0 }));
const bullets = [], casings = [], flashes = [], sparks = [], floaters = [];
const MAX_CASINGS = 24;
let spinVel = 0, spinAngle = 0, spinT = 0, lastFire = 0, barrelIdx = 0, wasFiring = false, shots = 0;
const dmgLog = [], ttks = [];

addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.code === 'Space') { S.superOn = !S.superOn; $('super').checked = S.superOn; e.preventDefault(); } unlockAudio(); });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const rc = $('range');
rc.addEventListener('mousemove', e => { const r = rc.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / RZ; mouse.y = (e.clientY - r.top) / RZ; });
rc.addEventListener('mousedown', e => { mouse.down = true; unlockAudio(); e.preventDefault(); });
addEventListener('mouseup', () => { mouse.down = false; });
rc.addEventListener('contextmenu', e => e.preventDefault());

/** Realny odstep strzalow: reload zaokraglony W GORE do krokow logiki (jak w grze). */
function effectiveInterval() { return Math.ceil(S.reload / LOGIC_STEP_MS) * LOGIC_STEP_MS; }

function fire(now) {
  const sup = S.superOn;
  const ang = tank.turretAngle + (Math.random() * 2 - 1) * S.spreadDeg * Math.PI / 180;
  const m = getMuzzlePosV2(tank, tank.turretAngle);
  // wylot kolejnej lufy (pakiet R=5.2 obraca sie) — przesuniecie w poprzek osi
  barrelIdx = (barrelIdx + 1) % 6;
  const off = Math.cos(spinAngle + barrelIdx * Math.PI / 3) * 5.2;
  const px = -Math.sin(tank.turretAngle) * off, py = Math.cos(tank.turretAngle) * off * CAMERA_TILT_Y;
  const speed = 560 * (sup ? 1.1 : 1);
  bullets.push({ x: m.x + px, y: m.y + py, px: m.x + px, py: m.y + py, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed * CAMERA_TILT_Y, life: 0.9, size: 3 * (sup ? 1.6 : 1), dmg: S.dmg * (sup ? 1.5 : 1), sup });
  flashes.push({ x: m.x + px, y: m.y + py, a: tank.turretAngle, t: 0, sup });
  // luska z boku wiezy (pula max 24 — najstarsza wylatuje)
  if (casings.length >= MAX_CASINGS) casings.shift();
  const side = tank.turretAngle + Math.PI / 2;
  casings.push({ x: tank.x + Math.cos(tank.turretAngle) * 10, y: tank.y + Math.sin(tank.turretAngle) * 10 * CAMERA_TILT_Y - 14,
    vx: Math.cos(side) * (60 + Math.random() * 40) - Math.cos(tank.turretAngle) * 20, vy: Math.sin(side) * (60 + Math.random() * 40) * CAMERA_TILT_Y,
    z: 10, vz: 70 + Math.random() * 50, rot: Math.random() * 6, vr: (Math.random() * 2 - 1) * 20, life: 0.9 });
  tank.recoil = Math.min(1, tank.recoil + (sup ? 0.35 : 0.22));
  shots++;
  if (S.sound) sfx.shot(sup);
}

function stepRange(dt, now) {
  // ruch
  let mx = 0, my = 0; if (keys['w']) my--; if (keys['s']) my++; if (keys['a']) mx--; if (keys['d']) mx++;
  if (mx || my) { const l = Math.hypot(mx, my); tank.x += mx / l * 140 * dt; tank.y += my / l * 140 * dt; tank.hullAngle = Math.atan2(my, mx); tank.treadShift += 140 * dt; }
  tank.x = Math.max(50, Math.min(560, tank.x)); tank.y = Math.max(60, Math.min(RH - 40, tank.y));
  tank.turretAngle = Math.atan2((mouse.y - tank.y) / CAMERA_TILT_Y, mouse.x - tank.x);
  // rozpedzanie luf (0,25 s) i hamowanie
  const firing = mouse.down;
  if (firing && !wasFiring && S.sound) sfx.spinUp();
  if (!firing && wasFiring && S.sound) sfx.spinDown();
  wasFiring = firing;
  spinT = firing ? Math.min(0.25, spinT + dt) : Math.max(0, spinT - dt * 0.6);
  const spinK = spinT / 0.25;
  spinVel = spinK * 38;
  spinAngle += spinVel * dt;
  if (firing && spinK > 0.15) {
    const interval = effectiveInterval() / Math.max(0.35, spinK); // pierwsze strzaly wolniej
    if (now - lastFire >= interval) { lastFire = now; fire(now); }
  }
  tank.recoil = Math.max(0, tank.recoil - dt * 8); tank.pitch = tank.recoil * 0.25;
  // pociski
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let hit = false;
    for (const t of targets) {
      if (t.dead > 0) continue;
      if ((b.x - t.x) ** 2 + ((b.y - (t.y - 10)) / CAMERA_TILT_Y) ** 2 < (t.r + b.size) ** 2) {
        if (t.hp === ENEMY_HP) t.firstHit = now;
        t.hp -= b.dmg; t.flash = 0.08; dmgLog.push({ t: now, d: b.dmg });
        floaters.push({ x: t.x + (Math.random() - 0.5) * 20, y: t.y - 40, v: Math.round(b.dmg), t: 0, sup: b.sup });
        for (let k = 0; k < (b.sup ? 6 : 3); k++) sparks.push({ x: b.x, y: b.y, vx: -b.vx * 0.2 + (Math.random() - 0.5) * 160, vy: -b.vy * 0.2 + (Math.random() - 0.5) * 160, t: 0 });
        if (t.hp <= 0) { t.dead = 0.8; ttks.push((now - t.firstHit) / 1000); }
        hit = true; break;
      }
    }
    if (hit || b.life <= 0 || b.x > RW + 20) bullets.splice(i, 1);
  }
  for (const t of targets) { t.flash = Math.max(0, t.flash - dt); if (t.dead > 0) { t.dead -= dt; if (t.dead <= 0) { t.dead = 0; t.hp = ENEMY_HP; } } }
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.vz -= 420 * dt; c.z += c.vz * dt; c.rot += c.vr * dt; c.life -= dt;
    if (c.z < 0) { c.z = 0; c.vz *= -0.35; c.vx *= 0.6; c.vy *= 0.6; c.vr *= 0.5; }
    if (c.life <= 0) casings.splice(i, 1);
  }
  for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 0.06) flashes.splice(i, 1); }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.t > 0.25) sparks.splice(i, 1); }
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; f.y -= 40 * dt; if (f.t > 0.6) floaters.splice(i, 1); }
  while (dmgLog.length && now - dmgLog[0].t > 3000) dmgLog.shift();
}

function drawRange(now) {
  const ctx = rng; ctx.setTransform(DPR * RZ, 0, 0, DPR * RZ, 0, 0); ctx._lwBase = DPR * RZ;
  ctx.fillStyle = '#c9a86a'; ctx.fillRect(0, 0, RW, RH);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1; for (let x = 0; x < RW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, RH); ctx.stroke(); } for (let y = 0; y < RH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(RW, y); ctx.stroke(); }
  // cele
  for (const t of targets) {
    if (t.dead > 0) { ctx.fillStyle = `rgba(80,40,20,${t.dead})`; ctx.beginPath(); ctx.ellipse(t.x, t.y, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 4, 24, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.flash > 0 ? '#fff' : '#7a2a2a'; ctx.beginPath(); ctx.ellipse(t.x, t.y - 10, t.r, t.r * CAMERA_TILT_Y, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a0a0a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.ellipse(t.x, t.y - 10, t.r * 0.55, t.r * 0.55 * CAMERA_TILT_Y, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(t.x, t.y - 10, t.r * 0.2, t.r * 0.2 * CAMERA_TILT_Y, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(t.x - 26, t.y - 46, 52, 7); ctx.fillStyle = t.hp > 120 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(t.x - 25, t.y - 45, 50 * Math.max(0, t.hp) / ENEMY_HP, 5);
  }
  // luski (pod czolgiem gdy na ziemi)
  for (const c of casings) {
    ctx.save(); ctx.translate(c.x, c.y - c.z); ctx.rotate(c.rot);
    ctx.globalAlpha = Math.min(1, c.life * 3);
    ctx.fillStyle = '#d9a83a'; ctx.fillRect(-2.6, -1.1, 5.2, 2.2); ctx.fillStyle = '#fff1b0'; ctx.fillRect(-2.6, -1.1, 5.2, 0.7);
    ctx.restore();
  }
  // czolg
  tank.brawler = enigmaBrawler();
  ctx.save();
  if (S.superOn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(tank.x, tank.y - 10, 4, tank.x, tank.y - 10, 60); g.addColorStop(0, 'rgba(255,210,80,0.35)'); g.addColorStop(1, 'rgba(255,210,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tank.x, tank.y - 10, 60, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  drawTankV2(ctx, tank, tankOpts({ spin: spinAngle, isSuper: false }));
  ctx.restore();
  // blyski wylotu (ADD)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of flashes) {
    const k = 1 - f.t / 0.06, R = (f.sup ? 16 : 11) * k;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R * 1.6); g.addColorStop(0, `rgba(255,240,180,${0.9 * k})`); g.addColorStop(1, 'rgba(255,170,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,255,230,${k})`; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(f.a - 0.35) * R, f.y + Math.sin(f.a - 0.35) * R); ctx.lineTo(f.x + Math.cos(f.a) * R * 2.2, f.y + Math.sin(f.a) * R * 2.2); ctx.lineTo(f.x + Math.cos(f.a + 0.35) * R, f.y + Math.sin(f.a + 0.35) * R); ctx.closePath(); ctx.fill();
  }
  // pociski: zlota smuga + jadro; super = wieksze + aura
  for (const b of bullets) {
    const l = Math.hypot(b.vx, b.vy), tx = b.vx / l, ty = b.vy / l, L = b.sup ? 22 : 16;
    if (b.sup) { const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size * 3.2); g.addColorStop(0, 'rgba(255,200,60,0.55)'); g.addColorStop(1, 'rgba(255,160,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 3.2, 0, Math.PI * 2); ctx.fill(); }
    const tg = ctx.createLinearGradient(b.x - tx * L, b.y - ty * L, b.x, b.y); tg.addColorStop(0, 'rgba(255,190,40,0)'); tg.addColorStop(1, 'rgba(255,215,90,0.9)');
    ctx.strokeStyle = tg; ctx.lineWidth = b.size * 1.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b.x - tx * L, b.y - ty * L); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  for (const s of sparks) { ctx.fillStyle = `rgba(255,220,120,${1 - s.t / 0.25})`; ctx.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4); }
  ctx.restore();
  for (const f of floaters) { ctx.globalAlpha = 1 - f.t / 0.6; ctx.fillStyle = f.sup ? '#ffd54a' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = `bold ${f.sup ? 15 : 12}px sans-serif`; ctx.strokeText(String(f.v), f.x, f.y); ctx.fillText(String(f.v), f.x, f.y); ctx.globalAlpha = 1; }
  // celownik
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y); ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke();
}

function updateStats() {
  const dps = dmgLog.reduce((s, e) => s + e.d, 0) / 3;
  const iv = effectiveInterval();
  const perSec = 1000 / iv;
  const dmgNow = S.dmg * (S.superOn ? 1.5 : 1);
  const theoDps = perSec * dmgNow;
  const theoTtk = Math.ceil(ENEMY_HP / dmgNow) * iv / 1000;
  const avgTtk = ttks.length ? ttks.reduce((a, b) => a + b, 0) / ttks.length : 0;
  $('stats').innerHTML =
    `<b>Kadencja realna:</b> ${perSec.toFixed(1)} strz/s (co ${iv.toFixed(1)} ms po zaokragleniu do kroku logiki)<br>` +
    `<b>DPS teoretyczny:</b> ${theoDps.toFixed(0)} · <b>DPS zmierzony (3 s):</b> ${dps.toFixed(0)} · porownanie: Twardy ≈ 357, Pancerny ≈ 411, Ogniarz ≤ 638<br>` +
    `<b>TTK celu ${ENEMY_HP} HP:</b> teoretyczny ${theoTtk.toFixed(2)} s · ostatni ${ttks.length ? ttks[ttks.length - 1].toFixed(2) : '—'} s · sredni ${ttks.length ? avgTtk.toFixed(2) : '—'} s (${ttks.length} zabic) · strzalow ${shots}`;
}

// ── STATYSTYKI + ANALIZA BALANSU ──────────────────────────────────────────────
// Kopia skali paskow z garazu (src/ui/hub/sections/BattleSection.ts:55 STAT_MAX) — import UI ciagnalby hub.
const STAT_MAX = { hp: 700, dmg: 400, speed: 7.5, tempo: 5, range: 1400 };
const NAMES = { pyro: 'OGNIARZ', scout: 'ZWIAD', sniper: 'SNAJPER', twardy: 'TWARDY', heavy: 'PANCERNY', shadow: 'SHADOW', plasma: 'TECH', king: 'KING' };
const E = { hp: 450, speed: 4.5, range: 650 }; // rekomendacja startowa (patrz plan); DMG/reload = suwaki strzelnicy
const stepMs = (ms) => Math.ceil(ms / LOGIC_STEP_MS) * LOGIC_STEP_MS;
/** Metryki jednego czolgu wzgledem zwyklego wroga (300 HP). Salwa (volley) liczona jako jeden "strzal". */
function metrics(dmgPerShot, perShot, reloadMs) {
  const shotDmg = dmgPerShot * perShot;
  const shots = Math.ceil(ENEMY_HP / shotDmg);
  const iv = stepMs(reloadMs) / 1000;
  const dps = shotDmg / iv;
  return { shots, ttk: (shots - 1) * iv, cycle: shots * iv, dps, model: 0.068 * dps * (38 / 40) ** 2 + 14.6 };
}
$('eHp').oninput = e => { E.hp = +e.target.value || 0; };
$('eSpeed').oninput = e => { E.speed = +e.target.value || 0; };
$('eRange').oninput = e => { E.range = +e.target.value || 0; };
const bar = (label, val, max, shown, note = '') => {
  const pct = Math.min(100, Math.round(val / max * 100));
  return `<div class="st"><em>${label}</em><span class="bar"><b style="width:${pct}%"></b></span><u>${shown}</u>${note ? `<i>${note}</i>` : ''}</div>`;
};
function updateBalance() {
  const tempoUi = Math.round(1000 / S.reload * 10) / 10;              // tak liczy garaz (tempoOf)
  const tempoReal = Math.round(1000 / stepMs(S.reload) * 10) / 10;    // tak strzela gra (krok 16,67 ms)
  $('statPanel').innerHTML =
    bar('HP', E.hp, STAT_MAX.hp, E.hp) +
    bar('DMG', S.dmg, STAT_MAX.dmg, S.dmg, S.dmg / STAT_MAX.dmg < 0.15 ? 'krotki pasek — dziecko odczyta „slaby”' : '') +
    bar('SPEED', E.speed, STAT_MAX.speed, E.speed) +
    bar('TEMPO', tempoUi, STAT_MAX.tempo, tempoUi, tempoUi > STAT_MAX.tempo ? `pasek przyciety (max 5); realnie ${tempoReal}/s` : '') +
    bar('ZASIEG', E.range, STAT_MAX.range, E.range);
  const rows = Object.entries(BALANCE_V2_STATS).map(([id, b]) => {
    const n = b.volley ? b.volley.count : (id === 'heavy' ? 2 : 1);
    return { id, name: NAMES[id] || id, hp: b.hp, dmgTxt: n > 1 ? `${b.dmg}×${n}` : `${b.dmg}`, reload: b.reload, speed: b.speed, range: b.maxDist, extra: b.pierce ? `przebicie ${b.pierce}` : (b.dash ? 'dash' : ''), m: metrics(b.dmg, n, b.reload) };
  });
  const em = metrics(S.dmg, 1, S.reload);
  rows.push({ id: 'enigma', name: 'ENIGMA', hp: E.hp, dmgTxt: `${S.dmg}`, reload: S.reload, speed: E.speed, range: E.range, extra: `rozped 0,25 s, rozrzut ±${S.spreadDeg}°`, m: em, me: true });
  rows.sort((a, b) => a.m.cycle - b.m.cycle);
  // progi: o ile trzeba podniesc DMG, zeby zejsc o 1 strzal na 300 HP
  const nextDmg = em.shots > 1 ? Math.ceil(ENEMY_HP / (em.shots - 1)) : null;
  const wasteFrom = Math.ceil(ENEMY_HP / em.shots);
  $('balance').innerHTML =
    `<table><tr><th>czolg</th><th>HP</th><th>DMG</th><th>reload ms (realny)</th><th>SPEED</th><th>zasieg</th><th>strzalow na 300 HP</th><th>TTK 1 celu</th><th>s / zabicie</th><th>DPS</th><th>model bota</th><th>cecha</th></tr>` +
    rows.map(r => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.hp}</td><td>${r.dmgTxt}</td><td>${r.reload} (${stepMs(r.reload).toFixed(0)})</td><td>${r.speed}</td><td>${r.range}</td><td>${r.m.shots}</td><td>${r.m.ttk.toFixed(2)} s</td><td>${r.m.cycle.toFixed(2)}</td><td>${r.m.dps.toFixed(0)}</td><td>${r.m.model.toFixed(0)}</td><td>${r.extra}</td></tr>`).join('') +
    `</table><p class="tip"><b>Progi Enigmy:</b> DMG ${wasteFrom}–${nextDmg ? nextDmg - 1 : '…'} = ${em.shots} strzalow (kazdy DMG w tym przedziale dziala TAK SAMO na zwyklego wroga)` +
    (nextDmg ? ` · <b>DMG ${nextDmg}</b> = ${em.shots - 1} strzalow (s/zabicie ${metrics(nextDmg, 1, S.reload).cycle.toFixed(2)})` : '') +
    `. Super (×1,5 = ${Math.round(S.dmg * 1.5)} DMG): ${metrics(S.dmg * 1.5, 1, S.reload).shots} strzalow, s/zabicie ${metrics(S.dmg * 1.5, 1, S.reload).cycle.toFixed(2)}.` +
    ` Sortowanie: od najszybszego zabijania. TTK nie liczy rozpedu luf (+~0,25 s na pierwszy cel) ani pudel z rozrzutu.</p>`;
}

// ── petla ────────────────────────────────────────────────────────────────────
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
// dostep dla zrzutow Playwrightem
window.__enigma = { S, mouse, tank, sfx, fireBurst: (ms) => { mouse.down = true; setTimeout(() => { mouse.down = false; }, ms); } };
