import { CASTLE_PALETTE as P } from './castlePalette';
import type { CastleRect } from '../CastleMap';
import { moatLoopFrom, moatLoopPath, moatLoopPoint } from './castleMoatLoop';

/**
 * castleGroundV2.ts — CASTLE ART v2, warstwa gruntu (za `?castleart`, castleArtFlag.ts).
 *
 * Domalowuje na gotowy bake gruntu (buildCastleTexture) PO sekcji bruku: glebia fosy z kamiennym
 * nabrzezem, piana i odbiciami, mosty z desek z cieniem na wodzie, bruk dziedzinca z kamieni
 * o roznych odcieniach, wydeptane trakty do bram i DLUGIE cienie bryl zamku (wrazenie wysokosci).
 *
 * KOSZT: zero w meczu — wszystko trafia do tej samej tekstury 3000x3000 (kafle 750 px, te same MB).
 * Wlasny rng (nie rusza glownego rng bake'u, wiec reszta dekoru mapy zostaje 1:1).
 * Swiatlo T1: slonce NW, cienie SE (spojne z castleBake i czolgami).
 */

export interface CastleGroundV2Geo {
    moat: readonly CastleRect[];
    bridges: readonly CastleRect[];
    courtyard: CastleRect;
    keep: CastleRect;
    towers: readonly CastleRect[];
    walls: readonly CastleRect[];
    gates: readonly CastleRect[];
    turrets: readonly CastleRect[];
    center: { x: number; y: number };
}

function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const STONE_TONES = ['#a6a299', '#a09c93', '#aca89f', '#9a968d'];

/** Bruk dziedzinca + trakty + plac donzonu + cienie murow na bruku. */
export function paintCourtyardV2(c: CanvasRenderingContext2D, g: CastleGroundV2Geo): void {
    const rng = makeRng(0x0c0b1e57);
    const cy = g.courtyard;
    c.save();
    c.beginPath(); c.rect(cy.x, cy.y, cy.w, cy.h); c.clip();
    c.fillStyle = '#8a867d';
    c.fillRect(cy.x, cy.y, cy.w, cy.h);
    // kamienie: rzedy 22 px, losowa szerokosc, 4 odcienie, bevel NW jasny / SE ciemny
    const RH = 22;
    for (let y = cy.y; y < cy.y + cy.h; y += RH) {
        let x = cy.x - rng() * 20;
        while (x < cy.x + cy.w) {
            const w = 18 + rng() * 18;
            const sx = x + 1.5, sy = y + 1.5, sw = w - 3, sh = RH - 3;
            c.fillStyle = STONE_TONES[Math.floor(rng() * STONE_TONES.length)];
            c.beginPath(); c.roundRect(sx, sy, sw, sh, 4); c.fill();
            c.fillStyle = 'rgba(255,250,235,0.14)';
            c.fillRect(sx + 2, sy + 1, sw - 4, 1.5);
            c.fillStyle = 'rgba(0,0,0,0.12)';
            c.fillRect(sx + 2, sy + sh - 2, sw - 4, 1.5);
            if (rng() < 0.08) { // mech w spoinie
                c.fillStyle = 'rgba(95,138,62,0.55)';
                c.fillRect(sx + rng() * sw, sy + sh - 1, 5 + rng() * 6, 2);
            }
            x += w;
        }
    }
    // wydeptane trakty brama -> donzon (czytelne kierunki ataku)
    const cx = g.center.x, cyy = g.center.y;
    for (const vertical of [true, false]) {
        const grad = vertical
            ? c.createLinearGradient(cx - 60, 0, cx + 60, 0)
            : c.createLinearGradient(0, cyy - 60, 0, cyy + 60);
        grad.addColorStop(0, 'rgba(150,126,88,0)');
        grad.addColorStop(0.5, 'rgba(150,126,88,0.38)');
        grad.addColorStop(1, 'rgba(150,126,88,0)');
        c.fillStyle = grad;
        if (vertical) c.fillRect(cx - 60, cy.y, 120, cy.h); else c.fillRect(cy.x, cyy - 60, cy.w, 120);
    }
    // plac donzonu: lekko ciemniejsza, wytarta plama (bez okregow — nie moze czytac sie jak znacznik ataku)
    const k = g.keep;
    const kr = Math.max(k.w, k.h) * 0.5 + 60;
    const pg = c.createRadialGradient(cx, cyy, kr * 0.5, cx, cyy, kr);
    pg.addColorStop(0, 'rgba(60,56,48,0.22)'); pg.addColorStop(1, 'rgba(60,56,48,0)');
    c.fillStyle = pg; c.beginPath(); c.arc(cx, cyy, kr, 0, Math.PI * 2); c.fill();
    // cien murow N i W na bruku (slonce NW) + AO wzdluz murow S/E
    const sh = (x0: number, y0: number, x1: number, y1: number, a: number, w: number, h: number, x: number, y: number) => {
        const gr = c.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, `rgba(18,24,20,${a})`);
        gr.addColorStop(1, 'rgba(18,24,20,0)');
        c.fillStyle = gr; c.fillRect(x, y, w, h);
    };
    sh(0, cy.y, 0, cy.y + 50, 0.38, cy.w, 50, cy.x, cy.y);
    sh(cy.x, 0, cy.x + 50, 0, 0.38, 50, cy.h, cy.x, cy.y);
    sh(0, cy.y + cy.h, 0, cy.y + cy.h - 16, 0.26, cy.w, 16, cy.x, cy.y + cy.h - 16);
    sh(cy.x + cy.w, 0, cy.x + cy.w - 16, 0, 0.26, 16, cy.h, cy.x + cy.w - 16, cy.y);
    c.restore();
}

/**
 * Woda fosy jako JEDEN pierscien (castleMoatLoop): dno z kamykami widoczne przez plytka wode,
 * warstwy glebi od brzegu do nurtu (glebsze warstwy zakrecaja lukiem na rogach), kaustyki
 * na plyciznie, cien nabrzeza, ciagle nabrzeze i piana bez szwow na rogach. Woda biegnie tez pod
 * mostami (mosty malowane pozniej) — jedna rzeka dookola zamku, nie 8 kawalkow.
 */
export function paintMoatV2(c: CanvasRenderingContext2D, g: CastleGroundV2Geo): void {
    const rng = makeRng(0x0f05a7e2);
    const L = moatLoopFrom(g.moat);
    const T = L.half * 2;
    // rogi zewnetrzne: woda skreca lukiem (promien = szerokosc kanalu), wiec klin miedzy lukiem a dawnym
    // rogiem staje sie laka — bez murku pod katem 90 st. (krzaki dosadzone po wodzie, paintCornerBushes)
    const CB = T + 16;
    const corners: Array<[number, number]> = [[L.o0 - 16, L.o0 - 16], [L.o1 - T, L.o0 - 16], [L.o1 - T, L.o1 - T], [L.o0 - 16, L.o1 - T]];
    for (const [x, y] of corners) {
        c.fillStyle = P.meadow; c.fillRect(x, y, CB, CB);
        const pg = c.createRadialGradient(x + CB / 2, y + CB / 2, 4, x + CB / 2, y + CB / 2, CB * 0.7);
        pg.addColorStop(0, 'rgba(106,168,74,0.5)'); pg.addColorStop(1, 'rgba(106,168,74,0)');
        c.fillStyle = pg; c.fillRect(x, y, CB, CB);
    }
    // nabrzeze: ciagly kamienny rant po obu brzegach (zewn. na zewnatrz pierscienia, wewn. na wyspie);
    // zewnetrzny przerwany w rogach (tam brzeg = laka + krzaki)
    for (const [o, w] of [[L.half + 5, 10], [-L.half - 5, 10]] as const) {
        c.save();
        if (o > 0) {
            c.beginPath(); c.rect(0, 0, 4000, 4000);
            for (const [x, y] of corners) c.rect(x, y, CB, CB);
            c.clip('evenodd');
        }
        moatLoopPath(c, L, o, false);
        c.lineWidth = w; c.strokeStyle = P.graniteDark; c.stroke();
        c.lineWidth = w - 3; c.strokeStyle = P.granite; c.stroke();
        c.setLineDash([2, 20]); c.lineWidth = w - 2; c.strokeStyle = 'rgba(40,44,48,0.5)'; c.stroke(); c.setLineDash([]);
        c.restore();
    }
    c.save();
    // klip = pas wody (zewn. kwadrat minus wewn.)
    c.beginPath(); c.rect(L.o0, L.o0, L.o1 - L.o0, L.o1 - L.o0); c.rect(L.i0, L.i0, L.i1 - L.i0, L.i1 - L.i0); c.clip('evenodd');
    // 1) DNO: piasek/mul + kamyki (przy brzegach widoczne przez wode)
    c.lineJoin = 'round';
    moatLoopPath(c, L, 0, true); c.lineWidth = T + 2; c.strokeStyle = '#8c8460'; c.stroke();
    moatLoopPath(c, L, 0, true); c.lineWidth = T * 0.55; c.strokeStyle = '#4e5a44'; c.stroke();
    const tmp = { x: 0, y: 0, a: 0 };
    for (let i = 0; i < 520; i++) {
        const o = (rng() * 2 - 1) * (L.half - 3);
        moatLoopPoint(L, rng() * L.perimeter, o, tmp);
        const r = 1.5 + rng() * 3.2;
        c.fillStyle = 'rgba(40,36,24,0.35)';
        c.beginPath(); c.ellipse(tmp.x + 1, tmp.y + 1, r, r * 0.75, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = ['#a39a7c', '#8a8670', '#b3ab90', '#77735f'][Math.floor(rng() * 4)];
        c.beginPath(); c.ellipse(tmp.x, tmp.y, r, r * 0.75, rng() * 3, 0, Math.PI * 2); c.fill();
    }
    for (let i = 0; i < 70; i++) { // wodorosty przy dnie
        const o = (rng() < 0.5 ? -1 : 1) * (L.half * (0.35 + rng() * 0.45));
        moatLoopPoint(L, rng() * L.perimeter, o, tmp);
        c.strokeStyle = 'rgba(70,110,50,0.55)'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(tmp.x, tmp.y);
        c.quadraticCurveTo(tmp.x + Math.cos(tmp.a) * 6 + 3, tmp.y + Math.sin(tmp.a) * 6 + 3, tmp.x + Math.cos(tmp.a) * 12, tmp.y + Math.sin(tmp.a) * 12);
        c.stroke();
    }
    // 2) WODA: warstwy polprzezroczyste — im blizej nurtu, tym wiecej warstw = glebiej i ciemniej
    const layers: Array<[number, string, boolean]> = [
        [T + 2, 'rgba(70,170,176,0.42)', true],
        [T * 0.82, 'rgba(44,130,146,0.40)', true],
        [T * 0.62, 'rgba(30,100,122,0.45)', true],
        [T * 0.44, 'rgba(20,74,98,0.50)', true],
        [T * 0.26, 'rgba(14,54,78,0.50)', true],
        [T * 0.1, 'rgba(10,40,62,0.40)', true],
    ];
    for (const [w, col, round] of layers) {
        moatLoopPath(c, L, 0, round);
        c.lineWidth = w; c.strokeStyle = col; c.lineJoin = round ? 'round' : 'miter'; c.stroke();
    }
    c.lineJoin = 'miter';
    // 3) cien nabrzeza na wodzie (slonce NW: brzegi, ktorych woda lezy na S/E od kamienia)
    const shade = (x: number, y: number, w: number, h: number, vertical: boolean) => {
        const gr = vertical ? c.createLinearGradient(x, 0, x + w, 0) : c.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, 'rgba(6,20,28,0.5)'); gr.addColorStop(1, 'rgba(6,20,28,0)');
        c.fillStyle = gr; c.fillRect(x, y, w, h);
    };
    shade(L.o0 + T, L.o0, L.o1 - L.o0 - 2 * T, 16, false); // zewn. brzeg N (bez rogow-lakow)
    shade(L.o0, L.o0 + T, 16, L.o1 - L.o0 - 2 * T, true);  // zewn. brzeg W
    shade(L.i0, L.i1, L.i1 - L.i0 + T, 16, false);       // wewn. brzeg S (woda pod wyspa)
    shade(L.i1, L.i0, 16, L.i1 - L.i0 + T, true);        // wewn. brzeg E
    // 4) kaustyki na plyciznie: falujace jasne siatki przy obu brzegach
    c.strokeStyle = 'rgba(200,245,240,0.16)'; c.lineWidth = 1.5;
    for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
            const base = side * (L.half - 8 - k * 7);
            c.beginPath();
            for (let s = 0; s <= L.perimeter; s += 8) {
                moatLoopPoint(L, s, base + Math.sin(s * 0.11 + k * 2) * 3 + Math.sin(s * 0.037) * 2, tmp);
                if (s === 0) c.moveTo(tmp.x, tmp.y); else c.lineTo(tmp.x, tmp.y);
            }
            c.stroke();
        }
    }
    // 5) polysk powierzchni: dlugie smugi wzdluz nurtu (nie iskry — falszywa afordancja)
    c.strokeStyle = 'rgba(220,248,250,0.22)'; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
        const s0 = rng() * L.perimeter, o = (rng() * 2 - 1) * L.half * 0.6, len = 20 + rng() * 40;
        c.beginPath();
        for (let d = 0; d <= len; d += 6) { moatLoopPoint(L, s0 + d, o, tmp); if (d === 0) c.moveTo(tmp.x, tmp.y); else c.lineTo(tmp.x, tmp.y); }
        c.stroke();
    }
    // 6) piana przy obu brzegach — ciagla linia dookola (bez szwow na rogach)
    c.strokeStyle = 'rgba(220,244,244,0.55)'; c.lineWidth = 2.2;
    for (const side of [-1, 1]) {
        c.beginPath();
        for (let s = 0; s <= L.perimeter; s += 6) {
            moatLoopPoint(L, s, side * (L.half - 4) + Math.sin(s * 0.09 + side) * 1.6, tmp);
            if (s === 0) c.moveTo(tmp.x, tmp.y); else c.lineTo(tmp.x, tmp.y);
        }
        c.closePath(); c.stroke();
    }
    // 7) odbicia bryly w wodzie pod murami S (miekkie)
    const yS = L.i1;
    const rg = c.createLinearGradient(0, yS, 0, yS + T * 0.8);
    rg.addColorStop(0, 'rgba(200,205,210,0.16)'); rg.addColorStop(1, 'rgba(200,205,210,0)');
    c.fillStyle = rg; c.fillRect(L.o0, yS, L.o1 - L.o0, T);
    for (const t of [...g.towers, ...g.turrets]) {
        if (t.y < g.center.y) continue;
        const tcx = t.x + t.w / 2;
        const rr = c.createRadialGradient(tcx, yS, 4, tcx, yS, t.w * 0.8);
        rr.addColorStop(0, 'rgba(150,60,60,0.18)'); rr.addColorStop(1, 'rgba(150,60,60,0)');
        c.fillStyle = rr; c.beginPath(); c.ellipse(tcx, yS, t.w * 0.8, T * 0.7, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    // 8) lilie przy brzegu zewnetrznym (poza mostami)
    const onBridge = (x: number, y: number) => g.bridges.some(b => x > b.x - 14 && x < b.x + b.w + 14 && y > b.y - 14 && y < b.y + b.h + 14);
    for (let i = 0; i < 22; i++) {
        moatLoopPoint(L, rng() * L.perimeter, L.half - 14 - rng() * 10, tmp);
        if (onBridge(tmp.x, tmp.y)) continue;
        const px = tmp.x, py = tmp.y, r = 7 + rng() * 4, a0 = rng() * Math.PI * 2;
        c.fillStyle = 'rgba(10,30,30,0.35)';
        c.beginPath(); c.ellipse(px + 2, py + 2, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4f9a48';
        c.beginPath(); c.moveTo(px, py); c.ellipse(px, py, r, r * 0.8, 0, a0 + 0.5, a0 + Math.PI * 2); c.closePath(); c.fill();
        c.fillStyle = 'rgba(200,240,170,0.35)';
        c.beginPath(); c.ellipse(px - r * 0.3, py - r * 0.3, r * 0.35, r * 0.2, 0, 0, Math.PI * 2); c.fill();
        if (rng() < 0.4) { c.fillStyle = '#f7c6d9'; c.beginPath(); c.arc(px + r * 0.2, py, 2.6, 0, Math.PI * 2); c.fill(); }
    }
}

/** Mosty: deski w poprzek jazdy z prze switami, belki boczne, slupki z lina, cien na wodzie. */
export function paintBridgesV2(c: CanvasRenderingContext2D, g: CastleGroundV2Geo): void {
    const rng = makeRng(0x0b81d6e5);
    for (const b of g.bridges) {
        const acrossX = b.w > b.h; // most N/S: jazda w pionie, deski poziome (wzdluz x)
        // cien mostu na wodzie (SE)
        c.fillStyle = 'rgba(6,22,28,0.42)';
        if (acrossX) c.fillRect(b.x + b.w, b.y + 6, 14, b.h - 4);
        else c.fillRect(b.x + 6, b.y + b.h, b.w - 4, 14);
        c.fillStyle = 'rgba(6,22,28,0.22)';
        if (acrossX) c.fillRect(b.x + b.w + 14, b.y + 10, 10, b.h - 8);
        else c.fillRect(b.x + 10, b.y + b.h + 14, b.w - 8, 10);
        // pod deskami: ciemna szczelina (woda/cien)
        c.fillStyle = '#2b2116';
        c.fillRect(b.x, b.y, b.w, b.h);
        // deski: w poprzek kierunku jazdy
        const PL = 12;
        const span = acrossX ? b.h : b.w;
        for (let d = 0; d < span; d += PL) {
            const tone = ['#9a7744', '#8a6a3c', '#a5834e', '#7f6036'][Math.floor(rng() * 4)];
            const jitter = (rng() - 0.5) * 4;
            c.fillStyle = tone;
            if (acrossX) c.fillRect(b.x + 6 + jitter, b.y + d + 1, b.w - 12, PL - 2.5);
            else c.fillRect(b.x + d + 1, b.y + 6 + jitter, PL - 2.5, b.h - 12);
            c.fillStyle = 'rgba(255,236,200,0.28)';
            if (acrossX) c.fillRect(b.x + 6 + jitter, b.y + d + 1, b.w - 12, 1.5);
            else c.fillRect(b.x + d + 1, b.y + 6 + jitter, 1.5, b.h - 12);
            c.fillStyle = 'rgba(0,0,0,0.25)';
            if (acrossX) c.fillRect(b.x + 6 + jitter, b.y + d + PL - 4.5, b.w - 12, 1.5);
            else c.fillRect(b.x + d + PL - 4.5, b.y + 6 + jitter, 1.5, b.h - 12);
            // gwozdzie
            c.fillStyle = 'rgba(40,36,34,0.8)';
            for (const f of [0.12, 0.88]) {
                const px = acrossX ? b.x + b.w * f : b.x + d + PL / 2 - 1;
                const py = acrossX ? b.y + d + PL / 2 - 1 : b.y + b.h * f;
                c.fillRect(px, py, 2, 2);
            }
        }
        // belki boczne (wzdluz jazdy) — niskie, czytelnie NA krawedzi, nie w przejezdzie
        const beam = (x: number, y: number, w: number, h: number) => {
            c.fillStyle = P.oakDark; c.fillRect(x, y, w, h);
            c.fillStyle = P.oak; c.fillRect(x + 1, y + 1, w - 2, h - 3);
            c.fillStyle = 'rgba(255,230,190,0.3)'; c.fillRect(x + 1, y + 1, acrossX ? 2 : w - 2, acrossX ? h - 3 : 2);
        };
        if (acrossX) { beam(b.x - 2, b.y - 4, 9, b.h + 8); beam(b.x + b.w - 7, b.y - 4, 9, b.h + 8); }
        else { beam(b.x - 4, b.y - 2, b.w + 8, 9); beam(b.x - 4, b.y + b.h - 7, b.w + 8, 9); }
        // slupki w rogach + lina (wizual, poza torem jazdy)
        const posts = acrossX
            ? [[b.x + 2, b.y - 2], [b.x + 2, b.y + b.h + 2], [b.x + b.w - 3, b.y - 2], [b.x + b.w - 3, b.y + b.h + 2]]
            : [[b.x - 2, b.y + 2], [b.x + b.w + 2, b.y + 2], [b.x - 2, b.y + b.h - 3], [b.x + b.w + 2, b.y + b.h - 3]];
        c.strokeStyle = '#c9b48a'; c.lineWidth = 2;
        for (const [i, j] of [[0, 1], [2, 3]]) {
            const [ax, ay] = posts[i], [bx, by] = posts[j];
            c.beginPath(); c.moveTo(ax, ay - 8);
            c.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 2, bx, by - 8);
            c.stroke();
        }
        for (const [px, py] of posts) {
            c.fillStyle = 'rgba(10,20,12,0.35)'; c.fillRect(px - 3, py - 2, 9, 9);
            c.fillStyle = P.oakDark; c.fillRect(px - 5, py - 12, 9, 13);
            c.fillStyle = P.oak; c.fillRect(px - 5, py - 14, 9, 6);
            c.fillStyle = 'rgba(255,230,190,0.4)'; c.fillRect(px - 5, py - 14, 9, 1.5);
        }
        // piana przy filarach (woda opływa most)
        c.fillStyle = 'rgba(220,244,244,0.55)';
        for (let i = 0; i < 6; i++) {
            const t = rng();
            if (acrossX) {
                c.beginPath(); c.ellipse(b.x - 4 - rng() * 4, b.y + t * b.h, 4, 2, Math.PI / 2, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.ellipse(b.x + b.w + 4 + rng() * 4, b.y + rng() * b.h, 4, 2, Math.PI / 2, 0, Math.PI * 2); c.fill();
            } else {
                c.beginPath(); c.ellipse(b.x + t * b.w, b.y - 4 - rng() * 4, 4, 2, 0, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.ellipse(b.x + rng() * b.w, b.y + b.h + 4 + rng() * 4, 4, 2, 0, 0, Math.PI * 2); c.fill();
            }
        }
    }
}

/** Dlugie miekkie cienie bryl (SE) — wysokosc czyta sie z dlugosci cienia. */
export function paintLongShadowsV2(c: CanvasRenderingContext2D, g: CastleGroundV2Geo): void {
    const cast = (r: CastleRect, len: number, a: number, rounded = false) => {
        const steps = 18; // gesto = gladki cien bez schodkow
        for (let i = 1; i <= steps; i++) {
            const d = (len * i) / steps;
            c.fillStyle = `rgba(16,28,20,${a / steps})`;
            if (rounded) { c.beginPath(); c.ellipse(r.x + r.w / 2 + d, r.y + r.h / 2 + d, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); c.fill(); }
            else c.fillRect(r.x + d, r.y + d, r.w, r.h);
        }
    };
    for (const w of g.walls) cast(w, 26, 0.5);
    for (const t of g.turrets) cast(t, 40, 0.5);
    for (const t of g.towers) cast(t, 56, 0.55, true);
    cast(g.keep, 70, 0.5);
}

/** Bujne kepki krzakow w rogach fosy (tam, gdzie zniknal murek pod katem 90 st.). Nieregularne celowo. */
export function paintCornerBushes(c: CanvasRenderingContext2D, g: CastleGroundV2Geo): void {
    const rng = makeRng(0x0b05e5a1);
    const L = moatLoopFrom(g.moat);
    const T = L.half * 2;
    const arcs: Array<[number, number, number]> = [
        [L.o0 + T, L.o0 + T, Math.PI], [L.o1 - T, L.o0 + T, Math.PI * 1.5],
        [L.o1 - T, L.o1 - T, 0], [L.o0 + T, L.o1 - T, Math.PI * 0.5],
    ];
    const blob = (x: number, y: number, r: number): void => {
        const g2 = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        g2.addColorStop(0, '#7fc25a'); g2.addColorStop(0.55, '#4f9440'); g2.addColorStop(1, '#2f6a2c');
        c.fillStyle = g2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    for (const [ax, ay, a0] of arcs) {
        const spots: Array<[number, number, number]> = [];
        // wzdluz luku (zakrywa konce murku) + gestsza kepa w samym rogu
        for (const k of [0.04, 0.22 + rng() * 0.1, 0.5 + (rng() - 0.5) * 0.12, 0.72 + rng() * 0.08, 0.96]) {
            const ang = a0 + k * (Math.PI / 2), rr = T + 8 + rng() * 10;
            spots.push([ax + Math.cos(ang) * rr, ay + Math.sin(ang) * rr, 1 + rng() * 0.4]);
        }
        const mid = a0 + Math.PI / 4;
        spots.push([ax + Math.cos(mid) * (T * 1.3 + rng() * 8), ay + Math.sin(mid) * (T * 1.3 + rng() * 8), 1.5]);
        for (const [x, y, sc] of spots) {
            const n = 4 + Math.floor(rng() * 4);
            c.fillStyle = 'rgba(16,30,18,0.32)';
            c.beginPath(); c.ellipse(x + 7, y + 8, 20 * sc, 13 * sc, 0, 0, Math.PI * 2); c.fill();
            for (let i = 0; i < n; i++) blob(x + (rng() - 0.5) * 22 * sc, y + (rng() - 0.5) * 16 * sc, (7 + rng() * 7) * sc);
            if (rng() < 0.6) for (let i = 0; i < 3; i++) {
                c.fillStyle = ['#ffffff', '#f5d24b', '#ff8fb1'][Math.floor(rng() * 3)];
                c.beginPath(); c.arc(x + (rng() - 0.5) * 20 * sc, y + (rng() - 0.5) * 14 * sc, 1.8, 0, Math.PI * 2); c.fill();
            }
        }
    }
}

export function paintCastleGroundV2(c: CanvasRenderingContext2D, g: CastleGroundV2Geo): void {
    paintCourtyardV2(c, g);
    paintMoatV2(c, g);
    paintCornerBushes(c, g);
    paintBridgesV2(c, g);
    paintLongShadowsV2(c, g);
}
