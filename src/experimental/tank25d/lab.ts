/* =====================================================================================
 * lab.ts - 2.5D tank lab host (Phase 0 / Layer 1).
 * Renders ONE selectable tank (of the 8 showcase designs) on a raw Canvas 2D, with movement,
 * 360 aim, per-brawler fire system (regular + super), bullets and a super tint per tank.
 * ZERO game-code imports. Delete the lab = remove this file + render2d.ts + fire.ts + lab.html
 * + the rollupOptions block in vite.config.ts.
 *
 * Render (drawTank/drawBullet) is a verified 1:1 port from the showcase. The weapon system
 * lives in fire.ts. This host is just: input + loop + super-window state + HUD.
 * No Pixi (see reasoning in chat). Live redraw -> pixel-exact, simplest for design iteration.
 * ===================================================================================== */

import { drawTank, CAMERA_TILT_Y, BRAWLERS } from './render2d';
import {
  fireWeapon,
  getReload,
  stepBullet,
  drawBulletWithFx,
  drawTankSuperAura,
  getSuperTint,
  SUPER_DURATION,
  SUPER_COOLDOWN,
} from './fire';

// ──────────────────────────────────────────────────────────────────────────────
// Canvas / DPR
// ──────────────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let VW = window.innerWidth;
let VH = window.innerHeight;
let DPR = 1;

function resize(): void {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth;
  VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  // Device-res render (crisp on retina) + constant CSS-px stroke width (matches verified PNG).
  (ctx as any)._lwBase = DPR;
}
window.addEventListener('resize', resize);
resize();

// ──────────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────────
const tank: any = {
  brawler: BRAWLERS[0],
  x: VW / 2,
  y: VH / 2,
  hullAngle: 0,
  turretAngle: 0,
  vx: 0,
  vy: 0,
  recoil: 0,
  pitch: 0,
  treadShift: 0,
  hitFlashTimer: 0,
  isIdle: true,
  kickX: 0,
  kickY: 0,
};

const bullets: any[] = [];
const flashes: any[] = [];
const keys: Record<string, boolean> = {};
const pointer = { x: VW / 2, y: VH / 2, down: false };
let lastFireT = 0;

// Super window
let superActive = false;
let superEndT = 0;
let superCdEndT = 0;

// Taunt (lowrider bounce) state
let idleTime = 0;
let bounceTimer = 0;
const BOUNCE_DUR = 0.55;   // s - bounce animation length
const TAUNT_IDLE = 4.0;    // s of stillness before a taunt bounce (re-arms while idle)

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function activateSuper(now: number): void {
  if (superActive || now < superCdEndT) return;
  superActive = true;
  superEndT = now + SUPER_DURATION;
}

// ──────────────────────────────────────────────────────────────────────────────
// Input
// ──────────────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k >= '1' && k <= '8') selectBrawler(parseInt(k, 10) - 1);
  if (k === ' ') { e.preventDefault(); activateSuper(performance.now()); }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

function readPointer(e: PointerEvent): void {
  const r = canvas.getBoundingClientRect();
  pointer.x = e.clientX - r.left;
  pointer.y = e.clientY - r.top;
}
canvas.addEventListener('pointermove', readPointer);
canvas.addEventListener('pointerdown', (e) => {
  readPointer(e);
  pointer.down = true;
});
window.addEventListener('pointerup', () => {
  pointer.down = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ──────────────────────────────────────────────────────────────────────────────
// Brawler selector (which one becomes the 9th brawler)
// ──────────────────────────────────────────────────────────────────────────────
function selectBrawler(i: number): void {
  if (i < 0 || i >= BRAWLERS.length) return;
  tank.brawler = BRAWLERS[i];
  bullets.length = 0;
  flashes.length = 0;
  superActive = false;
  superCdEndT = 0;
  const btns = document.querySelectorAll('.lab-sel-btn');
  btns.forEach((b, idx) => b.classList.toggle('on', idx === i));
}

function buildSelector(): void {
  const bar = document.getElementById('lab-selector');
  if (!bar) return;
  BRAWLERS.forEach((b: any, i: number) => {
    const btn = document.createElement('button');
    btn.className = 'lab-sel-btn' + (i === 0 ? ' on' : '');
    btn.textContent = (i + 1) + ' ' + b.name;
    btn.style.borderColor = b.color;
    btn.addEventListener('click', () => selectBrawler(i));
    bar.appendChild(btn);
  });
}
buildSelector();

// ──────────────────────────────────────────────────────────────────────────────
// Update
// ──────────────────────────────────────────────────────────────────────────────
function update(dt: number, now: number): void {
  // Super window expiry
  if (superActive && now >= superEndT) {
    superActive = false;
    superCdEndT = now + SUPER_COOLDOWN;
  }

  // Hull movement (WASD / arrows)
  const ACC = 1500;
  const FRICT = 0.86;
  const MAXV = 330;
  let ax = 0;
  let ay = 0;
  if (keys['w'] || keys['arrowup']) ay -= 1;
  if (keys['s'] || keys['arrowdown']) ay += 1;
  if (keys['a'] || keys['arrowleft']) ax -= 1;
  if (keys['d'] || keys['arrowright']) ax += 1;
  const al = Math.hypot(ax, ay);
  if (al > 0) {
    ax /= al;
    ay /= al;
    tank.vx += ax * ACC * dt;
    tank.vy += ay * ACC * dt;
  }
  tank.vx *= FRICT;
  tank.vy *= FRICT;
  const sp = Math.hypot(tank.vx, tank.vy);
  if (sp > MAXV) {
    tank.vx = (tank.vx / sp) * MAXV;
    tank.vy = (tank.vy / sp) * MAXV;
  }
  tank.x += tank.vx * dt;
  tank.y += tank.vy * dt;

  // Keep in view
  const M = 70;
  tank.x = Math.max(M, Math.min(VW - M, tank.x));
  tank.y = Math.max(M, Math.min(VH - M, tank.y));

  tank.isIdle = sp < 14;
  if (sp >= 14) {
    tank.treadShift += sp * dt * 0.5;
    const moveAng = Math.atan2(tank.vy, tank.vx);
    tank.hullAngle = lerpAngle(tank.hullAngle, moveAng, 0.18);
  }

  // Chassis kick decay (recoil offset settles back over a few frames)
  tank.kickX *= 0.7;
  tank.kickY *= 0.7;

  // Taunt: after standing still (no movement input, not firing) for TAUNT_IDLE seconds, play a
  // quick "lowrider bounce" (front pops up, damped). Re-arms so it loops while idle.
  const idleNow = al === 0 && !pointer.down && sp < 14;
  idleTime = idleNow ? idleTime + dt : 0;
  if (idleNow && bounceTimer <= 0 && idleTime >= TAUNT_IDLE) { bounceTimer = BOUNCE_DUR; idleTime = 0; }

  if (bounceTimer > 0) {
    // Scripted bounce overrides the spring: big front pop + damped counter-bounce.
    bounceTimer -= dt;
    const p = 1 - bounceTimer / BOUNCE_DUR;              // 0 -> 1
    tank.pitch = 2.6 * Math.sin(p * Math.PI * 2.2) * Math.pow(1 - p, 0.5);
  } else {
    // Suspension pitch (squat/dive) - spring model 1:1 with showcase.
    // Driven by velocity error (target - current) projected onto hull heading.
    const tvx = ax * MAXV;
    const tvy = ay * MAXV;
    const errVx = tvx - tank.vx;
    const errVy = tvy - tank.vy;
    const hX = Math.cos(tank.hullAngle);
    const hY = Math.sin(tank.hullAngle);
    const longAccel = errVx * hX + (errVy / CAMERA_TILT_Y) * hY;
    tank.pitch += longAccel * 0.002;
    tank.pitch = Math.max(-0.4, Math.min(0.4, tank.pitch));
    tank.pitch += (0 - tank.pitch) * 9.0 * dt;
  }

  // Aim turret at pointer (mouse / touch)
  tank.turretAngle = Math.atan2(pointer.y - tank.y, pointer.x - tank.x);

  // Recoil decay
  tank.recoil *= 0.82;

  // Fire while pointer held (per-brawler reload + pattern via fire.ts)
  if (pointer.down && now - lastFireT >= getReload(tank.brawler, superActive)) {
    fireWeapon(tank, tank.turretAngle, now, bullets, flashes, superActive, pointer);
    lastFireT = now;
    // Chassis kick: whole tank jolts opposite the shot + front rears up (recoil through suspension)
    tank.kickX = -Math.cos(tank.turretAngle) * 2.4;
    tank.kickY = -Math.sin(tank.turretAngle) * 2.4;
    tank.pitch = Math.min(0.4, tank.pitch + 0.2);
  }

  // Bullets (behaviors stepped in fire.ts)
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (!stepBullet(bullets[i], tank, dt, bullets, VW, VH)) bullets.splice(i, 1);
  }

  // Muzzle flashes
  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].life -= dt;
    if (flashes[i].life <= 0) flashes.splice(i, 1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────────────────────
function drawGrid(): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const step = 64;
  ctx.beginPath();
  for (let gx = 0; gx <= VW; gx += step) { ctx.moveTo(gx, 0); ctx.lineTo(gx, VH); }
  for (let gy = 0; gy <= VH; gy += step) { ctx.moveTo(0, gy); ctx.lineTo(VW, gy); }
  ctx.stroke();
}

// Muzzle flash: soft colored halo + small, sharp, irregular starburst with a MUTED
// hot-amber -> burnt-orange color mix (realistic, not a flat cartoon star).
function star8(cx: number, cy: number, rOut: number, rIn: number): void {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
    // outer points get slight per-spike length variation (uneven = less "perfect"/cartoon)
    const jit = (i % 2 === 0) ? (0.78 + 0.22 * Math.abs(Math.sin(i * 2.4))) : 1;
    const r = (i % 2 === 0) ? rOut * jit : rIn;
    const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawFlash(f: any): void {
  const a = f.life / f.max;                       // 1 -> 0 over the flash lifetime

  // 1) Soft colored halo (additive bloom, kept subtle so it doesn't wash out)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * 0.5;
  const haloR = (f.big ? 14 : 9) + (1 - a) * (f.big ? 9 : 5);
  const halo = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, haloR);
  halo.addColorStop(0, '#ffe2b0');
  halo.addColorStop(0.5, f.color);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(f.x, f.y, haloR, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 2) Sharp irregular starburst - normal blend keeps the muted amber/orange muted.
  //    Smaller (~35% down), thinner spikes (rIn 0.34, not fat 0.5), gradient color mix,
  //    NO bright yellow outline (that was the cartoon look).
  const burstScale = 0.55 + a * 1.0;              // ~1.55x at fire -> shrinks -> gone
  const rOut = (f.big ? 14 : 10) * burstScale;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a * 1.4);
  const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rOut);
  grad.addColorStop(0.0, '#ffeccd');              // hot white-amber core (not pure white)
  grad.addColorStop(0.35, '#e3a94f');             // amber
  grad.addColorStop(0.7, '#bf6d36');              // muted burnt orange
  grad.addColorStop(1.0, 'rgba(140,64,36,0)');    // fade out
  star8(f.x, f.y, rOut, rOut * 0.34);
  ctx.fillStyle = grad;
  ctx.fill();
  // tiny hot core (hottest point)
  ctx.fillStyle = '#fff4e0';
  ctx.beginPath(); ctx.arc(f.x, f.y, rOut * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSuperHud(now: number): void {
  if (!superActive) return;
  const frac = Math.max(0, (superEndT - now) / SUPER_DURATION);
  const tint = getSuperTint(tank.brawler.id);
  const w = 240, h = 12;
  const x = (VW - w) / 2, y = 54;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w * frac, h);
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('SUPER', VW / 2, y - 6);
  ctx.restore();
}

function render(now: number): void {
  ctx.save();
  ctx.scale(DPR, DPR);

  // Background + grid (motion reference)
  ctx.fillStyle = '#2a3640';
  ctx.fillRect(0, 0, VW, VH);
  drawGrid();

  // Chassis kick: jolt the whole tank (aura + body + muzzle flash) by the recoil offset;
  // bullets stay in world space. Flash drawn INSIDE the translate so it sticks to the
  // kicked + recoiled barrel tip (fixes the flash sitting ~2.4px ahead of the muzzle).
  ctx.save();
  ctx.translate(tank.kickX, tank.kickY);
  if (superActive) drawTankSuperAura(ctx, tank, now);
  drawTank(ctx, tank, false);
  for (const f of flashes) drawFlash(f);
  ctx.restore();
  for (const b of bullets) drawBulletWithFx(ctx, b);

  ctx.restore();

  // HUD in CSS px (after restore so DPR scale handled once)
  ctx.save();
  ctx.scale(DPR, DPR);
  drawSuperHud(now);
  ctx.restore();
}

// ──────────────────────────────────────────────────────────────────────────────
// Loop
// ──────────────────────────────────────────────────────────────────────────────
let prev = performance.now();
function loop(): void {
  const now = performance.now();
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  update(dt, now);
  render(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);