import * as PIXI from 'pixi.js';
import type { ICollidable } from '../types/MapType';
import { EffectsManager } from '../rendering/Effects';
import { AudioSys } from '../audio/AudioSys';

/**
 * v0.34.0 FAZA T7 — CRATE (skrzynia) AAA PREMIUM
 *
 * Niszczalna drewniana skrzynia. HP = 3 (jak ENEMY_NORMAL).
 * Respawn 60s po destruction w tym samym miejscu.
 *
 * Visual (AAA premium, jak BarnBuilding wood texture):
 *   - Jasne drewno (light pine) z wood grain (słoje)
 *   - 4 corner nails z głębią (2-circle iron pattern)
 *   - 2 horizontal iron straps (rust accent)
 *   - 3-4 vertical plank seams
 *   - Slight iso 3D look (top face + cienka front strip)
 *   - Chunky outline 2px
 *
 * Mechanics:
 *   - Solid collidable (player + bullets blocked)
 *   - takeDamage(dmg) → mini wood splinter spray
 *   - HP=0 → full destruction (16 splinters + procedural crack sound + 60s respawn)
 *   - isDestroyed: w/h zerowane (no collision), container hidden
 */

const CRATE_W = 36;
const CRATE_H = 36;
const CRATE_HP = 3;          // = ENEMY_NORMAL.hp
const RESPAWN_TIME = 60;     // seconds
const ISO_RISE = 4;          // top iso skew
const SIDE_DEPTH = 5;        // front side strip thickness

const COLORS = {
    // Light pine wood (jasne drewno)
    woodLight:      0xe8c894,    // very bright pine surface highlight
    woodTop:        0xd4ad6a,    // standard pine plank
    woodMid:        0xb38a4a,    // mid-tone grain
    woodDeep:       0x7a5a30,    // dark grain / seams
    woodShadow:     0x4a3818,    // outline / deep crack
    woodSide:       0x8a6a3a,    // side face (darker, in shadow)
    woodSideDeep:   0x5a4220,
    // Iron hardware (3D depth — 2-circle nail pattern jak BarnBuilding)
    ironDark:       0x3a2418,
    ironMid:        0x6a4828,
    ironLight:      0xa07854,
    ironHighlight:  0xd0a878,
    // Iron straps (rust accent)
    strapRust:      0xa05a2a,
    strapRustLt:    0xc7794a,
    strapRustDk:    0x6b3818,
    strapRustDeep:  0x3a1c0c,
    // Outline + shadow
    outline:        0x2a1810,
    aoShadow:       0x000000,
} as const;

export class Crate implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private origX: number;
    private origY: number;
    private origW: number;
    private origH: number;
    private hp: number;
    private maxHp: number = CRATE_HP;
    public isDestroyed: boolean = false;
    private respawnTimer: number = 0;
    private seed: number;

    private worldContainer: PIXI.Container;
    private effects: EffectsManager;
    private audio: AudioSys;

    private aoContainer: PIXI.Container;
    private crateContainer: PIXI.Container;

    constructor(
        x: number,
        y: number,
        seed: number,
        worldContainer: PIXI.Container,
        effects: EffectsManager,
        audio: AudioSys,
    ) {
        this.x = x;
        this.y = y;
        this.w = CRATE_W;
        this.h = CRATE_H;
        this.origX = x;
        this.origY = y;
        this.origW = CRATE_W;
        this.origH = CRATE_H;
        this.hp = CRATE_HP;
        this.seed = seed;
        this.worldContainer = worldContainer;
        this.effects = effects;
        this.audio = audio;

        // AO container (z=-86 jak buildings)
        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86;
        worldContainer.addChild(this.aoContainer);

        // Main crate container
        this.crateContainer = new PIXI.Container();
        this.crateContainer.zIndex = Math.floor(y + CRATE_H);
        worldContainer.addChild(this.crateContainer);

        this.drawAO();
        this.drawCrate();
    }

    // ═══════════════════════════════════════════════════════════
    // VISUAL — AAA premium crate
    // ═══════════════════════════════════════════════════════════
    private drawAO(): void {
        const { x, y } = this;
        const g = new PIXI.Graphics();
        const groundY = y + CRATE_H;

        // Mały kwadratowy cień SE (Barn-style scaled down)
        g.beginFill(COLORS.aoShadow, 0.32);
        g.drawPolygon([
            x + 4,                      groundY + 1,
            x + CRATE_W + 5,            groundY + 1,
            x + CRATE_W + 7,            groundY + 5,
            x + 6,                      groundY + 5,
        ]);
        g.endFill();

        g.beginFill(COLORS.aoShadow, 0.15);
        g.drawRect(x + 2, groundY + 5, CRATE_W + 6, 2);
        g.endFill();

        this.aoContainer.addChild(g);
    }

    private drawCrate(): void {
        const { x, y, seed } = this;
        const rng = this.makeRng(seed);
        const g = new PIXI.Graphics();

        // ─── 1. FRONT SIDE STRIP (3D bottom face, darker drewno) ───
        const sideTopY = y + CRATE_H - SIDE_DEPTH;
        const sideBotY = y + CRATE_H;
        g.beginFill(COLORS.woodSide, 1);
        g.drawRect(x, sideTopY, CRATE_W, SIDE_DEPTH);
        g.endFill();
        // Side gradient (lighter top edge → darker bot)
        g.beginFill(COLORS.woodMid, 0.5);
        g.drawRect(x, sideTopY, CRATE_W, 1.5);
        g.endFill();
        g.beginFill(COLORS.woodSideDeep, 0.55);
        g.drawRect(x, sideBotY - 1.5, CRATE_W, 1.5);
        g.endFill();
        // 2 plank seams na side
        for (let i = 1; i < 3; i++) {
            const sx = x + (CRATE_W * i) / 3;
            g.lineStyle(0.7, COLORS.woodSideDeep, 0.85);
            g.moveTo(sx, sideTopY + 0.5);
            g.lineTo(sx, sideBotY - 0.5);
            g.lineStyle(0);
        }

        // ─── 2. TOP FACE (main visible — light wood z wood grain) ───
        const topY = y;
        const topBotY = y + CRATE_H - SIDE_DEPTH;
        const topH = topBotY - topY;

        // Base gradient (highlight top → midtone bottom)
        g.beginFill(COLORS.woodLight, 1);
        g.drawRect(x, topY, CRATE_W, topH * 0.5);
        g.endFill();
        g.beginFill(COLORS.woodTop, 1);
        g.drawRect(x, topY + topH * 0.5, CRATE_W, topH * 0.5);
        g.endFill();
        // Subtle midtone overlay
        g.beginFill(COLORS.woodMid, 0.25);
        g.drawRect(x, topY + topH * 0.4, CRATE_W, topH * 0.55);
        g.endFill();

        // ─── 3. VERTICAL PLANK SEAMS (4 deski) ───
        const PLANK_COUNT = 4;
        for (let i = 1; i < PLANK_COUNT; i++) {
            const t = i / PLANK_COUNT;
            const wobble = (rng() - 0.5) * 0.8;
            const px = x + CRATE_W * t + wobble;

            // Deep seam shadow
            g.lineStyle(1.4, COLORS.woodDeep, 0.85);
            g.moveTo(px, topY + 0.5);
            g.lineTo(px, topBotY - 0.5);
            g.lineStyle(0);
            // Highlight line (sunlit edge of seam)
            g.lineStyle(0.6, COLORS.woodLight, 0.7);
            g.moveTo(px + 1, topY + 0.5);
            g.lineTo(px + 1, topBotY - 0.5);
            g.lineStyle(0);
        }

        // ─── 4. WOOD GRAIN (słoje) — falujące linie per plank ───
        for (let plank = 0; plank < PLANK_COUNT; plank++) {
            const plankX0 = x + CRATE_W * (plank / PLANK_COUNT);
            const plankX1 = x + CRATE_W * ((plank + 1) / PLANK_COUNT);
            const plankW = plankX1 - plankX0;

            // 2-3 grain lines per plank (curved)
            const grainCount = 2 + Math.floor(rng() * 2);
            for (let gline = 0; gline < grainCount; gline++) {
                const ry = topY + 3 + rng() * (topH - 6);
                const waveAmp = 0.4 + rng() * 0.6;
                const wavePhase = rng() * Math.PI;
                g.lineStyle(0.5, COLORS.woodDeep, 0.45);
                const steps = 8;
                let prevX = plankX0 + 1, prevY = ry;
                g.moveTo(prevX, prevY);
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const nx = plankX0 + 1 + (plankW - 2) * t;
                    const ny = ry + Math.sin(wavePhase + t * Math.PI * 1.5) * waveAmp;
                    g.lineTo(nx, ny);
                }
                g.lineStyle(0);
            }

            // 1-2 small knots per plank (oval dark spot)
            if (rng() > 0.45) {
                const kx = plankX0 + 2 + rng() * (plankW - 4);
                const ky = topY + 4 + rng() * (topH - 8);
                const kr = 0.9 + rng() * 0.8;
                g.beginFill(COLORS.woodDeep, 0.85);
                g.drawEllipse(kx, ky, kr * 1.15, kr * 0.85);
                g.endFill();
                // Inner ring (lighter shadow)
                g.lineStyle(0.4, COLORS.woodShadow, 0.7);
                g.drawEllipse(kx, ky, kr * 0.65, kr * 0.45);
                g.lineStyle(0);
                // Knot highlight
                g.beginFill(COLORS.woodLight, 0.35);
                g.drawCircle(kx - 0.2, ky - 0.2, kr * 0.3);
                g.endFill();
            }
        }

        // ─── 5. IRON STRAPS (2 horizontal rust bands) ───
        const strapPositions = [topY + topH * 0.22, topY + topH * 0.72];
        for (const sy of strapPositions) {
            // Strap body (rust)
            g.beginFill(COLORS.strapRust, 1);
            g.drawRect(x - 0.5, sy - 1.6, CRATE_W + 1, 3.2);
            g.endFill();
            // Strap shadow (bottom edge)
            g.beginFill(COLORS.strapRustDk, 0.85);
            g.drawRect(x - 0.5, sy + 0.6, CRATE_W + 1, 1.2);
            g.endFill();
            // Strap highlight (top edge — sunlit)
            g.beginFill(COLORS.strapRustLt, 0.75);
            g.drawRect(x - 0.5, sy - 1.6, CRATE_W + 1, 0.8);
            g.endFill();
            // Strap outline
            g.lineStyle(0.6, COLORS.strapRustDeep, 0.95);
            g.drawRect(x - 0.5, sy - 1.6, CRATE_W + 1, 3.2);
            g.lineStyle(0);

            // Strap also wraps na side face
            g.beginFill(COLORS.strapRustDk, 1);
            const sideStrapY = sy + topH - topH * 0.22 > sideTopY ? sideTopY + 1 : null;
            // (visualne dla 2nd strap which crosses to side)
        }

        // Iron strap also visible na side face (second strap wraps over edge)
        const sideStrapY = sideTopY + SIDE_DEPTH * 0.5 - 1;
        g.beginFill(COLORS.strapRustDk, 1);
        g.drawRect(x - 0.5, sideStrapY, CRATE_W + 1, 2.2);
        g.endFill();
        g.beginFill(COLORS.strapRust, 0.75);
        g.drawRect(x - 0.5, sideStrapY, CRATE_W + 1, 0.8);
        g.endFill();
        g.lineStyle(0.6, COLORS.strapRustDeep, 0.9);
        g.drawRect(x - 0.5, sideStrapY, CRATE_W + 1, 2.2);
        g.lineStyle(0);

        // ─── 6. CORNER NAILS (4 z głębią — 2-circle pattern jak BarnBuilding) ───
        const nailOffset = 3;
        const nailPositions = [
            { nx: x + nailOffset,            ny: topY + nailOffset },
            { nx: x + CRATE_W - nailOffset,  ny: topY + nailOffset },
            { nx: x + nailOffset,            ny: topBotY - nailOffset },
            { nx: x + CRATE_W - nailOffset,  ny: topBotY - nailOffset },
        ];
        for (const n of nailPositions) {
            this.drawNail(g, n.nx, n.ny);
        }

        // ─── 7. STRAP BOLTS (mocowanie iron strap do corner planks) ───
        // 4 bolts per strap (2 left + 2 right, na corners gdzie strap mounted)
        for (const sy of strapPositions) {
            const boltPositions = [
                { bx: x + 2,            by: sy },
                { bx: x + CRATE_W - 2,  by: sy },
            ];
            for (const b of boltPositions) {
                g.beginFill(COLORS.ironDark, 1);
                g.drawCircle(b.bx, b.by, 1);
                g.endFill();
                g.beginFill(COLORS.ironHighlight, 0.85);
                g.drawCircle(b.bx - 0.3, b.by - 0.3, 0.4);
                g.endFill();
            }
        }

        // ─── 8. OUTLINE — chunky 2px brawl-style ───
        g.lineStyle(2, COLORS.outline, 0.95);
        g.drawRect(x, topY, CRATE_W, CRATE_H);
        g.lineStyle(0);

        // Inner top-face outline (rozdziela top face od side face)
        g.lineStyle(1, COLORS.outline, 0.85);
        g.moveTo(x, topBotY);
        g.lineTo(x + CRATE_W, topBotY);
        g.lineStyle(0);

        // Corner sunlit highlight (NW — sun catches)
        g.lineStyle(1, COLORS.woodLight, 0.7);
        g.moveTo(x + 1.5, topY + 1.5);
        g.lineTo(x + CRATE_W - 1.5, topY + 1.5);
        g.moveTo(x + 1.5, topY + 1.5);
        g.lineTo(x + 1.5, topBotY - 1.5);
        g.lineStyle(0);

        this.crateContainer.addChild(g);
    }

    private drawNail(g: PIXI.Graphics, nx: number, ny: number): void {
        // Outer iron base (dark, większy)
        g.beginFill(COLORS.ironDark, 1);
        g.drawCircle(nx, ny, 1.8);
        g.endFill();
        // Mid iron tone (gradient hint)
        g.beginFill(COLORS.ironMid, 0.9);
        g.drawCircle(nx, ny, 1.4);
        g.endFill();
        // Inner core (light bright highlight)
        g.beginFill(COLORS.ironHighlight, 1);
        g.drawCircle(nx - 0.45, ny - 0.45, 0.7);
        g.endFill();
        // Catchlight (sunpoint specular)
        g.beginFill(0xffffff, 0.75);
        g.drawCircle(nx - 0.55, ny - 0.55, 0.3);
        g.endFill();
    }

    private makeRng(seed: number): () => number {
        let s = seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    // ═══════════════════════════════════════════════════════════
    // DAMAGE + RESPAWN MECHANICS
    // ═══════════════════════════════════════════════════════════
    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.destroy();
        } else {
            // Mini hit feedback (small splinter spray od miejsca trafienia)
            this.effects.spawnWoodSplinters(hitX, hitY, 5);
            // Subtle shake (lekka oscylacja crate)
            const shakeAmt = 1.5;
            this.crateContainer.x = (Math.random() - 0.5) * shakeAmt;
            this.crateContainer.y = (Math.random() - 0.5) * shakeAmt;
            setTimeout(() => {
                if (this.crateContainer && !this.isDestroyed) {
                    this.crateContainer.x = 0;
                    this.crateContainer.y = 0;
                }
            }, 80);
        }
    }

    private destroy(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        // Disable collision
        this.w = 0;
        this.h = 0;
        // Hide visual
        this.crateContainer.visible = false;
        this.aoContainer.visible = false;
        // Spawn fantastic splinter burst (16 drzazg) + sound
        const cx = this.origX + this.origW / 2;
        const cy = this.origY + this.origH / 2;
        this.effects.spawnWoodSplinters(cx, cy, 18);
        this.audio.playCrateBreak();
    }

    private respawn(): void {
        this.isDestroyed = false;
        this.hp = this.maxHp;
        this.w = this.origW;
        this.h = this.origH;
        this.crateContainer.visible = true;
        this.aoContainer.visible = true;
    }

    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        if (this.isDestroyed) {
            this.respawnTimer -= 1 / 60;
            if (this.respawnTimer <= 0) {
                this.respawn();
            }
        }
    }

    /**
     * v0.34.1: Extra padded hitbox dla PLAYER collision (8px buffer każda strona).
     * Mariusz feedback: "obecnie można na nie prawie wjeżdzać, zaaplikuj większą granicę wjazdu".
     *
     * Player collision: ten extra box dodawany do `buildings[]` (player iterates) — większa granica.
     * Bullet collision: tylko sam Crate w `solidBuildings[]` (bullets hit visual size exactly).
     *
     * Dynamic getters dla `isDestroyed` handling — gdy crate zniszczony, w/h zwracają 0
     * (player może wjechać w miejsce zniszczonej skrzyni do respawn).
     */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        return [{
            get x() { return self.isDestroyed ? -10000 : self.origX - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.origY - PAD; },
            get w() { return self.isDestroyed ? 0 : self.origW + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : self.origH + PAD * 2; },
            update: () => {},
        }];
    }
}