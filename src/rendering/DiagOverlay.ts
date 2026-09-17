/**
 * DiagOverlay — v0.187.0 (FAZA 1.1c), wlaczana przez `?diag=1`.
 *
 * CEL: jednym podejsciem na urzadzeniu rozstrzygnac, DLACZEGO robi sie bialy ekran, zamiast
 * zgadywac z kodu (regula nr 3: o mobile decyduje urzadzenie, nie czytanie zrodel).
 * Cztery liczniki sa rozlaczne i kazdy wskazuje inna przyczyne:
 *
 *   buf  — Mpx backbuffera (innerW*innerH*res^2). Duzy => winna rozdzielczosc (FAZA 1.3c).
 *   heap — pamiec JS. Rosnie monotonicznie => wyciek / OOM (FAZA 1.3a / 1.3d).
 *   tex  — liczba zywych tekstur GPU + szacowany VRAM. Skok przy starcie meczu BEZ spadku
 *          po powrocie do menu => wyciek tekstur (propBaker).
 *   ctx  — licznik `webglcontextlost`. >=1 => utrata kontekstu.
 *   err  — ostatni blad JS. Niepusty => crash JS i nic z optymalizacji pamieci nie pomoze.
 *
 * Nakladka jest czystym DOM-em, wiec PRZEZYWA smierc renderera (na tym polega jej sens)
 * i jest czytelna ZE ZRZUTU EKRANU — Mariusz ma tablet w rekach, nie devtoolsy.
 */

import type * as PIXI from 'pixi.js';
import { getContextLostCount } from './ContextGuard';
import { getLastError } from '../services/CrashReporter';

interface PerfMemory { usedJSHeapSize: number; jsHeapSizeLimit: number }

let el: HTMLDivElement | null = null;
let timer: number | null = null;

export function isDiagEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('diag') === '1';
}

/** Liczba zywych tekstur GPU + szacowany VRAM w MB (RGBA = 4 bajty na piksel). */
function textureStats(renderer: PIXI.IRenderer): { count: number; mb: number } {
    // PIXI v7: TextureSystem.managedTextures = wszystkie BaseTextury wgrane do GPU.
    const managed = (renderer as unknown as { texture?: { managedTextures?: PIXI.BaseTexture[] } }).texture?.managedTextures;
    if (!managed) return { count: 0, mb: 0 };
    let bytes = 0;
    for (const bt of managed) bytes += bt.realWidth * bt.realHeight * 4;
    return { count: managed.length, mb: bytes / (1024 * 1024) };
}

/**
 * Rozbicie tekstur po rozmiarze — odpowiada na pytanie "co zjada VRAM", ktorego sama suma nie
 * rozstrzyga. Wystawiane na `window.__btDiag` tylko przy `?diag=1`, zeby dalo sie je odczytac
 * z Playwrighta bez zmieniania kodu przy kazdym pomiarze.
 */
function textureBreakdown(renderer: PIXI.IRenderer): Array<{ size: string; count: number; mb: number }> {
    const managed = (renderer as unknown as { texture?: { managedTextures?: PIXI.BaseTexture[] } }).texture?.managedTextures ?? [];
    const groups = new Map<string, { count: number; mb: number }>();
    for (const bt of managed) {
        const key = `${bt.realWidth}x${bt.realHeight}`;
        const g = groups.get(key) ?? { count: 0, mb: 0 };
        g.count++;
        g.mb += (bt.realWidth * bt.realHeight * 4) / (1024 * 1024);
        groups.set(key, g);
    }
    return [...groups.entries()]
        .map(([size, g]) => ({ size, count: g.count, mb: Number(g.mb.toFixed(2)) }))
        .sort((a, b) => b.mb - a.mb);
}

export function installDiagOverlay(renderer: PIXI.IRenderer, getRenderRes: () => number): void {
    if (!isDiagEnabled() || el) return;

    (window as unknown as { __btDiag: unknown }).__btDiag = {
        textures: () => textureBreakdown(renderer),
        total: () => textureStats(renderer),
    };

    el = document.createElement('div');
    el.className = 'bt-diag';
    document.body.appendChild(el);

    let heapPeak = 0;
    let texPeak = 0;

    const snapshot = (): string[] => {
        const res = getRenderRes();
        const bufMpx = (window.innerWidth * window.innerHeight * res * res) / 1e6;
        const mem = (performance as unknown as { memory?: PerfMemory }).memory;
        const tex = textureStats(renderer);
        if (tex.mb > texPeak) texPeak = tex.mb;

        const lines = [
            `screen ${window.innerWidth}x${window.innerHeight}  dpr ${(window.devicePixelRatio || 1).toFixed(2)}  res ${res.toFixed(2)}`,
            `buf  ${bufMpx.toFixed(2)} Mpx`,
        ];
        if (mem) {
            const used = mem.usedJSHeapSize / (1024 * 1024);
            if (used > heapPeak) heapPeak = used;
            lines.push(`heap ${used.toFixed(0)} MB (szczyt ${heapPeak.toFixed(0)} / limit ${(mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0)})`);
        } else {
            lines.push('heap n/d (przegladarka nie podaje)');
        }
        lines.push(`tex  ${tex.count} szt · ${tex.mb.toFixed(1)} MB (szczyt ${texPeak.toFixed(1)})`);
        lines.push(`ctx  ${getContextLostCount()} utrat kontekstu`);
        const err = getLastError();
        lines.push(`err  ${err ? err.slice(0, 120) : '—'}`);
        return lines;
    };

    const render = (): void => {
        if (!el) return;
        const lines = snapshot();
        el.innerHTML = '<div class="bt-diag-rows"></div><button class="bt-diag-copy">Kopiuj</button>';
        (el.querySelector('.bt-diag-rows') as HTMLElement).textContent = lines.join('\n');
        const btn = el.querySelector('.bt-diag-copy') as HTMLButtonElement;
        btn.onclick = () => {
            const txt = [`BT diag ${new Date().toISOString()}`, `ua ${navigator.userAgent}`, ...snapshot()].join('\n');
            navigator.clipboard?.writeText(txt).then(
                () => { btn.textContent = 'Skopiowane ✓'; setTimeout(() => (btn.textContent = 'Kopiuj'), 1500); },
                (e: Error) => { console.error('[diag] clipboard failed', e.stack); btn.textContent = 'Blad kopiowania'; },
            );
        };
    };

    render();
    timer = window.setInterval(render, 1000);
    console.warn('[diag] overlay ON (?diag=1)');
}

export function stopDiagOverlay(): void {
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (el) { el.remove(); el = null; }
}
