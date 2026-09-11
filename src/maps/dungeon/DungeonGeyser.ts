import * as PIXI from 'pixi.js';
import { DUNGEON_HEX as H } from './dungeonPalette';

/**
 * DungeonGeyser — erupcja z wentu lawy (SAVE THE QUEEN Q4, tylko PANIKA). Went (krata nad
 * zarem) jest wpieczony w grunt; ta klasa rysuje TYLKO to, co sie rusza:
 *  - TELEGRAF (1.2 s): pierscien pulsuje pomaranczem + dym z kraty (Czytelnosc: 1.2 s na ucieczke),
 *  - ERUPCJA (0.6 s): slup lawy (elipsy rosnace w gore, zIndex nad czolgami) + krople + zar
 *    na posadzce; obrazenia (150 w r90, gracz I wrogowie) zadaje QueenSystem RAZ na starcie erupcji.
 * Jeden PIXI.Graphics per gejzer, aktywny <=1 naraz (QueenSystem), poza Panika visible=false = koszt 0.
 */

export type GeyserState = 'idle' | 'telegraph' | 'erupt';

export class DungeonGeyser {
    public readonly x: number;
    public readonly y: number;
    public readonly r: number;
    public state: GeyserState = 'idle';
    private t = 0;          // ms w stanie
    private readonly gfx: PIXI.Graphics;
    private readonly telegraphMs: number;

    constructor(x: number, y: number, r: number, telegraphMs: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.r = r; this.telegraphMs = telegraphMs;
        this.gfx = new PIXI.Graphics();
        this.gfx.zIndex = 4; // telegraf na posadzce; erupcja podnosi zIndex nad czolgi
        this.gfx.visible = false;
        worldContainer.addChild(this.gfx);
    }

    public startTelegraph(): void { this.state = 'telegraph'; this.t = 0; this.gfx.zIndex = 4; this.gfx.visible = true; }

    /** @returns true w klatce, w ktorej zaczyna sie erupcja (QueenSystem zadaje obrazenia). */
    public update(dtMs: number): boolean {
        if (this.state === 'idle') return false;
        this.t += dtMs;
        const g = this.gfx;
        g.clear();
        if (this.state === 'telegraph') {
            const k = Math.min(1, this.t / this.telegraphMs);
            const pulse = 0.5 + 0.5 * Math.sin(k * Math.PI * 8);
            g.lineStyle(5, H.lava, 0.35 + 0.55 * pulse); g.drawCircle(this.x, this.y, this.r - 4 + 6 * pulse); g.lineStyle(0);
            g.beginFill(H.lavaBright, 0.12 + 0.18 * pulse); g.drawCircle(this.x, this.y, this.r * 0.55); g.endFill();
            // dym z kraty: 4 obloczki unoszace sie
            for (let i = 0; i < 4; i++) {
                const ph = (k * 2 + i * 0.25) % 1;
                g.beginFill(0x4a3a58, 0.32 * (1 - ph)); g.drawCircle(this.x - 30 + i * 20 + Math.sin(ph * 6 + i) * 6, this.y - ph * 60, 8 + ph * 14); g.endFill();
            }
            if (this.t >= this.telegraphMs) { this.state = 'erupt'; this.t = 0; this.gfx.zIndex = 20000; return true; }
            return false;
        }
        // erupcja 600 ms: slup rosnie 0-200 ms, trzyma, opada 400-600
        const T = 600;
        const k = Math.min(1, this.t / T);
        const hgt = k < 0.33 ? k / 0.33 : k > 0.66 ? (1 - k) / 0.34 : 1;
        const H0 = 170 * hgt;
        // zar na posadzce (r90 = zasieg obrazen — Czytelnosc: hitbox = rysunek)
        g.beginFill(H.lava, 0.45 * (1 - k * 0.5)); g.drawCircle(this.x, this.y, this.r); g.endFill();
        g.lineStyle(4, H.lavaBright, 0.8 * (1 - k)); g.drawCircle(this.x, this.y, this.r + 40 * k); g.lineStyle(0);
        // slup: 5 elips coraz wezszych ku gorze
        for (let i = 0; i < 5; i++) {
            const yy = this.y - (H0 * i) / 5;
            const w = (42 - i * 6) * (0.7 + 0.3 * hgt), hh = 22 - i * 2;
            g.beginFill(i % 2 ? H.lava : H.lavaDark, 0.95); g.drawEllipse(this.x + Math.sin(this.t * 0.05 + i) * 3, yy, w, hh); g.endFill();
            g.beginFill(H.lavaBright, 0.85); g.drawEllipse(this.x - 6, yy - 4, w * 0.4, hh * 0.35); g.endFill();
        }
        g.beginFill(H.lavaBright, 1); g.drawEllipse(this.x, this.y - H0, 18 * hgt, 10 * hgt); g.endFill();
        // krople spadajace
        g.beginFill(H.lava, 0.9);
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; const d = 20 + k * 90; const dy = -H0 * 0.8 + k * k * (H0 * 0.9 + 60); g.drawCircle(this.x + Math.cos(a) * d, this.y + dy + Math.sin(a) * d * 0.4, 4); }
        g.endFill();
        if (this.t >= T) { this.state = 'idle'; this.gfx.visible = false; g.clear(); }
        return false;
    }

    public destroy(): void { this.gfx.destroy(); }
}
