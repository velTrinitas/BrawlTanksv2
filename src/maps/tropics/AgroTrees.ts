import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * AGRO (Tropiki v2) — DRZEWA LISCIASTE (2026-10-06, Mariusz: "inne drzewa lisciaste, z gruba obszerna
 * korona, rozne odcienie zieleni, male gaiki, spojne artystycznie; dookola mapy male ruszajace sie
 * drzewka, tanie na mobile — jak na Pustyni").
 *
 * Jeden painter dla gaikow i obrzeza = jeden styl: korona z nakladajacych sie "klebow" (kazdy z
 * gradientem swiatla z NW, jak bryly czolgow), wspolny ciemny obrys sylwety, cetki lisci, pien
 * z gradientem walca, cien kontaktowy SE. Pieczone RAZ (canvas), w meczu tylko sprite'y.
 *
 * Gaiki: kolizja dla czolgu I pocisku (nie da sie wjechac ani zestrzelic) — prostokat u podstawy
 * korony (tam, gdzie drzewo "stoi"). Obrzeze: tylko wizual (kolizje ma pas TropicalBorder),
 * kolysanie skew/rotacja na zegarze kroku, animowane tylko widoczne krawedzie.
 */

const RES = 2;
const OUTLINE = '#173a12';
/** Palety [swiatlo, srodek, cien] — WYLACZNIE odcienie zieleni. */
const PALETTES: Array<[string, string, string]> = [
    ['#a6dc5e', '#5fa83a', '#2c6420'],   // soczysta
    ['#c0e478', '#7cb842', '#3c7826'],   // jasna wiosenna
    ['#8ccf78', '#4f9a4a', '#22582c'],   // chlodna
    ['#b0cf5e', '#6f9a34', '#385a1c'],   // oliwkowa
    ['#86d690', '#3f9a5a', '#1d5832'],   // szmaragdowa
];

/** Obrzeze: ciemniejsze, nasycone zielenie — wyraznie odcinaja sie od jasnej trawy. */
const EDGE_PALETTES: Array<[string, string, string]> = [
    ['#5fae3e', '#2f7a2a', '#164a18'],
    ['#6fb84a', '#3a8a34', '#1b5420'],
    ['#4fa04a', '#277236', '#123f1e'],
];

function hash(i: number): number { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); }

/** Rysuje drzewo w ukladzie: podstawa pnia w (0,0), korona w gore. `k` = skala. */
function paintTree(c: CanvasRenderingContext2D, variant: number, k: number, crownOnly = false): void {
    const [L, M, D] = crownOnly ? EDGE_PALETTES[variant % EDGE_PALETTES.length] : PALETTES[variant % PALETTES.length];
    const seed = variant * 31 + 7;
    // cien kontaktowy SE (pod korona, na ziemi)
    const sg = c.createRadialGradient(10 * k, 2 * k, 2, 10 * k, 2 * k, 40 * k);
    sg.addColorStop(0, 'rgba(15,40,10,0.42)'); sg.addColorStop(1, 'rgba(15,40,10,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(10 * k, 2 * k, 40 * k, 13 * k, 0, 0, Math.PI * 2); c.fill();
    // pien (walec: jasny lewy bok) + rozszerzenie korzeni
    const tw = 6 * k, th = crownOnly ? -6 * k : 30 * k;
    if (!crownOnly) {
    const tg = c.createLinearGradient(-tw, 0, tw, 0);
    tg.addColorStop(0, '#9a7448'); tg.addColorStop(0.5, '#6e4e2c'); tg.addColorStop(1, '#3e2a16');
    c.fillStyle = OUTLINE;
    c.beginPath(); c.moveTo(-tw - 4 * k - 1.5, 1.5); c.lineTo(-tw * 0.75 - 1.5, -th); c.lineTo(tw * 0.75 + 1.5, -th); c.lineTo(tw + 4 * k + 1.5, 1.5); c.closePath(); c.fill();
    c.fillStyle = tg;
    c.beginPath(); c.moveTo(-tw - 4 * k, 0); c.quadraticCurveTo(-tw, -4 * k, -tw * 0.75, -th); c.lineTo(tw * 0.75, -th); c.quadraticCurveTo(tw, -4 * k, tw + 4 * k, 0); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(30,18,8,0.5)'; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const x = (-2 + i * 2) * k; c.beginPath(); c.moveTo(x, -2 * k); c.lineTo(x + k, -th + 4 * k); c.stroke(); }
    }
    // KORONA: kleby rozlozone w kopule (dalsze/nizsze najpierw)
    const cy = -th - 22 * k;
    const lobes: Array<[number, number, number]> = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash(seed + i) * 0.5;
        const rr = (16 + hash(seed + i + 50) * 6) * k;
        lobes.push([Math.cos(a) * 22 * k, cy + Math.sin(a) * 15 * k, rr]);
    }
    lobes.push([0, cy - 4 * k, 22 * k]);                    // srodek
    lobes.push([-8 * k, cy - 14 * k, 15 * k]);              // czubek w sloncu
    lobes.sort((p, q) => (q[0] - q[1]) - (p[0] - p[1]));     // SE (cien) najpierw, NW (slonce) na koniec
    // wspolny obrys sylwety
    c.fillStyle = OUTLINE;
    for (const [x, y, r] of lobes) { c.beginPath(); c.arc(x, y, r + 2.2, 0, Math.PI * 2); c.fill(); }
    // cien dolu korony (AO nad pniem)
    c.fillStyle = D;
    for (const [x, y, r] of lobes) { c.beginPath(); c.arc(x, y + 1.5 * k, r, 0, Math.PI * 2); c.fill(); }
    for (const [x, y, r] of lobes) {
        const g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
        g.addColorStop(0, L); g.addColorStop(0.55, M); g.addColorStop(1, D);
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    // cetki lisci (ciemne w cieniu, jasne w sloncu) — przyciete do korony
    c.save(); c.beginPath(); for (const [x, y, r] of lobes) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); } c.clip();
    for (let i = 0; i < 70; i++) {
        const x = (hash(seed * 3 + i) - 0.5) * 80 * k, y = cy + (hash(seed * 5 + i) - 0.5) * 60 * k;
        const lit = (x + (y - cy)) < 0;
        c.fillStyle = lit ? 'rgba(235,255,190,0.55)' : 'rgba(10,40,10,0.35)';
        c.beginPath(); c.ellipse(x, y, 2.6 * k, 1.6 * k, 0.6, 0, Math.PI * 2); c.fill();
    }
    // cien dolnej krawedzi korony (glebia)
    const bot = c.createLinearGradient(0, cy, 0, cy + 30 * k);
    bot.addColorStop(0, 'rgba(10,40,10,0)'); bot.addColorStop(1, 'rgba(10,40,10,0.35)');
    c.fillStyle = bot; c.fillRect(-60 * k, cy, 120 * k, 40 * k);
    c.restore();
    c.fillStyle = 'rgba(255,255,230,0.45)'; c.beginPath(); c.ellipse(-12 * k, cy - 18 * k, 7 * k, 3.5 * k, -0.4, 0, Math.PI * 2); c.fill();
}

const _tex = new Map<string, PIXI.Texture>();
/** Tekstura drzewa; anchor = podstawa pnia. */
function treeTexture(variant: number, k: number, crownOnly = false): { tex: PIXI.Texture; ax: number; ay: number } {
    const w = 110 * k, h = (crownOnly ? 90 : 130) * k, ox = w / 2, oy = h - 18 * k;
    const key = variant + ':' + k + (crownOnly ? ':c' : '');
    let tex = _tex.get(key);
    if (!tex || tex.destroyed) {
        const cv = document.createElement('canvas'); cv.width = Math.ceil(w * RES); cv.height = Math.ceil(h * RES);
        const c = cv.getContext('2d')!; c.scale(RES, RES); c.translate(ox, oy);
        paintTree(c, variant, k, crownOnly);
        tex = PIXI.Texture.from(cv, { resolution: RES } as PIXI.IBaseTextureOptions);
        _tex.set(key, tex);
    }
    return { tex, ax: ox / w, ay: oy / h };
}

/** Eksport dla podgladu dev. */
export function drawAgroTree(c: CanvasRenderingContext2D, variant: number, k: number): void { paintTree(c, variant, k); }

function solid(x: number, y: number, w: number, h: number): ICollidable { return { x, y, w, h, update: () => {} }; }

/**
 * GAIKI: 4 drzewa na skupisko (w obrysie dawnej kepy palm — te same miejsca). Rozne palety i skale.
 */
export function buildAgroGroves(world: PIXI.Container, spots: ReadonlyArray<{ x: number; y: number }>, tankColliders: ICollidable[], bulletColliders: ICollidable[]): void {
    const OFFS: Array<[number, number, number]> = [[30, 38, 1.0], [80, 26, 0.9], [56, 92, 1.08], [90, 78, 0.85]];
    spots.forEach((p, gi) => {
        OFFS.forEach(([dx, dy, s], i) => {
            const variant = (gi * 2 + i) % PALETTES.length;
            const k = Math.round(1.0 * s * 20) / 20; // obszerne korony (Mariusz)
            const { tex, ax, ay } = treeTexture(variant, k);
            const spr = new PIXI.Sprite(tex);
            spr.anchor.set(ax, ay);
            spr.x = p.x + dx; spr.y = p.y + dy; spr.zIndex = p.y + dy;
            if ((gi + i) % 2) spr.scale.x = -1; // lustro = mniej powtarzalnosci
            world.addChild(spr);
            // kolizja u podstawy korony (Czytelnosc: tam, gdzie drzewo stoi na ziemi)
            const cw = 34 * k, ch = 20 * k;
            const c = solid(p.x + dx - cw / 2, p.y + dy - ch * 0.8, cw, ch);
            tankColliders.push(c); bulletColliders.push(c);
        });
    });
}

interface Swayer { spr: PIXI.Sprite; ph: number; amp: number; }

/** OBRZEZE: male kolyszace sie drzewka wzdluz 4 krawedzi (tylko wizual). */
export class AgroBorderTrees {
    private readonly edges: Swayer[][] = [[], [], [], []];
    private step = 0;

    constructor(world: PIXI.Container, W: number, H: number) {
        // Mariusz: miniaturowe, zabawne, nie dominuja — SAME KORONY jak zywoplot/"dymek" z Brawl Stars,
        // gesto (zachodza na siebie), ciemniejsze od trawy, zeby granica mapy byla czytelna.
        const STEP = 22;
        const sides: Array<{ len: number; at: (s: number, j: number) => [number, number] }> = [
            { len: W, at: (s, j) => [s, 22 + j * 10] },
            { len: W, at: (s, j) => [s, H - 2 - j * 10] },
            { len: H, at: (s, j) => [12 + j * 10, s] },
            { len: H, at: (s, j) => [W - 12 - j * 10, s] },
        ];
        // PERF (pomiar A54 2026-10-06: 1226 dzieci swiata, JS 3 ms, przyciecia w renderze): korony w 4 KONTENERACH
        // (1 na krawedz) zamiast ~540 dzieci worldContainer — swiat sortuje 4 obiekty, a cala krawedz poza kadrem
        // odpada jednym testem cullArea. Gora za czolgami, dol i boki przed (korony = zywoplot na wierzchu).
        const M = 40;
        const groups = [
            { z: 30, area: new PIXI.Rectangle(-M, -M, W + 2 * M, 60 + 2 * M) },
            { z: H + 100, area: new PIXI.Rectangle(-M, H - 60 - M, W + 2 * M, 60 + 2 * M) },
            { z: H + 100, area: new PIXI.Rectangle(-M, -M, 60 + 2 * M, H + 2 * M) },
            { z: H + 100, area: new PIXI.Rectangle(W - 60 - M, -M, 60 + 2 * M, H + 2 * M) },
        ].map(g => { const c = new PIXI.Container(); c.zIndex = g.z; c.cullable = true; c.cullArea = g.area; world.addChild(c); return c; });
        let n = 0;
        sides.forEach((e, ei) => {
            for (let s = 0; s <= e.len; s += STEP) {
                const h = hash(n++);
                const variant = Math.floor(h * EDGE_PALETTES.length);
                const k = [0.3, 0.35, 0.4][Math.floor(hash(n + 300) * 3)];
                const { tex, ax, ay } = treeTexture(variant, k, true);
                const [x, y] = e.at(s + (hash(n + 77) - 0.5) * 8, hash(n + 9) < 0.5 ? 0 : 1);
                const spr = new PIXI.Sprite(tex);
                spr.anchor.set(ax, ay);
                spr.x = x; spr.y = y;
                if (h > 0.5) spr.scale.x = -1;
                groups[ei].addChild(spr); // kolejnosc dodawania = kolejnosc rysowania (bez sortowania)
                this.edges[ei].push({ spr, ph: hash(n + 500) * Math.PI * 2, amp: 0.05 + hash(n + 600) * 0.04 });
            }
        });
    }

    /** Kolysanie na wietrze: tylko krawedzie widoczne w kadrze. */
    update(camX: number, camY: number, viewW: number, viewH: number, W: number, H: number): void {
        this.step++;
        const t = this.step * 0.035;
        const M = 140;
        const see = [camY < M, camY + viewH > H - M, camX < M, camX + viewW > W - M];
        for (let e = 0; e < 4; e++) {
            if (!see[e]) continue;
            for (const s of this.edges[e]) {
                const w = Math.sin(t + s.ph) + 0.35 * Math.sin(t * 2.3 + s.ph * 1.7); // poryw + drganie
                s.spr.skew.x = w * s.amp;
                s.spr.rotation = w * s.amp * 0.25;
            }
        }
    }
}
