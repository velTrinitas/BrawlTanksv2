import * as PIXI from 'pixi.js';

/**
 * v0.39.0 FAZA T7.2 — PATROL TRACTOR (standalone NPC traktor patrolujący po drogach)
 *
 * Drugi traktor na mapie tropics (po Pasture mowing tractor). Reuse visual patterns
 * z Pasture Tractor (AAA premium: body + cabin + wheels + mowing discs + exhaust smoke).
 * Różnica: state machine NIE mowing — patrol waypoint navigation.
 *
 * Route: 4 junction waypoints (N + E + S + W) głównych dróg. Pause 3-5s na każdym
 * waypoint. Smooth heading lerp 6%. Auto-loop.
 *
 * Speed: 0.65 px/frame (wolniej od Pasture mowing 1.0 — ambient rolnik).
 *
 * Architektura:
 *   - Visual rendering: COPIED patterns z Pasture Tractor (no extraction yet — kept
 *     local for cleanliness, future refactor możliwy gdy 3+ tractors needed).
 *   - Waypoint navigation: own state machine ('driving' | 'pausing'), distance-based
 *     arrival detection.
 *   - NIE blokuje player (ambient NPC, no collision).
 *   - Dynamic Y-sort z player (zIndex = floor(y) + 50).
 */

const PATROL_SPEED = 0.65;        // px/frame — wolniej niż Pasture (1.0)
const ARRIVAL_THRESHOLD = 4;       // px od waypoint dla "arrived"
const HEADING_LERP = 0.06;         // smooth rotation per frame
const SMOKE_INTERVAL_DRIVE = 0.20; // s — częstotliwość smoke gdy jedzie
const SMOKE_INTERVAL_IDLE = 0.6;   // s — wolniej gdy pause
const WHEEL_SPEED = 0.18;           // wheel rotation per frame (driving)
const DISC_SPEED = 0.42;            // mowing disc spin per frame (driving)

// Kolory z Pasture Tractor (consistent visual identity)
const COLORS = {
    shadow:         0x000000,
    bodyGreen:      0x4a8030,
    bodyGreenDeep:  0x2a5018,
    bodyGreenLight: 0x6ab048,
    hoodYellow:     0xf8d040,
    cabinDark:      0x2a3818,
    cabinGlass:     0xb0d0e8,
    cabinHighlight: 0xe0f0ff,
    wheelBlack:     0x101010,
    wheelRim:       0x404040,
    wheelHub:       0x808080,
    mowingDeckDark: 0x2a2a2a,
    mowingDeckMid:  0x4a4a4a,
    discDark:       0x202020,
    discMid:        0x6a6a6a,
    exhaustBlack:   0x1a1a1a,
    exhaustChrome:  0x707070,
    smokeGray:      0x808080,
    headlightYellow:0xfff0a0,
    redTip:         0xe04020,
} as const;

interface Waypoint {
    x: number;
    y: number;
    pause?: number;     // sekund (0 = no pause)
}

interface SmokeParticle {
    gfx: PIXI.Graphics;
    life: number;
    maxLife: number;
    vx: number;
    vy: number;
}

type PatrolState = 'driving' | 'pausing';

export class PatrolTractor {
    public container: PIXI.Container;
    public x: number;
    public y: number;
    public heading: number = 0;

    private waypoints: Waypoint[];
    private currentWaypointIdx: number = 0;
    private state: PatrolState = 'driving';
    private pauseTimer: number = 0;

    // Visual containers
    private wheelsContainer: PIXI.Container;
    private wheelRotations: PIXI.Graphics[] = [];
    private mowingDiscsContainer: PIXI.Container;
    private mowingDiscs: PIXI.Graphics[] = [];
    private exhaustContainer: PIXI.Container;
    private smokeParticles: SmokeParticle[] = [];
    private smokeTimer: number = 0;
    private time: number = 0;

    constructor(waypoints: Waypoint[], worldContainer: PIXI.Container) {
        if (waypoints.length < 2) {
            throw new Error('PatrolTractor requires at least 2 waypoints');
        }
        this.waypoints = waypoints;

        // Start position = waypoint 0, target = waypoint 1
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;

        // Initial heading toward waypoint 1
        const dx = waypoints[1].x - waypoints[0].x;
        const dy = waypoints[1].y - waypoints[0].y;
        this.heading = Math.atan2(dy, dx) + Math.PI / 2;

        // After start, advance to "going from 0 to 1"
        this.currentWaypointIdx = 1;

        this.container = new PIXI.Container();
        worldContainer.addChild(this.container);

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

        // Initial position
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.rotation = this.heading;
        this.container.zIndex = Math.floor(this.y) + 50;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — waypoint navigation state machine
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;
        const isDriving = this.state === 'driving';

        if (isDriving) {
            const target = this.waypoints[this.currentWaypointIdx];
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < ARRIVAL_THRESHOLD) {
                // Arrived at waypoint
                this.x = target.x;
                this.y = target.y;

                if (target.pause && target.pause > 0) {
                    this.state = 'pausing';
                    this.pauseTimer = target.pause;
                } else {
                    this.advanceWaypoint();
                }
            } else {
                // Move toward target
                const moveAngle = Math.atan2(dy, dx);
                this.x += Math.cos(moveAngle) * PATROL_SPEED;
                this.y += Math.sin(moveAngle) * PATROL_SPEED;

                // Smooth heading rotation (sprite "up" = N, so add PI/2)
                const targetHeading = moveAngle + Math.PI / 2;
                this.lerpHeading(targetHeading);
            }
        } else if (this.state === 'pausing') {
            this.pauseTimer -= 1 / 60;
            if (this.pauseTimer <= 0) {
                this.advanceWaypoint();
                this.state = 'driving';
            }
        }

        // Wheel rotation (subtle visual — driving only)
        const wheelSpeed = isDriving ? WHEEL_SPEED : 0;
        for (const w of this.wheelRotations) {
            w.rotation += wheelSpeed;
        }

        // Mowing discs rotation (fast spin — driving only)
        const discSpeed = isDriving ? DISC_SPEED : 0;
        for (const d of this.mowingDiscs) {
            d.rotation += discSpeed;
        }

        // Exhaust smoke spawn
        this.smokeTimer += 1 / 60;
        const smokeInterval = isDriving ? SMOKE_INTERVAL_DRIVE : SMOKE_INTERVAL_IDLE;
        if (this.smokeTimer >= smokeInterval) {
            this.smokeTimer = 0;
            this.spawnSmokeParticle();
        }

        // Update existing smoke
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
            p.gfx.alpha = t * 0.55;
            p.gfx.scale.set(1 + (1 - t) * 1.8);
        }

        // Position + rotation update
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.rotation = this.heading;
        // Dynamic Y-sort z player (player ma zIndex = y + 50 też)
        this.container.zIndex = Math.floor(this.y) + 50;
    }

    private lerpHeading(target: number): void {
        let dRot = target - this.heading;
        while (dRot > Math.PI) dRot -= Math.PI * 2;
        while (dRot < -Math.PI) dRot += Math.PI * 2;
        this.heading += dRot * HEADING_LERP;
    }

    private advanceWaypoint(): void {
        this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.waypoints.length;
    }

    // ═══════════════════════════════════════════════════════════
    // VISUAL RENDERING (patterns z Pasture Tractor)
    // ═══════════════════════════════════════════════════════════

    private drawShadow(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();
        g.beginFill(COLORS.shadow, 0.32);
        g.drawEllipse(2, 30, 22, 8);
        g.endFill();
        g.beginFill(COLORS.shadow, 0.18);
        g.drawEllipse(2, 32, 28, 5);
        g.endFill();
        parent.addChild(g);
    }

    private drawMowingDeck(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();
        // Dark gray deck (smaller niż Pasture — patrol tractor lekko podniesiony)
        g.beginFill(COLORS.mowingDeckDark, 1);
        g.drawRoundedRect(-20, 16, 40, 12, 3);
        g.endFill();
        // Highlight strip
        g.beginFill(COLORS.mowingDeckMid, 0.85);
        g.drawRoundedRect(-19, 17, 38, 2, 2);
        g.endFill();
        // Shadow bottom edge
        g.beginFill(COLORS.shadow, 0.45);
        g.drawRoundedRect(-19, 25, 38, 2, 2);
        g.endFill();
        parent.addChild(g);
    }

    private spawnMowingDiscs(): void {
        for (let i = 0; i < 3; i++) {
            const x = -10 + i * 10;
            const disc = new PIXI.Graphics();
            // Dark ring outer
            disc.beginFill(COLORS.discDark, 1);
            disc.drawCircle(0, 0, 5);
            disc.endFill();
            // Mid gray body
            disc.beginFill(COLORS.discMid, 1);
            disc.drawCircle(0, 0, 4);
            disc.endFill();
            // Y-shaped blade pattern
            disc.lineStyle(1.6, COLORS.discDark, 1);
            for (let b = 0; b < 3; b++) {
                const a = (b / 3) * Math.PI * 2;
                disc.moveTo(0, 0);
                disc.lineTo(Math.cos(a) * 3.5, Math.sin(a) * 3.5);
            }
            disc.lineStyle(0);
            // Center hub catchlight
            disc.beginFill(0xffffff, 0.4);
            disc.drawCircle(0, 0, 0.8);
            disc.endFill();

            disc.x = x;
            disc.y = 22;
            this.mowingDiscsContainer.addChild(disc);
            this.mowingDiscs.push(disc);
        }
    }

    private spawnWheels(): void {
        // 4 wheels: 2 front (small) + 2 rear (large)
        const wheelDefs = [
            { x: -16, y: 8,  r: 5.5 },   // FL
            { x:  16, y: 8,  r: 5.5 },   // FR
            { x: -18, y: 22, r: 8.5 },   // RL
            { x:  18, y: 22, r: 8.5 },   // RR
        ];

        for (const w of wheelDefs) {
            const wheel = new PIXI.Graphics();
            // Tire (black outer)
            wheel.beginFill(COLORS.wheelBlack, 1);
            wheel.drawCircle(0, 0, w.r);
            wheel.endFill();
            // Highlight ring (sunlit edge)
            wheel.beginFill(0x303030, 0.8);
            wheel.drawCircle(-w.r * 0.15, -w.r * 0.15, w.r * 0.85);
            wheel.endFill();
            // Rim (dark gray)
            wheel.beginFill(COLORS.wheelRim, 1);
            wheel.drawCircle(0, 0, w.r * 0.65);
            wheel.endFill();
            // Inner hub (lighter gray)
            wheel.beginFill(COLORS.wheelHub, 1);
            wheel.drawCircle(0, 0, w.r * 0.40);
            wheel.endFill();
            // Bieżnik (8 radial lines)
            wheel.lineStyle(0.7, 0x404040, 0.7);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                wheel.moveTo(Math.cos(a) * w.r * 0.7, Math.sin(a) * w.r * 0.7);
                wheel.lineTo(Math.cos(a) * w.r * 0.95, Math.sin(a) * w.r * 0.95);
            }
            wheel.lineStyle(0);
            // Hub catchlight
            wheel.beginFill(0xffffff, 0.55);
            wheel.drawCircle(-w.r * 0.15, -w.r * 0.15, w.r * 0.15);
            wheel.endFill();
            // Outline
            wheel.lineStyle(0.7, 0x000000, 0.9);
            wheel.drawCircle(0, 0, w.r);
            wheel.lineStyle(0);

            wheel.x = w.x;
            wheel.y = w.y;
            this.wheelsContainer.addChild(wheel);
            this.wheelRotations.push(wheel);
        }
    }

    private drawBody(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();

        // Body outline / shadow
        g.beginFill(COLORS.bodyGreenDeep, 1);
        g.drawRoundedRect(-15, -25, 30, 50, 6);
        g.endFill();

        // Main body (tractor green)
        g.beginFill(COLORS.bodyGreen, 1);
        g.drawRoundedRect(-14, -24, 28, 48, 5);
        g.endFill();

        // Hood (front, brighter green sunlit)
        g.beginFill(COLORS.bodyGreenLight, 0.85);
        g.drawRoundedRect(-13, -23, 26, 18, 4);
        g.endFill();

        // Hood vents (3 horizontal lines)
        g.lineStyle(1, COLORS.bodyGreenDeep, 0.7);
        for (let i = 0; i < 3; i++) {
            const vy = -18 + i * 3;
            g.moveTo(-9, vy);
            g.lineTo(9, vy);
        }
        g.lineStyle(0);

        // Yellow badge na hood (klasyczny John Deere style)
        g.beginFill(COLORS.hoodYellow, 1);
        g.drawRoundedRect(-4, -15, 8, 5, 1.5);
        g.endFill();
        g.beginFill(0xb09020, 0.7);
        g.drawRoundedRect(-3.5, -10, 7, 1, 0.5);
        g.endFill();

        // Body shadow (bottom edge)
        g.beginFill(COLORS.bodyGreenDeep, 0.5);
        g.drawRoundedRect(-14, 15, 28, 9, 4);
        g.endFill();

        parent.addChild(g);
    }

    private drawCabin(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();

        // Cabin roof (dark green, top)
        g.beginFill(COLORS.cabinDark, 1);
        g.drawRoundedRect(-11, -2, 22, 16, 3);
        g.endFill();

        // Roof highlight strip
        g.beginFill(COLORS.bodyGreenLight, 0.55);
        g.drawRoundedRect(-10, -1, 20, 2, 2);
        g.endFill();

        // Front windshield (light blue glass)
        g.beginFill(COLORS.cabinGlass, 0.85);
        g.drawRoundedRect(-9, 0, 18, 7, 2);
        g.endFill();

        // Windshield diagonal shine (glass reflection)
        g.beginFill(COLORS.cabinHighlight, 0.65);
        g.moveTo(-8, 1);
        g.lineTo(-4, 1);
        g.lineTo(-7, 5);
        g.lineTo(-8, 5);
        g.closePath();
        g.endFill();

        // Side windows (left + right)
        g.beginFill(COLORS.cabinGlass, 0.75);
        g.drawRoundedRect(-11, 4, 3, 7, 1);
        g.drawRoundedRect(8, 4, 3, 7, 1);
        g.endFill();

        // Window outlines
        g.lineStyle(0.8, COLORS.cabinDark, 0.85);
        g.drawRoundedRect(-9, 0, 18, 7, 2);
        g.drawRoundedRect(-11, 4, 3, 7, 1);
        g.drawRoundedRect(8, 4, 3, 7, 1);
        g.lineStyle(0);

        parent.addChild(g);
    }

    private drawDetails(parent: PIXI.Container): void {
        const g = new PIXI.Graphics();

        // Exhaust pipe (front-left)
        g.beginFill(COLORS.exhaustBlack, 1);
        g.drawRoundedRect(-12, -22, 2.5, 8, 1);
        g.endFill();
        // Chrome ring
        g.beginFill(COLORS.exhaustChrome, 1);
        g.drawRoundedRect(-12.5, -23, 3.5, 1.5, 0.5);
        g.endFill();
        // Center hole (dark)
        g.beginFill(0x000000, 0.85);
        g.drawCircle(-10.75, -22.2, 0.6);
        g.endFill();

        // Headlights ×2 (front)
        g.beginFill(0xffffff, 1);
        g.drawCircle(-9, -20, 1.6);
        g.drawCircle(9, -20, 1.6);
        g.endFill();
        // Chrome rings
        g.lineStyle(0.6, 0x808080, 0.85);
        g.drawCircle(-9, -20, 1.6);
        g.drawCircle(9, -20, 1.6);
        g.lineStyle(0);
        // Yellow glow centers
        g.beginFill(COLORS.headlightYellow, 0.85);
        g.drawCircle(-9, -20, 1.0);
        g.drawCircle(9, -20, 1.0);
        g.endFill();

        // Side mirrors ×2
        g.beginFill(COLORS.cabinDark, 1);
        g.drawRoundedRect(-12.5, 1, 1.5, 2.5, 0.5);
        g.drawRoundedRect(11, 1, 1.5, 2.5, 0.5);
        g.endFill();
        g.beginFill(COLORS.cabinGlass, 0.85);
        g.drawRoundedRect(-12.2, 1.3, 1, 1.8, 0.3);
        g.drawRoundedRect(11.2, 1.3, 1, 1.8, 0.3);
        g.endFill();

        // Antenna (cienka linia z red tip)
        g.lineStyle(0.8, COLORS.exhaustChrome, 1);
        g.moveTo(10, -6);
        g.lineTo(10, -12);
        g.lineStyle(0);
        g.beginFill(COLORS.redTip, 1);
        g.drawCircle(10, -12.5, 0.6);
        g.endFill();

        parent.addChild(g);
    }

    private spawnSmokeParticle(): void {
        const g = new PIXI.Graphics();
        const r = 1.6 + Math.random() * 1.0;
        g.beginFill(COLORS.smokeGray, 0.55);
        g.drawCircle(0, 0, r);
        g.endFill();
        // Position at exhaust pipe (in tractor local coords)
        g.x = -11 + (Math.random() - 0.5) * 1.5;
        g.y = -23 + (Math.random() - 0.5) * 0.8;
        this.exhaustContainer.addChild(g);

        this.smokeParticles.push({
            gfx: g,
            life: 1.0 + Math.random() * 0.5,
            maxLife: 1.25,
            vx: (Math.random() - 0.5) * 0.25,
            vy: -0.45 - Math.random() * 0.30,
        });
    }
}