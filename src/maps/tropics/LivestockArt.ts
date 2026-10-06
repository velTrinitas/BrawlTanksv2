/**
 * AGRO — KROWA i SWINIA v2 (2026-10-06, Mariusz: "popraw wyglad krow i swin, ksztalt, proporcje,
 * tulow, glowa, znaki charakterystyczne"). Ta sama technika co HorseArt: jedna sylweta (obrys
 * pod spodem + gradient swiatla z NW), nogi z kopytami, chod 4-taktowy w 8 klatkach.
 *
 * KROWA (holsztynska): PROSTY grzbiet z guzami biodrowymi, gleboki prostokatny tulow, czarne laty
 * przyciete do sylwety, rozowe wymie, dluga glowa z szerokim rozowym pyskiem, uszy NA BOKI,
 * krotkie rogi, ogon do kostek z czarna kita.
 * SWINIA: beczulka, krotkie nozki, wielki PLASKI RYJ (tarcza z dziurkami), klapniete uszy,
 * zakrecony ogonek, rozowa skora z rumiencem.
 * Klatki: krowa 76x58, swinia 50x38 (jak dawniej — cienie/anchory bez zmian), pysk w prawo.
 */
export const LIVESTOCK_WALK_FRAMES = 8;
const OUTLINE = '#1e140c';

type Mode = 'stand' | 'graze' | number;

function swing(mode: Mode, phase: number, amp: number): { sw: number; lift: number } {
    if (typeof mode !== 'number') return { sw: 0, lift: 0 };
    const p = (mode / LIVESTOCK_WALK_FRAMES + phase) % 1;
    if (p < 0.6) return { sw: amp - (p / 0.6) * amp * 2, lift: 0 };
    const q = (p - 0.6) / 0.4;
    return { sw: -amp + q * amp * 2, lift: Math.sin(q * Math.PI) };
}

/** Noga: gruba gora -> cienka dol, staw, kopyto. */
function leg(c: CanvasRenderingContext2D, x: number, top: number, len: number, wTop: number, wBot: number, col: string, dark: string, mode: Mode, phase: number, ground: number, hoof: string): void {
    const { sw, lift } = swing(mode, phase, 4);
    const kx = x + sw * 0.5, ky = top + len * 0.5;
    const fx = x + sw, fy = Math.min(ground, top + len - lift * 3);
    c.lineCap = 'round';
    c.strokeStyle = OUTLINE; c.lineWidth = wTop + 2.2; c.beginPath(); c.moveTo(x, top); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = wBot + 2.2; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy - 1.5); c.stroke();
    const g = c.createLinearGradient(x - wTop / 2, 0, x + wTop / 2, 0); g.addColorStop(0, col); g.addColorStop(1, dark);
    c.strokeStyle = g; c.lineWidth = wTop; c.beginPath(); c.moveTo(x, top); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = wBot; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy - 1.5); c.stroke();
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(fx - wBot * 0.75, fy - 2.5); c.lineTo(fx + wBot * 0.75, fy - 2.5); c.lineTo(fx + wBot * 0.9, fy + 0.5); c.lineTo(fx - wBot * 0.9, fy + 0.5); c.closePath(); c.fill();
    c.fillStyle = hoof; c.fillRect(fx - wBot * 0.55, fy - 2, wBot * 1.1, 1.8);
}

function contact(c: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
    const g = c.createRadialGradient(x, y, 1, x, y, rx);
    g.addColorStop(0, 'rgba(10,20,5,0.4)'); g.addColorStop(1, 'rgba(10,20,5,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, rx * 0.17, 0, 0, Math.PI * 2); c.fill();
}

/** Wypelnienie sylwety: obrys pod spodem, gradient NW, cien brzucha, blik grzbietu. */
function shape(c: CanvasRenderingContext2D, p: Path2D, x0: number, y0: number, x1: number, y1: number, light: string, mid: string, dark: string, ol = 3): void {
    c.lineJoin = 'round';
    c.strokeStyle = OUTLINE; c.lineWidth = ol; c.stroke(p);
    const g = c.createLinearGradient(x0, y0, x0 + (x1 - x0) * 0.3, y1);
    g.addColorStop(0, light); g.addColorStop(0.5, mid); g.addColorStop(1, dark);
    c.fillStyle = g; c.fill(p);
}

// ─────────────────────────────────────────────────────────────────────────────
export function drawCowV2(c: CanvasRenderingContext2D, mode: Mode): void {
    const GROUND = 56;
    const graze = mode === 'graze';
    const nod = typeof mode === 'number' ? Math.sin((mode / LIVESTOCK_WALK_FRAMES) * Math.PI * 4) * 1.2 : 0;
    contact(c, 38, GROUND, 30);
    // nogi dalsze (ciemniej)
    leg(c, 21, 36, 20, 6.5, 3.6, '#cfcfcf', '#8a8a8a', mode, 0.0, GROUND, '#2a2018');
    leg(c, 52, 36, 20, 5.6, 3.6, '#cfcfcf', '#8a8a8a', mode, 0.25, GROUND, '#2a2018');
    // ogon: od nasady na zadzie prosto w dol, czarna kita
    const tsw = typeof mode === 'number' ? Math.sin((mode / LIVESTOCK_WALK_FRAMES) * Math.PI * 2) * 1.5 : 0;
    c.strokeStyle = OUTLINE; c.lineWidth = 3.4; c.beginPath(); c.moveTo(13, 19); c.quadraticCurveTo(9, 28, 9 + tsw, 42); c.stroke();
    c.strokeStyle = '#e6e6e6'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(13, 19); c.quadraticCurveTo(9, 28, 9 + tsw, 42); c.stroke();
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(9 + tsw, 45, 2.8, 4.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(9 + tsw, 45, 1.9, 3.3, 0, 0, Math.PI * 2); c.fill();
    // TULOW: prosty grzbiet, guzy biodrowe, gleboki brzuch, szyja w dol do glowy
    const hx = graze ? 62 : 61, hy = graze ? 40 : 20 + nod;   // potylica
    const body = new Path2D();
    body.moveTo(13, 18);                               // nasada ogona
    body.quadraticCurveTo(16, 13, 21, 14);             // guz biodrowy
    body.lineTo(48, 15);                               // PROSTY grzbiet
    body.quadraticCurveTo(54, 14, 57, 17);             // klab
    body.quadraticCurveTo(hx - 2, hy - 4, hx, hy - 3);  // kark do potylicy
    body.lineTo(hx + 1, hy + 8);                        // gardlo
    body.quadraticCurveTo(hx - 4, hy + 14, 58, 33);    // podgardle (fald)
    body.quadraticCurveTo(57, 40, 50, 40);             // piers
    body.lineTo(26, 40);                               // brzuch (prosty, gleboki)
    body.quadraticCurveTo(15, 40, 12, 32);             // tyl uda
    body.quadraticCurveTo(10, 24, 13, 18);
    body.closePath();
    shape(c, body, 12, 13, 60, 41, '#ffffff', '#ececec', '#a9a9a9');
    // LATY (przyciete do sylwety) + cien brzucha + blik grzbietu
    c.save(); c.clip(body);
    c.fillStyle = '#1c1c1c';
    c.beginPath(); c.ellipse(24, 22, 9, 7, 0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(44, 27, 8, 6, -0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(34, 16, 5, 3, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(15, 33, 4, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(24, 20, 5, 2, 0.3, 0, Math.PI * 2); c.fill(); // polysk laty
    const bl = c.createLinearGradient(0, 30, 0, 41); bl.addColorStop(0, 'rgba(0,0,0,0)'); bl.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = bl; c.fillRect(8, 30, 60, 12);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(21, 15.5); c.lineTo(47, 16.5); c.stroke();
    c.restore();
    // WYMIE miedzy tylnymi nogami
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(27, 41, 6, 4, 0, 0, Math.PI * 2); c.fill();
    const ug = c.createRadialGradient(26, 40, 1, 27, 41, 5.5); ug.addColorStop(0, '#ffd0d8'); ug.addColorStop(1, '#e48a9c');
    c.fillStyle = ug; c.beginPath(); c.ellipse(27, 41, 5, 3.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d07080'; for (const x of [24.5, 27, 29.5]) c.fillRect(x - 0.6, 43.5, 1.2, 2);
    // GLOWA: dluga, klinowata, szeroki rozowy pysk
    c.save(); c.translate(hx, hy); c.rotate(graze ? 1.15 : 0.5 + nod * 0.03);
    const head = new Path2D();
    head.moveTo(-1, -3); head.lineTo(11, -2.5);
    head.quadraticCurveTo(16, -2, 16.5, 2.5); head.quadraticCurveTo(16.5, 7, 12, 7.5);
    head.lineTo(2, 8); head.quadraticCurveTo(-3, 6, -1, -3); head.closePath();
    shape(c, head, -2, -3, 16, 8, '#ffffff', '#ededed', '#b0b0b0', 2.6);
    c.save(); c.clip(head); c.fillStyle = '#1c1c1c'; c.beginPath(); c.ellipse(1, 0, 4, 5, 0, 0, Math.PI * 2); c.fill(); c.restore(); // lata na oku
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(14, 2.8, 4.3, 4.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2a9b8'; c.beginPath(); c.ellipse(14, 2.8, 3.5, 3.8, 0, 0, Math.PI * 2); c.fill();      // PYSK
    c.fillStyle = '#7a3a48'; c.beginPath(); c.ellipse(15.3, 1.4, 0.8, 0.6, 0, 0, Math.PI * 2); c.ellipse(15.3, 4.2, 0.8, 0.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(4.5, 0.5, 1.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(4.9, 0.6, 0.9, 0, Math.PI * 2); c.fill();
    c.restore();
    // ucho NA BOK + rog (w ukladzie swiata, przy potylicy)
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(hx - 3, hy + 1, 5, 2.4, -0.35, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#efefef'; c.beginPath(); c.ellipse(hx - 3, hy + 1, 4, 1.6, -0.35, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2b0bc'; c.beginPath(); c.ellipse(hx - 3.5, hy + 1.2, 2.2, 0.8, -0.35, 0, Math.PI * 2); c.fill();
    c.strokeStyle = OUTLINE; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx + 1, hy - 2); c.quadraticCurveTo(hx + 1, hy - 7, hx + 4, hy - 8); c.stroke();
    c.strokeStyle = '#efe4c6'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(hx + 1, hy - 2); c.quadraticCurveTo(hx + 1, hy - 7, hx + 4, hy - 8); c.stroke();
    // nogi blizsze
    leg(c, 25, 37, 19, 7, 3.8, '#ffffff', '#b8b8b8', mode, 0.5, GROUND, '#2a2018');
    leg(c, 55, 37, 19, 6, 3.8, '#ffffff', '#b8b8b8', mode, 0.75, GROUND, '#2a2018');
}

// ─────────────────────────────────────────────────────────────────────────────
export function drawPigV2(c: CanvasRenderingContext2D, mode: Mode): void {
    const GROUND = 36;
    const graze = mode === 'graze';
    const bob = typeof mode === 'number' ? Math.abs(Math.sin((mode / LIVESTOCK_WALK_FRAMES) * Math.PI * 2)) * -0.7 : 0;
    contact(c, 25, GROUND, 19);
    leg(c, 15, 25, 11, 4.6, 3.4, '#e48a9c', '#b0607a', mode, 0.0, GROUND, '#5a3040');
    leg(c, 33, 25, 11, 4.6, 3.4, '#e48a9c', '#b0607a', mode, 0.25, GROUND, '#5a3040');
    c.save(); c.translate(0, bob);
    // zakrecony ogonek
    c.strokeStyle = OUTLINE; c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(8, 15); c.bezierCurveTo(2, 13, 3, 7, 6, 9); c.bezierCurveTo(8, 11, 5, 13, 4, 11); c.stroke();
    c.strokeStyle = '#f5a8b6'; c.lineWidth = 1.3; c.stroke();
    // TULOW: beczulka z lekkim garbem na lopatkach
    const body = new Path2D();
    body.moveTo(8, 18);
    body.bezierCurveTo(8, 9, 18, 6, 27, 7);
    body.bezierCurveTo(33, 6.5, 37, 8, 39, 11);           // garb
    body.bezierCurveTo(43, 14, 43, 24, 38, 28);           // piers
    body.bezierCurveTo(30, 31, 18, 31, 12, 28);           // brzuch
    body.bezierCurveTo(7, 26, 7, 22, 8, 18);
    body.closePath();
    shape(c, body, 8, 6, 42, 30, '#ffdce2', '#f5a8b6', '#c96f84');
    c.save(); c.clip(body);
    const rg = c.createRadialGradient(18, 12, 1, 18, 13, 10); rg.addColorStop(0, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(18, 13, 10, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(120,80,40,0.35)'; c.beginPath(); c.ellipse(14, 25, 4, 2.2, 0.2, 0, Math.PI * 2); c.ellipse(30, 26, 3, 1.6, 0, 0, Math.PI * 2); c.fill(); // bloto
    c.restore();
    // GLOWA + wielki plaski RYJ
    const hx = graze ? 41 : 40, hy = graze ? 24 : 15;
    const head = new Path2D();
    head.ellipse(hx, hy + 0.5, 7, 6.2, 0.15, 0, Math.PI * 2); // okragla glowa
    shape(c, head, hx - 6, hy - 8, hx + 7, hy + 8, '#ffdce2', '#f5a8b6', '#c96f84', 2.4);
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(hx + 7.5, hy + 1.5, 3.1, 4.1, 0, 0, Math.PI * 2); c.fill();
    const sg = c.createRadialGradient(hx + 7, hy + 0.5, 0.5, hx + 7.5, hy + 1.5, 3.6); sg.addColorStop(0, '#ffc4d0'); sg.addColorStop(1, '#e07a90');
    c.fillStyle = sg; c.beginPath(); c.ellipse(hx + 7.5, hy + 1.5, 2.4, 3.4, 0, 0, Math.PI * 2); c.fill();    // tarcza ryja
    c.fillStyle = '#7a3a4a'; c.beginPath(); c.ellipse(hx + 7.9, hy + 0.3, 0.6, 0.9, 0, 0, Math.PI * 2); c.ellipse(hx + 7.9, hy + 2.8, 0.6, 0.9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 1, hy - 2, 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(hx + 0.7, hy - 2.4, 0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,120,140,0.45)'; c.beginPath(); c.ellipse(hx + 1, hy + 3, 2, 1.2, 0, 0, Math.PI * 2); c.fill(); // rumieniec
    // ucho KLAPNIETE do przodu
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(hx - 4, hy - 4.5); c.lineTo(hx + 1, hy - 9.5); c.lineTo(hx + 2.5, hy - 3.5); c.closePath(); c.fill();
    c.fillStyle = '#f08ea2'; c.beginPath(); c.moveTo(hx - 2.8, hy - 4.6); c.lineTo(hx + 0.9, hy - 8.2); c.lineTo(hx + 1.6, hy - 4); c.closePath(); c.fill();
    c.restore();
    leg(c, 18, 26, 10, 4.8, 3.4, '#f5a8b6', '#c96f84', mode, 0.5, GROUND, '#5a3040');
    leg(c, 36, 26, 10, 4.8, 3.4, '#f5a8b6', '#c96f84', mode, 0.75, GROUND, '#5a3040');
}
