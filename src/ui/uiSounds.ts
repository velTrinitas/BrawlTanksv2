/**
 * uiSounds.ts — UI feedback sounds dla menu interactions (Runda 1 polish).
 *
 * v0.19.0 update: uses dedicated menu_click.mp3 (Mariusz dodal plik do public/sfx/).
 * Respektuje global mute przez Howler engine.
 *
 * v0.208.0 (MENU JUICE, J1): TRZY glosy z jednego sampla przez `rate`:
 *   click  = 1.0 ±6% jitter (anty-zmeczenie, jak strzaly w AudioSys.safePlayVaried)
 *   select = 1.18 (GRAJ / potwierdz / „wskoczylo")
 *   back   = 0.85 (wroc / anuluj / zablokowane „nope")
 * Do tej wersji click i select graly identycznie.
 *
 * Uzycie:
 *   import { playUiClick } from './uiSounds';
 *   playUiClick(); // przy wyborze karty/buttona
 */

import { AudioSys } from '../audio/AudioSys';

function play(rate: number, label: string): void {
    try {
        AudioSys.getInstance().playMenuClickRate(rate);
    } catch (e) {
        console.warn(`[uiSounds] ${label} failed`, e);
    }
}

/** Menu click feedback (selection cards, buttons, pills). Throttled (60ms) w AudioSys. */
export function playUiClick(): void {
    play(1 + (Math.random() * 2 - 1) * 0.06, 'click');
}

/** Major selection feedback (PLAY, CTA, START, komplet loadoutu). */
export function playUiSelect(): void {
    play(1.18, 'select');
}

/** Wroc / anuluj / zablokowane. */
export function playUiBack(): void {
    play(0.85, 'back');
}
