import * as PIXI from 'pixi.js';
import { drawTree, drawPine, type Rng } from './castlePainters';
import { LIVE_FORESTS, type CastleSolidProp } from './CastleSolidProp';
import { CASTLE_LOOSE_TREES } from '../CastleMap';
import { isPointInView } from '../cullGate';

/**
 * CastleTrees — bujajace sie korony drzew na mapie Zamku (transza 2 artu, v0.195.0).
 *
 * Do v0.194.0 drzewa byly w calosci WPIECZONE: bloki lasu w teksturze CastleSolidProp,
 * luzne drzewa w gruncie 3000x3000. Teraz w bake zostaje cien + pien, a KORONA jest
 * sprite'em animowanym wylacznie transformami (wzorzec CastlePennants / CastleCampFlags).
 *
 * WIATR: jedna fala przechodzi przez mape (faza zalezna od x+y), plus drobny szum
 * wlasny kazdego drzewa. Bujanie = skew.x wokol podstawy drzewa — czubek korony
 * przesuwa sie o kilka px, pien (w bake) stoi.
 *
 * WARSTWY (czytelnosc!): korony lasu sa dziecmi kontenera bloku lasu, wiec rysuja sie
 * DOKLADNIE tam, gdzie dawniej rysowala sie tekstura lasu. Luzne drzewa byly w gruncie,
 * czyli POD czolgami — i tak zostaje (zIndex ponizej wszystkiego Y-sortowanego), zeby
 * korona nigdy nie zaslonila gracza ani wroga.
 *
 * KOSZT: 6 wariantow tekstur (2x res, ~0,5 MB lacznie) wspoldzielonych przez ~350 koron.
 * Culling: las bramkowany calym blokiem, luzne drzewa pojedynczo — poza kadrem
 * `renderable = false` i zero matematyki. Hitboxy lasu bez zmian (AABB bloku).
 */

/** Wylacznik bujania (korony zostaja, ale stoja). */
export const CASTLE_TREE_SWAY = true;

/**
 * v0.198.1 — `?treesway=0` zatrzymuje bujanie bez redeployu. To JEDYNY element transzy 2 artu
 * Zamku z realnym kosztem per klatka, wiec gdy A54 zacznie ciac, ratunek ma byc pod reka.
 * Liczone RAZ (modul), nie per klatka — czytanie `location.search` w petli byloby marnotrawstwem.
 */
const SWAY_ENABLED: boolean = CASTLE_TREE_SWAY && (() => {
    try { return new URLSearchParams(location.search).get('treesway') !== '0'; } catch { return true; }
})();

const RES = 2;
/** Plotno wariantu (jednostki swiata) i punkt podstawy drzewa w nim. */
const CW = 80, CH = 72, BX = 42, BY = 56;
const TREE_VARIANTS = 4, PINE_VARIANTS = 2;
/** Amplituda skew (rad). ~0.12 = czubek duzej korony ~6 px — wyraznie, ale czytelnie. */
const SWAY_AMP = 0.12;
/** Luzne drzewa: pod wszystkim Y-sortowanym, nad gruntem (grunt ma zIndex < 8). */
const LOOSE_Z = 8;

const texCache = new Map<string, PIXI.Texture>();

function seeded(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function crownTexture(pine: boolean, variant: number): PIXI.Texture {
    const key = `${pine ? 'p' : 't'}${variant}`;
    const hit = texCache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = CW * RES; cv.height = CH * RES;
    const c = cv.getContext('2d');
    if (!c) return PIXI.Texture.EMPTY;
    c.scale(RES, RES);
    const rng = seeded(0x7ee5 + variant * 977 + (pine ? 31 : 0));
    if (pine) drawPine(c, rng, BX, BY, 1, 'crown'); else drawTree(c, rng, BX, BY, 1, 'crown');
    const tex = PIXI.Texture.from(cv);
    texCache.set(key, tex);
    return tex;
}

interface Crown { s: PIXI.Sprite; phase: number; wx: number; wy: number; amp: number }

function makeCrown(pine: boolean, x: number, y: number, size: number, idx: number): PIXI.Sprite {
    const v = pine ? idx % PINE_VARIANTS : idx % TREE_VARIANTS;
    const s = new PIXI.Sprite(crownTexture(pine, v));
    s.anchor.set(BX / CW, BY / CH);
    s.scale.set(size / RES);
    s.x = x; s.y = y;
    return s;
}

export class CastleTrees {
    private forests: Array<{ prop: CastleSolidProp; cx: number; cy: number; r: number; crowns: Crown[] }> = [];
    private loose: Crown[] = [];
    private looseLayer: PIXI.Container;

    constructor(worldContainer: PIXI.Container) {
        let idx = 0;
        for (const prop of LIVE_FORESTS) {
            const view = prop.view;
            const crowns: Crown[] = [];
            for (const t of prop.forestTrees) {
                const s = makeCrown(t.pine, t.x, t.y, t.s, idx++);
                view.addChild(s); // dzieci po sprite'cie bazy, w kolejnosci y (pts juz posortowane)
                crowns.push({ s, phase: (idx * 2.399) % (Math.PI * 2), wx: view.x + t.x, wy: view.y + t.y, amp: t.pine ? 0.7 : 1 });
            }
            this.forests.push({ prop, cx: prop.x + prop.w / 2, cy: prop.y + prop.h / 2, r: Math.max(prop.w, prop.h) / 2 + 60, crowns });
        }
        this.looseLayer = new PIXI.Container();
        this.looseLayer.zIndex = LOOSE_Z;
        worldContainer.addChild(this.looseLayer);
        for (const t of CASTLE_LOOSE_TREES) {
            const s = makeCrown(t.pine, t.x, t.y, t.s, idx++);
            this.looseLayer.addChild(s);
            this.loose.push({ s, phase: (idx * 2.399) % (Math.PI * 2), wx: t.x, wy: t.y, amp: t.pine ? 0.7 : 1 });
        }
    }

    private static sway(c: Crown, t: number): void {
        // fala wiatru przez mape (x+y) + wlasny drobny szum
        const gust = Math.sin(t * 1.25 - (c.wx + c.wy) * 0.0035) * 0.7 + Math.sin(t * 2.7 + c.phase) * 0.3;
        c.s.skew.x = gust * SWAY_AMP * c.amp;
        c.s.scale.y = c.s.scale.x * (1 + Math.sin(t * 2.1 + c.phase) * 0.03); // oddech korony
    }

    public update(camX: number, camY: number, viewW: number, viewH: number): void {
        const t = Date.now() / 1000;
        for (const f of this.forests) {
            const vis = isPointInView(f.cx, f.cy, camX, camY, viewW, viewH, f.r);
            // PIXI v7 nie culluje sam — bez tego ~280 koron szloby do batcha takze poza kadrem.
            for (const c of f.crowns) c.s.renderable = vis;
            if (!vis || !SWAY_ENABLED) continue;
            for (const c of f.crowns) CastleTrees.sway(c, t);
        }
        for (const c of this.loose) {
            const vis = isPointInView(c.wx, c.wy, camX, camY, viewW, viewH, 60);
            c.s.renderable = vis;
            if (vis && SWAY_ENABLED) CastleTrees.sway(c, t);
        }
    }

    public destroy(): void {
        // korony lasu gina razem z kontenerem bloku (CastleSolidProp.destroy, children:true)
        this.looseLayer.destroy({ children: true });
        this.forests = [];
        this.loose = [];
    }
}
