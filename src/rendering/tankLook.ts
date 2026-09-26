/**
 * tankLook.ts — KONTRAKT CUSTOMIZACJI czolgu gracza (TANK ART v2).
 *
 * Jeden obiekt zamiast rosnacej listy parametrow pozycyjnych bakera. Wszystko, co zmienia
 * wyglad czolgu per profil/wyposazenie, przechodzi tedy: flaga, numer, skin (paleta + wzor).
 * Przyszle sloty (dekal, styl kol, styl lufy) dochodza tu — baker i Garaz nie zmieniaja sygnatur.
 *
 * MP: to jest to, co w koopie idzie w handshake razem z id czolgu (stan wspoldzielony, wizualny).
 */
export interface TankLook {
    /** Flaga profilu (FlagId, 18 flag z config/flags.ts) lub null = bez flagi. */
    readonly flagId: string | null;
    /** Numer czolgu 1..99 (Profile.tankNumber) lub null = bez numeru. */
    readonly number: number | null;
    /** SKIN-1: hex palety lub null = domyslna paleta czolgu. */
    readonly skinHex: string | null;
    /** SKIN-2: id wzoru lub null. */
    readonly skinPattern: string | null;
}

export const DEFAULT_TANK_LOOK: TankLook = { flagId: null, number: null, skinHex: null, skinPattern: null };

/** Klucz cache bake — zmiana dowolnego pola = rebake (wzorzec flagId/skinHex/skinPattern z TankSpriteBaker). */
export function tankLookKey(look: TankLook): string {
    return `${look.flagId ?? ''}|${look.number ?? ''}|${look.skinHex ?? ''}|${look.skinPattern ?? ''}`;
}
