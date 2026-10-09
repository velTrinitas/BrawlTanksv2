import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { JUNKYARD_HEX } from '../JunkyardMap';
import { bakeCanvas, block, css, darken, grime, lighten, propRng, roundRect, softShadow } from './junkyardBake';

/**
 * ScrapOffice — the scrap dealer's portakabin (ZLOMOWISKO, solid). REV 2: Canvas 2D — gradient walls and
 * roof, glass with reflections, AC unit as a small block, megaphone pole (the "Wyprzedaz czesci" event
 * speaks from here, J6), hand-painted sign, cinder blocks, soft shadow.
 */
const RISE = 56;

export class ScrapOffice implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    public container: PIXI.Container;

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container) {
        // REV 4 (playtest: 'collider za gleboko — czolg znika za portiernia'): the hitbox covers the ROOF too
        // (top face is drawn y-RISE..y+h-RISE), so a tank can never park under the roof and vanish behind it.
        this.x = x; this.y = y - RISE + 16; this.w = w; this.h = h + RISE - 16;
        this.container = new PIXI.Container();
        this.container.position.set(x, y);
        this.container.zIndex = y + h;
        worldContainer.addChild(this.container);
        const rng = propRng(x, y, 21);
        bakeCanvas(this.container, `office_${x}_${y}`, w, h, { l: 12, t: RISE + 70, r: 50, b: 48 }, c => this.draw(c, rng));
    }

    update(): void { /* static */ }

    private draw(c: CanvasRenderingContext2D, rng: () => number): void {
        const W = this.w, H = this.h;
        const wall = 0xd8d2c4, roof = 0x8d857a;
        softShadow(c, 0, 0, W, H, RISE, 0.45);
        // cinder blocks under the cabin
        c.fillStyle = css(JUNKYARD_HEX.concreteDk); c.fillRect(6, H - 4, 18, 9); c.fillRect(W - 24, H - 4, 18, 9);
        // walls + roof as one block (roof colour on top, wall colour on the S face)
        block(c, 0, 0, W, H, RISE, { top: roof, side: wall, east: darken(wall, 0.72) });
        // S wall: panel seams, windows with sky reflection, door
        c.strokeStyle = css(darken(wall, 0.8), 0.6); c.lineWidth = 1;
        for (let sx = 22; sx < W; sx += 44) { c.beginPath(); c.moveTo(sx, H - RISE + 2); c.lineTo(sx, H - 2); c.stroke(); }
        for (const wx of [20, W - 66]) {
            c.fillStyle = css(darken(wall, 0.6)); c.fillRect(wx - 2, H - RISE + 10, 50, 30);
            const g = c.createLinearGradient(wx, H - RISE + 12, wx + 46, H - RISE + 38);
            g.addColorStop(0, '#8fb6cf'); g.addColorStop(0.5, '#3a4652'); g.addColorStop(1, '#263038');
            c.fillStyle = g; c.fillRect(wx, H - RISE + 12, 46, 26);
            c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(wx + 3, H - RISE + 14, 14, 9);
            c.strokeStyle = css(lighten(wall, 0.5)); c.lineWidth = 1.5; c.strokeRect(wx + 0.5, H - RISE + 12.5, 45, 25);
            c.beginPath(); c.moveTo(wx + 23, H - RISE + 12); c.lineTo(wx + 23, H - RISE + 38); c.stroke();
        }
        const dg = c.createLinearGradient(W / 2 - 16, 0, W / 2 + 16, 0);
        dg.addColorStop(0, '#7a5636'); dg.addColorStop(0.5, '#5e4229'); dg.addColorStop(1, '#4a3320');
        c.fillStyle = dg; c.fillRect(W / 2 - 16, H - RISE + 8, 32, RISE - 8);
        c.fillStyle = css(JUNKYARD_HEX.chrome, 0.8); c.fillRect(W / 2 + 8, H - RISE + 30, 4, 4);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(W / 2 - 16, H - RISE + 8, 32, 4);
        // roof: tar seams + drip edge
        c.strokeStyle = css(darken(roof, 0.7), 0.55); c.lineWidth = 2;
        for (let r = 24; r < W; r += 44) { c.beginPath(); c.moveTo(r, -RISE + 3); c.lineTo(r, H - RISE - 3); c.stroke(); }
        // AC unit (small block) with grille
        block(c, W - 62, 14 - RISE, 36, 26, 10, { top: 0xc4c8ce, side: 0x7d8288 });
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(W - 58, 8 - RISE + k * 5); c.lineTo(W - 30, 8 - RISE + k * 5); c.stroke(); }
        // megaphone pole with a red horn (INTERACTION accent)
        const px = W * 0.5 + 42;
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(px + 2, -RISE - 38, 4, 60);
        const pg = c.createLinearGradient(px, 0, px + 5, 0); pg.addColorStop(0, '#555'); pg.addColorStop(0.4, '#9a9a9a'); pg.addColorStop(1, '#333');
        c.fillStyle = pg; c.fillRect(px, -RISE - 40, 5, 62);
        const hg = c.createLinearGradient(px + 6, -RISE - 48, px + 34, -RISE - 20); hg.addColorStop(0, '#4a4a4a'); hg.addColorStop(1, '#1f1f1f');
        c.fillStyle = hg; c.beginPath(); c.moveTo(px + 5, -RISE - 36); c.lineTo(px + 34, -RISE - 50); c.lineTo(px + 34, -RISE - 22); c.closePath(); c.fill();
        c.fillStyle = css(JUNKYARD_HEX.beaconRed); c.fillRect(px + 32, -RISE - 50, 5, 28);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(px + 33, -RISE - 48, 1.5, 24);
        // painted sign board (W end of the roof): "ZLOM" as rust strokes
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(8, -RISE + 10, 66, 22);
        const sg = c.createLinearGradient(0, -RISE + 8, 0, -RISE + 28); sg.addColorStop(0, '#f6eed8'); sg.addColorStop(1, '#d9ccae');
        c.fillStyle = sg; roundRect(c, 6, -RISE + 8, 66, 22, 3); c.fill();
        c.fillStyle = css(JUNKYARD_HEX.rust); c.fillRect(11, -RISE + 13, 56, 5); c.fillRect(11, -RISE + 21, 38, 4);
        grime(c, 2, H - RISE, W - 4, RISE, rng, 4);
    }
}
