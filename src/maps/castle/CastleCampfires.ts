import * as PIXI from 'pixi.js';
import { CASTLE_CAMPS } from '../CastleMap';
import { isPointInView } from '../cullGate';

/**
 * CastleCampfires — animowany ogien w ogniskach obozow (transza 2 artu Zamku, v0.195.0).
 *
 * Krag kamieni, polana i zar zostaja WPIECZONE w grunt (castlePainters.drawCampfire).
 * Tu dochodzi tylko to, co musi sie ruszac: jezyki ognia, mala ciepla poswiata i iskry.
 *
 * Koszt (mobile): 4 ogniska x (1 poswiata + 2 plomienie + 3 iskry) = 24 sprite'y,
 * 3 male tekstury pieczone raz (cache modulu). Animacja wylacznie transformami.
 * Poswiata ADD ma promien 24 px — celowo mala (fill-rate), zadnych duzych glow.
 * Poza kadrem `renderable = false` i zero pracy.
 */

/** Tekstury w 2x (ostre na DPR 2), sprite skalowany o polowe. */
const RES = 2;
const texCache = new Map<string, PIXI.Texture>();

function baked(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): PIXI.Texture {
    const hit = texCache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = w * RES; cv.height = h * RES;
    const c = cv.getContext('2d');
    if (!c) return PIXI.Texture.WHITE;
    c.scale(RES, RES);
    draw(c);
    const tex = PIXI.Texture.from(cv);
    texCache.set(key, tex);
    return tex;
}

/** Jezyk ognia: kropla z ostrym czubkiem, gradient zolty rdzen -> pomarancz -> czerwien. */
function bakeFlame(key: string, w: number, h: number): PIXI.Texture {
    return baked(key, w, h, (c) => {
        const cx = w / 2;
        const shape = (inset: number): void => {
            c.beginPath();
            c.moveTo(cx, inset);                                              // czubek
            c.bezierCurveTo(cx + w * 0.18, h * 0.35, w - inset, h * 0.55, w - inset, h * 0.75);
            c.arc(cx, h * 0.75, w / 2 - inset, 0, Math.PI);                  // okragla podstawa
            c.bezierCurveTo(inset, h * 0.55, cx - w * 0.18, h * 0.35, cx, inset);
            c.closePath();
        };
        let g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(200,40,10,0.0)');
        g.addColorStop(0.25, 'rgba(220,60,15,0.85)');
        g.addColorStop(0.7, '#ff8a1c');
        g.addColorStop(1, '#ffb13a');
        c.fillStyle = g;
        shape(0.5);
        c.fill();
        // rdzen: jasnozolty, mniejszy, nisko
        g = c.createLinearGradient(0, h * 0.3, 0, h);
        g.addColorStop(0, 'rgba(255,230,120,0)');
        g.addColorStop(0.5, 'rgba(255,236,150,0.9)');
        g.addColorStop(1, '#fff6c8');
        c.fillStyle = g;
        c.save();
        c.translate(cx, h);
        c.scale(0.55, 0.62);
        c.translate(-cx, -h);
        shape(0.5);
        c.fill();
        c.restore();
    });
}

function bakeGlow(): PIXI.Texture {
    return baked('glow', 48, 48, (c) => {
        const g = c.createRadialGradient(24, 24, 2, 24, 24, 24);
        g.addColorStop(0, 'rgba(255,170,70,0.55)');
        g.addColorStop(0.5, 'rgba(255,120,40,0.2)');
        g.addColorStop(1, 'rgba(255,100,30,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 48, 48);
    });
}

function bakeSpark(): PIXI.Texture {
    return baked('spark', 6, 6, (c) => {
        const g = c.createRadialGradient(3, 3, 0, 3, 3, 3);
        g.addColorStop(0, '#fff3b0');
        g.addColorStop(0.6, 'rgba(255,150,40,0.9)');
        g.addColorStop(1, 'rgba(255,100,20,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 6, 6);
    });
}

const SPARKS_PER_FIRE = 3;
/** Czas zycia iskry w sekundach (cykliczny — iskra "odradza sie" u podstawy). */
const SPARK_LIFE = 1.1;

interface Fire {
    x: number; y: number;         // srodek zaru (jak w bake: drawCampfire(x, y), zar w y - 4)
    phase: number;
    glow: PIXI.Sprite;
    flames: PIXI.Sprite[];
    sparks: PIXI.Sprite[];
    sparkDx: number[];
}

export class CastleCampfires {
    private fires: Fire[] = [];

    constructor(worldContainer: PIXI.Container) {
        const flameA = bakeFlame('flameA', 18, 30);
        const flameB = bakeFlame('flameB', 12, 20);
        const glowTex = bakeGlow();
        const sparkTex = bakeSpark();
        CASTLE_CAMPS.forEach((camp, idx) => {
            // Kotwica 1:1 z bake'u (CastleMap: drawCampfire(c, rng, cx, cy + 22))
            const x = camp.x + camp.w / 2;
            const y = camp.y + camp.h / 2 + 22;
            const z = y + 10; // obozy sa passable — czolg przed ogniskiem ma je zaslaniac

            const glow = new PIXI.Sprite(glowTex);
            glow.anchor.set(0.5);
            glow.x = x; glow.y = y - 4;
            glow.scale.set(1 / RES);
            glow.blendMode = PIXI.BLEND_MODES.ADD;
            glow.zIndex = z;
            worldContainer.addChild(glow);

            const flames = [flameA, flameB].map((tex, i) => {
                const s = new PIXI.Sprite(tex);
                s.anchor.set(0.5, 0.92); // podstawa plomienia w zarze
                s.x = x + (i === 0 ? -1 : 4);
                s.y = y - 1;
                s.scale.set(1 / RES);
                s.zIndex = z + 1 + i;
                worldContainer.addChild(s);
                return s;
            });

            const sparks: PIXI.Sprite[] = [];
            const sparkDx: number[] = [];
            for (let i = 0; i < SPARKS_PER_FIRE; i++) {
                const s = new PIXI.Sprite(sparkTex);
                s.anchor.set(0.5);
                s.scale.set(1 / RES);
                s.zIndex = z + 3;
                worldContainer.addChild(s);
                sparks.push(s);
                sparkDx.push((i - 1) * 5);
            }

            this.fires.push({ x, y, phase: idx * 2.1, glow, flames, sparks, sparkDx });
        });
    }

    public update(camX: number, camY: number, viewW: number, viewH: number): void {
        const t = Date.now() / 1000; // ten sam zegar co CastlePennants / CastleCampFlags
        for (const f of this.fires) {
            const visible = isPointInView(f.x, f.y, camX, camY, viewW, viewH, 40);
            f.glow.renderable = visible;
            for (const s of f.flames) s.renderable = visible;
            for (const s of f.sparks) s.renderable = visible;
            if (!visible) continue;

            const p = f.phase;
            // Poswiata oddycha wolno — ogien "zyje", ale bez stroboskopu
            const breathe = 0.85 + Math.sin(t * 3.1 + p) * 0.1 + Math.sin(t * 7.3 + p) * 0.05;
            f.glow.alpha = breathe;
            f.glow.scale.set((1 / RES) * (0.95 + breathe * 0.1));

            // Plomienie: niezalezny flicker wysokosci/szerokosci + lekki skos (wiatr)
            for (let i = 0; i < f.flames.length; i++) {
                const s = f.flames[i];
                const q = p + i * 1.7;
                const hK = 0.8 + Math.sin(t * 9 + q) * 0.12 + Math.sin(t * 13.7 + q * 2) * 0.08;
                const wK = 0.95 + Math.sin(t * 7.1 + q) * 0.08;
                s.scale.set((1 / RES) * wK, (1 / RES) * hK);
                s.skew.x = Math.sin(t * 2.3 + q) * 0.12;
                s.alpha = 0.88 + Math.sin(t * 11 + q) * 0.12;
            }

            // Iskry: cykl zycia z przesunieta faza — wznosza sie, dryfuja, gasna
            for (let i = 0; i < f.sparks.length; i++) {
                const s = f.sparks[i];
                const life = ((t + p + i * (SPARK_LIFE / SPARKS_PER_FIRE)) % SPARK_LIFE) / SPARK_LIFE;
                s.x = f.x + f.sparkDx[i] + Math.sin(t * 4 + i * 2 + p) * 3 * life;
                s.y = f.y - 8 - life * 34;
                s.alpha = life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.85;
            }
        }
    }

    public destroy(): void {
        for (const f of this.fires) {
            f.glow.destroy();
            for (const s of f.flames) s.destroy();
            for (const s of f.sparks) s.destroy();
        }
        this.fires = [];
    }
}
