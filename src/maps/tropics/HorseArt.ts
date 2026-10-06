/**
 * TROPICS ART v2 — KON (Mariusz: "wygladaja okropnie, nie przypominaja koni").
 *
 * Sylwetka z anatomii zamiast elipsy + patykow: zad (krag) -> kloda -> gleboka piers, szyja wyrastajaca
 * z klebu LUKIEM (grzebien wypukly), glowa-klin z ganaszem i zwezonym pyskiem, nogi DWUCZLONOWE
 * (przod: lokiec-kolano-peciny, tyl: udo-staw skokowy zgiety DO TYLU), kopyta. Swiatlo z NW, gruby obrys
 * (styl czolgow). Chod = stepa 4-taktowy (LT, LP, PT, PP co 1/4 cyklu), noga w przenoszeniu zgina staw
 * i unosi kopyto; szyja kiwa 2x na cykl (jak u prawdziwego konia w stepie). Pasienie = szyja do ziemi.
 * Klatka 78x62 (jak dawniej — anchory/cienie bez zmian), pysk w prawo.
 */
export const HORSE_WALK_FRAMES = 8;
const OUTLINE = '#1c120a';
const GROUND = 59;

export type HorsePal = [string, string, string, string]; // light, mid, dark, mane

interface Leg { hipX: number; hipY: number; upper: number; lower: number; front: boolean; phase: number; far: boolean; }

function legPose(l: Leg, t: number | null): { kx: number; ky: number; fx: number; fy: number } {
    // t = faza cyklu 0..1 (null = stoi). Podporowa 0..0.6 (noga cofa sie), przenoszenie 0.6..1 (zgiecie + uniesienie).
    let swing = 0, lift = 0, bend = l.front ? 0.12 : -0.35;
    if (t !== null) {
        const p = (t + l.phase) % 1;
        if (p < 0.6) { swing = 0.32 - (p / 0.6) * 0.64; }
        else { const q = (p - 0.6) / 0.4; swing = -0.32 + q * 0.64; lift = Math.sin(q * Math.PI); bend += (l.front ? 1.1 : -0.7) * lift; }
    }
    const a1 = swing; // od pionu, + = do przodu
    const kx = l.hipX + Math.sin(a1) * l.upper, ky = l.hipY + Math.cos(a1) * l.upper;
    const a2 = a1 - bend * (l.front ? 1 : 1);
    let fx = kx + Math.sin(a2 - (l.front ? 0.0 : 0)) * l.lower, fy = ky + Math.cos(a2) * l.lower;
    if (l.front && lift > 0) { fx = kx - Math.sin(bend * 0.9) * l.lower * 0.6; fy = ky + l.lower * (1 - 0.45 * lift); }
    if (fy > GROUND) fy = GROUND;
    return { kx, ky, fx, fy };
}

function drawLeg(c: CanvasRenderingContext2D, l: Leg, t: number | null, col: string, dark: string): void {
    const { kx, ky, fx, fy } = legPose(l, t);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // obrys
    c.strokeStyle = OUTLINE;
    c.lineWidth = (l.front ? 5 : 6.2) + 2.2; c.beginPath(); c.moveTo(l.hipX, l.hipY - 4); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = 2.8 + 2.2; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy - 2); c.stroke();
    // udo/przedramie (grube) -> nadpecie (cienkie)
    const g = c.createLinearGradient(l.hipX - 4, 0, l.hipX + 4, 0); g.addColorStop(0, col); g.addColorStop(1, dark);
    c.strokeStyle = g;
    c.lineWidth = l.front ? 5 : 6.2; c.beginPath(); c.moveTo(l.hipX, l.hipY - 4); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = 2.8; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy - 2); c.stroke();
    // staw (kolano / skokowy)
    c.fillStyle = dark; c.beginPath(); c.arc(kx, ky, 2.2, 0, Math.PI * 2); c.fill();
    // kopyto
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(fx - 2.8, fy - 3); c.lineTo(fx + 2.4, fy - 3); c.lineTo(fx + 3.4, fy + 0.6); c.lineTo(fx - 3, fy + 0.6); c.closePath(); c.fill();
    c.fillStyle = '#3a2a1e'; c.fillRect(fx - 2, fy - 2.3, 4.4, 2.2);
}

export function drawHorseV2(c: CanvasRenderingContext2D, pal: HorsePal, mode: 'stand' | 'graze' | number): void {
    const [light, mid, dark, mane] = pal;
    const t = typeof mode === 'number' ? mode / HORSE_WALK_FRAMES : null;
    const graze = mode === 'graze';
    // kiwanie szyi: 2x na cykl stepa; tulow lekko faluje
    const nod = t === null ? 0 : Math.sin(t * Math.PI * 4) * 1.6;
    const bob = t === null ? 0 : Math.abs(Math.sin(t * Math.PI * 2)) * -0.8;

    // cien kontaktowy
    const sg = c.createRadialGradient(40, GROUND, 2, 40, GROUND, 30);
    sg.addColorStop(0, 'rgba(10,20,5,0.42)'); sg.addColorStop(1, 'rgba(10,20,5,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(40, GROUND, 30, 5, 0, 0, Math.PI * 2); c.fill();

    c.save(); c.translate(0, bob);
    // nogi: LT=0, LP=0.25, PT=0.5, PP=0.75 (step 4-taktowy); dalsze = lewe (ciemniejsze)
    const legs: Leg[] = [
        { hipX: 24, hipY: 33, upper: 12, lower: 14.5, front: false, phase: 0.0, far: true },
        { hipX: 53, hipY: 34, upper: 11, lower: 14.5, front: true, phase: 0.25, far: true },
        { hipX: 27, hipY: 34, upper: 12, lower: 14.5, front: false, phase: 0.5, far: false },
        { hipX: 56, hipY: 35, upper: 11, lower: 14.5, front: true, phase: 0.75, far: false },
    ];
    const farCol = shade(dark, 0.8), farDark = shade(dark, 0.55);
    for (const l of legs) if (l.far) drawLeg(c, l, t, farCol, farDark);

    // OGON — od nasady na zadzie, opada luzno
    const sway = t === null ? 0 : Math.sin(t * Math.PI * 2) * 2;
    c.lineCap = 'round';
    c.strokeStyle = OUTLINE; c.lineWidth = 7.5; c.beginPath(); c.moveTo(15, 25); c.bezierCurveTo(8, 28, 8 + sway, 38, 10 + sway, 49); c.stroke();
    c.strokeStyle = mane; c.lineWidth = 5.4; c.beginPath(); c.moveTo(15, 25); c.bezierCurveTo(8, 28, 8 + sway, 38, 10 + sway, 49); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(14, 26); c.bezierCurveTo(9, 29, 9 + sway, 37, 10 + sway, 46); c.stroke();

    // SZYJA + GLOWA (pozycja wg trybu)
    const neckBaseTop = { x: 50, y: 22 }, neckBaseLow = { x: 60, y: 34 };
    let poll: { x: number; y: number }, throat: { x: number; y: number }, headAng: number;
    if (graze) { poll = { x: 68, y: 40 }; throat = { x: 66, y: 46 }; headAng = 1.25; }
    else { poll = { x: 64, y: 8 + nod }; throat = { x: 67, y: 18 + nod }; headAng = 0.55 + nod * 0.03; }

    // TULOW: zad + kloda + piers + szyja jako JEDNA sylweta (bez szwow)
    const body = new Path2D();
    body.moveTo(17, 24);                                   // nasada ogona
    body.bezierCurveTo(18, 14, 30, 15, 36, 19);            // zad -> grzbiet (lekko wklesly)
    body.bezierCurveTo(42, 21, 46, 20, neckBaseTop.x, neckBaseTop.y); // klab
    // grzebien szyi: WYPUKLY luk do potylicy
    body.bezierCurveTo(neckBaseTop.x + 4, neckBaseTop.y - 8 + (graze ? 10 : 0), poll.x - 6, poll.y - 2, poll.x, poll.y);
    body.lineTo(throat.x, throat.y);
    // spod szyi do piersi
    body.bezierCurveTo(throat.x - 3, throat.y + 6, neckBaseLow.x + 2, neckBaseLow.y - 6, neckBaseLow.x, neckBaseLow.y);
    body.bezierCurveTo(58, 40, 52, 40, 46, 38.5);            // piers -> brzuch
    body.bezierCurveTo(38, 40, 30, 39.5, 26, 37.5);            // brzuch (obly)
    body.bezierCurveTo(18, 38, 13, 32, 17, 24);            // tyl uda -> zad
    body.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = OUTLINE; c.lineWidth = 3.2; c.stroke(body);
    const bg = c.createLinearGradient(30, 12, 42, 44);
    bg.addColorStop(0, light); bg.addColorStop(0.45, mid); bg.addColorStop(1, dark);
    c.fillStyle = bg; c.fill(body);
    // objetosc: miesien zadu, lopatka, cien brzucha
    c.save(); c.clip(body);
    const rg = c.createRadialGradient(24, 25, 1, 24, 28, 12); rg.addColorStop(0, 'rgba(255,255,255,0.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(24, 28, 12, 0, Math.PI * 2); c.fill();
    const sh = c.createRadialGradient(51, 29, 1, 51, 30, 9); sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.beginPath(); c.arc(51, 30, 9, 0, Math.PI * 2); c.fill();
    const bl = c.createLinearGradient(0, 34, 0, 44); bl.addColorStop(0, 'rgba(0,0,0,0)'); bl.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = bl; c.fillRect(10, 34, 60, 12);
    // blik na grzbiecie
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(22, 19); c.bezierCurveTo(30, 16, 38, 20, 47, 21); c.stroke();
    c.restore();

    // GLOWA: klin od potylicy do pyska (ganasz szeroki, pysk waski)
    c.save(); c.translate(poll.x, poll.y); c.rotate(headAng);
    const head = new Path2D();
    head.moveTo(-1, -3);                       // czolo przy potylicy
    head.bezierCurveTo(5, -4, 11, -3, 15, -1.5); // grzbiet nosa
    head.bezierCurveTo(17.5, -0.5, 17.5, 3.5, 15, 4.2); // pysk zaokraglony
    head.bezierCurveTo(11, 5, 7, 7.5, 3, 8.5); // spod szczeki
    head.bezierCurveTo(-2, 9, -4, 4, -1, -3);  // ganasz
    head.closePath();
    c.strokeStyle = OUTLINE; c.lineWidth = 2.8; c.stroke(head);
    const hg = c.createLinearGradient(0, -4, 4, 9); hg.addColorStop(0, light); hg.addColorStop(0.5, mid); hg.addColorStop(1, dark);
    c.fillStyle = hg; c.fill(head);
    c.fillStyle = shade(dark, 0.7); c.beginPath(); c.ellipse(14.5, 1.4, 2.6, 2.4, 0, 0, Math.PI * 2); c.fill(); // chrapy/pysk
    c.fillStyle = '#120a06'; c.beginPath(); c.ellipse(15.2, 0.4, 0.9, 0.6, 0.3, 0, Math.PI * 2); c.fill();     // nozdrze
    c.fillStyle = '#120a06'; c.beginPath(); c.ellipse(3.6, -0.2, 1.5, 1.2, 0, 0, Math.PI * 2); c.fill();         // oko
    c.fillStyle = '#fff'; c.beginPath(); c.arc(3.2, -0.6, 0.5, 0, Math.PI * 2); c.fill();
    // ucho — spiczaste, postawione
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(-1.5, -2); c.lineTo(-0.5, -9.5); c.lineTo(2.5, -2.5); c.closePath(); c.fill();
    c.fillStyle = mid; c.beginPath(); c.moveTo(-0.6, -2.6); c.lineTo(-0.3, -8); c.lineTo(1.6, -2.8); c.closePath(); c.fill();
    c.restore();

    // GRZYWA wzdluz grzebienia szyi + grzywka
    c.strokeStyle = OUTLINE; c.lineWidth = 5; c.lineCap = 'round';
    const maneP = new Path2D(); maneP.moveTo(49, 21);
    maneP.bezierCurveTo(neckBaseTop.x + 3, neckBaseTop.y - 9 + (graze ? 10 : 0), poll.x - 7, poll.y - 3, poll.x - 1, poll.y - 1);
    c.stroke(maneP); c.strokeStyle = mane; c.lineWidth = 3.2; c.stroke(maneP);
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1; c.stroke(maneP);

    for (const l of legs) if (!l.far) drawLeg(c, l, t, mid, dark);
    c.restore();
}

function shade(hex: string, k: number): string {
    const n = parseInt(hex.slice(1), 16);
    const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k))).toString(16).padStart(2, '0');
    return '#' + ch(16) + ch(8) + ch(0);
}
