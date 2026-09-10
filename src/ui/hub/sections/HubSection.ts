/**
 * HubSection — wspolny kontrakt sekcji Menu Hub (HUB-0).
 * HUB-0 dostarcza minimalne stuby; HUB-1+ wypelnia render() trescia bez dotykania HubShell.
 */
export interface HubSection {
    /** Stabilny id (== data-section w nawigacji). */
    readonly id: string;
    /** Emoji do nav (rail/dock). */
    readonly icon: string;
    /** Przetlumaczona etykieta nav (implementacja woła literal t('...') — dynamiczny t(var) nie kompiluje). */
    label(): string;
    /** Wyrenderuj tresc sekcji do przekazanego kontenera (.bt-hub0-main). */
    render(el: HTMLElement): void;
}

/**
 * GARAZ-2 (v0.156.0) — WSPOLNY wybor czolgu na poziomie HubShell.
 *
 * Jedno zrodlo prawdy dla obu miejsc UI: grid w BITWIE (flag OFF) i obrotnica
 * w GARAZU (flag ON) czytaja/pisza TEN SAM obiekt. HubShell tworzy go raz
 * (seed: LastSession -> BRAWLERS[0], dokladnie dawna logika BattleSection)
 * i wstrzykuje do sekcji konstruktorem — obiekt zyje tak dlugo jak shell,
 * wiec przelaczanie sekcji go nie gubi. Persist: commit w Garazu robi merge
 * do LastSession (istniejacy klucz), a GRAJ zapisuje jak dotad w startGame.
 */
export interface HubSelection {
    brawlerId: string;
}
