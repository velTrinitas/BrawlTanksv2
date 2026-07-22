import * as PIXI from 'pixi.js';

/**
 * RuinsFosa — fosa mapy Fortified Ruins (FAZA CTF F1).
 *
 * Prostokatna strefa slow 0.5x (passable) — wzorzec Quicksand (isPointInside),
 * ale prostokat zamiast elipsy. Baza wody jest WYPIEKANA w teksture gruntu
 * (FortifiedRuinsMap.drawFosaBase) — runtime rysuje tylko:
 *  - pulsujaca ramke ostrzegawcza (Czytelnosc: granica strefy slow),
 *  - rzadkie animowane zmarszczki wody (14 krotkich krech — tani redraw).
 * Fill-rate: zero pelnoekranowych przebić, gfx ograniczone do pasa fosy.
 */

const PALETTE = {
    ripple:     0x8fb894,
    warningRim: 0x7ea080,
};

interface FosaRipple {
    baseX: number;
    y: number;
    speed: number;
    phase: number;
    len: number;
}

export class RuinsFosa {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    /** F3 — strefa mostu (wyciecie z fosy): przejazd po moscie NIE spowalnia. */
    private bridge: { x: number; w: number } | null;

    private container: PIXI.Container;
    private gfxRim: PIXI.Graphics;
    private gfxRipples: PIXI.Graphics;
    private ripples: FosaRipple[];

    constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        worldContainer: PIXI.Container,
        bridge: { x: number; w: number } | null = null,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.bridge = bridge;

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 5; // nad gruntem, pod czolgami
        worldContainer.addChild(this.container);

        this.gfxRim = new PIXI.Graphics();
        this.gfxRipples = new PIXI.Graphics();
        this.container.addChild(this.gfxRim);
        this.container.addChild(this.gfxRipples);

        this.ripples = [];
        const RIPPLE_COUNT = 14;
        for (let i = 0; i < RIPPLE_COUNT; i++) {
            this.ripples.push({
                baseX: (i / RIPPLE_COUNT) * w,
                y: 12 + ((i * 37) % (h - 24)),
                speed: 0.15 + ((i * 13) % 10) * 0.03,
                phase: i * 0.7,
                len: 10 + ((i * 7) % 14),
            });
        }
    }

    /**
     * Punkt (world coords) w SPOWALNIAJACEJ czesci fosy?
     * F3: most nie spowalnia — punkt w pasie mostu zwraca false (rzeka pod mostem
     * plynie, ale deski niosa czolg z pelna predkoscia, jak realny most).
     */
    public isPointInside(px: number, py: number): boolean {
        const inFosa = px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
        if (!inFosa) return false;
        if (this.bridge && px >= this.bridge.x && px <= this.bridge.x + this.bridge.w) return false;
        return true;
    }

    public update(): void {
        const time = Date.now();

        // Pulsujaca ramka ostrzegawcza (subtelna — granica strefy juz baked)
        const g = this.gfxRim;
        g.clear();
        const pulse = 0.28 + Math.sin(time / 700) * 0.14;
        g.lineStyle(2, PALETTE.warningRim, pulse);
        g.drawRect(0, 0, this.w, this.h);
        g.lineStyle(0);

        // Zmarszczki plynace w prawo (rzeka)
        const r = this.gfxRipples;
        r.clear();
        r.lineStyle(1.5, PALETTE.ripple, 0.5);
        for (const rp of this.ripples) {
            const rx = (rp.baseX + time * rp.speed * 0.06) % this.w;
            const ry = rp.y + Math.sin(time / 900 + rp.phase) * 3;
            r.moveTo(rx, ry);
            r.lineTo(Math.min(rx + rp.len, this.w), ry);
        }
        r.lineStyle(0);
    }
}
