import * as PIXI from 'pixi.js';

/**
 * propBaker.ts — v0.133.0. Pieczenie STATYCZNYCH propow map do tekstur.
 *
 * POWOD (zgloszenie Mariusza + zrzut 20260831_pustynaiMobile.png). Na telefonie
 * nieostre byly ruchomy piasek, oaza, skaly i sfinks, a czolgi i HUD ostre. Podzial
 * przebiega dokladnie wzdluz sposobu rysowania:
 *   - czolgi   -> pieczone tekstury (TankSpriteBaker, Canvas 2D),
 *   - HUD      -> osobny canvas 2D, poza WebGL,
 *   - te propy -> ZYWE PIXI.Graphics rasteryzowane przez WebGL co klatke.
 * A `main.ts` ustawia `antialias: !_prefersTouch`, czyli NA DOTYKU MSAA JEST WYLACZONE
 * (komentarz w kodzie przyznaje to wprost: „baked art juz AA przy bake"). Canvas 2D
 * antyaliasuje zawsze, WebGL bez MSAA nie — stad schodkowane krawedzie na krzywych.
 *
 * DLACZEGO `generateTexture`, A NIE PRZEPISANIE ARTU NA CANVAS 2D. Kazdy z tych propow
 * ma po kilkadziesiat linii rysowania elips, wielokatow i pekniec. Przepisywanie tego
 * recznie na Canvas 2D to setki linii do przepisania i realne ryzyko, ze art zmieni
 * wyglad. Zamiast tego bierzemy ISTNIEJACE, niezmienione `Graphics` i renderujemy je
 * RAZ do tekstury w podwojnej rozdzielczosci. Zmniejszenie tej tekstury przy
 * wyswietlaniu to klasyczny supersampling — daje wygladzone krawedzie MIMO wylaczonego
 * MSAA, bez dotykania kodu artu.
 *
 * DRUGI ZYSK, wazniejszy dla mobile niz sama ostrosc: geometria przestaje byc
 * teselowana przy kazdym rysowaniu. Sprite to jeden quad.
 *
 * ZASADA „ALL PROGRAMMATIC ART" ZOSTAJE NIENARUSZONA — art dalej powstaje w kodzie,
 * tylko jest utrwalany raz zamiast liczony w kolko.
 */

/**
 * Nadpróbkowanie. 2 = tekstura ma dwa razy wiecej pikseli na os, czyli 4x powierzchni.
 * JEDNA stala dla wszystkich propow, zeby dalo sie zjechac na 1.5 jednym miejscem,
 * gdyby pamiec tekstur uwierala na slabszym sprzecie.
 */
export const PROP_BAKE_SCALE = 2;

let _renderer: PIXI.IRenderer | null = null;

/** Wolane RAZ z bootstrapu (`main.ts`), zanim powstana jakiekolwiek propy. */
export function setPropBakeRenderer(renderer: PIXI.IRenderer): void {
    _renderer = renderer;
}

/**
 * Piecze `source` do sprite'a i zwraca go GOTOWEGO do wstawienia w miejsce oryginalu.
 * Sprite ma ten sam srodek co oryginalne Graphics, wiec podmiana nie przesuwa artu.
 *
 * Gdy renderer nie jest jeszcze ustawiony (np. sciezka bez bootstrapu albo test),
 * zwraca `null` — wolajacy zostaje wtedy przy zywych Graphics. Cichy fallback jest tu
 * WLASCIWY: brak pieczenia to gorsza jakosc, a nie zepsuty prop.
 */
/**
 * v0.187.0 — cache upieczonych propow.
 *
 * Do tej wersji KAZDA instancja propu tworzyla wlasna teksture przez `generateTexture` i nikt jej
 * nigdy nie niszczyl (teardown robi `removeChildren()`, ktore nie zwalnia GPU). Pomiar botem: +57
 * tekstur i ~2.7 MB na kazdy rozegrany mecz, w nieskonczonosc. Klucz podaje WOLAJACY — automatyczne
 * hashowanie Graphics byloby kruche, a zly klucz oznacza, ze wszystkie propy wygladaja tak samo.
 */
const _cache = new Map<string, PIXI.Texture>();

function propCacheEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('propcache') !== '0';
}

/** Zwalnia wszystkie upieczone propy (wolane przy teardownie meczu). */
export function disposePropCache(keepPrefix?: string): void {
    // AGRO PERF (2026-10-06): kolejny mecz na tej samej mapie nie piecze budynkow od nowa — klucze `tr_*`
    // sa pozycyjne i stale, wiec cache jest ograniczony (bez narastania jak przed v0.187.0).
    for (const [key, tex] of [..._cache.entries()]) {
        if (keepPrefix && key.startsWith(keepPrefix) && !tex.destroyed) continue;
        _cache.delete(key);
        try {
            if (!tex.destroyed) tex.destroy(true);
        } catch (e) {
            console.error('[propBaker] destroy failed', (e as Error).stack);
        }
    }
}

/** Diagnostyka (`?diag=1`): ile propow siedzi w cache. */
export function getPropCacheSize(): number {
    return _cache.size;
}

export function bakeToSprite(source: PIXI.Container, cacheKey?: string, clip?: PIXI.Rectangle): PIXI.Sprite | null {
    if (!_renderer) return null;
    if (cacheKey && propCacheEnabled()) {
        const hit = _cache.get(cacheKey);
        if (hit && !hit.destroyed) {
            const spr = new PIXI.Sprite(hit);
            // anchor jest czescia kadru, wiec musi byc odtworzony tak samo jak przy pieczeniu
            const b = clipBounds(source.getLocalBounds().clone(), clip);
            if (b.width > 0 && b.height > 0) spr.anchor.set(-b.x / b.width, -b.y / b.height);
            return spr;
        }
    }
    try {
        // `getLocalBounds` daje realny kadr artu WRAZ z tym, co wychodzi poza (0,0) —
        // cienie i poswiaty sa rysowane z offsetem, wiec kadr liczony od zera ucinalby je.
        const b = clipBounds(source.getLocalBounds().clone(), clip);
        if (b.width <= 0 || b.height <= 0) return null;
        // TROPICS v2 (2026-10-03): bezpiecznik limitu tekstury GPU. Zabłąkany punkt (0,0) w rysunku
        // rozciągał kadr kurnika na pół mapy => tekstura > 4096 px = pusty sprite (znikniety budynek).
        if (b.width * PROP_BAKE_SCALE > 4000 || b.height * PROP_BAKE_SCALE > 4000) {
            console.warn('[propBaker] kadr za duzy, zostaje zywe Graphics', { cacheKey, w: b.width, h: b.height });
            return null;
        }

        const tex = generateDetached(source, b);
        if (cacheKey && propCacheEnabled()) _cache.set(cacheKey, tex);
        const sprite = new PIXI.Sprite(tex);
        // Anchor liczony z pozycji kadru wzgledem srodka ukladu propu: dzieki temu
        // sprite laduje DOKLADNIE tam, gdzie stalo Graphics, mimo ze kadr jest
        // przesuniety o cienie.
        sprite.anchor.set(-b.x / b.width, -b.y / b.height);
        return sprite;
    } catch (e) {
        console.warn('[propBaker] bake failed, zostaje zywe Graphics:', e);
        return null;
    }
}

/**
 * 2026-10-05 FIX (niewidzialne kurniki): PIXI v7 `generateTexture` dla obiektu Z RODZICEM ustawia
 * `skipUpdateTransform` i renderuje z jego BIEZACYM worldTransform — czyli z przesunieciem i zoomem
 * kamery, jesli obiekt byl juz raz wyrenderowany. Kadr (`region`) jest w ukladzie lokalnym, wiec
 * zawartosc ladowala poza nim => pusta tekstura. Pieczenie w konstruktorze dzialalo przypadkiem
 * (swiezy obiekt ma worldTransform = identity); pieczenie leniwe (Henhouse.update) — zalezalo od kamery.
 * Teraz pieczenie jest niezalezne od momentu: na czas generateTexture obiekt jest odpiety od rodzica
 * z neutralna transformacja (= dokladnie dawne zachowanie "swiezego" obiektu), potem wraca na miejsce.
 */
function generateDetached(source: PIXI.Container, region: PIXI.Rectangle): PIXI.RenderTexture {
    const parent = source.parent;
    if (!parent) return _renderer!.generateTexture(source, { resolution: PROP_BAKE_SCALE, region });
    const idx = parent.getChildIndex(source);
    const t = source.transform;
    const saved = { px: t.position.x, py: t.position.y, sx: t.scale.x, sy: t.scale.y, rot: t.rotation, pvx: t.pivot.x, pvy: t.pivot.y, kx: t.skew.x, ky: t.skew.y };
    parent.removeChild(source);
    t.position.set(0, 0); t.scale.set(1, 1); t.rotation = 0; t.pivot.set(0, 0); t.skew.set(0, 0);
    try {
        return _renderer!.generateTexture(source, { resolution: PROP_BAKE_SCALE, region });
    } finally {
        t.position.set(saved.px, saved.py); t.scale.set(saved.sx, saved.sy); t.rotation = saved.rot;
        t.pivot.set(saved.pvx, saved.pvy); t.skew.set(saved.kx, saved.ky);
        parent.addChildAt(source, Math.min(idx, parent.children.length));
    }
}

/** Przyciecie kadru do prostokata (opcjonalne). */
function clipBounds(b: PIXI.Rectangle, clip?: PIXI.Rectangle): PIXI.Rectangle {
    if (!clip) return b;
    const x0 = Math.max(b.x, clip.x), y0 = Math.max(b.y, clip.y);
    const x1 = Math.min(b.x + b.width, clip.x + clip.width), y1 = Math.min(b.y + b.height, clip.y + clip.height);
    return new PIXI.Rectangle(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
}
