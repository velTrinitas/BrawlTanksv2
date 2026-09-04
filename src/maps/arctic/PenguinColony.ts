import * as PIXI from 'pixi.js';
import {
    ARCTIC_PENGUIN_PATH,
    ARCTIC_PENGUIN_COUNT,
    ARCTIC_PENGUIN_SPEED,
    ARCTIC_PENGUIN_SPACING,
    ARCTIC_PENGUIN_DROP_INTERVAL_MS,
} from '../ArcticMap';

/**
 * PenguinColony — pingwiny czlapiace gesiego i gubiace gemy (ARC-R2, wzorzec: Caravan 1:1).
 *
 * Sciezka = ring wokol centrum mapy (wszystkie punkty w strefie CENTER_CLEAR layoutu
 * kostek => matematycznie GWARANTOWANE zero kolizji wizualnych z przeszkodami).
 * Ping-pong po polilinii (jak karawana), waddle-animacja (kolysanie + bob + machniecie
 * skrzydelkami). PASSABLE — zero kolizji (czolg przejezdza, pingwiny to ambient).
 *
 * Drop (wzorzec Caravan): update(delta) ZWRACA {type,x,y}|null co DROP_INTERVAL_MS —
 * main.ts robi spawnGem/Heart/Magnet + notif. Rozklad: gem 80% / serce 15% / magnes 5%.
 *
 * MOBILE-CRISP (fix pikselozy): renderer na mobile ma antialias OFF => zywe wektory
 * PIXI.Graphics pikseluja. Pingwin WYPIECZONY do tekstury Canvas 2D (AA) x4 -> Sprite
 * (wzorzec v0.74.0); animacja zostaje na transformach (waddle/flip/bob).
 */

const PENGUIN_RES = 4;                 // supersampling bake (downscale = gladkie krawedzie)
const PENGUIN_BOX = { ox: 12, oy: 17, w: 24, h: 34 } as const; // lokalne bounds rysunku

let _penguinTexture: PIXI.Texture | null = null;

/** Kreskowkowy pingwin pieczony raz (Canvas 2D z AA), wspoldzielony przez wszystkie ekipy. */
function getPenguinTexture(): PIXI.Texture {
    if (_penguinTexture) return _penguinTexture;
    const { ox, oy, w, h } = PENGUIN_BOX;
    const cv = document.createElement('canvas');
    cv.width = w * PENGUIN_RES;
    cv.height = h * PENGUIN_RES;
    const c = cv.getContext('2d')!;
    c.scale(PENGUIN_RES, PENGUIN_RES);
    c.translate(ox, oy);

    const ell = (x: number, y: number, rx: number, ry: number, fill: string): void => {
        c.fillStyle = fill;
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
    };

    // cien pod pingwinem
    ell(0, 12, 8, 3, 'rgba(21,50,61,0.22)');
    // korpus (granatowo-czarny) + brzuszek
    ell(0, 2, 8, 11, '#1c2430');
    ell(1.5, 3.5, 5, 7.5, '#f2f6f8');
    // glowa + policzek
    ell(0, -9, 5.5, 5.5, '#1c2430');
    ell(2, -8, 2.8, 3.2, '#f2f6f8');
    // oko + blik
    ell(2.5, -9, 1.1, 1.1, '#0d1218');
    ell(2.9, -9.4, 0.4, 0.4, 'rgba(255,255,255,0.9)');
    // dziob
    c.fillStyle = '#e8913a';
    c.beginPath();
    c.moveTo(5, -8.5); c.lineTo(9.5, -7.2); c.lineTo(5, -6);
    c.closePath();
    c.fill();
    // skrzydelko (profil)
    ell(-4.5, 2, 2.6, 7, '#141b26');
    // stopki
    ell(-2.5, 12.2, 3, 1.6, '#e8913a');
    ell(2.5, 12.2, 3, 1.6, '#e8913a');

    _penguinTexture = PIXI.Texture.from(cv);
    return _penguinTexture;
}

interface Penguin {
    container: PIXI.Container;
    body: PIXI.Container;
    pathProgress: number;
    walkPhase: number;
    x: number;
    y: number;
    scaleBase: number;
}

interface DropInfo {
    type: 'gem' | 'heart' | 'magnet';
    x: number;
    y: number;
}

export class PenguinColony {
    private penguins: Penguin[] = [];
    private pathSegments: Array<{ x1: number; y1: number; x2: number; y2: number; len: number }> = [];
    private totalPathLength = 0;
    private dropTimerMs = 0;

    /** path/count opcjonalne — druga ekipa (feedback Mariusza) chodzi wlasna trasa. */
    constructor(
        worldContainer: PIXI.Container,
        path: ReadonlyArray<{ x: number; y: number }> = ARCTIC_PENGUIN_PATH,
        count: number = ARCTIC_PENGUIN_COUNT,
    ) {
        // Prekomputacja segmentow polilinii
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            this.pathSegments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len });
            this.totalPathLength += len;
        }

        for (let i = 0; i < count; i++) {
            this.penguins.push(this.buildPenguin(i, worldContainer));
        }
    }

    /** Kreskowkowy pingwin (~26px) — baked Sprite (mobile-crisp), animacja na transformach. */
    private buildPenguin(index: number, worldContainer: PIXI.Container): Penguin {
        const container = new PIXI.Container();
        const body = new PIXI.Container();
        container.addChild(body);

        const sprite = new PIXI.Sprite(getPenguinTexture());
        sprite.anchor.set(PENGUIN_BOX.ox / PENGUIN_BOX.w, PENGUIN_BOX.oy / PENGUIN_BOX.h);
        sprite.scale.set(1 / PENGUIN_RES);
        body.addChild(sprite);

        const scaleBase = 0.9 + (index % 3) * 0.1; // lekka wariacja rozmiaru
        body.scale.set(scaleBase);

        worldContainer.addChild(container);

        return {
            container,
            body,
            pathProgress: -index * ARCTIC_PENGUIN_SPACING, // gesiego (stagger)
            walkPhase: index * 1.3,
            x: 0,
            y: 0,
            scaleBase,
        };
    }

    /** Pozycja na polilinii (ping-pong, wzorzec Caravan.getPathPosition). */
    private getPathPosition(progress: number): { x: number; y: number; dirX: number } {
        const period = 2 * this.totalPathLength;
        let p = progress % period;
        if (p < 0) p += period;
        const forward = p < this.totalPathLength;
        let dist = forward ? p : period - p;

        for (const seg of this.pathSegments) {
            if (dist <= seg.len) {
                const t = seg.len === 0 ? 0 : dist / seg.len;
                const x = seg.x1 + (seg.x2 - seg.x1) * t;
                const y = seg.y1 + (seg.y2 - seg.y1) * t;
                const dirX = (seg.x2 - seg.x1) * (forward ? 1 : -1);
                return { x, y, dirX };
            }
            dist -= seg.len;
        }
        const last = this.pathSegments[this.pathSegments.length - 1];
        return { x: last.x2, y: last.y2, dirX: forward ? 1 : -1 };
    }

    /** Ruch + waddle + harmonogram dropow. Zwraca drop albo null (main.ts spawnuje). */
    public update(delta: number): DropInfo | null {
        const dt = delta;

        for (const p of this.penguins) {
            p.pathProgress += ARCTIC_PENGUIN_SPEED * dt;
            p.walkPhase += 0.09 * dt;

            const pos = this.getPathPosition(p.pathProgress);
            p.x = pos.x;
            p.y = pos.y;

            // waddle: kolysanie + bob (DRAMATYCZNE, nie subtelne — sensoryka)
            const sway = Math.sin(p.walkPhase) * 0.16;
            const bob = Math.abs(Math.sin(p.walkPhase * 2)) * 2.2;

            p.container.x = pos.x;
            p.container.y = pos.y - bob;
            p.container.zIndex = pos.y + 12; // Y-sort (passable ambient)
            p.body.rotation = sway;
            p.body.scale.x = (pos.dirX >= 0 ? 1 : -1) * p.scaleBase; // flip za kierunkiem
            p.body.scale.y = p.scaleBase;
        }

        // ── drop co interval (tylko pingwiny z progress > 0 — juz "weszly") ──
        this.dropTimerMs += dt * (1000 / 60);
        if (this.dropTimerMs >= ARCTIC_PENGUIN_DROP_INTERVAL_MS) {
            this.dropTimerMs = 0;
            const eligible = this.penguins.filter(p => p.pathProgress > 0);
            if (eligible.length > 0) {
                // Z0.2 AUDIT: WORLD RNG (wybor pingwina = pozycja dropu + typ pickupu) -> seed w Z0.1
                const p = eligible[Math.floor(Math.random() * eligible.length)];
                const roll = Math.random();
                const type: DropInfo['type'] = roll < 0.80 ? 'gem' : roll < 0.95 ? 'heart' : 'magnet';
                return { type, x: p.x, y: p.y + 8 };
            }
        }
        return null;
    }
}
