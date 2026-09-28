/**
 * PlayerInput.ts — COOP S6 (ETAP 1-lite): wejscie JEDNEGO gracza na JEDEN krok logiki.
 *
 * Krok logiki (runLogicStep) czyta WYLACZNIE te strukture — klawiatura/mysz/dotyk/bot tylko
 * wypelniaja strukture gracza lokalnego (main.ts: collectLocalInput). W koopie LAN gosc wysyla
 * ja przez siec (packInput), a host wstawia jako wejscie players[1] (unpackInput).
 *
 * Format od razu sieciowy i KWANTYZOWANY: gracz lokalny tez przechodzi przez quantizeInput,
 * wiec host liczy wejscie lokalne i sieciowe ta sama droga (zero rozjazdu precyzji).
 *  - move: -1..1 w krokach 1/127 (int8). Klawiatura daje -1/0/1 na os (przekatna NIE
 *    znormalizowana — normalizuje Player.update, jak dotad).
 *  - analog: true = joystick dotykowy (skala wychylenia + mnoznik mobile w Player.update).
 *  - aim: punkt celowania w SWIECIE, calkowite px (int16) — niezalezny od kamery gracza.
 *  - dash / superSlot: zbocza (prosba w TYM kroku), nie stan trzymany.
 */

/** Wersja formatu wejscia — trafi do handshake'u LAN-1 (rozjazd = odmowa startu meczu). */
export const INPUT_FORMAT_VERSION = 1;

export interface PlayerInput {
    /** Numer kolejny wejscia (u goscia rosnacy; potwierdzenia/rekoncyliacja w LAN-3). */
    seq: number;
    /** Krok logiki, dla ktorego wejscie powstalo. */
    tick: number;
    moveX: number;
    moveY: number;
    /** true = joystick analogowy (dotyk), false = klawiatura/cyfrowe. */
    analog: boolean;
    aimX: number;
    aimY: number;
    fire: boolean;
    /** Prosba o dash w tym kroku (zbocze). */
    dash: boolean;
    /** Prosba o aktywacje slotu mocy w tym kroku: -1 = brak, 0/1/2 = slot. */
    superSlot: number;
}

export function createPlayerInput(): PlayerInput {
    return { seq: 0, tick: 0, moveX: 0, moveY: 0, analog: false, aimX: 0, aimY: 0, fire: false, dash: false, superSlot: -1 };
}

const Q = 127;
const qAxis = (v: number): number => Math.max(-Q, Math.min(Q, Math.round(v * Q))) / Q;
const qCoord = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));

/** Kwantyzacja w miejscu (to samo, co przezyje packInput/unpackInput). */
export function quantizeInput(inp: PlayerInput): PlayerInput {
    inp.moveX = qAxis(inp.moveX);
    inp.moveY = qAxis(inp.moveY);
    inp.aimX = qCoord(inp.aimX);
    inp.aimY = qCoord(inp.aimY);
    if (inp.superSlot !== 0 && inp.superSlot !== 1 && inp.superSlot !== 2) inp.superSlot = -1;
    return inp;
}

/** Bity flag w slocie [6]. */
const F_FIRE = 1, F_DASH = 2, F_ANALOG = 4;

/**
 * Pakowanie do 8 x int16 (16 B) — ramka sieciowa LAN-2.
 * [0] seq & 0xffff, [1] tick & 0xffff, [2] moveX*127, [3] moveY*127, [4] aimX, [5] aimY,
 * [6] flagi, [7] superSlot (-1..2). seq/tick zawijaja sie co 65536 — odbiorca porownuje modulo.
 */
export function packInput(inp: PlayerInput, out: Int16Array = new Int16Array(8)): Int16Array {
    out[0] = inp.seq & 0xffff;
    out[1] = inp.tick & 0xffff;
    out[2] = Math.round(inp.moveX * Q);
    out[3] = Math.round(inp.moveY * Q);
    out[4] = qCoord(inp.aimX);
    out[5] = qCoord(inp.aimY);
    out[6] = (inp.fire ? F_FIRE : 0) | (inp.dash ? F_DASH : 0) | (inp.analog ? F_ANALOG : 0);
    out[7] = inp.superSlot;
    return out;
}

export function unpackInput(buf: Int16Array, out: PlayerInput = createPlayerInput()): PlayerInput {
    out.seq = buf[0] & 0xffff;
    out.tick = buf[1] & 0xffff;
    out.moveX = buf[2] / Q;
    out.moveY = buf[3] / Q;
    out.aimX = buf[4];
    out.aimY = buf[5];
    out.fire = (buf[6] & F_FIRE) !== 0;
    out.dash = (buf[6] & F_DASH) !== 0;
    out.analog = (buf[6] & F_ANALOG) !== 0;
    out.superSlot = buf[7] >= 0 && buf[7] <= 2 ? buf[7] : -1;
    return out;
}
