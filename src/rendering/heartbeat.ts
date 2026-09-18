/**
 * heartbeat — v0.187.0 (FAZA 2, "Pancerz krytyczny").
 *
 * Rytm TETNA zamiast zwyklego sinusa: dwa uderzenia i pauza (tuk-TUK ...... tuk-TUK ......).
 *
 * To nie jest ozdobnik, tylko wymog CZYTELNOSCI. Alarm donzonu w Zamku (`HUD.drawCastleKeepAlarm`)
 * pulsuje rownym sinusem po calej krawedzi ekranu. Gdyby efekt niskiego zycia gracza pulsowal tak
 * samo, w Zamku gracz widzialby dwa identyczne sygnaly o dwoch roznych znaczeniach i nie wiedzialby,
 * czy ginie on, czy zamek. Inny rytm = inne znaczenie, bez czytania tekstu.
 *
 * Wspoldzielone przez `Player` (puls kadluba, dym) i `HUD` (pekniecia w rogach), zeby oba bily
 * DOKLADNIE w tym samym momencie — rozjazd czytalby sie jak blad.
 *
 * @param phase rosnaca faza (0..1 = jeden pelny cykl serca); wolajacy sam steruje tempem
 * @returns 0..1, gdzie 1 = szczyt uderzenia
 */
export function heartbeat(phase: number): number {
    const p = phase % 1;
    // Pierwsze uderzenie: mocne, krotkie. Drugie: slabsze, zaraz po nim. Reszta cyklu = cisza.
    if (p < 0.12) return Math.sin((p / 0.12) * Math.PI);
    if (p >= 0.18 && p < 0.30) return Math.sin(((p - 0.18) / 0.12) * Math.PI) * 0.65;
    return 0;
}
