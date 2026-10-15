import { isCastleArtV2 } from '../../config/castleArtFlag';

/**
 * castleArtClock.ts — CASTLE ART v2: wspolny zegar ambientow Zamku (woda, flagi, drzewa, ogniska,
 * kruki, dym). Przyrasta o staly krok logiki (tickCastleClock w runLogicStep), wiec STAJE w pauzie
 * i przy zwinietej karcie — legacy `Date.now()` biegl dalej (precedens z bramki MP, pkt 1).
 * Czysto wizualny: nic w symulacji go nie czyta. Bez flagi zwraca Date.now() (zachowanie 1:1).
 */
const STEP_MS = 1000 / 60;
let clockMs = 0;
let v2: boolean | null = null;

function on(): boolean { return v2 ??= isCastleArtV2(); }

export function tickCastleClock(): void { clockMs += STEP_MS; }
export function resetCastleClock(): void { clockMs = 0; }
/** Milisekundy zegara ambientu (v2: zegar meczu; legacy: Date.now()). */
export function castleNow(): number { return on() ? clockMs : Date.now(); }
