import * as PIXI from 'pixi.js';
import type { CastleRect } from '../CastleMap';
import { castleNow } from './castleArtClock';
import { moatLoopFrom, moatLoopPoint, type MoatLoop } from './castleMoatLoop';

/**
 * castleMoatV2.ts — CASTLE ART v2: ruch wody fosy BEZ przerysowania (zamiast Graphics.clear() co klatke).
 *
 * - Nurt: STRUMIENIE krazace po calym pierscieniu (castleMoatLoop) w obiegu CW — zakrecaja lukiem na
 *   rogach i przeplywaja POD mostami (tam niewidoczne), wiec fosa czyta sie jak jedna rzeka. Nurt jest
 *   szybszy w srodku kanalu i wolniejszy przy brzegach (glebia). Pula sprite'ow jednej tekstury = 1 batch.
 * - Czytelnosc slow: piana wzdluz obu brzegow narysowana RAZ (przerwy pod mostami), pulsuje tylko alpha.
 * - Plusk: wjazd czolgu do wody = 2 pierscienie z puli 8; jazda w wodzie = kilwater co ~450 ms.
 * Czysto wizualne (stan "w wodzie" liczy dalej CastleMoat.isPointInside — symulacja nietknieta).
 */

interface Ring { g: PIXI.Graphics; life: number; max: number; s0: number; s1: number; a0: number }
interface Streak { sp: PIXI.Sprite; s: number; o: number; v: number; a: number }

let streakTex: PIXI.Texture | null = null;
function streakTexture(): PIXI.Texture {
    if (streakTex) return streakTex;
    const W = 40, H = 6;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    if (c) {
        const g = c.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(210,245,248,0)');
        g.addColorStop(0.75, 'rgba(220,248,250,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,1)');
        c.fillStyle = g;
        c.beginPath(); c.ellipse(W / 2, H / 2, W / 2, H / 2 - 0.5, 0, 0, Math.PI * 2); c.fill();
    }
    streakTex = PIXI.Texture.from(cv);
    return streakTex;
}

export class CastleMoatV2 {
    private container: PIXI.Container;
    private loop: MoatLoop;
    private bridges: CastleRect[];
    private streaks: Streak[] = [];
    private foam: PIXI.Graphics;
    private rings: Ring[] = [];
    private inWater = new WeakMap<object, { inside: boolean; wakeMs: number }>();
    private tmp = { x: 0, y: 0, a: 0 };
    private lastT = 0;

    constructor(strips: readonly CastleRect[], bridges: readonly CastleRect[], parent: PIXI.Container, lowFx: boolean) {
        this.container = new PIXI.Container();
        this.foam = new PIXI.Graphics();
        this.container.zIndex = 5;
        parent.addChild(this.container);
        this.loop = moatLoopFrom(strips);
        this.bridges = [...bridges];
        const L = this.loop;
        // piana brzegowa: raz narysowana, z przerwami pod mostami
        for (const side of [-1, 1]) {
            this.foam.lineStyle(3, 0xdff4f4, 1);
            let drawing = false;
            for (let s = 0; s <= L.perimeter; s += 8) {
                moatLoopPoint(L, s, side * (L.half - 3), this.tmp);
                if (this.underBridge(this.tmp.x, this.tmp.y, 2)) { drawing = false; continue; }
                if (!drawing) { this.foam.moveTo(this.tmp.x, this.tmp.y); drawing = true; } else this.foam.lineTo(this.tmp.x, this.tmp.y);
            }
        }
        this.container.addChild(this.foam);
        // strumienie: rozlozone rowno po petli, offset boczny deterministyczny (bez Math.random)
        const tex = streakTexture();
        const N = lowFx ? 26 : 48;
        for (let i = 0; i < N; i++) {
            const sp = new PIXI.Sprite(tex);
            sp.anchor.set(0.5);
            const o = (((i * 37) % 17) / 16 * 2 - 1) * L.half * 0.78;
            const depth = 1 - Math.pow(Math.abs(o) / L.half, 2) * 0.65; // srodek = szybciej, jasniej, dluzej
            sp.scale.set(0.7 + depth * 0.7, 0.8 + depth * 0.3);
            this.container.addChild(sp);
            this.streaks.push({ sp, s: (i / N) * L.perimeter + ((i * 53) % 29), o, v: 0.55 + depth * 0.75, a: 0.25 + depth * 0.4 });
        }
        for (let i = 0; i < 8; i++) {
            const g = new PIXI.Graphics();
            g.lineStyle(3, 0xeefcfc, 1); g.drawEllipse(0, 0, 30, 18);
            g.lineStyle(1.5, 0xffffff, 0.8); g.drawEllipse(0, 0, 20, 12);
            g.visible = false;
            this.container.addChild(g);
            this.rings.push({ g, life: 0, max: 1, s0: 1, s1: 1, a0: 1 });
        }
    }

    private underBridge(x: number, y: number, m: number): boolean {
        for (const b of this.bridges) if (x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m) return true;
        return false;
    }

    private spawnRing(x: number, y: number, big: boolean): void {
        const r = this.rings.find(k => k.life <= 0) ?? this.rings[0];
        r.g.position.set(x, y);
        r.g.visible = true;
        r.max = r.life = big ? 42 : 30;
        r.s0 = big ? 0.8 : 0.6; r.s1 = big ? 3.4 : 2.4; r.a0 = big ? 1 : 0.7;
    }

    /** Krok logiki: nurt, puls piany, plusk/kilwater dla czolgow (tanks = gracze + wrogowie w widoku). */
    public update(tanks: readonly { x: number; y: number }[], inside: (x: number, y: number) => boolean): void {
        const t = castleNow();
        const dt = Math.min(50, Math.max(0, t - this.lastT)) / 16.67;
        this.lastT = t;
        this.foam.alpha = 0.32 + Math.sin(t / 650) * 0.14;
        const L = this.loop;
        for (const st of this.streaks) {
            st.s += st.v * dt;
            if (st.s > L.perimeter) st.s -= L.perimeter;
            moatLoopPoint(L, st.s, st.o + Math.sin(st.s * 0.02) * 3, this.tmp);
            st.sp.position.set(this.tmp.x, this.tmp.y);
            st.sp.rotation = this.tmp.a;
            // pod mostem niewidoczny
            st.sp.alpha = this.underBridge(this.tmp.x, this.tmp.y, 6) ? 0 : st.a * (0.75 + 0.25 * Math.sin(st.s * 0.05));
        }
        for (const tk of tanks) {
            const now = inside(tk.x, tk.y);
            let w = this.inWater.get(tk);
            if (!w) { w = { inside: now, wakeMs: 0 }; this.inWater.set(tk, w); }
            if (now && !w.inside) { this.spawnRing(tk.x, tk.y, true); this.spawnRing(tk.x, tk.y + 4, false); w.wakeMs = 0; }
            else if (now) { w.wakeMs += 1000 / 60; if (w.wakeMs > 450) { w.wakeMs = 0; this.spawnRing(tk.x, tk.y, false); } }
            w.inside = now;
        }
        for (const r of this.rings) {
            if (r.life <= 0) continue;
            r.life--;
            const k = 1 - r.life / r.max;
            r.g.scale.set(r.s0 + (r.s1 - r.s0) * k);
            r.g.alpha = r.a0 * (1 - k);
            if (r.life <= 0) r.g.visible = false;
        }
    }

    public destroy(): void { this.container.destroy({ children: true }); }
}
