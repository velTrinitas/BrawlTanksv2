import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { MARS_HEX, MARS_SOLAR_ROWS, MARS_BASE_LAYOUT } from '../MarsMap';

/**
 * SolarFarm — the power plant that keeps the base (and the greenhouses) alive.
 * Grammar layer 4 (solid) + a functional link to the landmark.
 *
 * FAZA MARS M4b (playtest: "brakuje mi funkcjonujacego pola z bateriami
 * slonecznymi, ktore daje energie do bazy").
 *
 * "Functional" is the point, so the farm SHOWS its job rather than just standing
 * there: panels track the sun in slow unison, a power conduit runs from the farm
 * toward the base with energy pulses travelling ALONG it, and an inverter shed
 * blinks in time with the flow. That causal chain (panel -> conduit -> base) is
 * what makes it read as machinery instead of scenery (design value: sensoryka).
 *
 * M5b (playtest: "pod panelami chce moc przejezdzac ... lekkie podniesienie jak
 * wiaty z panelami w real life"): the rows are now CARPORTS, not walls.
 *   - NO collision at all: you drive underneath, between the posts.
 *   - The panel deck is lifted CANOPY_H px and drawn ABOVE the tank (zIndex
 *     y+h+60, the greenhouse-glass trick), so driving in visibly puts you under
 *     a roof.
 *   - The ground shadow does the heavy lifting: offset SE and detached from the
 *     deck, which is exactly how the kit sells altitude (lesson A9 — a shadow
 *     lives on the ground, never in the lifted layer; the GAP between object and
 *     shadow is the height cue).
 */

const CANOPY_H = 17;                  // deck lift — a carport, not a tower
const PANEL_TILT_PERIOD_MS = 14000;   // full sun-tracking sweep
const PULSE_SPACING = 0.22;           // conduit pulses, in 0..1 path units
const PULSE_SPEED = 0.00022;          // per ms

export class SolarFarm {
    private container: PIXI.Container;
    private conduitContainer: PIXI.Container;
    private rows: { gfx: PIXI.Graphics; cx: number; cy: number; w: number; h: number; phase: number }[] = [];
    private panelGfx: PIXI.Graphics[] = [];
    private gfxPulses: PIXI.Graphics;
    private gfxInverter: PIXI.Graphics;
    private conduitPath: { x: number; y: number }[] = [];
    private inverter: { x: number; y: number };
    private junction!: { x: number; y: number };

    constructor(worldContainer: PIXI.Container) {
        // ALL Graphics up front (E1)
        this.container = new PIXI.Container();
        this.conduitContainer = new PIXI.Container();
        this.gfxPulses = new PIXI.Graphics();
        this.gfxInverter = new PIXI.Graphics();

        // Conduit + pulses live on the GROUND band, under everything that drives
        // over them; panels themselves Y-sort per row.
        this.conduitContainer.zIndex = 9;   // ground-decal band (T15)
        worldContainer.addChild(this.conduitContainer);
        this.conduitContainer.addChild(this.gfxPulses);

        worldContainer.addChild(this.container);
        this.container.addChild(this.gfxInverter);

        // inverter shed sits at the farm's NE corner, facing the base
        const last = MARS_SOLAR_ROWS[MARS_SOLAR_ROWS.length - 1];
        const first = MARS_SOLAR_ROWS[0];
        this.inverter = { x: first[0] + first[2] + 40, y: first[1] + 30 };

        // Conduit: farm -> base, with one dog-leg so it is not a bare line.
        // M5b fix ("kabel nie styka sie z budynkiem"): the run used to stop 90 px
        // short of the dome, because the dome's ART is inset 50 px inside its
        // hitbox. The endpoint is now the dome's VISUAL south rim, and it ends in
        // a junction box bolted to the hull so the connection is unmistakable.
        const domeA = MARS_BASE_LAYOUT.domeA;
        const VISUAL_INSET = 50;                       // must match MarsBase
        const baseX = domeA.x + domeA.w / 2;           // dome centre X
        const baseY = domeA.y + domeA.h / 2 + (domeA.h / 2 - VISUAL_INSET) - 6; // south rim
        this.junction = { x: baseX, y: baseY };
        this.conduitPath = [
            { x: this.inverter.x, y: this.inverter.y },
            { x: this.inverter.x + 260, y: this.inverter.y - 180 },
            { x: baseX - 420, y: (this.inverter.y + baseY) / 2 - 60 },
            { x: baseX, y: baseY },
        ];

        this.drawConduit();
        this.drawInverter();

        for (const [x, y, w, h] of MARS_SOLAR_ROWS) {
            // ground layer: cast shadow + posts, UNDER the tank
            const gfx = new PIXI.Graphics();
            gfx.zIndex = y - 10;
            worldContainer.addChild(gfx);
            this.rows.push({ gfx, cx: x + w / 2, cy: y + h / 2, w, h, phase: (x + y) * 0.001 });
            this.drawRow(gfx, x, y, w, h);

            // panel deck: lifted and drawn OVER the tank, so driving in puts you
            // under a roof (same trick as the greenhouse glazing)
            const panels = new PIXI.Graphics();
            panels.zIndex = y + h + 60;
            worldContainer.addChild(panels);
            this.panelGfx.push(panels);
        }
        void last;
    }

    /**
     * NO collision — the farm is a set of carports you drive under (M5b).
     * Kept as an explicit empty list so the call site documents the decision
     * rather than silently omitting the push.
     */
    public getCollisionRects(): ICollidable[] {
        return [];
    }

    /**
     * Ground layer of one carport: the CAST SHADOW of the lifted deck (offset SE,
     * detached — this is what sells the height) plus the posts holding it up.
     */
    private drawRow(g: PIXI.Graphics, x: number, y: number, w: number, h: number): void {
        // swept apron: crews kept the grit off the working strip
        g.beginFill(MARS_HEX.duneLight, 0.09);
        g.drawRoundedRect(x - 16, y - 6, w + 32, h + 30, 12);
        g.endFill();

        // CAST SHADOW of the deck — offset SE by roughly the canopy height, and
        // slightly smaller than the deck itself (light comes from the NW).
        const sx = x + CANOPY_H * 0.55;
        const sy = y + CANOPY_H * 1.15;
        g.beginFill(MARS_HEX.depth, 0.30);
        g.drawRoundedRect(sx + 4, sy + 3, w - 8, h * 0.72, 5);
        g.endFill();
        g.beginFill(MARS_HEX.depth, 0.13);   // soft penumbra
        g.drawRoundedRect(sx - 4, sy - 3, w, h * 0.9, 8);
        g.endFill();

        // posts: foot on the ground, rising toward the deck. Drawn as a bright
        // face + dark side so they read as round pipes, not flat bars.
        for (let lx = x + 26; lx < x + w - 16; lx += 84) {
            g.beginFill(0x3e352f, 0.55);              // contact pool
            g.drawEllipse(lx + 3, y + h * 0.86, 7, 3);
            g.endFill();
            g.beginFill(0x51463e, 1);                 // shaded side
            g.drawRect(lx + 3, y + h * 0.30 - CANOPY_H, 6, h * 0.56 + CANOPY_H);
            g.endFill();
            g.beginFill(0x8a7d70, 1);                 // sunlit face
            g.drawRect(lx, y + h * 0.30 - CANOPY_H, 4, h * 0.56 + CANOPY_H);
            g.endFill();
        }
    }

    /** Buried power conduit from the farm to the base. */
    private drawConduit(): void {
        const g = new PIXI.Graphics();
        this.conduitContainer.addChildAt(g, 0);
        const p = this.conduitPath;

        // trench shadow
        g.lineStyle(11, MARS_HEX.depth, 0.28);
        g.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
        // cable
        g.lineStyle(6, 0x4a4038, 0.95);
        g.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
        // sunlit top edge of the cable
        g.lineStyle(2, 0x8a7d70, 0.7);
        g.moveTo(p[0].x, p[0].y - 2);
        for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y - 2);
        g.lineStyle(0);

        // anchor clamps every so often
        g.beginFill(0x6a5c52, 0.9);
        for (let i = 0; i < p.length - 1; i++) {
            const steps = 6;
            for (let s = 1; s < steps; s++) {
                const t = s / steps;
                g.drawRect(p[i].x + (p[i + 1].x - p[i].x) * t - 3,
                           p[i].y + (p[i + 1].y - p[i].y) * t - 5, 6, 10);
            }
        }
        g.endFill();

        // JUNCTION BOX bolted to the dome (M5b: the cable used to just stop in
        // open ground). Riser + box + bracket = an unmistakable connection.
        const j = this.junction;
        const box = new PIXI.Graphics();
        box.zIndex = j.y + 4;              // sits against the hull, above ground decals
        this.container.addChild(box);
        // riser climbing the last stretch onto the hull
        box.lineStyle(5, 0x4a4038, 0.95);
        box.moveTo(j.x, j.y + 18);
        box.lineTo(j.x, j.y - 6);
        box.lineStyle(0);
        // bracket + box
        box.beginFill(MARS_HEX.depth, 0.30);
        box.drawRoundedRect(j.x - 12, j.y - 20, 28, 24, 4);
        box.endFill();
        box.beginFill(0x8f9aa6, 1);
        box.drawRoundedRect(j.x - 15, j.y - 23, 28, 24, 4);
        box.endFill();
        box.beginFill(0xa8b3bf, 1);
        box.drawRoundedRect(j.x - 12, j.y - 20, 22, 9, 3);
        box.endFill();
        // live terminal — same amber as the pulses, so eye links cable->box->base
        box.beginFill(0xffd08a, 0.85);
        box.drawCircle(j.x - 1, j.y - 7, 2.6);
        box.endFill();
        // two bolts into the hull
        box.beginFill(0x5c666f, 0.9);
        box.drawCircle(j.x - 11, j.y - 19, 1.8);
        box.drawCircle(j.x + 9, j.y - 19, 1.8);
        box.endFill();
    }

    /** Inverter shed — where the farm's output is collected. */
    private drawInverter(): void {
        const g = this.gfxInverter;
        const { x, y } = this.inverter;
        g.beginFill(MARS_HEX.depth, 0.3);
        g.drawRoundedRect(x - 20, y - 12, 46, 40, 5);
        g.endFill();
        g.beginFill(0x8f9aa6, 1);
        g.drawRoundedRect(x - 24, y - 18, 46, 40, 5);
        g.endFill();
        g.beginFill(0xa8b3bf, 1);
        g.drawRoundedRect(x - 21, y - 15, 40, 15, 4);
        g.endFill();
        // cooling grille
        g.lineStyle(1.4, 0x66707a, 0.75);
        for (let i = 0; i < 4; i++) {
            g.moveTo(x - 18, y + 2 + i * 4);
            g.lineTo(x + 16, y + 2 + i * 4);
        }
        g.lineStyle(0);
    }

    /**
     * Per-frame: panels track the sun together, energy pulses run down the
     * conduit, inverter lamp beats with them. Two small redraws total.
     */
    public update(): void {
        const now = Date.now();

        // sun tracking: panel tilt = squash on Y + slide, all rows in unison
        const sweep = Math.sin((now % PANEL_TILT_PERIOD_MS) / PANEL_TILT_PERIOD_MS * Math.PI * 2);
        for (let i = 0; i < this.rows.length; i++) {
            const r = this.rows[i];
            const g = this.panelGfx[i];
            g.clear();
            const tilt = sweep * 0.34;                 // -0.34..0.34
            const faceH = r.h * (0.62 - Math.abs(tilt) * 0.22);
            const slide = tilt * 16;
            const px = r.cx - r.w / 2;
            const py = r.cy - r.h / 2 - 6 + slide - CANOPY_H;   // deck rides on the posts

            // panel face — dark blue-violet cells (NOT cyan: F1 reserves cyan)
            g.beginFill(0x2b2f52, 1);
            g.drawRoundedRect(px, py, r.w, faceH, 3);
            g.endFill();
            // cell grid
            g.lineStyle(1, 0x4a5080, 0.55);
            for (let cx = px + 26; cx < px + r.w - 6; cx += 26) {
                g.moveTo(cx, py + 2); g.lineTo(cx, py + faceH - 2);
            }
            g.moveTo(px + 2, py + faceH / 2); g.lineTo(px + r.w - 2, py + faceH / 2);
            g.lineStyle(0);
            // sun glare band sliding across as the panels turn
            const glareX = px + r.w * (0.5 + sweep * 0.32);
            g.beginFill(0xffe8c8, 0.20);
            g.drawRoundedRect(glareX - 26, py + 2, 52, faceH - 4, 3);
            g.endFill();
            // frame
            g.lineStyle(2, 0x9aa6b2, 0.9);
            g.drawRoundedRect(px, py, r.w, faceH, 3);
            g.lineStyle(0);
        }

        // conduit pulses — energy visibly flowing to the base
        const pg = this.gfxPulses;
        pg.clear();
        const p = this.conduitPath;
        const segLens: number[] = [];
        let total = 0;
        for (let i = 0; i < p.length - 1; i++) {
            const l = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
            segLens.push(l); total += l;
        }
        const head = (now * PULSE_SPEED) % 1;
        for (let k = 0; k < Math.ceil(1 / PULSE_SPACING); k++) {
            let t = head - k * PULSE_SPACING;
            if (t < 0) t += 1;
            let d = t * total;
            let sx = p[0].x, sy = p[0].y;
            for (let i = 0; i < segLens.length; i++) {
                if (d <= segLens[i]) {
                    const f = d / segLens[i];
                    sx = p[i].x + (p[i + 1].x - p[i].x) * f;
                    sy = p[i].y + (p[i + 1].y - p[i].y) * f;
                    break;
                }
                d -= segLens[i];
            }
            pg.beginFill(0xffd08a, 0.30);
            pg.drawCircle(sx, sy, 7);
            pg.endFill();
            pg.beginFill(0xffe6b0, 0.9);
            pg.drawCircle(sx, sy, 2.8);
            pg.endFill();
        }

        // inverter lamp beats with the pulse train
        const beat = 0.5 + 0.5 * Math.sin(now * PULSE_SPEED * Math.PI * 2 / PULSE_SPACING);
        const g = this.gfxInverter;
        // redraw only the lamp: keep the static shed, stamp the lamp on top
        if (!(g as unknown as { _lamp?: PIXI.Graphics })._lamp) {
            const lamp = new PIXI.Graphics();
            g.addChild(lamp);
            (g as unknown as { _lamp?: PIXI.Graphics })._lamp = lamp;
        }
        const lamp = (g as unknown as { _lamp: PIXI.Graphics })._lamp;
        lamp.clear();
        lamp.beginFill(0xffd08a, 0.25 * beat);
        lamp.drawCircle(this.inverter.x + 12, this.inverter.y - 10, 7);
        lamp.endFill();
        lamp.beginFill(0xffe6b0, 0.6 + 0.4 * beat);
        lamp.drawCircle(this.inverter.x + 12, this.inverter.y - 10, 2.6);
        lamp.endFill();
    }
}
