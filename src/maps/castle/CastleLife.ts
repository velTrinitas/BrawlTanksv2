import * as PIXI from 'pixi.js';
import { ambientRng } from '../../systems/Rng';
import { castleNow } from './castleArtClock';
import { WALL_H } from './castleBake';
import { CASTLE_PALETTE as P } from './castlePalette';
import type { CastlePart } from './CastlePart';

/**
 * CastleLife — CASTLE ART v2, Etap C: zywy zamek (tylko wizual klienta).
 *
 * - POCHODNIE: na pieczone pochodnie bram i donzonu (castleBake.torchV2) nakladamy migoczacy plomien
 *   + oddychajacy blask + iskry (pula 10). Przy okazji czytelny znacznik bram. Brama tier >= 2 = zgaszone.
 * - STRAZNICY: 4 lucznicy chodza po koronie murow (tam i z powrotem, pauza na koncu). Mur tier >= 2
 *   = straznik znika (uciekl z wylomu) — kolejny wizualny sygnal stanu muru.
 * KOSZT: ~30 sprite'ow z 4 pieczonych tekstur, same transformy, culling po kamerze; lowFx = bez iskier.
 * Losowosc ambientRng, zegar castleNow (staje w pauzie). Zero wplywu na symulacje.
 */

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    if (c) draw(c);
    return PIXI.Texture.from(cv);
}

let tex: { flame: PIXI.Texture; glow: PIXI.Texture; spark: PIXI.Texture; guard: PIXI.Texture } | null = null;
function textures(): NonNullable<typeof tex> {
    if (tex) return tex;
    const flame = canvasTex(14, 22, (c) => {
        c.fillStyle = '#ff7a12';
        c.beginPath(); c.moveTo(1, 21); c.quadraticCurveTo(0, 9, 7, 0); c.quadraticCurveTo(14, 9, 13, 21); c.closePath(); c.fill();
        c.fillStyle = '#ffc93a';
        c.beginPath(); c.moveTo(3.5, 21); c.quadraticCurveTo(3, 12, 7, 6); c.quadraticCurveTo(11, 12, 10.5, 21); c.closePath(); c.fill();
        c.fillStyle = '#fff6c8';
        c.beginPath(); c.ellipse(7, 17, 2.5, 4, 0, 0, Math.PI * 2); c.fill();
    });
    const glow = canvasTex(64, 64, (c) => {
        const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,200,100,0.7)'); g.addColorStop(0.5, 'rgba(255,150,60,0.25)'); g.addColorStop(1, 'rgba(255,140,50,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    const spark = canvasTex(4, 4, (c) => { c.fillStyle = '#ffd36a'; c.fillRect(0, 0, 4, 4); c.fillStyle = '#fff'; c.fillRect(1, 1, 2, 2); });
    // straznik z gory: cien, plaszcz szkarlatny, ramiona, helm, luk + kolczan (patrzy w prawo, obracany)
    const guard = canvasTex(22, 22, (c) => {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(12.5, 13, 8, 6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.crimsonDark; c.beginPath(); c.ellipse(10, 11, 7, 6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.crimson; c.beginPath(); c.ellipse(10, 10.5, 6, 5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.oakDark; c.fillRect(3, 8, 3, 6); // kolczan
        c.fillStyle = '#f2f2f2'; c.fillRect(3, 7, 3, 1.5);
        c.strokeStyle = P.oak; c.lineWidth = 2; c.beginPath(); c.arc(13, 11, 6, -1.2, 1.2); c.stroke(); // luk
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(15.2, 5.4); c.lineTo(15.2, 16.6); c.stroke();
        const hg = c.createRadialGradient(9, 9, 0.5, 10, 10.5, 4.5);
        hg.addColorStop(0, '#e6e9ec'); hg.addColorStop(1, '#6d7378');
        c.fillStyle = hg; c.beginPath(); c.arc(10, 10.5, 4.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.gold; c.fillRect(9.4, 6.4, 1.2, 2);
    });
    tex = { flame, glow, spark, guard };
    return tex;
}

interface Torch { x: number; y: number; part: CastlePart; flame: PIXI.Sprite; glow: PIXI.Sprite; ph: number }
interface Spark { s: PIXI.Sprite; life: number; vx: number; vy: number }
interface Guard { part: CastlePart; s: PIXI.Sprite; horiz: boolean; a: number; b: number; fixed: number; pos: number; dir: 1 | -1; wait: number; ph: number }

export class CastleLife {
    private container: PIXI.Container;
    private torches: Torch[] = [];
    private sparks: Spark[] = [];
    private guards: Guard[] = [];
    private sparkAcc = 0;

    constructor(parts: readonly CastlePart[], parent: PIXI.Container, lowFx: boolean) {
        this.container = new PIXI.Container();
        this.container.zIndex = 6400; // nad bryla (pochodnie/straznicy NA murze), pod dymem i paskiem HP
        this.container.sortableChildren = false;
        parent.addChild(this.container);
        const T = textures();
        const addTorch = (x: number, y: number, part: CastlePart, i: number): void => {
            const glow = new PIXI.Sprite(T.glow); glow.anchor.set(0.5); glow.position.set(x, y - 7);
            const flame = new PIXI.Sprite(T.flame); flame.anchor.set(0.5, 1); flame.position.set(x, y - 2);
            this.container.addChild(glow, flame);
            this.torches.push({ x, y, part, flame, glow, ph: i * 1.7 });
        };
        let i = 0;
        for (const p of parts) {
            if (p.kind === 'gate') {
                if (p.w > p.h) { // brama pozioma (luk 64 px, pochodnie +-41 od osi)
                    const ax = p.x + p.w / 2, ty = p.y + p.h - 12;
                    addTorch(ax - 41, ty, p, i++); addTorch(ax + 41, ty, p, i++);
                } else {
                    addTorch(p.x + p.w + 4, p.y - 4, p, i++); addTorch(p.x + p.w + 4, p.y + p.h + 12, p, i++);
                }
            } else if (p.kind === 'keep') {
                addTorch(p.x + p.w / 2 - 34, p.y + p.h - 14, p, i++); addTorch(p.x + p.w / 2 + 34, p.y + p.h - 14, p, i++);
            }
        }
        if (!lowFx) for (let k = 0; k < 10; k++) {
            const s = new PIXI.Sprite(T.spark); s.anchor.set(0.5); s.visible = false;
            this.container.addChild(s);
            this.sparks.push({ s, life: 0, vx: 0, vy: 0 });
        }
        // straznicy: po jednym na bok, na koronie muru (wieko = AABB przesuniete o WALL_H w gore)
        for (const id of ['wallN_W', 'wallE_N', 'wallS_E', 'wallW_S']) {
            const p = parts.find(q => q.id === id);
            if (!p) continue;
            const horiz = p.w > p.h;
            const s = new PIXI.Sprite(T.guard); s.anchor.set(0.5); s.scale.set(1.35);
            this.container.addChild(s);
            const a = horiz ? p.x + 16 : p.y - WALL_H + 16, b = horiz ? p.x + p.w - 16 : p.y + p.h - WALL_H - 16;
            const fixed = horiz ? p.y - WALL_H + p.h / 2 : p.x + p.w / 2;
            this.guards.push({ part: p, s, horiz, a, b, fixed, pos: a + (b - a) * ambientRng.next(), dir: ambientRng.chance(0.5) ? 1 : -1, wait: 0, ph: ambientRng.next() * 6 });
        }
    }

    private spark(x: number, y: number): void {
        const sp = this.sparks.find(k => k.life <= 0);
        if (!sp) return;
        sp.s.position.set(x + ambientRng.range(-3, 3), y);
        sp.s.visible = true; sp.s.alpha = 1;
        sp.life = Math.round(ambientRng.range(30, 50));
        sp.vx = ambientRng.range(-0.25, 0.35); sp.vy = -ambientRng.range(0.5, 1.0);
    }

    /** Krok logiki (staly). view = kamera do cullingu. */
    public update(view: { x: number; y: number; w: number; h: number }): void {
        const t = castleNow() / 1000;
        const inView = (x: number, y: number) => x > view.x - 80 && x < view.x + view.w + 80 && y > view.y - 80 && y < view.y + view.h + 80;
        const live: Torch[] = [];
        for (const tc of this.torches) {
            const lit = !(tc.part.kind === 'gate' && tc.part.tier >= 2) && inView(tc.x, tc.y);
            tc.flame.visible = tc.glow.visible = lit;
            if (!lit) continue;
            live.push(tc);
            const f = Math.sin(t * 11 + tc.ph) * 0.5 + Math.sin(t * 17.3 + tc.ph * 2) * 0.5;
            tc.flame.scale.set(1 + f * 0.08, 1 + f * 0.22);
            tc.flame.skew.x = Math.sin(t * 6 + tc.ph) * 0.12;
            const br = 0.8 + Math.sin(t * 2.4 + tc.ph) * 0.12 + f * 0.06;
            tc.glow.scale.set(br * 1.15);
            tc.glow.alpha = 0.55 + f * 0.15;
        }
        if (this.sparks.length && live.length) {
            this.sparkAcc += 1;
            if (this.sparkAcc >= 9) { this.sparkAcc = 0; const tc = live[ambientRng.int(live.length)]; this.spark(tc.x, tc.y - 14); }
        }
        for (const sp of this.sparks) {
            if (sp.life <= 0) continue;
            sp.life--; sp.s.x += sp.vx; sp.s.y += sp.vy; sp.vx += Math.sin(sp.life * 0.4) * 0.02;
            sp.s.alpha = Math.min(1, sp.life / 20);
            if (sp.life <= 0) sp.s.visible = false;
        }
        for (const gd of this.guards) {
            const on = gd.part.tier < 2;
            const x = gd.horiz ? gd.pos : gd.fixed, y = gd.horiz ? gd.fixed : gd.pos;
            gd.s.visible = on && inView(x, y);
            if (!on) continue;
            if (gd.wait > 0) { gd.wait--; gd.s.scale.set(1.35); }
            else {
                gd.pos += 0.35 * gd.dir;
                if (gd.pos > gd.b || gd.pos < gd.a) { gd.pos = Math.max(gd.a, Math.min(gd.b, gd.pos)); gd.dir = gd.dir === 1 ? -1 : 1; gd.wait = 70 + ambientRng.int(90); }
                const step = Math.sin(t * 9 + gd.ph);
                gd.s.scale.set(1.35 * (1 + Math.abs(step) * 0.06), 1.35 * (1 - Math.abs(step) * 0.04)); // krok
            }
            gd.s.position.set(x, y);
            gd.s.rotation = gd.horiz ? (gd.dir === 1 ? 0 : Math.PI) : (gd.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
        }
    }

    public destroy(): void { this.container.destroy({ children: true }); }
}
