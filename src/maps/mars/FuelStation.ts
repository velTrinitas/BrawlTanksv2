import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { MARS_HEX, MARS_FUEL_STATION } from '../MarsMap';

/**
 * FuelStation — landing apron + fuel tank where the UFO sets down to refuel
 * (grammar layer 4 partly solid, M5c).
 *
 * Built on the air-taxi helipad language from Cyber City: a marked circle, corner
 * chevrons, perimeter lights and a beacon. Reskinned for Mars — alien green
 * instead of city cyan, because the customer here is the saucer.
 *
 * Collision split (this is the load-bearing part): the APRON IS PASSABLE, only
 * the TANK is solid. A landing pad you cannot drive onto would be a dead square
 * of map, and the whole point is that the player can roll up to a grounded UFO
 * and decide whether to poke it.
 */

const PAD = MARS_FUEL_STATION.pad;
const TANK = MARS_FUEL_STATION.tank;

export class FuelStation {
    /** Where the saucer touches down — centre of the apron. */
    public static readonly LANDING = Object.freeze({
        x: PAD.x + PAD.w / 2,
        y: PAD.y + PAD.h / 2,
    });

    private gfxPad: PIXI.Graphics;      // static apron markings (ground band)
    private gfxTank: PIXI.Graphics;     // static tank + pump
    private gfxLights: PIXI.Graphics;   // per-frame: perimeter chase + beacon

    constructor(worldContainer: PIXI.Container) {
        // ALL Graphics up front (E1)
        this.gfxPad = new PIXI.Graphics();
        this.gfxTank = new PIXI.Graphics();
        this.gfxLights = new PIXI.Graphics();

        this.gfxPad.zIndex = 9;                      // ground decal band
        this.gfxLights.zIndex = 10;
        this.gfxTank.zIndex = TANK.y + TANK.h;       // Y-sorted like a building
        worldContainer.addChild(this.gfxPad);
        worldContainer.addChild(this.gfxLights);
        worldContainer.addChild(this.gfxTank);

        this.drawPad();
        this.drawTank();
    }

    /** Only the tank collides — the apron must stay driveable (see header). */
    public getCollisionRects(): ICollidable[] {
        return [{ x: TANK.x, y: TANK.y, w: TANK.w, h: TANK.h, update: () => {} }];
    }

    /**
     * Apron in 2.5D (M5d: "mniej jak placek, bardziej jakby lezala").
     * A flat rectangle reads as a sticker on the map. The apron now has a visible
     * SLAB EDGE: a dark rim on the S/E sides plus a lit top face, so the deck sits
     * a few centimetres proud of the regolith and casts its own shadow. Corner
     * pylons with lamp heads give it vertical structure.
     */
    private drawPad(): void {
        const g = this.gfxPad;
        const { x, y, w, h } = PAD;
        const cx = x + w / 2, cy = y + h / 2;
        const SLAB = 9;                    // apparent slab thickness

        // regolith pushed up around the slab
        g.beginFill(MARS_HEX.duneLight, 0.12);
        g.drawRoundedRect(x - 14, y - 10, w + 28, h + 30, 16);
        g.endFill();
        // ground shadow, offset SE
        g.beginFill(MARS_HEX.depth, 0.26);
        g.drawRoundedRect(x + 8, y + SLAB + 6, w, h, 12);
        g.endFill();
        // SLAB EDGE (the 2.5D read): dark side wall under the top face
        g.beginFill(0x5f544c, 1);
        g.drawRoundedRect(x, y + SLAB, w, h, 12);
        g.endFill();
        g.beginFill(0x6d6058, 1);
        g.drawRoundedRect(x, y + SLAB * 0.5, w, h, 12);
        g.endFill();
        // top face, lifted by the slab thickness
        g.beginFill(0x8a7d73, 0.98);
        g.drawRoundedRect(x, y, w, h, 12);
        g.endFill();
        g.beginFill(0x9c8f84, 0.95);        // sunlit NW half
        g.drawRoundedRect(x + 5, y + 5, w - 10, h * 0.40, 9);
        g.endFill();
        // lit lip along the north edge = the slab catches the sun
        g.lineStyle(2, 0xb0a294, 0.7);
        g.moveTo(x + 8, y + 1); g.lineTo(x + w - 8, y + 1);
        g.lineStyle(0);

        // hazard border
        g.lineStyle(3, 0xe8a33d, 0.45);
        g.drawRoundedRect(x + 4, y + 4, w - 8, h - 8, 8);
        g.lineStyle(0);

        // landing circle + cross-hair (alien green: this pad serves the saucer)
        g.lineStyle(4, MARS_HEX.alienGreen, 0.42);
        g.drawCircle(cx, cy, 54);
        g.lineStyle(2.5, MARS_HEX.alienGreen, 0.30);
        g.drawCircle(cx, cy, 38);
        g.moveTo(cx - 22, cy); g.lineTo(cx + 22, cy);
        g.moveTo(cx, cy - 22); g.lineTo(cx, cy + 22);
        g.lineStyle(0);

        // corner chevrons pointing in
        g.beginFill(MARS_HEX.alienGreen, 0.35);
        const cc: [number, number, number, number][] = [
            [x + 14, y + 14, 1, 1], [x + w - 14, y + 14, -1, 1],
            [x + 14, y + h - 14, 1, -1], [x + w - 14, y + h - 14, -1, -1],
        ];
        for (const [px, py, sx, sy] of cc) {
            g.drawPolygon([px, py, px + 22 * sx, py, px, py + 22 * sy]);
        }
        g.endFill();

        // scorch marks under the circle — it gets used
        g.beginFill(MARS_HEX.trackDark, 0.16);
        g.drawEllipse(cx, cy + 6, 40, 17);
        g.endFill();

        // CORNER PYLONS with lamp heads: vertical structure so the station has
        // height, not just footprint.
        for (const [px, py] of [[x + 10, y + 8], [x + w - 10, y + 8],
                                [x + 10, y + h - 8], [x + w - 10, y + h - 8]] as [number, number][]) {
            g.beginFill(MARS_HEX.depth, 0.3);
            g.drawEllipse(px + 3, py + 2, 5, 2.5);
            g.endFill();
            g.beginFill(0x5f544c, 1);        // shaded side of the post
            g.drawRect(px - 1, py - 20, 4, 22);
            g.endFill();
            g.beginFill(0x8f8378, 1);        // sunlit face
            g.drawRect(px - 3, py - 20, 3, 22);
            g.endFill();
            g.beginFill(0x9aa6b2, 1);        // lamp head
            g.drawRoundedRect(px - 5, py - 25, 9, 6, 2);
            g.endFill();
        }
    }

    /** Fuel tank: horizontal cylinder on a cradle, plus the pump and hose. */
    private drawTank(): void {
        const g = this.gfxTank;
        const { x, y, w, h } = TANK;

        // ground shadow SE
        g.beginFill(MARS_HEX.depth, 0.30);
        g.drawRoundedRect(x + 7, y + 10, w, h - 10, 10);
        g.endFill();

        // cradle
        g.beginFill(0x5e5148, 1);
        g.drawRect(x + 8, y + h - 26, w - 16, 22);
        g.endFill();

        // cylinder (vertical drum seen 3/4 from above)
        g.beginFill(0x9aa6b2, 1);
        g.drawRoundedRect(x, y, w, h - 22, 16);
        g.endFill();
        g.beginFill(0xb9c4cf, 1);                     // sunlit NW band
        g.drawRoundedRect(x + 4, y + 4, w - 8, (h - 22) * 0.36, 12);
        g.endFill();
        g.beginFill(0x76818d, 1);                     // shaded SE band
        g.drawRoundedRect(x + 4, y + (h - 22) * 0.66, w - 8, (h - 22) * 0.28, 12);
        g.endFill();

        // reinforcing hoops
        g.lineStyle(2, 0x66707a, 0.7);
        for (let i = 1; i <= 2; i++) {
            const hy = y + (h - 22) * (i / 3);
            g.moveTo(x + 2, hy); g.lineTo(x + w - 2, hy);
        }
        g.lineStyle(0);

        // green content gauge — reads as "alien fuel", ties tank to the saucer
        g.beginFill(0x2a2f28, 1);
        g.drawRoundedRect(x + w - 22, y + 14, 10, h - 56, 4);
        g.endFill();
        g.beginFill(MARS_HEX.alienGreen, 0.75);
        g.drawRoundedRect(x + w - 20, y + 34, 6, h - 78, 3);
        g.endFill();

        // hose snaking toward the landing circle
        g.lineStyle(5, 0x3f3a36, 0.95);
        g.moveTo(x + 4, y + h - 34);
        g.quadraticCurveTo(x - 46, y + h - 6, PAD.x + PAD.w / 2 + 40, PAD.y + PAD.h / 2 + 24);
        g.lineStyle(0);
        g.beginFill(0x6a5c52, 1);                     // nozzle resting on the apron
        g.drawRoundedRect(PAD.x + PAD.w / 2 + 34, PAD.y + PAD.h / 2 + 18, 16, 10, 3);
        g.endFill();
    }

    /** Perimeter light chase + tank beacon. One small redraw per frame. */
    public update(): void {
        const now = Date.now();
        const g = this.gfxLights;
        g.clear();

        const { x, y, w, h } = PAD;
        const n = 12;
        for (let i = 0; i < n; i++) {
            // walk the perimeter
            const t = i / n;
            let px: number, py: number;
            if (t < 0.25) { px = x + w * (t / 0.25); py = y; }
            else if (t < 0.5) { px = x + w; py = y + h * ((t - 0.25) / 0.25); }
            else if (t < 0.75) { px = x + w * (1 - (t - 0.5) / 0.25); py = y + h; }
            else { px = x; py = y + h * (1 - (t - 0.75) / 0.25); }

            const phase = (now / 90 - i) % n;
            const on = phase >= 0 && phase < 2.6;
            const a = on ? 0.9 : 0.28;
            g.beginFill(MARS_HEX.alienGreen, a * 0.3);
            g.drawCircle(px, py, 6);
            g.endFill();
            g.beginFill(on ? 0xd9f7e6 : MARS_HEX.alienGreen, a);
            g.drawCircle(px, py, 2.4);
            g.endFill();
        }

        // tank beacon
        const beat = 0.5 + 0.5 * Math.sin(now / 640);
        const bx = TANK.x + TANK.w / 2, by = TANK.y - 6;
        g.beginFill(0xe8a33d, 0.25 * beat);
        g.drawCircle(bx, by, 9);
        g.endFill();
        g.beginFill(0xffd08a, 0.9 * beat);
        g.drawCircle(bx, by, 3);
        g.endFill();
    }
}
