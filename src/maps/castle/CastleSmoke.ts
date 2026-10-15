import * as PIXI from 'pixi.js';
import { ambientRng } from '../../systems/Rng';
import type { DamageTier } from './castleBake';

/**
 * CastleSmoke — CASTLE ART v2: dym zalezny od stanu zamku (dym = drugi wskaznik HP, wzorzec dymu
 * czolgu z v0.188.0). Czytelnosc > Sensoryka: polprzezroczysty, leci w gore ekranu, startuje NAD
 * bryla (nie zaslania bram ani wrogow przy murze).
 *
 * - tier 1: cienka jasna smuga, tier 2: gesty ciemny dym + zar, tier 3: pioropusz nad gruzem.
 * - Zdrowy zamek: delikatny dym z komina kuchni donzonu.
 * KOSZT: pula N sprite'ow jednej pieczonej tekstury (bez ADD, bez filtrow) = 1 batch; emisja tylko
 * dla zrodel w widoku; lowFx (dotyk) = 7 klebow zamiast 14. Losowosc ambientRng, krok staly.
 */

export interface SmokeSource { x: number; y: number; w: number; topY: number; tier: DamageTier; kind: string; part?: unknown }

interface Puff { s: PIXI.Sprite; life: number; max: number; vx: number; vy: number; s0: number; s1: number; a0: number }

let puffTex: PIXI.Texture | null = null;
function puffTexture(): PIXI.Texture {
    if (puffTex) return puffTex;
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    if (c) {
        const g = c.createRadialGradient(S / 2 - 6, S / 2 - 6, 2, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.55, 'rgba(235,235,235,0.75)');
        g.addColorStop(1, 'rgba(220,220,220,0)');
        c.fillStyle = g; c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.fill();
    }
    puffTex = PIXI.Texture.from(cv);
    return puffTex;
}

const STEP = 1000 / 60;

export class CastleSmoke {
    private container: PIXI.Container;
    private puffs: Puff[] = [];
    private acc = new Map<string, number>();

    constructor(parent: PIXI.Container, lowFx: boolean) {
        this.container = new PIXI.Container();
        this.container.zIndex = 6500; // nad bryla i czolgami, pod paskiem HP donzonu (7000)
        parent.addChild(this.container);
        const tex = puffTexture();
        for (let i = 0; i < (lowFx ? 7 : 14); i++) {
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.visible = false;
            this.container.addChild(s);
            this.puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, s0: 1, s1: 1, a0: 1 });
        }
    }

    private emit(x: number, y: number, tier: number, chimney: boolean): void {
        const p = this.puffs.find(k => k.life <= 0);
        if (!p) return; // pula pelna = twardy limit kosztu
        const r = ambientRng;
        p.s.position.set(x + r.range(-6, 6), y);
        p.s.visible = true;
        const dark = !chimney && tier >= 2;
        p.s.tint = chimney ? 0xe8e8e8 : dark ? (tier >= 3 ? 0x2e2f31 : 0x45474a) : 0xc9cbce;
        p.max = p.life = Math.round(r.range(70, 110) * (tier >= 3 ? 1.3 : 1));
        p.vx = r.range(0.15, 0.4);
        p.vy = -r.range(0.45, 0.75) * (tier >= 3 ? 1.2 : 1);
        const big = chimney ? 0.45 : tier >= 3 ? 1.25 : tier >= 2 ? 1.0 : 0.6;
        p.s0 = big * 0.5; p.s1 = big * 1.8;
        p.a0 = chimney ? 0.45 : dark ? 0.78 : 0.6;
        p.s.alpha = 0;
    }

    /** Krok logiki. view = prostokat kamery (emisja tylko dla zrodel w widoku). */
    public update(sources: readonly SmokeSource[], view: { x: number; y: number; w: number; h: number }): void {
        for (const src of sources) {
            const inView = src.x + src.w > view.x - 60 && src.x < view.x + view.w + 60 && src.topY > view.y - 80 && src.topY < view.y + view.h + 200;
            if (!inView) continue;
            const chimney = src.kind === 'keep' && src.tier === 0;
            if (src.tier === 0 && !chimney) continue;
            const every = chimney ? 900 : src.tier === 1 ? 800 : src.tier === 2 ? 220 : 180;
            const key = `${src.x},${src.y}`;
            const a = (this.acc.get(key) ?? 0) + STEP;
            if (a >= every) {
                this.acc.set(key, 0);
                const ex = chimney ? src.x + src.w * 0.68 : src.x + src.w * (0.3 + ambientRng.next() * 0.4);
                this.emit(ex, src.topY, src.tier, chimney);
            } else this.acc.set(key, a);
        }
        for (const p of this.puffs) {
            if (p.life <= 0) continue;
            p.life--;
            const k = 1 - p.life / p.max;
            p.s.x += p.vx; p.s.y += p.vy;
            p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
            p.s.alpha = p.a0 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
            if (p.life <= 0) p.s.visible = false;
        }
    }

    public destroy(): void { this.container.destroy({ children: true }); }
}
