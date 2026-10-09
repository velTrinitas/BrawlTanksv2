import * as PIXI from 'pixi.js';
import { JUNKYARD_HEX, JUNKYARD_LAYOUT, JUNKYARD_WRECK_TINTS } from '../JunkyardMap';
import { simNowMs } from '../../systems/SimClock';
import { worldRng } from '../../systems/Rng';
import { isPointInView } from '../cullGate';
import { bakeCanvas, css, cylinder, hazard, roundRect, softShadow } from './junkyardBake';
import { bakeCarSprite } from './WreckStack';

/**
 * TowTruck — Laweta (ZLOMOWISKO J6a). Pattern: desert Caravan (the one prop whose update() carries game logic:
 * the gem drop). Drives the outer lane loop `JUNKYARD_LAYOUT.lawetteRoute` (AABB-verified V6) at a fixed px per
 * logic step, carrying a wreck (random tint of the 12), and loses a gem every `dropIntervalMs` — the pickup
 * position comes from the sim (truck position), so coop clients agree. PASSABLE (no collision): pure ambient +
 * reward. Art: Canvas 2D bake, fake-3D cab + flatbed with a soft shadow; amber beacon blinks (visual).
 */
export interface TowTruckDrop { x: number; y: number; }
const TRUCK_W = 150, TRUCK_H = 56;

export class TowTruck {
    private container: PIXI.Container;
    private beacon: PIXI.Graphics;
    private x: number; private y: number;
    private seg = 0;
    private t = 0; // 0..1 along the current segment
    private lastDropAt = 0;
    private lastHornAt = 0;
    private route = JUNKYARD_LAYOUT.lawetteRoute;

    constructor(worldContainer: PIXI.Container, private speedPxPerStep: number, private dropIntervalMs: number) {
        this.x = this.route[0].x; this.y = this.route[0].y;
        this.container = new PIXI.Container();
        this.container.zIndex = this.y;
        worldContainer.addChild(this.container);
        const body = new PIXI.Container(); body.position.set(-TRUCK_W / 2, -TRUCK_H / 2); this.container.addChild(body);
        bakeCanvas(body, 'towtruck', TRUCK_W, TRUCK_H, { l: 30, t: 50, r: 40, b: 40 }, c => TowTruck.draw(c));
        // the carried wreck on the flatbed
        const wreck = new PIXI.Container(); wreck.position.set(-TRUCK_W / 2 + 46, -6); this.container.addChild(wreck);
        bakeCarSprite(wreck, worldRng.int(4), worldRng.int(3), JUNKYARD_WRECK_TINTS[worldRng.int(JUNKYARD_WRECK_TINTS.length)]);
        wreck.scale.set(0.9); wreck.rotation = 0.06;
        this.beacon = new PIXI.Graphics(); this.beacon.position.set(TRUCK_W / 2 - 22, -TRUCK_H / 2 - 18); this.container.addChild(this.beacon);
        this.lastDropAt = simNowMs();
        this.place();
    }

    public get pos(): { x: number; y: number } { return { x: this.x, y: this.y }; }

    /** Fixed logic step; returns a gem drop position when one is due. */
    public update(camX?: number, camY?: number, viewW?: number, viewH?: number): TowTruckDrop | null {
        const a = this.route[this.seg], b = this.route[(this.seg + 1) % this.route.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        this.t += this.speedPxPerStep / len;
        while (this.t >= 1) { this.t -= 1; this.seg = (this.seg + 1) % this.route.length; }
        this.place();
        const now = simNowMs();
        const inView = camX !== undefined && camY !== undefined && viewW !== undefined && viewH !== undefined
            ? isPointInView(this.x, this.y, camX, camY, viewW, viewH, 160) : true;
        this.container.renderable = inView;
        if (inView) {
            this.beacon.clear();
            const on = Math.sin(now / 160) > 0;
            this.beacon.beginFill(0xffb347, on ? 1 : 0.35); this.beacon.drawCircle(0, 0, on ? 6 : 5); this.beacon.endFill();
            // slight bob (visual)
            this.container.children[0].y = -TRUCK_H / 2 + Math.sin(now / 90) * 0.8;
        }
        if (now - this.lastDropAt >= this.dropIntervalMs) {
            this.lastDropAt = now;
            return { x: this.x - Math.cos(this.container.rotation) * 60, y: this.y - Math.sin(this.container.rotation) * 60 };
        }
        void this.lastHornAt;
        return null;
    }

    private place(): void {
        const a = this.route[this.seg], b = this.route[(this.seg + 1) % this.route.length];
        this.x = a.x + (b.x - a.x) * this.t; this.y = a.y + (b.y - a.y) * this.t;
        this.container.position.set(this.x, this.y);
        this.container.rotation = Math.atan2(b.y - a.y, b.x - a.x);
        this.container.zIndex = this.y + TRUCK_H / 2;
    }

    /** Top-down truck facing +x: cab (E), flatbed with ramps (W), amber beacon, hazard tail. Local (0,0) = top-left. */
    private static draw(c: CanvasRenderingContext2D): void {
        const W = TRUCK_W, H = TRUCK_H;
        softShadow(c, 4, 4, W - 8, H - 8, 18, 0.45);
        // wheels (6, under the chassis)
        for (const wx of [18, 44, 96, 122]) for (const wy of [2, H - 10]) { c.fillStyle = '#141414'; roundRect(c, wx, wy, 18, 8, 3); c.fill(); c.fillStyle = '#3a3a3a'; c.fillRect(wx + 3, wy + 2, 12, 4); }
        // flatbed: steel deck with ribs
        const dg = c.createLinearGradient(0, 4, 0, H - 4); dg.addColorStop(0, css(JUNKYARD_HEX.steelLight)); dg.addColorStop(0.5, css(JUNKYARD_HEX.steel)); dg.addColorStop(1, css(JUNKYARD_HEX.steelDark));
        c.fillStyle = dg; roundRect(c, 4, 6, 96, H - 12, 4); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; for (let rx = 14; rx < 96; rx += 12) { c.beginPath(); c.moveTo(rx, 8); c.lineTo(rx, H - 8); c.stroke(); }
        hazard(c, 4, 6, 10, H - 12, 6); // tail stripes (W end)
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(4, 6, 96, 2);
        // cab: tall block (E end) with roof, windshield band, amber beacon base
        const cg = c.createLinearGradient(100, 0, 146, 0); cg.addColorStop(0, '#f0a020'); cg.addColorStop(0.5, '#ffc14d'); cg.addColorStop(1, '#c97d12');
        c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, 102, 4, 46, H - 6, 8); c.fill();
        c.fillStyle = cg; roundRect(c, 100, 2, 46, H - 8, 8); c.fill();
        const wg = c.createLinearGradient(128, 6, 142, H - 12); wg.addColorStop(0, '#9fc3d8'); wg.addColorStop(0.5, '#2f3a44'); wg.addColorStop(1, '#1d242b');
        c.fillStyle = wg; roundRect(c, 128, 8, 14, H - 22, 3); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(130, 10, 4, 10);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(104, H / 2 - 8, 22, 12); // roof hatch
        c.fillStyle = '#f6ecb0'; c.fillRect(144, 8, 3, 8); c.fillRect(144, H - 22, 3, 8); // headlights
        // boom / hook arm over the bed
        cylinder(c, 60, H / 2 - 4, 40, 8, JUNKYARD_HEX.steelDark);
        c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.beginPath(); c.arc(60, H / 2, 6, 0, Math.PI * 2); c.fill();
    }
}
