import * as PIXI from 'pixi.js';

/**
 * v0.29.0 FAZA T3 — DIRT ROAD (drogi szutrowe)
 *
 * Caribbean farmstead dirt road — wiejskie drogi szutrowe.
 *
 * RENDERING STACK (zIndex bottom-up):
 *   -95: Baked AO shadow (Constitution Rule #7)
 *   -90: Main road surface (jasniejszy braz + center highlight)
 *   -89: Wheel ruts (2 paralelne ciemniejsze linie wzdluz drogi)
 *   -87: 3D Pebbles (drop shadow + base + body + top hemisphere + specular + catchlight)
 *
 * PATH:
 *   - WYLACZNIE poziome lub pionowe segmenty (orthogonal Manhattan grid)
 *   - Linear interpolation miedzy waypointami (NO Catmull-Rom, NO krzywizny)
 *   - cap BUTT — proste konce, drogi moga wychodzic poza krawedz mapy
 *
 * GUARDS:
 *   - Każda para sasiednich waypoints MUSI dzielic albo same x albo same y
 *   - Console warning gdy droga ma diagonalny segment
 *
 * Constitution Rule #7: Baked AO blob pod drogami.
 */

const COLORS = {
    aoShadow:           0x000000,
    roadBase:           0x9a7838,
    roadLight:          0xb89248,
    roadDark:           0x6a4828,
    pebbleShadow:       0x000000,
    pebbleDarkBase:     0x2a1808,
    pebbleLight:        0xa89878,
    pebbleDark:         0x6a4828,
    pebbleHighlight:    0xc8b898,
    pebbleSpecular:     0xffffff,
};

export class DirtRoad {
    constructor(
        waypoints: Array<{ x: number; y: number }>,
        worldContainer: PIXI.Container,
        seed: number = 17,
    ) {
        if (waypoints.length < 2) {
            console.warn('[DirtRoad] Need at least 2 waypoints, got', waypoints.length);
            return;
        }

        // Validate orthogonal — sasiednie pary musza dzielic x lub y
        for (let i = 0; i < waypoints.length - 1; i++) {
            const a = waypoints[i];
            const b = waypoints[i + 1];
            if (a.x !== b.x && a.y !== b.y) {
                console.warn(
                    `[DirtRoad] Diagonal segment detected (seed=${seed}, idx=${i}):`,
                    a, '->', b,
                    '— drogi musza byc czysto poziome lub pionowe (Manhattan grid).',
                );
            }
        }

        const rng = makeRng(seed);

        // Linear interpolation: 20 punktów per segment (dla rozproszenia pebbles)
        const SEGMENTS_PER_PAIR = 20;
        const path = interpolateLinearMulti(waypoints, SEGMENTS_PER_PAIR);

        // ── LAYER 1: Baked AO shadow ──
        const aoGfx = new PIXI.Graphics();
        aoGfx.zIndex = -95;
        drawPathStroke(aoGfx, path, 70, COLORS.aoShadow, 0.18);
        drawPathStroke(aoGfx, path, 56, COLORS.aoShadow, 0.12);
        worldContainer.addChild(aoGfx);

        // ── LAYER 2: Main road surface ──
        const roadGfx = new PIXI.Graphics();
        roadGfx.zIndex = -90;
        drawPathStroke(roadGfx, path, 50, COLORS.roadBase, 0.92);
        drawPathStroke(roadGfx, path, 36, COLORS.roadLight, 0.65);
        worldContainer.addChild(roadGfx);

        // ── LAYER 3: Wheel ruts ──
        const rutGfx = new PIXI.Graphics();
        rutGfx.zIndex = -89;
        const RUT_OFFSET = 11;
        const rutLeft = offsetPath(path, +RUT_OFFSET);
        const rutRight = offsetPath(path, -RUT_OFFSET);
        drawPathStroke(rutGfx, rutLeft, 3.5, COLORS.roadDark, 0.55);
        drawPathStroke(rutGfx, rutRight, 3.5, COLORS.roadDark, 0.55);
        worldContainer.addChild(rutGfx);

        // ── LAYER 4: Premium 3D Pebbles ──
        const pebbleGfx = new PIXI.Graphics();
        pebbleGfx.zIndex = -87;
        this.drawPebbles3D(pebbleGfx, path, rng);
        worldContainer.addChild(pebbleGfx);
    }

    // ═══════════════════════════════════════════════════════════
    // PEBBLES 3D — kamyczki premium z gradient + specular highlight
    // ═══════════════════════════════════════════════════════════
    private drawPebbles3D(
        gfx: PIXI.Graphics,
        path: Array<{ x: number; y: number }>,
        rng: () => number,
    ): void {
        for (let i = 0; i < path.length - 1; i++) {
            for (let p = 0; p < 3; p++) {
                if (rng() > 0.5) continue;

                const t = rng();
                const cx = path[i].x * (1 - t) + path[i + 1].x * t;
                const cy = path[i].y * (1 - t) + path[i + 1].y * t;

                const dx = path[i + 1].x - path[i].x;
                const dy = path[i + 1].y - path[i].y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const side = rng() < 0.5 ? 1 : -1;
                const off = (18 + rng() * 14) * side;
                const px = cx + nx * off;
                const py = cy + ny * off;

                const r = 1.7 + rng() * 2.2;
                const isLight = rng() < 0.5;

                // ── 6-warstwowy 3D pebble ──

                // 1. Deep drop shadow (offset SE)
                gfx.beginFill(COLORS.pebbleShadow, 0.40);
                gfx.drawEllipse(px + r * 0.45, py + r * 0.55, r * 1.05, r * 0.45);
                gfx.endFill();

                // 2. Dark base (back hemisphere)
                gfx.beginFill(COLORS.pebbleDarkBase, 0.85);
                gfx.drawEllipse(px, py + r * 0.18, r * 1.02, r * 0.92);
                gfx.endFill();

                // 3. Main body
                gfx.beginFill(isLight ? COLORS.pebbleLight : COLORS.pebbleDark, 0.96);
                gfx.drawEllipse(px, py, r, r * 0.95);
                gfx.endFill();

                // 4. Top lit hemisphere
                gfx.beginFill(COLORS.pebbleHighlight, 0.80);
                gfx.drawEllipse(
                    px - r * 0.08,
                    py - r * 0.25,
                    r * 0.78,
                    r * 0.45,
                );
                gfx.endFill();

                // 5. Specular highlight
                gfx.beginFill(COLORS.pebbleSpecular, 0.70);
                gfx.drawCircle(px - r * 0.30, py - r * 0.38, r * 0.26);
                gfx.endFill();

                // 6. Catchlight (tiny brightest dot)
                gfx.beginFill(COLORS.pebbleSpecular, 1.0);
                gfx.drawCircle(px - r * 0.38, py - r * 0.45, r * 0.11);
                gfx.endFill();
            }
        }
    }
}

// ───────────────────────────────────────────────────────────────
// PATH HELPERS — linear interpolation per segment (orthogonal grid)
// ───────────────────────────────────────────────────────────────

/**
 * Linear interpolation between waypoints (multi-segment).
 * Każdy segment to prosta linia — dla orthogonal grid (H lub V).
 */
function interpolateLinearMulti(
    waypoints: Array<{ x: number; y: number }>,
    segmentsPerPair: number,
): Array<{ x: number; y: number }> {
    const result: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        for (let j = 0; j < segmentsPerPair; j++) {
            const t = j / segmentsPerPair;
            result.push({
                x: a.x * (1 - t) + b.x * t,
                y: a.y * (1 - t) + b.y * t,
            });
        }
    }
    result.push(waypoints[waypoints.length - 1]);
    return result;
}

/**
 * Offset path perpendicularly by N pixels. Dla wheel ruts.
 */
function offsetPath(
    points: Array<{ x: number; y: number }>,
    perpOffset: number,
): Array<{ x: number; y: number }> {
    const result: Array<{ x: number; y: number }> = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(n - 1, i + 1)];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        result.push({
            x: points[i].x + nx * perpOffset,
            y: points[i].y + ny * perpOffset,
        });
    }
    return result;
}

/**
 * Draw smooth path as thick stroke with BUTT caps (proste końce).
 */
function drawPathStroke(
    gfx: PIXI.Graphics,
    points: Array<{ x: number; y: number }>,
    width: number,
    color: number,
    alpha: number,
): void {
    gfx.lineStyle({
        width,
        color,
        alpha,
        cap: PIXI.LINE_CAP.BUTT,
        join: PIXI.LINE_JOIN.ROUND,
    });
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        gfx.lineTo(points[i].x, points[i].y);
    }
}

function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}