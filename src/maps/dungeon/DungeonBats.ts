import * as PIXI from 'pixi.js';

/**
 * DungeonBats — nietoperze pod sufitem LOCHOW (SAVE THE QUEEN Q5, wzorzec CastleCrows).
 * 6 czarnych sylwetek 2-klatkowych (swap skrzydel co ~90 ms) na kontenerze always-on-top.
 * Zwykle: spia na scianach (widoczne jako male czarne kropki przy ramce) i co ~20 s jedna
 * grupa robi przelot lukiem przez sale. PANIKA: zrywaja sie WSZYSTKIE naraz (burst()).
 * Koszt ~0: 6 sprite'ow, jedna tekstura x2 klatki, cull do kamery.
 */

interface Bat { sprite: PIXI.Sprite; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; active: boolean; phase: number }

let _frames: [PIXI.Texture, PIXI.Texture] | null = null;
function bakeBat(frame: number): PIXI.Texture {
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 22;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#0b0710';
    const up = frame === 0;
    c.beginPath(); c.moveTo(20, 12);
    c.quadraticCurveTo(12, up ? 0 : 14, 2, up ? 4 : 18); c.quadraticCurveTo(8, up ? 10 : 12, 12, 14);
    c.lineTo(20, 18); c.lineTo(28, 14);
    c.quadraticCurveTo(32, up ? 10 : 12, 38, up ? 4 : 18); c.quadraticCurveTo(28, up ? 0 : 14, 20, 12); c.fill();
    c.beginPath(); c.arc(20, 11, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff5fb0'; c.fillRect(18, 10, 1.5, 1.5); c.fillRect(21, 10, 1.5, 1.5); // oczka (magenta — para z palety)
    return PIXI.Texture.from(cv);
}

export class DungeonBats {
    private readonly container: PIXI.Container;
    private readonly bats: Bat[] = [];
    private nextFlightIn = 8 * 60;
    private t = 0;
    private readonly perches: { x: number; y: number }[];

    constructor(worldContainer: PIXI.Container, perches: { x: number; y: number }[]) {
        this.perches = perches;
        this.container = new PIXI.Container();
        this.container.zIndex = 30000; // pod sufitem: nad wszystkim
        worldContainer.addChild(this.container);
        if (!_frames) _frames = [bakeBat(0), bakeBat(1)];
        for (let i = 0; i < 6; i++) {
            const p = perches[i % perches.length];
            const s = new PIXI.Sprite(_frames[0]); s.anchor.set(0.5); s.scale.set(0.7); s.x = p.x; s.y = p.y;
            this.container.addChild(s);
            this.bats.push({ sprite: s, x0: p.x, y0: p.y, x1: p.x, y1: p.y, t: 0, dur: 1, active: false, phase: i * 0.4 });
        }
    }

    private launch(b: Bat, toIdx: number): void {
        const to = this.perches[toIdx % this.perches.length];
        b.x0 = b.sprite.x; b.y0 = b.sprite.y; b.x1 = to.x; b.y1 = to.y;
        b.t = 0; b.dur = 3.2 + Math.abs(to.x - b.x0) / 900; b.active = true;
    }

    /** PANIKA: wszystkie zrywaja sie naraz. */
    public burst(): void { this.bats.forEach((b, i) => this.launch(b, i + 3)); this.nextFlightIn = 20 * 60; }

    public update(delta: number, camX: number, camY: number, viewW: number, viewH: number): void {
        this.t += delta / 60;
        this.nextFlightIn -= delta;
        if (this.nextFlightIn <= 0) { this.nextFlightIn = 20 * 60; const i = Math.floor(this.t) % this.bats.length; this.launch(this.bats[i], i + 2); if (this.bats[(i + 1) % 6]) this.launch(this.bats[(i + 1) % 6], i + 4); }
        for (const b of this.bats) {
            const s = b.sprite;
            if (!b.active) { s.renderable = s.x > camX - 40 && s.x < camX + viewW + 40 && s.y > camY - 40 && s.y < camY + viewH + 40; s.texture = _frames![0]; s.scale.set(0.7); continue; }
            b.t += delta / 60;
            const k = Math.min(1, b.t / b.dur);
            // luk przez sale (kontrolny punkt = srodek + wychylenie ku srodkowi mapy)
            const mx = (b.x0 + b.x1) / 2 + (1500 - (b.x0 + b.x1) / 2) * 0.5, my = (b.y0 + b.y1) / 2 + (1500 - (b.y0 + b.y1) / 2) * 0.5;
            const u = 1 - k;
            s.x = u * u * b.x0 + 2 * u * k * mx + k * k * b.x1;
            s.y = u * u * b.y0 + 2 * u * k * my + k * k * b.y1 + Math.sin(b.t * 9 + b.phase) * 6;
            s.texture = _frames![Math.floor(b.t * 11 + b.phase) % 2];
            s.scale.set(1.0);
            s.scale.x = b.x1 >= b.x0 ? 1 : -1;
            s.renderable = s.x > camX - 60 && s.x < camX + viewW + 60 && s.y > camY - 60 && s.y < camY + viewH + 60;
            if (k >= 1) { b.active = false; }
        }
    }

    public destroy(): void { this.container.destroy({ children: true }); }
}
