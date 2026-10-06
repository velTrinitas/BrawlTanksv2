import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { buildAgroGroves } from './AgroTrees';
import { ambientRng } from '../../systems/Rng';

/**
 * TROPICS ART v2 / T5 — nowe elementy gospodarstwa (prosba Mariusza: "wiecej gospodarskich
 * elementow", stawiane NA OBRZEZACH mapy, zeby srodek zostal wolny na walke).
 *
 * Kazdy prop pieczony RAZ (Canvas 2D, gradienty, cien SE, kontur) => w meczu 1 sprite.
 * Pozycje policzone w Node (siatka 10 px, zapas od budynkow/pol/drog/bel/padow/startu/zwierzat).
 * Kolizje: staw blokuje CZOLG (nie pocisk — strzela sie nad woda), szklarnia/studnia/silos/pnie
 * palm/strachy blokuja oba. Czytelnosc: co wyglada na twarde, jest twarde.
 * Tylko kaczki i zmarszczki sa animowane (transformy, poza kadrem stop).
 */
export interface FarmPropsLayout {
    ponds: Array<{ x: number; y: number }>;          // 180x120
    greenhouses: Array<{ x: number; y: number }>;    // 160x110
    wells: Array<{ x: number; y: number }>;          // 60x60
    silos: Array<{ x: number; y: number }>;          // 70x70
    palms: Array<{ x: number; y: number }>;          // klaster 120x120
    scarecrows: Array<{ x: number; y: number }>;     // 40x50
}

export const TROPICS_FARM_PROPS_V2: FarmPropsLayout = {
    ponds: [{ x: 2640, y: 2340 }], // 1 staw (Mariusz 2026-10-05: za duzo szumu)
    greenhouses: [], // usuniete (Mariusz: inny styl artystyczny niz reszta farmy)
    wells: [],       // usunieta (Mariusz 2026-10-05)
    silos: [],       // usuniety (j.w.) — silosy przy stodole zostaja
    palms: [{ x: 2660, y: 940 }, { x: 110, y: 860 }, { x: 110, y: 2540 }, { x: 1820, y: 2520 }],
    scarecrows: [],  // wszystkie usuniete (Mariusz 2026-10-05)
};

const S = 2;
const _t = new Map<string, PIXI.Texture>();
function bake(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): PIXI.Texture {
    const hit = _t.get(key); if (hit) return hit;
    const cv = document.createElement('canvas'); cv.width = w * S; cv.height = h * S;
    const c = cv.getContext('2d')!; c.scale(S, S); draw(c);
    const t = PIXI.Texture.from(cv, { resolution: S } as PIXI.IBaseTextureOptions);
    _t.set(key, t); return t;
}
const OUT = 'rgba(30,20,10,0.85)';

function pondTex(): PIXI.Texture {
    return bake('pond', 200, 140, c => {
        const cx = 100, cy = 70, rx = 90, ry = 58;
        c.fillStyle = 'rgba(70,52,22,0.55)'; c.beginPath(); c.ellipse(cx, cy + 3, rx + 8, ry + 7, 0, 0, Math.PI * 2); c.fill(); // brzeg
        const g = c.createRadialGradient(cx - 20, cy - 18, 4, cx, cy, rx);
        g.addColorStop(0, '#8fd6ef'); g.addColorStop(0.55, '#3f9ec4'); g.addColorStop(1, '#1f5f80');
        c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2.5; // jasna krawedz od slonca
        c.beginPath(); c.ellipse(cx, cy, rx - 3, ry - 3, 0, Math.PI * 1.05, Math.PI * 1.7); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(cx - 34, cy - 20, 22, 5, -0.2, 0, Math.PI * 2); c.fill();
        for (const [lx, ly] of [[52, 88], [140, 52], [128, 96]] as const) { // lilie wodne
            c.fillStyle = '#3f9a3a'; c.beginPath(); c.arc(lx, ly, 7, 0.3, Math.PI * 2 - 0.2); c.lineTo(lx, ly); c.fill();
            c.fillStyle = '#ffb6d0'; c.beginPath(); c.arc(lx + 2, ly - 2, 2.6, 0, Math.PI * 2); c.fill();
        }
        for (let i = 0; i < 26; i++) { // trzciny na brzegu (od zachodu)
            const a = Math.PI * (0.7 + (i / 26) * 0.7), x = cx + Math.cos(a) * (rx + 4), y = cy + Math.sin(a) * (ry + 3);
            c.strokeStyle = i % 3 ? '#4f8a2c' : '#6fae3a'; c.lineWidth = 1.8; c.lineCap = 'round';
            c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2 + (i % 3), y - 12 - (i % 4) * 3); c.stroke();
            if (i % 4 === 0) { c.fillStyle = '#6a4220'; c.beginPath(); c.ellipse(x - 1, y - 14 - (i % 4) * 3, 1.6, 4, 0, 0, Math.PI * 2); c.fill(); }
        }
    });
}
function duckTex(): PIXI.Texture {
    return bake('duck', 26, 20, c => {
        c.fillStyle = 'rgba(20,60,80,0.35)'; c.beginPath(); c.ellipse(13, 15, 10, 3, 0, 0, Math.PI * 2); c.fill();
        const g = c.createRadialGradient(9, 9, 1, 11, 12, 9);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c9c9');
        c.fillStyle = g; c.beginPath(); c.ellipse(11, 12, 8, 5, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(19, 7, 4, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#f2a020'; c.beginPath(); c.moveTo(22, 7); c.lineTo(26, 8); c.lineTo(22, 9.5); c.fill();
        c.fillStyle = '#111'; c.beginPath(); c.arc(20, 6, 0.9, 0, Math.PI * 2); c.fill();
    });
}
function greenhouseTex(): PIXI.Texture {
    return bake('greenhouse', 190, 150, c => {
        c.fillStyle = 'rgba(18,40,10,0.35)'; c.beginPath(); c.moveTo(170, 50); c.lineTo(190, 70); c.lineTo(190, 145); c.lineTo(30, 145); c.lineTo(15, 130); c.lineTo(170, 130); c.fill();
        // sciana frontowa (szklo z zielenia w srodku)
        c.fillStyle = '#5fa83e'; c.fillRect(15, 70, 155, 60);
        for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#e84a3a' : '#3f8a2c'; c.beginPath(); c.arc(24 + i * 11, 110 - (i % 3) * 8, 5, 0, Math.PI * 2); c.fill(); }
        const glass = c.createLinearGradient(15, 70, 170, 130);
        glass.addColorStop(0, 'rgba(220,245,255,0.55)'); glass.addColorStop(0.5, 'rgba(160,215,235,0.25)'); glass.addColorStop(1, 'rgba(120,180,210,0.45)');
        c.fillStyle = glass; c.fillRect(15, 70, 155, 60);
        // dach dwuspadowy (szklo) z gory
        const roof = c.createLinearGradient(0, 22, 0, 70);
        roof.addColorStop(0, 'rgba(235,250,255,0.9)'); roof.addColorStop(1, 'rgba(150,205,230,0.75)');
        c.fillStyle = roof; c.beginPath(); c.moveTo(15, 70); c.lineTo(35, 22); c.lineTo(150, 22); c.lineTo(170, 70); c.closePath(); c.fill();
        c.strokeStyle = '#f4f4f4'; c.lineWidth = 2.2; // ramy
        for (let x = 15; x <= 170; x += 31) { c.beginPath(); c.moveTo(x, 70); c.lineTo(x, 130); c.stroke(); }
        for (let x = 35; x <= 150; x += 23) { c.beginPath(); c.moveTo(x, 22); c.lineTo(15 + (x - 35) * 155 / 115, 70); c.stroke(); }
        c.beginPath(); c.moveTo(35, 22); c.lineTo(150, 22); c.moveTo(15, 70); c.lineTo(170, 70); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.moveTo(45, 28); c.lineTo(60, 28); c.lineTo(42, 64); c.lineTo(28, 64); c.fill();
        c.strokeStyle = OUT; c.lineWidth = 1.6; c.strokeRect(15, 70, 155, 60);
        c.beginPath(); c.moveTo(15, 70); c.lineTo(35, 22); c.lineTo(150, 22); c.lineTo(170, 70); c.stroke();
        c.fillStyle = '#7a5030'; c.fillRect(82, 98, 20, 32); c.strokeRect(82, 98, 20, 32); // drzwi
    });
}
function wellTex(): PIXI.Texture {
    return bake('well', 80, 96, c => {
        c.fillStyle = 'rgba(18,40,10,0.35)'; c.beginPath(); c.ellipse(46, 82, 32, 10, 0, 0, Math.PI * 2); c.fill();
        const st = c.createLinearGradient(10, 0, 70, 0);
        st.addColorStop(0, '#c8c0b0'); st.addColorStop(0.5, '#9a9284'); st.addColorStop(1, '#5e574c');
        c.fillStyle = st; c.beginPath(); c.roundRect(10, 52, 60, 28, 6); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
        c.strokeStyle = 'rgba(60,55,45,0.6)'; c.lineWidth = 1;
        for (const y of [60, 70]) { c.beginPath(); c.moveTo(11, y); c.lineTo(69, y); c.stroke(); }
        c.fillStyle = '#1f3a4a'; c.beginPath(); c.ellipse(40, 52, 26, 8, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#d6d0c2'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = '#6a4220'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(18, 54); c.lineTo(18, 18); c.moveTo(62, 54); c.lineTo(62, 18); c.stroke();
        c.fillStyle = '#9a3a24'; c.beginPath(); c.moveTo(8, 22); c.lineTo(40, 4); c.lineTo(72, 22); c.lineTo(66, 26); c.lineTo(40, 12); c.lineTo(14, 26); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
        c.strokeStyle = '#8a6a40'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(40, 24); c.lineTo(40, 40); c.stroke();
        c.fillStyle = '#7a5a30'; c.fillRect(35, 40, 10, 9); c.strokeRect(35, 40, 10, 9);
    });
}
function siloTex(): PIXI.Texture {
    return bake('silo', 100, 170, c => {
        c.fillStyle = 'rgba(18,40,10,0.35)'; c.beginPath(); c.moveTo(70, 150); c.lineTo(100, 130); c.lineTo(100, 168); c.lineTo(30, 168); c.fill();
        const g = c.createLinearGradient(15, 0, 85, 0);
        g.addColorStop(0, '#f0ece4'); g.addColorStop(0.35, '#c9c3b8'); g.addColorStop(1, '#7c766c');
        c.fillStyle = g; c.fillRect(15, 40, 70, 115);
        c.fillStyle = '#c9c3b8'; c.beginPath(); c.ellipse(50, 155, 35, 9, 0, 0, Math.PI); c.fill();
        c.strokeStyle = 'rgba(90,85,75,0.55)'; c.lineWidth = 1.2;
        for (let y = 55; y < 155; y += 16) { c.beginPath(); c.moveTo(15, y); c.quadraticCurveTo(50, y + 6, 85, y); c.stroke(); }
        const dome = c.createRadialGradient(38, 24, 2, 50, 40, 40);
        dome.addColorStop(0, '#ff8a6a'); dome.addColorStop(0.6, '#c0392b'); dome.addColorStop(1, '#7a2018');
        c.fillStyle = dome; c.beginPath(); c.ellipse(50, 40, 37, 30, 0, Math.PI, 0); c.ellipse(50, 40, 37, 9, 0, 0, Math.PI); c.fill();
        c.strokeStyle = OUT; c.lineWidth = 1.5; c.strokeRect(15, 40, 70, 115);
        c.beginPath(); c.ellipse(50, 40, 37, 30, 0, Math.PI, 0); c.stroke();
        c.strokeStyle = '#5a5a5a'; c.lineWidth = 1.4; // drabina
        c.beginPath(); c.moveTo(70, 45); c.lineTo(70, 152); c.moveTo(77, 45); c.lineTo(77, 152); c.stroke();
        for (let y = 50; y < 150; y += 9) { c.beginPath(); c.moveTo(70, y); c.lineTo(77, y); c.stroke(); }
    });
}
function scarecrowTex(): PIXI.Texture {
    return bake('scarecrow', 60, 80, c => {
        c.fillStyle = 'rgba(18,40,10,0.35)'; c.beginPath(); c.ellipse(36, 74, 16, 5, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#6a4220'; c.lineWidth = 3.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(30, 76); c.lineTo(30, 22); c.moveTo(8, 36); c.lineTo(52, 36); c.stroke();
        c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(18, 32); c.lineTo(42, 32); c.lineTo(46, 60); c.lineTo(14, 60); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
        c.strokeStyle = '#7a1f16'; c.lineWidth = 1; for (const x of [22, 30, 38]) { c.beginPath(); c.moveTo(x, 33); c.lineTo(x + 1, 59); c.stroke(); }
        c.strokeStyle = '#f2cf6a'; c.lineWidth = 1.4; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(8, 36); c.lineTo(3, 33 + i * 2); c.moveTo(52, 36); c.lineTo(57, 33 + i * 2); c.stroke(); }
        const head = c.createRadialGradient(27, 18, 1, 30, 22, 10);
        head.addColorStop(0, '#fff2c0'); head.addColorStop(1, '#d9b060');
        c.fillStyle = head; c.beginPath(); c.arc(30, 22, 9, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#111'; c.beginPath(); c.arc(27, 21, 1.2, 0, Math.PI * 2); c.arc(33, 21, 1.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#6a4a20'; c.beginPath(); c.ellipse(30, 14, 15, 3.5, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(30, 10, 7, 5, 0, Math.PI, 0); c.fill();
    });
}

function solid(x: number, y: number, w: number, h: number): ICollidable { return { x, y, w, h, update: () => {} }; }

interface Duck { s: PIXI.Sprite; cx: number; cy: number; rx: number; ry: number; a: number; v: number; }

export class FarmProps {
    /** Kolizje dla czolgow (buildings). */
    readonly tankColliders: ICollidable[] = [];
    /** Kolizje dla pociskow (solidBuildings) — bez stawow. */
    readonly bulletColliders: ICollidable[] = [];
    private readonly ducks: Duck[] = [];

    constructor(world: PIXI.Container, L: FarmPropsLayout = TROPICS_FARM_PROPS_V2) {
        const add = (t: PIXI.Texture, x: number, y: number, z: number) => {
            const s = new PIXI.Sprite(t); s.x = x; s.y = y; s.zIndex = z; world.addChild(s); return s;
        };
        for (const p of L.ponds) {
            add(pondTex(), p.x - 10, p.y - 10, -84);
            this.tankColliders.push(solid(p.x + 22, p.y + 16, 136, 88)); // wnetrze tafli
            for (let i = 0; i < 3; i++) {
                const s = new PIXI.Sprite(duckTex()); s.anchor.set(0.5); s.zIndex = -83; world.addChild(s);
                this.ducks.push({ s, cx: p.x + 90, cy: p.y + 60, rx: 34 + i * 12, ry: 20 + i * 6, a: ambientRng.next() * 6.28, v: (0.006 + ambientRng.next() * 0.006) * (i % 2 ? -1 : 1) });
            }
        }
        for (const g of L.greenhouses) {
            add(greenhouseTex(), g.x - 15, g.y - 40, g.y + 110);
            const c = solid(g.x, g.y + 20, 160, 90); this.tankColliders.push(c); this.bulletColliders.push(c);
        }
        for (const w of L.wells) {
            add(wellTex(), w.x - 10, w.y - 36, w.y + 60);
            const c = solid(w.x + 2, w.y + 16, 56, 44); this.tankColliders.push(c); this.bulletColliders.push(c);
        }
        for (const s of L.silos) {
            add(siloTex(), s.x - 15, s.y - 100, s.y + 70);
            const c = solid(s.x, s.y + 10, 70, 60); this.tankColliders.push(c); this.bulletColliders.push(c);
        }
        // AGRO 2026-10-06: palmy -> gaiki drzew lisciastych (te same miejsca, kolizja czolg + pocisk)
        buildAgroGroves(world, L.palms, this.tankColliders, this.bulletColliders);
        for (const sc of L.scarecrows) {
            add(scarecrowTex(), sc.x - 10, sc.y - 30, sc.y + 46);
            const c = solid(sc.x + 12, sc.y + 32, 16, 14); this.tankColliders.push(c); this.bulletColliders.push(c);
        }
    }

    /** Kaczki plywaja po elipsach (transformy), poza kadrem bez animacji. */
    update(delta: number, camX: number, camY: number, viewW: number, viewH: number): void {
        for (const d of this.ducks) {
            d.a += d.v * delta;
            if (d.cx < camX - 150 || d.cx > camX + viewW + 150 || d.cy < camY - 150 || d.cy > camY + viewH + 150) continue;
            d.s.x = d.cx + Math.cos(d.a) * d.rx;
            d.s.y = d.cy + Math.sin(d.a) * d.ry + Math.sin(d.a * 6) * 0.8;
            d.s.scale.x = (d.v > 0 ? -Math.sin(d.a) : Math.sin(d.a)) >= 0 ? 1 : -1;
        }
    }
}
