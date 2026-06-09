/**
 * uiSounds.ts — UI feedback sounds dla menu interactions (Runda 1 polish).
 *
 * v0.19.0 update: uses dedicated menu_click.mp3 (Mariusz dodal plik do public/sfx/).
 * Respektuje global mute przez Howler engine.
 *
 * Uzycie:
 *   import { playUiClick } from './uiSounds';
 *   playUiClick(); // przy wyborze karty/buttona
 */

import { AudioSys } from '../audio/AudioSys';

/**
 * Menu click feedback (selection cards, buttons, pills).
 * Throttled (60ms) w AudioSys — anty-spam.
 * Gentle failure — nie crashuje gry gdy plik brakuje.
 */
export function playUiClick(): void {
    try {
        AudioSys.getInstance().playMenuClick();
    } catch (e) {
        console.warn('[uiSounds] click failed', e);
    }
}

/**
 * Major selection feedback (PLAY, CTA, START).
 * Na razie tez menu_click (single SFX). FAZA 8: mozna dodac dedykowany SFX.
 */
export function playUiSelect(): void {
    try {
        AudioSys.getInstance().playMenuClick();
    } catch (e) {
        console.warn('[uiSounds] select failed', e);
    }
}