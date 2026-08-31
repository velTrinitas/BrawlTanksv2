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
export function bakeToSprite(source: PIXI.Container): PIXI.Sprite | null {
    if (!_renderer) return null;
    try {
        // `getLocalBounds` daje realny kadr artu WRAZ z tym, co wychodzi poza (0,0) —
        // cienie i poswiaty sa rysowane z offsetem, wiec kadr liczony od zera ucinalby je.
        const b = source.getLocalBounds().clone();
        if (b.width <= 0 || b.height <= 0) return null;

        const tex = _renderer.generateTexture(source, {
            resolution: PROP_BAKE_SCALE,
            region: b,
        });
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
