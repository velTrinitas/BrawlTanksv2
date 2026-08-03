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
