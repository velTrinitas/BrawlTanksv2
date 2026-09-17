/**
 * ContextGuard — v0.187.0 (FAZA 1.1)
 *
 * PROBLEM: na Huawei MatePad 11.5 (2025) po kilku sekundach gry ekran robil sie BIALY i mecz
 * byl nie do odratowania. Do tej wersji gra nie miala ZADNEJ obslugi utraty kontekstu WebGL,
 * wiec bialy canvas byl stanem koncowym — bez detekcji, bez logu, bez sciezki powrotu.
 *
 * CO TO ROBI:
 *  - lapie `webglcontextlost` i robi `preventDefault()`. To jest WARUNEK KONIECZNY: bez niego
 *    przegladarka w ogole nie sprobuje wyslac `webglcontextrestored` i odzysk jest niemozliwy.
 *  - zatrzymuje ticker (logika nie leci w slepo, jak przy pauzie w pionie z v0.186.0),
 *  - pokazuje nakladke DOM. Nakladka MUSI byc czystym DOM-em: PIXI w tym momencie nie zyje,
 *    wiec cokolwiek rysowanego przez renderer byloby niewidoczne.
 *
 * CZEGO NIE ROBI — uczciwie: nie wznawia meczu w miejscu. W PixiJS v7 tekstury ze zrodla
 * canvas/img (bakery czolgow, wrogow, pociskow) i `PIXI.Graphics` wracaja same, ale
 * `RenderTexture`/`generateTexture` (czyli wszystkie skaly z `propBaker`) przepadaja
 * bezpowrotnie. Udawanie, ze mecz da sie wznowic, konczyloby sie gra z dziurami w swiecie.
 * Dlatego sciezka powrotu to powrot do menu z ZACHOWANYM postepem.
 *
 * Rollback: `?ctxguard=0` przywraca zachowanie sprzed tej wersji.
 */

export interface ContextGuardOpts {
    /** Canvas PIXI (app.view). */
    canvas: HTMLCanvasElement;
    /** Zatrzymanie petli gry — wolane natychmiast po utracie kontekstu. */
    onLost: () => void;
    /** Powrot do menu z zachowaniem postepu. Wolane po tapnieciu przycisku w nakladce. */
    onRecover: () => void;
    /**
     * Wznowienie petli i audio po odzyskaniu kontekstu, BEZ powrotu do menu.
     * Uzywane gdy kontekst wrocil, a mecz nie trwal — gracz nie musi wiedziec, ze cos sie stalo.
     * Bez tego ticker zostalby zatrzymany przez `onLost` i menu by zamarzlo (zlapane w tescie).
     */
    onResume: () => void;
    /** Czy mecz trwa w tej chwili (decyduje o tresci komunikatu). */
    isPlaying: () => boolean;
    /** Teksty (i18n) — wstrzykiwane, zeby modul nie zalezal od warstwy i18n. */
    text: () => { title: string; body: string; lostMatch: string; button: string };
}

/** Ile czekamy na `webglcontextrestored`, zanim uznamy, ze kontekst nie wroci. */
const RESTORE_TIMEOUT_MS = 4000;

let installed = false;
let lostCount = 0;

/** Licznik utrat kontekstu — czytany przez nakladke `?diag=1`. */
export function getContextLostCount(): number {
    return lostCount;
}

export function installContextGuard(opts: ContextGuardOpts): void {
    if (installed) return;
    if (new URLSearchParams(window.location.search).get('ctxguard') === '0') {
        console.warn('[ContextGuard] wylaczony przez ?ctxguard=0');
        return;
    }
    installed = true;

    let overlay: HTMLDivElement | null = null;
    let restoreTimer: number | null = null;
    let restored = false;

    const buildOverlay = (matchLost: boolean): void => {
        const t = opts.text();
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'bt-ctxlost';
            // z-index nad canvasem PIXI (1) i nad HUD (50); ponizej #uiLayer (100) nie wystarczy,
            // bo ekrany HTML moglyby przykryc komunikat — dlatego wlasna, wyzsza warstwa.
            overlay.setAttribute('role', 'alertdialog');
            document.body.appendChild(overlay);
        }
        overlay.innerHTML =
            '<div class="bt-ctxlost-card">' +
            '<div class="bt-ctxlost-icon">⚡</div>' +
            `<div class="bt-ctxlost-title"></div>` +
            `<div class="bt-ctxlost-body"></div>` +
            (matchLost ? '<div class="bt-ctxlost-note"></div>' : '') +
            '<button class="brawl-btn bt-ctxlost-btn"></button>' +
            '</div>';
        // textContent, nie innerHTML — teksty ida z i18n i nie moga wstrzykiwac markupu.
        (overlay.querySelector('.bt-ctxlost-title') as HTMLElement).textContent = t.title;
        (overlay.querySelector('.bt-ctxlost-body') as HTMLElement).textContent = t.body;
        const note = overlay.querySelector('.bt-ctxlost-note') as HTMLElement | null;
        if (note) note.textContent = t.lostMatch;
        const btn = overlay.querySelector('.bt-ctxlost-btn') as HTMLButtonElement;
        btn.textContent = t.button;
        btn.onclick = () => {
            hideOverlay();
            if (restored) {
                try {
                    opts.onRecover();
                } catch (e) {
                    console.error('[ContextGuard] onRecover failed', (e as Error).stack);
                    location.reload();
                }
            } else {
                // Kontekst nie wrocil — jedyna uczciwa sciezka to przeladowanie.
                location.reload();
            }
        };
        overlay.style.display = 'flex';
    };

    const hideOverlay = (): void => {
        if (overlay) overlay.style.display = 'none';
    };

    opts.canvas.addEventListener('webglcontextlost', (e: Event) => {
        e.preventDefault(); // bez tego NIE bedzie `webglcontextrestored`
        lostCount++;
        restored = false;
        console.error(`[ContextGuard] webglcontextlost #${lostCount} (playing=${opts.isPlaying()})`);
        const wasPlaying = opts.isPlaying();
        try {
            opts.onLost();
        } catch (err) {
            console.error('[ContextGuard] onLost failed', (err as Error).stack);
        }
        // Nakladke pokazujemy dopiero po chwili: jesli kontekst wroci sam i mecz nie trwal,
        // gracz nie musi w ogole wiedziec, ze cos sie stalo.
        if (restoreTimer !== null) clearTimeout(restoreTimer);
        restoreTimer = window.setTimeout(() => {
            if (!restored) buildOverlay(wasPlaying);
        }, RESTORE_TIMEOUT_MS);
        if (wasPlaying) buildOverlay(true);
    });

    opts.canvas.addEventListener('webglcontextrestored', () => {
        restored = true;
        if (restoreTimer !== null) { clearTimeout(restoreTimer); restoreTimer = null; }
        console.warn('[ContextGuard] webglcontextrestored');
        const overlayShown = overlay !== null && overlay.style.display === 'flex';
        if (!overlayShown) {
            // Gra nie trwala => ciche wznowienie: zero komunikatu, ale ticker MUSI wystartowac,
            // bo `onLost` go zatrzymal (inaczej menu zostaje zamrozone).
            try {
                opts.onResume();
            } catch (e) {
                console.error('[ContextGuard] onResume failed', (e as Error).stack);
            }
        }
        // Gdy nakladka jest na ekranie, czekamy na tapniecie gracza — przycisk wola onRecover.
    });
}
