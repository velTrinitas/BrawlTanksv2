/**
 * LanPeer.ts — COOP LAN-1: bezposrednie polaczenie dwoch urzadzen (WebRTC DataChannel).
 *
 * iceServers: [] (bez STUN/TURN) => przegladarka zna tylko adresy lokalne, wiec polaczenie
 * z natury dziala WYLACZNIE w tej samej sieci — dokladnie zakres koopa LAN, zero naszego
 * serwera, dane gry nie wychodza z domu. ?stun=1 = awaryjna diagnoza (publiczny STUN Google)
 * dla sieci, gdzie adresy .local (mDNS) nie dzialaja.
 *
 * Dwa kanaly (przeglad cross-model):
 *  - 'rel'  — niezawodny, uporzadkowany: handshake, zdarzenia, ping; JSON.
 *  - 'fast' — zawodny, nieuporzadkowany (maxRetransmits 0): wejscie i migawki od LAN-2; binarny.
 *
 * Kojarzenie (offer/answer/ICE) idzie przez wstrzykniety `signal` — ta klasa nie zna Supabase.
 */

export type PeerRole = 'host' | 'guest';

export type SignalMsg =
    | { kind: 'offer'; sdp: string }
    | { kind: 'answer'; sdp: string }
    | { kind: 'ice'; cand: RTCIceCandidateInit };

export interface LanPeerEvents {
    onOpen(): void;
    onClose(reason: string): void;
    onMessage(channel: 'rel' | 'fast', data: string | ArrayBuffer): void;
    onRtt(ms: number): void;
}

const PING_EVERY_MS = 1000;

function stunEnabled(): boolean {
    try { return new URLSearchParams(window.location.search).get('stun') === '1'; } catch { return false; }
}

export class LanPeer {
    private readonly pc: RTCPeerConnection;
    private rel: RTCDataChannel | null = null;
    private fast: RTCDataChannel | null = null;
    private pendingIce: RTCIceCandidateInit[] = [];
    private remoteSet = false;
    private opened = false;
    private closed = false;
    private pingTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly role: PeerRole,
        private readonly signal: (msg: SignalMsg) => void,
        private readonly ev: LanPeerEvents,
    ) {
        this.pc = new RTCPeerConnection({
            iceServers: stunEnabled() ? [{ urls: 'stun:stun.l.google.com:19302' }] : [],
        });
        this.pc.onicecandidate = (e) => {
            if (e.candidate) this.signal({ kind: 'ice', cand: e.candidate.toJSON() });
        };
        this.pc.onconnectionstatechange = () => {
            const st = this.pc.connectionState;
            console.log(`[LanPeer] ${this.role} connectionState=${st}`);
            // 'disconnected' bywa chwilowe (WebRTC sam wraca) — konczymy tylko na failed/closed.
            if (st === 'failed' || st === 'closed') this.close(`pc_${st}`);
        };
        if (role === 'host') {
            this.attach(this.pc.createDataChannel('rel', { ordered: true }));
            this.attach(this.pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
        } else {
            this.pc.ondatachannel = (e) => this.attach(e.channel);
        }
    }

    /** Host: rozpoczyna wymiane (offer). */
    async start(): Promise<void> {
        if (this.role !== 'host') return;
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.signal({ kind: 'offer', sdp: offer.sdp ?? '' });
    }

    /** Komunikat kojarzenia od drugiej strony. */
    async handleSignal(msg: SignalMsg): Promise<void> {
        if (this.closed) return;
        try {
            if (msg.kind === 'offer' && this.role === 'guest') {
                await this.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
                await this.flushIce();
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this.signal({ kind: 'answer', sdp: answer.sdp ?? '' });
            } else if (msg.kind === 'answer' && this.role === 'host') {
                await this.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
                await this.flushIce();
            } else if (msg.kind === 'ice') {
                if (this.remoteSet) await this.pc.addIceCandidate(msg.cand);
                else this.pendingIce.push(msg.cand);
            }
        } catch (err) {
            console.error('[LanPeer] handleSignal failed', msg.kind, (err as Error).stack);
        }
    }

    private async flushIce(): Promise<void> {
        this.remoteSet = true;
        const q = this.pendingIce;
        this.pendingIce = [];
        for (const c of q) {
            try { await this.pc.addIceCandidate(c); }
            catch (err) { console.warn('[LanPeer] addIceCandidate failed', (err as Error).stack); }
        }
    }

    private attach(ch: RTCDataChannel): void {
        ch.binaryType = 'arraybuffer';
        if (ch.label === 'rel') this.rel = ch;
        else if (ch.label === 'fast') this.fast = ch;
        ch.onopen = () => this.checkOpen();
        ch.onclose = () => this.close(`dc_${ch.label}_closed`);
        ch.onmessage = (e) => {
            if (ch.label === 'rel' && typeof e.data === 'string') {
                // ping/pong obslugiwany tutaj — reszta idzie do warstwy wyzej
                if (e.data.startsWith('{"t":"ping"')) { this.rel?.send(e.data.replace('"ping"', '"pong"')); return; }
                if (e.data.startsWith('{"t":"pong"')) {
                    try { const ts = (JSON.parse(e.data) as { ts: number }).ts; this.ev.onRtt(Math.round(performance.now() - ts)); } catch { /* uszkodzony pong */ }
                    return;
                }
            }
            this.ev.onMessage(ch.label === 'fast' ? 'fast' : 'rel', e.data);
        };
    }

    private checkOpen(): void {
        if (this.opened || this.rel?.readyState !== 'open' || this.fast?.readyState !== 'open') return;
        this.opened = true;
        this.pingTimer = setInterval(() => {
            if (this.rel?.readyState === 'open') this.rel.send(JSON.stringify({ t: 'ping', ts: performance.now() }));
        }, PING_EVERY_MS);
        this.ev.onOpen();
    }

    get isOpen(): boolean { return this.opened && !this.closed; }

    sendRel(obj: unknown): void {
        if (this.rel?.readyState === 'open') this.rel.send(JSON.stringify(obj));
    }

    sendFast(buf: ArrayBuffer | ArrayBufferView): void {
        if (this.fast?.readyState === 'open') this.fast.send(buf as ArrayBuffer);
    }

    /** ?diag=1: para kandydatow ICE (typ host/srflx, protokol) — diagnoza "czemu nie laczy". */
    async describeRoute(): Promise<string> {
        try {
            const stats = await this.pc.getStats();
            let pairId = '';
            stats.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId; });
            const pair = pairId ? stats.get(pairId) : null;
            if (!pair) return 'no-pair';
            const loc = stats.get(pair.localCandidateId);
            const rem = stats.get(pair.remoteCandidateId);
            return `${loc?.candidateType ?? '?'}/${loc?.protocol ?? '?'} -> ${rem?.candidateType ?? '?'}/${rem?.protocol ?? '?'}`;
        } catch (err) {
            return `stats-error: ${(err as Error).message}`;
        }
    }

    close(reason = 'local'): void {
        if (this.closed) return;
        this.closed = true;
        if (this.pingTimer) clearInterval(this.pingTimer);
        try { this.rel?.close(); this.fast?.close(); this.pc.close(); }
        catch (err) { console.warn('[LanPeer] close failed', (err as Error).stack); }
        console.log(`[LanPeer] ${this.role} closed: ${reason}`);
        this.ev.onClose(reason);
    }
}
