import * as PIXI from 'pixi.js';
import { MARS_HEX } from '../MarsMap';

/**
 * MarsPowerPad — "Reaktor RTG" turbo station (grammar layer 7, power).
 *
 * FAZA MARS M4. Contract identical to every other power pad, so main.ts's loop
 * consumes it unchanged: update(px, py, time) -> { activated, durationMs,
 * multiplier }. Cooldown lives HERE; main.ts applies the boost.
 *
 * Activation: AABB over the full footprint + 8 px — kit TARGET contract (K9),
 * NOT the legacy radial r=50 that StumpPowerPad still uses (a circle inside a
 * square leaves dead visible corners: "the pad ignored me").
 *
 * Colour language: orange/amber for speed+energy. Deliberately NOT cyan (that
 * belongs to freeze/stealth, F1) and not the medi green.
 */

const PAD_SIZE = 100;
const COOLDOWN_MS = 20000;
const TURBO_DURATION_MS = 5000;
const TURBO_MULT = 2.0;
const ACTIVATION_PAD = 8;

export interface PowerPadInteractionResult {
    activated: boolean;
    durationMs: number;
    multiplier: number;
}

export class MarsPowerPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    public container: PIXI.Container;

    private innerContainer: PIXI.Container;
    private gfxBase: PIXI.Graphics;    // static deck + reactor body
    private gfxFins: PIXI.Container;   // rotating cooling fins
    private gfxCore: PIXI.Graphics;    // per-frame: core glow pulse
    private gfxArcs: PIXI.Graphics;    // per-frame: energy arcs when charged
    private cooldownLabel: PIXI.Text;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        // ALL Graphics/Text up front (E1)
        this.container = new PIXI.Container();
        this.innerContainer = new PIXI.Container();
        this.gfxBase = new PIXI.Graphics();
        this.gfxFins = new PIXI.Container();
        this.gfxCore = new PIXI.Graphics();
        this.gfxArcs = new PIXI.Graphics();
        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Titan One, sans-serif', fontSize: 12,
            fill: 0xffd08a, stroke: 0x3a2410, strokeThickness: 3,
        });

        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 50;
        worldContainer.addChild(this.container);

        this.innerContainer.x = PAD_SIZE / 2;
        this.innerContainer.y = PAD_SIZE / 2;
        this.container.addChild(this.innerContainer);
        this.innerContainer.addChild(this.gfxBase);
        this.innerContainer.addChild(this.gfxFins);
        this.innerContainer.addChild(this.gfxCore);
        this.innerContainer.addChild(this.gfxArcs);

        this.cooldownLabel.anchor.set(0.5);
        this.cooldownLabel.x = PAD_SIZE / 2;
        this.cooldownLabel.y = -12;
        this.cooldownLabel.visible = false;
        this.container.addChild(this.cooldownLabel);

        this.drawBase();
        this.drawFins();
    }

    /** Static art: sunken deck + RTG housing with radiator ribs. */
    private drawBase(): void {
        const g = this.gfxBase;
        const R = PAD_SIZE / 2;

        // scorched ground ring — the reactor has been running a long time
        g.beginFill(MARS_HEX.trackDark, 0.20);
        g.drawEllipse(0, 4, R * 1.16, R * 1.0);
        g.endFill();
        // deck shadow + plate
        g.beginFill(MARS_HEX.depth, 0.28);
        g.drawRoundedRect(-R + 8, -R + 12, PAD_SIZE - 12, PAD_SIZE - 16, 10);
        g.endFill();
        g.beginFill(0x7a6a62, 1);
        g.drawRoundedRect(-R + 6, -R + 6, PAD_SIZE - 12, PAD_SIZE - 12, 10);
        g.endFill();
        g.beginFill(0x8f7d73, 1);
        g.drawRoundedRect(-R + 9, -R + 9, PAD_SIZE - 18, PAD_SIZE * 0.40, 8);
        g.endFill();

        // caution stripes on the approach edge (amber = energy)
        g.beginFill(0xe8a33d, 0.42);
        for (let i = 0; i < 5; i++) {
            const cx = -34 + i * 17;
            g.drawPolygon([cx, R - 13, cx + 8, R - 20, cx + 12, R - 20, cx + 4, R - 13]);
        }
        g.endFill();

        // RTG housing: dark cylinder seen from above
        g.beginFill(0x4a4038, 1);
        g.drawCircle(0, 0, 24);
        g.endFill();
        g.beginFill(0x5e5148, 1);
        g.drawCircle(-1.5, -1.5, 20);
        g.endFill();
        // radioactive trefoil hint: three dark lobes (readable, not scary)
        g.beginFill(0x2e2620, 0.85);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            g.drawEllipse(Math.cos(a) * 11, Math.sin(a) * 11, 6.5, 5);
        }
        g.endFill();
    }

    /** Cooling fins around the housing — rotate slowly, faster when charged. */
    private drawFins(): void {
        const g = new PIXI.Graphics();
        this.gfxFins.addChild(g);
        const FINS = 10;
        for (let i = 0; i < FINS; i++) {
            const a = (i / FINS) * Math.PI * 2;
            const cx = Math.cos(a), sy = Math.sin(a);
            g.beginFill(0x9a8a7e, 0.95);
            g.drawPolygon([
                cx * 25, sy * 25,
                cx * 38 - sy * 4, sy * 38 + cx * 4,
                cx * 38 + sy * 4, sy * 38 - cx * 4,
            ]);
            g.endFill();
            g.beginFill(0x6a5c52, 0.7);
            g.drawCircle(cx * 34, sy * 34, 2);
            g.endFill();
        }
    }

    /**
     * Pad tick. Unlike medi there is no hold: driving in while charged fires it.
     */
    public update(playerX: number, playerY: number, time: number): PowerPadInteractionResult {
        const now = time * 1000;
        const isActive = now >= this.cooldownEnd;
        let activated = false;

        const inside = playerX >= this.x - ACTIVATION_PAD
            && playerX <= this.x + PAD_SIZE + ACTIVATION_PAD
            && playerY >= this.y - ACTIVATION_PAD
            && playerY <= this.y + PAD_SIZE + ACTIVATION_PAD;

        if (isActive && inside) {
            activated = true;
            this.cooldownEnd = now + COOLDOWN_MS;
        }

        this.drawVisuals(now, now >= this.cooldownEnd, inside);
        return { activated, durationMs: TURBO_DURATION_MS, multiplier: TURBO_MULT };
    }

    /** Per-frame: fin spin, core pulse, arcs while charged. */
    private drawVisuals(now: number, isActive: boolean, inside: boolean): void {
        this.gfxFins.rotation += isActive ? 0.012 : 0.003;
        this.gfxFins.alpha = isActive ? 1 : 0.4;

        // core: hot amber when charged, dull ember while cooling
        const core = this.gfxCore;
        core.clear();
        const pulse = 0.5 + Math.sin(now / (isActive ? 380 : 1200)) * 0.4;
        const col = isActive ? 0xffa93d : 0x8a6a3a;
        core.beginFill(col, (isActive ? 0.26 : 0.12) * pulse);
        core.drawCircle(0, 0, 30);
        core.endFill();
        core.beginFill(col, (isActive ? 0.55 : 0.25));
        core.drawCircle(0, 0, 13);
        core.endFill();
        core.beginFill(isActive ? 0xffe6b0 : 0xa88a5a, isActive ? 0.95 : 0.4);
        core.drawCircle(0, 0, 6.5 + (isActive ? pulse * 2 : 0));
        core.endFill();

        // energy arcs licking the fins — only when charged (flex on readiness)
        const arcs = this.gfxArcs;
        arcs.clear();
        if (isActive) {
            const n = 3;
            for (let i = 0; i < n; i++) {
                const a = now / 300 + (i / n) * Math.PI * 2;
                const r0 = 15, r1 = 30 + Math.sin(now / 160 + i) * 4;
                arcs.lineStyle(1.8, 0xffd08a, 0.55 + Math.sin(now / 120 + i * 2) * 0.3);
                arcs.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
                arcs.lineTo(
                    Math.cos(a + 0.35) * r1 * 0.7,
                    Math.sin(a + 0.35) * r1 * 0.7,
                );
                arcs.lineTo(Math.cos(a + 0.1) * r1, Math.sin(a + 0.1) * r1);
            }
            arcs.lineStyle(0);
        }

        this.cooldownLabel.visible = !isActive && inside;
        if (this.cooldownLabel.visible) {
            const left = Math.ceil((this.cooldownEnd - now) / 1000);
            this.cooldownLabel.text = `⚡ ${left}s`;
        }
    }
}
