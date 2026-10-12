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
