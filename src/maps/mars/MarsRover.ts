import * as PIXI from 'pixi.js';
import { MARS_HEX, MARS_ROVER_ROUTE } from '../MarsMap';

/**
 * MarsRover — an old survey rover still doing its rounds (grammar layer 9).
 *
 * FAZA MARS M4b (playtest: "brakuje mi jakiegos niezobowiazujacego lazika
 * marsjanskiego pathfinder, ktory sobie (bezkolizyjnie) bada skaly i droppuje
 * co jakis czas gema — jak karawana na pustyni").
 *
 * Engine copied from PenguinColony (the newer, better of the two patrol engines):
 *   - waypoint LOOP (not ping-pong): the rover keeps circling its survey route
 *   - drop timer accumulated FROM DELTA, not Date.now() — a paused game must not
 *     bank up drops the way a wall-clock timer would
 *   - baked sprite instead of live vectors (Caravan redraws bezier every frame,
 *     which shimmers on mobile with antialias off — lesson C1)
 *   - facing flip from the segment's dirX sign, which cannot chatter on vertical
 *     legs the way an atan2 threshold can
 *
 * NO COLLISION at all — it is ambient life, it drives past you, never blocks.
 * Route waypoints and every leg are verified clear of solids by the generator
 * (V6 in tools/mars_m1_layout.mjs), so it never appears to drive through a rock.
 */

export type RoverDropType = 'gem' | 'heart' | 'magnet';
export interface RoverDrop { type: RoverDropType; x: number; y: number; }

const SPEED = 0.42;              // px per delta unit (60 fps baseline)
const DROP_INTERVAL_MS = 15000;  // same cadence as caravan / penguins
const SCAN_PERIOD_MS = 3400;     // sensor mast sweep
const BAKE_RES = 3;              // supersample: small animated art (C1)
/**
 * +20% (playtest: the rover read as a toy next to the tank). Applied to the
 * CONTAINER, not the sprite: the sweep cone and the wheel dust are drawn in the
 * container's local space, so scaling the sprite alone would leave them behind at
 * the old size. The sprite's scale.x still carries the facing flip, untouched.
 * Route clearance was re-verified against this size (V6 box 52 -> 62).
 */
const ROVER_SCALE = 1.2;

let _roverTex: PIXI.Texture | null = null;
/** Body drawn facing RIGHT (+X); flip via scale.x, like every side-view NPC. */
const BOX = { w: 62, h: 40, ox: 31, oy: 26 };

function getRoverTexture(): PIXI.Texture {
    if (_roverTex) return _roverTex;
    const cv = document.createElement('canvas');
    cv.width = BOX.w * BAKE_RES;
    cv.height = BOX.h * BAKE_RES;
    const c = cv.getContext('2d')!;
    c.scale(BAKE_RES, BAKE_RES);

    // six wheels (rocker-bogie, the real Pathfinder silhouette)
    c.fillStyle = '#3a3230';
    for (const wx of [10, 25, 44]) {
        c.beginPath(); c.ellipse(wx, 30, 6.5, 7, 0, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#5a4e49';
    for (const wx of [10, 25, 44]) {
        c.beginPath(); c.ellipse(wx - 1, 29, 4, 4.5, 0, 0, Math.PI * 2); c.fill();
    }
    // rocker arms
    c.strokeStyle = '#7d8894';
    c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(10, 29); c.lineTo(19, 21); c.lineTo(25, 29); c.stroke();
    c.beginPath(); c.moveTo(25, 24); c.lineTo(44, 29); c.stroke();

    // chassis box
    c.fillStyle = '#c9d4dc';
    c.beginPath(); c.roundRect(9, 12, 38, 12, 3); c.fill();
    c.fillStyle = '#9aa6b2';
    c.beginPath(); c.roundRect(9, 19, 38, 5, 2); c.fill();

    // solar deck on top (this rover charges itself)
    c.fillStyle = '#2b2f52';
    c.beginPath(); c.roundRect(6, 6, 44, 7, 2); c.fill();
    c.strokeStyle = '#4a5080';
    c.lineWidth = 0.9;
    for (let gx = 12; gx < 49; gx += 7) { c.beginPath(); c.moveTo(gx, 7); c.lineTo(gx, 12); c.stroke(); }
    c.fillStyle = 'rgba(255,232,200,0.22)';
    c.beginPath(); c.roundRect(6, 6, 44, 3, 2); c.fill();

    // sensor mast + dish, facing forward
    c.strokeStyle = '#9aa6b2';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(43, 12); c.lineTo(47, 3); c.stroke();
    c.fillStyle = '#eef2f5';
    c.beginPath(); c.ellipse(48, 3, 4.5, 3, -0.3, 0, Math.PI * 2); c.fill();

    // instrument arm reaching down-forward (it "studies rocks")
    c.strokeStyle = '#7d8894';
    c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(46, 20); c.lineTo(55, 26); c.stroke();
    c.fillStyle = '#6a5c52';
    c.beginPath(); c.arc(56, 27, 2.4, 0, Math.PI * 2); c.fill();

    _roverTex = PIXI.Texture.from(cv);
    return _roverTex;
}

interface Seg { x0: number; y0: number; x1: number; y1: number; len: number; cum: number; }

export class MarsRover {
    private container: PIXI.Container;
    private sprite: PIXI.Sprite;
    private gfxScan: PIXI.Graphics;      // sensor sweep cone + sample glint
    private gfxDust: PIXI.Graphics;      // wheel dust puffs

    private segs: Seg[] = [];
    private total = 0;
    private progress = 0;
    private dropTimerMs = 0;
    private dustPhase = 0;

    /**
     * @param startPhase 0..1 offset along the loop AND into the drop timer. Two
     *   rovers built in the same frame would otherwise start at progress 0 with
     *   identical timers and drop their samples in lockstep every 15 s.
     */
    constructor(
        worldContainer: PIXI.Container,
        route: ReadonlyArray<{ x: number; y: number }> = MARS_ROVER_ROUTE,
        startPhase: number = 0,
    ) {
        // ALL display objects up front (E1)
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite(getRoverTexture());
        this.gfxScan = new PIXI.Graphics();
        this.gfxDust = new PIXI.Graphics();

        this.sprite.anchor.set(BOX.ox / BOX.w, BOX.oy / BOX.h);
        this.sprite.scale.set(1 / BAKE_RES);
        this.container.scale.set(ROVER_SCALE);

        this.container.addChild(this.gfxDust);
        this.container.addChild(this.gfxScan);
        this.container.addChild(this.sprite);
        worldContainer.addChild(this.container);

        // closed loop: last waypoint connects back to the first
        for (let i = 0; i < route.length; i++) {
            const a = route[i];
            const b = route[(i + 1) % route.length];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            this.segs.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, len, cum: this.total });
            this.total += len;
        }

        const phase = ((startPhase % 1) + 1) % 1;
        this.progress = this.total * phase;
        this.dropTimerMs = DROP_INTERVAL_MS * phase;
    }

    /** Position + heading at the current path progress. */
    private pointAt(p: number): { x: number; y: number; dirX: number; dirY: number } {
        let d = ((p % this.total) + this.total) % this.total;
        for (const s of this.segs) {
            if (d <= s.cum + s.len) {
                const t = (d - s.cum) / s.len;
                return {
                    x: s.x0 + (s.x1 - s.x0) * t,
                    y: s.y0 + (s.y1 - s.y0) * t,
                    dirX: (s.x1 - s.x0) / s.len,
                    dirY: (s.y1 - s.y0) / s.len,
                };
            }
        }
        const last = this.segs[this.segs.length - 1];
        return { x: last.x1, y: last.y1, dirX: 1, dirY: 0 };
    }

    /**
     * Drive + survey. Returns a drop the same way Caravan/PenguinColony do, so
     * main.ts consumes it with the existing pickup-spawn code.
     */
    public update(delta: number): RoverDrop | null {
        this.progress += SPEED * delta;
        const pos = this.pointAt(this.progress);

        this.container.x = pos.x;
        this.container.y = pos.y;
        this.container.zIndex = pos.y + 14;     // Y-sort, slight bias forward

        // facing from segment direction sign (no atan2 chatter on vertical legs)
        if (Math.abs(pos.dirX) > 0.05) {
            this.sprite.scale.x = (pos.dirX < 0 ? -1 : 1) / BAKE_RES;
        }
        // slight lean into the slope of travel, never a full rotation
        this.container.rotation = pos.dirY * 0.10 * (this.sprite.scale.x < 0 ? -1 : 1);

        const now = Date.now();

        // sensor sweep: a soft cone in front, plus a glint when it "reads" a sample
        const scan = this.gfxScan;
        scan.clear();
        const sweep = Math.sin((now % SCAN_PERIOD_MS) / SCAN_PERIOD_MS * Math.PI * 2);
        const dir = this.sprite.scale.x < 0 ? -1 : 1;
        scan.beginFill(MARS_HEX.baseCyan, 0.10);
        scan.moveTo(16 * dir, -4);
        scan.lineTo(52 * dir, -14 + sweep * 12);
        scan.lineTo(52 * dir, 6 + sweep * 12);
        scan.endFill();
        scan.beginFill(MARS_HEX.baseCyan, 0.5 + 0.3 * Math.sin(now / 220));
        scan.drawCircle(17 * dir, -12, 1.9);
        scan.endFill();

        // wheel dust — thin, cheap, only while moving
        this.dustPhase += delta * 0.14;
        const dust = this.gfxDust;
        dust.clear();
        for (let i = 0; i < 3; i++) {
            const t = ((this.dustPhase + i * 0.33) % 1);
            const dx = -dir * (10 + t * 26);
            const dy = 10 - t * 5;
            dust.beginFill(MARS_HEX.duneLight, 0.22 * (1 - t));
            dust.drawEllipse(dx, dy, 4 + t * 9, 2.4 + t * 4);
            dust.endFill();
        }

        // drop timer accumulated from delta (pause-safe, penguin pattern)
        this.dropTimerMs += delta * (1000 / 60);
        if (this.dropTimerMs >= DROP_INTERVAL_MS) {
            this.dropTimerMs = 0;
            const roll = Math.random();
            const type: RoverDropType = roll < 0.80 ? 'gem' : roll < 0.95 ? 'heart' : 'magnet';
            return { type, x: pos.x, y: pos.y + 8 };
        }
        return null;
    }
}
