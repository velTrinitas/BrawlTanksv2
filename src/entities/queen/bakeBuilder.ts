import * as PIXI from 'pixi.js';

/**
 * bakeBuilder — plaski pieczony sprite Budowniczego (SAVE THE QUEEN Q4). Precedens
 * bakeSiegeMachine (Zamek): jedna tekstura, rotacja flat path przez Enemy.useCustomSprite.
 * Design §9.7: brazowy kadlub (#8d5a2b, akcent ochra #d9a441), ciemne gasienice, na pace
 * mini-dzwig z podwieszona cegla, KIELNIA jako "lufa" (czytelnie: to nie strzelec),
 * choragiewka z cegla na dachu. Sprite patrzy w +X (jak flat path czolgow).
 */

let _tex: PIXI.Texture | null = null;
let _crane: PIXI.Texture | null = null;

/**
 * Q6 (Mariusz: "brakuje mu dzwigu"): plaski DZWIG na pieczony kadlub 2.5D — obraca sie z czolgiem
 * (Enemy.attachAccessory). Sprite patrzy w +X: obrotnica na kabinie, wysiegnik ochra (kratownica)
 * ku przodowi-lewo, lina, hak, PODWIESZONA CEGLA, przeciwwaga z tylu. Kolory z palety Budowniczego.
 */
export function bakeCraneOverlay(): PIXI.Texture {
    if (_crane) return _crane;
    const S = 160;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const cx = S / 2, cy = S / 2;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // cien wysiegnika na kadlubie
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 9;
    c.beginPath(); c.moveTo(cx - 2 + 3, cy + 4); c.lineTo(cx + 56 + 3, cy - 30 + 4); c.stroke();
    // przeciwwaga (tyl, -X): ciezki blok
    c.fillStyle = '#3a2410'; c.fillRect(cx - 34, cy - 12, 16, 24);
    c.fillStyle = '#5e3a18'; c.fillRect(cx - 33, cy - 11, 14, 22);
    c.fillStyle = '#d9a441'; c.fillRect(cx - 33, cy - 11, 14, 3); c.fillRect(cx - 33, cy + 8, 14, 3);
    // obrotnica
    c.fillStyle = '#2a2320'; c.beginPath(); c.arc(cx - 2, cy, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6e4a22'; c.beginPath(); c.arc(cx - 2, cy, 10, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(cx - 5, cy - 3, 4, 0, Math.PI * 2); c.fill();
    // wysiegnik (kratownica ochra) ku przodowi-lewo
    const bx0 = cx - 2, by0 = cy, bx1 = cx + 56, by1 = cy - 30;
    c.strokeStyle = '#8a5f08'; c.lineWidth = 8; c.beginPath(); c.moveTo(bx0, by0); c.lineTo(bx1, by1); c.stroke();
    c.strokeStyle = '#d9a441'; c.lineWidth = 6; c.beginPath(); c.moveTo(bx0, by0); c.lineTo(bx1, by1); c.stroke();
    c.strokeStyle = '#8a5f08'; c.lineWidth = 1.5;
    for (let t = 0.15; t < 1; t += 0.17) { const x = bx0 + (bx1 - bx0) * t, y = by0 + (by1 - by0) * t; c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.stroke(); }
    c.fillStyle = '#fff1a8'; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(bx0, by0 - 3); c.lineTo(bx1, by1 - 3); c.lineTo(bx1, by1 - 1); c.lineTo(bx0, by0 - 1); c.fill(); c.globalAlpha = 1;
    // szczyt wysiegnika + kolo linowe
    c.fillStyle = '#3b3f46'; c.beginPath(); c.arc(bx1, by1, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a6068'; c.beginPath(); c.arc(bx1, by1, 2.5, 0, Math.PI * 2); c.fill();
    // lina + hak + PODWIESZONA CEGLA (lekko z przodu)
    const hx = bx1 + 2, hy = by1 + 26;
    c.strokeStyle = '#1f2226'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(bx1, by1); c.lineTo(hx, hy - 8); c.stroke();
    c.strokeStyle = '#5a6068'; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy - 4, 4, Math.PI * 0.1, Math.PI * 1.3); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(hx - 8 + 2, hy + 2, 18, 12);
    c.fillStyle = '#5e2419'; c.fillRect(hx - 8, hy, 18, 12);
    c.fillStyle = '#a84a3b'; c.fillRect(hx - 7, hy + 1, 16, 8);
    c.fillStyle = '#c9b8a5'; c.fillRect(hx - 7, hy + 5, 16, 1);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(hx - 7, hy + 1, 16, 2);
    // lampa ostrzegawcza na obrotnicy
    c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(cx - 2, cy - 14, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffb347'; c.beginPath(); c.arc(cx - 3, cy - 15, 1.2, 0, Math.PI * 2); c.fill();
    _crane = PIXI.Texture.from(cv);
    return _crane;
}

export function bakeBuilder(): PIXI.Texture {
    if (_tex) return _tex;
    const S = 96;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const cx = S / 2, cy = S / 2;
    // cien
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cx + 3, cy + 4, 30, 24, 0, 0, Math.PI * 2); c.fill();
    // gasienice
    c.fillStyle = '#2a2320'; c.fillRect(cx - 26, cy - 26, 52, 12); c.fillRect(cx - 26, cy + 14, 52, 12);
    c.fillStyle = '#4a403a'; for (let x = cx - 24; x < cx + 26; x += 8) { c.fillRect(x, cy - 24, 5, 8); c.fillRect(x, cy + 16, 5, 8); }
    // kadlub
    const g = c.createLinearGradient(cx - 22, cy - 16, cx + 22, cy + 16);
    g.addColorStop(0, '#a86f38'); g.addColorStop(0.5, '#8d5a2b'); g.addColorStop(1, '#5e3a18');
    c.fillStyle = g; c.beginPath(); c.roundRect(cx - 24, cy - 16, 48, 32, 6); c.fill();
    c.strokeStyle = '#3a2410'; c.lineWidth = 2; c.stroke();
    // paka z ceglami (tyl, -X)
    c.fillStyle = '#4a3320'; c.fillRect(cx - 22, cy - 12, 16, 24);
    const bricks = ['#8b3a2f', '#a84a3b', '#8b3a2f', '#6e2c22'];
    for (let i = 0; i < 4; i++) { c.fillStyle = bricks[i]; c.fillRect(cx - 20 + (i % 2) * 7, cy - 10 + Math.floor(i / 2) * 11, 6, 9); }
    // pasy ochra (ostrzegawcze)
    c.fillStyle = '#d9a441'; c.fillRect(cx - 4, cy - 16, 4, 32); c.fillRect(cx + 6, cy - 16, 4, 32);
    // kabina
    c.fillStyle = '#6e4a22'; c.beginPath(); c.roundRect(cx - 2, cy - 10, 16, 20, 4); c.fill();
    c.fillStyle = '#c9e2ff'; c.globalAlpha = 0.75; c.fillRect(cx + 6, cy - 7, 6, 14); c.globalAlpha = 1;
    // dzwig: ramie w gore-przod z cegla na lince
    c.strokeStyle = '#d9a441'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 8, cy - 6); c.lineTo(cx + 14, cy - 22); c.stroke();
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx + 14, cy - 22); c.lineTo(cx + 22, cy - 18); c.stroke();
    c.fillStyle = '#a84a3b'; c.fillRect(cx + 18, cy - 20, 9, 7); c.fillStyle = '#c9b8a5'; c.fillRect(cx + 18, cy - 17, 9, 1);
    // kielnia jako lufa (+X)
    c.fillStyle = '#3b3f46'; c.fillRect(cx + 14, cy - 2, 22, 4);
    c.fillStyle = '#5a6068'; c.beginPath(); c.moveTo(cx + 34, cy - 7); c.lineTo(cx + 46, cy); c.lineTo(cx + 34, cy + 7); c.closePath(); c.fill();
    // choragiewka z cegla
    c.strokeStyle = '#3b3f46'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 14, cy - 14); c.lineTo(cx - 14, cy - 30); c.stroke();
    c.fillStyle = '#f2ecf5'; c.beginPath(); c.moveTo(cx - 14, cy - 30); c.lineTo(cx - 2, cy - 26); c.lineTo(cx - 14, cy - 22); c.closePath(); c.fill();
    c.fillStyle = '#a84a3b'; c.fillRect(cx - 12, cy - 28, 5, 4);
    // blik NW
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(cx - 22, cy - 14, 44, 5);
    _tex = PIXI.Texture.from(cv);
    return _tex;
}
