import { CASTLE_PALETTE as P } from './castlePalette';

/**
 * castlePainters.ts — wspolne malowidla Canvas 2D mapy Castle Grounds (F2).
 * Uzywane przez bake gruntu (CastleMap) i bake solidow (CastleSolidProp).
 * Slownik zaadaptowany z FortifiedRuinsMap (drzewa, ogniska, posagi) w palecie
 * zielonej doliny — kopiowane, NIE importowane cross-map (izolacja per mapa).
 * Swiatlo T1: slonce NW, cienie SE.
 */

export type Rng = () => number;

/**
 * v0.195.0 — co rysowac: 'all' (jak dawniej), 'base' (cien + pien — zostaje w bake),
 * 'crown' (sama korona — sprite bujany przez CastleTrees). WAZNE: rng jest konsumowane
 * IDENTYCZNIE w kazdym trybie, wiec reszta bake'u (dekor losowany po drzewach) nie
 * przesuwa sie ani o piksel.
 */
export type TreePart = 'all' | 'base' | 'crown';

/** Lisciaste drzewo: cien SE + pien + 3 warstwy korony (ciemna/srednia/jasna NW). */
export function drawTree(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size = 1, part: TreePart = 'all'): void {
    const r = 22 * size;
    const drawBase = part !== 'crown', drawCrown = part !== 'base';
    if (drawBase) {
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
    }
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
        if (drawCrown) c.fill();
    }
}

/** Sosna (ciemniejsza, trojkatna) — zroznicowanie lasu. */
export function drawPine(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size = 1, part: TreePart = 'all'): void {
    if (part !== 'crown') {
        c.save();
        c.globalAlpha = 0.22; c.fillStyle = '#1e2e14';
        c.beginPath(); c.ellipse(x + 8 * size, y + 8 * size, 18 * size, 7 * size, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        c.fillStyle = P.trunkDark; c.fillRect(x - 2.5 * size, y - 6 * size, 5 * size, 12 * size);
    }
    if (part === 'base') { void rng; return; }
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
    // v0.195.0 (transza 2 artu Zamku) — fake-3D: dwie polacie z gradientem (NW jasna,
    // SE ciemna — swiatlo mapy jest stale, wiec `flip` odwraca TYLKO pole u wejscia),
    // szwy, lata, odciagi z palikami, miekki cien kontaktowy SE. Obrys i szczyt masztu
    // (y - 14 .. y - 34) bez zmian, bo kotwicza sie na nich flagi CastleCampFlags.
    // UWAGA: funkcja NIE konsumuje `rng` — kolejne wywolania rng w bake gruntu musza
    // dostac te same liczby co przed zmiana, inaczej przesunie sie reszta dekoracji.
    const w = 46, h = 30;
    const top = y - 14, base = y + h / 2, L = x - w / 2, R = x + w / 2;
    const dir = flip ? -1 : 1;
    // CIEN kontaktowy: miekka elipsa przesunieta SE
    c.save();
    c.translate(x + 7, base + 3);
    c.scale(1, 0.42);
    let g = c.createRadialGradient(0, 0, 4, 0, 0, w * 0.7);
    g.addColorStop(0, 'rgba(20,32,14,0.42)');
    g.addColorStop(1, 'rgba(20,32,14,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, w * 0.7, 0, Math.PI * 2); c.fill();
    c.restore();
    // ODCIAGI: liny od polaci do palikow poza obrysem
    c.strokeStyle = 'rgba(70,55,35,0.85)'; c.lineWidth = 1;
    const stakes: Array<[number, number, number, number]> = [
        [L + 7, base - 9, L - 9, base + 3],
        [R - 7, base - 9, R + 9, base + 3],
        [x - 2, top + 2, L - 4, top + 12],
        [x + 2, top + 2, R + 4, top + 12],
    ];
    for (const [ax, ay, sx, sy] of stakes) {
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(sx, sy); c.stroke();
    }
    c.fillStyle = P.trunkDark;
    for (const [, , sx, sy] of stakes) c.fillRect(sx - 1.2, sy - 2.5, 2.4, 4);
    // POLAC LEWA (NW, oswietlona)
    g = c.createLinearGradient(L, base, x, top);
    g.addColorStop(0, '#c9b995');
    g.addColorStop(0.6, P.canvas);
    g.addColorStop(1, '#f0e6cf');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x, top); c.lineTo(L, base); c.lineTo(x, base); c.closePath(); c.fill();
    // POLAC PRAWA (SE, w cieniu)
    g = c.createLinearGradient(x, top, R, base);
    g.addColorStop(0, '#b8aa8c');
    g.addColorStop(0.5, P.canvasDark);
    g.addColorStop(1, '#7d7058');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x, top); c.lineTo(x, base); c.lineTo(R, base); c.closePath(); c.fill();
    // LATA na oswietlonej polaci (deterministyczna — bez rng)
    c.fillStyle = '#b39f78';
    c.fillRect(x - 15, base - 10, 6, 5);
    c.strokeStyle = 'rgba(90,70,40,0.6)'; c.lineWidth = 0.7;
    c.setLineDash([1.2, 1.2]);
    c.strokeRect(x - 15, base - 10, 6, 5);
    // SZWY rownolegle do krawedzi polaci
    c.strokeStyle = 'rgba(110,90,60,0.45)'; c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(x - 1, top + 5); c.lineTo(L + 6, base - 1);
    c.moveTo(x + 1, top + 5); c.lineTo(R - 6, base - 1);
    c.stroke();
    c.setLineDash([]);
    // KALENICA: jasny grzbiet na styku polaci
    c.strokeStyle = 'rgba(255,248,225,0.7)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x, top + 1); c.lineTo(x, y - 2); c.stroke();
    // WEJSCIE: ciemne wnetrze z glebia (gradient w gore)
    g = c.createLinearGradient(x, y - 2, x, base);
    g.addColorStop(0, '#120e08');
    g.addColorStop(1, '#3a3022');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x - 7, base); c.lineTo(x + 7, base); c.closePath(); c.fill();
    // POLA odchylona na bok (`flip` wybiera strone) — jasny trojkat z cieniem pod spodem
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x + dir * 7, base); c.lineTo(x + dir * 12, base - 2); c.closePath(); c.fill();
    c.fillStyle = flip ? '#e6d9bd' : '#cdbf9f';
    c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x + dir * 6, base); c.lineTo(x + dir * 12, base - 4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,45,25,0.6)'; c.lineWidth = 0.8; c.stroke();
    // OBRYS calosci — gruby, zeby namiot czytal sie przy zoom 0.6
    c.strokeStyle = 'rgba(50,38,22,0.75)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, top); c.lineTo(L, base); c.lineTo(R, base); c.closePath(); c.stroke();
    // maszt (proporzec = sprite CastleCampFlags, lopocze — B3 v0.194.0)
    c.strokeStyle = P.trunkDark; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x, y - 34); c.stroke();
    void rng;
}

/** Maszt sztandaru najezdzcow (plotno = sprite CastleCampFlags, lopocze — B3 v0.194.0). */
export function drawWarBanner(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.strokeStyle = P.trunkDark; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 48); c.stroke();
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
