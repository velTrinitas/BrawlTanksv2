import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * v0.55.0 — AirTaxiStation (Naziemna stacja powietrznych taksowek).
 * v0.60.0 — dodany tryb SINGLE-STAND (jedno stanowisko) dla dolnych baz (yellowB/redB),
 *           z zachowaniem pelnej kompatybilnosci wstecznej trybu DUAL (gorna stacja).
 *
 * Warstwa A planu taxi/police.
 *   - DUAL (domyslny, gorna baza TR): platforma 150x90 z dwoma stanowiskami (zolte+czerwone),
 *     neon "AIR TAXI". yellowStand + redStand (world coords) dla Warstwy B.
 *   - SINGLE (v0.60.0, dolne bazy BL/BR): kompaktowa platforma 84x84 z JEDNYM stanowiskiem
 *     w kolorze standColor. standCenter (world coords) = punkt ladowania dla 1 taksowki.
 *     Zastepuje gole "kolko z plusem" rysowane wczesniej przez SkyTraffic.drawLandingPad.
 *
 * Architektura (ICollidable), animacja przez buildings.forEach (BEZ hit detection, BEZ bullets).
 * SINGLE moze byc niekolizyjny — wtedy NIE dodawac do buildings/solidBuildings w main.ts;
 * update() i tak musi byc wolany (dedykowana petla LUB buildings.forEach jesli dodany tylko
 * do animacji). W naszym przypadku: niekolizyjny -> osobna tablica + dedykowana petla update.
 */

const COLOR_PLATFORM_LIGHT = 0x3a3f4a;
const COLOR_PLATFORM_MID = 0x2c3038;
const COLOR_PLATFORM_DARK = 0x1e2128;
const COLOR_EDGE_HI = 0x5a6172;
const COLOR_YELLOW = 0xffd21e;       // zolte stanowisko
const COLOR_RED = 0xff2e4d;          // czerwone stanowisko
const COLOR_SIGN = 0xffe14a;         // neon "AIR TAXI"

interface BlinkLight {
    x: number;
    y: number;
    phase: number;
    color: number;
}

export type TaxiStationMode = 'dual' | 'single';

export class AirTaxiStation implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    // Punkty ladowania w world coords (dla Warstwy B - ruch taksowek)
    // DUAL: yellowStand + redStand. SINGLE: standCenter (jeden, w kolorze standColor).
    public readonly yellowStand: { x: number; y: number };
    public readonly redStand: { x: number; y: number };
    public readonly standCenter: { x: number; y: number };

    private mode: TaxiStationMode;
    private standColor: number;

    private container: PIXI.Container;
    private baseGfx: PIXI.Graphics;     // baked
    private glowGfx: PIXI.Graphics;     // baked neon shape, animated alpha (ADD)
    private lightsGfx: PIXI.Graphics;   // animated blink lights
    private signText: PIXI.Text | null = null;

    private blinks: BlinkLight[] = [];
    private animTime: number = 0;

    /**
     * @param x,y top-left footprint
     * @param parent worldContainer
     * @param mode 'dual' (gorna, domyslny) | 'single' (dolne bazy)
     * @param standColor kolor stanowiska w trybie single (COLOR_YELLOW lub COLOR_RED)
     */
    constructor(
        x: number, y: number,
        parent: PIXI.Container,
        mode: TaxiStationMode = 'dual',
        standColor: number = COLOR_YELLOW,
    ) {
        this.x = x;
        this.y = y;
        this.mode = mode;
        this.standColor = standColor;

        if (mode === 'dual') {
            this.w = 150;
            this.h = 90;
            this.yellowStand = { x: x + 45, y: y + 56 };
            this.redStand = { x: x + 110, y: y + 56 };
            this.standCenter = { x: x + 75, y: y + 56 };
        } else {
            // SINGLE: kompaktowa platforma 84x84, jedno stanowisko wysrodkowane.
            this.w = 84;
            this.h = 84;
            const cx = x + this.w / 2;
            const cy = y + this.h * 0.58; // zgodne z math-verification (stand = y + h*0.58)
            this.standCenter = { x: cx, y: cy };
            this.yellowStand = { x: cx, y: cy };
            this.redStand = { x: cx, y: cy };
        }

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
        this.lightsGfx = new PIXI.Graphics();
        this.lightsGfx.zIndex = 2;
        this.container.addChild(this.baseGfx);
        this.container.addChild(this.glowGfx);
        this.container.addChild(this.lightsGfx);

        if (mode === 'dual') {
            this.signText = new PIXI.Text('AIR TAXI', {
                fontFamily: 'monospace',
                fontSize: 13,
                fontWeight: 'bold',
                fill: COLOR_SIGN,
                stroke: 0x1a1500,
                strokeThickness: 3,
                letterSpacing: 2,
            });
            this.signText.anchor.set(0.5, 0);
            this.signText.x = this.w / 2;
            this.signText.y = 4;
            this.signText.zIndex = 3;
            this.container.addChild(this.signText);
        }

        this.initBlinks();
        this.drawBase();
        this.drawGlow();
    }

    private initBlinks(): void {
        if (this.mode === 'dual') {
            this.blinks = [
                { x: 8, y: 24, phase: 0.0, color: 0xffffff },
                { x: 142, y: 24, phase: 0.5, color: 0xffffff },
                { x: 8, y: 84, phase: 1.0, color: 0xffffff },
                { x: 142, y: 84, phase: 1.5, color: 0xffffff },
                { x: 45, y: 30, phase: 0.3, color: COLOR_YELLOW },
                { x: 110, y: 30, phase: 0.8, color: COLOR_RED },
            ];
        } else {
            this.blinks = [
                { x: 8, y: 14, phase: 0.0, color: 0xffffff },
                { x: this.w - 8, y: 14, phase: 0.5, color: 0xffffff },
                { x: 8, y: this.h - 8, phase: 1.0, color: this.standColor },
                { x: this.w - 8, y: this.h - 8, phase: 1.5, color: this.standColor },
            ];
        }
    }

    private drawBase(): void {
        const g = this.baseGfx;
        const W = this.w;
        const H = this.h;

        if (this.mode === 'dual') {
            g.beginFill(0x000000, 0.32);
            g.drawRoundedRect(6, H - 4, W, 10, 6);
            g.endFill();

            g.beginFill(COLOR_PLATFORM_LIGHT, 1);
            g.drawRoundedRect(0, 18, W * 0.34, H - 18, 8);
            g.endFill();
            g.beginFill(COLOR_PLATFORM_MID, 1);
            g.drawRoundedRect(W * 0.32, 18, W * 0.36, H - 18, 8);
            g.endFill();
            g.beginFill(COLOR_PLATFORM_DARK, 1);
            g.drawRoundedRect(W * 0.66, 18, W * 0.34, H - 18, 8);
            g.endFill();

            g.lineStyle(1.5, COLOR_EDGE_HI, 0.9);
            g.moveTo(6, 20); g.lineTo(W - 6, 20);
            g.lineStyle(0);

            g.lineStyle(1, 0x14161c, 0.6);
            g.moveTo(0, 52); g.lineTo(W, 52);
            g.lineStyle(0);
            for (const bx of [12, W - 12]) {
                for (const by of [26, H - 8]) {
                    g.beginFill(0x14161c, 0.8); g.drawCircle(bx + 0.5, by + 0.5, 2); g.endFill();
                    g.beginFill(0x4a505c, 1);   g.drawCircle(bx, by, 1.6); g.endFill();
                    g.beginFill(0x7a8294, 1);   g.drawCircle(bx - 0.5, by - 0.5, 0.7); g.endFill();
                }
            }

            this.drawStand(g, 45, 56, COLOR_YELLOW, '1');
            this.drawStand(g, 110, 56, COLOR_RED, '2');
        } else {
            // SINGLE: kompaktowa platforma z 1 stanowiskiem
            g.beginFill(0x000000, 0.32);
            g.drawRoundedRect(5, H - 4, W, 9, 6);
            g.endFill();

            g.beginFill(COLOR_PLATFORM_LIGHT, 1);
            g.drawRoundedRect(0, 10, W * 0.34, H - 10, 8);
            g.endFill();
            g.beginFill(COLOR_PLATFORM_MID, 1);
            g.drawRoundedRect(W * 0.32, 10, W * 0.36, H - 10, 8);
            g.endFill();
            g.beginFill(COLOR_PLATFORM_DARK, 1);
            g.drawRoundedRect(W * 0.66, 10, W * 0.34, H - 10, 8);
            g.endFill();

            g.lineStyle(1.5, COLOR_EDGE_HI, 0.9);
            g.moveTo(5, 12); g.lineTo(W - 5, 12);
            g.lineStyle(0);

            for (const bx of [10, W - 10]) {
                for (const by of [18, H - 8]) {
                    g.beginFill(0x14161c, 0.8); g.drawCircle(bx + 0.5, by + 0.5, 2); g.endFill();
                    g.beginFill(0x4a505c, 1);   g.drawCircle(bx, by, 1.6); g.endFill();
                    g.beginFill(0x7a8294, 1);   g.drawCircle(bx - 0.5, by - 0.5, 0.7); g.endFill();
                }
            }

            this.drawStand(g, W / 2, H * 0.58, this.standColor, '1');
        }
    }

    private drawStand(g: PIXI.Graphics, cx: number, cy: number, color: number, _num: string): void {
        const r = 22;
        g.beginFill(0x16181e, 0.8);
        g.drawCircle(cx, cy, r);
        g.endFill();
        g.lineStyle(2.5, color, 0.95);
        g.drawCircle(cx, cy, r);
        g.lineStyle(1, color, 0.6);
        g.drawCircle(cx, cy, r - 4);
        g.lineStyle(2, color, 0.9);
        g.moveTo(cx - 9, cy); g.lineTo(cx + 9, cy);
        g.moveTo(cx, cy - 9); g.lineTo(cx, cy + 9);
        g.lineStyle(0);
        g.lineStyle(2, color, 0.7);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            const mx = cx + Math.cos(a) * (r - 2);
            const my = cy + Math.sin(a) * (r - 2);
            g.drawCircle(mx, my, 1.6);
        }
        g.lineStyle(0);
    }

    private drawGlow(): void {
        const g = this.glowGfx;
        if (this.mode === 'dual') {
            g.beginFill(COLOR_YELLOW, 0.5);
            g.drawCircle(45, 56, 26);
            g.endFill();
            g.beginFill(COLOR_RED, 0.5);
            g.drawCircle(110, 56, 26);
            g.endFill();
            g.beginFill(COLOR_SIGN, 0.35);
            g.drawEllipse(this.w / 2, 12, 50, 12);
            g.endFill();
        } else {
            g.beginFill(this.standColor, 0.5);
            g.drawCircle(this.w / 2, this.h * 0.58, 26);
            g.endFill();
        }
        this.glowGfx.alpha = 0.4;
    }

    update(_camX: number, _camY: number, _viewW: number, _viewH: number): void {
        this.animTime += 0.016;

        this.glowGfx.alpha = 0.35 + 0.18 * Math.sin(this.animTime * 2.5);

        if (this.signText) {
            this.signText.alpha = (Math.random() < 0.02) ? 0.55 : 1.0;
        }

        this.lightsGfx.clear();
        for (const b of this.blinks) {
            const on = Math.sin(this.animTime * 4 + b.phase * Math.PI * 2) > 0.3;
            const a = on ? 0.95 : 0.18;
            this.lightsGfx.beginFill(b.color, a * 0.4);
            this.lightsGfx.drawCircle(b.x, b.y, 4);
            this.lightsGfx.endFill();
            this.lightsGfx.beginFill(b.color, a);
            this.lightsGfx.drawCircle(b.x, b.y, 1.8);
            this.lightsGfx.endFill();
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }
}