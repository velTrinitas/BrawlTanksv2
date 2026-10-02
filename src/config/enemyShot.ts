/**
 * enemyShot.ts — ENEMY-SHOT: Plazmowa kula (v0.235.0, karta Notion „ENEMY-SHOT: Plazmowa kula").
 *
 * Zwykly strzal wroga (`enemy_basic`) dostaje wyglad „A · Plazmowa kula" z symulacji Mariusza:
 * pulsujace bialo-zolte jadro, promien 6 -> 6,6 (+10%), ogon z 4 duchow, blysk wylotu, trafienie =
 * zloty pierscien + iskry. Hitbox BEZ zmian (r 5) — czysto wizualne, zero wplywu na symulacje.
 *
 * Wzorzec flag: kazda flaga ON ma sciezke wyjscia bez rebuildu — `?plasma=0` = stary wyglad.
 */
export const PLASMA_SHOT = true;

/** Promien wizualny kuli (hitbox osobno: EnemyBullet.radius = 5). */
export const PLASMA_RADIUS = 6.6;

/** Liczba duchow ogona. Tanszy wariant na slaby sprzet: 2 (karta: „ogon 4 -> 2"). */
export const PLASMA_TAIL_GHOSTS = 4;

export function isPlasmaShotEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('plasma');
        if (q === '0') return false;
        if (PLASMA_SHOT) return true;
        return q === '1';
    } catch { return PLASMA_SHOT; }
}
