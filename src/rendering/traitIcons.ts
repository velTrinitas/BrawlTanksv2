/**
 * traitIcons — v0.246.4 (Mariusz): wlasne ikony cech rysowane kodem (Canvas 2D, bake RAZ), gdy emoji nie pasuje.
 * Jeden canvas sluzy HUD-owi desktop (drawImage) i przyciskowi mobile (data URL w <img>).
 */

export type TraitIconArt = 'sandbag';

const SIZE = 96;
const cache = new Map<TraitIconArt, HTMLCanvasElement>();
const urlCache = new Map<TraitIconArt, string>();

/** Jeden worek z piaskiem (lezacy "poduszka" z zawiazanymi rogami) w prostokacie (x, y, w, h). */
function drawBag(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const pinch = h * 0.22;
    const path = (): void => {
        c.beginPath();
        c.moveTo(x + w * 0.1, y + pinch);
        c.quadraticCurveTo(x + w * 0.5, y - h * 0.12, x + w * 0.9, y + pinch);   // gora (wypukla)
        c.lineTo(x + w, y + h * 0.18);                                           // prawy rog (zawiazany)
        c.quadraticCurveTo(x + w * 0.94, y + h * 0.5, x + w, y + h * 0.82);
        c.lineTo(x + w * 0.9, y + h - pinch);
        c.quadraticCurveTo(x + w * 0.5, y + h * 1.1, x + w * 0.1, y + h - pinch); // dol
        c.lineTo(x, y + h * 0.82);                                               // lewy rog
        c.quadraticCurveTo(x + w * 0.06, y + h * 0.5, x, y + h * 0.18);
        c.closePath();
    };
    // miekki cien pod workiem
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
    path();
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#f2dca4'); g.addColorStop(0.45, '#d4b170'); g.addColorStop(1, '#8f6a34');
    c.fillStyle = g; c.fill();
    c.restore();
    // splot juty (kratka) przyciety do worka
    c.save();
    path(); c.clip();
    c.strokeStyle = 'rgba(110,78,34,0.28)'; c.lineWidth = 1;
    for (let i = x - h; i < x + w + h; i += 5) { c.beginPath(); c.moveTo(i, y); c.lineTo(i + h * 0.5, y + h); c.stroke(); }
    for (let j = y + 3; j < y + h; j += 5) { c.beginPath(); c.moveTo(x, j); c.lineTo(x + w, j); c.stroke(); }
    // blik na gorze (fake-3D)
    const hl = c.createRadialGradient(x + w * 0.38, y + h * 0.28, 1, x + w * 0.38, y + h * 0.28, w * 0.4);
    hl.addColorStop(0, 'rgba(255,250,225,0.65)'); hl.addColorStop(1, 'rgba(255,250,225,0)');
    c.fillStyle = hl; c.fillRect(x, y, w, h);
    c.restore();
    // szew (przerywany) wzdluz worka
    c.save();
    c.setLineDash([4, 3]); c.strokeStyle = 'rgba(90,60,25,0.85)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x + w * 0.14, y + h * 0.56); c.quadraticCurveTo(x + w * 0.5, y + h * 0.66, x + w * 0.86, y + h * 0.56); c.stroke();
    c.restore();
    // sznurki na rogach
    c.fillStyle = '#6b4a1f';
    for (const [cx, cy] of [[x + w * 0.03, y + h * 0.5], [x + w * 0.97, y + h * 0.5]]) {
        c.beginPath(); c.ellipse(cx, cy, 2.6, h * 0.2, 0, 0, Math.PI * 2); c.fill();
    }
    // obrys
    path(); c.lineWidth = 2.6; c.strokeStyle = '#3d2810'; c.stroke();
}

function bake(art: TraitIconArt): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const c = cv.getContext('2d')!;
    if (art === 'sandbag') {
        // barykada WW2: 2 worki na dole + 1 na gorze (na zakladke)
        drawBag(c, 6, 50, 44, 30);
        drawBag(c, 46, 50, 44, 30);
        drawBag(c, 25, 24, 46, 31);
    }
    return cv;
}

export function traitIconCanvas(art: TraitIconArt): HTMLCanvasElement {
    let cv = cache.get(art);
    if (!cv) { cv = bake(art); cache.set(art, cv); }
    return cv;
}

export function traitIconUrl(art: TraitIconArt): string {
    let u = urlCache.get(art);
    if (!u) { u = traitIconCanvas(art).toDataURL('image/png'); urlCache.set(art, u); }
    return u;
}
