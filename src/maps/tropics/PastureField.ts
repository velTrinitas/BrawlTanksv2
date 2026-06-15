import * as PIXI from 'pixi.js';
import type { IFarmField } from './IFarmField';

/**
 * v0.36.0 FAZA T7.1 — PASTURE FIELD (pastwisko z jeżdżącym traktorem)
 *
 * Lush green grass carpet + AAA premium tractor który slowly kosi trawę.
 *
 * MECHANIKA:
 *   1. Brak stealth + brak kolizji (visual only)
 *   2. Trawa: dense procedural grass blades z wave wind (szumiąca trawka)
 *   3. Tractor (non-collidable, AAA detail):
 *      - Cabin z szybą + roof + lights + badge
 *      - Engine hood + exhaust pipe z animowanym dymem
 *      - 4 wheels (przód małe, tył duże) z visible bieżnikiem
 *      - Mowing deck z 3 obrotowymi tarczami (rotation animation)
 *   4. Pattern koszenia: L→R, drop lane, R→L, drop, ... aż pokryje pole
 *   5. Trail za traktorem: lighter green stripe (skoszona trawa)
 *   6. Stop permanent po skończeniu (Mariusz spec)
 */

const COLORS = {
    // Trawa (lush green carpet)
    grassDark:      0x2a5a18,
    grassMid:       0x4a8028,    // dominant lush green
    grassLight:     0x70b048,    // jasny highlight
    grassBright:    0xa8d870,    // tip highlights
    grassDeep:      0x1a3a10,    // outline / deep shadow
    // Mowed trail (skoszona trawa — lighter, more yellow-green)
    mowedDark:      0x4a6020,
    mowedMid:       0x88a850,    // lighter than active grass
    mowedLight:     0xb0d070,
    // Wildflowers (mały visual flair)
    flowerWhite:    0xfff8e0,
    flowerYellow:   0xffd848,
    flowerPink:     0xff80a0,
    flowerCenter:   0xc88820,
    // Soil hints (brown edges where grass thins)
    soilHint:       0x6a4830,
} as const;

interface GrassBlade {
    gfx: PIXI.Graphics;
    baseX: number;
    baseY: number;
    phaseOffset: number;
    baseSwayAmp: number;
    mowed: boolean;          // true gdy traktor już przejechał
    cellX: number;           // ID komórki w mowed track grid
    cellY: number;
}

function makeRng(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

// ═══════════════════════════════════════════════════════════════
// TRACTOR — AAA PREMIUM ENTITY (top-down view)
// ═══════════════════════════════════════════════════════════════

interface MowingPathState {
    state: 'mowing' | 'drop-down' | 'stopped';
    laneIndex: number;
    lanesTotal: number;
    direction: 1 | -1;        // 1 = E, -1 = W
    laneY: number;             // Y dla current lane (center)
    dropTargetY: number;       // Y do którego dropuje
}

const TRACTOR_BODY_W = 28;
const TRACTOR_BODY_L = 54;
const MOWING_DECK_W = 40;
const MOWING_DECK_L = 14;
const TRACTOR_SPEED = 1.0;        // px/frame slow majestic
const LANE_DROP_SPEED = 0.6;
const MOWED_LANE_WIDTH = 44;      // = mowing deck width + tiny overlap

class Tractor {
    public container: PIXI.Container;
    public x: number;
    public y: number;
    public heading: number = 0;        // 0 = facing E (right)

    private wheelsContainer: PIXI.Container;
    private wheelRotations: PIXI.Graphics[] = [];
    private mowingDiscsContainer: PIXI.Container;
    private mowingDiscs: PIXI.Graphics[] = [];
    private exhaustContainer: PIXI.Container;
    private smokeParticles: { gfx: PIXI.Graphics; life: number; maxLife: number; vx: number; vy: number }[] = [];
    private time: number = 0;
    private smokeTimer: number = 0;

    public state: MowingPathState;

    constructor(startX: number, startY: number, lanesTotal: number, parentContainer: PIXI.Container) {
        this.x = startX;
        this.y = startY;

        this.container = new PIXI.Container();
        this.container.zIndex = 1100;  // wysoki — nad grass blades (ale pod windmill blades 1200)
        parentContainer.addChild(this.container);

        this.state = {
            state: 'mowing',
            laneIndex: 0,
            lanesTotal,
            direction: 1,
            laneY: startY,
            dropTargetY: startY,
        };

        // Containers per anim layer
        this.exhaustContainer = new PIXI.Container();
        this.container.addChild(this.exhaustContainer);

        const bodyContainer = new PIXI.Container();
        this.container.addChild(bodyContainer);
        this.drawShadow(bodyContainer);
        this.drawMowingDeck(bodyContainer);

        this.mowingDiscsContainer = new PIXI.Container();
        bodyContainer.addChild(this.mowingDiscsContainer);
        this.spawnMowingDiscs();

        this.wheelsContainer = new PIXI.Container();
        bodyContainer.addChild(this.wheelsContainer);
        this.spawnWheels();

        this.drawBody(bodyContainer);
        this.drawCabin(bodyContainer);
        this.drawDetails(bodyContainer);

        this.container.x = startX;
        this.container.y = startY;
    }

    // ─── DRAWING METHODS ───

    private drawShadow(g: PIXI.Container): void {
        const sh = new PIXI.Graphics();
        sh.beginFill(0x000000, 0.30);
        sh.drawRoundedRect(-TRACTOR_BODY_W / 2 + 3, -TRACTOR_BODY_L / 2 + 4, TRACTOR_BODY_W + 4, TRACTOR_BODY_L + 6, 8);
        sh.endFill();
        g.addChild(sh);
    }

    private drawMowingDeck(g: PIXI.Container): void {
        const deck = new PIXI.Graphics();
        const dY = -TRACTOR_BODY_L / 2 - MOWING_DECK_L + 2;  // front of tractor
        // Deck base (dark gray)
        deck.beginFill(0x3a3a40, 1);
        deck.drawRoundedRect(-MOWING_DECK_W / 2, dY, MOWING_DECK_W, MOWING_DECK_L, 4);
        deck.endFill();
        // Highlight top edge
        deck.beginFill(0x6a6a70, 0.55);
        deck.drawRoundedRect(-MOWING_DECK_W / 2 + 1, dY + 1, MOWING_DECK_W - 2, 3, 3);
        deck.endFill();
        // Deep shadow bottom edge
        deck.beginFill(0x1a1a20, 0.7);
        deck.drawRoundedRect(-MOWING_DECK_W / 2 + 1, dY + MOWING_DECK_L - 4, MOWING_DECK_W - 2, 3, 3);
        deck.endFill();
        // Outline
        deck.lineStyle(1.4, 0x0a0a14, 0.95);
        deck.drawRoundedRect(-MOWING_DECK_W / 2, dY, MOWING_DECK_W, MOWING_DECK_L, 4);
        deck.lineStyle(0);
        g.addChild(deck);
    }

    private spawnMowingDiscs(): void {
        // 3 rotating discs pod mowing deck
        const dY = -TRACTOR_BODY_L / 2 - MOWING_DECK_L / 2 + 1;
        for (let i = 0; i < 3; i++) {
            const dX = (i - 1) * 13;
            const disc = new PIXI.Graphics();
            // Disc base
            disc.beginFill(0x6a6a6a, 1);
            disc.drawCircle(0, 0, 5);
            disc.endFill();
            disc.beginFill(0x4a4a4a, 1);
            disc.drawCircle(0, 0, 4.2);
            disc.endFill();
            // 3 blades on disc (Y-shape)
            for (let b = 0; b < 3; b++) {
                const a = (b / 3) * Math.PI * 2;
                disc.lineStyle(2.5, 0x9090a0, 0.95);
                disc.moveTo(0, 0);
                disc.lineTo(Math.cos(a) * 4, Math.sin(a) * 4);
                disc.lineStyle(0);
            }
            // Center hub
            disc.beginFill(0x202020, 1);
            disc.drawCircle(0, 0, 1.2);
            disc.endFill();
            disc.beginFill(0xa0a0a0, 0.9);
            disc.drawCircle(-0.3, -0.3, 0.5);
            disc.endFill();
            disc.x = dX;
            disc.y = dY;
            this.mowingDiscsContainer.addChild(disc);
            this.mowingDiscs.push(disc);
        }
    }

    private spawnWheels(): void {
        // 2 front (small) + 2 rear (large)
        const wheels = [
            { x: -TRACTOR_BODY_W / 2 + 1,  y: -TRACTOR_BODY_L * 0.28, r: 5.5, isRear: false },  // FL
            { x:  TRACTOR_BODY_W / 2 - 1,  y: -TRACTOR_BODY_L * 0.28, r: 5.5, isRear: false },  // FR
            { x: -TRACTOR_BODY_W / 2 - 2,  y:  TRACTOR_BODY_L * 0.30, r: 8.5, isRear: true  },  // RL
            { x:  TRACTOR_BODY_W / 2 + 2,  y:  TRACTOR_BODY_L * 0.30, r: 8.5, isRear: true  },  // RR
        ];
        for (const w of wheels) {
            const wheelG = new PIXI.Graphics();
            // Outer tire (czarny)
            wheelG.beginFill(0x1a1a1a, 1);
            wheelG.drawCircle(0, 0, w.r);
            wheelG.endFill();
            // Tire highlight
            wheelG.beginFill(0x3a3a3a, 0.85);
            wheelG.drawCircle(-w.r * 0.25, -w.r * 0.25, w.r * 0.55);
            wheelG.endFill();
            // Rim (jasny szary)
            wheelG.beginFill(0x6a6a6a, 1);
            wheelG.drawCircle(0, 0, w.r * 0.55);
            wheelG.endFill();
            wheelG.beginFill(0x4a4a4a, 1);
            wheelG.drawCircle(0, 0, w.r * 0.45);
            wheelG.endFill();
            // Bieżnik (3 lines radial dla "rotating" feel)
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                wheelG.lineStyle(1.2, 0x3a3a3a, 0.85);
                wheelG.moveTo(Math.cos(a) * (w.r * 0.65), Math.sin(a) * (w.r * 0.65));
                wheelG.lineTo(Math.cos(a) * (w.r * 0.95), Math.sin(a) * (w.r * 0.95));
                wheelG.lineStyle(0);
            }
            // Hub center
            wheelG.beginFill(0x2a2a2a, 1);
            wheelG.drawCircle(0, 0, w.r * 0.20);
            wheelG.endFill();
            wheelG.beginFill(0x8a8a8a, 0.9);
            wheelG.drawCircle(-0.3, -0.3, w.r * 0.12);
            wheelG.endFill();
            // Outline
            wheelG.lineStyle(1.3, 0x000000, 0.95);
            wheelG.drawCircle(0, 0, w.r);
            wheelG.lineStyle(0);

            wheelG.x = w.x;
            wheelG.y = w.y;
            this.wheelsContainer.addChild(wheelG);
            this.wheelRotations.push(wheelG);
        }
    }

    private drawBody(g: PIXI.Container): void {
        const body = new PIXI.Graphics();
        // Main body (tractor green - John Deere-ish but original)
        body.beginFill(0x4a8030, 1);
        body.drawRoundedRect(-TRACTOR_BODY_W / 2, -TRACTOR_BODY_L / 2, TRACTOR_BODY_W, TRACTOR_BODY_L, 6);
        body.endFill();
        // Lighter gradient top half (sunlit hood)
        body.beginFill(0x70a850, 0.4);
        body.drawRoundedRect(-TRACTOR_BODY_W / 2 + 1, -TRACTOR_BODY_L / 2 + 1, TRACTOR_BODY_W - 2, TRACTOR_BODY_L * 0.45, 5);
        body.endFill();
        // Darker bottom (shadow side, behind cabin)
        body.beginFill(0x2a5020, 0.55);
        body.drawRoundedRect(-TRACTOR_BODY_W / 2 + 1, 0, TRACTOR_BODY_W - 2, TRACTOR_BODY_L / 2 - 2, 5);
        body.endFill();

        // Hood/engine block visible (front section, brighter)
        body.beginFill(0x60a040, 1);
        body.drawRoundedRect(-TRACTOR_BODY_W / 2 + 2, -TRACTOR_BODY_L / 2 + 2, TRACTOR_BODY_W - 4, TRACTOR_BODY_L * 0.35, 4);
        body.endFill();
        // Hood vents (3 short horizontal lines)
        for (let i = 0; i < 3; i++) {
            body.lineStyle(1, 0x2a5018, 0.85);
            const vy = -TRACTOR_BODY_L / 2 + 6 + i * 4;
            body.moveTo(-TRACTOR_BODY_W / 2 + 4, vy);
            body.lineTo(TRACTOR_BODY_W / 2 - 4, vy);
            body.lineStyle(0);
        }
        // Hood badge (yellow square z logo hint)
        body.beginFill(0xffd848, 1);
        body.drawRoundedRect(-3, -TRACTOR_BODY_L / 2 + 11, 6, 5, 1);
        body.endFill();
        body.lineStyle(0.7, 0x8a6020, 0.95);
        body.drawRoundedRect(-3, -TRACTOR_BODY_L / 2 + 11, 6, 5, 1);
        body.lineStyle(0);

        // Outline body
        body.lineStyle(1.6, 0x1a3010, 0.95);
        body.drawRoundedRect(-TRACTOR_BODY_W / 2, -TRACTOR_BODY_L / 2, TRACTOR_BODY_W, TRACTOR_BODY_L, 6);
        body.lineStyle(0);

        g.addChild(body);
    }

    private drawCabin(g: PIXI.Container): void {
        const cab = new PIXI.Graphics();
        const cabW = TRACTOR_BODY_W - 4;
        const cabL = 22;
        const cabY = TRACTOR_BODY_L / 2 - cabL - 4;

        // Cabin walls (greenish)
        cab.beginFill(0x3a6028, 1);
        cab.drawRoundedRect(-cabW / 2, cabY, cabW, cabL, 4);
        cab.endFill();

        // Front windshield (large glass area facing direction)
        cab.beginFill(0x8ac8e0, 0.75);
        cab.drawRoundedRect(-cabW / 2 + 2, cabY + 1, cabW - 4, 8, 3);
        cab.endFill();
        // Glass highlight (diagonal shine)
        cab.beginFill(0xc0e0f0, 0.5);
        cab.drawPolygon([
            -cabW / 2 + 3, cabY + 2,
            -cabW / 2 + 7, cabY + 2,
            -cabW / 2 + 9, cabY + 8,
            -cabW / 2 + 5, cabY + 8,
        ]);
        cab.endFill();

        // Side windows (mniejsze, na bokach cabin)
        cab.beginFill(0x6aa8c0, 0.65);
        cab.drawRect(-cabW / 2 + 1, cabY + 11, 3, cabL - 14);
        cab.drawRect(cabW / 2 - 4, cabY + 11, 3, cabL - 14);
        cab.endFill();

        // Roof (visible from above — flat green panel z outline)
        cab.beginFill(0x2a5020, 1);
        cab.drawRoundedRect(-cabW / 2 + 1, cabY + cabL - 8, cabW - 2, 7, 2);
        cab.endFill();
        // Roof highlight strip
        cab.beginFill(0x5a8838, 0.55);
        cab.drawRect(-cabW / 2 + 3, cabY + cabL - 7, cabW - 6, 1.5);
        cab.endFill();

        // Cabin outline
        cab.lineStyle(1.4, 0x1a3010, 0.95);
        cab.drawRoundedRect(-cabW / 2, cabY, cabW, cabL, 4);
        cab.lineStyle(0);

        // Headlights (2 białe okrągłe, front facing)
        cab.beginFill(0xfff8c0, 1);
        cab.drawCircle(-cabW / 2 + 3, cabY - 1, 2);
        cab.drawCircle(cabW / 2 - 3, cabY - 1, 2);
        cab.endFill();
        // Light glow
        cab.beginFill(0xffffff, 0.7);
        cab.drawCircle(-cabW / 2 + 3, cabY - 1, 1.2);
        cab.drawCircle(cabW / 2 - 3, cabY - 1, 1.2);
        cab.endFill();
        // Light outline (chrome ring)
        cab.lineStyle(0.7, 0x8a8a40, 0.95);
        cab.drawCircle(-cabW / 2 + 3, cabY - 1, 2);
        cab.drawCircle(cabW / 2 - 3, cabY - 1, 2);
        cab.lineStyle(0);

        g.addChild(cab);
    }

    private drawDetails(g: PIXI.Container): void {
        const det = new PIXI.Graphics();

        // Exhaust pipe (czarny pionowy cylinder na rear-left of hood)
        const exX = -TRACTOR_BODY_W / 2 + 5;
        const exY = -TRACTOR_BODY_L / 2 + 18;
        det.beginFill(0x1a1a1a, 1);
        det.drawRoundedRect(exX - 2, exY - 3, 4, 8, 1);
        det.endFill();
        det.beginFill(0x4a4a4a, 0.8);
        det.drawRect(exX - 1.5, exY - 3, 1, 8);
        det.endFill();
        det.beginFill(0x2a2a2a, 1);
        det.drawCircle(exX, exY - 3.5, 2.2);
        det.endFill();
        det.beginFill(0x000000, 1);
        det.drawCircle(exX, exY - 3.5, 1.4);
        det.endFill();

        // Side mirrors (2 small dots na bokach cabin)
        const cabY = TRACTOR_BODY_L / 2 - 26;
        det.beginFill(0x2a4018, 1);
        det.drawRoundedRect(-TRACTOR_BODY_W / 2, cabY, 2, 2.5, 1);
        det.drawRoundedRect(TRACTOR_BODY_W / 2 - 2, cabY, 2, 2.5, 1);
        det.endFill();
        det.beginFill(0x8ac8e0, 0.85);
        det.drawRect(-TRACTOR_BODY_W / 2 + 0.3, cabY + 0.3, 1.4, 1.8);
        det.drawRect(TRACTOR_BODY_W / 2 - 1.7, cabY + 0.3, 1.4, 1.8);
        det.endFill();

        // Antenna (cienka linia z tip dot)
        det.lineStyle(0.8, 0x1a1a1a, 0.95);
        det.moveTo(TRACTOR_BODY_W / 2 - 4, cabY + 5);
        det.lineTo(TRACTOR_BODY_W / 2 - 4, cabY - 2);
        det.lineStyle(0);
        det.beginFill(0xff4444, 1);
        det.drawCircle(TRACTOR_BODY_W / 2 - 4, cabY - 2, 0.8);
        det.endFill();

        // Hood badge text hint (just colored stripe)
        // Already drawn w drawBody

        g.addChild(det);

        // Exhaust storage point (for smoke spawn position dynamic)
        // Stored as instance values
        (this as any)._exhaustX = exX;
        (this as any)._exhaustY = exY - 4;
    }

    // ─── UPDATE: animacja + pathing ───

    public update(): { didMove: boolean; deltaX: number; deltaY: number } {
        this.time += 1 / 60;

        const prevX = this.x;
        const prevY = this.y;

        // ── 1. Pathing state machine ──
        const s = this.state;
        let didMove = false;

        if (s.state === 'mowing') {
            this.x += TRACTOR_SPEED * s.direction;
            didMove = true;
        } else if (s.state === 'drop-down') {
            this.y += LANE_DROP_SPEED;
            didMove = true;
            if (this.y >= s.dropTargetY) {
                this.y = s.dropTargetY;
                s.state = 'mowing';
                s.laneY = s.dropTargetY;
            }
        } else if (s.state === 'stopped') {
            // No movement, but keep animations running
        }

        // ── 2. Wheel rotation (subtle visual) ──
        const wheelSpeed = (s.state === 'stopped') ? 0 : 0.18;
        for (const w of this.wheelRotations) {
            w.rotation += wheelSpeed * s.direction;
        }

        // ── 3. Mowing discs rotation (fast spin gdy mowing) ──
        const discSpeed = (s.state === 'stopped') ? 0 : 0.42;
        for (const d of this.mowingDiscs) {
            d.rotation += discSpeed;
        }

        // ── 4. Exhaust smoke spawn (constantly while moving) ──
        this.smokeTimer += 1 / 60;
        const smokeInterval = (s.state === 'stopped') ? 0.6 : 0.18;
        if (this.smokeTimer >= smokeInterval) {
            this.smokeTimer = 0;
            this.spawnSmokeParticle();
        }

        // ── 5. Update existing smoke particles ──
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.life -= 1 / 60;
            if (p.life <= 0) {
                this.exhaustContainer.removeChild(p.gfx);
                p.gfx.destroy();
                this.smokeParticles.splice(i, 1);
                continue;
            }
            p.gfx.y += p.vy;
            p.gfx.x += p.vx;
            const t = p.life / p.maxLife;
            p.gfx.alpha = t * 0.6;
            p.gfx.scale.set(1 + (1 - t) * 1.8);
        }

        // ── 6. Position update na container ──
        this.container.x = this.x;
        this.container.y = this.y;
        // Tractor rotates do heading (mowing E = 0, W = PI)
        const targetHeading = (s.direction === 1) ? Math.PI / 2 : -Math.PI / 2;
        // Smooth heading transition (lerp)
        let dRot = targetHeading - this.heading;
        while (dRot > Math.PI) dRot -= Math.PI * 2;
        while (dRot < -Math.PI) dRot += Math.PI * 2;
        this.heading += dRot * 0.08;  // 8% per frame ease
        this.container.rotation = this.heading;

        return {
            didMove,
            deltaX: this.x - prevX,
            deltaY: this.y - prevY,
        };
    }

    private spawnSmokeParticle(): void {
        const g = new PIXI.Graphics();
        const radius = 1.5 + Math.random() * 1.5;
        const shade = 0x707080 + (Math.floor(Math.random() * 0x10) * 0x101010);
        g.beginFill(shade & 0xffffff, 0.7);
        g.drawCircle(0, 0, radius);
        g.endFill();
        // Local position (relative do tractor) — exhaust pipe top
        g.x = (this as any)._exhaustX || -TRACTOR_BODY_W / 2 + 5;
        g.y = (this as any)._exhaustY || -TRACTOR_BODY_L / 2 + 14;
        this.exhaustContainer.addChild(g);
        this.smokeParticles.push({
            gfx: g,
            life: 1.2 + Math.random() * 0.6,
            maxLife: 1.2,
            vx: (Math.random() - 0.5) * 0.3,
            vy: -0.6 - Math.random() * 0.4,
        });
    }

    public advanceToNextLane(pastureRightX: number, pastureLeftX: number, laneHeight: number): boolean {
        // Wywoływane gdy tractor reached lane end
        const s = this.state;
        if (s.state !== 'mowing') return false;

        // Check if traktor reached lane end
        const reachedRight = s.direction === 1 && this.x >= pastureRightX;
        const reachedLeft = s.direction === -1 && this.x <= pastureLeftX;

        if (!reachedRight && !reachedLeft) return false;

        // Check if more lanes available
        if (s.laneIndex + 1 >= s.lanesTotal) {
            // Last lane completed — STOP permanent
            s.state = 'stopped';
            return true;  // signal "finished"
        }

        // Start drop-down to next lane
        s.laneIndex++;
        s.dropTargetY = s.laneY + laneHeight;
        s.direction = (s.direction === 1) ? -1 : 1;
        s.state = 'drop-down';
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// PASTURE FIELD
// ═══════════════════════════════════════════════════════════════

export class PastureField implements IFarmField {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private groundContainer: PIXI.Container;
    private mowedTrackContainer: PIXI.Container;
    private mowedTrackGfx: PIXI.Graphics;
    private grassContainer: PIXI.Container;
    private tractor: Tractor;
    private mowedGrid: boolean[][] = [];  // [col][row] = mowed?
    private gridCellSize: number = 12;     // 12px grid
    private gridCols: number;
    private gridRows: number;
    private time: number = 0;
    private blades: GrassBlade[] = [];

    constructor(
        x: number, y: number,
        w: number, h: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        this.gridCols = Math.ceil(w / this.gridCellSize);
        this.gridRows = Math.ceil(h / this.gridCellSize);
        this.mowedGrid = Array.from({ length: this.gridCols }, () => Array(this.gridRows).fill(false));

        const rng = makeRng(seed);

        // Ground layer
        this.groundContainer = new PIXI.Container();
        this.groundContainer.zIndex = -80;
        worldContainer.addChild(this.groundContainer);
        this.drawGround(rng);

        // Mowed track overlay (between ground i grass blades)
        this.mowedTrackContainer = new PIXI.Container();
        this.mowedTrackContainer.zIndex = -78;
        this.mowedTrackGfx = new PIXI.Graphics();
        this.mowedTrackContainer.addChild(this.mowedTrackGfx);
        worldContainer.addChild(this.mowedTrackContainer);

        // Grass blades (with Y-sort)
        this.grassContainer = new PIXI.Container();
        worldContainer.addChild(this.grassContainer);
        this.spawnGrassBlades(rng);
        this.spawnWildflowers(rng);

        // ── Tractor spawn — start NW corner of pasture ──
        const tractorStartX = x + 30;             // 30px from left edge
        const startLaneY = y + MOWED_LANE_WIDTH / 2;  // first lane center
        const lanesTotal = Math.ceil(h / MOWED_LANE_WIDTH);  // total mowing lanes
        this.tractor = new Tractor(tractorStartX, startLaneY, lanesTotal, worldContainer);
        // Track lane Y w state
        this.tractor.state.laneY = startLaneY;
    }

    // ═══════════════════════════════════════════════════════════
    // GROUND — base lush green carpet
    // ═══════════════════════════════════════════════════════════
    private drawGround(rng: () => number): void {
        const g = new PIXI.Graphics();
        const RADIUS = 18;

        // Drop shadow
        g.beginFill(0x000000, 0.12);
        g.drawRoundedRect(this.x + 6, this.y + 8, this.w, this.h, RADIUS);
        g.endFill();

        // Base lush green
        g.beginFill(COLORS.grassMid, 0.95);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);
        g.endFill();

        // Bright highlight patches
        g.beginFill(COLORS.grassLight, 0.35);
        for (let i = 0; i < 60; i++) {
            const rx = this.x + rng() * this.w;
            const ry = this.y + rng() * this.h;
            g.drawCircle(rx, ry, 3 + rng() * 6);
        }
        g.endFill();

        // Dark patches (subtle shadows)
        g.beginFill(COLORS.grassDark, 0.30);
        for (let i = 0; i < 40; i++) {
            const rx = this.x + rng() * this.w;
            const ry = this.y + rng() * this.h;
            g.drawCircle(rx, ry, 2 + rng() * 4);
        }
        g.endFill();

        // Small brown patches (worn spots)
        g.beginFill(COLORS.soilHint, 0.20);
        for (let i = 0; i < 12; i++) {
            const rx = this.x + 20 + rng() * (this.w - 40);
            const ry = this.y + 20 + rng() * (this.h - 40);
            g.drawEllipse(rx, ry, 4 + rng() * 6, 2 + rng() * 3);
        }
        g.endFill();

        // Outline
        g.lineStyle(2, COLORS.grassDeep, 0.6);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);

        this.groundContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // GRASS BLADES — dense procedural blades z wind sway
    // ═══════════════════════════════════════════════════════════
    private spawnGrassBlades(rng: () => number): void {
        // Density: ~500 blades per 100000 px²
        const BLADE_COUNT = Math.floor((this.w * this.h) / 200);
        const inset = 8;

        for (let i = 0; i < BLADE_COUNT; i++) {
            const px = this.x + inset + rng() * (this.w - inset * 2);
            const py = this.y + inset + rng() * (this.h - inset * 2);

            const g = new PIXI.Graphics();
            const bladeCount = 3 + Math.floor(rng() * 3);  // 3-5 blades per tuft
            for (let b = 0; b < bladeCount; b++) {
                const bx = (rng() - 0.5) * 5;
                const h = 4 + rng() * 5;
                const tilt = (rng() - 0.5) * 0.5;
                const col = rng() < 0.3 ? COLORS.grassBright : (rng() < 0.6 ? COLORS.grassLight : COLORS.grassMid);
                g.lineStyle(1.3, col, 0.92);
                g.moveTo(bx, 0);
                g.lineTo(bx + Math.sin(tilt) * h, -Math.cos(tilt) * h);
            }
            // Tip highlight (jaśniejszy mid-tip)
            g.lineStyle(0.7, COLORS.grassBright, 0.6);
            for (let b = 0; b < bladeCount; b++) {
                const bx = (rng() - 0.5) * 5;
                const h = 4 + rng() * 3;
                g.moveTo(bx, -h * 0.4);
                g.lineTo(bx + 0.5, -h);
            }
            g.lineStyle(0);

            g.x = px;
            g.y = py;
            g.zIndex = Math.floor(py);

            this.grassContainer.addChild(g);

            this.blades.push({
                gfx: g,
                baseX: px,
                baseY: py,
                phaseOffset: (px * 0.015 + py * 0.025),
                baseSwayAmp: 0.04 + rng() * 0.04,
                mowed: false,
                cellX: Math.floor((px - this.x) / this.gridCellSize),
                cellY: Math.floor((py - this.y) / this.gridCellSize),
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // WILDFLOWERS — visual flair
    // ═══════════════════════════════════════════════════════════
    private spawnWildflowers(rng: () => number): void {
        const FLOWER_COUNT = Math.floor((this.w * this.h) / 3500);
        for (let i = 0; i < FLOWER_COUNT; i++) {
            const px = this.x + 12 + rng() * (this.w - 24);
            const py = this.y + 12 + rng() * (this.h - 24);

            const g = new PIXI.Graphics();
            const colorChoice = rng();
            const flowerColor = colorChoice < 0.45 ? COLORS.flowerWhite
                              : colorChoice < 0.8 ? COLORS.flowerYellow
                              : COLORS.flowerPink;

            // 5 petals
            for (let p = 0; p < 5; p++) {
                const a = (p / 5) * Math.PI * 2;
                g.beginFill(flowerColor, 0.95);
                g.drawEllipse(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 1.4, 0.9);
                g.endFill();
            }
            // Center
            g.beginFill(COLORS.flowerCenter, 1);
            g.drawCircle(0, 0, 0.9);
            g.endFill();
            g.x = px;
            g.y = py;
            g.zIndex = Math.floor(py) - 1;
            this.grassContainer.addChild(g);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — grass wind + tractor + mowed track
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;

        // ── Wind sway dla non-mowed grass ──
        for (const b of this.blades) {
            if (b.mowed) continue;
            const wave = Math.sin(this.time * 1.5 + b.phaseOffset) * b.baseSwayAmp;
            b.gfx.skew.x = wave;
        }

        // ── Tractor update + lane advance ──
        const result = this.tractor.update();
        if (result.didMove) {
            this.applyMowedTrack();
            // Check if tractor reached lane end
            const finished = this.tractor.advanceToNextLane(
                this.x + this.w - 30,           // right edge (mowing within field)
                this.x + 30,                     // left edge
                MOWED_LANE_WIDTH,                // lane height
            );
            if (finished) {
                // Tractor permanent stop (state already set to 'stopped' inside advanceToNextLane)
            }
        }
    }

    /**
     * Marks grid cells around tractor as mowed, hides grass blades, draws mowed strip overlay.
     */
    private applyMowedTrack(): void {
        const cx = this.tractor.x;
        const cy = this.tractor.y;
        // Mark cells in mowing deck area (uses MOWED_LANE_WIDTH around tractor)
        const halfLane = MOWED_LANE_WIDTH / 2;
        const cellSize = this.gridCellSize;

        const minCol = Math.floor((cx - halfLane - this.x) / cellSize);
        const maxCol = Math.floor((cx + halfLane - this.x) / cellSize);
        const minRow = Math.floor((cy - halfLane - this.y) / cellSize);
        const maxRow = Math.floor((cy + halfLane - this.y) / cellSize);

        for (let col = Math.max(0, minCol); col <= Math.min(this.gridCols - 1, maxCol); col++) {
            for (let row = Math.max(0, minRow); row <= Math.min(this.gridRows - 1, maxRow); row++) {
                if (!this.mowedGrid[col][row]) {
                    this.mowedGrid[col][row] = true;
                    // Draw mowed cell on overlay
                    const px = this.x + col * cellSize;
                    const py = this.y + row * cellSize;
                    this.mowedTrackGfx.beginFill(COLORS.mowedMid, 0.85);
                    this.mowedTrackGfx.drawRect(px, py, cellSize, cellSize);
                    this.mowedTrackGfx.endFill();
                    // Subtle stripe pattern (mowing lines)
                    this.mowedTrackGfx.lineStyle(0.5, COLORS.mowedDark, 0.55);
                    this.mowedTrackGfx.moveTo(px, py + cellSize / 2);
                    this.mowedTrackGfx.lineTo(px + cellSize, py + cellSize / 2);
                    this.mowedTrackGfx.lineStyle(0);
                }
            }
        }

        // Hide grass blades in mowed cells
        for (const b of this.blades) {
            if (b.mowed) continue;
            if (this.mowedGrid[b.cellX]?.[b.cellY]) {
                b.mowed = true;
                b.gfx.visible = false;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PASTURE: no stealth, no tank interaction
    // ═══════════════════════════════════════════════════════════
    public isPointInside(_px: number, _py: number): boolean {
        return false;
    }

    public onTankEnter(_tankX: number, _tankY: number): void {
        // No interaction (player przejeżdza bez kolizji + no stealth)
    }
}