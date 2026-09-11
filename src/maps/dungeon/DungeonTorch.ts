import * as PIXI from 'pixi.js';
import { DUNGEON_HEX as H } from './dungeonPalette';

/**
 * DungeonTorch — ANIMOWANE plomienie pochodni LOCHOW (SAVE THE QUEEN Q5). Kinkiety i mala
 * poswiata sa wpieczone w grunt (DungeonMap); tu tylko zywy ogien: 3 "klatki" plomienia
 * rysowane proceduralnie (migot co ~120 ms), 1-2 iskry co ~2 s, puls poswiaty.
 *  - flare(x, y): pochodnie w promieniu 260 px rozblyskuja x1.8 na 1.2 s (telegraf lane'u).
 *  - setDim(k): 0 = normalnie, 1 = zgaszone (PORWANA: gasna po jednej, sterowane z zewnatrz
 *    przez setLit(i, false)); bez overlayow ekranowych.
 * Klasa A: JEDEN Graphics dla wszystkich pochodni, cull do kamery (poza kadrem zero rysowania).
 */

interface Torch { x: number; y: number; lit: number; flare: number; seed: number }

export class DungeonTorch {
    private readonly gfx: PIXI.Graphics;
    private readonly torches: Torch[] = [];
    private t = 0;
    private sparkT = 0;

    constructor(points: readonly { x: number; y: number }[], worldContainer: PIXI.Container) {
        this.gfx = new PIXI.Graphics();
        this.gfx.zIndex = 8000; // pochodnie sa na scianach (ramka) — nad wszystkim przy krawedzi
        worldContainer.addChild(this.gfx);
        points.forEach((p, i) => this.torches.push({ x: p.x, y: p.y, lit: 1, flare: 0, seed: i * 0.73 }));
    }

    public get count(): number { return this.torches.length; }

    /** Telegraf: pochodnie blisko punktu rozblyskuja. */
    public flare(x: number, y: number, r = 260): void {
        for (const tc of this.torches) if ((tc.x - x) ** 2 + (tc.y - y) ** 2 <= r * r) tc.flare = 1.2;
    }

    /** PORWANA: gasnie i-ta pochodnia (kolejnosc: od spawnu W ku celi E). */
    public extinguish(i: number): void { const tc = this.torches[i]; if (tc) tc.lit = 0; }
    public relightAll(): void { for (const tc of this.torches) tc.lit = 1; }
    /** OCALONA: wszystkie plona jasniej przez ms. */
    public flareAll(): void { for (const tc of this.torches) tc.flare = 2.5; }

    public update(delta: number, camX: number, camY: number, viewW: number, viewH: number): void {
        this.t += delta / 60;
        this.sparkT += delta;
        const g = this.gfx; g.clear();
        for (const tc of this.torches) {
            if (tc.flare > 0) tc.flare = Math.max(0, tc.flare - delta / 60);
            if (tc.x < camX - 80 || tc.x > camX + viewW + 80 || tc.y < camY - 80 || tc.y > camY + viewH + 80) continue;
            if (tc.lit <= 0) {
                // dym po zgaszeniu
                g.beginFill(0x4a3a58, 0.35); g.drawCircle(tc.x + Math.sin(this.t * 3 + tc.seed) * 3, tc.y - 14 - ((this.t * 20 + tc.seed * 10) % 18), 4); g.endFill();
                continue;
            }
            const fl = 1 + Math.min(1, tc.flare) * 0.8;
            const frame = Math.floor((this.t * 8 + tc.seed * 10) % 3);
            const wob = Math.sin(this.t * 13 + tc.seed * 7) * 2;
            // poswiata (mala, puls)
            g.beginFill(H.lava, 0.10 + 0.05 * Math.sin(this.t * 6 + tc.seed) + 0.15 * Math.min(1, tc.flare)); g.drawCircle(tc.x, tc.y - 8, (30 + 4 * frame) * fl); g.endFill();
            // plomien: 3 warstwy (ciemny -> jasny -> rdzen) z lekkim przechyleniem per klatka
            const hgt = (16 + frame * 3) * fl, wid = (7 + (frame === 1 ? 1.5 : 0)) * fl;
            g.beginFill(H.lavaDark, 0.95); g.drawEllipse(tc.x + wob * 0.5, tc.y - 8 - hgt * 0.35, wid + 2, hgt * 0.7); g.endFill();
            g.beginFill(H.lava, 1); g.drawEllipse(tc.x + wob * 0.7, tc.y - 10 - hgt * 0.4, wid, hgt * 0.62); g.endFill();
            g.beginFill(H.lavaBright, 1); g.drawEllipse(tc.x + wob, tc.y - 12 - hgt * 0.45, wid * 0.45, hgt * 0.4); g.endFill();
            g.beginFill(0xffffff, 0.85); g.drawEllipse(tc.x + wob, tc.y - 12 - hgt * 0.3, wid * 0.2, hgt * 0.18); g.endFill();
            // iskry (co ~2 s, 1-2 na pochodnie — pseudo-losowo z fazy)
            const sp = (this.t * 0.5 + tc.seed) % 1;
            if (sp < 0.25) { const k = sp / 0.25; g.beginFill(H.lavaBright, 1 - k); g.drawCircle(tc.x + wob + Math.sin(tc.seed * 9) * 8 * k, tc.y - 24 - 30 * k, 1.8); g.endFill(); }
        }
    }

    public destroy(): void { this.gfx.destroy(); }
}
