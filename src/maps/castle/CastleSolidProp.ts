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
    // v0.196.0 (Mariusz: cmentarzysko "bardziej fake 3d — gradienty, cienie"). Slonce NW,
    // spojnie z castleBake: jasne N/W, ciemne S/E, AO przy ziemi, rim-light od NW.
    // ZASADA: liczba i kolejnosc wywolan rng() BEZ ZMIAN — inaczej przesunalby sie gruz i mech.
    // cien kontaktowy — miekki (blur), przesuniety SE, niskie krycie (NIE czarna plama)
    c.save();
    c.filter = 'blur(6px)';
    c.fillStyle = 'rgba(10,20,12,0.26)'; c.fillRect(x + 8, y + 8, w + 2, h + 8);
    c.restore();
    // mury w ksztalcie U (ruina: brak sciany S, nierowne korony)
    const wall = (wx: number, wy: number, ww: number, wh: number, top: number): void => {
        // lico sciany: pionowo jasniej u gory, AO przy ziemi; poziomo cieplej od W, cien od E
        let g = c.createLinearGradient(0, wy + wh - top, 0, wy + wh);
        g.addColorStop(0, P.granite); g.addColorStop(0.75, P.graniteDark); g.addColorStop(1, P.graniteDeep);
        c.fillStyle = g; c.fillRect(wx, wy + wh - top, ww, top);
        g = c.createLinearGradient(wx, 0, wx + ww, 0);
        g.addColorStop(0, 'rgba(255,236,200,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
        c.fillStyle = g; c.fillRect(wx, wy + wh - top, ww, top);
        // korona: gradient po przekatnej jasny NW -> ciemniejszy SE
        g = c.createLinearGradient(wx, wy - top, wx + ww, wy - top + wh);
        g.addColorStop(0, P.graniteTop); g.addColorStop(1, P.granite);
        c.fillStyle = g; c.fillRect(wx, wy - top, ww, wh);
        // ciemny bok E korony (grubosc bryly) + rim-light N i W
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(wx + ww - 3, wy - top, 3, wh);
        c.fillStyle = 'rgba(255,240,210,0.35)'; c.fillRect(wx, wy - top, ww, 2); c.fillRect(wx, wy - top, 2, wh);
        c.strokeStyle = P.graniteJoint; c.lineWidth = 1; c.globalAlpha = 0.5;
        for (let r = 0; r < top; r += 8) { c.beginPath(); c.moveTo(wx, wy + wh - top + r); c.lineTo(wx + ww, wy + wh - top + r); c.stroke(); }
        c.globalAlpha = 1;
        // nierowna korona ruiny (wyszczerbienie + jasny rant od N = krawedz odlamu)
        for (let i = 0; i < ww / 14; i++) if (rng() < 0.4) {
            c.fillStyle = P.graniteDark; c.fillRect(wx + i * 14, wy - top, 8, 4);
            c.fillStyle = 'rgba(255,240,210,0.30)'; c.fillRect(wx + i * 14, wy - top + 4, 8, 1);
        }
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
    // v0.196.0 — cien murow N i W rzucany na posadzke (slonce NW) + AO przy murze E (zero rng)
    {
        const fx = x + 16, fy = y + 16, fw = w - 32, fh = h - 16;
        let g = c.createLinearGradient(0, fy, 0, fy + 34);
        g.addColorStop(0, 'rgba(0,0,0,0.34)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(fx, fy, fw, 34);
        g = c.createLinearGradient(fx, 0, fx + 26, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.30)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(fx, fy, 26, fh);
        g = c.createLinearGradient(fx + fw - 10, 0, fx + fw, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
        c.fillStyle = g; c.fillRect(fx + fw - 10, fy, 10, fh);
    }
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
    // dzwonnica: bryla z gradientem (jasno W, cien E) + ciemny bok E + jasny daszek z rantem
    {
        const g = c.createLinearGradient(bx - 14, 0, bx + 14, 0);
        g.addColorStop(0, P.granite); g.addColorStop(1, P.graniteDeep);
        c.fillStyle = g; c.fillRect(bx - 14, by - 26, 28, 26);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(bx + 11, by - 26, 3, 26);
    }
    c.fillStyle = P.graniteTop; c.fillRect(bx - 14, by - 28, 28, 4);
    c.fillStyle = 'rgba(255,240,210,0.40)'; c.fillRect(bx - 14, by - 28, 28, 1);
    c.fillStyle = P.graniteDeep; c.beginPath(); c.moveTo(bx - 8, by - 6); c.lineTo(bx - 8, by - 18); c.arc(bx, by - 18, 8, Math.PI, 0); c.lineTo(bx + 8, by - 6); c.closePath(); c.fill();
    c.fillStyle = P.gold; c.beginPath(); c.moveTo(bx - 5, by - 8); c.quadraticCurveTo(bx - 5, by - 18, bx, by - 18); c.quadraticCurveTo(bx + 5, by - 18, bx + 5, by - 8); c.closePath(); c.fill();
    c.fillStyle = P.goldDark; c.beginPath(); c.arc(bx, by - 7, 1.8, 0, Math.PI * 2); c.fill();
    // krzyz: najpierw ciemny "bok" przesuniety SE (grubosc), potem zloty front
    const cross = (ox: number, oy: number): void => {
        c.beginPath(); c.moveTo(bx + ox, by - 30 + oy); c.lineTo(bx + ox, by - 46 + oy);
        c.moveTo(bx - 6 + ox, by - 40 + oy); c.lineTo(bx + 6 + ox, by - 40 + oy); c.stroke();
    };
    c.strokeStyle = P.goldDark; c.lineWidth = 3; cross(1.5, 1.5);
    c.strokeStyle = P.gold; c.lineWidth = 3; cross(0, 0);
    // NAGROBKI — bryly: cien SE, kopczyk, ciemny bok SE (grubosc), lico z gradientem NW->SE,
    // rim-light luku, mech u podstawy, pekniecie. Detale w STALYCH miejscach (zero rng).
    for (const gx of [x + 22, x + w / 2 - 6, x + w - 34]) {
        const gy = y + h - 4;
        // miekki cien rzucany na SE
        c.save(); c.filter = 'blur(3px)';
        c.fillStyle = 'rgba(10,20,12,0.28)'; c.beginPath(); c.ellipse(gx + 11, gy + 5, 12, 5, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        // kopczyk ziemi przed grobem (gradient: jasny wierzch, ciemna podstawa)
        let g = c.createLinearGradient(0, gy - 1, 0, gy + 9);
        g.addColorStop(0, '#7a6246'); g.addColorStop(1, '#4a3a28');
        c.fillStyle = g; c.beginPath(); c.ellipse(gx + 7, gy + 4, 11, 5, 0, 0, Math.PI * 2); c.fill();
        const tomb = (): void => {
            c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, gy - 14); c.arc(gx + 7, gy - 14, 7, Math.PI, 0); c.lineTo(gx + 14, gy); c.closePath();
        };
        // bok SE = ta sama sylwetka przesunieta (3,2) w ciemnym kamieniu
        c.save(); c.translate(3, 2); c.fillStyle = P.graniteDeep; tomb(); c.fill(); c.restore();
        // lico
        g = c.createLinearGradient(gx, gy - 21, gx + 14, gy);
        g.addColorStop(0, P.graniteTop); g.addColorStop(0.5, P.granite); g.addColorStop(1, P.graniteDark);
        c.fillStyle = g; tomb(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1; tomb(); c.stroke();
        // rim-light na luku od NW
        c.strokeStyle = 'rgba(255,240,210,0.55)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(gx + 7, gy - 14, 6, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
        // wyryty krzyz
        c.strokeStyle = P.graniteDeep; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx + 7, gy - 12); c.lineTo(gx + 7, gy - 3); c.moveTo(gx + 4, gy - 9); c.lineTo(gx + 10, gy - 9); c.stroke();
        // pekniecie (prawy gorny bark) + mech u podstawy
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(gx + 11, gy - 17); c.lineTo(gx + 10, gy - 13); c.lineTo(gx + 12, gy - 10); c.stroke();
        c.fillStyle = P.moss; c.globalAlpha = 0.7;
        c.beginPath(); c.ellipse(gx + 3, gy - 1, 4, 2, 0, 0, Math.PI * 2); c.ellipse(gx + 12, gy, 3, 1.5, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
    }
    // mgielka przy grobach — plaski, bardzo blady gradient (BEZ iskier: nic nie moze udawac znajdzki)
    {
        const my = y + h - 6;
        const g = c.createRadialGradient(x + w / 2, my, 4, x + w / 2, my, w * 0.55);
        g.addColorStop(0, 'rgba(220,230,235,0.10)'); g.addColorStop(1, 'rgba(220,230,235,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x + w / 2, my, w * 0.55, 16, 0, 0, Math.PI * 2); c.fill();
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
