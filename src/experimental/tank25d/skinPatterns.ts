/**
 * skinPatterns.ts — SKIN-2 (v0.160.0). Rejestr programowych WZOROW skinow.
 *
 * KONTRAKT: painter dostaje ctx JUZ PRZYCIETY do ksztaltu (kadlub albo wieza)
 * przez dispatcher `drawSkinPattern` w render2d.ts (centralny clip zna ksztalty
 * wiez > r i podmiane truncated_cone->round — painter NIGDY nie robi clip sam).
 * Uklad wspolrzednych: lokalny uklad czesci po applyTransform — origin w srodku,
 * os +X w strone lufy; kadlub: hx=w/2, hy=h/2; wieza: kwadratowa koperta hx=hy=r.
 *
 * TWARDE REGULY (bake determinism + mobile):
 *  1. ZERO performance.now()/Date.now() — jedyny czas to g.phase (0..1) z
 *     brawler._skinPhase (bake piecze 36 katow w roznych ms; wlasny zegar
 *     painterow = faza "skacze" miedzy katami — realny bug klasy neonPulse).
 *  2. ZERO shadowBlur w petlach (najdrozsza operacja Canvas2D).
 *  3. Determinizm: zadnego Math.random() — "losowosc" z zaszytych tablic frakcji.
 *
 * Frakcje wzgledem hx/hy (wzorzec camoSpots) => wzor skaluje sie na kazdy kadlub.
 */

/** Paleta pochodna z derive(hex) — ksztalt 1:1 z render2d. */
export interface SkinPalette {
    main: string; light: string; bright: string;
    dark: string; deep: string; outline: string;
}

export interface PatternGeom {
    /** Pelne wymiary przycietego obszaru (kadlub: hullW/hullH; wieza: 2r/2r). */
    w: number; h: number;
    /** Polowy (kadlub: hullW/2, hullH/2; wieza: r, r). */
    hx: number; hy: number;
    /** Promien wiezy (dla area==='hull' rowny min(hx,hy) — pomocniczo). */
    r: number;
    area: 'hull' | 'turret';
    /** Faza animacji 0..1 (statyczne wzory ignoruja; bake zamraza na 0). */
    phase: number;
    colors: SkinPalette;
}

export interface PatternPainter {
    /** Maluje wzor na kadlubie (ctx przyciety do drawHullPath). */
    hull(ctx: CanvasRenderingContext2D, g: PatternGeom): void;
    /** Wzor na wiezy; brak => dispatcher uzywa hull() z kwadratowa koperta wiezy. */
    turret?(ctx: CanvasRenderingContext2D, g: PatternGeom): void;
    /** Wzor animowany (obrotnica: zywa faza; mecz: statyczny + puls ADD). */
    animated?: boolean;
}

type Ctx = CanvasRenderingContext2D;

// ── helpery wspoldzielone ────────────────────────────────────────────────────

/** Frakcyjne elipsy-plamy (wzorzec camoSpots): [fx, fy, frx, fry, rot]. */
type Blob = readonly [number, number, number, number, number];

function blobs(ctx: Ctx, g: PatternGeom, spots: readonly Blob[], color: string): void {
    ctx.fillStyle = color;
    for (const [fx, fy, frx, fry, rot] of spots) {
        ctx.save();
        ctx.translate(fx * g.hx, fy * g.hy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, frx * g.hx, fry * g.hy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

const CAMO_A: readonly Blob[] = [
    [-0.62, -0.35, 0.30, 0.42, 0.4], [-0.15, 0.42, 0.34, 0.38, -0.6],
    [0.40, -0.42, 0.30, 0.40, 0.9], [0.72, 0.30, 0.26, 0.44, -0.3],
    [-0.80, 0.44, 0.22, 0.34, 0.2], [0.10, -0.10, 0.24, 0.30, 1.2],
];
const CAMO_B: readonly Blob[] = [
    [-0.40, 0.10, 0.24, 0.34, -0.8], [0.22, 0.50, 0.22, 0.28, 0.5],
    [0.60, -0.15, 0.20, 0.30, -0.4], [-0.05, -0.52, 0.26, 0.26, 0.1],
];

/** Klasyczne moro: 2 warstwy plam na tle. */
function camo(ctx: Ctx, g: PatternGeom, bg: string, layer1: string, layer2: string, outline?: string): void {
    ctx.fillStyle = bg;
    ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
    if (outline) {
        // obrys plam (anty-wtopienie, tp_winter na Arktyce)
        ctx.strokeStyle = outline; ctx.lineWidth = 1.6;
        for (const [fx, fy, frx, fry, rot] of CAMO_A) {
            ctx.save(); ctx.translate(fx * g.hx, fy * g.hy); ctx.rotate(rot);
            ctx.beginPath(); ctx.ellipse(0, 0, frx * g.hx, fry * g.hy, 0, 0, Math.PI * 2);
            ctx.stroke(); ctx.restore();
        }
    }
    blobs(ctx, g, CAMO_A, layer1);
    blobs(ctx, g, CAMO_B, layer2);
}

/** Kwantowana siatka kwadratow (Woxel/CADPAT/Retro): deterministyczny hash. */
function pixelGrid(ctx: Ctx, g: PatternGeom, cell: number, palette: readonly string[]): void {
    const cols = Math.ceil(g.w / cell) + 2;
    const rows = Math.ceil(g.h / cell) + 2;
    for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
            const h = ((ix * 73856093) ^ (iy * 19349663)) >>> 0; // hash deterministyczny
            ctx.fillStyle = palette[h % palette.length];
            ctx.fillRect(-g.hx - cell + ix * cell, -g.hy - cell + iy * cell, cell + 0.5, cell + 0.5);
        }
    }
}

/** Tygrysie pregi: poprzeczne, zwezajace sie, falowane. */
function tigerStripes(ctx: Ctx, g: PatternGeom, color: string): void {
    const stripes: ReadonlyArray<readonly [number, number, number, number]> = [
        [-0.78, 0.16, 0.05, -0.10], [-0.52, 0.20, 0.07, 0.12],
        [-0.26, 0.17, 0.05, -0.06], [0.00, 0.22, 0.08, 0.08],
        [0.26, 0.18, 0.06, -0.12], [0.52, 0.21, 0.07, 0.05],
        [0.78, 0.15, 0.05, -0.04],
    ];
    ctx.fillStyle = color;
    for (const [fx, topW, botW, sy] of stripes) {
        const cx = fx * g.hx, yTop = -g.hy * 1.05, yBot = g.hy * 1.05;
        const yMid = sy * g.hy, tw = topW * g.hx, bw = botW * g.hx;
        ctx.beginPath();
        ctx.moveTo(cx - tw, yTop);
        ctx.quadraticCurveTo(cx - bw * 0.6, yMid, cx - bw, yBot);
        ctx.lineTo(cx + bw, yBot);
        ctx.quadraticCurveTo(cx + bw * 0.6, yMid, cx + tw, yTop);
        ctx.closePath(); ctx.fill();
    }
}

/** Rzedy luski (Dino/Kobra): luki dachowka, offset co drugi rzad. */
function scaleRows(ctx: Ctx, g: PatternGeom, sr: number, stroke: string, fill?: string): void {
    const rows = Math.ceil(g.h / sr) + 2;
    const cols = Math.ceil(g.w / (sr * 2)) + 2;
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.3;
    if (fill) ctx.fillStyle = fill;
    for (let iy = 0; iy < rows; iy++) {
        const off = (iy % 2) * sr;
        for (let ix = 0; ix < cols; ix++) {
            const x = -g.hx - sr + ix * sr * 2 + off;
            const y = -g.hy + iy * sr;
            ctx.beginPath();
            ctx.arc(x, y, sr, 0.15 * Math.PI, 0.85 * Math.PI);
            if (fill) ctx.fill();
            ctx.stroke();
        }
    }
}

/** Migoczaca gwiazdka 4-ramienna. */
function star(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.28, y - r * 0.28);
    ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.28, y + r * 0.28);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.28, y + r * 0.28);
    ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.28, y - r * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

/** Puls 0..1..0 z fazy (sinus w pelnym cyklu). */
const pulse = (phase: number): number => 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);

// ── rejestr wzorow ───────────────────────────────────────────────────────────

export const SKIN_PATTERNS: Record<string, PatternPainter> = {
    // ═══ ZWIERZETA ═══════════════════════════════════════════════════════════
    tp_tiger: {
        hull(ctx, g) { tigerStripes(ctx, g, '#1a1208'); },
        turret(ctx, g) { tigerStripes(ctx, g, '#1a1208'); },
    },
    tp_cow: {
        hull(ctx, g) {
            ctx.fillStyle = '#f4f1ea';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            blobs(ctx, g, [
                [-0.55, -0.35, 0.34, 0.45, 0.5], [0.35, 0.35, 0.38, 0.42, -0.7],
                [0.70, -0.45, 0.26, 0.34, 0.2], [-0.25, 0.55, 0.24, 0.30, 1.0],
                [-0.85, 0.30, 0.22, 0.36, -0.3],
            ], '#17130f');
        },
    },
    tp_shark: {
        hull(ctx, g) {
            // grzbiet szary, brzuch (tyl) jasniejszy
            ctx.fillStyle = '#5d707f';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            ctx.fillStyle = '#dfe7ec';
            ctx.beginPath();
            ctx.moveTo(-g.hx * 1.1, -g.hy * 0.35);
            ctx.quadraticCurveTo(0, -g.hy * 0.05, -g.hx * 1.1, g.hy * 0.55);
            ctx.closePath(); ctx.fill();
            // ZEBY na przodzie kadluba (strona +hx = lufa)
            ctx.fillStyle = '#ffffff';
            const n = 6;
            for (let i = 0; i < n; i++) {
                const y = -g.hy * 0.8 + (i + 0.5) * (g.h * 0.8 / n);
                ctx.beginPath();
                ctx.moveTo(g.hx * 1.02, y - g.hy * 0.10);
                ctx.lineTo(g.hx * 0.62, y);
                ctx.lineTo(g.hx * 1.02, y + g.hy * 0.10);
                ctx.closePath(); ctx.fill();
            }
            ctx.strokeStyle = '#22303a'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(g.hx * 0.62, -g.hy); ctx.lineTo(g.hx * 0.62, g.hy); ctx.stroke();
        },
        turret(ctx, g) {
            // pletwa grzbietowa na topie wiezy
            ctx.fillStyle = '#465866';
            ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
            ctx.fillStyle = '#2c3b47';
            ctx.beginPath();
            ctx.moveTo(-g.r * 0.55, g.r * 0.35);
            ctx.quadraticCurveTo(-g.r * 0.1, -g.r * 0.85, g.r * 0.45, -g.r * 0.05);
            ctx.quadraticCurveTo(g.r * 0.05, g.r * 0.15, -g.r * 0.55, g.r * 0.35);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#1b262e'; ctx.lineWidth = 1.4; ctx.stroke();
        },
    },
    tp_dino: {
        hull(ctx, g) {
            ctx.fillStyle = '#3f7d3a';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            scaleRows(ctx, g, Math.max(4, g.hy * 0.30), '#25511f');
            // grzbietowe kolce wzdluz osi X
            ctx.fillStyle = '#8fbf4d';
            ctx.strokeStyle = '#25511f'; ctx.lineWidth = 1.2;
            for (let i = -3; i <= 3; i++) {
                const x = i * g.hx * 0.26;
                ctx.beginPath();
                ctx.moveTo(x - g.hx * 0.08, 0);
                ctx.lineTo(x, -g.hy * 0.34);
                ctx.lineTo(x + g.hx * 0.08, 0);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        },
    },
    tp_panda: {
        hull(ctx, g) {
            ctx.fillStyle = '#f2efe9';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            blobs(ctx, g, [
                [-0.75, 0.0, 0.30, 0.85, 0], [0.75, 0.0, 0.30, 0.85, 0],
            ], '#191512');
        },
        turret(ctx, g) {
            ctx.fillStyle = '#f2efe9';
            ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
            // "oczy" pandy — dwie czarne laty
            blobs(ctx, { ...g, hx: g.r, hy: g.r }, [
                [-0.42, -0.25, 0.30, 0.38, -0.5], [0.42, -0.25, 0.30, 0.38, 0.5],
            ], '#191512');
        },
    },
    tp_cobra: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#4a5d33';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            scaleRows(ctx, g, Math.max(3.5, g.hy * 0.24), '#2b3a1c', '#5b7340');
            // hipnotyczny "oddech" polysku — pas swiatla wedruje z faza
            const px = (pulse(g.phase) * 2 - 1) * g.hx * 1.2;
            const grad = ctx.createLinearGradient(px - g.hx * 0.4, 0, px + g.hx * 0.4, 0);
            grad.addColorStop(0, 'rgba(255,255,220,0)');
            grad.addColorStop(0.5, 'rgba(255,255,220,0.22)');
            grad.addColorStop(1, 'rgba(255,255,220,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
        },
    },

    // ═══ GRY ═════════════════════════════════════════════════════════════════
    tp_woxel: {
        hull(ctx, g) {
            pixelGrid(ctx, g, Math.max(4, g.hy * 0.28), ['#5d9a3c', '#4d8032', '#7ab54e', '#6b4f35']);
        },
    },
    tp_bricks: {
        hull(ctx, g) {
            ctx.fillStyle = '#c9352b';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // rzedy wypustek (study) z highlightem i cieniem — czytaja sie 3D
            const sr = Math.max(3, g.hy * 0.16);
            const step = sr * 3;
            for (let y = -g.hy + step * 0.6; y < g.hy; y += step) {
                for (let x = -g.hx + step * 0.6; x < g.hx; x += step) {
                    ctx.fillStyle = '#a02620';
                    ctx.beginPath(); ctx.arc(x + sr * 0.25, y + sr * 0.25, sr, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#e0453a';
                    ctx.beginPath(); ctx.arc(x, y, sr, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#f0776d';
                    ctx.beginPath(); ctx.arc(x - sr * 0.3, y - sr * 0.3, sr * 0.45, 0, Math.PI * 2); ctx.fill();
                }
            }
        },
    },
    tp_retro: {
        hull(ctx, g) {
            pixelGrid(ctx, g, Math.max(3, g.hy * 0.18), ['#3d2a56', '#5a3a80', '#2a1c3d', '#7a52a8']);
            // scanlines
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            const lh = Math.max(2, g.hy * 0.12);
            for (let y = -g.hy; y < g.hy; y += lh * 2) {
                ctx.fillRect(-g.hx * 1.1, y, g.w * 1.1, lh * 0.8);
            }
        },
    },
    tp_glitch: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#101418';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // faza KWANTYZOWANA schodkowo (migot, nie plynnosc) — 6 krokow
            const step = Math.floor(g.phase * 6);
            const bands: ReadonlyArray<readonly [number, number]> = [
                [-0.7, 0.16], [-0.35, 0.10], [0.0, 0.20], [0.3, 0.12], [0.65, 0.16],
            ];
            bands.forEach(([fy, fh], i) => {
                const shift = (((i + step) * 37) % 11 - 5) * g.hx * 0.05;
                const y = fy * g.hy, h = fh * g.h;
                ctx.fillStyle = 'rgba(255,40,90,0.55)';
                ctx.fillRect(-g.hx + shift - 2, y, g.w, h);
                ctx.fillStyle = 'rgba(40,255,220,0.5)';
                ctx.fillRect(-g.hx + shift + 2, y + h * 0.2, g.w, h * 0.7);
                ctx.fillStyle = '#e8ecf2';
                ctx.fillRect(-g.hx + shift, y + h * 0.4, g.w, h * 0.16);
            });
        },
    },
    tp_neongrid: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#0a1020';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            const glow = 0.45 + 0.45 * pulse(g.phase);
            ctx.strokeStyle = `rgba(0,220,255,${glow.toFixed(3)})`;
            ctx.lineWidth = 1.4;
            const cell = Math.max(5, g.hy * 0.34);
            ctx.beginPath();
            for (let x = -g.hx; x <= g.hx; x += cell) { ctx.moveTo(x, -g.hy * 1.1); ctx.lineTo(x, g.hy * 1.1); }
            for (let y = -g.hy; y <= g.hy; y += cell) { ctx.moveTo(-g.hx * 1.1, y); ctx.lineTo(g.hx * 1.1, y); }
            ctx.stroke();
        },
    },
    tp_lowpoly: {
        hull(ctx, g) {
            const tones = [g.colors.light, g.colors.main, g.colors.deep];
            const cell = Math.max(6, g.hy * 0.5);
            const cols = Math.ceil(g.w / cell) + 2;
            const rows = Math.ceil(g.h / cell) + 2;
            for (let iy = 0; iy < rows; iy++) {
                for (let ix = 0; ix < cols; ix++) {
                    const x = -g.hx - cell + ix * cell, y = -g.hy - cell + iy * cell;
                    const h = ((ix * 2654435761) ^ (iy * 40503)) >>> 0;
                    // kwadrat ciety po przekatnej na 2 trojkaty w roznych tonach
                    ctx.fillStyle = tones[h % 3];
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cell, y); ctx.lineTo(x, y + cell);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = tones[(h >> 3) % 3];
                    ctx.beginPath(); ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); ctx.lineTo(x, y + cell);
                    ctx.closePath(); ctx.fill();
                }
            }
        },
    },

    // ═══ ZYWIOLY ═════════════════════════════════════════════════════════════
    tp_lava: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#211410';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // zyly magmy pulsuja jasnoscia z fazy
            const heat = 0.55 + 0.45 * pulse(g.phase);
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = `rgba(255,${Math.round(90 + 80 * heat)},20,${(0.65 + 0.35 * heat).toFixed(3)})`;
            const veins: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
                [[-1.0, -0.5], [-0.5, -0.2], [-0.2, -0.6], [0.3, -0.3], [0.9, -0.55]],
                [[-0.9, 0.45], [-0.4, 0.15], [0.1, 0.5], [0.55, 0.2], [1.0, 0.4]],
                [[-0.3, -1.0], [-0.1, -0.3], [0.2, 0.3], [0.05, 1.0]],
            ];
            for (const v of veins) {
                ctx.beginPath();
                ctx.moveTo(v[0][0] * g.hx, v[0][1] * g.hy);
                for (let i = 1; i < v.length; i++) ctx.lineTo(v[i][0] * g.hx, v[i][1] * g.hy);
                ctx.stroke();
            }
            // spekana skorupa — ciemne plyty na wierzchu
            blobs(ctx, g, CAMO_A, 'rgba(20,10,8,0.55)');
        },
    },
    tp_ice: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#bfe3f2';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // fasety lodu
            ctx.strokeStyle = 'rgba(70,140,180,0.55)'; ctx.lineWidth = 1.3;
            const cracks: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
                [[-1.0, -0.2], [-0.4, 0.1], [0.2, -0.3], [1.0, 0.0]],
                [[-0.5, -1.0], [-0.2, -0.2], [-0.55, 0.6], [-0.3, 1.0]],
                [[0.5, -1.0], [0.35, 0.0], [0.7, 0.6]],
            ];
            for (const cr of cracks) {
                ctx.beginPath();
                ctx.moveTo(cr[0][0] * g.hx, cr[0][1] * g.hy);
                for (let i = 1; i < cr.length; i++) ctx.lineTo(cr[i][0] * g.hx, cr[i][1] * g.hy);
                ctx.stroke();
            }
            // wedrujace iskry (2-3 gwiazdki, pozycje z fazy)
            const p = g.phase;
            star(ctx, Math.sin(p * 6.28) * g.hx * 0.6, Math.cos(p * 6.28) * g.hy * 0.5, g.hy * 0.18, '#ffffff', 0.5 + 0.5 * pulse(p));
            star(ctx, Math.cos(p * 6.28 + 2) * g.hx * 0.5, Math.sin(p * 6.28 + 2) * g.hy * 0.6, g.hy * 0.12, '#ffffff', 0.5 + 0.5 * pulse(p + 0.5));
        },
    },
    tp_ocean: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#0f5e7e';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // 2 warstwy kaustyk — luki przesuwane faza w przeciwne strony
            const drawCaustics = (offX: number, alpha: number, sr: number): void => {
                ctx.strokeStyle = `rgba(140,230,255,${alpha})`; ctx.lineWidth = 1.5;
                const rows = Math.ceil(g.h / sr) + 2;
                const cols = Math.ceil(g.w / (sr * 2)) + 3;
                for (let iy = 0; iy < rows; iy++) {
                    const off = (iy % 2) * sr + offX;
                    for (let ix = 0; ix < cols; ix++) {
                        const x = -g.hx - sr * 2 + ((ix * sr * 2 + off) % (g.w + sr * 4));
                        ctx.beginPath();
                        ctx.arc(x, -g.hy + iy * sr, sr, 0.2 * Math.PI, 0.8 * Math.PI);
                        ctx.stroke();
                    }
                }
            };
            const sr = Math.max(4, g.hy * 0.3);
            drawCaustics(g.phase * sr * 2, 0.5, sr);
            drawCaustics(-g.phase * sr * 2 + sr, 0.3, sr * 1.4);
        },
    },
    tp_storm: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#1b2340';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // faza przelacza 3 uklady lukow (stroboskopowo, lagodnie przez alpha)
            const set = Math.floor(g.phase * 3) % 3;
            const flick = 0.55 + 0.45 * pulse(g.phase * 3);
            const arcs: ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = [
                [[[-0.9, -0.6], [-0.4, 0.0], [-0.6, 0.3], [0.0, 0.7]], [[0.3, -0.8], [0.5, -0.1], [0.9, 0.2]]],
                [[[-0.8, 0.5], [-0.3, -0.2], [0.1, 0.4], [0.6, -0.5]], [[0.7, 0.7], [0.4, 0.1]]],
                [[[-0.2, -0.9], [0.0, -0.1], [-0.4, 0.6]], [[0.55, -0.6], [0.8, 0.3], [0.5, 0.8]]],
            ];
            ctx.strokeStyle = `rgba(150,210,255,${flick.toFixed(3)})`;
            ctx.lineWidth = 1.8;
            for (const bolt of arcs[set]) {
                ctx.beginPath();
                ctx.moveTo(bolt[0][0] * g.hx, bolt[0][1] * g.hy);
                for (let i = 1; i < bolt.length; i++) ctx.lineTo(bolt[i][0] * g.hx, bolt[i][1] * g.hy);
                ctx.stroke();
            }
        },
    },
    tp_galaxy: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#12102e';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // mglawica — 2 miekkie radialne plamy
            const neb = ctx.createRadialGradient(-g.hx * 0.3, -g.hy * 0.2, 0, -g.hx * 0.3, -g.hy * 0.2, g.hx * 0.8);
            neb.addColorStop(0, 'rgba(160,80,220,0.5)');
            neb.addColorStop(1, 'rgba(160,80,220,0)');
            ctx.fillStyle = neb;
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            const neb2 = ctx.createRadialGradient(g.hx * 0.45, g.hy * 0.3, 0, g.hx * 0.45, g.hy * 0.3, g.hx * 0.6);
            neb2.addColorStop(0, 'rgba(60,140,255,0.4)');
            neb2.addColorStop(1, 'rgba(60,140,255,0)');
            ctx.fillStyle = neb2;
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // gwiazdy migocza z faza (kazda w innej pod-fazie)
            const stars: ReadonlyArray<readonly [number, number, number]> = [
                [-0.7, -0.5, 0.0], [-0.2, 0.4, 0.25], [0.3, -0.35, 0.5],
                [0.75, 0.15, 0.75], [0.05, -0.75, 0.4], [-0.5, 0.7, 0.9], [0.55, 0.65, 0.15],
            ];
            for (const [fx, fy, ph] of stars) {
                const a = 0.35 + 0.65 * pulse(g.phase + ph);
                star(ctx, fx * g.hx, fy * g.hy, g.hy * 0.10 + a * g.hy * 0.06, '#ffffff', a);
            }
        },
    },
    tp_slime: {
        animated: true,
        hull(ctx, g) {
            ctx.fillStyle = '#3f9e2f';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // babel + ociekanie
            blobs(ctx, g, [
                [-0.5, -0.3, 0.16, 0.20, 0], [0.25, 0.35, 0.13, 0.16, 0],
                [0.65, -0.4, 0.10, 0.13, 0], [-0.15, 0.6, 0.09, 0.11, 0],
            ], '#59c542');
            // "mokry" polysk wedruje z faza
            const px = (pulse(g.phase) * 2 - 1) * g.hx;
            const grad = ctx.createLinearGradient(px - g.hx * 0.3, -g.hy, px + g.hx * 0.3, g.hy);
            grad.addColorStop(0, 'rgba(230,255,210,0)');
            grad.addColorStop(0.5, 'rgba(230,255,210,0.30)');
            grad.addColorStop(1, 'rgba(230,255,210,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            ctx.strokeStyle = 'rgba(25,80,15,0.5)'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.ellipse(0, 0, g.hx * 0.9, g.hy * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
        },
    },

    // ═══ WOJSKOWE ════════════════════════════════════════════════════════════
    tp_desert: {
        hull(ctx, g) { camo(ctx, g, '#c8a86a', '#8a6b40', '#5f4a2c'); },
    },
    tp_cadpat: {
        hull(ctx, g) {
            pixelGrid(ctx, g, Math.max(3, g.hy * 0.16), ['#3d5a33', '#243c1e', '#5a7548', '#141d10']);
        },
    },
    tp_m90: {
        hull(ctx, g) {
            // splinter: KANCIASTE wielokaty (nie oble) — 4 tony
            ctx.fillStyle = '#4a5d3a';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            const polys: ReadonlyArray<readonly [string, ReadonlyArray<readonly [number, number]>]> = [
                ['#2c3b22', [[-1.0, -1.0], [-0.3, -0.8], [-0.55, -0.1], [-1.0, 0.15]]],
                ['#75683f', [[-0.3, -0.8], [0.4, -1.0], [0.7, -0.35], [0.1, -0.15], [-0.55, -0.1]]],
                ['#1d2618', [[0.4, 0.15], [1.0, -0.1], [1.0, 0.7], [0.35, 0.85]]],
                ['#2c3b22', [[-0.75, 0.3], [0.1, 0.15], [0.05, 0.9], [-0.6, 1.0]]],
                ['#75683f', [[-1.0, 0.55], [-0.75, 0.3], [-0.6, 1.0], [-1.0, 1.0]]],
            ];
            for (const [color, pts] of polys) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(pts[0][0] * g.hx, pts[0][1] * g.hy);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * g.hx, pts[i][1] * g.hy);
                ctx.closePath(); ctx.fill();
            }
        },
    },
    tp_woodland: {
        hull(ctx, g) { camo(ctx, g, '#4f6636', '#33491f', '#6b5a38'); },
    },
    tp_winter: {
        hull(ctx, g) {
            // biel + szare laty; GRAFITOWY obrys lat + ciemna obwodka kadluba —
            // anty-wtopienie na Arktyce (bramka: czytelnosc w ruchu na mapie)
            camo(ctx, g, '#eef1f4', '#b9c2cc', '#8b98a6', '#3a434d');
            ctx.strokeStyle = '#3a434d'; ctx.lineWidth = 2.5;
            ctx.strokeRect(-g.hx * 1.05, -g.hy * 1.05, g.w * 1.05, g.h * 1.05);
        },
    },
    tp_navy: {
        hull(ctx, g) { camo(ctx, g, '#33507a', '#1e3050', '#5a7aa5'); },
    },

    // ═══ SEZONOWE (s3-s8) ════════════════════════════════════════════════════
    tp_s3_notebook: {
        hull(ctx, g) {
            ctx.fillStyle = '#f6f1e2'; // kremowy papier
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            ctx.strokeStyle = 'rgba(58,160,224,0.5)'; ctx.lineWidth = 1;
            const cell = Math.max(4, g.hy * 0.24);
            ctx.beginPath();
            for (let x = -g.hx; x <= g.hx; x += cell) { ctx.moveTo(x, -g.hy * 1.1); ctx.lineTo(x, g.hy * 1.1); }
            for (let y = -g.hy; y <= g.hy; y += cell) { ctx.moveTo(-g.hx * 1.1, y); ctx.lineTo(g.hx * 1.1, y); }
            ctx.stroke();
            // czerwony margines wzdluz LEWEJ burty (tyl czolgu = -hx)
            ctx.strokeStyle = '#d4213d'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-g.hx * 0.7, -g.hy * 1.1); ctx.lineTo(-g.hx * 0.7, g.hy * 1.1); ctx.stroke();
        },
        turret(ctx, g) {
            ctx.fillStyle = '#f6f1e2';
            ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
            // KLEKS atramentu na wiezy
            blobs(ctx, { ...g, hx: g.r, hy: g.r }, [
                [0.05, 0.0, 0.42, 0.36, 0.3], [0.4, -0.35, 0.12, 0.10, 0], [-0.38, 0.3, 0.09, 0.08, 0],
            ], '#20356e');
        },
    },
    tp_s4_sweater: {
        hull(ctx, g) {
            // dzianinowy zigzag w pasach zielen/czerwien/biel
            const rows: ReadonlyArray<readonly [number, string]> = [
                [-0.85, '#b8352c'], [-0.45, '#efe9dc'], [-0.05, '#2e6b3a'], [0.35, '#efe9dc'], [0.75, '#b8352c'],
            ];
            ctx.fillStyle = '#2e6b3a';
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            const zw = g.hx * 0.14, zh = g.hy * 0.16;
            for (const [fy, color] of rows) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(-g.hx * 1.1, fy * g.hy);
                for (let x = -g.hx * 1.1; x <= g.hx * 1.1; x += zw * 2) {
                    ctx.lineTo(x + zw, fy * g.hy - zh);
                    ctx.lineTo(x + zw * 2, fy * g.hy);
                }
                ctx.lineTo(g.hx * 1.1, fy * g.hy + zh * 2.2);
                ctx.lineTo(-g.hx * 1.1, fy * g.hy + zh * 2.2);
                ctx.closePath(); ctx.fill();
            }
            // pikselowe snieznyki
            ctx.fillStyle = '#ffffff';
            for (const [fx, fy] of [[-0.6, -0.6], [0.2, -0.15], [0.7, 0.5], [-0.25, 0.55]] as const) {
                const s = g.hy * 0.07;
                ctx.fillRect(fx * g.hx - s / 2, fy * g.hy - s * 1.5, s, s * 3);
                ctx.fillRect(fx * g.hx - s * 1.5, fy * g.hy - s / 2, s * 3, s);
            }
        },
    },
    tp_s5_penguin: {
        hull(ctx, g) {
            ctx.fillStyle = '#16181d'; // czarny grzbiet
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // bialy brzuszek — owal na srodku kadluba
            ctx.fillStyle = '#f2f4f6';
            ctx.beginPath();
            ctx.ellipse(g.hx * 0.1, 0, g.hx * 0.62, g.hy * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
            // lodowe okucia na burtach
            ctx.strokeStyle = '#4dd7c8'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-g.hx * 1.05, -g.hy * 0.9); ctx.lineTo(g.hx * 1.05, -g.hy * 0.9);
            ctx.moveTo(-g.hx * 1.05, g.hy * 0.9); ctx.lineTo(g.hx * 1.05, g.hy * 0.9); ctx.stroke();
        },
        turret(ctx, g) {
            ctx.fillStyle = '#16181d';
            ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
            // pomaranczowy dziobek w strone lufy
            ctx.fillStyle = '#f39c2b';
            ctx.beginPath();
            ctx.moveTo(g.r * 0.9, 0); ctx.lineTo(g.r * 0.3, -g.r * 0.25); ctx.lineTo(g.r * 0.3, g.r * 0.25);
            ctx.closePath(); ctx.fill();
        },
    },
    tp_s6_hatchling: {
        hull(ctx, g) {
            ctx.fillStyle = '#f3e9cf'; // skorupka
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            blobs(ctx, g, [
                [-0.6, -0.4, 0.10, 0.12, 0], [0.35, -0.55, 0.08, 0.10, 0],
                [0.7, 0.35, 0.11, 0.13, 0], [-0.3, 0.5, 0.09, 0.10, 0],
            ], '#d9c79a');
            // PEKNIECIE zygzakiem przez kadlub + zolty srodek "wykluwa sie"
            ctx.fillStyle = '#ffd23f';
            ctx.beginPath();
            ctx.moveTo(-g.hx * 0.15, -g.hy * 1.1);
            ctx.lineTo(g.hx * 0.05, -g.hy * 0.4); ctx.lineTo(-g.hx * 0.1, 0.0);
            ctx.lineTo(g.hx * 0.1, g.hy * 0.45); ctx.lineTo(-g.hx * 0.05, g.hy * 1.1);
            ctx.lineTo(g.hx * 0.22, g.hy * 1.1); ctx.lineTo(g.hx * 0.32, g.hy * 0.4);
            ctx.lineTo(g.hx * 0.15, -g.hy * 0.05); ctx.lineTo(g.hx * 0.3, -g.hy * 0.5);
            ctx.lineTo(g.hx * 0.1, -g.hy * 1.1);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-g.hx * 0.15, -g.hy * 1.1);
            ctx.lineTo(g.hx * 0.05, -g.hy * 0.4); ctx.lineTo(-g.hx * 0.1, 0.0);
            ctx.lineTo(g.hx * 0.1, g.hy * 0.45); ctx.lineTo(-g.hx * 0.05, g.hy * 1.1);
            ctx.stroke();
        },
    },
    tp_s7_grill: {
        hull(ctx, g) {
            ctx.fillStyle = '#e0862f'; // apetyczny pomarancz
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // sear-marks po skosie
            ctx.strokeStyle = 'rgba(60,25,8,0.75)'; ctx.lineWidth = Math.max(2.5, g.hy * 0.12);
            ctx.beginPath();
            for (let i = -4; i <= 4; i++) {
                const x = i * g.hx * 0.32;
                ctx.moveTo(x - g.hy, -g.hy * 1.1);
                ctx.lineTo(x + g.hy, g.hy * 1.1);
            }
            ctx.stroke();
            // plomyki przy burtach
            ctx.fillStyle = '#ffd23f';
            for (const [fx, s] of [[-0.75, 1], [-0.25, 0.8], [0.3, 1.1], [0.75, 0.9]] as const) {
                const x = fx * g.hx, base = g.hy * 1.05, hgt = g.hy * 0.5 * s;
                ctx.beginPath();
                ctx.moveTo(x - g.hx * 0.07, base);
                ctx.quadraticCurveTo(x - g.hx * 0.02, base - hgt * 0.6, x, base - hgt);
                ctx.quadraticCurveTo(x + g.hx * 0.02, base - hgt * 0.6, x + g.hx * 0.07, base);
                ctx.closePath(); ctx.fill();
            }
        },
    },
    tp_s8_aloha: {
        hull(ctx, g) {
            ctx.fillStyle = '#1fa3b8'; // turkus koszuli
            ctx.fillRect(-g.hx * 1.1, -g.hy * 1.1, g.w * 1.1, g.h * 1.1);
            // liscie monstery (ciemne owalne z wcieciami — uproszczone)
            blobs(ctx, g, [
                [-0.6, -0.35, 0.24, 0.30, 0.6], [0.5, 0.4, 0.26, 0.30, -0.8], [0.15, -0.55, 0.20, 0.24, 0.2],
            ], '#0e6b52');
            // kwiaty hibiskusa: 5 platkow + srodek
            const flower = (fx: number, fy: number, s: number): void => {
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2;
                    ctx.fillStyle = '#ff5f7a';
                    ctx.beginPath();
                    ctx.ellipse(fx * g.hx + Math.cos(a) * s, fy * g.hy + Math.sin(a) * s,
                        s * 0.7, s * 0.45, a, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#ffd23f';
                ctx.beginPath(); ctx.arc(fx * g.hx, fy * g.hy, s * 0.4, 0, Math.PI * 2); ctx.fill();
            };
            flower(-0.25, 0.3, g.hy * 0.22);
            flower(0.65, -0.3, g.hy * 0.18);
        },
    },
};

/** Czy wzor o danym id jest animowany (dla UI/Player bez siegania w painter). */
export function isPatternAnimated(patternId: string | null | undefined): boolean {
    return !!(patternId && SKIN_PATTERNS[patternId]?.animated);
}
