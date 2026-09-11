import * as PIXI from 'pixi.js';
import { bakeDoorLeaf } from './castleBake';

/**
 * CastleDebris — odlatujace skrzydla wrot po wylamaniu bramy (OBRON ZAMEK F6).
 * 2 sprite'y z fizyka "rzutu" (vx/vy, grawitacja na osi ekranu, obrot, zanik).
 * Zywe ~1.2 s, potem usuniete. Klasa A (2 sprite'y, transformy).
 */
interface Piece { s: PIXI.Sprite; vx: number; vy: number; vz: number; z: number; rot: number; life: number }

export class CastleDebris {
    private container: PIXI.Container;
    private pieces: Piece[] = [];

    constructor(worldContainer: PIXI.Container) {
        this.container = new PIXI.Container();
        this.container.zIndex = 5100;
        worldContainer.addChild(this.container);
    }

    /** Wrota rozlatuja sie z (x,y) na boki (dir = +1/-1 = w prawo/lewo) i "w gore" (z). */
    public burstDoors(x: number, y: number): void {
        const tex = bakeDoorLeaf();
        for (const dir of [-1, 1]) {
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.x = x + dir * 16; s.y = y;
            s.scale.set(1.3);
            this.container.addChild(s);
            this.pieces.push({ s, vx: dir * (2.2 + Math.random() * 1.2), vy: 1.4 + Math.random() * 0.8, vz: 7 + Math.random() * 3, z: 0, rot: dir * (0.18 + Math.random() * 0.1), life: 75 });
        }
    }

    public update(delta: number): void {
        for (let i = this.pieces.length - 1; i >= 0; i--) {
            const p = this.pieces[i];
            p.life -= delta;
            p.vz -= 0.45 * delta;
            p.z += p.vz * delta;
            if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.35; p.vx *= 0.7; p.vy *= 0.7; }
            p.s.x += p.vx * delta;
            p.s.y += p.vy * delta - (p.vz > 0 ? 0 : 0);
            p.s.rotation += p.rot * delta;
            // "wysokosc" = przesuniecie ekranowe w gore + skala
            p.s.pivot.y = p.z * 0.9;
            p.s.scale.set(1.3 + p.z * 0.006);
            if (p.life < 20) p.s.alpha = p.life / 20;
            if (p.life <= 0) { p.s.destroy(); this.pieces.splice(i, 1); }
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
        this.pieces = [];
    }
}
