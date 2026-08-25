import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * MarsMap.ts — map definitions for MARS ("Rdzawy Swit" / Rusty Dawn).
 *
 * FAZA MARS M2 (first map built via Map Factory — docs/map-kit/MARS_CONTRACT.md):
 * - Palette: rusty-PINK regolith (NOT red — red is reserved for future Volcano map),
 *   human base = white + cyan DETAILS ONLY (cyan field zones are reserved for
 *   freeze/stealth language, lesson F1), alien accents = green-violet (interactive only).
 * - buildMarsTexture: baked ONCE (3000x3000), seeded mulberry32 (kit rule U1) —
 *   craters + rover tracks + debris live IN THE BAKE (zero runtime cost, wzorzec Ruins).
 * - Layout exports FROZEN from tools/mars_m1_layout.mjs (AABB math-verify PASS,
 *   0 errors). Do NOT hand-edit coordinates — change the script, re-run, re-paste.
 *   Convention: x/y = TOP-LEFT everywhere in this file (ICollidable rule).
 *
 * Design intent:
 * - Sun upper-left (NW) like all maps; shadows SE, violet-tinted (alien sky mood).
 * - Craters are PASSABLE decor: kept low-contrast so they never read as holes
 *   (false-affordance guard — crevasses are the real hazards and look distinct).
 */

// =================================================================
// PALETTE "RDZAWY SWIT" — single source of truth (border/props import this)
// =================================================================

export const MARS_PALETTE = Object.freeze({
    albedo:      '#c97b62', // regolith base (rusty pink)
    midtint:     '#b0604a', // tonal variation
    duneLight:   '#e0997f', // sunlit dune tops
    depth:       '#5c2f33', // deep shadow / crater floor (violet-brown, NOT black)
    shadow:      '#8a4a5a', // surface shadow tint (violet — alien sky bounce)
    craterRim:   '#e8ab8e', // sunlit NW crater lip
    trackDark:   '#93503f', // rover track groove
    baseWhite:   '#eef2f5', // human base hull (detail objects in bake)
    baseCyan:    '#37d0e6', // base tech accents — DETAILS ONLY (lesson F1)
    alienGreen:  '#39d98a', // alien bioluminescence — interactive props only
    alienViolet: '#8b5cf6', // alien secondary — interactive props only
});

/**
 * Numeric mirror of MARS_PALETTE for PIXI props (PIXI wants 0xRRGGBB, the bake
 * wants CSS strings). Same colours, one source of truth for the map's look —
 * every mars/* prop imports from here instead of re-declaring its own tones.
 */
export const MARS_HEX = Object.freeze({
    albedo:      0xc97b62,
    midtint:     0xb0604a,
    duneLight:   0xe0997f,
    depth:       0x5c2f33,
    shadow:      0x8a4a5a,
    craterRim:   0xe8ab8e,
    trackDark:   0x93503f,
    baseWhite:   0xeef2f5,
    baseShade:   0xc2ced8, // dome self-shadow (SE face) — derived, bake has no use for it
    baseSteel:   0x7d8894, // hull/struts grey (matches baked debris plates)
    baseCyan:    0x37d0e6,
    alienGreen:  0x39d98a,
    alienViolet: 0x8b5cf6,
});

/**
 * Palette handed to the reused `Rock` class (desert/Rock.ts) so Mars gets
 * basalt-and-iron-oxide stones instead of sandstone. `mossGreen` has no
 * meaning on a dead world, so it is mapped to a rock tone — the moss dots
 * become darker mineral flecks instead of vegetation.
 */
export const MARS_ROCK_PALETTE = Object.freeze({
    rockBase:   0x8f4c40,
    rockLight:  0xc2775f,
    rockShadow: 0x5e2f2e,
    rockDeep:   0x3d1e20,
    crackDark:  0x2a1418,
    mossGreen:  0x6d3a3a, // NOT moss: mineral fleck (dead world — no vegetation)
    sandyEdge:  0xc97b62,
});

/** Global light direction — sun upper-left, shadows offset SE (same as all maps). */
export const MARS_LIGHT = Object.freeze({
    shX: 4,
    shY: 4,
    highlightAlpha: 0.20,
    shadowAlpha: 0.32,
});

// =================================================================
// Deterministic RNG (mulberry32) — stable bake across map re-entry (U1)
// =================================================================
function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// =================================================================
// buildMarsTexture — baked once, cached in PIXI.Texture
// =================================================================

/**
 * Static Mars ground texture (3000x3000). Layers: regolith base -> sun gradient ->
 * craters (2.5D lips) -> rover tracks -> debris field -> micro-grain -> edge vignette.
 * Performance: one-time bake, per-frame cost = 0. Static-baked — no Vite HMR refresh,
 * re-enter the map to see changes.
 */
export function buildMarsTexture(): PIXI.Texture {
    const t0 = performance.now();
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x004d5253); // "MRS"

    // ── 1. Regolith base albedo ──
    c.fillStyle = MARS_PALETTE.albedo;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 2. Wide tonal patches (wind-worked regolith) ──
    for (let i = 0; i < 110; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 130 + rng() * 340;
        c.save();
        c.globalAlpha = 0.04 + rng() * 0.05;
        c.fillStyle = rng() < 0.5 ? MARS_PALETTE.midtint : MARS_PALETTE.duneLight;
        c.beginPath();
        c.ellipse(x, y, r, r * (0.45 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 3. Sun lighting gradient: NW warm dawn -> SE violet shadow ──
    const sun = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    sun.addColorStop(0.00, 'rgba(255,214,170,0.28)'); // NW: warm dawn light
    sun.addColorStop(0.50, 'rgba(255,214,170,0.02)');
    sun.addColorStop(1.00, 'rgba(92,47,80,0.30)');    // SE: violet dusk shadow
    c.fillStyle = sun;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 4. Wind ripples (aeolian micro-dunes — breaks up flat ground) ──
    drawWindRipples(c, rng);

    // ── 5. Impact craters (passable DECOR — low contrast, no hole affordance) ──
    drawCraters(c, rng);

    // ── 6-8. REGOLITH TEXTURE (playtest feedback: ground was too smooth).
    // Three scales, coarse-to-fine reading order: gravel grain everywhere ->
    // rubble patches -> individual 2.5D stones. All baked = zero runtime cost. ──
    drawGravelGrain(c, rng);
    drawRubblePatches(c, rng);
    drawScatteredStones(c, rng);

    // ── 9. Rover tracks (lore: someone drove here) — ON TOP of gravel: wheels
    // pressed the grit down, so grooves must cut through the texture. ──
    drawRoverTracks(c, rng);

    // ── 10. Debris field near the base (fallen panels, struts — baked decor) ──
    drawBaseDebris(c, rng);

    // ── 11. Edge vignette (depth tone from palette, echoes the border haze) ──
    const V = 420;
    const vign = (x0: number, y0: number, x1: number, y1: number) => {
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(92,47,51,0.20)');
        g.addColorStop(1, 'rgba(92,47,51,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, WORLD_W, WORLD_H);
    };
    vign(0, 0, V, 0); vign(WORLD_W, 0, WORLD_W - V, 0);
    vign(0, 0, 0, V); vign(0, WORLD_H, 0, WORLD_H - V);

    // One-time cost, logged so a regolith-density tuning pass can see the budget
    // (reference: Arctic bake ~26-32 ms).
    console.log(`[MarsMap] ground bake: ${(performance.now() - t0).toFixed(1)} ms`);
    return PIXI.Texture.from(cv);
}

// -----------------------------------------------------------------
// REGOLITH TEXTURE (v0.120.0 — playtest: "teren jak na Marsa jest zbyt gladki")
// Three scales so the ground reads as grit at every zoom: grain (always there),
// rubble patches (mid-scale clumping — nature clusters, it does not scatter
// evenly), individual stones (2.5D pop). Baked once => runtime cost zero, so we
// can afford the count. Contrast stays LOW: this is ground, not an interactive
// prop — no glint, no sparkle (false-affordance guard, design-values).
// -----------------------------------------------------------------

/** Colour buckets shared by grain/rubble — grouped to avoid per-item state churn. */
const GRIT_TONES = [
    MARS_PALETTE.duneLight,
    MARS_PALETTE.craterRim,
    MARS_PALETTE.midtint,
    MARS_PALETTE.trackDark,
    MARS_PALETTE.depth,
];

/**
 * Tileable grain patch — the trick that makes UNIFORM dense grit affordable.
 * Drawing ~200k specks straight onto 3000x3000 would blow the bake budget;
 * instead we speckle one small tile and let createPattern repeat it, which is
 * a single fill on the big canvas. Specks that cross the tile edge are drawn
 * again on the opposite side, so the tile wraps seamlessly.
 */
function makeGrainTile(
    size: number, specks: number, tones: string[], alphaMin: number, alphaMax: number,
    sizeMin: number, sizeMax: number, rng: () => number,
): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const g = cv.getContext('2d')!;

    for (let i = 0; i < specks; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const w = sizeMin + rng() * (sizeMax - sizeMin);
        const h = w * (0.6 + rng() * 0.7);
        g.globalAlpha = alphaMin + rng() * (alphaMax - alphaMin);
        g.fillStyle = tones[(rng() * tones.length) | 0];
        // Wrap-around copies keep the tile seamless. NOTE: the offset lists must
        // be BUILT conditionally — the old `[0, cond ? -size : 0]` form drew the
        // speck 4x in the SAME spot when it did not cross an edge (alpha piling
        // 0.10 -> 0.34), while edge specks drew only 2x. Result: the tile interior
        // was darker than its seams, i.e. exactly the visible grid this trick is
        // supposed to prevent (A7).
        const oxs = x + w > size ? [0, -size] : [0];
        const oys = y + h > size ? [0, -size] : [0];
        for (const ox of oxs) {
            for (const oy of oys) {
                g.fillRect(x + ox, y + oy, w, h);
            }
        }
    }
    return cv;
}

/**
 * Dense gravel grain over the WHOLE map, via two offset noise tiles.
 * Two different tile sizes (coprime-ish) layered at an offset kill any visible
 * repetition, and the whole thing costs 2 pattern fills instead of ~200k draws.
 * A sparser hand-scattered pass on top adds the larger, individually visible grit.
 */
function drawGravelGrain(c: CanvasRenderingContext2D, rng: () => number): void {
    // Layer 1 — fine dust speckle (the "sandpaper" base that removes flatness)
    const fine = makeGrainTile(512, 5200, [GRIT_TONES[0], GRIT_TONES[2], GRIT_TONES[3]],
        0.05, 0.14, 0.8, 1.9, rng);
    // Layer 2 — coarser grit, different tile size so the two never line up
    const coarse = makeGrainTile(384, 1500, [GRIT_TONES[1], GRIT_TONES[3], GRIT_TONES[4]],
        0.08, 0.20, 1.6, 3.4, rng);

    c.save();
    const p1 = c.createPattern(fine, 'repeat')!;
    c.fillStyle = p1;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // offset the second layer so tile seams of the two patterns never coincide
    c.translate(137, 89);
    const p2 = c.createPattern(coarse, 'repeat')!;
    c.fillStyle = p2;
    c.fillRect(-137, -89, WORLD_W, WORLD_H);
    c.restore();

    // Sparse hand-scattered grit: bigger pieces with a hint of SE shading, so the
    // eye finds individual stones on top of the uniform noise floor.
    c.save();
    for (let i = 0; i < 5200; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const s = 2.0 + rng() * 3.0;
        c.globalAlpha = 0.10 + rng() * 0.10;
        c.fillStyle = MARS_PALETTE.depth;
        c.fillRect(x + 0.9, y + 0.9, s, s * 0.8);
        c.globalAlpha = 0.16 + rng() * 0.16;
        c.fillStyle = GRIT_TONES[(rng() * GRIT_TONES.length) | 0];
        c.fillRect(x, y, s, s * 0.8);
    }
    c.restore();
}

/**
 * Rubble patches — mid-scale clumping (ejecta aprons, deflation lags).
 * Each patch = radial falloff cluster of 2-6 px pebbles with a 1 px SE shadow,
 * so the ground gains relief instead of looking sprayed.
 */
function drawRubblePatches(c: CanvasRenderingContext2D, rng: () => number): void {
    const PATCHES = 52;
    for (let p = 0; p < PATCHES; p++) {
        const cx = 120 + rng() * (WORLD_W - 240);
        const cy = 120 + rng() * (WORLD_H - 240);
        const spread = 90 + rng() * 210;
        const count = 34 + Math.floor(rng() * 60);
        const squash = 0.55 + rng() * 0.5; // patches are elongated by wind
        const rot = rng() * Math.PI;
        const cosR = Math.cos(rot), sinR = Math.sin(rot);

        for (let i = 0; i < count; i++) {
            // radial falloff: sqrt-biased toward the centre = natural density
            const t = Math.sqrt(rng());
            const a = rng() * Math.PI * 2;
            const lx = Math.cos(a) * t * spread;
            const ly = Math.sin(a) * t * spread * squash;
            const x = cx + lx * cosR - ly * sinR;
            const y = cy + lx * sinR + ly * cosR;
            if (x < 20 || x > WORLD_W - 20 || y < 20 || y > WORLD_H - 20) continue;

            const s = 1.8 + rng() * 4.2;
            // SE contact shadow (light law: sun NW)
            c.globalAlpha = 0.18;
            c.fillStyle = MARS_PALETTE.depth;
            c.fillRect(x + 1.2, y + 1.2, s, s * 0.8);
            // pebble body
            c.globalAlpha = 0.24 + rng() * 0.16;
            c.fillStyle = rng() < 0.5 ? MARS_PALETTE.midtint : MARS_PALETTE.trackDark;
            c.fillRect(x, y, s, s * 0.8);
            // NW sunlit chip on the bigger ones
            if (s > 3.4) {
                c.globalAlpha = 0.22;
                c.fillStyle = MARS_PALETTE.craterRim;
                c.fillRect(x, y, s * 0.5, s * 0.35);
            }
        }
    }
    c.globalAlpha = 1;
}

/**
 * Individual scattered stones (6-15 px) with full 2.5D treatment:
 * SE cast shadow + body + NW highlight. These are the ones the eye actually
 * registers as "rocks on the ground" while driving.
 * NOTE: purely visual — collision rocks are separate props (layer 4/5).
 */
function drawScatteredStones(c: CanvasRenderingContext2D, rng: () => number): void {
    const COUNT = 240;
    for (let i = 0; i < COUNT; i++) {
        const x = 60 + rng() * (WORLD_W - 120);
        const y = 60 + rng() * (WORLD_H - 120);
        const r = 3 + rng() * 4.5;
        const squash = 0.6 + rng() * 0.3;
        const rot = rng() * Math.PI;

        c.save();
        c.translate(x, y);
        c.rotate(rot);
        // cast shadow SE
        c.globalAlpha = 0.22;
        c.fillStyle = MARS_PALETTE.depth;
        c.beginPath();
        c.ellipse(MARS_LIGHT.shX * 0.6, MARS_LIGHT.shY * 0.6, r * 1.05, r * squash, 0, 0, Math.PI * 2);
        c.fill();
        // body
        c.globalAlpha = 0.55 + rng() * 0.2;
        c.fillStyle = rng() < 0.45 ? MARS_PALETTE.trackDark : MARS_PALETTE.midtint;
        c.beginPath();
        c.ellipse(0, 0, r, r * squash, 0, 0, Math.PI * 2);
        c.fill();
        // NW sunlit facet
        c.globalAlpha = 0.28;
        c.fillStyle = MARS_PALETTE.craterRim;
        c.beginPath();
        c.ellipse(-r * 0.28, -r * squash * 0.3, r * 0.55, r * squash * 0.5, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
}

/**
 * Aeolian wind ripples — long low dune waves. Each crest = light line (sunlit
 * NW face) immediately above a dark line (shaded SE face) = 2.5D relief for
 * two strokes. Fields are parallel and drift in direction, like real dune trains.
 */
function drawWindRipples(c: CanvasRenderingContext2D, rng: () => number): void {
    // Tuning note (playtest v0.120.0): the first pass used long straight crests
    // and read as SCRATCHES on glass. Real aeolian ripples are short, closely
    // spaced and curved — so: many small fields, short bowed crests, low alpha.
    const FIELDS = 26;
    for (let f = 0; f < FIELDS; f++) {
        const baseAng = rng() * Math.PI;         // ripple crest direction
        const cx = rng() * WORLD_W;
        const cy = rng() * WORLD_H;
        const fieldW = 180 + rng() * 380;        // across-crest extent
        const crestLen = 90 + rng() * 170;
        const spacing = 7 + rng() * 9;
        const lines = Math.floor(fieldW / spacing);
        const nx = Math.cos(baseAng + Math.PI / 2), ny = Math.sin(baseAng + Math.PI / 2);
        const dx = Math.cos(baseAng), dy = Math.sin(baseAng);

        c.save();
        c.lineCap = 'round';
        for (let i = 0; i < lines; i++) {
            const off = (i - lines / 2) * spacing;
            const sx = cx + nx * off;
            const sy = cy + ny * off;
            const len = crestLen * (0.5 + rng() * 0.5);
            const bow = (rng() - 0.5) * len * 0.55; // crests are never straight

            // sunlit crest (NW side)
            c.globalAlpha = 0.07 + rng() * 0.05;
            c.strokeStyle = MARS_PALETTE.duneLight;
            c.lineWidth = 1.2 + rng() * 1.0;
            c.beginPath();
            c.moveTo(sx - dx * len / 2, sy - dy * len / 2);
            c.quadraticCurveTo(sx + nx * bow, sy + ny * bow, sx + dx * len / 2, sy + dy * len / 2);
            c.stroke();

            // shaded trough right below it (SE side)
            c.globalAlpha = 0.06 + rng() * 0.04;
            c.strokeStyle = MARS_PALETTE.depth;
            c.lineWidth = 1.1 + rng() * 0.9;
            c.beginPath();
            c.moveTo(sx - dx * len / 2 + 1.8, sy - dy * len / 2 + 1.8);
            c.quadraticCurveTo(sx + nx * bow + 1.8, sy + ny * bow + 1.8,
                               sx + dx * len / 2 + 1.8, sy + dy * len / 2 + 1.8);
            c.stroke();
        }
        c.restore();
    }
}

/** Craters: sunlit NW lip + violet SE lip + darker floor. Low alpha = decor read. */
function drawCraters(c: CanvasRenderingContext2D, rng: () => number): void {
    for (let i = 0; i < 26; i++) {
        const x = 200 + rng() * (WORLD_W - 400);
        const y = 200 + rng() * (WORLD_H - 400);
        const r = 34 + rng() * 90;
        const squash = 0.72 + rng() * 0.2;

        c.save();
        // floor (soft depression)
        c.globalAlpha = 0.16 + rng() * 0.08;
        c.fillStyle = MARS_PALETTE.depth;
        c.beginPath();
        c.ellipse(x, y, r * 0.82, r * 0.82 * squash, 0, 0, Math.PI * 2);
        c.fill();
        // SE shadow lip
        c.globalAlpha = 0.22;
        c.strokeStyle = MARS_PALETTE.shadow;
        c.lineWidth = 3 + r * 0.06;
        c.beginPath();
        c.ellipse(x, y, r, r * squash, 0, Math.PI * 0.05, Math.PI * 0.95);
        c.stroke();
        // NW sunlit lip
        c.globalAlpha = 0.30;
        c.strokeStyle = MARS_PALETTE.craterRim;
        c.lineWidth = 2.5 + r * 0.05;
        c.beginPath();
        c.ellipse(x, y, r, r * squash, 0, Math.PI * 1.05, Math.PI * 1.95);
        c.stroke();
        c.restore();
    }
}

/** Two long wandering dual-groove rover tracks with tread dashes. */
function drawRoverTracks(c: CanvasRenderingContext2D, rng: () => number): void {
    for (let t = 0; t < 2; t++) {
        // wandering polyline across the map
        const pts: { x: number; y: number }[] = [];
        let px = t === 0 ? 150 : WORLD_W - 150;
        let py = 300 + rng() * 800;
        let ang = t === 0 ? 0.3 + rng() * 0.5 : Math.PI - (0.3 + rng() * 0.5);
        for (let s = 0; s < 46; s++) {
            pts.push({ x: px, y: py });
            ang += (rng() - 0.5) * 0.45;
            px += Math.cos(ang) * 70;
            py += Math.sin(ang) * 70;
            if (px < 120 || px > WORLD_W - 120 || py < 120 || py > WORLD_H - 120) break;
        }
        c.save();
        c.globalAlpha = 0.20;
        c.strokeStyle = MARS_PALETTE.trackDark;
        // dual grooves offset perpendicular to travel
        for (const side of [-11, 11]) {
            c.lineWidth = 5;
            c.beginPath();
            for (let i = 0; i < pts.length - 1; i++) {
                const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = (-dy / len) * side, ny = (dx / len) * side;
                if (i === 0) c.moveTo(pts[i].x + nx, pts[i].y + ny);
                c.lineTo(pts[i + 1].x + nx, pts[i + 1].y + ny);
            }
            c.stroke();
        }
        // tread dashes between grooves
        c.globalAlpha = 0.14;
        c.lineWidth = 2;
        for (let i = 0; i < pts.length - 1; i += 1) {
            const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len;
            for (let d = 0; d < len; d += 16) {
                const bx = pts[i].x + (dx / len) * d, by = pts[i].y + (dy / len) * d;
                c.beginPath();
                c.moveTo(bx + nx * 8, by + ny * 8);
                c.lineTo(bx - nx * 8, by - ny * 8);
                c.stroke();
            }
        }
        c.restore();
    }
}

/** Fallen solar panels + struts scattered S of the base footprint (baked decor). */
function drawBaseDebris(c: CanvasRenderingContext2D, rng: () => number): void {
    // debris cluster: south of the base (base spans 1880..2630 x 380..660)
    for (let i = 0; i < 14; i++) {
        const x = 1820 + rng() * 860;
        const y = 1000 + rng() * 380;
        const w = 26 + rng() * 46;
        const h = 14 + rng() * 22;
        const rot = rng() * Math.PI;
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        // SE contact shadow first (light law)
        c.globalAlpha = 0.20;
        c.fillStyle = MARS_PALETTE.depth;
        c.fillRect(-w / 2 + MARS_LIGHT.shX, -h / 2 + MARS_LIGHT.shY, w, h);
        // plate
        c.globalAlpha = 0.9;
        c.fillStyle = rng() < 0.5 ? '#7d8894' : '#5f6a76'; // dusty tech grey
        c.fillRect(-w / 2, -h / 2, w, h);
        // solar cell grid hint (cyan DETAIL only — F1 safe at this scale/alpha)
        if (rng() < 0.55) {
            c.globalAlpha = 0.35;
            c.strokeStyle = MARS_PALETTE.baseCyan;
            c.lineWidth = 1;
            for (let gx = -w / 2 + 5; gx < w / 2 - 2; gx += 8) {
                c.beginPath(); c.moveTo(gx, -h / 2 + 2); c.lineTo(gx, h / 2 - 2); c.stroke();
            }
        }
        c.restore();
    }
}

// =================================================================
// LAYOUTS — FROZEN from tools/mars_m1_layout.mjs (AABB verify PASS, 0 errors).
// x/y = TOP-LEFT everywhere. Do not hand-edit: edit script -> re-run -> re-paste.
// =================================================================

/** Mars base: 2 domes + connecting tunnel. Moved NE off centre (rev 2). */
export const MARS_BASE_LAYOUT = Object.freeze({
    domeA:  { x: 1880, y: 380, w: 340, h: 280 },
    tunnel: { x: 2220, y: 500, w: 150, h: 70 },
    domeB:  { x: 2370, y: 440, w: 260, h: 220 },
});

/**
 * Solar farm — powers the base (grammar layer 4, solid). Rows of panels with
 * driveable lanes between them; placed SW, the opposite corner from the base,
 * so the two man-made landmarks pull the player across the whole map.
 * x/y = TOP-LEFT, [x, y, w, h].
 */
export const MARS_SOLAR_ROWS: ReadonlyArray<[number, number, number, number]> = [
    [330, 1960, 430, 62], [370, 2138, 430, 62], [330, 2316, 430, 62], [370, 2494, 430, 62],
];

/**
 * Fuel station (M5c) — where the UFO sets down to refuel after a catch.
 * The apron is PASSABLE (the saucer lands on it, the player may drive across);
 * only the tank is solid. Landing spot = centre of the apron.
 */
export const MARS_FUEL_STATION = Object.freeze({
    pad:  { x: 200, y: 480, w: 140, h: 120 },
    tank: { x: 372, y: 500, w: 60, h: 82 },
});

/**
 * Rover patrol loop — waypoints verified clear of every solid, and no leg of the
 * loop crosses one (V6 in the generator). Passable actor: no collision at all.
 */
export const MARS_ROVER_ROUTE: ReadonlyArray<{ x: number; y: number }> = [
    { x: 520, y: 620 }, { x: 1180, y: 520 }, { x: 1760, y: 1080 }, { x: 2420, y: 1500 },
    { x: 2200, y: 2260 }, { x: 1380, y: 2420 }, { x: 700, y: 1760 },
];

/**
 * Second rover, SE quadrant (playtest: "lazik +20% i drugi w prawym dolnym rogu").
 * A tighter loop kept inside its own corner so the two never read as one convoy:
 * the route above sweeps the whole world, this one works the SE alone.
 * Verified by the same V6 gate, with the waypoint clearance box widened 52 -> 62
 * to match the +20% sprite.
 */
export const MARS_ROVER_ROUTE_SE: ReadonlyArray<{ x: number; y: number }> = [
    { x: 1700, y: 1900 }, { x: 2480, y: 1880 }, { x: 2780, y: 2480 },
    { x: 2080, y: 2820 }, { x: 1600, y: 2520 },
];

/**
 * Large rocks (reused `Rock` engine, 'large' tier), 120x120 AABB each.
 * CONVERSION (Rock takes a CENTRE and a visual size, and derives hitbox = size+60):
 *   centre = (x + 60, y + 60), size = 60  ->  hitbox 120x120 = exactly this AABB.
 */
export const MARS_LARGE_ROCKS_LAYOUT: ReadonlyArray<{ x: number; y: number }> = [
    { x: 240, y: 240 }, { x: 2640, y: 200 }, { x: 180, y: 1180 }, { x: 2720, y: 1320 },
    { x: 1420, y: 180 }, { x: 2560, y: 2660 }, { x: 1180, y: 2740 }, { x: 1980, y: 1620 },
    { x: 860, y: 900 }, { x: 2300, y: 2180 },
];

/** Loose-regolith slow fields (0.5x, rect zones — kit rule K3). */
export const MARS_SLOW_FIELDS_LAYOUT: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
    { x: 620, y: 380, w: 240, h: 180 },
    { x: 2500, y: 1680, w: 240, h: 190 },
    { x: 330, y: 2620, w: 260, h: 180 },
    { x: 1640, y: 940, w: 210, h: 165 },
    { x: 1700, y: 2480, w: 250, h: 175 },
];

/**
 * Stealth zones — pressurised hydroponic greenhouses. One belongs to the base,
 * one stands by the solar farm (a greenhouse needs power): the pairing tells the
 * story AND spreads cover across opposite corners.
 */
export const MARS_STEALTH_ZONES_LAYOUT: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
    { x: 1930, y: 760, w: 300, h: 190 },
    { x: 980, y: 2380, w: 280, h: 180 },
];

/**
 * Themed pads (100x100, activation AABB+8 — target contract K9).
 * Counts match every other open map (3 medi + 2 power). Shipping ONE of each was
 * the reason they were never found on a 3000x3000 world.
 */
export const MARS_MEDI_PAD_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
    { x: 560, y: 780 }, { x: 2260, y: 2420 }, { x: 1420, y: 2380 },
];
export const MARS_POWER_PAD_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
    { x: 2560, y: 900 }, { x: 760, y: 1560 },
];

/**
 * Small rocks 64x64 — GENERATED (seed 0x4d5231), pasted from script output.
 * 'small' tier has NO collision (decor, fixed zIndex 4). Same centre conversion
 * as above: centre = (x + 32, y + 32), visual size 34.
 *
 * RE-PASTED (faza Mars polish): the array had DRIFTED from the generator by
 * exactly one rock. (252,605) was frozen back in M1, before M5c added the fuel
 * station; re-running the script showed it breaks the 90 px clearance to BOTH the
 * fuel pad and the tank, so a 64 px boulder was crowding the UFO landing apron.
 * The generator relocates it to (252,715). The other 25 are byte-identical.
 */
export const MARS_SMALL_ROCKS_LAYOUT: ReadonlyArray<[number, number]> = [
    [1030,1115],[1923,1398],[2534,2216],[1013,729],[2088,2211],[909,2221],[2734,562],[343,1488],
    [2115,2663],[252,715],[2481,2413],[1153,1324],[2805,2475],[1622,541],[1701,1926],[900,2832],
    [701,999],[957,242],[129,1013],[999,1565],[1327,2116],[2250,2004],[2520,1963],[643,215],
    [2210,1130],[1238,824],
];

/**
 * Cargo containers — GENERATED (seed 0x4d5232), pasted from script output.
 * x/y = TOP-LEFT, matching MarsCargo directly (no conversion).
 * NOTE: the verifier reserved 48x48 per box while MarsCargo draws 36x36 — the
 * verification stays valid because the real boxes are SMALLER than reserved,
 * so every clearance it proved only grows. Do not enlarge past 48 without re-running.
 *
 * CLUSTERED (playtest: "maja byc klastry — gdzieniegdzie pojedyncze, rzadko — a
 * nie rownomiernie rozsypane"). Same count (64) so the mobile budget is unchanged;
 * what changed is the DISTRIBUTION: `generateClustered` in the script samples
 * cluster anchors, hangs 2-4 boxes off each on a jittered local grid, then adds 8
 * deliberate singles. Gate V5b measures the result (47 boxes have a neighbour
 * within 120 px, 17 stand alone). Crates now also keep 46 px clear of BOTH rover
 * loops — a lone box rarely landed on a leg by chance, a 4-box cluster would, and
 * the rovers have no collision so they would drive straight through it.
 */
export const MARS_CRATES_LAYOUT: ReadonlyArray<[number, number]> = [
    [1489,1125],[1493,1182],[1246,332],[1246,212],[1248,272],[1071,896],[1403,470],[1467,472],
    [1408,530],[1818,2782],[1814,2843],[2866,1966],[2808,2027],[2868,1906],[2862,1779],[2856,1837],
    [1778,772],[2116,1432],[1521,2180],[886,2663],[943,2661],[1817,2144],[1876,2029],[1818,2087],
    [895,1418],[898,1301],[951,1297],[1422,605],[1472,550],[979,1889],[2417,989],[153,2061],
    [154,1936],[151,1999],[115,1709],[118,1594],[147,2507],[145,2561],[141,2448],[2471,2894],
    [1238,1086],[1407,2578],[1088,1887],[173,2653],[107,2717],[108,2653],[2766,736],[1671,280],
    [1665,343],[1725,286],[487,1227],[424,1282],[2426,184],[2488,183],[2432,243],[2487,242],
    [325,918],[2519,1309],[970,406],[1417,1773],[558,1814],[453,196],[2036,1084],[1999,226],
];
