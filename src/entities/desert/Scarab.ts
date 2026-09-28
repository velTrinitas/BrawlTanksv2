import * as PIXI from 'pixi.js';
import { bakeToSprite } from '../../maps/propBaker';
import { DESERT_CURSE } from '../../config/desertCurse';

/**
 * Scarab — DESERT ART v2 / E4. Skarabeusz ze stada mumii.
 *
 * Stany: follow (idzie przy mumii) -> chase (zygzakiem na gracza) -> attached
 * (orbituje na kadlubie, zadaje obrazenia) -> regroup (odlecial po 4 s / dashu).
 * 1 trafienie = smierc. Zygzak z indeksu i licznika krokow (bez RNG, bez zegara).
 * Art: 3 klatki nozek pieczone raz, czarno-szary pancerz z opalizujacym polyskiem.
 */

const FRAMES = 3;
let _frames: PIXI.Texture[] | null = null;
let _anchor = { x: 0.5, y: 0.5 };

function drawFrame(g: PIXI.Graphics, f: number): void {
    const leg = [-1.5, 0, 1.5][f];
    g.beginFill(0x000000, 0.25);
    g.drawEllipse(1.5, 1.5, 7, 5);
    g.endFill();
    g.lineStyle(1.3, 0x1a1a1a, 1);
    for (let i = -1; i <= 1; i++) {
        const o = i * 3.2;
        const s = (i === 0 ? -leg : leg);
        g.moveTo(o, -3); g.lineTo(o + s, -7.5);
        g.moveTo(o, 3); g.lineTo(o - s, 7.5);
    }
    g.lineStyle(0);
    // Pancerz (glowa w +X)
    g.beginFill(0x2a2a30);
    g.drawEllipse(-0.5, 0, 6.5, 4.8);
    g.endFill();
    g.beginFill(0x1a1a1e);
    g.drawEllipse(6, 0, 2.6, 2.4);
    g.endFill();
    // Szew pokryw + opalizujacy polysk (zielono-niebieski)
    g.lineStyle(0.8, 0x0a0a0a, 0.9);
    g.moveTo(-6.5, 0); g.lineTo(3.5, 0);
    g.lineStyle(0);
    g.beginFill(0x3ad0a0, 0.55);
    g.drawEllipse(-2, -2.2, 3.2, 1.3);
    g.endFill();
    g.beginFill(0x6a8aff, 0.4);
    g.drawEllipse(-1, 2.2, 2.6, 1);
    g.endFill();
}

function getFrames(): PIXI.Texture[] | null {
    if (_frames && _frames.every(t => !t.destroyed)) return _frames;
    const out: PIXI.Texture[] = [];
    for (let f = 0; f < FRAMES; f++) {
        const g = new PIXI.Graphics();
        g.beginFill(0x000000, 0.001);
        g.drawRect(-10, -10, 20, 20);
        g.endFill();
        drawFrame(g, f);
        const spr = bakeToSprite(g, `curse_scarab:${f}`);
        g.destroy();
        if (!spr) return null;
        _anchor = { x: spr.anchor.x, y: spr.anchor.y };
        out.push(spr.texture);
    }
    _frames = out;
    return out;
}

export type ScarabState = 'follow' | 'chase' | 'attached' | 'orbit' | 'regroup' | 'flee' | 'burrow';
export type ScarabResolver = (x: number, y: number, r: number) => { x: number; y: number };

export class Scarab {
    public x: number;
    public y: number;
    public alive = true;
    public state: ScarabState = 'follow';

    private idx: number;
    private stateSteps = 0;
    private hullAngle = 0;
    private orbitAngle = 0;
    private flingX = 0;
    private flingY = 0;
    private anim = 0;
    private sprite: PIXI.Sprite;

    constructor(x: number, y: number, idx: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.idx = idx;
        const frames = getFrames();
        this.sprite = new PIXI.Sprite(frames ? frames[0] : PIXI.Texture.EMPTY);
        this.sprite.anchor.set(_anchor.x, _anchor.y);
        this.sprite.scale.set(1.3);
        worldContainer.addChild(this.sprite);
        this.sync(0);
    }

    /**
     * Krok logiki. `px/py` = gracz (null gdy go nie ma), `mx/my` = mumia (przewodnik),
     * `leashOk` = gracz jest w zasiegu klatwy. Zwraca true, gdy wlasnie sie przykleil.
     */
    public step(
        step: number, px: number | null, py: number | null, mx: number, my: number, canAttach: boolean,
        resolve: ScarabResolver,
    ): boolean {
        if (!this.alive) return false;
        this.stateSteps++;
        this.anim++;
        let attachedNow = false;
        const C = DESERT_CURSE;
        const move = (nx: number, ny: number) => {
            const p = resolve(nx, ny, C.scarabBodyRadius);
            this.x = p.x; this.y = p.y;
        };

        if (this.state === 'flee') {
            move(this.x + this.flingX, this.y + this.flingY);
            if (this.stateSteps >= C.scarabFleeSteps) this.setState('burrow');
            this.sync(Math.atan2(this.flingY, this.flingX));
            return false;
        }
        if (this.state === 'burrow') {
            // Wkopywanie: kreci sie i zapada w piasek (skala -> 0)
            const k = 1 - this.stateSteps / C.scarabBurrowSteps;
            this.sprite.scale.set(1.3 * Math.max(0, k));
            this.sprite.rotation += 0.5;
            if (k <= 0) this.kill();
            return false;
        }

        if (this.state === 'attached') {
            if (px === null || py === null) { this.detach(0, 0); return false; }
            this.hullAngle += 0.12;
            this.x = px + Math.cos(this.hullAngle) * 20;
            this.y = py + Math.sin(this.hullAngle) * 14;
            if (this.stateSteps >= C.stickSteps) this.detach(px, py);
            this.sync(Math.atan2(Math.cos(this.hullAngle), -Math.sin(this.hullAngle)));
            return false;
        }

        if (this.state === 'regroup') {
            move(this.x + this.flingX, this.y + this.flingY);
            this.flingX *= 0.9; this.flingY *= 0.9;
            if (this.stateSteps >= C.regroupSteps) this.setState('follow');
            this.sync(Math.atan2(this.flingY, this.flingX));
            return false;
        }

        // ORBITA (uwaga Mariusza): krazacy okrazaja czolg w pierscieniu; gdy czolg odjedzie
        // za daleko, wracaja do poscigu.
        if (this.state === 'orbit') {
            if (px === null || py === null) { this.setState('follow'); return false; }
            const R = C.orbitRadius + (this.idx % 4) * 9 + Math.sin(step * 0.07 + this.idx) * 6;
            this.orbitAngle += (this.idx % 3 === 0 ? -1 : 1) * 0.045;
            const tx = px + Math.cos(this.orbitAngle) * R;
            const ty = py + Math.sin(this.orbitAngle) * R * 0.75;
            const dx = tx - this.x, dy = ty - this.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.5) {
                const sp = Math.min(C.orbitSpeed, d);
                move(this.x + (dx / d) * sp, this.y + (dy / d) * sp);
            }
            if (Math.hypot(px - this.x, py - this.y) > R + 120) this.setState('chase');
            this.sync(Math.atan2(dy, dx));
            return false;
        }

        // FOLLOW (przy mumii) / CHASE — skarabeusze szukaja gracza na CALEJ mapie (bez smyczy).
        // Szyk wokol mumii: katy ROWNO na okregu. `canAttach` = czy jest wolne miejsce na kadlubie.
        const slot = (this.idx / C.scarabCount) * Math.PI * 2 + step * 0.02;
        let tx = mx + Math.cos(slot) * 34;
        let ty = my + 6 + Math.sin(slot) * 20;
        if (px !== null && py !== null) {
            if (this.state !== 'chase') this.setState('chase');
            tx = px; ty = py;
        } else if (this.state === 'chase') {
            this.setState('follow');
        }
        const dx = tx - this.x, dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        const speed = this.state === 'chase' ? C.scarabSpeed : Math.min(C.scarabSpeed, Math.max(0, d - 2) * 0.2 + C.mummySpeed);
        if (d > 0.5) {
            const ux = dx / d, uy = dy / d;
            const zig = this.state === 'chase' ? Math.sin(step * 0.35 + this.idx * 2.1) * 0.9 : 0;
            move(this.x + (ux - uy * zig) * speed, this.y + (uy + ux * zig) * speed);
        }
        if (this.state === 'chase' && px !== null && py !== null) {
            const dp = Math.hypot(px - this.x, py - this.y);
            const climber = this.idx % 2 === 0;                 // polowa wspina sie, polowa krazy
            if (climber && canAttach && dp < C.attachRange) {
                this.setState('attached');
                this.hullAngle = Math.atan2(this.y - py, this.x - px);
                attachedNow = true;
            } else if ((!climber || !canAttach) && dp < C.orbitRadius + 40) {
                this.setState('orbit');
                this.orbitAngle = Math.atan2(this.y - py, this.x - px);
            }
        }
        this.sync(Math.atan2(dy, dx));
        return attachedNow;
    }

    /** Odpadniecie (czas / dash): odlatuje od srodka czolgu. */
    public detach(px: number, py: number): void {
        const ax = this.x - px, ay = this.y - py;
        const l = Math.hypot(ax, ay) || 1;
        this.flingX = (ax / l) * 6;
        this.flingY = (ay / l) * 6;
        this.setState('regroup');
    }

    /**
     * Mumia padla: parzyste uciekaja od niej i potem sie zakopuja, nieparzyste
     * zakopuja sie od razu (uwaga Mariusza: „uciekaja lub wkopuja sie w piasek").
     */
    public scatter(fromX: number, fromY: number): void {
        if (!this.alive) return;
        if (this.idx % 2 === 0) {
            const ax = this.x - fromX, ay = this.y - fromY;
            const l = Math.hypot(ax, ay) || 1;
            this.flingX = (ax / l) * DESERT_CURSE.scarabSpeed * 1.2;
            this.flingY = (ay / l) * DESERT_CURSE.scarabSpeed * 1.2;
            this.setState('flee');
        } else {
            this.setState('burrow');
        }
    }

    public get isBurrowing(): boolean {
        return this.state === 'burrow' || this.state === 'flee';
    }

    private setState(s: ScarabState): void {
        this.state = s;
        this.stateSteps = 0;
    }

    public kill(): void {
        this.alive = false;
        this.sprite.visible = false;
    }

    private sync(angle: number): void {
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.rotation = angle;
        this.sprite.zIndex = this.state === 'attached' ? this.y + 40 : this.y + 2;
        const frames = _frames;
        if (frames) this.sprite.texture = frames[Math.floor(this.anim / 3) % FRAMES];
    }

    public destroy(): void {
        this.sprite.destroy();
    }
}
