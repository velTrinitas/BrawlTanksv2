import * as PIXI from 'pixi.js';
import { bakeCrow } from './castleBake';
import { isPointInView } from '../cullGate';

/**
 * CastleCrows — 3 kruki krazace nad donzonem (OBRON ZAMEK F6, ambient klasy A).
 * 2 pieczone klatki lopotu, orbita elipsa (kamera z gory: ry = 0.6 rx), lekki
 * cien-elipsa na ziemi. Culling przez isPointInView (poza ekranem: zero pracy).
 */
export class CastleCrows {
    private container: PIXI.Container;
    private sprites: PIXI.Sprite[] = [];
    private shadows: PIXI.Graphics;
    private readonly cx: number;
    private readonly cy: number;
    private readonly frames: [PIXI.Texture, PIXI.Texture];

    constructor(cx: number, cy: number, worldContainer: PIXI.Container) {
        this.cx = cx; this.cy = cy;
        this.container = new PIXI.Container();
        this.container.zIndex = 5200; // nad dachami i proporcami
        worldContainer.addChild(this.container);
        this.shadows = new PIXI.Graphics();
        this.shadows.zIndex = 6;
        worldContainer.addChild(this.shadows);
        this.frames = [bakeCrow(0), bakeCrow(1)];
        for (let i = 0; i < 3; i++) {
            const s = new PIXI.Sprite(this.frames[0]);
            s.anchor.set(0.5);
            this.container.addChild(s);
            this.sprites.push(s);
        }
    }

    public update(camX: number, camY: number, viewW: number, viewH: number): void {
        const visible = isPointInView(this.cx, this.cy, camX, camY, viewW, viewH, 260);
        this.container.renderable = visible;
        this.shadows.renderable = visible;
        if (!visible) return;
        const t = Date.now() / 1000;
        this.shadows.clear();
        this.shadows.beginFill(0x000000, 0.14);
        for (let i = 0; i < 3; i++) {
            const a = t * (0.45 + i * 0.07) + i * 2.1;
            const rx = 150 + i * 28, ry = rx * 0.6;
            const x = this.cx + Math.cos(a) * rx, y = this.cy - 120 + Math.sin(a) * ry;
            const s = this.sprites[i];
            s.x = x; s.y = y;
            s.rotation = a + Math.PI / 2;
            s.texture = this.frames[Math.floor(t * 6 + i) % 2];
            s.scale.set(0.9 + i * 0.1);
            this.shadows.drawEllipse(x + 26, y + 150, 9, 3);
        }
        this.shadows.endFill();
    }

    public destroy(): void {
        this.container.destroy({ children: true });
        this.shadows.destroy();
    }
}
