/**
 * PowerCube.ts — FAZA 8.6 (v0.44.0) port z v4.48. Mobile-crisp F4.1f.
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
 * F4.1f (mobile): ciało (oktagon z ukosnymi krawedziami) OBRACA sie co klatke —
 * na mobile (AA renderera OFF) rotujacy sie wektor "pikselowal". Fix: cialo + facet
 * + glow sa WYPIECZONE w Canvas 2D (AA) -> Textures -> Sprite'y; obrot/skala idzie
 * na sprite (bilinear = gladko). Tekstury cachowane per-typ (module-level) => zero
 * rebake/leaku. Ikona (PIXI.Text) i tak jest teksturą; sparkle (krotki blysk) zostaje.
 */

import * as PIXI from 'pixi.js';
import { worldRng } from '../../systems/Rng'; // Z0.1: seeded gameplay RNG

export type PowerCubeType = 'dmg' | 'hp';

const COLORS = {
    dmg: { main: 0xe74c3c, light: 0xff7675 },
    hp:  { main: 0x2980b9, light: 0x74b9ff },
} as const;

const ICONS = {
    dmg: '⚔',
    hp:  '💙',
} as const;

const RADIUS = 20;

interface CubeTex { body: PIXI.Texture; glow: PIXI.Texture; }
const CUBE_CACHE = new Map<PowerCubeType, CubeTex>();

export class PowerCube {
    public x: number;
    public y: number;
    public readonly radius: number = RADIUS;
    public readonly type: PowerCubeType;
    public active: boolean = true;

    public container: PIXI.Container;
    private glowSprite: PIXI.Sprite;
    private sparkGfx: PIXI.Graphics;
    private iconText: PIXI.Text;

    private pulse: number;
    private rot: number;
    private sparkleTimer: number = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        this.type = worldRng.chance(0.5) ? 'dmg' : 'hp'; // Z0.1: seeded (typ kostki = gameplay)
        this.pulse = Math.random() * Math.PI * 2;
        this.rot = Math.random() * Math.PI * 2;

        const tex = getCubeTextures(this.type);

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 100;
        this.container.sortableChildren = false;

        // Outer glow (baked circle) — alpha pulsowana
        this.glowSprite = new PIXI.Sprite(tex.glow);
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.alpha = 0.2;
        this.container.addChild(this.glowSprite);

        // Body + inner facet (baked) — obraca sie plynnie jako sprite
        const bodySprite = new PIXI.Sprite(tex.body);
        bodySprite.anchor.set(0.5);
        this.container.addChild(bodySprite);

        // Icon text (⚔ or 💙) — tekst = tekstura, crisp
        this.iconText = new PIXI.Text(ICONS[this.type], {
            fontFamily: 'sans-serif',
            fontSize: Math.round(RADIUS * 0.75),
            fontWeight: 'bold',
            fill: 0xffffff,
            stroke: 0x000000,
            strokeThickness: 2,
        });
        this.iconText.anchor.set(0.5);
        this.container.addChild(this.iconText);

        // Sparkle (krotki blysk, thin — redraw tylko przy progu)
        this.sparkGfx = new PIXI.Graphics();
        this.container.addChild(this.sparkGfx);

        worldContainer.addChild(this.container);
    }

    /** Animacja: bobbing + breathing + rotation + sparkle. */
    update(delta: number): void {
        if (!this.active) return;

        this.pulse += 0.09 * delta;
        this.rot += 0.035 * delta;
        this.sparkleTimer += delta;

        const bobY = Math.sin(this.pulse * 0.65) * 5;
        this.container.y = this.y + bobY;

        const sc = 1 + Math.sin(this.pulse) * 0.13;
        this.container.scale.set(sc);
        this.container.rotation = this.rot;

        this.glowSprite.alpha = 0.2 + Math.sin(this.pulse) * 0.07;

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

// =================================================================
// Canvas 2D bake (AA) — cialo/facet/glow, cache per-typ
// =================================================================

function getCubeTextures(type: PowerCubeType): CubeTex {
    const cached = CUBE_CACHE.get(type);
    if (cached) return cached;
    const c = COLORS[type];
    const built = { body: PIXI.Texture.from(buildBodyCanvas(c.main, c.light)), glow: PIXI.Texture.from(buildGlowCanvas(c.main)) };
    CUBE_CACHE.set(type, built);
    return built;
}

function octagonPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    c.beginPath();
    c.moveTo(cx + 0, cy - r);
    c.lineTo(cx + r * 0.72, cy - r * 0.72);
    c.lineTo(cx + r, cy + 0);
    c.lineTo(cx + r * 0.72, cy + r * 0.72);
    c.lineTo(cx + 0, cy + r);
    c.lineTo(cx - r * 0.72, cy + r * 0.72);
    c.lineTo(cx - r, cy + 0);
    c.lineTo(cx - r * 0.72, cy - r * 0.72);
    c.closePath();
}

function buildBodyCanvas(main: number, light: number): HTMLCanvasElement {
    const r = RADIUS;
    const S = Math.ceil((r + 3) * 2);
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const cx = S / 2, cy = S / 2;

    // Cialo (oktagon + czarny obrys)
    octagonPath(c, cx, cy, r);
    c.fillStyle = '#' + main.toString(16).padStart(6, '0');
    c.fill();
    c.lineWidth = 2; c.strokeStyle = '#000000'; c.stroke();

    // Inner facet (jasniejszy, mniejszy)
    c.globalAlpha = 0.55;
    octagonPath(c, cx, cy, r * 0.55);
    c.fillStyle = '#' + light.toString(16).padStart(6, '0');
    c.fill();
    c.globalAlpha = 1;

    return cv;
}

function buildGlowCanvas(main: number): HTMLCanvasElement {
    const r = RADIUS + 6;
    const S = Math.ceil((r + 1) * 2);
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#' + main.toString(16).padStart(6, '0');
    c.beginPath();
    c.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    c.fill();
    return cv;
}
