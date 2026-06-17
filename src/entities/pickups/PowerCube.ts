/**
 * PowerCube.ts — FAZA 8.6 (v0.44.0) port z v4.48.
 *
 * Pickup który dropuje 30% chance z regular enemy / 100% z boss (capped 10/match w GameSession).
 * 2 typy random 50/50:
 *  - 'dmg' (red) → +5% damage bonus do bullets (capped +50% przy 10 dmg cubes)
 *  - 'hp'  (blue) → +0.25 maxHp + +0.25 hp current
 *
 * Risk/reward mechanic (Enemy.ts cube stealing):
 *  - Enemies w 160px radius skanują active cubes
 *  - Jeśli cubeDist < playerDist * 0.7 → enemy idzie po cube zamiast po graczu
 *  - Touch → cube.active = false (cube znika, enemy NIE dostaje bonusu)
 *  - Megaboss SKIPS stealing logic (chronimy phase-based AI)
 *
 * Visual port z v4.48:
 *  - Diamond/octagon shape, radius 20
 *  - Bobbing (sin pulse * 5px), breathing scale (±13%), rotation (0.035 rad/frame)
 *  - Outer glow ring + inner facet (lighter shade)
 *  - Sparkle flash co ~90 frames (4 outward dashes)
 *  - Icon: ⚔ (dmg) lub 💙 (hp), bold sans-serif, white + black stroke
 */

import * as PIXI from 'pixi.js';

export type PowerCubeType = 'dmg' | 'hp';

const COLORS = {
    dmg: { main: 0xe74c3c, light: 0xff7675 },
    hp:  { main: 0x2980b9, light: 0x74b9ff },
} as const;

const ICONS = {
    dmg: '⚔',
    hp:  '💙',
} as const;

export class PowerCube {
    public x: number;
    public y: number;
    public readonly radius: number = 20;
    public readonly type: PowerCubeType;
    public active: boolean = true;

    public container: PIXI.Container;
    private bodyGfx: PIXI.Graphics;
    private innerFacetGfx: PIXI.Graphics;
    private glowGfx: PIXI.Graphics;
    private sparkGfx: PIXI.Graphics;
    private iconText: PIXI.Text;

    private pulse: number;
    private rot: number;
    private sparkleTimer: number = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        // 50/50 random type
        this.type = Math.random() < 0.5 ? 'dmg' : 'hp';
        this.pulse = Math.random() * Math.PI * 2;
        this.rot = Math.random() * Math.PI * 2;

        const colors = COLORS[this.type];

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 100;
        this.container.sortableChildren = false;

        // Outer glow (largest layer, drawn first)
        this.glowGfx = new PIXI.Graphics();
        this.glowGfx.beginFill(colors.main, 1);
        this.glowGfx.drawCircle(0, 0, this.radius + 6);
        this.glowGfx.endFill();
        this.glowGfx.alpha = 0.2;
        this.container.addChild(this.glowGfx);

        // Main body (octagonal diamond, top-down view)
        this.bodyGfx = new PIXI.Graphics();
        this.drawBody(colors.main);
        this.container.addChild(this.bodyGfx);

        // Inner facet (lighter shade, smaller octagon centered)
        this.innerFacetGfx = new PIXI.Graphics();
        this.drawInnerFacet(colors.light);
        this.container.addChild(this.innerFacetGfx);

        // Icon text (⚔ or 💙)
        this.iconText = new PIXI.Text(ICONS[this.type], {
            fontFamily: 'sans-serif',
            fontSize: Math.round(this.radius * 0.75),
            fontWeight: 'bold',
            fill: 0xffffff,
            stroke: 0x000000,
            strokeThickness: 2,
        });
        this.iconText.anchor.set(0.5);
        this.container.addChild(this.iconText);

        // Sparkle layer (drawn last, on top — cleared/redrawn each frame)
        this.sparkGfx = new PIXI.Graphics();
        this.container.addChild(this.sparkGfx);

        worldContainer.addChild(this.container);
    }

    private drawBody(color: number): void {
        this.bodyGfx.clear();
        const r = this.radius;
        this.bodyGfx.lineStyle(2, 0x000000, 1);
        this.bodyGfx.beginFill(color, 1);
        this.bodyGfx.moveTo(0, -r);
        this.bodyGfx.lineTo(r * 0.72, -r * 0.72);
        this.bodyGfx.lineTo(r, 0);
        this.bodyGfx.lineTo(r * 0.72, r * 0.72);
        this.bodyGfx.lineTo(0, r);
        this.bodyGfx.lineTo(-r * 0.72, r * 0.72);
        this.bodyGfx.lineTo(-r, 0);
        this.bodyGfx.lineTo(-r * 0.72, -r * 0.72);
        this.bodyGfx.closePath();
        this.bodyGfx.endFill();
    }

    private drawInnerFacet(color: number): void {
        this.innerFacetGfx.clear();
        const r = this.radius;
        this.innerFacetGfx.beginFill(color, 0.55);
        this.innerFacetGfx.moveTo(0, -r * 0.55);
        this.innerFacetGfx.lineTo(r * 0.4, -r * 0.4);
        this.innerFacetGfx.lineTo(r * 0.55, 0);
        this.innerFacetGfx.lineTo(r * 0.4, r * 0.4);
        this.innerFacetGfx.lineTo(0, r * 0.55);
        this.innerFacetGfx.lineTo(-r * 0.4, r * 0.4);
        this.innerFacetGfx.lineTo(-r * 0.55, 0);
        this.innerFacetGfx.lineTo(-r * 0.4, -r * 0.4);
        this.innerFacetGfx.closePath();
        this.innerFacetGfx.endFill();
    }

    /**
     * Animacja: bobbing + breathing + rotation + sparkle.
     * Wywoływane co klatkę w main.ts gameLoop.
     */
    update(delta: number): void {
        if (!this.active) return;

        this.pulse += 0.09 * delta;
        this.rot += 0.035 * delta;
        this.sparkleTimer += delta;

        // Floating bobbing (Y oscillation)
        const bobY = Math.sin(this.pulse * 0.65) * 5;
        this.container.y = this.y + bobY;

        // Breathing scale + rotation
        const sc = 1 + Math.sin(this.pulse) * 0.13;
        this.container.scale.set(sc);
        this.container.rotation = this.rot;

        // Outer glow alpha pulse
        this.glowGfx.alpha = 0.2 + Math.sin(this.pulse) * 0.07;

        // Sparkle effect: 4 outward dashes when sin signal threshold
        if (Math.sin(this.sparkleTimer * 0.07) > 0.85) {
            this.sparkGfx.clear();
            this.sparkGfx.lineStyle(1.5, 0xffffff, 0.9);
            const sp = this.radius * 1.4;
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2 + this.sparkleTimer * 0.02;
                const x1 = Math.cos(a) * this.radius * 0.8;
                const y1 = Math.sin(a) * this.radius * 0.8;
                const x2 = Math.cos(a) * sp;
                const y2 = Math.sin(a) * sp;
                this.sparkGfx.moveTo(x1, y1);
                this.sparkGfx.lineTo(x2, y2);
            }
        } else {
            this.sparkGfx.clear();
        }
    }

    destroy(): void {
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        this.active = false;
    }
}