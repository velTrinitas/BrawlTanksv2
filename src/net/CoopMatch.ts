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
    /** LAN-3b: flaga hosta (gosc wypieka czolg hosta z wlasciwa flaga). */
    hostFlagId?: string | null;
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

/** LAN-3b: czolg KOLEGI w biezacym meczu (wypiekany przy starcie po obu stronach). */
let partnerLook: { brawlerId: string; flagId: string | null } | null = null;
export function setPartnerLook(p: { brawlerId: string; flagId: string | null } | null): void { partnerLook = p; }
export function getPartnerLook(): { brawlerId: string; flagId: string | null } | null { return partnerLook; }

export function sendRel(obj: Record<string, unknown>): void {
    coopSession.connection?.sendRel(obj);
}

export function sendFast(buf: ArrayBuffer): void {
    coopSession.connection?.sendFast(buf);
}

// ── LAN-2a: profil goscia (czolg, flaga, moce) — gosc wysyla po polaczeniu, host trzyma do startu ──
export interface CoopPeerProfile { brawlerId: string; flagId: string | null; loadout: [string, string, string] }

let peerProfile: CoopPeerProfile | null = null;
let localBrawlerProvider: (() => string) | null = null;

/** Hub ustawia zrodlo czolgu wybranego w BITWIE (gosc wysyla go hostowi). */
export function setLocalBrawlerProvider(fn: () => string): void { localBrawlerProvider = fn; }
export function localBrawlerId(): string | null { return localBrawlerProvider?.() ?? null; }

export function setPeerProfile(p: CoopPeerProfile | null): void { peerProfile = p; }
export function getPeerProfile(): CoopPeerProfile | null { return peerProfile; }

export function isCoopProfileMsg(m: Record<string, unknown> | null): m is Record<string, unknown> & { t: 'profile' } & CoopPeerProfile {
    return !!m && m.t === 'profile' && typeof m.brawlerId === 'string'
        && Array.isArray(m.loadout) && m.loadout.length === 3 && m.loadout.every(x => typeof x === 'string');
}
