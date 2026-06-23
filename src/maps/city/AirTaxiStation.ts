import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * v0.55.0 — AirTaxiStation (Naziemna stacja powietrznych taksowek).
 *
 * Warstwa A planu taxi/police. Baza 1 w prawym-gornym rogu cyberpunku: platforma z
 * dwoma stanowiskami lądowania (zolte + czerwone, oznakowane neonami), neon "AIR TAXI",
 * migajace swiatla pozycyjne. 100% solid cover (twarda kolizja jak CyberBuilding).
 *
 * Architektura zgodna z industrial props (ICollidable), ale BEZ hit detection:
 *   - Constructor(x, y, parent) — x,y = top-left footprint
 *   - Implements ICollidable — push do buildings + solidBuildings
 *   - update(camX, camY, viewW, viewH) — animuje neon (pulse) + blink lights.
 *     Driven przez buildings.forEach (NIE wymaga bullets, NIE robi early-return) —
 *     to odroznia od reactor/scrap/turbine (te maja hit detection przez dedykowana petle).
 *
 * Publiczne pola yellowStand / redStand (world coords) — punkty lądowania dla Warstwy B
 * (ruch taksowek). Taksowka żółta startuje stąd → baza-BL; czerwona stąd → baza-BR.
 *
 * MVP: brak audio. Chodniki + parkingi = osobno w buildCityTexture() (niekolizyjne).
 */

const COLOR_PLATFORM_LIGHT = 0x3a3f4a;
const COLOR_PLATFORM_MID = 0x2c3038;
const COLOR_PLATFORM_DARK = 0x1e2128;
const COLOR_EDGE_HI = 0x5a6172;
const COLOR_YELLOW = 0xffd21e;       // żółte stanowisko
const COLOR_RED = 0xff2e4d;          // czerwone stanowisko
const COLOR_SIGN = 0xffe14a;         // neon "AIR TAXI"

interface BlinkLight {
    x: number;
    y: number;
    phase: number;
    color: number;
}

export class AirTaxiStation implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    // Punkty lądowania w world coords (dla Warstwy B — ruch taksowek)
    public readonly yellowStand: { x: number; y: number };
    public readonly redStand: { x: number; y: number };

    private container: PIXI.Container;
    private baseGfx: PIXI.Graphics;     // baked
    private glowGfx: PIXI.Graphics;     // baked neon shape, animated alpha (ADD)
    private lightsGfx: PIXI.Graphics;   // animated blink lights
    private signText: PIXI.Text;

    private blinks: BlinkLight[] = [];
    private animTime: number = 0;

    constructor(x: number, y: number, parent: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = 150;
        this.h = 90;

        // Stanowiska: żółte lewe, czerwone prawe (lokalne centra → world)
        this.yellowStand = { x: x + 45, y: y + 56 };
        this.redStand = { x: x + 110, y: y + 56 };

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

        this.initBlinks();
        this.drawBase();
        this.drawGlow();
    }

    private initBlinks(): void {
        // 4 narozne swiatla pozycyjne (na rogach platformy) + 2 przy stanowiskach
        this.blinks = [
            { x: 8, y: 24, phase: 0.0, color: 0xffffff },
            { x: 142, y: 24, phase: 0.5, color: 0xffffff },
            { x: 8, y: 84, phase: 1.0, color: 0xffffff },
            { x: 142, y: 84, phase: 1.5, color: 0xffffff },
            { x: 45, y: 30, phase: 0.3, color: COLOR_YELLOW },
            { x: 110, y: 30, phase: 0.8, color: COLOR_RED },
        ];
    }

    private drawBase(): void {
        const g = this.baseGfx;
        const W = this.w;
        const H = this.h;

        // Cast shadow (offset dol-prawo, light upper-left)
        g.beginFill(0x000000, 0.32);
        g.drawRoundedRect(6, H - 4, W, 10, 6);
        g.endFill();

        // Platforma — 3-stripe gradient (cylindryczne shading dla bryły)
        g.beginFill(COLOR_PLATFORM_LIGHT, 1);
        g.drawRoundedRect(0, 18, W * 0.34, H - 18, 8);
        g.endFill();
        g.beginFill(COLOR_PLATFORM_MID, 1);
        g.drawRoundedRect(W * 0.32, 18, W * 0.36, H - 18, 8);
        g.endFill();
        g.beginFill(COLOR_PLATFORM_DARK, 1);
        g.drawRoundedRect(W * 0.66, 18, W * 0.34, H - 18, 8);
        g.endFill();

        // Top edge highlight (light catch)
        g.lineStyle(1.5, COLOR_EDGE_HI, 0.9);
        g.moveTo(6, 20); g.lineTo(W - 6, 20);
        g.lineStyle(0);

        // Panel lines + bolts
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

        // Stanowisko ŻÓŁTE (lewe) — neon outline + krzyż lądowania + numer
        this.drawStand(g, 45, 56, COLOR_YELLOW, '1');
        // Stanowisko CZERWONE (prawe)
        this.drawStand(g, 110, 56, COLOR_RED, '2');
    }

    private drawStand(g: PIXI.Graphics, cx: number, cy: number, color: number, _num: string): void {
        const r = 22;
        // Tlo stanowiska (ciemniejsze koło — landing pad surface)
        g.beginFill(0x16181e, 0.8);
        g.drawCircle(cx, cy, r);
        g.endFill();
        // Neon ring (kolor stanowiska)
        g.lineStyle(2.5, color, 0.95);
        g.drawCircle(cx, cy, r);
        g.lineStyle(1, color, 0.6);
        g.drawCircle(cx, cy, r - 4);
        // Krzyż lądowania (+)
        g.lineStyle(2, color, 0.9);
        g.moveTo(cx - 9, cy); g.lineTo(cx + 9, cy);
        g.moveTo(cx, cy - 9); g.lineTo(cx, cy + 9);
        g.lineStyle(0);
        // Markery kierunkowe (3 chevrony na obwodzie)
        g.lineStyle(2, color, 0.7);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            const mx = cx + Math.cos(a) * (r - 2);
            const my = cy + Math.sin(a) * (r - 2);
            g.drawCircle(mx, my, 1.6);
        }
        g.lineStyle(0);
    }

    /**
     * Glow layer (ADD) — neon poświata wokół stanowisk + sign. Alpha pulsuje w update.
     */
    private drawGlow(): void {
        const g = this.glowGfx;
        // poświata żółta wokół lewego stanowiska
        g.beginFill(COLOR_YELLOW, 0.5);
        g.drawCircle(45, 56, 26);
        g.endFill();
        // poświata czerwona wokół prawego
        g.beginFill(COLOR_RED, 0.5);
        g.drawCircle(110, 56, 26);
        g.endFill();
        // poświata sign (góra)
        g.beginFill(COLOR_SIGN, 0.35);
        g.drawEllipse(this.w / 2, 12, 50, 12);
        g.endFill();
        this.glowGfx.alpha = 0.4;
    }

    update(_camX: number, _camY: number, _viewW: number, _viewH: number): void {
        this.animTime += 0.016;

        // Neon glow pulse (oddychanie)
        this.glowGfx.alpha = 0.35 + 0.18 * Math.sin(this.animTime * 2.5);

        // Sign subtle flicker (zepsuty neon co jakis czas)
        this.signText.alpha = (Math.random() < 0.02) ? 0.55 : 1.0;

        // Blink lights
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