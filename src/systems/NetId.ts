/**
 * NetId.ts — COOP S5b (ETAP 1-lite): stabilny identyfikator encji do migawek hosta (LAN-3).
 *
 * Kazda encja symulacji (wrog, pocisk gracza/wroga, pickup) dostaje przy narodzinach
 * kolejny numer. Obiekty z puli dostaja NOWY numer przy kazdym reuzyciu (reset), zeby gosc
 * nigdy nie pomylil nowego pocisku ze starym. Licznik resetowany w startGame => ten sam
 * przebieg meczu nadaje te same numery (determinizm; liczy tylko host).
 */

let seq = 0;

/** Kolejny identyfikator (1, 2, 3, ...). */
export function nextNetId(): number {
    return ++seq;
}

/** Start meczu: numeracja od zera. */
export function resetNetIds(): void {
    seq = 0;
}
