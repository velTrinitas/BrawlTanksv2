/**
 * groundTextureCache — v0.187.0 (FAZA 1.3).
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
 */

import * as PIXI from 'pixi.js';

let cachedKey: string | null = null;
let cachedTex: PIXI.Texture | null = null;

function cacheEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('groundcache') !== '0';
}

/**
 * Zwraca teksture gruntu dla mapy `key`, budujac ja tylko wtedy, gdy trzeba.
 * `build` jest wolane leniwie — przy trafieniu w cache nie powstaje nawet canvas.
 */
export function getGroundTexture(key: string, build: () => PIXI.Texture): PIXI.Texture {
    if (!cacheEnabled()) return build();

    if (cachedKey === key && cachedTex && !cachedTex.destroyed) return cachedTex;

    disposeGroundTexture(); // inna mapa => najpierw oddaj VRAM, potem alokuj
    cachedTex = build();
    cachedKey = key;
    return cachedTex;
}

/** Zwalnia teksture gruntu wraz z jej BaseTexture (bez tego VRAM zostaje zajety). */
export function disposeGroundTexture(): void {
    if (cachedTex && !cachedTex.destroyed) {
        try {
            cachedTex.destroy(true); // true = zniszcz takze BaseTexture (wlasciciel pikseli w GPU)
        } catch (e) {
            console.error('[groundTextureCache] destroy failed', (e as Error).stack);
        }
    }
    cachedTex = null;
    cachedKey = null;
}

/** Diagnostyka (`?diag=1`): ktora mapa siedzi w cache. */
export function getGroundCacheKey(): string | null {
    return cachedKey;
}
