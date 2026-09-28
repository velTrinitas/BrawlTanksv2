/**
 * CoopMatch.ts — COOP LAN-3a: rola tego urzadzenia w meczu i komunikaty meczu po kanale 'rel'.
 *
 *  - 'solo'  — zwykla gra (DOMYSLNIE; kazda sciezka koopa jest za netRole() !== 'solo').
 *  - 'host'  — liczy caly swiat (dotychczasowy runLogicStep) i wysyla migawki.
 *  - 'guest' — buduje TYLKO statyczny swiat z tego samego seeda i rysuje migawki (GuestWorld).
 *
 * Start: host klika "Graj razem" -> requestHostStart() -> hub startuje biezacy wybor BITWY ->
 * main.ts (menu.onGameRequested) zabiera prosbe przez consumeHostStartRequest(), wysyla 'start'
 * i sam startuje mecz jako host. Gosc dostaje 'start' i startuje ten sam mecz jako gosc.
 */
import { coopSession } from './CoopSession';
import type { GameConfig } from '../types/GameConfig';

export type NetRole = 'solo' | 'host' | 'guest';

let role: NetRole = 'solo';
let hostStartRequested = false;

export function netRole(): NetRole { return role; }
export function setNetRole(r: NetRole): void {
    if (r !== role) console.log(`[CoopMatch] netRole ${role} -> ${r}`);
    role = r;
}

/** Wiadomosc startu meczu (host -> gosc). */
export interface CoopStartMsg {
    t: 'start';
    scenario: GameConfig['scenario'];
    map: GameConfig['map'];
    difficulty: GameConfig['difficulty'];
    hostBrawlerId: string;
    rngSeed: number;
}

export function isCoopStartMsg(m: Record<string, unknown> | null): m is Record<string, unknown> & CoopStartMsg {
    return !!m && m.t === 'start' && typeof m.scenario === 'string' && typeof m.map === 'string'
        && typeof m.difficulty === 'string' && typeof m.hostBrawlerId === 'string' && typeof m.rngSeed === 'number';
}

/** Host kliknal "Graj razem" — nastepny start meczu z hubu bedzie meczem koopowym. */
export function requestHostStart(): void {
    hostStartRequested = !!coopSession.connection && coopSession.current.k === 'connected' && coopSession.current.role === 'host';
}

export function consumeHostStartRequest(): boolean {
    const r = hostStartRequested && !!coopSession.connection;
    hostStartRequested = false;
    return r;
}

export function sendRel(obj: Record<string, unknown>): void {
    coopSession.connection?.sendRel(obj);
}

export function sendFast(buf: ArrayBuffer): void {
    coopSession.connection?.sendFast(buf);
}
