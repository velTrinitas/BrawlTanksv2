/**
 * SimClock.ts — COOP S1 (ETAP 1-lite): zegar SYMULACJI zamiast zegara sciany.
 *
 * Problem: logika gry liczyla cooldowny, czasy trwania mocy, zamrozenia, combo i timery
 * pickupow z Date.now()/performance.now(). Zegar sciany plynie dalej, gdy karta jest
 * zwinieta, gra stoi w pauzie, telefon jest w pionie albo trwa hit-stop — wiec po powrocie
 * moce "same sie skonczyly", pickupy wygasly, a combo przepadlo. W koopie (autorytet hosta)
 * czas gry musi byc funkcja krokow logiki, nie zegara urzadzenia.
 *
 * Zasada: wplywa na symulacje -> simNowMs(); tylko wyglad (puls, mruganie, HUD, audio)
 * -> zegar sciany (bez zmian).
 *
 * Zegar startuje od Date.now() przy imporcie i rosnie WYLACZNIE w runLogicStep o dlugosc
 * kroku (delta * 1000/60 ms). Start od wartosci sciany = semantyka "lastX = 0 oznacza
 * dawno temu" zostaje bitowo taka sama jak przed zmiana, a wartosc absolutna nie ma
 * znaczenia (liczy tylko host).
 */

let simMs = Date.now();

/** Aktualny czas symulacji w ms (monotoniczny, stoi gdy logika stoi). */
export function simNowMs(): number {
    return simMs;
}

/** Wolane RAZ na krok logiki (runLogicStep) — przesuwa zegar o dlugosc kroku. */
export function advanceSimClock(stepMs: number): void {
    if (stepMs > 0 && Number.isFinite(stepMs)) simMs += stepMs;
}
