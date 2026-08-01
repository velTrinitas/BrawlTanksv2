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
 */

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

    constructor(worldContainer: PIXI.Container) {
        // Prekomputacja segmentow polilinii
        for (let i = 0; i < ARCTIC_PENGUIN_PATH.length - 1; i++) {
            const a = ARCTIC_PENGUIN_PATH[i];
            const b = ARCTIC_PENGUIN_PATH[i + 1];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            this.pathSegments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len });
            this.totalPathLength += len;
        }

        for (let i = 0; i < ARCTIC_PENGUIN_COUNT; i++) {
            this.penguins.push(this.buildPenguin(i, worldContainer));
        }
    }

    /** Kreskowkowy pingwin (~26px): czarny korpus, bialy brzuszek, dziob+stopki orange. */
    private buildPenguin(index: number, worldContainer: PIXI.Container): Penguin {
        const container = new PIXI.Container();
        const body = new PIXI.Container();
        container.addChild(body);

        const g = new PIXI.Graphics();
        body.addChild(g);

        // cien pod pingwinem
        g.beginFill(0x15323d, 0.22);
        g.drawEllipse(0, 12, 8, 3);
        g.endFill();

        // korpus (granatowo-czarny)
        g.beginFill(0x1c2430);
        g.drawEllipse(0, 2, 8, 11);
        g.endFill();
        // brzuszek
        g.beginFill(0xf2f6f8);
        g.drawEllipse(1.5, 3.5, 5, 7.5);
        g.endFill();
        // glowa
        g.beginFill(0x1c2430);
        g.drawCircle(0, -9, 5.5);
        g.endFill();
        // policzek (biala plamka twarzy)
        g.beginFill(0xf2f6f8);
        g.drawEllipse(2, -8, 2.8, 3.2);
        g.endFill();
        // oko
        g.beginFill(0x0d1218);
        g.drawCircle(2.5, -9, 1.1);
        g.endFill();
        g.beginFill(0xffffff, 0.9);
        g.drawCircle(2.9, -9.4, 0.4);
        g.endFill();
        // dziob
        g.beginFill(0xe8913a);
        g.drawPolygon([5, -8.5, 9.5, -7.2, 5, -6]);
        g.endFill();
        // skrzydelko (widoczne jedno — profil)
        g.beginFill(0x141b26);
        g.drawEllipse(-4.5, 2, 2.6, 7);
        g.endFill();
        // stopki
        g.beginFill(0xe8913a);
        g.drawEllipse(-2.5, 12.2, 3, 1.6);
        g.drawEllipse(2.5, 12.2, 3, 1.6);
        g.endFill();

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
                const p = eligible[Math.floor(Math.random() * eligible.length)];
                const roll = Math.random();
                const type: DropInfo['type'] = roll < 0.80 ? 'gem' : roll < 0.95 ? 'heart' : 'magnet';
                return { type, x: p.x, y: p.y + 8 };
            }
        }
        return null;
    }
}
