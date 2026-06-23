import * as PIXI from 'pixi.js';

/**
 * v0.52.0 fix #21 — Cyberpunk Map Visual Upgrade #2: Map Border (analog TropicalBorder/SandstormBorder).
 *
 * Cel: ograniczenie wyjazdu z mapy + dekoracja neon-fence w stylu cyberpunk.
 *
 * Architektura zgodna z TropicalBorder/SandstormBorder:
 *   - Constructor(worldW, worldH, parent) — dodaje siebie do worldContainer
 *   - getCollisionRects() — zwraca 4 ICollidable strip walls do pushowania na buildings/solidBuildings
 *   - update() — wolane co frame w tickerze (anim scanline + pulse glow)
 *
 * Visual layers (od najnizszego z-index):
 *   1. Edge glow gradient (60px stripe magenta/cyan od krawedzi do wewnatrz)
 *   2. Holo-fence vertical lines (scanline grid co 12px)
 *   3. Neonowe pylony rozstawione co ~250 px wzdluz krawedzi (high glow points)
 *
 * v0.52.0 fix #22: usuniety animowany sweep scanline (raziacy podczas grania).
 *
 * Collision: cienki 20px strip na kazdej krawedzi (low conflict z budynkami).
 * Budynki bliskie krawedzi: B1/B7 y=60 → gap 40 do top, B23 end x=1913 → gap 67 do right.
 */

interface IBorderCollidable {
    x: number;
    y: number;
    w: number;
    h: number;
    update(camX: number, camY: number, viewW: number, viewH: number): void;
}

/**
 * Statyczny prostokat kolizyjny krawedzi mapy. Implementuje ICollidable interface
 * uzywany przez PlayerCollisionSystem / EnemyAvoidance — w==0 budynek skipowany,
 * tu w>0 wiec dziala jak solidny mur.
 */
class BorderCollisionRect implements IBorderCollidable {
    constructor(public x: number, public y: number, public w: number, public h: number) {}
    update(_camX: number, _camY: number, _viewW: number, _viewH: number): void {
        // static — collision boxes never animate
    }
}

const COLLISION_THICKNESS = 20;       // cienki — minimalizuje konflikty z budynkami przy krawedziach
const VISUAL_STRIPE_WIDTH = 70;       // gradient stripe 70px od krawedzi do wewnatrz
const PYLON_SPACING = 240;            // pylony co 240 px wzdluz kazdej krawedzi
const PYLON_RADIUS = 14;
const FENCE_LINE_SPACING = 14;        // holo-fence vertical lines

// Paleta cyberpunk — zsynchronizowana z resztą mapy:
//   - cyan (n1 type 1) + magenta (n1 type 5) = klasyk cyberpunk
//   - yellow (n1 type 3) = akcent zgodny z road dashes
const COLOR_CYAN = 0x00ffff;
const COLOR_MAGENTA = 0xcc00ff;
const COLOR_YELLOW = 0xf1c40f;
const COLOR_BG = 0x0a0a14;

export class CyberpunkBorder {
    private container: PIXI.Container;
    private staticGfx: PIXI.Graphics;     // baseline glow + fence + pylons (raz)
    private pylonPulseGfx: PIXI.Graphics; // pulsujace centra pylonow (anim)
    private worldW: number;
    private worldH: number;
    private collisionRects: BorderCollisionRect[];
    private animTime: number = 0;
    private pylonPositions: Array<{ x: number, y: number, edge: 'top' | 'bottom' | 'left' | 'right' }> = [];

    constructor(worldW: number, worldH: number, parent: PIXI.Container) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.container = new PIXI.Container();
        this.container.zIndex = -50; // pod budynkami (kt6re maja zIndex = y+h+ox+x*1e-4 ~ 100+), nad asfaltem (-100)
        parent.addChild(this.container);

        this.staticGfx = new PIXI.Graphics();
        this.pylonPulseGfx = new PIXI.Graphics();
        this.container.addChild(this.staticGfx);
        this.container.addChild(this.pylonPulseGfx);

        this.computePylonPositions();
        this.drawStaticLayer();
        this.collisionRects = this.buildCollisionRects();
    }

    /**
     * Rozmieszczenie pylonow rownomiernie po 4 krawedziach z marginesem od narozy
     * (zeby pylony narozne nie nakladaly sie).
     */
    private computePylonPositions(): void {
        const MARGIN = 100;
        // Top + Bottom
        for (let x = MARGIN; x < this.worldW - MARGIN; x += PYLON_SPACING) {
            this.pylonPositions.push({ x, y: COLLISION_THICKNESS + 18, edge: 'top' });
            this.pylonPositions.push({ x, y: this.worldH - COLLISION_THICKNESS - 18, edge: 'bottom' });
        }
        // Left + Right
        for (let y = MARGIN; y < this.worldH - MARGIN; y += PYLON_SPACING) {
            this.pylonPositions.push({ x: COLLISION_THICKNESS + 18, y, edge: 'left' });
            this.pylonPositions.push({ x: this.worldW - COLLISION_THICKNESS - 18, y, edge: 'right' });
        }
    }

    /**
     * Single bake'owana warstwa statyczna: glow gradient + holo-fence + pylon bases.
     * Wszystko w jednym Graphics (~ 200 fillow, zero kosztu per-frame).
     */
    private drawStaticLayer(): void {
        const g = this.staticGfx;
        const W = this.worldW;
        const H = this.worldH;
        const T = VISUAL_STRIPE_WIDTH;

        // ===== Layer 1: Edge dark backing =====
        // Ciemna tafla pod neonowymi elementami, kontrastuje z asfaltem.
        g.beginFill(COLOR_BG, 0.65);
        g.drawRect(0, 0, W, T);                  // top strip
        g.drawRect(0, H - T, W, T);              // bottom strip
        g.drawRect(0, T, T, H - 2 * T);          // left strip (skip rogi juz pokryte)
        g.drawRect(W - T, T, T, H - 2 * T);      // right strip
        g.endFill();

        // ===== Layer 2: Inner glow gradient — 8 alpha steps fading from edge inward =====
        // Manual gradient w Canvas-style (PIXI Graphics nie obsluguje gradientow natywnie).
        // 8 prostokatow z malejaca alfa = wizualnie gradient cyan/magenta.
        const STEPS = 8;
        for (let i = 0; i < STEPS; i++) {
            const t = i / STEPS;
            const inset = i * (T / STEPS);
            const stripeH = T / STEPS;
            // Alternuje cyan/magenta dla rich neon mix
            const col = (i % 2 === 0) ? COLOR_CYAN : COLOR_MAGENTA;
            const alpha = 0.06 * (1 - t * 0.7);
            g.beginFill(col, alpha);
            // top
            g.drawRect(0, inset, W, stripeH);
            // bottom
            g.drawRect(0, H - inset - stripeH, W, stripeH);
            // left
            g.drawRect(inset, T, stripeH, H - 2 * T);
            // right
            g.drawRect(W - inset - stripeH, T, stripeH, H - 2 * T);
            g.endFill();
        }

        // ===== Layer 3: Holo-fence vertical/horizontal lines =====
        // Cienka siateczka cyan na granicy collision zone — wraz z efektem "trap si pole sily".
        g.lineStyle(1, COLOR_CYAN, 0.30);
        // Top edge — horizontal lines
        for (let i = 0; i < T; i += FENCE_LINE_SPACING) {
            g.moveTo(0, COLLISION_THICKNESS + i * 0.5);
            g.lineTo(W, COLLISION_THICKNESS + i * 0.5);
        }
        // Bottom
        for (let i = 0; i < T; i += FENCE_LINE_SPACING) {
            g.moveTo(0, H - COLLISION_THICKNESS - i * 0.5);
            g.lineTo(W, H - COLLISION_THICKNESS - i * 0.5);
        }
        // Left — vertical lines
        for (let i = 0; i < T; i += FENCE_LINE_SPACING) {
            g.moveTo(COLLISION_THICKNESS + i * 0.5, 0);
            g.lineTo(COLLISION_THICKNESS + i * 0.5, H);
        }
        // Right
        for (let i = 0; i < T; i += FENCE_LINE_SPACING) {
            g.moveTo(W - COLLISION_THICKNESS - i * 0.5, 0);
            g.lineTo(W - COLLISION_THICKNESS - i * 0.5, H);
        }
        g.lineStyle(0);

        // ===== Layer 4: Solid edge lines (collision boundary marker) =====
        // Wyrazne 3px cyan linie wzdluz wewnetrznej krawedzi collision rect —
        // gracz widzi wyraznie "tu jest sciana".
        g.lineStyle(3, COLOR_CYAN, 0.9);
        g.moveTo(0, COLLISION_THICKNESS);          g.lineTo(W, COLLISION_THICKNESS);
        g.moveTo(0, H - COLLISION_THICKNESS);      g.lineTo(W, H - COLLISION_THICKNESS);
        g.moveTo(COLLISION_THICKNESS, 0);          g.lineTo(COLLISION_THICKNESS, H);
        g.moveTo(W - COLLISION_THICKNESS, 0);      g.lineTo(W - COLLISION_THICKNESS, H);
        g.lineStyle(0);

        // ===== Layer 5: Pylon bases (static) =====
        // Pylony to pionowe slupy z neonowym rdzeniem. Base rysowany staticly,
        // wewnetrzny rdzen pulsuje w pylonPulseGfx (anim).
        for (const p of this.pylonPositions) {
            // Outer dark housing
            g.beginFill(0x1a1a2d, 0.95);
            g.drawCircle(p.x, p.y, PYLON_RADIUS);
            g.endFill();
            // Mid layer
            g.beginFill(COLOR_BG, 1);
            g.drawCircle(p.x, p.y, PYLON_RADIUS - 4);
            g.endFill();
            // Outer glow ring static
            g.lineStyle(2, COLOR_MAGENTA, 0.7);
            g.drawCircle(p.x, p.y, PYLON_RADIUS + 2);
            g.lineStyle(0);
        }

        // ===== Layer 6: Corner pylons accent (yellow) =====
        // Naroza dostaja zolte pylony — kolor zgodny z road dashes, podkreslaja "skrzyzowanie z poza-mapowoscia".
        const CORNER_OFF = 35;
        const corners = [
            { x: CORNER_OFF, y: CORNER_OFF },
            { x: W - CORNER_OFF, y: CORNER_OFF },
            { x: CORNER_OFF, y: H - CORNER_OFF },
            { x: W - CORNER_OFF, y: H - CORNER_OFF },
        ];
        for (const c of corners) {
            g.beginFill(0x2a2a1a, 1);
            g.drawCircle(c.x, c.y, PYLON_RADIUS + 4);
            g.endFill();
            g.beginFill(COLOR_BG, 1);
            g.drawCircle(c.x, c.y, PYLON_RADIUS);
            g.endFill();
            g.lineStyle(3, COLOR_YELLOW, 0.95);
            g.drawCircle(c.x, c.y, PYLON_RADIUS + 5);
            g.lineStyle(0);
        }
    }

    private buildCollisionRects(): BorderCollisionRect[] {
        const T = COLLISION_THICKNESS;
        return [
            new BorderCollisionRect(0, 0, this.worldW, T),                       // top
            new BorderCollisionRect(0, this.worldH - T, this.worldW, T),         // bottom
            new BorderCollisionRect(0, 0, T, this.worldH),                       // left
            new BorderCollisionRect(this.worldW - T, 0, T, this.worldH),         // right
        ];
    }

    /**
     * Per-frame: pulse pylonow (sinus modulacja alpha rdzenia 0.5→1.0 cyclically).
     * v0.52.0 fix #22: usuniety sweep scanline (przelatujacy niebieski pasek
     * sprawial dziwne wrazenie podczas grania).
     */
    update(): void {
        this.animTime += 0.016;

        // --- Pulse pylonow ---
        const pg = this.pylonPulseGfx;
        pg.clear();
        const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 2.4);
        for (const p of this.pylonPositions) {
            // Wewnetrzny rdzen pylonu — pulse cyan→magenta intensity
            pg.beginFill(COLOR_CYAN, 0.85 * pulse + 0.15);
            pg.drawCircle(p.x, p.y, PYLON_RADIUS - 6);
            pg.endFill();
            pg.beginFill(0xffffff, 0.6 * pulse);
            pg.drawCircle(p.x, p.y, PYLON_RADIUS - 9);
            pg.endFill();
        }
    }

    /**
     * Zwraca 4 collision rects (top/bottom/left/right strip).
     * Wolane raz po startGame: push do buildings + solidBuildings.
     */
    getCollisionRects(): BorderCollisionRect[] {
        return this.collisionRects;
    }
}