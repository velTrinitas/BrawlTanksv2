/**
 * traitIcons — v0.246.4 (Mariusz): wlasne ikony cech rysowane kodem (Canvas 2D, bake RAZ), gdy emoji nie pasuje.
 * Jeden canvas sluzy HUD-owi desktop (drawImage) i przyciskowi mobile (data URL w <img>).
 */

export type TraitIconArt = 'sandbag' | 'calaca';

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

/**
 * PUMPKIN: CALACA — czaszka-cukrowka w sombrero (fake-3D: cien, gradient kosci, blik), oczy z rozowym blaskiem,
 * kwiat nagietka na rondzie. Czytelna przy 28 px (pigulka HUD) i 50 px (kafelek).
 */
function drawCalacaIcon(c: CanvasRenderingContext2D): void {
    // czaszka
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
    const sg = c.createRadialGradient(42, 50, 4, 48, 58, 30);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.6, '#efe6d2'); sg.addColorStop(1, '#b9aa8a');
    c.fillStyle = sg; c.beginPath(); c.ellipse(48, 56, 25, 23, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.fillStyle = '#e4d9c0'; c.beginPath(); c.roundRect(34, 70, 28, 14, 5); c.fill(); // szczeka
    c.strokeStyle = '#3a1f10'; c.lineWidth = 2.4; c.beginPath(); c.ellipse(48, 56, 25, 23, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.roundRect(34, 70, 28, 14, 5); c.stroke();
    c.lineWidth = 1.6; for (const x of [41, 48, 55]) { c.beginPath(); c.moveTo(x, 72); c.lineTo(x, 83); c.stroke(); }
    // oczodoly z rozowym blaskiem + kwiatowe obwodki
    for (const ex of [38, 58]) {
        c.fillStyle = '#1a0a10'; c.beginPath(); c.ellipse(ex, 58, 8, 8.5, 0, 0, Math.PI * 2); c.fill();
        const eg = c.createRadialGradient(ex, 58, 0.5, ex, 58, 5); eg.addColorStop(0, '#ffd6ec'); eg.addColorStop(1, 'rgba(255,95,162,0)');
        c.fillStyle = eg; c.beginPath(); c.arc(ex, 58, 5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ff5fa2'; c.lineWidth = 1.6;
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; c.beginPath(); c.arc(ex + Math.cos(a) * 10.5, 58 + Math.sin(a) * 10.5, 1.6, 0, Math.PI * 2); c.stroke(); }
    }
    c.fillStyle = '#1a0a10'; c.beginPath(); c.moveTo(48, 64); c.lineTo(44.5, 69); c.lineTo(51.5, 69); c.closePath(); c.fill(); // nos
    c.fillStyle = '#22c3b5'; c.beginPath(); c.arc(48, 47, 2.4, 0, Math.PI * 2); c.fill(); // kropka na czole
    // sombrero: rondo + korona (magenta), lamowka zlota
    c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
    const bg = c.createLinearGradient(0, 26, 0, 44); bg.addColorStop(0, '#ff6fb0'); bg.addColorStop(1, '#b81f68');
    c.fillStyle = bg; c.beginPath(); c.ellipse(48, 38, 44, 11, 0, 0, Math.PI * 2); c.fill(); c.restore();
    const cg = c.createLinearGradient(0, 8, 0, 38); cg.addColorStop(0, '#ff8cc2'); cg.addColorStop(1, '#c72576');
    c.fillStyle = cg; c.beginPath(); c.moveTo(32, 37); c.quadraticCurveTo(34, 8, 48, 8); c.quadraticCurveTo(62, 8, 64, 37); c.closePath(); c.fill();
    c.strokeStyle = '#4a0d2a'; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(48, 38, 44, 11, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(32, 37); c.quadraticCurveTo(34, 8, 48, 8); c.quadraticCurveTo(62, 8, 64, 37); c.stroke();
    c.strokeStyle = '#ffb21e'; c.lineWidth = 3; c.beginPath(); c.moveTo(33, 31); c.quadraticCurveTo(48, 35, 63, 31); c.stroke();
    c.fillStyle = '#ffb21e'; for (const x of [14, 26, 70, 82]) { c.beginPath(); c.arc(x, 39, 2.2, 0, Math.PI * 2); c.fill(); }
    // nagietek na rondzie
    c.fillStyle = '#ff9a1a'; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; c.beginPath(); c.ellipse(72 + Math.cos(a) * 4.5, 32 + Math.sin(a) * 4.5, 3.6, 2.2, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#c4580f'; c.beginPath(); c.arc(72, 32, 2.6, 0, Math.PI * 2); c.fill();
    // blik
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(40, 21, 4, 7, -0.4, 0, Math.PI * 2); c.fill();
}

function bake(art: TraitIconArt): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const c = cv.getContext('2d')!;
    if (art === 'calaca') drawCalacaIcon(c);
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
