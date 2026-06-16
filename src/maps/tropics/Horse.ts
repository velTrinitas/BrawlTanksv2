import * as PIXI from 'pixi.js';

/**
 * v0.41.0 FAZA T9.1 — HORSE (Koń AAA premium side-view)
 *
 * Side-view 2.5D koń z 4 paletami (chestnut/bay/gray/black). Każdy koń ma:
 * - Body: torso curved z rounded belly
 * - Head: large oval z snout + ear + eye + nostril
 * - Neck: curved bridge head→body
 * - Mane: overlapping triangular tufts (flowing)
 * - Tail: bezier flowing curve z waves
 * - 4 legs: separate L-shape z hooves
 *
 * State machine:
 *   in_stable        → invisible, inside building
 *   walking_out      → spawn at stable door, walk south to paddock gate
 *   idle_paddock     → stand still, just breathing + tail sway + head bob
 *   wandering        → random walk inside paddock fence
 *   walking_back     → walk from current position to stable door
 *
 * Animations (always on):
 *   - Tail sway (1.2 Hz horizontal wave)
 *   - Head bob (0.8 Hz vertical, breathing-like)
 *   - Body breath (scale Y ±2% at 0.5 Hz)
 *   - Mane wave (subtle 3 Hz wind)
 *   - Walking: 4-step leg gait (FL → RR → FR → RL phase pairs)
 *
 * Walking direction: facing right (+X) = scale.x = 1, facing left = scale.x = -1.
 * Visual size: ~70×45px (body), ~95×60px (including head/tail/legs total).
 */

export type HorsePaletteType = 'chestnut' | 'bay' | 'gray' | 'black';

export type HorseState = 'in_stable' | 'walking_out' | 'idle_paddock' | 'wandering' | 'walking_back';

interface ColorPalette {
    bodyDark: number;
    bodyMid: number;
    bodyLight: number;
    bodyHighlight: number;
    maneDark: number;
    maneMid: number;
    maneLight: number;
    hoofDark: number;
    hoofMid: number;
    accent: number;          // dla star/socks
    accentHighlight: number;
}

const PALETTES: Record<HorsePaletteType, ColorPalette> = {
    // Kasztanowy (klasyczny rdzawy brąz z białymi nogami)
    chestnut: {
        bodyDark:        0x5a2818,
        bodyMid:         0x8a4828,
        bodyLight:       0xb06840,
        bodyHighlight:   0xd0885a,
        maneDark:        0x4a1808,
        maneMid:         0x7a3818,
        maneLight:       0xa05828,
        hoofDark:        0x202020,
        hoofMid:         0x404040,
        accent:          0xf0e8d8,   // białe pęciny (white socks)
        accentHighlight: 0xffffff,
    },
    // Gniady (ciemny brąz z czarną grzywą + nogami)
    bay: {
        bodyDark:        0x301810,
        bodyMid:         0x5a3020,
        bodyLight:       0x804830,
        bodyHighlight:   0xa06840,
        maneDark:        0x000000,
        maneMid:         0x101010,
        maneLight:       0x303030,
        hoofDark:        0x000000,
        hoofMid:         0x181818,
        accent:          0x202020,   // czarne nogi (black legs)
        accentHighlight: 0x404040,
    },
    // Siwy (jasny szary z białą grzywą)
    gray: {
        bodyDark:        0x686868,
        bodyMid:         0xa8a8a8,
        bodyLight:       0xc8c8c8,
        bodyHighlight:   0xe8e8e8,
        maneDark:        0xc8c8c8,
        maneMid:         0xe0e0e0,
        maneLight:       0xf8f8f8,
        hoofDark:        0x303030,
        hoofMid:         0x505050,
        accent:          0xe8e8e8,
        accentHighlight: 0xffffff,
    },
    // Karny (czarny z białą gwiazdką na czole)
    black: {
        bodyDark:        0x080808,
        bodyMid:         0x202020,
        bodyLight:       0x383838,
        bodyHighlight:   0x585858,
        maneDark:        0x000000,
        maneMid:         0x181818,
        maneLight:       0x303030,
        hoofDark:        0x000000,
        hoofMid:         0x181818,
        accent:          0xf8f8f8,    // biała gwiazdka na czole
        accentHighlight: 0xffffff,
    },
};

interface LegConfig {
    baseX: number;       // X offset from body center
    baseY: number;       // Y at body bottom
    phase: number;       // gait phase offset (0, π/2, π, 3π/2)
    isFront: boolean;
}

const LEG_CONFIGS: LegConfig[] = [
    { baseX: -22, baseY: 14, phase: 0,                isFront: true  },  // FL
    { baseX:  22, baseY: 14, phase: Math.PI,          isFront: true  },  // FR (opposite phase to FL)
    { baseX: -10, baseY: 14, phase: Math.PI / 2,      isFront: false },  // RL
    { baseX:  10, baseY: 14, phase: 3 * Math.PI / 2,  isFront: false },  // RR
];

const WALK_SPEED = 0.45;           // px/frame when walking
const WANDER_SPEED = 0.30;          // slower w paddock random walk
const ARRIVAL_THRESHOLD = 3;        // px

export class Horse {
    public x: number;
    public y: number;
    public container: PIXI.Container;
    public state: HorseState = 'in_stable';
    public paletteType: HorsePaletteType;

    private palette: ColorPalette;
    private headContainer: PIXI.Container;
    private bodyContainer: PIXI.Container;
    private tailContainer: PIXI.Container;
    private legContainers: PIXI.Container[] = [];
    private maneGfx: PIXI.Graphics;
    private tailGfx: PIXI.Graphics;
    private headBobContainer: PIXI.Container;

    private time: number = 0;
    private facing: number = 1;     // 1 = right, -1 = left
    private targetX: number = 0;
    private targetY: number = 0;
    private idleTimer: number = 0;
    private wanderTimer: number = 0;
    private stateTimer: number = 0;

    // Stable door + paddock bounds (set at construction)
    private stableDoor: { x: number, y: number };
    private paddockBounds: { x: number, y: number, w: number, h: number };

    constructor(
        startX: number,
        startY: number,
        paletteType: HorsePaletteType,
        stableDoor: { x: number, y: number },
        paddockBounds: { x: number, y: number, w: number, h: number },
        worldContainer: PIXI.Container,
    ) {
        this.x = startX;
        this.y = startY;
        this.paletteType = paletteType;
        this.palette = PALETTES[paletteType];
        this.stableDoor = stableDoor;
        this.paddockBounds = paddockBounds;

        this.container = new PIXI.Container();
        this.container.x = startX;
        this.container.y = startY;
        worldContainer.addChild(this.container);

        // Layer setup (back-to-front)
        // 1. Shadow under hooves
        this.drawShadow();

        // 2. Back legs (drawn first, behind body)
        const backLegsContainer = new PIXI.Container();
        this.container.addChild(backLegsContainer);
        this.spawnLeg(backLegsContainer, LEG_CONFIGS[2], false);  // RL
        this.spawnLeg(backLegsContainer, LEG_CONFIGS[3], false);  // RR

        // 3. Tail container (behind body)
        this.tailContainer = new PIXI.Container();
        this.container.addChild(this.tailContainer);
        this.tailGfx = new PIXI.Graphics();
        this.tailContainer.addChild(this.tailGfx);

        // 4. Body (main torso)
        this.bodyContainer = new PIXI.Container();
        this.container.addChild(this.bodyContainer);
        this.drawBody();

        // 5. Front legs (over body)
        const frontLegsContainer = new PIXI.Container();
        this.container.addChild(frontLegsContainer);
        this.spawnLeg(frontLegsContainer, LEG_CONFIGS[0], true);  // FL
        this.spawnLeg(frontLegsContainer, LEG_CONFIGS[1], true);  // FR

        // 6. Head + neck (with separate container for bob animation)
        this.headBobContainer = new PIXI.Container();
        this.container.addChild(this.headBobContainer);
        this.headContainer = new PIXI.Container();
        this.headBobContainer.addChild(this.headContainer);

        // 7. Mane MUST be created BEFORE drawHead — drawHead() calls drawMane() at end
        // v0.41.8 FIX: maneGfx initialization was AFTER drawHead, causing crash
        this.maneGfx = new PIXI.Graphics();
        // v0.41.9 FIX: anchor pivot at mane center (-30, -22), compensate position
        // Mane jest rysowana w tufts at x=-38 to -23, y=-38 to -10 — środek ~(-30, -22)
        // Bez pivot fix, rotation wokół (0,0) powodowała "mane lata" oderwane od szyi
        this.maneGfx.pivot.set(-30, -22);
        this.maneGfx.position.set(-30, -22);
        this.headBobContainer.addChild(this.maneGfx);

        this.drawNeck();
        this.drawHead();

        // Initial state: in stable (invisible)
        this.container.visible = false;
        this.container.zIndex = Math.floor(startY) + 50;
    }

    // ═══════════════════════════════════════════════════════════
    // SHADOW (drop shadow under hooves)
    // ═══════════════════════════════════════════════════════════
    private drawShadow(): void {
        const g = new PIXI.Graphics();
        g.beginFill(0x000000, 0.35);
        g.drawEllipse(0, 18, 32, 4);
        g.endFill();
        g.beginFill(0x000000, 0.55);
        g.drawEllipse(0, 18, 25, 2.5);
        g.endFill();
        this.container.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // BODY (torso curved z rounded belly + back)
    // ═══════════════════════════════════════════════════════════
    private drawBody(): void {
        const g = new PIXI.Graphics();
        const p = this.palette;

        // Dark outline
        g.beginFill(p.bodyDark, 1);
        // Body shape: elongated rounded rectangle with curved back/belly
        g.moveTo(-30, 0);
        g.bezierCurveTo(-32, -10, -28, -14, -18, -14);   // back-left curve
        g.lineTo(20, -14);
        g.bezierCurveTo(28, -14, 32, -10, 30, 0);         // back-right curve
        g.bezierCurveTo(32, 8, 28, 14, 20, 14);           // belly-right
        g.lineTo(-18, 14);
        g.bezierCurveTo(-28, 14, -32, 8, -30, 0);         // belly-left
        g.closePath();
        g.endFill();

        // Mid body color
        g.beginFill(p.bodyMid, 1);
        g.moveTo(-28, 0);
        g.bezierCurveTo(-30, -9, -26, -12, -17, -12);
        g.lineTo(19, -12);
        g.bezierCurveTo(27, -12, 30, -9, 28, 0);
        g.bezierCurveTo(30, 7, 27, 12, 19, 12);
        g.lineTo(-17, 12);
        g.bezierCurveTo(-26, 12, -30, 7, -28, 0);
        g.closePath();
        g.endFill();

        // Top sunlit (back curve gets light)
        g.beginFill(p.bodyLight, 0.75);
        g.moveTo(-24, -5);
        g.bezierCurveTo(-26, -10, -22, -10, -15, -10);
        g.lineTo(18, -10);
        g.bezierCurveTo(24, -10, 26, -8, 22, -3);
        g.bezierCurveTo(15, -6, -5, -7, -15, -7);
        g.closePath();
        g.endFill();

        // Belly highlight (subtle catchlight)
        g.beginFill(p.bodyHighlight, 0.30);
        g.drawEllipse(0, 6, 15, 4);
        g.endFill();

        // Catchlight on shoulder (NW)
        g.beginFill(p.bodyHighlight, 0.55);
        g.drawEllipse(-18, -7, 6, 3);
        g.endFill();

        // Subtle muscle definition (3 darker lines)
        g.lineStyle(1.0, p.bodyDark, 0.45);
        g.moveTo(-10, -8);
        g.quadraticCurveTo(-8, 0, -10, 8);
        g.moveTo(5, -10);
        g.quadraticCurveTo(8, 0, 5, 10);
        g.moveTo(18, -10);
        g.quadraticCurveTo(20, 0, 18, 10);
        g.lineStyle(0);

        this.bodyContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // NECK (curved bridge body → head)
    // ═══════════════════════════════════════════════════════════
    private drawNeck(): void {
        const g = new PIXI.Graphics();
        const p = this.palette;

        // Neck goes from upper body (around -25, -10) to head base (-42, -18)
        // Curved trapezoidal shape
        g.beginFill(p.bodyDark, 1);
        g.moveTo(-30, -12);
        g.bezierCurveTo(-36, -16, -42, -22, -42, -30);  // outer curve up
        g.lineTo(-32, -33);
        g.bezierCurveTo(-30, -28, -25, -20, -22, -14);  // inner curve down
        g.closePath();
        g.endFill();

        // Neck mid
        g.beginFill(p.bodyMid, 1);
        g.moveTo(-29, -12);
        g.bezierCurveTo(-35, -16, -40, -22, -41, -29);
        g.lineTo(-33, -32);
        g.bezierCurveTo(-31, -28, -26, -20, -23, -13);
        g.closePath();
        g.endFill();

        // Neck highlight (sunlit front edge)
        g.beginFill(p.bodyLight, 0.65);
        g.moveTo(-31, -14);
        g.bezierCurveTo(-33, -20, -28, -25, -25, -16);
        g.closePath();
        g.endFill();

        this.headContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // HEAD (large oval z snout + ear + eye + nostril)
    // ═══════════════════════════════════════════════════════════
    private drawHead(): void {
        const g = new PIXI.Graphics();
        const p = this.palette;
        const hx = -42;  // head center X
        const hy = -32;  // head center Y

        // Head outline dark
        g.beginFill(p.bodyDark, 1);
        // Elongated head shape (snout pointing left/down)
        g.moveTo(hx + 8, hy - 4);                              // top-right (toward neck)
        g.bezierCurveTo(hx + 5, hy - 10, hx - 5, hy - 11, hx - 10, hy - 7);   // top of head
        g.bezierCurveTo(hx - 15, hy - 4, hx - 18, hy + 2, hx - 16, hy + 6);   // forehead → snout top
        g.bezierCurveTo(hx - 14, hy + 9, hx - 8, hy + 10, hx - 4, hy + 9);    // snout bottom
        g.bezierCurveTo(hx + 2, hy + 8, hx + 7, hy + 5, hx + 8, hy + 1);      // jaw
        g.closePath();
        g.endFill();

        // Mid head
        g.beginFill(p.bodyMid, 1);
        g.moveTo(hx + 7, hy - 3);
        g.bezierCurveTo(hx + 4, hy - 9, hx - 4, hy - 10, hx - 9, hy - 6);
        g.bezierCurveTo(hx - 14, hy - 3, hx - 17, hy + 2, hx - 15, hy + 5);
        g.bezierCurveTo(hx - 13, hy + 8, hx - 7, hy + 9, hx - 3, hy + 8);
        g.bezierCurveTo(hx + 1, hy + 7, hx + 6, hy + 4, hx + 7, hy + 0);
        g.closePath();
        g.endFill();

        // Forehead sunlit (top sunlit)
        g.beginFill(p.bodyLight, 0.65);
        g.moveTo(hx - 2, hy - 8);
        g.bezierCurveTo(hx - 8, hy - 7, hx - 12, hy - 3, hx - 10, hy);
        g.bezierCurveTo(hx - 6, hy - 3, hx - 2, hy - 5, hx - 2, hy - 8);
        g.closePath();
        g.endFill();

        // Snout highlight (light brown na koniec pyska)
        g.beginFill(p.bodyHighlight, 0.45);
        g.drawEllipse(hx - 14, hy + 4, 3, 2.5);
        g.endFill();

        // Star on forehead (for black palette only)
        if (this.paletteType === 'black') {
            g.beginFill(p.accent, 0.95);
            // Diamond star shape
            g.moveTo(hx - 6, hy - 4);
            g.lineTo(hx - 4, hy - 1);
            g.lineTo(hx - 6, hy + 2);
            g.lineTo(hx - 8, hy - 1);
            g.closePath();
            g.endFill();
            g.beginFill(p.accentHighlight, 0.85);
            g.drawCircle(hx - 6, hy - 1, 1.2);
            g.endFill();
        }

        // Ear (triangular pointed up)
        g.beginFill(p.bodyDark, 1);
        g.moveTo(hx + 3, hy - 9);
        g.lineTo(hx + 6, hy - 14);
        g.lineTo(hx + 7, hy - 6);
        g.closePath();
        g.endFill();
        g.beginFill(p.bodyMid, 1);
        g.moveTo(hx + 4, hy - 9);
        g.lineTo(hx + 6, hy - 13);
        g.lineTo(hx + 6.5, hy - 6.5);
        g.closePath();
        g.endFill();
        // Inner ear (pink/dark)
        g.beginFill(0x804040, 0.65);
        g.moveTo(hx + 5, hy - 8);
        g.lineTo(hx + 6, hy - 12);
        g.lineTo(hx + 6.2, hy - 7);
        g.closePath();
        g.endFill();

        // Eye
        g.beginFill(0x000000, 1);
        g.drawEllipse(hx - 4, hy - 2, 1.8, 1.3);
        g.endFill();
        g.beginFill(0xffffff, 0.85);
        g.drawCircle(hx - 4.5, hy - 2.5, 0.55);
        g.endFill();

        // Nostril
        g.beginFill(0x000000, 0.85);
        g.drawEllipse(hx - 13, hy + 5, 1.2, 1.6);
        g.endFill();
        g.beginFill(p.bodyDark, 0.55);
        g.drawCircle(hx - 12.5, hy + 4.5, 0.55);
        g.endFill();

        // Mouth line (curved)
        g.lineStyle(0.7, p.bodyDark, 0.85);
        g.moveTo(hx - 14, hy + 8);
        g.quadraticCurveTo(hx - 10, hy + 8.5, hx - 7, hy + 8);
        g.lineStyle(0);

        this.headContainer.addChild(g);

        // Mane on back of head/neck (from forehead behind ear, down neck)
        this.drawMane();
    }

    private drawMane(): void {
        const p = this.palette;
        const g = this.maneGfx;
        g.clear();

        // 8 overlapping triangular tufts from forehead down neck
        const tufts = [
            { x: -38, y: -38, w: 6, h: 8 },
            { x: -35, y: -37, w: 7, h: 10 },
            { x: -32, y: -34, w: 8, h: 11 },
            { x: -29, y: -30, w: 8, h: 12 },
            { x: -27, y: -25, w: 8, h: 13 },
            { x: -25, y: -20, w: 7, h: 12 },
            { x: -24, y: -15, w: 6, h: 10 },
            { x: -23, y: -10, w: 5, h: 8 },
        ];

        for (const t of tufts) {
            // Dark outer
            g.beginFill(p.maneDark, 0.95);
            g.moveTo(t.x, t.y);
            g.lineTo(t.x - t.w, t.y + t.h);
            g.lineTo(t.x + t.w * 0.4, t.y + t.h * 0.6);
            g.closePath();
            g.endFill();
            // Mid color
            g.beginFill(p.maneMid, 0.95);
            g.moveTo(t.x, t.y + 1);
            g.lineTo(t.x - t.w * 0.85, t.y + t.h);
            g.lineTo(t.x + t.w * 0.3, t.y + t.h * 0.6);
            g.closePath();
            g.endFill();
        }
        // Tip highlights on some tufts
        for (let i = 0; i < tufts.length; i += 2) {
            const t = tufts[i];
            g.beginFill(p.maneLight, 0.7);
            g.moveTo(t.x, t.y + 1);
            g.lineTo(t.x - t.w * 0.5, t.y + t.h * 0.7);
            g.lineTo(t.x + t.w * 0.2, t.y + t.h * 0.5);
            g.closePath();
            g.endFill();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // LEG (L-shape z hoofem + animation phase)
    // ═══════════════════════════════════════════════════════════
    private spawnLeg(parent: PIXI.Container, config: LegConfig, isFront: boolean): void {
        const legContainer = new PIXI.Container();
        legContainer.x = config.baseX;
        legContainer.y = config.baseY;
        parent.addChild(legContainer);

        // (data needed for walking animation)
        (legContainer as any).gaitPhase = config.phase;
        (legContainer as any).isFront = isFront;

        const g = new PIXI.Graphics();
        const p = this.palette;
        const upperW = 7;
        const upperH = 12;
        const lowerW = 5;
        const lowerH = 10;
        const hoofW = 6;
        const hoofH = 4;

        // Upper leg (top portion - thicker)
        g.beginFill(p.bodyDark, 1);
        g.drawRoundedRect(-upperW / 2 - 1, -2, upperW + 2, upperH + 2, 3);
        g.endFill();
        g.beginFill(p.accent !== p.bodyMid && (this.paletteType === 'chestnut' && isFront ? p.accent : p.bodyMid), 1);
        g.drawRoundedRect(-upperW / 2, -1, upperW, upperH, 2);
        g.endFill();

        // Knee joint (small darker oval)
        g.beginFill(p.bodyDark, 0.85);
        g.drawEllipse(0, upperH - 1, upperW / 2 + 1, 2);
        g.endFill();

        // Lower leg (thinner)
        g.beginFill(p.bodyDark, 1);
        g.drawRoundedRect(-lowerW / 2 - 1, upperH, lowerW + 2, lowerH + 2, 2);
        g.endFill();
        // Lower leg color (chestnut has white socks on front legs only)
        const lowerColor = (this.paletteType === 'chestnut' && isFront) ? p.accent :
                          (this.paletteType === 'bay') ? p.accent : p.bodyMid;
        g.beginFill(lowerColor, 1);
        g.drawRoundedRect(-lowerW / 2, upperH + 1, lowerW, lowerH, 2);
        g.endFill();

        // Sock highlight (white)
        if (this.paletteType === 'chestnut' && isFront) {
            g.beginFill(p.accentHighlight, 0.85);
            g.drawRect(-lowerW / 2 + 0.5, upperH + 2, lowerW - 1, 3);
            g.endFill();
        }

        // Hoof (dark)
        const hoofY = upperH + lowerH;
        g.beginFill(p.hoofDark, 1);
        g.drawRoundedRect(-hoofW / 2 - 0.5, hoofY, hoofW + 1, hoofH + 1, 1);
        g.endFill();
        g.beginFill(p.hoofMid, 1);
        g.drawRoundedRect(-hoofW / 2, hoofY + 0.5, hoofW, hoofH, 1);
        g.endFill();
        // Hoof catchlight
        g.beginFill(0xffffff, 0.35);
        g.drawRect(-hoofW / 2 + 0.5, hoofY + 1, 1.5, 1.5);
        g.endFill();

        legContainer.addChild(g);
        this.legContainers.push(legContainer);
    }

    // ═══════════════════════════════════════════════════════════
    // STATE MACHINE + ANIMATION UPDATE
    // ═══════════════════════════════════════════════════════════
    public update(delta: number = 1): void {
        this.time += 1 / 60;
        this.stateTimer += 1 / 60;

        // State-specific logic
        switch (this.state) {
            case 'in_stable':
                // Invisible, no update
                this.container.visible = false;
                break;

            case 'walking_out':
                this.container.visible = true;
                this.walkToward(this.targetX, this.targetY, WALK_SPEED);
                if (this.distToTarget() < ARRIVAL_THRESHOLD) {
                    this.enterIdlePaddock();
                }
                break;

            case 'idle_paddock':
                this.container.visible = true;
                // Just animation, no movement
                this.idleTimer += 1 / 60;
                // v0.41.5: Faster transitions for visible movement (1.5-3.5s instead of 4-8s)
                if (this.idleTimer >= 1.5 + Math.random() * 2) {
                    this.startWandering();
                }
                break;

            case 'wandering':
                this.container.visible = true;
                this.walkToward(this.targetX, this.targetY, WANDER_SPEED);
                if (this.distToTarget() < ARRIVAL_THRESHOLD) {
                    this.enterIdlePaddock();
                }
                // Safety: cap wandering at 8s
                this.wanderTimer += 1 / 60;
                if (this.wanderTimer >= 8) {
                    this.enterIdlePaddock();
                }
                break;

            case 'walking_back':
                this.container.visible = true;
                this.walkToward(this.targetX, this.targetY, WALK_SPEED);
                if (this.distToTarget() < ARRIVAL_THRESHOLD) {
                    this.state = 'in_stable';
                    this.container.visible = false;
                }
                break;
        }

        // Always-on animations
        this.updateAnimations();

        // Container position + Y-sort
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = Math.floor(this.y) + 60;  // over patrol tractor (50)

        // Facing flip — v0.41.9 STRICT: zawsze match movement direction (no walking backwards)
        // Plus: gdy startWandering ustawia target, ZARAZ flip facing przed pierwszym walkToward
        const isMoving = (this.state === 'walking_out' || this.state === 'wandering' || this.state === 'walking_back');
        if (isMoving) {
            const dx = this.targetX - this.x;
            // Update facing only when there's meaningful X distance (threshold 5px)
            // Avoids flipping back-and-forth gdy target jest prawie at same X
            if (Math.abs(dx) > 5) {
                const desiredFacing = dx > 0 ? 1 : -1;
                if (desiredFacing !== this.facing) {
                    this.facing = desiredFacing;
                    this.container.scale.x = this.facing;
                }
            }
        }
    }

    private updateAnimations(): void {
        const t = this.time;
        const isMoving = (this.state === 'walking_out' || this.state === 'wandering' || this.state === 'walking_back');

        // v0.41.5: STRONGER animations dla widoczności
        // Body breath (scale Y ±5% at 0.7Hz — was ±2% 0.5Hz)
        const breath = Math.sin(t * Math.PI * 1.4) * 0.05;
        this.bodyContainer.scale.y = 1 + breath;
        // Plus subtle horizontal sway (lekkie ważenie ciała)
        this.bodyContainer.x = Math.sin(t * 0.8) * 0.4;

        // Head bob (vertical 1.2Hz, ±3px — was 0.8Hz ±1.2px)
        const headBob = Math.sin(t * 2.4) * 3;
        this.headBobContainer.y = headBob;
        // Head sway horizontal (zerkanie w lewo/prawo)
        this.headBobContainer.x = Math.sin(t * 0.5) * 1.2;

        // Tail sway (drawing tail per-frame with bezier wave)
        this.drawTailFrame(t);

        // Mane wave (subtle wind sway — ±0.04 rad / ~2.3°, rotated AROUND pivot center)
        // v0.41.9: reduced from ±0.12 (was flapping wildly)
        this.maneGfx.rotation = Math.sin(t * 2.5) * 0.04;

        // Walking gait (legs)
        if (isMoving) {
            const gaitSpeed = (this.state === 'wandering') ? 5 : 7;  // wandering slower gait
            for (let i = 0; i < this.legContainers.length; i++) {
                const leg = this.legContainers[i];
                const phase = (leg as any).gaitPhase || 0;
                const isFront = (leg as any).isFront;

                // Cycle: leg lifts up + slightly forward, then back down
                const cycle = Math.sin(t * gaitSpeed + phase);
                const liftAmt = Math.max(0, cycle) * 3;       // 0-3px lift when phase > 0
                const swingAmt = cycle * 2;                    // ±2px swing

                leg.y = (isFront ? 14 : 14) - liftAmt;        // baseline 14, lift up
                leg.x = (i === 0 ? -22 : i === 1 ? 22 : i === 2 ? -10 : 10) + swingAmt * (isFront ? 1 : -1);
            }
        } else {
            // Reset legs to neutral position
            for (let i = 0; i < this.legContainers.length; i++) {
                const leg = this.legContainers[i];
                leg.y = 14;
                leg.x = (i === 0 ? -22 : i === 1 ? 22 : i === 2 ? -10 : 10);
            }
        }
    }

    private drawTailFrame(t: number): void {
        const p = this.palette;
        const g = this.tailGfx;
        g.clear();

        // Tail attaches at body back-right (~30, 0), flows down/right with curve
        const tailRoot = { x: 30, y: -3 };
        const tailWave = Math.sin(t * 2.2) * 1.8;  // v0.41.5: faster + bigger (was sin(t*1.2)*1)

        // Tail curve points
        const ctrl1X = tailRoot.x + 8 + tailWave * 2;
        const ctrl1Y = tailRoot.y + 4;
        const ctrl2X = tailRoot.x + 12 + tailWave * 3;
        const ctrl2Y = tailRoot.y + 12;
        const tipX = tailRoot.x + 9 + tailWave * 5;
        const tipY = tailRoot.y + 18;

        // Tail strands (5 overlapping curves dla volume)
        for (let i = 0; i < 5; i++) {
            const offsetX = (i - 2) * 1.4;
            const widthMul = 1 - Math.abs(i - 2) * 0.15;
            // Outer strand (darker)
            g.lineStyle(2.5 * widthMul, p.maneDark, 0.95);
            g.moveTo(tailRoot.x + offsetX, tailRoot.y);
            g.bezierCurveTo(
                ctrl1X + offsetX, ctrl1Y,
                ctrl2X + offsetX, ctrl2Y,
                tipX + offsetX, tipY,
            );
            // Inner color
            g.lineStyle(1.5 * widthMul, p.maneMid, 0.95);
            g.moveTo(tailRoot.x + offsetX, tailRoot.y);
            g.bezierCurveTo(
                ctrl1X + offsetX, ctrl1Y,
                ctrl2X + offsetX, ctrl2Y,
                tipX + offsetX, tipY,
            );
        }
        // Highlight strand (sunlit center)
        g.lineStyle(0.8, p.maneLight, 0.85);
        g.moveTo(tailRoot.x, tailRoot.y - 1);
        g.bezierCurveTo(
            ctrl1X - 1, ctrl1Y - 1,
            ctrl2X - 1, ctrl2Y - 1,
            tipX - 1, tipY - 1,
        );
        g.lineStyle(0);

        // Tail tip catchlight
        g.beginFill(p.maneLight, 0.6);
        g.drawCircle(tipX, tipY, 1.4);
        g.endFill();
    }

    private walkToward(tx: number, ty: number, speed: number): void {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ARRIVAL_THRESHOLD) return;
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
    }

    private distToTarget(): number {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ═══════════════════════════════════════════════════════════
    // STATE TRANSITIONS (public — manager triggers)
    // ═══════════════════════════════════════════════════════════
    public exitStable(): void {
        this.state = 'walking_out';
        this.stateTimer = 0;
        // Spawn at stable door
        this.x = this.stableDoor.x;
        this.y = this.stableDoor.y;
        this.container.visible = true;
        // Target: random spot inside paddock
        const padding = 30;
        this.targetX = this.paddockBounds.x + padding + Math.random() * (this.paddockBounds.w - padding * 2);
        this.targetY = this.paddockBounds.y + padding + Math.random() * (this.paddockBounds.h - padding * 2);
        this.facing = this.targetX > this.x ? 1 : -1;
        this.container.scale.x = this.facing;
    }

    public returnToStable(): void {
        if (this.state === 'in_stable') return;
        this.state = 'walking_back';
        this.stateTimer = 0;
        this.targetX = this.stableDoor.x;
        this.targetY = this.stableDoor.y;
    }

    private enterIdlePaddock(): void {
        this.state = 'idle_paddock';
        this.stateTimer = 0;
        this.idleTimer = 0;
        this.x = this.targetX;
        this.y = this.targetY;
    }

    private startWandering(): void {
        this.state = 'wandering';
        this.stateTimer = 0;
        this.wanderTimer = 0;
        this.idleTimer = 0;
        // v0.41.9: Pick random target — gwarantujemy that target ma significant X delta
        // żeby koń zawsze sie face appropriately (no walking backwards/sideways)
        const padding = 30;
        const minXDelta = 40;  // min poziome distance od current X
        let attempts = 0;
        do {
            this.targetX = this.paddockBounds.x + padding + Math.random() * (this.paddockBounds.w - padding * 2);
            this.targetY = this.paddockBounds.y + padding + Math.random() * (this.paddockBounds.h - padding * 2);
            attempts++;
        } while (Math.abs(this.targetX - this.x) < minXDelta && attempts < 5);
        // Pre-flip facing toward target przed first walkToward (zapobiega ruchu do tyłu first frame)
        if (this.targetX > this.x) {
            this.facing = 1;
            this.container.scale.x = 1;
        } else {
            this.facing = -1;
            this.container.scale.x = -1;
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}