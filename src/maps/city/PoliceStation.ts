import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * v0.55.0 — PoliceStation (Powietrzna stacja policji).
 *
 * Warstwa A planu taxi/police. Stoi obok AirTaxiStation (prawy-gorny róg). Niebieskie
 * neony, landing pad "H", obracajacy sie beacon. 100% solid cover (twarda kolizja).
 * Baza powietrznej policji ktora patroluje cyberpunk (Warstwa B) i skąd startuje wóz
 * pościgowy przy alarmie ECO CRIME (Warstwa C — reaktor faza krytyczna).
 *
 * Architektura jak AirTaxiStation (ICollidable, animacja przez buildings.forEach,
 * brak hit detection / bullets). Publiczne pole helipad (world coords) — punkt startu
 * patrolu/pościgu dla Warstw B/C.
 */

const COLOR_PLATFORM_LIGHT = 0x2e3a4a;
const COLOR_PLATFORM_MID = 0x222b38;
const COLOR_PLATFORM_DARK = 0x18202c;
const COLOR_EDGE_HI = 0x4a5a72;
const COLOR_BLUE = 0x2e9bff;          // policyjny niebieski neon
const COLOR_BLUE_HOT = 0x9cd4ff;      // jasny rdzen

interface BlinkLight {
    x: number;
    y: number;
    phase: number;
}

export class PoliceStation implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    public readonly helipad: { x: number; y: number };

    private container: PIXI.Container;
    private baseGfx: PIXI.Graphics;     // baked
    private glowGfx: PIXI.Graphics;     // baked neon, animated alpha (ADD)
    private beaconGfx: PIXI.Graphics;   // animated rotating sweep
    private lightsGfx: PIXI.Graphics;   // animated blink
    private signText: PIXI.Text;

    private blinks: BlinkLight[] = [];
    private animTime: number = 0;
    private beaconAngle: number = 0;

    private readonly cx: number;
    private readonly cy: number;

    constructor(x: number, y: number, parent: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = 150;
        this.h = 80;
        this.cx = this.w / 2;
        this.cy = 48;

        this.helipad = { x: x + this.cx, y: y + this.cy };

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + this.h;
        this.container.sortableChildren = true;
        parent.addChild(this.container);

        this.baseGfx = new PIXI.Graphics();
        this.baseGfx.zIndex = 0;
        this.glowGfx = new PIXI.Graphics();
        this.glowGfx.zIndex = 1;
        this.glowGfx.blendMode = PIXI.BLEND_MODES.ADD;
        this.beaconGfx = new PIXI.Graphics();
        this.beaconGfx.zIndex = 2;
        this.beaconGfx.blendMode = PIXI.BLEND_MODES.ADD;
        this.lightsGfx = new PIXI.Graphics();
        this.lightsGfx.zIndex = 3;
        this.container.addChild(this.baseGfx);
        this.container.addChild(this.glowGfx);
        this.container.addChild(this.beaconGfx);
        this.container.addChild(this.lightsGfx);

        this.signText = new PIXI.Text('POLICE', {
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 'bold',
            fill: COLOR_BLUE_HOT,
            stroke: 0x001428,
            strokeThickness: 3,
            letterSpacing: 3,
        });
        this.signText.anchor.set(0.5, 0);
        this.signText.x = this.w / 2;
        this.signText.y = 3;
        this.signText.zIndex = 4;
        this.container.addChild(this.signText);

        this.initBlinks();
        this.drawBase();
        this.drawGlow();
    }

    private initBlinks(): void {
        this.blinks = [
            { x: 8, y: 22, phase: 0.0 },
            { x: 142, y: 22, phase: 0.5 },
            { x: 8, y: 74, phase: 1.0 },
            { x: 142, y: 74, phase: 1.5 },
        ];
    }

    private drawBase(): void {
        const g = this.baseGfx;
        const W = this.w;
        const H = this.h;

        g.beginFill(0x000000, 0.32);
        g.drawRoundedRect(6, H - 4, W, 10, 6);
        g.endFill();

        g.beginFill(COLOR_PLATFORM_LIGHT, 1);
        g.drawRoundedRect(0, 16, W * 0.34, H - 16, 8);
        g.endFill();
        g.beginFill(COLOR_PLATFORM_MID, 1);
        g.drawRoundedRect(W * 0.32, 16, W * 0.36, H - 16, 8);
        g.endFill();
        g.beginFill(COLOR_PLATFORM_DARK, 1);
        g.drawRoundedRect(W * 0.66, 16, W * 0.34, H - 16, 8);
        g.endFill();

        g.lineStyle(1.5, COLOR_EDGE_HI, 0.9);
        g.moveTo(6, 18); g.lineTo(W - 6, 18);
        g.lineStyle(0);

        // Bolts
        for (const bx of [12, W - 12]) {
            for (const by of [24, H - 8]) {
                g.beginFill(0x0e141c, 0.8); g.drawCircle(bx + 0.5, by + 0.5, 2); g.endFill();
                g.beginFill(0x3a4658, 1);   g.drawCircle(bx, by, 1.6); g.endFill();
                g.beginFill(0x6a7a94, 1);   g.drawCircle(bx - 0.5, by - 0.5, 0.7); g.endFill();
            }
        }

        // Helipad "H" w niebieskim neonie
        const hx = this.cx, hy = this.cy;
        const r = 24;
        g.beginFill(0x101820, 0.8);
        g.drawCircle(hx, hy, r);
        g.endFill();
        g.lineStyle(2.5, COLOR_BLUE, 0.95);
        g.drawCircle(hx, hy, r);
        g.lineStyle(1, COLOR_BLUE, 0.55);
        g.drawCircle(hx, hy, r - 4);
        // litera H
        g.lineStyle(3, COLOR_BLUE_HOT, 0.95);
        g.moveTo(hx - 7, hy - 9); g.lineTo(hx - 7, hy + 9);
        g.moveTo(hx + 7, hy - 9); g.lineTo(hx + 7, hy + 9);
        g.moveTo(hx - 7, hy);     g.lineTo(hx + 7, hy);
        g.lineStyle(0);

        // Beacon base (na rogu — obracajace sie swiatlo)
        g.beginFill(0x0a1018, 1);
        g.drawCircle(W - 22, 26, 5);
        g.endFill();
        g.beginFill(COLOR_BLUE, 1);
        g.drawCircle(W - 22, 26, 3);
        g.endFill();
    }

    private drawGlow(): void {
        const g = this.glowGfx;
        g.beginFill(COLOR_BLUE, 0.5);
        g.drawCircle(this.cx, this.cy, 28);
        g.endFill();
        g.beginFill(COLOR_BLUE_HOT, 0.3);
        g.drawEllipse(this.w / 2, 11, 42, 11);
        g.endFill();
        this.glowGfx.alpha = 0.4;
    }

    update(_camX: number, _camY: number, _viewW: number, _viewH: number): void {
        this.animTime += 0.016;
        this.beaconAngle += 0.08;

        this.glowGfx.alpha = 0.35 + 0.18 * Math.sin(this.animTime * 2.5);
        this.signText.alpha = (Math.random() < 0.015) ? 0.6 : 1.0;

        // Obracajacy sie beacon — sweep cone z rogu (W-22, 26)
        this.beaconGfx.clear();
        const bx = this.w - 22, by = 26;
        const sweepLen = 30;
        const a = this.beaconAngle;
        const spread = 0.4;
        this.beaconGfx.beginFill(COLOR_BLUE, 0.28);
        this.beaconGfx.moveTo(bx, by);
        this.beaconGfx.lineTo(bx + Math.cos(a - spread) * sweepLen, by + Math.sin(a - spread) * sweepLen);
        this.beaconGfx.lineTo(bx + Math.cos(a + spread) * sweepLen, by + Math.sin(a + spread) * sweepLen);
        this.beaconGfx.closePath();
        this.beaconGfx.endFill();
        // hot core dot
        this.beaconGfx.beginFill(COLOR_BLUE_HOT, 0.9);
        this.beaconGfx.drawCircle(bx, by, 2);
        this.beaconGfx.endFill();

        // Blink lights
        this.lightsGfx.clear();
        for (const b of this.blinks) {
            const on = Math.sin(this.animTime * 5 + b.phase * Math.PI * 2) > 0.2;
            const al = on ? 0.95 : 0.15;
            this.lightsGfx.beginFill(COLOR_BLUE_HOT, al * 0.4);
            this.lightsGfx.drawCircle(b.x, b.y, 4);
            this.lightsGfx.endFill();
            this.lightsGfx.beginFill(COLOR_BLUE_HOT, al);
            this.lightsGfx.drawCircle(b.x, b.y, 1.8);
            this.lightsGfx.endFill();
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }
}