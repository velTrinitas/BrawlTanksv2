import * as PIXI from 'pixi.js';

/**
 * TROPICS ART v2 / T3 — glebia budynkow + detale gospodarskie (wszystko PIECZONE raz).
 *
 * 1) DLUGI CIEN RZUCANY na SE (swiatlo z NW, jak TROPICS_LIGHT): szesciokat = obrys budynku
 *    + ten sam obrys przesuniety o wysokosc, z gradientem gasnacym od sciany. Najmocniejszy sygnal
 *    fake-3D przy zerowym koszcie w meczu (1 sprite na budynek, warstwa gruntu).
 * 2) KONTAKT Z ZIEMIA: ciemny, miekki pas u podstawy frontu — budynek "siedzi" w gruncie.
 * 3) DETALE GOSPODARSKIE przy scianach (beczki, banki na mleko, worki, wozek z sianem, koryto,
 *    skrzynki z kwiatami, drewno na opal). Stoja WEWNATRZ obrysu kolizji budynku (pas przy dolnej
 *    krawedzi), wiec nie da sie po nich przejechac — Czytelnosc: co wyglada na twarde, jest twarde.
 * Tylko wizual — zero wplywu na symulacje.
 */

type DecorKind = 'barrel' | 'milk' | 'sacks' | 'cart' | 'trough' | 'flowers' | 'logs' | 'pitchfork';

const S = 2; // supersampling tekstur
const _decor = new Map<DecorKind, PIXI.Texture>();
const _shadow = new Map<string, PIXI.Texture>();

function canvas(w: number, h: number, s = S): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const cv = document.createElement('canvas'); cv.width = w * s; cv.height = h * s;
    const c = cv.getContext('2d')!; c.scale(s, s); return [cv, c];
}
function tex(cv: HTMLCanvasElement, s = S): PIXI.Texture {
    return PIXI.Texture.from(cv, { resolution: s } as PIXI.IBaseTextureOptions);
}
function groundShadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
    c.fillStyle = 'rgba(20,35,10,0.35)'; c.beginPath(); c.ellipse(x + 2, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}

function bakeDecor(kind: DecorKind): PIXI.Texture {
    const hit = _decor.get(kind); if (hit) return hit;
    let cv: HTMLCanvasElement, c: CanvasRenderingContext2D;
    switch (kind) {
        case 'barrel': {
            [cv, c] = canvas(26, 30);
            groundShadow(c, 13, 26, 11, 4);
            const g = c.createLinearGradient(3, 0, 23, 0);
            g.addColorStop(0, '#c98a4a'); g.addColorStop(0.35, '#a8692e'); g.addColorStop(1, '#5e3814');
            c.fillStyle = g; c.beginPath(); c.roundRect(3, 6, 20, 20, 5); c.fill();
            c.strokeStyle = '#3e2a1a'; c.lineWidth = 2;
            for (const yy of [10, 21]) { c.beginPath(); c.moveTo(3.5, yy); c.lineTo(22.5, yy); c.stroke(); }
            c.fillStyle = '#d9a466'; c.beginPath(); c.ellipse(13, 6, 10, 3.4, 0, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#5e3814'; c.lineWidth = 1.2; c.stroke();
            c.fillStyle = 'rgba(255,240,200,0.35)'; c.fillRect(6, 9, 2, 14);
            break;
        }
        case 'milk': {
            [cv, c] = canvas(18, 26);
            groundShadow(c, 9, 23, 8, 3);
            const g = c.createLinearGradient(2, 0, 16, 0);
            g.addColorStop(0, '#f2f6f8'); g.addColorStop(0.4, '#c9d3da'); g.addColorStop(1, '#7c8a94');
            c.fillStyle = g; c.beginPath(); c.roundRect(3, 9, 12, 14, 3); c.fill();
            c.beginPath(); c.moveTo(5, 9); c.lineTo(7, 4); c.lineTo(11, 4); c.lineTo(13, 9); c.closePath(); c.fill();
            c.fillStyle = '#5c6b75'; c.beginPath(); c.ellipse(9, 4, 2.6, 1.2, 0, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#4b5860'; c.lineWidth = 1; c.beginPath(); c.roundRect(3, 9, 12, 14, 3); c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(5, 11, 1.5, 9);
            break;
        }
        case 'sacks': {
            [cv, c] = canvas(30, 22);
            groundShadow(c, 15, 19, 13, 4);
            for (const [x, y] of [[9, 13], [21, 13], [15, 7]] as const) {
                const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, 9);
                g.addColorStop(0, '#f1e3be'); g.addColorStop(0.6, '#cdb784'); g.addColorStop(1, '#8c7445');
                c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 8, 6, 0, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#6e5a34'; c.lineWidth = 1; c.stroke();
                c.strokeStyle = '#8c7445'; c.beginPath(); c.moveTo(x - 2, y - 5); c.lineTo(x + 2, y - 5); c.stroke();
            }
            break;
        }
        case 'cart': {
            [cv, c] = canvas(46, 32);
            groundShadow(c, 23, 28, 21, 4);
            const hay = c.createLinearGradient(0, 4, 0, 18);
            hay.addColorStop(0, '#fbe6a0'); hay.addColorStop(1, '#c9953a');
            c.fillStyle = hay; c.beginPath(); c.ellipse(22, 12, 18, 9, 0, Math.PI, 0); c.lineTo(40, 18); c.lineTo(4, 18); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(255,245,200,0.8)'; c.lineWidth = 0.8;
            for (let i = 0; i < 10; i++) { const x = 8 + i * 3.2; c.beginPath(); c.moveTo(x, 8 + (i % 3)); c.lineTo(x + 3, 4 + (i % 2) * 2); c.stroke(); }
            const wood = c.createLinearGradient(0, 16, 0, 24);
            wood.addColorStop(0, '#b0753a'); wood.addColorStop(1, '#6a4220');
            c.fillStyle = wood; c.fillRect(3, 16, 38, 8);
            c.strokeStyle = '#3e2a1a'; c.lineWidth = 1.2; c.strokeRect(3, 16, 38, 8);
            c.beginPath(); c.moveTo(41, 20); c.lineTo(46, 22); c.stroke();
            for (const wx of [11, 33]) {
                c.fillStyle = '#4a3020'; c.beginPath(); c.arc(wx, 25, 5.5, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#9a7048'; c.beginPath(); c.arc(wx, 25, 2, 0, Math.PI * 2); c.fill();
            }
            break;
        }
        case 'trough': {
            [cv, c] = canvas(40, 20);
            groundShadow(c, 20, 17, 18, 3.5);
            const g = c.createLinearGradient(0, 5, 0, 16);
            g.addColorStop(0, '#9a6a3a'); g.addColorStop(1, '#5a3a1a');
            c.fillStyle = g; c.beginPath(); c.roundRect(2, 5, 36, 11, 3); c.fill();
            const w = c.createLinearGradient(0, 6, 0, 10);
            w.addColorStop(0, '#bfe6f5'); w.addColorStop(1, '#4f8fb0');
            c.fillStyle = w; c.beginPath(); c.roundRect(5, 7, 30, 4, 2); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(9, 7.5, 6, 1);
            c.strokeStyle = '#3e2a1a'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(2, 5, 36, 11, 3); c.stroke();
            break;
        }
        case 'flowers': {
            [cv, c] = canvas(34, 18);
            groundShadow(c, 17, 15, 15, 3);
            c.fillStyle = '#8a5a30'; c.fillRect(2, 9, 30, 6); c.fillStyle = '#6a4220'; c.fillRect(2, 13, 30, 2);
            for (let i = 0; i < 6; i++) {
                const x = 5 + i * 4.8, y = 7 - (i % 2) * 2;
                c.fillStyle = '#3f8a2c'; c.beginPath(); c.arc(x, y + 2, 2.6, 0, Math.PI * 2); c.fill();
                c.fillStyle = ['#ff6fa8', '#ffd23a', '#ffffff'][i % 3]; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
            }
            break;
        }
        case 'logs': {
            [cv, c] = canvas(36, 24);
            groundShadow(c, 18, 21, 16, 3.5);
            for (const [x, y] of [[8, 16], [18, 16], [28, 16], [13, 8], [23, 8]] as const) {
                c.fillStyle = '#6a4220'; c.beginPath(); c.arc(x, y, 5.6, 0, Math.PI * 2); c.fill();
                const g = c.createRadialGradient(x - 1, y - 1, 0.5, x, y, 5);
                g.addColorStop(0, '#f0cf96'); g.addColorStop(1, '#b8844a');
                c.fillStyle = g; c.beginPath(); c.arc(x, y, 4.4, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(120,80,40,0.7)'; c.lineWidth = 0.7; c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.stroke();
            }
            break;
        }
        case 'pitchfork': default: {
            [cv, c] = canvas(16, 34);
            c.strokeStyle = '#8a5a30'; c.lineWidth = 2.2; c.lineCap = 'round';
            c.beginPath(); c.moveTo(8, 32); c.lineTo(8, 10); c.stroke();
            c.strokeStyle = '#8a959c'; c.lineWidth = 1.4;
            for (const dx of [-4, 0, 4]) { c.beginPath(); c.moveTo(8 + dx, 10); c.lineTo(8 + dx, 2); c.stroke(); }
            c.beginPath(); c.moveTo(4, 10); c.lineTo(12, 10); c.stroke();
            break;
        }
    }
    const t = tex(cv); _decor.set(kind, t); return t;
}

/** Dlugi cien SE + kontakt z ziemia dla prostokata budynku (klucz = rozmiar + wysokosc). */
function bakeCastShadow(w: number, h: number, height: number): { tex: PIXI.Texture; ox: number; oy: number } {
    const sx = Math.round(height * 0.55), sy = Math.round(height * 0.32);
    const key = `${w}x${h}x${height}`;
    const pad = 16, W = w + sx + pad * 2, H = h + sy + pad * 2;
    let t = _shadow.get(key);
    if (!t) {
        const [cv, c] = canvas(W, H, 1); // PERF: miekki gradient — 1x wystarczy (~7,6 -> ~1,9 MB VRAM)
        c.translate(pad, pad);
        const g = c.createLinearGradient(w * 0.5, h * 0.5, w * 0.5 + sx, h * 0.5 + sy);
        g.addColorStop(0, 'rgba(18,40,10,0.5)'); g.addColorStop(1, 'rgba(18,40,10,0.12)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(w, 0); c.lineTo(w + sx, sy); c.lineTo(w + sx, h + sy); c.lineTo(sx, h + sy); c.lineTo(0, h); c.lineTo(w, h);
        c.closePath(); c.fill();
        // kontakt z ziemia — miekki pas pod frontem
        const ao = c.createLinearGradient(0, h - 4, 0, h + 12);
        ao.addColorStop(0, 'rgba(10,25,5,0.45)'); ao.addColorStop(1, 'rgba(10,25,5,0)');
        c.fillStyle = ao; c.fillRect(-6, h - 4, w + 12, 16);
        t = tex(cv, 1); _shadow.set(key, t);
    }
    return { tex: t, ox: -pad, oy: -pad };
}

export interface FarmDecorTarget {
    x: number; y: number; w: number; h: number;
    /** wysokosc bryly (px) — dlugosc cienia */
    height: number;
    decor: Array<{ kind: DecorKind; fx: number }>; // fx = pozycja wzdluz frontu 0..1
}

/**
 * Wstawia cien + detale dla listy budynkow. Detale stoja w pasie 4-14 px nad dolna krawedzia
 * obrysu (wewnatrz kolizji), zIndex = front budynku + 1 (przed sciana).
 */
export function addFarmDepth(world: PIXI.Container, targets: FarmDecorTarget[]): void {
    for (const t of targets) {
        const sh = bakeCastShadow(t.w, t.h, t.height);
        const s = new PIXI.Sprite(sh.tex);
        s.x = t.x + sh.ox; s.y = t.y + sh.oy; s.zIndex = -88;
        world.addChild(s);
        for (const d of t.decor) {
            const spr = new PIXI.Sprite(bakeDecor(d.kind));
            spr.anchor.set(0.5, 0.88);
            spr.scale.set(1.35); // czytelne przy zoomie 0.6 (telefon)
            spr.x = t.x + t.w * d.fx;
            spr.y = t.y + t.h - 5;
            spr.zIndex = Math.floor(t.y + t.h) + 2;
            world.addChild(spr);
        }
    }
}
