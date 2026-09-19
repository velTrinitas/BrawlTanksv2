import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { CASTLE_PALETTE as P } from './castlePalette';
import { drawTree, drawPine, type Rng } from './castlePainters';
import { bakeCottage } from './castleBake';

/**
 * CastleSolidProp — solid pieczony RAZ do tekstury (OBRON ZAMEK F2):
 *  - 'forest' : zwarta kepa drzew (blok lasu z layoutu) — hitbox = AABB z layoutu,
 *               korony wystaja poza AABB (wizual > hitbox tylko o miekkie liscie,
 *               nigdy w strone, z ktorej jedzie czolg? — nie: liscie sa nad czolgiem,
 *               wiec czolg przejezdza "pod" krawedzia korony; blokuja pnie = AABB),
 *  - 'chapel' : ruina kaplicy (granit, gotycki luk, mech).
 * Wzorzec RuinBlock rock: cache per (kind, w, h, seed); zIndex = y + h + x*1e-4.
 */

export type CastleSolidKind = 'forest' | 'chapel' | 'cottage';

/** v0.195.0 — drzewo lasu we wspolrzednych TEKSTURY bloku (korona = sprite CastleTrees). */
export interface ForestTree { x: number; y: number; pine: boolean; s: number }

interface Baked { tex: PIXI.Texture; ox: number; oy: number; trees?: ForestTree[] }

/** v0.195.0 — zywe bloki lasu; CastleTrees (tworzony po lesie) dopina do nich korony. */
export const LIVE_FORESTS = new Set<CastleSolidProp>();
const CACHE = new Map<string, Baked>();

function makeRng(seed: number): Rng {
    let a = seed >>> 0;
    return function (): number {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function bakeForest(w: number, h: number, seed: number): Baked {
    const M = 40;
    const cv = document.createElement('canvas');
    cv.width = w + M * 2; cv.height = h + M * 2;
    const c = cv.getContext('2d')!;
    const rng = makeRng(seed);
    // sciolka pod lasem (ciemniejsza plama)
    c.fillStyle = P.forestDeep; c.globalAlpha = 0.35;
    c.beginPath(); c.ellipse(M + w / 2 + 6, M + h / 2 + 8, w * 0.62, h * 0.62, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    // drzewa: siatka z jitterem, sortowane po y (tylne najpierw)
    const pts: Array<{ x: number; y: number; pine: boolean; s: number }> = [];
    const step = 34;
    for (let gy = 10; gy < h - 6; gy += step) for (let gx = 12; gx < w - 8; gx += step) {
        pts.push({ x: M + gx + (rng() - 0.5) * 18, y: M + gy + (rng() - 0.5) * 14, pine: rng() < 0.3, s: 0.85 + rng() * 0.4 });
    }
    pts.sort((a, b) => a.y - b.y);
    // v0.195.0: w teksturze zostaje cien + pien; korony rysuje CastleTrees jako bujane sprite'y.
    for (const p of pts) { if (p.pine) drawPine(c, rng, p.x, p.y, p.s, 'base'); else drawTree(c, rng, p.x, p.y, p.s, 'base'); }
    return { tex: PIXI.Texture.from(cv), ox: M, oy: M, trees: pts };
}

function bakeChapel(w: number, h: number, seed: number): Baked {
    const M = 24, H = 46;
    const cv = document.createElement('canvas');
    cv.width = w + M * 2; cv.height = h + M * 2 + H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(seed);
    const x = M, y = M + H;
    // cien kontaktowy
    c.fillStyle = 'rgba(10,20,12,0.22)'; c.fillRect(x + 6, y + 6, w + 6, h + 12);
    // mury w ksztalcie U (ruina: brak sciany S, nierowne korony)
    const wall = (wx: number, wy: number, ww: number, wh: number, top: number): void => {
        const g = c.createLinearGradient(0, wy + wh - top, 0, wy + wh);
        g.addColorStop(0, P.granite); g.addColorStop(1, P.graniteDark);
        c.fillStyle = g; c.fillRect(wx, wy + wh - top, ww, top);
        c.fillStyle = P.graniteTop; c.fillRect(wx, wy - top, ww, wh);
        c.strokeStyle = P.graniteJoint; c.lineWidth = 1; c.globalAlpha = 0.5;
        for (let r = 0; r < top; r += 8) { c.beginPath(); c.moveTo(wx, wy + wh - top + r); c.lineTo(wx + ww, wy + wh - top + r); c.stroke(); }
        c.globalAlpha = 1;
        // nierowna korona ruiny
        c.fillStyle = P.graniteDark;
        for (let i = 0; i < ww / 14; i++) if (rng() < 0.4) c.fillRect(wx + i * 14, wy - top, 8, 4);
    };
    wall(x, y, w, 16, H);                 // N
    wall(x, y, 16, h, H - 12);           // W
    wall(x + w - 16, y, 16, h, H - 20);  // E (nizsza — bardziej zrujnowana)
    // gotycki luk okna w scianie N (ciemny otwor + zloty witraz-resztka)
    const ax = x + w / 2, ay = y + 16 - H + 8;
    c.fillStyle = P.graniteDeep;
    c.beginPath(); c.moveTo(ax - 10, ay + 30); c.lineTo(ax - 10, ay + 10); c.quadraticCurveTo(ax, ay - 8, ax + 10, ay + 10); c.lineTo(ax + 10, ay + 30); c.closePath(); c.fill();
    c.fillStyle = P.gold; c.globalAlpha = 0.7; c.fillRect(ax - 6, ay + 14, 4, 10); c.fillStyle = P.crimson; c.fillRect(ax + 2, ay + 14, 4, 10); c.globalAlpha = 1;
    // posadzka (plyty) + gruz + mech
    c.fillStyle = P.cobble; c.fillRect(x + 16, y + 16, w - 32, h - 16);
    c.strokeStyle = P.cobbleJoint; c.lineWidth = 1; c.globalAlpha = 0.5;
    for (let px = x + 16; px < x + w - 16; px += 20) { c.beginPath(); c.moveTo(px, y + 16); c.lineTo(px, y + h); c.stroke(); }
    for (let py = y + 16; py < y + h; py += 20) { c.beginPath(); c.moveTo(x + 16, py); c.lineTo(x + w - 16, py); c.stroke(); }
    c.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
        c.fillStyle = rng() < 0.5 ? P.granite : P.graniteDark;
        c.beginPath(); c.ellipse(x + 20 + rng() * (w - 40), y + 20 + rng() * (h - 30), 3 + rng() * 5, 2 + rng() * 3, rng(), 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = P.moss; c.globalAlpha = 0.55;
    for (let i = 0; i < 10; i++) { c.beginPath(); c.ellipse(x + rng() * w, y + rng() * h, 5 + rng() * 8, 3, 0, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    // CZYTELNOSC (uwaga Mariusza: "nie wiem, czym jest to kamienne cos"): dzwonnica z dzwonem na
    // szczycie sciany N + krzyz + 3 nagrobki przed ruina = to jest KAPLICA, nie glaz.
    const bx = x + w / 2, by = y + 16 - H;
    c.fillStyle = P.graniteDark; c.fillRect(bx - 14, by - 26, 28, 26);
    c.fillStyle = P.graniteTop; c.fillRect(bx - 14, by - 28, 28, 4);
    c.fillStyle = P.graniteDeep; c.beginPath(); c.moveTo(bx - 8, by - 6); c.lineTo(bx - 8, by - 18); c.arc(bx, by - 18, 8, Math.PI, 0); c.lineTo(bx + 8, by - 6); c.closePath(); c.fill();
    c.fillStyle = P.gold; c.beginPath(); c.moveTo(bx - 5, by - 8); c.quadraticCurveTo(bx - 5, by - 18, bx, by - 18); c.quadraticCurveTo(bx + 5, by - 18, bx + 5, by - 8); c.closePath(); c.fill();
    c.fillStyle = P.goldDark; c.beginPath(); c.arc(bx, by - 7, 1.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.gold; c.lineWidth = 3;
    c.beginPath(); c.moveTo(bx, by - 30); c.lineTo(bx, by - 46); c.moveTo(bx - 6, by - 40); c.lineTo(bx + 6, by - 40); c.stroke();
    for (const gx of [x + 22, x + w / 2 - 6, x + w - 34]) {
        const gy = y + h - 4;
        c.fillStyle = 'rgba(10,20,12,0.28)'; c.beginPath(); c.ellipse(gx + 9, gy + 6, 12, 5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.graniteDark; c.fillRect(gx + 1, gy - 18, 14, 20);
        c.fillStyle = P.granite; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, gy - 14); c.arc(gx + 7, gy - 14, 7, Math.PI, 0); c.lineTo(gx + 14, gy); c.closePath(); c.fill();
        c.strokeStyle = P.graniteDeep; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx + 7, gy - 12); c.lineTo(gx + 7, gy - 3); c.moveTo(gx + 4, gy - 9); c.lineTo(gx + 10, gy - 9); c.stroke();
    }
    return { tex: PIXI.Texture.from(cv), ox: M, oy: M + H };
}

export class CastleSolidProp implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;
    /** v0.195.0 — tylko 'forest': drzewa we wspolrzednych kontenera (korony dopina CastleTrees). */
    public readonly forestTrees: readonly ForestTree[];

    constructor(kind: CastleSolidKind, x: number, y: number, w: number, h: number, seed: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this.container.addChild(this.sprite);
        worldContainer.addChild(this.container);

        const key = `${kind}:${w}x${h}:${seed}`;
        let b = CACHE.get(key);
        if (!b) {
            b = kind === 'forest' ? bakeForest(w, h, seed) : kind === 'chapel' ? bakeChapel(w, h, seed) : bakeCottage(w, h, seed);
            CACHE.set(key, b);
        }
        this.sprite.texture = b.tex;
        this.container.x = x - b.ox;
        this.container.y = y - b.oy;
        this.container.zIndex = y + h + x * 1e-4;
        this.forestTrees = kind === 'forest' ? (b.trees ?? []) : [];
        if (kind === 'forest') LIVE_FORESTS.add(this);
    }

    /** Kontener bloku — korony lasu sa jego dziecmi, wiec zachowuja kolejnosc rysowania bloku. */
    public get view(): PIXI.Container { return this.container; }

    public update(): void {
        // statyczny — brak pracy per-frame
    }

    public destroy(): void {
        LIVE_FORESTS.delete(this);
        this.container.destroy({ children: true });
    }
}
