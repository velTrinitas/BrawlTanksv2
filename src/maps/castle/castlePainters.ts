import { CASTLE_PALETTE as P } from './castlePalette';

/**
 * castlePainters.ts — wspolne malowidla Canvas 2D mapy Castle Grounds (F2).
 * Uzywane przez bake gruntu (CastleMap) i bake solidow (CastleSolidProp).
 * Slownik zaadaptowany z FortifiedRuinsMap (drzewa, ogniska, posagi) w palecie
 * zielonej doliny — kopiowane, NIE importowane cross-map (izolacja per mapa).
 * Swiatlo T1: slonce NW, cienie SE.
 */

export type Rng = () => number;

/** Lisciaste drzewo: cien SE + pien + 3 warstwy korony (ciemna/srednia/jasna NW). */
export function drawTree(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size = 1): void {
    const r = 22 * size;
    c.save();
    c.globalAlpha = 0.22;
    c.fillStyle = '#1e2e14';
    c.beginPath(); c.ellipse(x + 9 * size, y + 9 * size, r * 1.25, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // pien
    c.fillStyle = P.trunk;
    c.beginPath();
    c.moveTo(x - 5 * size, y + 6 * size);
    c.quadraticCurveTo(x - 3 * size, y - 4 * size, x - 3 * size, y - 14 * size);
    c.lineTo(x + 3 * size, y - 14 * size);
    c.quadraticCurveTo(x + 3 * size, y - 4 * size, x + 5 * size, y + 6 * size);
    c.closePath(); c.fill();
    c.fillStyle = P.trunkDark;
    c.fillRect(x + 1 * size, y - 14 * size, 2.5 * size, 20 * size);
    // korona: 3 warstwy blobow
    const layers: Array<[string, number, number, number]> = [
        [P.forestDeep, 0, -18, 1.0],
        [P.forestMid, -3, -22, 0.82],
        [P.forestLight, -7, -26, 0.55],
    ];
    for (const [col, ox, oy, k] of layers) {
        c.fillStyle = col;
        const cx = x + ox * size, cy = y + oy * size;
        c.beginPath();
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
            const rr = r * k * (0.8 + rng() * 0.35);
            c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            c.arc(cx + Math.cos(a) * rr * 0.55, cy + Math.sin(a) * rr * 0.55, rr * 0.62, 0, Math.PI * 2);
        }
        c.fill();
    }
}

/** Sosna (ciemniejsza, trojkatna) — zroznicowanie lasu. */
export function drawPine(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size = 1): void {
    c.save();
    c.globalAlpha = 0.22; c.fillStyle = '#1e2e14';
    c.beginPath(); c.ellipse(x + 8 * size, y + 8 * size, 18 * size, 7 * size, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    c.fillStyle = P.trunkDark; c.fillRect(x - 2.5 * size, y - 6 * size, 5 * size, 12 * size);
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
        const w = (26 - t * 6) * size, top = y - (14 + t * 12) * size, bot = y - (t * 12) * size - 2 * size;
        c.fillStyle = t % 2 === 0 ? P.forestDeep : P.forestMid;
        c.beginPath(); c.moveTo(x, top); c.lineTo(x + w / 2, bot); c.lineTo(x - w / 2, bot); c.closePath(); c.fill();
        c.fillStyle = P.forestLight; c.globalAlpha = 0.35;
        c.beginPath(); c.moveTo(x, top); c.lineTo(x - w / 2, bot); c.lineTo(x - w * 0.15, bot); c.closePath(); c.fill();
        c.globalAlpha = 1;
    }
    void rng;
}

/** Ognisko obozowe: krag kamieni + polana + zar (NORMAL alpha, w bake). */
export function drawCampfire(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number): void {
    c.fillStyle = P.graniteDark;
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.3;
        c.beginPath(); c.arc(x + Math.cos(a) * 13, y + Math.sin(a) * 10, 3.5 + rng() * 1.5, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = P.oakDark; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x - 8, y + 4); c.lineTo(x + 8, y - 4); c.moveTo(x - 8, y - 4); c.lineTo(x + 8, y + 4); c.stroke();
    const g = c.createRadialGradient(x, y - 4, 1, x, y - 4, 14);
    g.addColorStop(0, 'rgba(255,210,110,0.9)'); g.addColorStop(0.5, 'rgba(255,130,40,0.5)'); g.addColorStop(1, 'rgba(255,110,30,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y - 4, 14, 0, Math.PI * 2); c.fill();
}

/** Namiot najezdzcow: plotno + cien + czerwony proporzec (telegraf lane'u). */
export function drawTent(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, flip = false): void {
    const w = 46, h = 30;
    c.save();
    c.globalAlpha = 0.25; c.fillStyle = '#1e2e14';
    c.beginPath(); c.ellipse(x + 6, y + h / 2 + 6, w * 0.65, h * 0.45, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // bryla: dwa skosy (NW jasny, SE ciemny) — namiot widziany z gory-przodu
    c.fillStyle = P.canvas;
    c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x - w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2); c.closePath(); c.fill();
    c.fillStyle = P.canvasDark;
    c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x + (flip ? -1 : 1) * w / 2, y + h / 2); c.lineTo(x + (flip ? -1 : 1) * 4, y + h / 2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x - w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2); c.closePath(); c.stroke();
    // wejscie
    c.fillStyle = '#2a2318';
    c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x - 7, y + h / 2); c.lineTo(x + 7, y + h / 2); c.closePath(); c.fill();
    // maszt z czerwonym proporcem
    c.strokeStyle = P.trunkDark; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x, y - 34); c.stroke();
    c.fillStyle = P.enemyRed;
    c.beginPath(); c.moveTo(x, y - 34); c.lineTo(x + 16, y - 29); c.lineTo(x, y - 24); c.closePath(); c.fill();
    void rng;
}

/** Sztandar najezdzcow na maszcie (przy obozie) — czerwony, czarny znak. */
export function drawWarBanner(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.strokeStyle = P.trunkDark; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 48); c.stroke();
    c.fillStyle = P.enemyRed;
    c.fillRect(x + 1, y - 48, 22, 30);
    c.fillStyle = '#1a1a1a';
    c.beginPath(); c.moveTo(x + 12, y - 42); c.lineTo(x + 19, y - 26); c.lineTo(x + 5, y - 26); c.closePath(); c.fill();
    c.fillStyle = P.gold; c.beginPath(); c.arc(x, y - 50, 3, 0, Math.PI * 2); c.fill();
}

/** Posag rycerza na cokole (przy mostach) — granit + mech. */
export function drawStatue(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number): void {
    c.save();
    c.globalAlpha = 0.25; c.fillStyle = '#1e2e14';
    c.beginPath(); c.ellipse(x + 6, y + 8, 16, 7, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // cokol
    c.fillStyle = P.graniteDark; c.fillRect(x - 12, y - 4, 24, 12);
    c.fillStyle = P.graniteTop; c.fillRect(x - 12, y - 10, 24, 6);
    c.fillStyle = P.granite; c.fillRect(x - 10, y - 30, 20, 20);
    // postac: tors + helm + tarcza
    c.fillStyle = P.graniteTop;
    c.beginPath(); c.arc(x, y - 36, 5, 0, Math.PI * 2); c.fill();
    c.fillRect(x - 5, y - 32, 10, 14);
    c.fillStyle = P.crimson; c.beginPath(); c.moveTo(x + 4, y - 30); c.lineTo(x + 11, y - 30); c.lineTo(x + 7.5, y - 18); c.closePath(); c.fill();
    c.strokeStyle = P.gold; c.lineWidth = 1; c.stroke();
    c.fillStyle = P.moss; c.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x - 8 + rng() * 16, y - 8 + rng() * 6, 3 + rng() * 3, 1.5, 0, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
}

/** Pole zboza: rzedy klosow (stealth zone — wizual w bake, ramka w runtime). */
export function drawWheatField(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, h: number): void {
    c.fillStyle = P.wheatDark;
    c.fillRect(x, y, w, h);
    c.strokeStyle = P.wheat; c.lineWidth = 2;
    for (let row = 6; row < h; row += 9) {
        c.beginPath();
        for (let px = x + 3; px < x + w - 3; px += 6) {
            const yy = y + row + Math.sin(px * 0.2 + row) * 1.5;
            c.moveTo(px, yy + 4); c.lineTo(px + 1.5, yy - 5);
        }
        c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 12; i++) c.fillRect(x + rng() * w, y + rng() * h, 20 + rng() * 40, 3);
    c.strokeStyle = P.trunkDark; c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

/** Woz z sianem (dekor, passable). */
export function drawHayCart(c: CanvasRenderingContext2D, x: number, y: number, rot = 0): void {
    c.save();
    c.translate(x, y); c.rotate(rot);
    c.globalAlpha = 0.25; c.fillStyle = '#1e2e14';
    c.beginPath(); c.ellipse(5, 6, 26, 12, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = P.oakDark; c.fillRect(-22, -10, 44, 20);
    c.fillStyle = P.oak; c.fillRect(-20, -8, 40, 16);
    c.fillStyle = P.wheat;
    c.beginPath(); c.ellipse(0, -2, 18, 11, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = P.wheatDark; c.globalAlpha = 0.5;
    c.beginPath(); c.ellipse(4, 1, 14, 7, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = P.iron;
    for (const wx of [-14, 14]) { c.beginPath(); c.arc(wx, 11, 5, 0, Math.PI * 2); c.fill(); }
    c.restore();
}

/** Owca (dekor w zagrodzie). */
export function drawSheep(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x + 3, y + 5, 10, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#efe9dc'; c.beginPath(); c.ellipse(x, y, 9, 6.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a2523'; c.beginPath(); c.ellipse(x + 8, y - 1, 3.5, 3, 0, 0, Math.PI * 2); c.fill();
}

/** Plot z zerdzi (zagroda). */
export function drawFence(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    c.strokeStyle = P.oakDark; c.lineWidth = 3;
    c.strokeRect(x, y, w, h);
    c.lineWidth = 2; c.strokeStyle = P.oak;
    for (let px = x; px <= x + w; px += 18) { c.beginPath(); c.moveTo(px, y - 4); c.lineTo(px, y + 4); c.moveTo(px, y + h - 4); c.lineTo(px, y + h + 4); c.stroke(); }
    for (let py = y; py <= y + h; py += 18) { c.beginPath(); c.moveTo(x - 4, py); c.lineTo(x + 4, py); c.moveTo(x + w - 4, py); c.lineTo(x + w + 4, py); c.stroke(); }
}
