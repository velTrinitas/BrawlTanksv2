/**
 * CoopSignalingService.ts — COOP LAN-1: kojarzenie dwoch urzadzen przez Supabase Realtime Broadcast.
 *
 * Kanal `coop:<KOD>` sluzy WYLACZNIE do wymiany kilku komunikatow (hello / offer / answer / ICE /
 * odmowa). Rozgrywka idzie potem bezposrednio telefon-telefon (LanPeer) — Supabase jej nie widzi.
 * Broadcast nie dotyka tabel ani RLS => zero wdrozen SQL. Kanal publiczny o krotkim zyciu;
 * kanal prywatny (RLS na realtime.messages) = przed wyjsciem koopa poza dom (przeglad cross-model).
 *
 * Za CLOUD_LIVE (backend-supabase §5): kazda metoda sieciowa zaczyna sie od isCloudEnabled().
 */
import { isCloudEnabled } from '../config/cloud';
import { getSupabase, ensureAnonSession } from './supabase/SupabaseClient';

export interface CoopChannel {
    send(payload: Record<string, unknown>): void;
    close(): void;
}

const EVENT = 'coop';

export class CoopSignalingService {
    /**
     * Otwiera kanal pokoju. Zwraca null, gdy chmura wylaczona (?cloud=0) albo subskrypcja
     * sie nie udala (Realtime niedostepny / brak sieci) — UI pokazuje wtedy czytelny blad.
     */
    static async openRoom(code: string, onMessage: (payload: Record<string, unknown>) => void): Promise<CoopChannel | null> {
        if (!isCloudEnabled()) return null;
        await ensureAnonSession(); // anon uid (rola authenticated) — ta sama sesja co profil/wyniki
        const sb = getSupabase();
        const ch = sb.channel(`coop:${code}`, { config: { broadcast: { self: false, ack: false } } });
        ch.on('broadcast', { event: EVENT }, (msg: { payload?: unknown }) => {
            const p = msg.payload;
            if (p && typeof p === 'object') onMessage(p as Record<string, unknown>);
        });
        const ok = await new Promise<boolean>((resolve) => {
            let settled = false; // CLOSED przychodzi tez po naszym removeChannel — logujemy tylko przed rozstrzygnieciem
            const timer = setTimeout(() => { settled = true; resolve(false); }, 8000);
            ch.subscribe((status: string) => {
                if (settled) return;
                if (status === 'SUBSCRIBED') { settled = true; clearTimeout(timer); resolve(true); }
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    settled = true;
                    clearTimeout(timer);
                    console.warn(`[CoopSignaling] subscribe status=${status} code=${code}`);
                    resolve(false);
                }
            });
        });
        if (!ok) {
            void sb.removeChannel(ch);
            return null;
        }
        let open = true;
        return {
            send: (payload) => {
                if (!open) return;
                void ch.send({ type: 'broadcast', event: EVENT, payload })
                    .catch((err: unknown) => console.warn('[CoopSignaling] send failed', (err as Error)?.stack));
            },
            close: () => {
                if (!open) return;
                open = false;
                void sb.removeChannel(ch);
            },
        };
    }
}
