/**
 * CoopSession.ts — COOP LAN-1: maszyna stanow pokoju koopa (host / gosc), czytana przez UI.
 *
 *   idle -> hosting(kod) --hello--> pairing -> connected(rtt)
 *   idle -> joining(kod) --sig----> pairing -> connected(rtt)
 *   kazdy stan -> failed(powod)
 *
 * Protokol kojarzenia (kanal Realtime coop:<KOD>, payload { t, sid, ... }):
 *   gosc  -> hello { ver }            (powtarzane co 2 s, az host odpowie)
 *   host  -> reject { reason, field } (rozjazd wersji) albo zaczyna WebRTC:
 *   obie  -> sig { m: SignalMsg }     (offer / answer / ICE)
 * Po otwarciu kanalow danych: obie strony wysylaja 'hs' { ver } po kanale 'rel' — to jest
 * uzgadnianie WIAZACE (kanal Realtime moze klamac, polaczenie bezposrednie nie). Po nim kanal
 * kojarzenia jest zamykany — dalej Supabase nie uczestniczy.
 *
 * Dwa osobne bledy (przeglad cross-model): 'no_match' = nikt nie odpowiedzial na kod (zly kod /
 * host zamknal pokoj), 'no_lan' = sie znalezli, ale bezposrednie polaczenie nie wstalo (inna
 * siec Wi-Fi / izolacja klientow w sieci "dla gosci").
 */
import { LanPeer, type SignalMsg } from './LanPeer';
import { CoopSignalingService, type CoopChannel } from '../services/CoopSignalingService';
import { localNetVersion, compareNetVersion, isNetVersion, type NetVersion } from './NetVersion';
import { generateRoomCode } from './RoomCode';
import { isCloudEnabled } from '../config/cloud';
import { isMultiplayerEnabled } from '../config/multiplayer';

export type CoopFailReason = 'no_match' | 'no_lan' | 'version' | 'cloud_off' | 'closed' | 'expired';

export type CoopState =
    | { k: 'idle' }
    | { k: 'hosting'; code: string }
    | { k: 'joining'; code: string }
    | { k: 'pairing'; code: string; role: 'host' | 'guest' }
    | { k: 'connected'; code: string; role: 'host' | 'guest'; rtt: number | null; route: string }
    | { k: 'failed'; reason: CoopFailReason; detail?: string };

const HELLO_EVERY_MS = 2000;
const NO_MATCH_MS = 15000;   // gosc: brak odpowiedzi hosta
const NO_LAN_MS = 12000;     // od startu WebRTC do otwarcia kanalow
const ROOM_TTL_MS = 5 * 60 * 1000;

function randomSid(): string {
    const b = new Uint32Array(2);
    crypto.getRandomValues(b);
    return b[0].toString(36) + b[1].toString(36);
}

export class CoopSession {
    private state: CoopState = { k: 'idle' };
    private listeners = new Set<(s: CoopState) => void>();
    private channel: CoopChannel | null = null;
    private peer: LanPeer | null = null;
    private readonly sid = randomSid();
    private peerSid: string | null = null;
    private readonly ver: NetVersion = localNetVersion();
    private timers: ReturnType<typeof setTimeout>[] = [];
    private helloTimer: ReturnType<typeof setInterval> | null = null;
    private handshakeOk = false;

    get current(): CoopState { return this.state; }

    subscribe(fn: (s: CoopState) => void): () => void {
        this.listeners.add(fn);
        fn(this.state);
        return () => this.listeners.delete(fn);
    }

    private set(s: CoopState): void {
        const prevK = this.state.k;
        this.state = s;
        if (prevK !== s.k) console.log('[CoopSession]', s.k, s.k === 'failed' ? `${s.reason} ${s.detail ?? ''}` : '');
        for (const fn of this.listeners) {
            try { fn(s); } catch (err) { console.error('[CoopSession] listener failed', (err as Error).stack); }
        }
    }

    private fail(reason: CoopFailReason, detail?: string): void {
        this.teardown();
        this.set({ k: 'failed', reason, detail });
    }

    private later(ms: number, fn: () => void): void {
        this.timers.push(setTimeout(fn, ms));
    }

    // ── HOST ────────────────────────────────────────────────────────────────
    async host(): Promise<void> {
        this.teardown();
        if (!isCloudEnabled()) { this.set({ k: 'failed', reason: 'cloud_off' }); return; }
        const code = generateRoomCode();
        this.set({ k: 'hosting', code });
        const ch = await CoopSignalingService.openRoom(code, (p) => this.onSignal(p));
        if (this.state.k !== 'hosting' || this.state.code !== code) { ch?.close(); return; } // anulowano w trakcie
        if (!ch) { this.fail('no_match', 'realtime'); return; }
        this.channel = ch;
        this.later(ROOM_TTL_MS, () => { if (this.state.k === 'hosting') this.fail('expired'); });
    }

    // ── GOSC ────────────────────────────────────────────────────────────────
    async join(code: string): Promise<void> {
        this.teardown();
        if (!isCloudEnabled()) { this.set({ k: 'failed', reason: 'cloud_off' }); return; }
        this.set({ k: 'joining', code });
        const ch = await CoopSignalingService.openRoom(code, (p) => this.onSignal(p));
        if (this.state.k !== 'joining' || this.state.code !== code) { ch?.close(); return; }
        if (!ch) { this.fail('no_match', 'realtime'); return; }
        this.channel = ch;
        const hello = () => ch.send({ t: 'hello', sid: this.sid, ver: this.ver });
        hello();
        this.helloTimer = setInterval(hello, HELLO_EVERY_MS);
        this.later(NO_MATCH_MS, () => { if (this.state.k === 'joining') this.fail('no_match'); });
    }

    // ── kanal kojarzenia ────────────────────────────────────────────────────
    private onSignal(p: Record<string, unknown>): void {
        const t = p.t, from = typeof p.sid === 'string' ? p.sid : null;
        if (!from || from === this.sid) return;
        const st = this.state;

        if (t === 'hello' && st.k === 'hosting') {
            if (!isNetVersion(p.ver)) return;
            const diff = compareNetVersion(this.ver, p.ver);
            if (diff) {
                // Gosc dostaje powod — host zostaje w pokoju (moze przyjsc ktos z dobra wersja).
                this.channel?.send({ t: 'reject', sid: this.sid, to: from, reason: 'version', field: diff, ver: this.ver });
                console.warn(`[CoopSession] reject guest: ${diff} host=${String(this.ver[diff])} guest=${String(p.ver[diff])}`);
                return;
            }
            this.peerSid = from;
            this.startPeer('host', st.code);
            return;
        }
        // Obcy w pokoju po sparowaniu (np. trzecie urzadzenie z tym samym kodem) — ignoruj.
        if (this.peerSid && from !== this.peerSid) return;
        if (t === 'reject' && p.to === this.sid && (st.k === 'joining' || st.k === 'pairing')) {
            this.fail('version', typeof p.field === 'string' ? p.field : undefined);
            return;
        }
        if (t === 'sig' && p.to === this.sid) {
            const m = p.m as SignalMsg | undefined;
            if (!m || typeof m !== 'object') return;
            if (st.k === 'joining') { this.peerSid = from; this.startPeer('guest', st.code); }
            void this.peer?.handleSignal(m);
        }
    }

    private startPeer(role: 'host' | 'guest', code: string): void {
        if (this.helloTimer) { clearInterval(this.helloTimer); this.helloTimer = null; }
        this.set({ k: 'pairing', code, role });
        this.later(NO_LAN_MS, () => { if (this.state.k === 'pairing') this.fail('no_lan'); });
        const to = this.peerSid;
        const peer = new LanPeer(role, (m) => this.channel?.send({ t: 'sig', sid: this.sid, to, m }), {
            onOpen: () => peer.sendRel({ t: 'hs', ver: this.ver }),
            onClose: (reason) => {
                if (this.peer !== peer) return; // zamkniecie wywolane przez teardown — stan ustawia wolajacy
                const s = this.state;
                if (s.k === 'connected' || s.k === 'pairing') this.fail(s.k === 'pairing' ? 'no_lan' : 'closed', reason);
            },
            onMessage: (ch, data) => this.onPeerMessage(ch, data),
            onRtt: (ms) => {
                const s = this.state;
                if (s.k === 'connected') this.set({ ...s, rtt: ms });
            },
        });
        this.peer = peer;
        if (role === 'host') {
            void peer.start().catch((err: unknown) => {
                console.error('[CoopSession] offer failed', (err as Error)?.stack);
                this.fail('no_lan', 'offer');
            });
        }
    }

    /** COOP LAN-3a: wiadomosci meczu (po uzgodnieniu wersji) — CoopMatch sie tu podpina. */
    private matchListeners = new Set<(ch: 'rel' | 'fast', data: string | ArrayBuffer, msg: Record<string, unknown> | null) => void>();
    onMatchMessage(fn: (ch: 'rel' | 'fast', data: string | ArrayBuffer, msg: Record<string, unknown> | null) => void): () => void {
        this.matchListeners.add(fn);
        return () => this.matchListeners.delete(fn);
    }

    private onPeerMessage(ch: 'rel' | 'fast', data: string | ArrayBuffer): void {
        if (ch === 'fast' || typeof data !== 'string') {
            if (this.handshakeOk) for (const fn of this.matchListeners) fn(ch, data, null);
            return;
        }
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(data) as Record<string, unknown>; } catch { return; }
        if (msg.t !== 'hs') {
            if (this.handshakeOk) for (const fn of this.matchListeners) fn(ch, data, msg);
            return;
        }
        if (msg.t === 'hs' && !this.handshakeOk) {
            const s = this.state;
            if (s.k !== 'pairing') return;
            if (!isNetVersion(msg.ver)) { this.fail('version', 'shape'); return; }
            const diff = compareNetVersion(this.ver, msg.ver);
            if (diff) { this.fail('version', diff); return; }
            this.handshakeOk = true;
            // Kojarzenie zakonczone — Supabase przestaje uczestniczyc.
            this.channel?.close();
            this.channel = null;
            this.set({ k: 'connected', code: s.code, role: s.role, rtt: null, route: '' });
            void this.peer?.describeRoute().then((route) => {
                const c = this.state;
                if (c.k === 'connected') this.set({ ...c, route });
            });
        }
    }

    /** Aktywne polaczenie (LAN-2 wysle nim wejscie / migawki). */
    get connection(): LanPeer | null { return this.handshakeOk ? this.peer : null; }

    leave(): void {
        this.teardown();
        this.set({ k: 'idle' });
    }

    private teardown(): void {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        if (this.helloTimer) { clearInterval(this.helloTimer); this.helloTimer = null; }
        const peer = this.peer;
        this.peer = null;
        this.handshakeOk = false;
        this.peerSid = null;
        peer?.close('leave');
        this.channel?.close();
        this.channel = null;
    }
}

/** Jedna sesja koopa na strone (ekran hubu i przyszly mecz koopowy czytaja te sama). */
export const coopSession = new CoopSession();
// Dev/diagnoza (tylko przy ?mp=1): konsola i testy Playwright — window.__coop.host() / .join(kod) / .current
if (isMultiplayerEnabled()) (window as unknown as { __coop: CoopSession }).__coop = coopSession;
