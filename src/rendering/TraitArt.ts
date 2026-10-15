import * as PIXI from 'pixi.js';

/**
 * TraitArt — v0.246.0 CECHY: pieczony art efektow (Canvas 2D -> Texture, RAZ na sesje, cache module-level).
 * Fake-3D od pierwszej wersji (memory juice-od-razu): gradienty, blik, miekki cien. Zero rysowania wektorow
 * per klatka poza tanimi liniami wiazek plotu (ADD). Rozdzielczosc x2 = ostro przy DPR 2 (sprite skala 0.5).
 */
const S = 2;
const cache = new Map<string, PIXI.Texture>();

function bake(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): PIXI.Texture {
    const hit = cache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * S); cv.height = Math.ceil(h * S);
    const c = cv.getContext('2d')!;
    c.scale(S, S);
    draw(c);
    const tex = PIXI.Texture.from(cv);
    cache.set(key, tex);
    return tex;
}

export const TRAIT_ART_SCALE = 1 / S;

/** Worek jutowy (38x26): bryla z gradientem, splot, zawiazane rogi, miekki cien. Wariant = odcien. */
export function sandbagTexture(variant: 0 | 1 | 2): PIXI.Texture {
    return bake(`sandbag${variant}`, 46, 34, (c) => {
        const base = ['#b8925a', '#a8844e', '#c29c62'][variant];
        c.save(); c.shadowColor = 'rgba(30,20,8,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 3;
        c.fillStyle = base; c.beginPath(); c.ellipse(23, 16, 19, 11, 0, 0, Math.PI * 2); c.fill(); c.restore();
        const g = c.createRadialGradient(18, 10, 2, 23, 16, 21);
        g.addColorStop(0, '#e6c88e'); g.addColorStop(0.55, base); g.addColorStop(1, '#6e5530');
        c.fillStyle = g; c.beginPath(); c.ellipse(23, 16, 19, 11, 0, 0, Math.PI * 2); c.fill();
        // splot juty
        c.save(); c.beginPath(); c.ellipse(23, 16, 19, 11, 0, 0, Math.PI * 2); c.clip();
        c.strokeStyle = 'rgba(80,58,28,0.35)'; c.lineWidth = 0.8;
        for (let x = 4; x < 44; x += 3) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 4, 28); c.stroke(); }
        for (let y = 6; y < 28; y += 3) { c.beginPath(); c.moveTo(3, y); c.lineTo(43, y - 2); c.stroke(); }
        c.restore();
        // szew + zawiazane rogi
        c.strokeStyle = 'rgba(70,50,22,0.7)'; c.lineWidth = 1.2; c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(8, 16); c.quadraticCurveTo(23, 13, 38, 16); c.stroke(); c.setLineDash([]);
        for (const x of [5, 41]) { c.fillStyle = '#7a5c30'; c.beginPath(); c.arc(x, 16, 2.6, 0, Math.PI * 2); c.fill(); }
        // blik
        c.fillStyle = 'rgba(255,240,200,0.35)'; c.beginPath(); c.ellipse(17, 10, 8, 3, -0.2, 0, Math.PI * 2); c.fill();
    });
}

/** Slupek plotu elektrycznego (20x44): stal z gradientem, 2 izolatory (ceramika), lampka na szczycie, cien. */
export function fencePostTexture(): PIXI.Texture {
    return bake('fencePost', 24, 50, (c) => {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(12, 46, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
        const g = c.createLinearGradient(7, 0, 17, 0);
        g.addColorStop(0, '#3a4452'); g.addColorStop(0.45, '#aab6c6'); g.addColorStop(1, '#2a323c');
        c.fillStyle = g; c.beginPath(); c.roundRect(8, 8, 8, 38, 2); c.fill();
        for (const y of [17, 31]) {
            const ig = c.createLinearGradient(5, 0, 19, 0);
            ig.addColorStop(0, '#2b7fa8'); ig.addColorStop(0.5, '#bff2ff'); ig.addColorStop(1, '#1e5f80');
            c.fillStyle = ig; c.beginPath(); c.roundRect(5, y - 3, 14, 6, 3); c.fill();
        }
        const lamp = c.createRadialGradient(12, 6, 0.5, 12, 6, 7);
        lamp.addColorStop(0, '#ffffff'); lamp.addColorStop(0.4, '#6ff0ff'); lamp.addColorStop(1, 'rgba(63,216,255,0)');
        c.fillStyle = lamp; c.beginPath(); c.arc(12, 6, 7, 0, Math.PI * 2); c.fill();
    });
}

/** Kłąb dymu (128x128): miekka kula z grudkami (radialne gradienty), szary z jasnym czubkiem. */
export function smokePuffTexture(variant: 0 | 1 | 2): PIXI.Texture {
    return bake(`smoke${variant}`, 128, 128, (c) => {
        const blobs: Array<[number, number, number]> = [
            [[64, 64, 46], [44, 56, 30], [84, 54, 32], [60, 84, 30], [82, 80, 26]],
            [[64, 66, 44], [40, 70, 30], [86, 62, 30], [58, 44, 30], [76, 88, 24]],
            [[62, 62, 48], [88, 70, 28], [42, 50, 28], [66, 90, 28], [48, 82, 22]],
        ][variant] as Array<[number, number, number]>;
        for (const [x, y, r] of blobs) {
            const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, 'rgba(236,238,242,0.95)');
            g.addColorStop(0.45, 'rgba(176,182,192,0.85)');
            g.addColorStop(1, 'rgba(110,116,128,0)');
            c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        }
    });
}

/** Korona (v0.246.1: BEZ ozdob — gladkie zloto z gradientem, blik, ciemny obrys). */
/**
 * PUMPKIN: CALACA (62x68) — szkielet-mariachi w sombrero na turkusowym rowerku z trabka. 2 klatki (pedaly / nogi
 * w dwoch fazach) = animacja jazdy bez rysowania per klatka. Patrzy w prawo (lustro scale.x w grze).
 */
export function calacaTexture(frame: 0 | 1): PIXI.Texture {
    return bake('calaca' + frame, 62, 68, (c) => {
        c.translate(31, 52);
        const ped = frame ? Math.PI : 0;
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(0, 10, 24, 6, 0, 0, Math.PI * 2); c.fill();
        // kola
        for (const wx of [-14, 14]) {
            c.strokeStyle = '#1b1b22'; c.lineWidth = 3; c.beginPath(); c.arc(wx, 2, 8.5, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = '#9aa0a8'; c.lineWidth = 1; for (let k = 0; k < 3; k++) { const a = ped + k * Math.PI / 3; c.beginPath(); c.moveTo(wx + Math.cos(a) * 7, 2 + Math.sin(a) * 7); c.lineTo(wx - Math.cos(a) * 7, 2 - Math.sin(a) * 7); c.stroke(); }
            c.fillStyle = '#ff5fa2'; c.beginPath(); c.arc(wx, 2, 2, 0, Math.PI * 2); c.fill();
        }
        // rama
        c.strokeStyle = '#22c3b5'; c.lineWidth = 3; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-14, 2); c.lineTo(-3, -10); c.lineTo(11, -10); c.lineTo(14, 2); c.moveTo(-3, -10); c.lineTo(0, 2); c.lineTo(-14, 2); c.stroke();
        c.strokeStyle = '#ddd'; c.lineWidth = 2; c.beginPath(); c.moveTo(11, -10); c.lineTo(13, -16); c.lineTo(17, -16); c.stroke(); // kierownica
        // nogi (kosci) do pedalow
        const px = Math.cos(ped) * 4, py = Math.sin(ped) * 4;
        c.strokeStyle = '#f2ead6'; c.lineWidth = 2.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-3, -18); c.lineTo(2 + px * 0.5, -8); c.lineTo(px, 2 + py); c.stroke();
        c.beginPath(); c.moveTo(-1, -18); c.lineTo(3 - px * 0.5, -8); c.lineTo(-px, 2 - py); c.stroke();
        // tulow: czarna kamizelka charro z guzikami + zebra
        const tg = c.createLinearGradient(-8, -34, 6, -16); tg.addColorStop(0, '#3a2440'); tg.addColorStop(1, '#120a16');
        c.fillStyle = tg; c.beginPath(); c.ellipse(-2, -25, 7, 10, -0.15, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#f2ead6'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-6, -29 + i * 4); c.lineTo(2, -29 + i * 4); c.stroke(); }
        c.fillStyle = '#ffb21e'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(3.5, -30 + i * 4, 1.1, 0, Math.PI * 2); c.fill(); }
        // reka + zlota trabka (dzwon w strone jazdy)
        c.strokeStyle = '#f2ead6'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(1, -27); c.lineTo(8, -31); c.stroke();
        const hg = c.createLinearGradient(0, -36, 0, -26); hg.addColorStop(0, '#fff0a0'); hg.addColorStop(1, '#c98a10');
        c.fillStyle = hg; c.beginPath(); c.moveTo(6, -33); c.lineTo(20, -36); c.lineTo(22, -26); c.lineTo(6, -30); c.closePath(); c.fill();
        c.strokeStyle = '#7a4a08'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#fff6c8'; c.beginPath(); c.ellipse(21.5, -31, 2.4, 5.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        // czaszka-cukrowka
        const sg = c.createRadialGradient(-1, -44, 1, 1, -41, 9);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#cfc2a4');
        c.fillStyle = sg; c.beginPath(); c.arc(1, -41, 8, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#3a1f10'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#1a0a10'; for (const ex of [-2, 5]) { c.beginPath(); c.arc(ex, -42, 2.4, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#ff5fa2'; for (const ex of [-2, 5]) { c.beginPath(); c.arc(ex, -42, 1, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = '#1a0a10'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-2, -36.5); c.lineTo(5, -36.5); c.stroke();
        for (const x of [-0.5, 1.5, 3.5]) { c.beginPath(); c.moveTo(x, -37.5); c.lineTo(x, -35.5); c.stroke(); }
        // sombrero
        c.fillStyle = '#c72576'; c.beginPath(); c.ellipse(1, -48, 16, 4.2, 0, 0, Math.PI * 2); c.fill();
        const cg = c.createLinearGradient(0, -60, 0, -48); cg.addColorStop(0, '#ff8cc2'); cg.addColorStop(1, '#c72576');
        c.fillStyle = cg; c.beginPath(); c.moveTo(-5, -48.5); c.quadraticCurveTo(-4, -60, 1, -60); c.quadraticCurveTo(6, -60, 7, -48.5); c.closePath(); c.fill();
        c.strokeStyle = '#4a0d2a'; c.lineWidth = 1; c.beginPath(); c.ellipse(1, -48, 16, 4.2, 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ffb21e'; for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(1 + i * 4.4, -47.6, 1, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(-1.5, -55, 1.4, 3, -0.3, 0, Math.PI * 2); c.fill();
    });
}

/** PUMPKIN: nutka (16x20) — wylatuje z trabki CALACI przy kazdej nucie. Biala => tint daje kolor. */
export function noteTexture(): PIXI.Texture {
    return bake('note', 16, 20, (c) => {
        c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(5, 15, 4, 3, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillRect(8, 3, 1.8, 12);
        c.beginPath(); c.moveTo(9.8, 3); c.quadraticCurveTo(15, 6, 13, 11); c.quadraticCurveTo(13, 7, 9.8, 7); c.fill();
    });
}

export function crownTexture(): PIXI.Texture {
    return bake('crown2', 44, 34, (c) => {
        c.save(); c.shadowColor = 'rgba(255,200,40,0.9)'; c.shadowBlur = 8;
        c.beginPath();
        c.moveTo(6, 28); c.lineTo(4, 9); c.lineTo(14, 18); c.lineTo(22, 4); c.lineTo(30, 18); c.lineTo(40, 9); c.lineTo(38, 28); c.closePath();
        const g = c.createLinearGradient(0, 4, 0, 28);
        g.addColorStop(0, '#fff6b8'); g.addColorStop(0.45, '#f5c518'); g.addColorStop(1, '#b07a08');
        c.fillStyle = g; c.fill(); c.restore();
        c.strokeStyle = '#7a5206'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.beginPath(); c.moveTo(8, 25); c.lineTo(7, 14); c.lineTo(13, 20); c.closePath(); c.fill();
    });
}
