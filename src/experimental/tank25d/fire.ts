/* =====================================================================================
 * fire.ts - per-brawler weapon system (regular + super), iteration 1.
 * ISOLATED: imports ONLY from render2d.ts (bullet/muzzle visuals). Zero game code.
 *
 * Each brawler has a FireProfile { regular, super } built from small primitives
 * (straight / breakup / boomerang / megashell / wave + radial/cone spawn helpers).
 * Per-brawler SUPER TINT (signature color per tank, not one global purple).
 *
 * Bullet motion behaviors are stepped in stepBullet(); FX (per-tank super aura, per-bullet
 * super glow, expanding waves) are drawn in drawBulletWithFx()/drawTankSuperAura().
 * Lab is FEEL-only: no targets, so breakup/shockwave trigger on DISTANCE, not on hit.
 * ===================================================================================== */

import { drawBullet, getMuzzlePos } from './render2d';

export const SUPER_DURATION = 5000; // ms - super window (mirrors game's ~5s active super)
export const SUPER_COOLDOWN = 1500; // ms - short cooldown after super ends (lab only)

// Signature super color per brawler (per-brawler tint instead of uniform purple)
const SUPER_TINTS: Record<string, string> = {
  twardy: '#5BE12C', // vivid green
  heavy: '#C026D3',  // magenta
  scout: '#FFE94D',  // electric yellow
  sniper: '#22D3FF', // electric blue
  plasma: '#00E5FF', // cyan
  pyro: '#FF6A1A',   // fire orange
  shadow: '#C0C6D4', // silver-grey (metallic super shurikens)
  king: '#FF5A2C',   // red-orange
};
export function getSuperTint(id: string): string {
  return SUPER_TINTS[id] || '#d946ef';
}

// Super fire interval per brawler (faster = stream, slower = heavy hits)
const SUPER_RELOAD: Record<string, number> = {
  twardy: 180, heavy: 480, scout: 90, sniper: 240, plasma: 260, pyro: 90, shadow: 220, king: 340,
};
export function getReload(brawler: any, superActive: boolean): number {
  return superActive ? (SUPER_RELOAD[brawler.id] || 220) : (brawler.reload || 400);
}

// ──────────────────────────────────────────────────────────────────────────────
// Spawn helper
// ──────────────────────────────────────────────────────────────────────────────
function add(B: any[], fc: any, o: any): void {
  const ang = o.ang !== undefined ? o.ang : fc.angle;
  // atTank: muzzle in the bullet's own direction (radial bursts emanate from tank);
  // otherwise muzzle of the aimed barrel (optionally with multi-barrel offset mi).
  const m = o.atTank ? getMuzzlePos(fc.tank, ang, 0) : getMuzzlePos(fc.tank, fc.angle, o.mi || 0);
  B.push({
    type: o.type,
    behavior: o.behavior || 'straight',
    x: o.x !== undefined ? o.x : m.x,
    y: o.y !== undefined ? o.y : m.y,
    vx: Math.cos(ang) * (o.speed || 0),
    vy: Math.sin(ang) * (o.speed || 0),
    size: o.size,
    phaseOffset: Math.random() * Math.PI * 2,
    isSuper: !!o.isSuper,
    superTint: o.isSuper ? fc.superTint : null,
    dist: 0,
    maxDist: o.maxDist !== undefined ? o.maxDist : 1500,
    life: o.life !== undefined ? o.life : 1,
    maxLife: o.life !== undefined ? o.life : 1,
    // breakup
    breakupDist: o.breakupDist,
    fragType: o.fragType,
    fragCount: o.fragCount,
    fragSpread: o.fragSpread,
    // boomerang
    phase: o.behavior === 'boomerang' ? 'out' : undefined,
    maxOutDist: o.maxOutDist,
    // wave
    waveDraw: o.waveDraw,
    waveColor: o.waveColor,
    waveMaxR: o.waveMaxR,
    auraScale: o.auraScale,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-brawler profiles (regular | super). Each gets a DISTINCT mechanic, not just a recolor.
// ──────────────────────────────────────────────────────────────────────────────
const PROFILES: Record<string, any> = {
  // TWARDY - breakup shotgun. Super "Triple Burst": 3 tracers, each breaks into frags.
  twardy: {
    regular: (fc: any, B: any[]) =>
      add(B, fc, { type: 'tracer', behavior: 'breakup', speed: 420, size: 6, maxDist: 600, breakupDist: 260, fragType: 'tracer_frag', fragCount: 5, fragSpread: 0.30 }),
    super: (fc: any, B: any[]) => {
      for (const s of [-0.14, 0, 0.14]) {
        add(B, fc, { type: 'tracer', behavior: 'breakup', ang: fc.angle + s, speed: 440, size: 6, maxDist: 520, breakupDist: 200, fragType: 'tracer_frag', fragCount: 5, fragSpread: 0.26, isSuper: true });
      }
    },
  },
  // PANCERNY - 2 heavy shells. Super "Mega Shell": one big slow shell + shockwave at range end.
  heavy: {
    regular: (fc: any, B: any[]) => {
      add(B, fc, { type: 'shell', mi: 0, ang: fc.angle - 0.04, speed: 340, size: 6, maxDist: 700 });
      add(B, fc, { type: 'shell', mi: 1, ang: fc.angle + 0.04, speed: 340, size: 6, maxDist: 700 });
    },
    super: (fc: any, B: any[]) => {
      // twin-barrel, slight spread, faster, bigger REGULAR shell look (not a "bean")
      add(B, fc, { type: 'shell', mi: 0, ang: fc.angle - 0.05, speed: 460, size: 9, maxDist: 780, isSuper: true });
      add(B, fc, { type: 'shell', mi: 1, ang: fc.angle + 0.05, speed: 460, size: 9, maxDist: 780, isSuper: true });
    },
  },
  // ZWIAD - returning boomerang. Super "Machine Gun": rapid stream of boomerangs.
  scout: {
    regular: (fc: any, B: any[]) =>
      add(B, fc, { type: 'quick', behavior: 'boomerang', speed: 560, size: 10, maxOutDist: 240 }),
    super: (fc: any, B: any[]) => {
      // machine gun: two returning boomerangs per shot, rapid fire -> dense swarm
      for (const s of [-0.12, 0.12]) add(B, fc, { type: 'quick', behavior: 'boomerang', ang: fc.angle + s, speed: 620, size: 10, maxOutDist: 220, isSuper: true });
    },
  },
  // SNAJPER - single slow laser. Super "Piercing Laser": fast, very long range.
  sniper: {
    regular: (fc: any, B: any[]) =>
      add(B, fc, { type: 'laser', speed: 700, size: 28, maxDist: 1500 }),
    super: (fc: any, B: any[]) =>
      add(B, fc, { type: 'super_laser', speed: 1150, size: 30, maxDist: 2200, isSuper: true, auraScale: 0.75 }),
  },
  // TECH - plasma + electric. Super "Plasma Wave": plasma ball + expanding zone-control ring.
  plasma: {
    regular: (fc: any, B: any[]) =>
      add(B, fc, { type: 'plasma', speed: 380, size: 6, maxDist: 900 }),
    super: (fc: any, B: any[]) => {
      add(B, fc, { type: 'plasma', speed: 420, size: 8, maxDist: 900, isSuper: true });
      add(B, fc, { type: 'super_plasma_wave', behavior: 'wave', waveDraw: 'plasma', x: fc.tank.x, y: fc.tank.y, life: 1, isSuper: true });
    },
  },
  // OGNIARZ - short 3-flame cone. Super "Flame Cone": wide 5-flame cone, short rapid burst.
  pyro: {
    regular: (fc: any, B: any[]) => {
      for (const s of [-0.2, 0, 0.2]) add(B, fc, { type: 'flame', ang: fc.angle + s, speed: 340, size: 5, maxDist: 340 });
    },
    super: (fc: any, B: any[]) => {
      for (const s of [-0.42, -0.21, 0, 0.21, 0.42]) add(B, fc, { type: 'super_flame', ang: fc.angle + s, speed: 370, size: 6, maxDist: 380, isSuper: true });
    },
  },
  // SHADOW - fast shadow-bullet. Super "Teleport Shots": blink to cursor + 8-way volley.
  shadow: {
    regular: (fc: any, B: any[]) =>
      add(B, fc, { type: 'shadow_bullet', speed: 480, size: 4, maxDist: 900 }),
    super: (fc: any, B: any[]) => {
      // spread of shurikens forward (references the regular shot) + grey-ish tint. NO teleport.
      for (const s of [-0.34, -0.17, 0, 0.17, 0.34]) add(B, fc, { type: 'shadow_bullet', ang: fc.angle + s, speed: 560, size: 4.5, maxDist: 820, isSuper: true });
    },
  },
  // KING - gold + orbiting arcs. Super "Royal Cross": 8-way radial gold burst (slowly rotating).
  king: {
    regular: (fc: any, B: any[]) =>
      add(B, fc, { type: 'gold', speed: 400, size: 7.5, maxDist: 900 }),
    super: (fc: any, B: any[]) =>
      // central forward shot, like the regular gold but bigger + red-orange tint
      add(B, fc, { type: 'gold', speed: 430, size: 12, maxDist: 950, isSuper: true }),
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Public: fire one volley (regular or super) + recoil + muzzle flash
// ──────────────────────────────────────────────────────────────────────────────
export function fireWeapon(tank: any, angle: number, now: number, bullets: any[], flashes: any[], superActive: boolean, pointer: any): void {
  const id = tank.brawler.id;
  const fc = { tank, angle, now, pointer, superTint: getSuperTint(id) };
  const prof = PROFILES[id] || PROFILES.twardy;
  if (superActive) prof.super(fc, bullets);
  else prof.regular(fc, bullets);

  tank.recoil = 1;
  const m = getMuzzlePos(tank, angle, 0);
  flashes.push({ x: m.x, y: m.y, life: 0.13, max: 0.13, color: superActive ? getSuperTint(id) : tank.brawler.color, big: superActive });
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: step one bullet. Returns false when it should be removed.
// ──────────────────────────────────────────────────────────────────────────────
export function stepBullet(b: any, tank: any, dt: number, bullets: any[], w: number, h: number): boolean {
  // Expanding wave (stationary): life drains over ~0.6s
  if (b.behavior === 'wave') {
    b.life -= dt / 0.6;
    return b.life > 0;
  }

  // Boomerang: fly out to maxOutDist, then steer back to the (moving) tank
  if (b.behavior === 'boomerang') {
    if (b.phase === 'out') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.dist += Math.hypot(b.vx, b.vy) * dt;
      if (b.dist >= (b.maxOutDist || 220)) { b.phase = 'back'; b.life = 0; }
    } else {
      const dx = tank.x - b.x, dy = tank.y - b.y, d = Math.hypot(dx, dy) || 1;
      if (d < 34) return false; // caught
      // FIXED return speed - NOT current speed magnitude, which collapses through 0 on the
      // direction reversal and freezes the boomerang mid-air. This guarantees a clean return.
      const rs = b.returnSpeed || 600;
      b.vx += (dx / d * rs - b.vx) * 0.2;
      b.vy += (dy / d * rs - b.vy) * 0.2;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life = (b.life || 0) + dt;
      if (b.life > 2.5) return false; // safety: never orbit forever
    }
    return true;
  }

  // Straight / breakup / megashell
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.dist += Math.hypot(b.vx, b.vy) * dt;

  if (b.behavior === 'breakup' && b.dist >= b.breakupDist) {
    spawnFrags(b, bullets);
    return false;
  }
  if (b.behavior === 'megashell' && b.dist >= b.maxDist) {
    // shockwave at range end (tinted ring in the brawler's super color)
    bullets.push({ behavior: 'wave', waveDraw: 'tint', waveColor: b.superTint || '#ffffff', waveMaxR: 175, x: b.x, y: b.y, life: 1, maxLife: 1, type: '_wave', size: 0 });
    return false;
  }
  if (b.dist > b.maxDist) return false;
  if (b.x < -90 || b.x > w + 90 || b.y < -90 || b.y > h + 90) return false;
  return true;
}

function spawnFrags(b: any, bullets: any[]): void {
  const base = Math.atan2(b.vy, b.vx);
  const n = b.fragCount || 5;
  const spd = Math.hypot(b.vx, b.vy) * 0.85;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * (b.fragSpread || 0.16);
    bullets.push({
      type: b.fragType || 'tracer_frag', behavior: 'straight',
      x: b.x, y: b.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      size: (b.size || 6) * 0.8, phaseOffset: Math.random() * Math.PI * 2,
      isSuper: b.isSuper, superTint: b.superTint,
      dist: 0, maxDist: 300, life: 1, maxLife: 1,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// FX rendering
// ──────────────────────────────────────────────────────────────────────────────
function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bl = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${bl},${a})`;
}

function drawAura(ctx: any, b: any): void {
  const r = (b.size || 6) * 3.2 * (b.auraScale || 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
  g.addColorStop(0, rgba(b.superTint, 0.55));
  g.addColorStop(0.5, rgba(b.superTint, 0.22));
  g.addColorStop(1, rgba(b.superTint, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTintRing(ctx: any, b: any): void {
  const t01 = 1 - b.life / b.maxLife;
  const r = t01 * (b.waveMaxR || 160);
  const a = 1 - t01;
  ctx.save();
  ctx.strokeStyle = rgba(b.waveColor, a);
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(b.x, b.y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = rgba(b.waveColor, a * 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(b.x, b.y, r * 0.8, r * 0.56, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// One entry point the lab calls per bullet (handles waves + super glow + the bullet itself)
export function drawBulletWithFx(ctx: any, b: any): void {
  if (b.behavior === 'wave') {
    if (b.waveDraw === 'plasma') drawBullet(ctx, b); // super_plasma_wave expands via b.life
    else drawTintRing(ctx, b);
    return;
  }
  if (b.superTint) drawAura(ctx, b);
  drawBullet(ctx, b);
}

// Pulsing aura ring under the tank while super is active (in the brawler's super color)
export function drawTankSuperAura(ctx: any, tank: any, now: number): void {
  const tint = getSuperTint(tank.brawler.id);
  const pulse = 0.5 + Math.sin(now * 0.008) * 0.5;
  const r = 48 + pulse * 9;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(tank.x, tank.y, 12, tank.x, tank.y, r);
  g.addColorStop(0, rgba(tint, 0));
  g.addColorStop(0.7, rgba(tint, 0.10 + pulse * 0.10));
  g.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(tank.x, tank.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}