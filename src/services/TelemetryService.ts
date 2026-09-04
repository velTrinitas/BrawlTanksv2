/**
 * TelemetryService.ts — Z0.9 (COOP ETAP 0, v0.151.0): telemetria bazowa wydajnosci.
 *
 * Cel: koniec optymalizowania na slepo — dotad jedynym zrodlem prawdy o wydajnosci
 * byl A54 Mariusza. Teraz kazdy zakonczony mecz wysyla JEDEN wiersz danych
 * technicznych do tabeli `telemetry` (Supabase, migracja: supabase/telemetry.sql).
 *
 * RODO — twarda zasada tego modulu: ZERO danych identyfikujacych.
 * Bez profile_id, session_id, nicku, IP (nie wysylamy), pelnego user-agenta
 * (wycinamy SAM model urzadzenia i przegladarke z wersja glowna).
 * Wiersza nie da sie powiazac z osoba.
 *
 * Architektura:
 *  - Sampler FPS: licznik klatek + kubelek 1 Hz => tablica probek fps (tylko
 *    w PLAYING, max 30 min). Koszt na klatke: JEDEN inkrement — realnie zero.
 *  - Percentyle liczone RAZ, na koncu meczu: p50 (typowo), p05 (najgorsze 5%
 *    — to mierzy zaciecia; wysoki p50 + niski p05 = judder), avg.
 *  - Wysylka fire-and-forget na victory/gameover; try/catch + console.warn.
 *    Offline => wiersz przepada (swiadomie: mecz i score maja WLASNA kolejke,
 *    telemetria nie jest warta kolejkowania).
 *  - Kill switch: TELEMETRY_LIVE w config/telemetry.ts.
 */

import { getSupabase } from './supabase/SupabaseClient';
import { isTelemetryEnabled } from '../config/telemetry';

export interface TelemetryMatchMeta {
    map: string;
    scenario: string;
    difficulty: string;
    result: 'victory' | 'gameover';
    matchSeconds: number;
    isTouch: boolean;
    renderRes: number;
}

// ── sampler FPS (kubelki 1 Hz) ───────────────────────────────────────────────

const MAX_SAMPLES = 1800;       // 30 min — twardy limit pamieci (~14 KB)
const MIN_SAMPLES_TO_SEND = 5;  // mecz < 5 s = szum, nie wysylamy

let samples: number[] = [];
let bucketStartMs = 0;
let bucketFrames = 0;

/** Reset na start meczu (wolane ze startGame). */
export function telemetryResetMatch(): void {
    samples = [];
    bucketStartMs = 0;
    bucketFrames = 0;
}

/** Jedna klatka renderu w PLAYING (wolane z petli gry). Koszt: inkrement. */
export function telemetryTickFrame(nowMs: number): void {
    if (bucketStartMs === 0) {
        bucketStartMs = nowMs;
        bucketFrames = 0;
        return;
    }
    bucketFrames++;
    const span = nowMs - bucketStartMs;
    if (span >= 1000) {
        if (samples.length < MAX_SAMPLES) {
            samples.push((bucketFrames * 1000) / span);
        }
        bucketStartMs = nowMs;
        bucketFrames = 0;
    }
}

function percentile(sorted: number[], p: number): number {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
    return sorted[idx];
}

// ── identyfikacja techniczna (celowo ZGRUBNA — patrz RODO w naglowku) ───────

/** Model urzadzenia z UA: Android ma model wprost, iOS tylko klase, desktop = 'desktop'. */
export function detectDeviceModel(): string {
    try {
        const ua = navigator.userAgent;
        const android = ua.match(/Android [\d.]+; ([^);]+)[);]/);
        if (android) return android[1].replace(/ Build\/.*$/, '').trim().slice(0, 48) || 'android';
        if (/iPhone/.test(ua)) return 'iPhone';
        if (/iPad/.test(ua)) return 'iPad';
        return 'desktop';
    } catch { return 'unknown'; }
}

/** Przegladarka + wersja GLOWNA (np. "Chrome 128"). Kolejnosc testow ma znaczenie. */
export function detectBrowser(): string {
    try {
        const ua = navigator.userAgent;
        let m = ua.match(/Edg\/(\d+)/);       if (m) return `Edge ${m[1]}`;
        m = ua.match(/SamsungBrowser\/(\d+)/); if (m) return `Samsung ${m[1]}`;
        m = ua.match(/OPR\/(\d+)/);            if (m) return `Opera ${m[1]}`;
        m = ua.match(/Firefox\/(\d+)/);        if (m) return `Firefox ${m[1]}`;
        m = ua.match(/Chrome\/(\d+)/);         if (m) return `Chrome ${m[1]}`;
        m = ua.match(/Version\/(\d+).*Safari/); if (m) return `Safari ${m[1]}`;
        return 'other';
    } catch { return 'unknown'; }
}

function detectPlatform(): 'android' | 'ios' | 'desktop' | 'other' {
    try {
        const ua = navigator.userAgent;
        if (/Android/.test(ua)) return 'android';
        if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
        if (/Windows|Macintosh|Linux/.test(ua)) return 'desktop';
        return 'other';
    } catch { return 'other'; }
}

/** Wersja gry z diva #credits — JEDNO zrodlo prawdy o wersji, zero drugiego bumpa. */
function gameVersion(): string {
    try {
        const m = document.getElementById('credits')?.textContent?.match(/v[\d.]+/);
        return (m?.[0] ?? 'unknown').slice(0, 20);
    } catch { return 'unknown'; }
}

// ── wysylka ─────────────────────────────────────────────────────────────────

/**
 * Zloz i wyslij wiersz telemetrii (fire-and-forget). Wolane RAZ na koncu meczu.
 * Nigdy nie rzuca — telemetria nie ma prawa zepsuc konca meczu.
 */
export async function telemetrySubmitMatch(meta: TelemetryMatchMeta): Promise<void> {
    try {
        if (!isTelemetryEnabled()) return;
        if (samples.length < MIN_SAMPLES_TO_SEND) return;

        const sorted = [...samples].sort((a, b) => a - b);
        const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;

        const row = {
            game_version: gameVersion(),
            device_model: detectDeviceModel(),
            browser: detectBrowser(),
            platform: detectPlatform(),
            is_touch: meta.isTouch,
            dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
            render_res: Math.round(meta.renderRes * 100) / 100,
            fps_p50: Math.round(percentile(sorted, 0.50)),
            fps_p05: Math.round(percentile(sorted, 0.05)),
            fps_avg: Math.round(avg),
            match_seconds: Math.max(0, Math.min(7200, Math.round(meta.matchSeconds))),
            map: meta.map.slice(0, 32),
            scenario: meta.scenario.slice(0, 32),
            difficulty: meta.difficulty.slice(0, 16),
            result: meta.result,
        };

        const { error } = await getSupabase().from('telemetry').insert(row);
        if (error) {
            console.warn('[Telemetry] insert failed (drop, no retry):', error.message);
        } else {
            console.log(`[Telemetry] sent: p50=${row.fps_p50} p05=${row.fps_p05} ${row.device_model}`);
        }
    } catch (e) {
        // Offline / brak konfiguracji Supabase — wiersz przepada, gra zyje dalej.
        console.warn('[Telemetry] submit skipped:', (e as Error).message);
    }
}
