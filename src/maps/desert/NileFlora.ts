import * as PIXI from 'pixi.js';
import type { RiverNile } from './RiverNile';
import { bakeToSprite } from '../propBaker';

/**
 * NileFlora — DESERT ART v2 / E2b. Kepy sitowia i stojace ibisy wzdluz brzegow Nilu.
 *
 * Uzupelnia `WaterLife` (lotosy + papirus), nie zastepuje go.
 *
 * CZYTELNOSC: wszystko stoi w pasie brzegu, ktory i tak jest w kolizji rzeki
 * (segmenty `width + 60`), wiec flora nie tworzy „niewidzialnych scian" ani nie
 * zaslania przejazdu. Zero polyskow — nic tu nie wyglada na znajdzke.
 *
 * KOSZT: kilka wariantow pieczonych RAZ (cache `propBaker`), reszta to sprite'y
 * wspoldzielace tekstury (+ `cullable`). Brak update() — calosc statyczna.
 * Ulozenie z deterministycznego hasha indeksu, nie z RNG.
 */

const REED_VARIANTS = 4;
const IBIS_VARIANTS = 2;

function hash(i: number, seed: number): number {
    const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

export class NileFlora {
    private container: PIXI.Container;
    /** E5 — stojace ibisy (zrywaja sie przy wybuchu) i ptaki w locie. */
    private ibises: { spr: PIXI.Sprite; x: number; y: number; away: number }[] = [];
    private flying: { spr: PIXI.Sprite; vx: number; vy: number; life: number; flap: number }[] = [];

    constructor(river: RiverNile, riverWidth: number, worldContainer: PIXI.Container, seed = 17) {
        this.container = new PIXI.Container();
        this.container.zIndex = 56;   // nad woda (50) i WaterLife (55), pod mostami (60)
        worldContainer.addChild(this.container);

        const samples = river.getBankSamples(62);
        for (const s of samples) {
            const r = hash(s.i, seed);
            let spr: PIXI.Sprite | null = null;
            let dist = riverWidth / 2;
            if (r < 0.42) {
                spr = this.makeSprite('reed', Math.floor(hash(s.i + 500, seed) * REED_VARIANTS));
                dist += 14 + hash(s.i + 900, seed) * 12;
            } else if (r < 0.5) {
                spr = this.makeSprite('ibis', Math.floor(hash(s.i + 700, seed) * IBIS_VARIANTS));
                dist += 24 + hash(s.i + 900, seed) * 6;
                if (spr && hash(s.i + 800, seed) < 0.5) spr.scale.x = -1;
            }
            if (!spr) continue;
            // Maks. 30 px od linii wody: pas kolizji rzeki ma promien (width + 60) / 2 = 70.
            spr.x = s.x + s.nx * dist;
            spr.y = s.y + s.ny * dist;
            spr.cullable = true;
            this.container.addChild(spr);
            if (r >= 0.42) this.ibises.push({ spr, x: spr.x, y: spr.y, away: 0 });
        }
    }

    /**
     * E5 — wybuch w poblizu: ibisy w promieniu `r` zrywaja sie i odlatuja OD wybuchu,
     * lopoczac skrzydlami; na brzeg wracaja po ~20 s. Tylko wizual.
     */
    public scare(x: number, y: number, r = 320): void {
        for (const ib of this.ibises) {
            if (ib.away > 0) continue;
            const dx = ib.x - x, dy = ib.y - y;
            const d = Math.hypot(dx, dy);
            if (d > r) continue;
            ib.away = 1200;
            ib.spr.visible = false;
            const spr = new PIXI.Sprite(NileFlora.flyTex(0) ?? PIXI.Texture.EMPTY);
            spr.anchor.set(0.5);
            spr.x = ib.x; spr.y = ib.y - 12;
            const l = d || 1;
            const vx = (dx / l) * 2.6;
            spr.scale.x = vx < 0 ? -1 : 1;
            this.container.addChild(spr);
            this.flying.push({ spr, vx, vy: (dy / l) * 1.2 - 1.6, life: 200, flap: (ib.x | 0) % 7 });
        }
    }

    /** E5 — krok animacji lotu i powrotow (lokalny, bez stanu gry). */
    public update(): void {
        for (const ib of this.ibises) {
            if (ib.away > 0 && --ib.away === 0) ib.spr.visible = true;
        }
        for (let i = this.flying.length - 1; i >= 0; i--) {
            const f = this.flying[i];
            f.life--;
            f.flap++;
            f.spr.x += f.vx;
            f.spr.y += f.vy;
            f.vy -= 0.01;                                   // wznosi sie coraz wyzej
            f.spr.texture = NileFlora.flyTex(Math.floor(f.flap / 5) % 2) ?? f.spr.texture;
            f.spr.alpha = Math.min(1, f.life / 40);
            f.spr.zIndex = 250;
            if (f.life <= 0) { f.spr.destroy(); this.flying.splice(i, 1); }
        }
    }

    private static _fly: (PIXI.Texture | null)[] = [null, null];
    /** Ibis w locie: 2 klatki (skrzydla w gorze / w dole). */
    private static flyTex(frame: number): PIXI.Texture | null {
        const hit = NileFlora._fly[frame];
        if (hit && !hit.destroyed) return hit;
        const g = new PIXI.Graphics();
        g.beginFill(0x000000, 0.001);
        g.drawRect(-20, -14, 40, 28);
        g.endFill();
        const up = frame === 0;
        g.beginFill(0xf4f0e6);                              // skrzydla
        g.drawPolygon(up ? [-2, -1, -14, -12, -6, 0] : [-2, 1, -14, 10, -6, 0]);
        g.drawPolygon(up ? [2, -1, 10, -13, 6, 0] : [2, 1, 10, 11, 6, 0]);
        g.endFill();
        g.beginFill(0x1a1a1a);                              // czarne koncowki lotek
        g.drawPolygon(up ? [-14, -12, -10, -9, -12, -7] : [-14, 10, -10, 8, -12, 6]);
        g.endFill();
        g.beginFill(0xffffff);
        g.drawEllipse(0, 0, 8, 3.5);                        // tulow
        g.endFill();
        g.lineStyle(2, 0x1a1a1a, 1);                        // szyja + dziob do przodu
        g.moveTo(7, -1); g.lineTo(12, -2);
        g.lineStyle(1.3, 0x1a1a1a, 1);
        g.moveTo(12, -2); g.quadraticCurveTo(17, -1, 18, 3);
        g.lineStyle(0);
        const spr = bakeToSprite(g, `nile_ibis_fly:${frame}`);
        g.destroy();
        NileFlora._fly[frame] = spr ? spr.texture : null;
        return NileFlora._fly[frame];
    }

    private makeSprite(kind: 'reed' | 'ibis', variant: number): PIXI.Sprite | null {
        const g = new PIXI.Graphics();
        if (kind === 'reed') this.drawReed(g, variant);
        else this.drawIbis(g, variant);
        const spr = bakeToSprite(g, `nile_${kind}_v2:${variant}`);
        g.destroy();
        return spr;
    }

    /** Kepa sitowia z pionowym pochyleniem (jak palmy — „wysokosc" w gore ekranu). */
    private drawReed(g: PIXI.Graphics, v: number): void {
        // Cien SE
        g.beginFill(0x000000, 0.18);
        g.drawEllipse(5, 3, 14, 5);
        g.endFill();
        // Mul u podstawy
        g.beginFill(0x5a4a28, 0.6);
        g.drawEllipse(0, 1, 11, 4);
        g.endFill();
        const blades = 7 + v;
        for (let b = 0; b < blades; b++) {
            const k = b / (blades - 1) - 0.5;
            const len = 16 + hash(b + v * 20, 3) * 12;
            const bend = k * 14 + (hash(b + v * 30, 5) - 0.5) * 6;
            const dark = b % 3 === 0;
            g.lineStyle(2.2, dark ? 0x3e6a24 : 0x6c9a36, 1);
            g.moveTo(k * 8, 0);
            g.quadraticCurveTo(k * 10, -len * 0.6, k * 8 + bend, -len);
        }
        // Wiechy (brazowe palki)
        g.lineStyle(0);
        for (let c = 0; c < 2 + (v % 2); c++) {
            const x = (hash(c + v * 7, 11) - 0.5) * 10;
            const h = 20 + hash(c + v * 9, 13) * 8;
            g.lineStyle(1.2, 0x55702a, 1);
            g.moveTo(x, 0);
            g.lineTo(x + 1, -h);
            g.lineStyle(0);
            g.beginFill(0x6a3e1a);
            g.drawRoundedRect(x - 1.8, -h - 7, 3.6, 8, 1.8);
            g.endFill();
        }
    }

    /** Ibis czczony (bialy, czarna glowa i szyja, zakrzywiony dziob) stojacy na brzegu. */
    private drawIbis(g: PIXI.Graphics, v: number): void {
        const bow = v === 1;   // wariant: zeruje (glowa w dol)
        g.beginFill(0x000000, 0.2);
        g.drawEllipse(4, 1, 10, 3);
        g.endFill();
        // Nogi
        g.lineStyle(1.3, 0x2a2a2a, 1);
        g.moveTo(-1, -9); g.lineTo(-2, 0);
        g.moveTo(2, -9); g.lineTo(3, 0);
        g.lineStyle(0);
        // Tulow
        g.beginFill(0xd8d4c8);
        g.drawEllipse(1, -13, 9, 5.5);
        g.endFill();
        g.beginFill(0xffffff);
        g.drawEllipse(0, -14, 8, 4.5);
        g.endFill();
        // Czarny ogon
        g.beginFill(0x1a1a1a);
        g.drawPolygon([7, -15, 13, -12, 7, -10]);
        g.endFill();
        // Szyja + glowa + dziob
        g.lineStyle(2.4, 0x1a1a1a, 1);
        if (bow) {
            g.moveTo(-6, -14);
            g.quadraticCurveTo(-12, -14, -12, -7);
            g.lineStyle(1.4, 0x1a1a1a, 1);
            g.moveTo(-12, -7);
            g.quadraticCurveTo(-13, -1, -9, 0);
        } else {
            g.moveTo(-6, -15);
            g.quadraticCurveTo(-9, -22, -8, -27);
            g.lineStyle(1.4, 0x1a1a1a, 1);
            g.moveTo(-9, -27);
            g.quadraticCurveTo(-16, -27, -18, -21);
        }
        g.lineStyle(0);
        g.beginFill(0x1a1a1a);
        g.drawCircle(bow ? -12 : -8.5, bow ? -8 : -27, 2.2);
        g.endFill();
    }
}
