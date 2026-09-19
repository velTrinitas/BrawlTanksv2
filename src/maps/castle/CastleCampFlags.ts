import * as PIXI from 'pixi.js';
import { CASTLE_CAMPS } from '../CastleMap';
import { CASTLE_PALETTE as P } from './castlePalette';
import { isPointInView } from '../cullGate';

/**
 * CastleCampFlags — lopoczace flagi obozow najezdzcow (B3, v0.194.0).
 *
 * Do v0.193.0 proporce namiotow, sztandar obozu i czerwone szmaty na palach byly
 * WPIECZONE w grunt 3000x3000, wiec staly sztywno. Teraz w bake zostaja same MASZTY
 * (castlePainters.drawTent / drawWarBanner), a plotno to sprite animowany tym samym
 * mechanizmem co CastlePennants: skew.y + scale.x, wylacznie transformy.
 *
 * Koszt: 3 male tekstury (pieczone raz, cache modulu) + 20 sprite'ow (4 obozy x 5),
 * poza kadrem `renderable = false` i zero pracy. zIndex = podstawa masztu, bo obozy sa
 * passable — czolg przejezdzajacy przed masztem ma go zaslaniac, a nie odwrotnie.
 */

type FlagKind = 'tent' | 'banner' | 'rag';

interface FlagAnchor { x: number; y: number; baseY: number; kind: FlagKind }

/** Tekstury pieczone w 2x (ostre na DPR 2), sprite skalowany o polowe. */
const RES = 2;
const texCache = new Map<FlagKind, PIXI.Texture>();

function bakeFlag(kind: FlagKind): PIXI.Texture {
    const hit = texCache.get(kind);
    if (hit) return hit;
    const w = kind === 'banner' ? 24 : kind === 'tent' ? 18 : 12;
    const h = kind === 'banner' ? 30 : kind === 'tent' ? 11 : 8;
    const cv = document.createElement('canvas');
    cv.width = w * RES; cv.height = h * RES;
    const c = cv.getContext('2d');
    if (!c) return PIXI.Texture.WHITE;
    c.scale(RES, RES);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#d9473a'); g.addColorStop(1, '#8e2419');
    c.fillStyle = g;
    c.strokeStyle = 'rgba(40,10,5,0.6)';
    c.lineWidth = 1;
    c.beginPath();
    if (kind === 'tent') {
        c.moveTo(0, 0.5); c.lineTo(w - 1, h / 2); c.lineTo(0, h - 0.5);
    } else if (kind === 'banner') {
        // jaskolczy ogon — czyta sie jak sztandar, nie jak tabliczka
        c.moveTo(0, 0.5); c.lineTo(w - 0.5, 0.5); c.lineTo(w - 0.5, h - 0.5); c.lineTo(w * 0.55, h - 7); c.lineTo(0, h - 0.5);
    } else {
        c.moveTo(0, 0.5); c.lineTo(w - 1, 1.5); c.lineTo(w - 3, h / 2); c.lineTo(w - 0.5, h - 1); c.lineTo(0, h - 0.5);
    }
    c.closePath();
    c.fill();
    c.stroke();
    if (kind === 'banner') {
        c.fillStyle = '#1a1a1a';
        c.beginPath(); c.moveTo(11, 5); c.lineTo(18, 19); c.lineTo(4, 19); c.closePath(); c.fill();
        c.fillStyle = P.gold;
        c.fillRect(0, 0, 2, h - 1); // drzewce-rant: plotno "przyszyte" do masztu
    }
    const tex = PIXI.Texture.from(cv);
    texCache.set(kind, tex);
    return tex;
}

/** Kotwice 1:1 z geometrii bake'u (CastleMap.buildCastleTexture, sekcja 10). */
function campAnchors(): FlagAnchor[] {
    const out: FlagAnchor[] = [];
    for (const camp of CASTLE_CAMPS) {
        const cx = camp.x + camp.w / 2, cy = camp.y + camp.h / 2;
        for (const tx of [cx - 52, cx + 52]) {
            const ty = cy - 8;
            out.push({ x: tx, y: ty - 29, baseY: ty + 15, kind: 'tent' });
        }
        const bx = cx - 4, by = cy - 30;
        out.push({ x: bx + 1, y: by - 33, baseY: by, kind: 'banner' });
        for (const px of [cx - 80, cx + 80]) {
            const py = cy + 30;
            out.push({ x: px, y: py - 22.5, baseY: py, kind: 'rag' });
        }
    }
    return out;
}

export class CastleCampFlags {
    private sprites: PIXI.Sprite[];
    private anchors: FlagAnchor[];

    constructor(worldContainer: PIXI.Container) {
        this.anchors = campAnchors();
        this.sprites = this.anchors.map(a => {
            const s = new PIXI.Sprite(bakeFlag(a.kind));
            s.anchor.set(0, 0.5);
            s.x = a.x; s.y = a.y;
            s.scale.set(1 / RES);
            s.zIndex = a.baseY;
            worldContainer.addChild(s);
            return s;
        });
    }

    public update(camX: number, camY: number, viewW: number, viewH: number): void {
        const t = Date.now() / 1000; // ten sam zegar co CastlePennants (spojny lopot)
        for (let i = 0; i < this.sprites.length; i++) {
            const s = this.sprites[i], a = this.anchors[i];
            const visible = isPointInView(a.x, a.y, camX, camY, viewW, viewH, 30);
            s.renderable = visible;
            if (!visible) continue;
            // sztandar ciezszy = wolniejszy i mniejszy lopot; szmaty najbardziej nerwowe
            const k = a.kind === 'banner' ? 0.6 : a.kind === 'rag' ? 1.3 : 1;
            s.skew.y = Math.sin(t * 4 * k + i * 1.7) * 0.26 * (a.kind === 'banner' ? 0.7 : 1);
            s.scale.x = (1 / RES) * (0.85 + (Math.sin(t * 5.2 * k + i) + 1) * 0.1);
        }
    }

    public destroy(): void {
        for (const s of this.sprites) s.destroy();
        this.sprites = [];
    }
}
