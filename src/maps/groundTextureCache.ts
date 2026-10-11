/**
 * groundTextureCache — v0.187.0 (FAZA 1.3) + v0.244.0 (kafle).
 *
 * ZNALEZISKO Z URZADZENIA (Huawei MatePad, `?diag=1`): tekstura gruntu ma 3000x3000 px, czyli
 * **34 MB VRAM**, i do tej wersji byla budowana OD NOWA przy kazdym starcie meczu
 * (`buildDesertTexture()` i siostry w `main.ts`). Sprite ladowal do `worldContainer`, a teardown
 * robil tylko `removeChildren()`, ktory NIE zwalnia tekstur GPU — wiec kazdy mecz zostawial
 * kolejne 34 MB. Pomiar: mecz 1 = 45 MB, mecz 2 = 83 MB, mecz 3 = 119 MB. Po kilku meczach
 * sterownik ubijal kontekst WebGL i gracz dostawal bialy ekran.
 *
 * ROZWIAZANIE: jednoelementowy cache. W pamieci zyje tekstura gruntu TYLKO biezacej mapy:
 *  - ten sam mecz jeszcze raz  -> reuse (zero alokacji, zero czasu na pieczenie 9 mln pikseli),
 *  - zmiana mapy              -> stara tekstura jest NISZCZONA, dopiero potem powstaje nowa.
 *
 * Swiadomie NIE trzymamy wszystkich map naraz: 6 map x 34 MB = ponad 200 MB, czyli dokladnie to,
 * czego tablet nie udzwignal.
 *
 * Rollback: `?groundcache=0` przywraca zachowanie sprzed tej wersji (tekstura per mecz).
 *
 * ── v0.244.0 KAFLE (PERF startu meczu) ────────────────────────────────────────────────────────
 * Po v0.243.0 (prewarm piekarni sprite'ow) jedynym duzym zadaniem przy ladowaniu meczu zostal grunt:
 * jeden `texImage2D` 34 MB na A54 = ~0,4-0,5 s zamrozenia na KAZDEJ mapie. Plugin `prepare` PixiJS
 * dzieli upload PER BaseTexture (4 na klatke), wiec jednej duzej tekstury nie da sie rozlozyc na klatki.
 * Dlatego: builder rysuje jak dotad na jednym canvasie 3000x3000 (kolejnosc RNG i gradienty bez zmian),
 * gotowy canvas jest CIETY na siatke kafli TILE x TILE (drawImage = tania kopia; pierwszy drawImage
 * wymusza raster duzego canvasu, czyli koszt rysowania placony raz), a kazdy kafel to osobna
 * BaseTexture — `renderer.prepare.upload(worldContainer)` w `startGameInner` wgrywa je porcjami pod
 * ekranem ladowania. VRAM identyczna (ta sama liczba pikseli), +15 sprite'ow statycznych w jednym batchu.
 * Duza tekstura z buildera NIGDY nie trafia do GPU (niszczona zaraz po pocieciu).
 *
 * Rollback: `?groundtiles=0` = jeden sprite z jedna tekstura jak do v0.243.0.
 *
 * POMIAR desktop CPU x6 (tools/junkyard-bake-times.mjs ... profile): ciecie 60-120 ms, 16 uploadow po ~1 ms;
 * na desktopie upload gruntu NIE byl waskim gardlem — pierwsza klatka to measureText (PIXI.Text padow/pill),
 * odroczone rastry canvasow i budowa geometrii Graphics. Realny zysk kafli rozstrzyga A54: ?perf=1 vs ?perf=1&groundtiles=0.
 */

import * as PIXI from 'pixi.js';
// Real wall clock captured at import: SigmaTest (bot) replaces performance.now with a virtual clock for determinism tests.
const REAL_NOW: () => number = performance.now.bind(performance);

/** Bok kafla w px swiata. 3000 / 750 = 4x4 = 16 kafli po 2,25 MB (4 uploady na klatke => ~4 klatki). */
export const GROUND_TILE = 750;

/**
 * Warstwa gruntu: kontener z kaflami (albo z jednym sprite'em przy `?groundtiles=0`).
 * `tint` ustawia odcien wszystkim kaflom naraz (Krolowa: sciemnienie PORWANA przez tint gruntu).
 */
export class GroundLayer extends PIXI.Container {
    private readonly tiles: PIXI.Sprite[] = [];
    private _tint = 0xffffff;

    constructor(textures: readonly PIXI.Texture[], cols: number, tile: number) {
        super();
        textures.forEach((tex, i) => {
            const s = new PIXI.Sprite(tex);
            s.x = (i % cols) * tile;
            s.y = Math.floor(i / cols) * tile;
            this.tiles.push(s);
            this.addChild(s);
        });
    }

    get tint(): number { return this._tint; }
    set tint(v: number) {
        this._tint = v;
        for (const s of this.tiles) s.tint = v;
    }
}

let cachedKey: string | null = null;
let cachedTextures: PIXI.Texture[] = [];
let cachedCols = 1;
let cachedTile = GROUND_TILE;

function cacheEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('groundcache') !== '0';
}
function tilesEnabled(): boolean {
    try { return new URLSearchParams(window.location.search).get('groundtiles') !== '0'; } catch { return true; }
}

/**
 * Tnie teksture z canvasu buildera na kafle TILE x TILE. Zwraca tablice tekstur w kolejnosci wierszami
 * (row-major) + liczbe kolumn. Duza tekstura jest niszczona (nigdy nie idzie do GPU). Jesli zrodlo nie jest
 * canvasem (nie powinno sie zdarzyc), zwraca ja w calosci — zachowanie jak przed kaflami.
 */
function sliceIntoTiles(big: PIXI.Texture, tile: number): { textures: PIXI.Texture[]; cols: number } {
    const src = (big.baseTexture.resource as { source?: unknown } | undefined)?.source;
    if (!(src instanceof HTMLCanvasElement)) {
        console.warn('[groundTextureCache] ground source is not a canvas — single texture fallback');
        return { textures: [big], cols: 1 };
    }
    const W = src.width, H = src.height;
    const cols = Math.ceil(W / tile), rows = Math.ceil(H / tile);
    const textures: PIXI.Texture[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const w = Math.min(tile, W - c * tile), h = Math.min(tile, H - r * tile);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');
            if (!ctx) throw new Error('[groundTextureCache] 2d context unavailable for tile');
            ctx.drawImage(src, c * tile, r * tile, w, h, 0, 0, w, h);
            textures.push(PIXI.Texture.from(cv));
        }
    }
    big.destroy(true);
    return { textures, cols };
}

/**
 * Zwraca WARSTWE gruntu dla mapy `key` (kafle), budujac ja tylko wtedy, gdy trzeba.
 * `build` jest wolane leniwie — przy trafieniu w cache nie powstaje nawet canvas.
 * Kazde wywolanie daje NOWY kontener (teardown meczu robi removeChildren) na tych samych teksturach.
 */
export function getGroundLayer(key: string, build: () => PIXI.Texture): GroundLayer {
    const useCache = cacheEnabled();
    const hit = useCache && cachedKey === key && cachedTextures.length > 0 && cachedTextures.every(t => !t.destroyed);
    if (!hit) {
        if (useCache) disposeGroundTexture(); // inna mapa => najpierw oddaj VRAM, potem alokuj
        const t0 = REAL_NOW();
        const big = build();
        lastBuildMs = REAL_NOW() - t0;
        const t1 = REAL_NOW();
        const sliced = tilesEnabled() ? sliceIntoTiles(big, GROUND_TILE) : { textures: [big], cols: 1 };
        lastSliceMs = REAL_NOW() - t1;
        cachedTextures = sliced.textures;
        cachedCols = sliced.cols;
        cachedTile = sliced.cols === 1 ? Math.max(big.width, GROUND_TILE) : GROUND_TILE;
        cachedKey = useCache ? key : null;
    }
    return new GroundLayer(cachedTextures, cachedCols, cachedTile);
}

/**
 * Stare API (jedna tekstura) — zostaje dla narzedzi/kompatybilnosci; gra uzywa getGroundLayer.
 * UWAGA: nie korzysta z kafli (jeden upload 34 MB).
 */
export function getGroundTexture(key: string, build: () => PIXI.Texture): PIXI.Texture {
    if (!cacheEnabled()) return build();
    if (cachedKey === key && cachedTextures.length === 1 && !cachedTextures[0].destroyed) return cachedTextures[0];
    disposeGroundTexture();
    const t0 = REAL_NOW();
    const tex = build();
    lastBuildMs = REAL_NOW() - t0;
    lastSliceMs = 0;
    cachedTextures = [tex];
    cachedCols = 1;
    cachedTile = tex.width;
    cachedKey = key;
    return tex;
}

let lastBuildMs = 0;
let lastSliceMs = 0;
/** Diagnostyka: ile trwalo ostatnie zbudowanie gruntu (ms, tylko gdy cache nie trafil). */
export function getGroundBuildMs(): number { return lastBuildMs; }
/** Diagnostyka: ile trwalo pociecie gruntu na kafle (zawiera wymuszony raster duzego canvasu). */
export function getGroundSliceMs(): number { return lastSliceMs; }

/** Zwalnia tekstury gruntu wraz z BaseTexture (bez tego VRAM zostaje zajety). */
export function disposeGroundTexture(): void {
    for (const t of cachedTextures) {
        if (!t.destroyed) {
            try {
                t.destroy(true); // true = zniszcz takze BaseTexture (wlasciciel pikseli w GPU)
            } catch (e) {
                console.error('[groundTextureCache] destroy failed', (e as Error).stack);
            }
        }
    }
    cachedTextures = [];
    cachedKey = null;
}

/** Diagnostyka (`?diag=1`): ktora mapa siedzi w cache. */
export function getGroundCacheKey(): string | null {
    return cachedKey;
}

// dev diagnostics hook (tools/junkyard-bake-times.mjs)
(window as any).__groundBuildMs = getGroundBuildMs;
(window as any).__groundSliceMs = getGroundSliceMs;
