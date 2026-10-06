import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../../config/constants';
import { TROPICS_DIRT_ROAD_PATHS } from '../TropicsMap';

/**
 * TROPICS ART v2 / T2 — grunt Tropikow v2 (pieczony RAZ, cache 'tropics_v2').
 *
 * Co nowego wzgledem legacy (`buildTropicsTexture`):
 *  - laka z DUZYMI miekkimi plamami swiatla/cienia (glebia zamiast plaskiej zieleni),
 *  - kepki trawy w 3D (ciemna nasada + jasny czubek, swiatlo z NW jak TROPICS_LIGHT),
 *  - koniczyna i kwiaty w KEPACH (naturalne skupiska zamiast rownego rozsypania),
 *  - DROGI WPIECZONE w grunt: cien krawedzi, gradient w poprzek, koleiny z odblaskiem,
 *    kepka trawy na srodku bocznych drog, kamyki z cieniem.
 *    Legacy rysowal drogi jako 4 zywe Graphics na droge (14 drog = 56 obiektow) — v2 = 0.
 *  - bloto przy oborze i zagrodzie.
 * Deterministyczne (mulberry32) — ten sam grunt u kazdego gracza i w kazdym meczu.
 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ROAD_W = 52;

export function buildTropicsTextureV2(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W; cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rnd = mulberry32(20261003);
    const R = (a: number, b: number) => a + rnd() * (b - a);

    // 1. baza + slonce z NW
    c.fillStyle = '#6cba48'; c.fillRect(0, 0, WORLD_W, WORLD_H);
    const sun = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    sun.addColorStop(0, 'rgba(255,240,170,0.24)'); sun.addColorStop(0.5, 'rgba(255,240,170,0.04)'); sun.addColorStop(1, 'rgba(15,40,10,0.20)');
    c.fillStyle = sun; c.fillRect(0, 0, WORLD_W, WORLD_H);

    // 2. duze miekkie plamy swiatla i cienia (glebia laki)
    for (let i = 0; i < 70; i++) {
        const x = R(0, WORLD_W), y = R(0, WORLD_H), r = R(120, 340);
        const light = rnd() < 0.55;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, light ? 'rgba(170,230,110,0.30)' : 'rgba(40,110,30,0.26)');
        g.addColorStop(1, light ? 'rgba(170,230,110,0)' : 'rgba(40,110,30,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * R(0.6, 0.9), R(0, Math.PI), 0, Math.PI * 2); c.fill();
    }

    // 3. mikrotekstura (lzejsza niz legacy, ale z kierunkiem swiatla)
    for (let i = 0; i < 2600; i++) {
        const x = R(0, WORLD_W), y = R(0, WORLD_H);
        c.globalAlpha = R(0.14, 0.32);
        c.fillStyle = ['#88d65a', '#a3e074', '#5fa83e', '#4a8c32', '#3a7028'][Math.floor(rnd() * 5)];
        c.beginPath(); c.ellipse(x, y, R(2.5, 7), R(1.4, 3.2), R(0, Math.PI), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    // 3b. AGRO GLEBIA (2026-10-06, Mariusz: "zeby trawa nabrala glebi") — wszystko pieczone, 0 kosztu w meczu.
    //  a) lagodne PAGORKI: strona NW w sloncu, SE w cieniu (ten sam kierunek swiatla co budynki i czolgi)
    for (let i = 0; i < 46; i++) {
        const x = R(120, WORLD_W - 120), y = R(120, WORLD_H - 120), r = R(140, 300), sq = R(0.55, 0.8);
        const sh = c.createRadialGradient(x + r * 0.18, y + r * 0.18 * sq, r * 0.2, x, y, r);
        sh.addColorStop(0, 'rgba(30,80,20,0)'); sh.addColorStop(0.7, 'rgba(30,80,20,0.10)'); sh.addColorStop(1, 'rgba(30,80,20,0)');
        c.fillStyle = sh; c.beginPath(); c.ellipse(x + r * 0.12, y + r * 0.12 * sq, r, r * sq, 0, 0, Math.PI * 2); c.fill();
        const li = c.createRadialGradient(x - r * 0.25, y - r * 0.25 * sq, 0, x - r * 0.1, y - r * 0.1 * sq, r * 0.75);
        li.addColorStop(0, 'rgba(200,245,140,0.22)'); li.addColorStop(1, 'rgba(200,245,140,0)');
        c.fillStyle = li; c.beginPath(); c.ellipse(x - r * 0.1, y - r * 0.1 * sq, r * 0.75, r * 0.75 * sq, 0, 0, Math.PI * 2); c.fill();
    }
    //  b) cienie chmur — kilka duzych, bardzo miekkich plam (statyczne)
    for (let i = 0; i < 9; i++) {
        const x = R(0, WORLD_W), y = R(0, WORLD_H), r = R(260, 480);
        const g = c.createRadialGradient(x, y, r * 0.3, x, y, r);
        g.addColorStop(0, 'rgba(20,60,25,0.13)'); g.addColorStop(1, 'rgba(20,60,25,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * 0.62, R(-0.4, 0.4), 0, Math.PI * 2); c.fill();
    }
    //  c) KEPY WYSOKIEJ TRAWY: ciemna nasada + cien SE + jasne czubki (wyrazny relief na mikro-skali)
    c.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
        const cx = R(60, WORLD_W - 60), cy = R(60, WORLD_H - 60);
        const g = c.createRadialGradient(cx + 6, cy + 5, 2, cx + 6, cy + 5, 34);
        g.addColorStop(0, 'rgba(25,70,15,0.22)'); g.addColorStop(1, 'rgba(25,70,15,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(cx + 6, cy + 5, 34, 20, 0, 0, Math.PI * 2); c.fill();
        for (let k = 0; k < 16; k++) {
            const x = cx + R(-26, 26), y = cy + R(-15, 15), h = R(9, 15);
            for (let b = 0; b < 4; b++) {
                const a = -Math.PI / 2 + (b - 1.5) * 0.3 + R(-0.15, 0.15);
                const ex = x + Math.cos(a) * h, ey = y + Math.sin(a) * h;
                c.strokeStyle = 'rgba(40,100,25,0.75)'; c.lineWidth = 2.2;
                c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
                c.strokeStyle = 'rgba(175,235,110,0.8)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(x + Math.cos(a) * h * 0.5 - 0.6, y + Math.sin(a) * h * 0.5); c.lineTo(ex - 0.4, ey); c.stroke();
            }
        }
    }

    // 4. kepki trawy 3D (cien SE + ciemna nasada + jasne czubki)
    c.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
        const x = R(0, WORLD_W), y = R(0, WORLD_H);
        const n = 3 + Math.floor(rnd() * 3), h = R(5, 10);
        c.fillStyle = 'rgba(20,50,10,0.10)';
        c.beginPath(); c.ellipse(x + 2, y + 1.5, 5, 2, 0, 0, Math.PI * 2); c.fill();
        for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.32 + R(-0.12, 0.12);
            const ex = x + Math.cos(a) * h, ey = y + Math.sin(a) * h;
            c.strokeStyle = 'rgba(62,128,38,0.42)'; c.lineWidth = 1.8;
            c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
            c.strokeStyle = 'rgba(190,240,130,0.65)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(x + Math.cos(a) * h * 0.45, y + Math.sin(a) * h * 0.45); c.lineTo(ex, ey); c.stroke();
        }
    }

    // 5. koniczyna w kepach
    for (let i = 0; i < 45; i++) {
        const cx = R(80, WORLD_W - 80), cy = R(80, WORLD_H - 80);
        for (let k = 0; k < 14; k++) {
            const x = cx + R(-34, 34), y = cy + R(-22, 22);
            for (let l = 0; l < 3; l++) {
                const a = l * 2.09 + R(0, 0.4);
                c.fillStyle = l === 0 ? '#4f9a34' : '#5aa83c';
                c.beginPath(); c.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.4, 0, Math.PI * 2); c.fill();
            }
            c.fillStyle = 'rgba(220,255,190,0.5)'; c.beginPath(); c.arc(x - 0.8, y - 0.8, 0.9, 0, Math.PI * 2); c.fill();
        }
    }

    // 6. kwiaty w skupiskach (kolor na kepe — naturalnie)
    const FLOWERS = ['#ffffff', '#f9e5a8', '#e8c0e0', '#f0a8a8', '#c8d0ff', '#ffd23a'];
    for (let i = 0; i < 70; i++) {
        const cx = R(60, WORLD_W - 60), cy = R(60, WORLD_H - 60);
        const col = FLOWERS[Math.floor(rnd() * FLOWERS.length)];
        for (let k = 0; k < 7; k++) {
            const x = cx + R(-26, 26), y = cy + R(-16, 16);
            c.fillStyle = 'rgba(20,50,10,0.22)'; c.beginPath(); c.arc(x + 1.5, y + 1.5, 3.2, 0, Math.PI * 2); c.fill();
            c.fillStyle = col;
            for (let p = 0; p < 5; p++) { const a = p * 1.2566; c.beginPath(); c.arc(x + Math.cos(a) * 2.3, y + Math.sin(a) * 2.3, 1.9, 0, Math.PI * 2); c.fill(); }
            c.fillStyle = '#f7c948'; c.beginPath(); c.arc(x, y, 1.3, 0, Math.PI * 2); c.fill();
        }
    }

    // 7. bloto przy oborze i zagrodzie koni (przejezdne, tylko grunt)
    const mud = (x: number, y: number, rx: number, ry: number) => {
        const g = c.createRadialGradient(x, y, 0, x, y, rx);
        g.addColorStop(0, 'rgba(96,66,30,0.75)'); g.addColorStop(0.7, 'rgba(110,80,38,0.45)'); g.addColorStop(1, 'rgba(110,80,38,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
    };
    mud(2048, 2262, 95, 70); mud(510, 940, 120, 60); // bajorko swin + zagroda koni

    // 8. DROGI wpieczone
    // Warstwami dla WSZYSTKICH drog naraz (cien -> krawedz -> nawierzchnia -> grzbiet), potem detale.
    // Rysowanie droga-po-drodze dawalo widoczne zaokraglone konce i obwodki na skrzyzowaniach
    // (zrzut Mariusza 20261002_tropiki12) — warstwy wspolne zlewaja skrzyzowania w jedno.
    const roads = TROPICS_DIRT_ROAD_PATHS;
    const strokeAll = (w: number, style: string, dx = 0, dy = 0) => {
        c.save(); c.translate(dx, dy);
        c.strokeStyle = style; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const p of roads) { c.beginPath(); c.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y); c.stroke(); }
        c.restore();
    };
    strokeAll(ROAD_W + 18, 'rgba(25,45,10,0.22)', 4, 5);   // cien/AO pobocza (swiatlo z NW)
    strokeAll(ROAD_W + 8, 'rgba(70,52,22,0.55)');           // ciemny skraj ziemi
    strokeAll(ROAD_W, '#a07a3a');                            // nawierzchnia
    strokeAll(ROAD_W - 14, '#b88f4c');                       // jasniejszy srodek (wypuklosc)
    strokeAll(ROAD_W - 30, 'rgba(214,176,108,0.45)');        // najjasniejszy grzbiet
    for (const path of roads) {
        const main = Math.abs(path[0].x - path[path.length - 1].x) > 3000 || Math.abs(path[0].y - path[path.length - 1].y) > 3000;
        drawRoadDetails(c, path, main, rnd);
    }

    // 9. winieta
    const vig = c.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.4, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(15,40,10,0.24)');
    c.fillStyle = vig; c.fillRect(0, 0, WORLD_W, WORLD_H);

    return PIXI.Texture.from(cv);
}

function drawRoadDetails(c: CanvasRenderingContext2D, path: Array<{ x: number; y: number }>, main: boolean, rnd: () => number): void {
    const R = (a: number, b: number) => a + rnd() * (b - a);
    for (let s = 0; s < path.length - 1; s++) {
        const a = path[s], b = path[s + 1];
        const horiz = a.y === b.y;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / (len || 1), uy = (b.y - a.y) / (len || 1);
        const nx = -uy, ny = ux;
        const skip = main ? 0 : 34; // boczna droga: detale koncza sie przed skrzyzowaniem
        const inSeg = (d: number) => d >= skip && d <= len - skip;
        // koleiny: ciemny rowek + jasna krawedz (swiatlo z NW => odblask po stronie N/W)
        for (const off of [-11, 11]) {
            c.lineCap = 'round';
            c.strokeStyle = 'rgba(92,62,28,0.55)'; c.lineWidth = 5;
            const ax = a.x + ux * skip, ay = a.y + uy * skip, bx = b.x - ux * skip, by = b.y - uy * skip;
            c.beginPath(); c.moveTo(ax + nx * off, ay + ny * off); c.lineTo(bx + nx * off, by + ny * off); c.stroke();
            c.strokeStyle = 'rgba(230,200,140,0.40)'; c.lineWidth = 1.4;
            const hl = off + (horiz ? -2.4 : -2.4);
            c.beginPath(); c.moveTo(ax + nx * hl, ay + ny * hl); c.lineTo(bx + nx * hl, by + ny * hl); c.stroke();
        }
        // boczne drogi: pas trawy miedzy koleinami
        if (!main) {
            for (let d = Math.max(6, skip); d < len - Math.max(6, skip); d += 7) {
                const x = a.x + ux * d + R(-2, 2), y = a.y + uy * d + R(-2, 2);
                c.strokeStyle = 'rgba(80,140,50,0.75)'; c.lineWidth = 1.6;
                c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x + R(-2, 2), y - 4); c.stroke();
            }
        }
        // kamyki z cieniem
        const nPeb = Math.floor(len / 26);
        for (let i = 0; i < nPeb; i++) {
            const t = rnd(), side = R(-ROAD_W / 2 + 4, ROAD_W / 2 - 4);
            if (!inSeg(len * t)) continue;
            const x = a.x + ux * len * t + nx * side, y = a.y + uy * len * t + ny * side;
            const r = R(1.6, 3.4);
            c.fillStyle = 'rgba(40,25,10,0.35)'; c.beginPath(); c.ellipse(x + 1.2, y + 1.2, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = ['#8a7a60', '#a09078', '#6e5e48'][Math.floor(rnd() * 3)];
            c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(255,250,230,0.55)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2); c.fill();
        }
        // kaluze usuniete (Mariusz 2026-10-05: nierealistyczne)
        // trawa wchodzaca na pobocze (miekka krawedz drogi)
        for (let d = skip; d < len - skip; d += 9) {
            for (const sgn of [-1, 1]) {
                const off = sgn * (ROAD_W / 2 + R(-3, 2));
                const x = a.x + ux * d + nx * off, y = a.y + uy * d + ny * off;
                c.strokeStyle = 'rgba(70,140,44,0.85)'; c.lineWidth = 1.8;
                c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x + R(-2.5, 2.5), y - R(3, 6)); c.stroke();
            }
        }
    }
}
