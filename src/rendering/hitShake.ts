/**
 * hitShake.ts — v0.155.3 (D1, porzadki dlugu pod MP): wspolny helper drgniecia
 * kontenera przy trafieniu. Wczesniej te same 8 linii zylo osobno w
 * Crate.takeDamage i IceCube.takeDamage (znalezisko inwentaryzacji ETAPU 1).
 *
 * Zachowanie 1:1 z oryginalem: losowy offset +/- amplitude/2 na osi, powrot do
 * bazy po durationMs przez setTimeout. Math.random celowo (kosmetyka — zgodnie
 * z audytem Z0.2 nie seedujemy wizualiow). Kontener JEST przesuwany, hitbox
 * (x/y/w/h encji) NIE — czytelnosc kolizji nienaruszona (audyt Z0.2).
 *
 * baseX/baseY: pozycja spoczynkowa kontenera — Crate rysuje w wspolrzednych
 * swiata (kontener spoczywa w 0,0), IceCube trzyma kontener w (origX, origY).
 * isCancelled: np. () => this.isDestroyed — po zniszczeniu nie przywracamy.
 */

import type * as PIXI from 'pixi.js';

export function applyHitShake(
    container: PIXI.Container,
    baseX: number,
    baseY: number,
    amplitude: number = 1.5,
    durationMs: number = 80,
    isCancelled?: () => boolean,
): void {
    container.x = baseX + (Math.random() - 0.5) * amplitude;
    container.y = baseY + (Math.random() - 0.5) * amplitude;
    setTimeout(() => {
        if (container && !(isCancelled && isCancelled())) {
            container.x = baseX;
            container.y = baseY;
        }
    }, durationMs);
}
