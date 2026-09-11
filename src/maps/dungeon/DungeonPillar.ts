import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { DUNGEON_PALETTE as P } from './dungeonPalette';

/**
 * DungeonPillar — filar kolumnady LOCHOW (SAVE THE QUEEN Q1): solid 70x70 (cover
 * przed pociskami + flanka). Pieczony RAZ (jedna tekstura wspoldzielona przez
 * wszystkie filary, cache module-level), zIndex = y + h (czolg przejezdza "za" trzonem).
 * Hitbox = AABB z layoutu (x/y TOP-LEFT); kapitel wystaje w gore poza AABB (nad czolgiem).
 *
 * Q2 polish (decyzja Mariusza po 2. playtescie: "kolumny z efektem fake 3D — gradient, cien"):
 *  - trzon = WALEC: gradient poziomy 6 stopow (ciemna krawedz -> blik NW -> srodek -> gleboki
 *    cien SE), zlobkowanie jako pasy w rozkladzie cosinusowym (krzywizna), AO u podstawy,
 *  - dlugi miekki cien rzucony na posadzke w strone SE (swiatlo T1 z NW) + cien kontaktowy,
 *  - kapitel i plinta z wlasnym gradientem (bryly, nie paski), obrecze zelazne na trzonie,
 *  - cieple podswietlenie od pochodni/lawy: subtelny pomaranczowy blik na krawedzi SW (bake).
 * Zero pracy per-frame — wszystko w jednej teksturze.
 */

const RISE = 84;   // wysokosc trzonu nad podstawa (2.5D)
const M = 14;      // margines NW
const SHADOW_X = 58, SHADOW_Y = 34; // zasieg cienia SE poza AABB
let _tex: PIXI.Texture | null = null;

function bakePillar(w: number, h: number): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = w + M * 2 + SHADOW_X; cv.height = h + M * 2 + RISE + SHADOW_Y;
    const c = cv.getContext('2d')!;
    const x = M, y = M + RISE; // AABB top-left w teksturze
    const cx = x + w / 2;

    // 1. dlugi cien na posadzce (SE) — rozmyty wielokat + cien kontaktowy
    c.save();
    c.filter = 'blur(6px)';
    c.fillStyle = 'rgba(0,0,0,0.42)';
    c.beginPath();
    c.moveTo(x + 6, y + h - 6);
    c.lineTo(x + w - 4, y + h - 10);
    c.lineTo(x + w + SHADOW_X - 14, y + h + SHADOW_Y - 16);
    c.lineTo(x + w + SHADOW_X - 30, y + h + SHADOW_Y - 6);
    c.lineTo(x + 18, y + h + 12);
    c.closePath(); c.fill();
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath(); c.ellipse(cx + 4, y + h - 6, w * 0.62, 11, 0, 0, Math.PI * 2); c.fill();

    // 2. plinta (podstawa) — bryla z gradientem
    const plintaTop = y + h - 22;
    const pg = c.createLinearGradient(x - 8, 0, x + w + 8, 0);
    pg.addColorStop(0, P.stoneDark); pg.addColorStop(0.3, P.stoneLight); pg.addColorStop(0.6, P.stone); pg.addColorStop(1, '#241f30');
    c.fillStyle = pg; c.fillRect(x - 8, plintaTop, w + 16, 22);
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x - 8, plintaTop, w + 16, 4);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x - 8, y + h - 5, w + 16, 5);
    c.fillStyle = pg; c.fillRect(x - 3, plintaTop - 8, w + 6, 8);
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x - 3, plintaTop - 8, w + 6, 3);

    // 3. trzon = walec (gradient 6 stopow)
    const sx0 = x + 5, sw = w - 10, sy0 = y - RISE + 14, sh = h + RISE - 44;
    const sg = c.createLinearGradient(sx0, 0, sx0 + sw, 0);
    sg.addColorStop(0, '#2a2437');
    sg.addColorStop(0.16, P.stoneLight);
    sg.addColorStop(0.32, '#7c7494');
    sg.addColorStop(0.55, P.stone);
    sg.addColorStop(0.82, P.stoneDark);
    sg.addColorStop(1, '#1c1726');
    c.fillStyle = sg; c.fillRect(sx0, sy0, sw, sh);
    // zlobkowanie: rowki (ciemne) + grzbiety (jasne) w rozkladzie cosinusowym = krzywizna walca
    const flutes = 6;
    for (let i = 1; i < flutes; i++) {
        const u = i / flutes;
        const fx = sx0 + sw * (0.5 - Math.cos(u * Math.PI) * 0.5);
        c.fillStyle = 'rgba(0,0,0,' + (0.22 + u * 0.18).toFixed(2) + ')'; c.fillRect(fx - 1.5, sy0 + 6, 3, sh - 12);
        c.fillStyle = 'rgba(255,255,255,' + (0.14 - u * 0.1).toFixed(2) + ')'; c.fillRect(fx + 1.5, sy0 + 6, 1.5, sh - 12);
    }
    // AO u podstawy (trzon wtapia sie w plinte)
    const ao = c.createLinearGradient(0, sy0 + sh - 40, 0, sy0 + sh);
    ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = ao; c.fillRect(sx0, sy0 + sh - 40, sw, 40);
    // obrecze zelazne (2) — ciemny pas + blik + nity
    for (const ry of [sy0 + 26, sy0 + sh - 58]) {
        c.fillStyle = P.iron; c.fillRect(sx0 - 2, ry, sw + 4, 7);
        c.fillStyle = P.ironLight; c.fillRect(sx0 - 2, ry, sw * 0.4, 2);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(sx0 - 2, ry + 5, sw + 4, 2);
        c.fillStyle = P.ironLight; for (let nx = sx0 + 6; nx < sx0 + sw; nx += 12) c.fillRect(nx, ry + 2, 2, 3);
    }
    // cieple podswietlenie od pochodni/lawy — blik SW (subtelny, wpieczony)
    const warm = c.createLinearGradient(sx0, 0, sx0 + sw * 0.35, 0);
    warm.addColorStop(0, 'rgba(255,122,26,0.22)'); warm.addColorStop(1, 'rgba(255,122,26,0)');
    c.fillStyle = warm; c.fillRect(sx0, sy0 + sh * 0.45, sw * 0.35, sh * 0.55);

    // 4. kapitel — bryla (trapez rozszerzajacy sie w gore) z gradientem
    const capY = y - RISE;
    const cg = c.createLinearGradient(x - 9, 0, x + w + 9, 0);
    cg.addColorStop(0, P.stoneDark); cg.addColorStop(0.25, P.stoneLight); cg.addColorStop(0.6, P.stone); cg.addColorStop(1, '#241f30');
    c.fillStyle = cg;
    c.beginPath(); c.moveTo(sx0 - 2, capY + 20); c.lineTo(sx0 + sw + 2, capY + 20); c.lineTo(x + w + 9, capY + 8); c.lineTo(x - 9, capY + 8); c.closePath(); c.fill();
    c.fillRect(x - 9, capY, w + 18, 9);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x - 9, capY, w + 18, 3);
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(sx0 - 2, capY + 18, sw + 4, 4);

    // 5. detal: fioletowy mech u podstawy + pekniecie + pajeczyna pod kapitelem
    c.fillStyle = P.moss; c.globalAlpha = 0.6;
    c.beginPath(); c.ellipse(x + 12, y + h - 26, 10, 5, 0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + w - 10, y + h - 30, 7, 4, -0.2, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x + w * 0.62, sy0 + 40); c.lineTo(x + w * 0.52, sy0 + 70); c.lineTo(x + w * 0.6, sy0 + 96); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + w * 0.62 + 2, sy0 + 40); c.lineTo(x + w * 0.52 + 2, sy0 + 70); c.stroke();
    c.strokeStyle = 'rgba(230,220,255,0.28)'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sx0 + sw, capY + 20); c.lineTo(sx0 + sw + 2 - i * 5, capY + 38 - i * 2); c.stroke(); }
    c.beginPath(); c.moveTo(sx0 + sw - 8, capY + 32); c.quadraticCurveTo(sx0 + sw - 2, capY + 30, sx0 + sw + 2, capY + 26); c.stroke();

    return PIXI.Texture.from(cv);
}

export class DungeonPillar implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this.container.addChild(this.sprite);
        worldContainer.addChild(this.container);

        if (!_tex) _tex = bakePillar(w, h);
        this.sprite.texture = _tex;
        this.container.x = x - M;
        this.container.y = y - M - RISE;
        this.container.zIndex = y + h + x * 1e-4;
    }

    public update(): void {
        // statyczny — brak pracy per-frame
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
