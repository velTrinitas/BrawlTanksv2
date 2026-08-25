import * as PIXI from 'pixi.js';
import { t } from '../../i18n/i18n';
import { MARS_HEX } from '../MarsMap';

/**
 * MarsMediPad — "Sluza medyczna" repair station (grammar layer 7, medi).
 *
 * FAZA MARS M4. Contract identical to every other medi pad, so main.ts's pad
 * loop consumes it unchanged: update(px, py, isMoving, hp, maxHp, time)
 * -> { healed }. Cooldown lives HERE; the +100 HP is applied by main.ts.
 *
 * Activation: AABB over the full 100x100 footprint + 8 px buffer — the kit's
 * TARGET contract (K9), the one CloverMediPad proved in v0.38.2. The radial
 * r=50..60 check used by the older pads is legacy and deliberately not copied:
 * a circle inside a square means the visible corners do nothing, which reads as
 * "the pad ignored me" (B5, hitbox == drawing).
 *
 * Icon language: a GEAR, not a heart — a heart on a pad gets mistaken for a
 * health pickup (lesson F2, learned on CloverMediPad).
 */

const PAD_SIZE = 100;
const REPAIR_TIME_MS = 2250;
const COOLDOWN_MS = 60000;
const ACTIVATION_PAD = 8;

export interface PadInteractionResult {
    healed: boolean;
}

export class MarsMediPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    public repairProgress: number = 0;
    public container: PIXI.Container;

    private _repairStart: number | null = null;
    private lastMs = 0;                   // for clock-derived delta (D4)

    private innerContainer: PIXI.Container;
    private gfxBase: PIXI.Graphics;       // static platform art
    private gfxRing: PIXI.Graphics;       // per-frame: airlock ring + progress glow
    private gfxGear: PIXI.Graphics;       // rotating gear icon
    private gfxLamp: PIXI.Graphics;       // status lamp (green ready / amber cooling)
    private progressBg: PIXI.Graphics;
    private progressFill: PIXI.Graphics;
    private label: PIXI.Text;
    private cooldownLabel: PIXI.Text;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        // ALL Graphics/Text created in this first block, before any draw (E1).
        this.container = new PIXI.Container();
        this.innerContainer = new PIXI.Container();
        this.gfxBase = new PIXI.Graphics();
        this.gfxRing = new PIXI.Graphics();
        this.gfxGear = new PIXI.Graphics();
        this.gfxLamp = new PIXI.Graphics();
        this.progressBg = new PIXI.Graphics();
        this.progressFill = new PIXI.Graphics();
        this.label = new PIXI.Text(t('pad.repairing'), {
            fontFamily: 'Titan One, sans-serif', fontSize: 12,
            fill: 0xdff3ff, stroke: 0x14303c, strokeThickness: 3,
        });
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
        this.innerContainer.addChild(this.gfxRing);
        this.innerContainer.addChild(this.gfxGear);
        this.innerContainer.addChild(this.gfxLamp);

        this.label.anchor.set(0.5);
        this.label.x = PAD_SIZE / 2;
        this.label.y = -12;
        this.label.visible = false;
        this.container.addChild(this.label);

        this.cooldownLabel.anchor.set(0.5);
        this.cooldownLabel.x = PAD_SIZE / 2;
        this.cooldownLabel.y = -12;
        this.cooldownLabel.visible = false;
        this.container.addChild(this.cooldownLabel);

        this.progressBg.visible = false;
        this.progressFill.visible = false;
        this.container.addChild(this.progressBg);
        this.container.addChild(this.progressFill);

        this.drawBase();
        this.drawGear();
    }

    /** Static art: airlock deck plate sunk into the regolith. */
    private drawBase(): void {
        const g = this.gfxBase;
        const R = PAD_SIZE / 2;

        // regolith swept off the deck
        g.beginFill(MARS_HEX.duneLight, 0.14);
        g.drawEllipse(0, 4, R * 1.18, R * 1.02);
        g.endFill();
        // deck shadow (SE)
        g.beginFill(MARS_HEX.depth, 0.28);
        g.drawRoundedRect(-R + 8, -R + 12, PAD_SIZE - 12, PAD_SIZE - 16, 12);
        g.endFill();
        // deck plate
        g.beginFill(0x8f9aa6, 1);
        g.drawRoundedRect(-R + 6, -R + 6, PAD_SIZE - 12, PAD_SIZE - 12, 12);
        g.endFill();
        g.beginFill(0xa8b3bf, 1);
        g.drawRoundedRect(-R + 9, -R + 9, PAD_SIZE - 18, PAD_SIZE * 0.42, 10);
        g.endFill();

        // hazard chevrons on the approach edge (south) — "drive in here"
        g.beginFill(MARS_HEX.baseCyan, 0.35);
        for (let i = 0; i < 4; i++) {
            const cx = -30 + i * 20;
            g.drawPolygon([cx, R - 14, cx + 9, R - 20, cx + 13, R - 20, cx + 4, R - 14]);
        }
        g.endFill();

        // deck seams + bolts
        g.lineStyle(1.2, 0x66707a, 0.6);
        g.moveTo(-R + 10, 0); g.lineTo(R - 10, 0);
        g.moveTo(0, -R + 10); g.lineTo(0, R - 10);
        g.lineStyle(0);
        g.beginFill(0x5c666f, 0.9);
        for (const [bx, by] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) {
            g.drawCircle(bx, by, 2.6);
        }
        g.endFill();

        // inner airlock hatch
        g.beginFill(0x6e7883, 1);
        g.drawCircle(0, 0, 26);
        g.endFill();
        g.beginFill(0x596470, 1);
        g.drawCircle(0, 0, 21);
        g.endFill();
    }

    /** Gear icon — the repair symbol (NOT a heart; see header). */
    private drawGear(): void {
        const g = this.gfxGear;
        const teeth = 8;
        const rOut = 15, rIn = 10.5;
        g.beginFill(0xdff3ff, 0.95);
        for (let i = 0; i < teeth; i++) {
            const a0 = (i / teeth) * Math.PI * 2;
            const a1 = a0 + Math.PI / teeth * 0.55;
            g.drawPolygon([
                Math.cos(a0) * rIn, Math.sin(a0) * rIn,
                Math.cos(a0) * rOut, Math.sin(a0) * rOut,
                Math.cos(a1) * rOut, Math.sin(a1) * rOut,
                Math.cos(a1) * rIn, Math.sin(a1) * rIn,
            ]);
        }
        g.drawCircle(0, 0, rIn);
        g.endFill();
        g.beginFill(0x596470, 1);
        g.drawCircle(0, 0, 4.6);
        g.endFill();
    }

    /**
     * Pad tick. Heals only while the player STANDS STILL on the deck and is
     * damaged; moving resets the progress (same rule as every other medi pad).
     */
    public update(
        playerX: number,
        playerY: number,
        isPlayerMoving: boolean,
        playerHp: number,
        playerMaxHp: number,
        time: number,
    ): PadInteractionResult {
        const now = time * 1000;
        const isActive = now >= this.cooldownEnd;
        let healed = false;

        // AABB + 8 over the whole footprint — kit TARGET contract (K9)
        const inside = playerX >= this.x - ACTIVATION_PAD
            && playerX <= this.x + PAD_SIZE + ACTIVATION_PAD
            && playerY >= this.y - ACTIVATION_PAD
            && playerY <= this.y + PAD_SIZE + ACTIVATION_PAD;

        if (isActive && inside && playerHp < playerMaxHp && !isPlayerMoving) {
            if (this._repairStart === null) this._repairStart = now;
            this.repairProgress = Math.min(1, (now - this._repairStart) / REPAIR_TIME_MS);
            if (this.repairProgress >= 1) {
                healed = true;
                this.repairProgress = 0;
                this._repairStart = null;
                this.cooldownEnd = now + COOLDOWN_MS;
            }
        } else {
            this._repairStart = null;
            this.repairProgress = 0;
        }

        this.drawVisuals(now, isActive, inside);
        return { healed };
    }

    /** Per-frame: airlock ring, gear spin, lamp, progress bar. */
    private drawVisuals(now: number, isActive: boolean, inside: boolean): void {
        const repairing = this.repairProgress > 0;

        // gear spins while repairing, idles slowly otherwise
        // D4: rotation MUST be time-scaled. `+=` per frame ran 2.4x faster on a
        // 144 Hz screen. The pad's update() has no `delta`, so we derive it from
        // the clock instead of changing the shared pad contract.
        const dt = this.lastMs ? Math.min(4, (now - this.lastMs) / 16.667) : 1;
        this.lastMs = now;
        this.gfxGear.rotation += (repairing ? 0.055 : 0.006) * dt;
        this.gfxGear.alpha = isActive ? 1 : 0.35;

        // airlock ring: breathing when ready, sweeping when repairing
        const ring = this.gfxRing;
        ring.clear();
        if (isActive) {
            const pulse = 0.45 + Math.sin(now / 420) * 0.25;
            ring.lineStyle(3, MARS_HEX.baseCyan, repairing ? 0.9 : pulse * 0.7);
            ring.drawCircle(0, 0, 32);
            if (repairing) {
                // sweep arc showing progress right on the deck
                ring.lineStyle(5, 0x7ef0a8, 0.95);
                ring.arc(0, 0, 38, -Math.PI / 2, -Math.PI / 2 + this.repairProgress * Math.PI * 2);
            }
            ring.lineStyle(0);
        } else {
            ring.lineStyle(2.4, 0x8a6a3a, 0.5);
            ring.drawCircle(0, 0, 32);
            ring.lineStyle(0);
        }

        // status lamp: green ready / amber cooling
        const lamp = this.gfxLamp;
        lamp.clear();
        const lampCol = isActive ? 0x39d98a : 0xe8a33d;
        const lampPulse = 0.5 + Math.sin(now / (isActive ? 700 : 1400)) * 0.35;
        lamp.beginFill(lampCol, 0.22 * lampPulse);
        lamp.drawCircle(0, -38, 9);
        lamp.endFill();
        lamp.beginFill(lampCol, 0.95);
        lamp.drawCircle(0, -38, 3.4);
        lamp.endFill();

        // labels + progress bar (only while it matters — no permanent clutter)
        this.label.visible = repairing;
        this.progressBg.visible = repairing;
        this.progressFill.visible = repairing;
        if (repairing) {
            const BW = PAD_SIZE - 20, BH = 7;
            this.progressBg.clear();
            this.progressBg.beginFill(0x14303c, 0.8);
            this.progressBg.drawRoundedRect(10, PAD_SIZE + 4, BW, BH, 3);
            this.progressBg.endFill();
            this.progressFill.clear();
            this.progressFill.beginFill(0x7ef0a8, 1);
            this.progressFill.drawRoundedRect(11, PAD_SIZE + 5, (BW - 2) * this.repairProgress, BH - 2, 2);
            this.progressFill.endFill();
        }

        const cooling = !isActive;
        this.cooldownLabel.visible = cooling && inside;
        if (this.cooldownLabel.visible) {
            const left = Math.ceil((this.cooldownEnd - now) / 1000);
            this.cooldownLabel.text = `⚙ ${left}s`;
        }
    }
}
