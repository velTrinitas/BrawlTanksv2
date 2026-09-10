/**
 * tankTurn360.ts — GARAZ-2.5 (v0.157.0). Obrotnica 3/4: "360 product viewer".
 *
 * DLACZEGO KLATKI, NIE RENDER: render2d to sprite-stacking top-down (ekstruzja
 * obrysu z gory) — nie istnieje w nim zaden art boczny czolgu, wiec widok 3/4
 * "jak tobe.png" jest z niego nieosiagalny. Zrodlem artu sa ilustracje 3/4
 * (public/assets/tanks/*.jpg) -> AI-turntable -> klatki webp ciete narzedziem
 * tools/turntable-cutter.html do atlasu + meta.json:
 *
 *   public/assets/tanks/turn/<brawlerId>/atlas.webp   (grid klatek, <=2048px)
 *   public/assets/tanks/turn/<brawlerId>/meta.json    {frames, cols, frameSize,
 *                                                      startFrame?, dir?}
 *
 * Pokrycie czolgow deklaruje TURN360_TANKS (config/hubChoose.ts) — czolg spoza
 * listy dostaje stary tankTurntable (fallback, zero regresji). Pilot: KROL.
 * RUNTIME FALLBACK: gdy meta/atlas sie nie zaladuje (404 — klatki jeszcze nie
 * wygenerowane), montujemy na tym samym canvasie stary tankTurntable — gablota
 * NIGDY nie jest pusta, a czolg "awansuje" na 3/4 w momencie wgrania atlasu.
 *
 * KOSZT MOBILE: 1x drawImage na klatke rAF (idle throttle ~30 fps) — TANSZY niz
 * sprite-stack (~20 fill/frame). Atlas ~0.4-0.6 MB, fetch leniwy przy mount,
 * tylko w Garazu przy ?choose=1. Efekty (sweep/particles) bez screen-blend,
 * caly overdraw zamkniety w canvasie <=200 CSS px.
 *
 * WZORCE 1:1 z tankTurntable.ts: handle-singleton (mount niszczy poprzedni),
 * canvas.isConnected konczy petle po przebudowie DOM, pauzy document.hidden +
 * prefers-reduced-motion, te same stale predkosci draga/spinu/zoomu (feeling
 * obrotnicy identyczny miedzy starym a nowym rendererem).
 */

import { playUiClick } from '../uiSounds';
import { BRAWLERS } from '../../config/brawlers';

/** Cap DPR 1:1 z rendererem gry (v0.133.0) i tankTurntable. */
const DPR_CAP = 2;
const IDLE_FRAME_SKIP = 2;

/**
 * GARAZ-2.5 v3 (decyzja Mariusza): ZERO auto-rotate — obrot wylacznie DRAGIEM
 * (mysz/palec), po puszczeniu krotki fling wygaszany tarciem do pelnego stopu.
 * Bez zoomu (ostrosc 1:1 z CSS).
 */
const DRAG_RAD_PER_PX = 0.012;         // czulosc draga (1:1 z tankTurntable)
const INERTIA_FRICTION_60 = 0.93;      // (petla flinga zostaje jako martwa galaz bezpieczenstwa)
const INERTIA_MIN_RAD_S = 0.3;
// (tykniecie co 30 stopni i fling USUNIETE — decyzje Mariusza: dzwiek przy
// obrocie niepotrzebny; szybki zamach = flick zmiany czolgu w GarageSection)

/** Juice (design-values: DRAMATYCZNIE, nie subtelnie — ale zero overdraw poza canvasem). */
const ENTER_DUR_S = 0.65;              // wjazd: drop z gory + lądowanie
const ENTER_DROP_FRAC = 0.34;          // start dropu: -34% boku canvasa
const SHAKE_DUR_S = 0.22;              // mikro-shake podium po ladowaniu
// (idle float USUNIETY na zyczenie Mariusza — "czolg sie buja"; czolg stoi
// twardo na stole, zyja tylko sweep/iskry/wjazd)
const SWEEP_PERIOD_S = 4.5;            // co ile blysk przelatuje po pancerzu
const SWEEP_DUR_S = 0.8;
const PARTICLE_MAX = 10;
const SPARK_EVERY_S = 0.8;             // iskierki w kolorze czolgu przy idle

export interface Turn360Meta {
    frames: number;
    cols: number;
    frameSize: number;
    /** Klatka kanonicznego 3/4 na start (default 0). */
    startFrame?: number;
    /** Kierunek obrotu zrodlowego wideo wzgledem draga w prawo (1/-1, default 1). */
    dir?: 1 | -1;
}

interface Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number; r: number; color: string;
}

/** Ten sam ksztalt handle co tankTurntable — GarageSection nie rozroznia rendererow. */
export interface Turn360Handle {
    setBrawler(brawlerId: string): void;
    /**
     * SKIN-1: atlas klatek nie przemaluje sie kodem — skin wchodzi filtrem
     * Canvas2D (filter3d ze SkinDef) + hex do efektow (iskry/glow).
     * null/null = barwy domyslne. Sygnatura wspolna z TurntableHandle.
     */
    setSkin(hex: string | null, filter3d?: string | null,
        patternId?: string | null, animated?: boolean): void;
    zoomBy(delta: number): void;
    destroy(): void;
}

let activeHandle: Turn360Handle | null = null;

/**
 * Montuje viewer 3/4 na PODANYM canvasie (juz w DOM). Meta + atlas dociagane
 * leniwie; do tego czasu canvas jest pusty (fade-in .is-live maskuje pierwszy
 * frame — wzorzec tankTurntable). Blad ladowania = console.error + pusty stage
 * (sekcja dalej dziala: staty, zmiana czolgu, loadout).
 */
export function mountTankTurn360(
    canvas: HTMLCanvasElement,
    brawlerId: string,
    flagId: string | null,
): Turn360Handle {
    activeHandle?.destroy();

    let destroyed = false;
    let meta: Turn360Meta | null = null;
    let atlas: HTMLImageElement | null = null;
    /** Runtime fallback: stary turntable, gdy klatek (jeszcze) nie ma. */
    let fallback: import('./tankTurntable').TurntableHandle | null = null;

    // ── stan obrotu (yaw w radianach) ───────────────────────────────────────
    let yaw = 0;
    let spinVel = 0;               // rad/s flywheela (tap = kick, tarcie wygasza)
    let currentId = brawlerId;
    let needsDraw = true;
    let frame = 0;
    let lastT = 0;
    let rafId = 0;
    let elapsed = 0;               // zegar efektow (sweep/particles)
    let enterT = 0;                // 0..ENTER_DUR_S — animacja wjazdu
    let landed = false;
    let shakeT = SHAKE_DUR_S + 1;  // >SHAKE_DUR_S = brak shake'a
    const particles: Particle[] = [];
    let sparkTimer = 0;

    const baseColor = BRAWLERS.find(b => b.id === brawlerId)?.colorMain ?? '#f1c40f';
    // SKIN-1: filtr na klatki atlasu + hex do efektow. tankColor = skin albo baza.
    let skinFilter: string | null = null;
    let tankColor = baseColor;

    const reducedMotion = ((): boolean => {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch { return false; }
    })();

    // ── canvas/DPR (wzorzec tankTurntable) + resize (nowosc: CSS clamp zyje) ─
    let cssPx = canvas.clientWidth || 150;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const applySize = (): void => {
        canvas.width = Math.round(cssPx * dpr);
        canvas.height = Math.round(cssPx * dpr);
        needsDraw = true;
    };
    applySize();
    canvas.style.touchAction = 'none';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingQuality = 'high'; // max ostrosc przy skalowaniu klatek
    // SKIN-1: feature-detect ctx.filter (starszy WebKit go nie ma) — brak wsparcia
    // to obrotnica w barwach bazowych (recolor w MECZU dziala niezaleznie, derive).
    const filterSupported = !!ctx && typeof ctx.filter === 'string';
    if (!filterSupported) console.warn('[TankTurn360] ctx.filter unsupported — skin filter off');

    let resizeObs: ResizeObserver | null = null;
    try {
        resizeObs = new ResizeObserver(() => {
            const w = canvas.clientWidth;
            if (w > 0 && Math.abs(w - cssPx) > 1) { cssPx = w; applySize(); }
        });
        resizeObs.observe(canvas);
    } catch { /* stary silnik WebView — rozmiar z mounta zostaje */ }

    /** Offscreen do sweepa (gradient przyciety do alfy klatki przez source-atop). */
    let fx: HTMLCanvasElement | null = null;

    function frameIndex(): number {
        if (!meta) return 0;
        const n = meta.frames;
        const dir = meta.dir ?? 1;
        const raw = Math.round((yaw / (Math.PI * 2)) * n) * dir + (meta.startFrame ?? 0);
        return ((raw % n) + n) % n;
    }

    function spawnDust(px: number, py: number): void {
        for (let i = 0; i < 8; i++) {
            if (particles.length >= PARTICLE_MAX + 6) break; // dust ma chwilowy nadlimit
            const a = Math.PI + Math.random() * Math.PI;     // wachlarz w boki/gore
            const sp = 26 + Math.random() * 44;
            particles.push({
                x: px + (Math.random() - 0.5) * cssPx * 0.3, y: py,
                vx: Math.cos(a) * sp * (Math.random() < 0.5 ? 1 : -1),
                vy: -Math.abs(Math.sin(a)) * sp * 0.55,
                life: 0, maxLife: 0.5 + Math.random() * 0.3,
                r: 2.5 + Math.random() * 3, color: 'rgba(160,140,110,0.55)',
            });
        }
    }

    function spawnSpark(): void {
        if (particles.length >= PARTICLE_MAX) return;
        const a = Math.random() * Math.PI * 2;
        const rr = cssPx * (0.18 + Math.random() * 0.2);
        particles.push({
            x: cssPx / 2 + Math.cos(a) * rr,
            y: cssPx / 2 + cssPx * 0.24 + Math.sin(a) * rr * 0.3,
            vx: (Math.random() - 0.5) * 6,
            vy: -(14 + Math.random() * 18),
            life: 0, maxLife: 1.1 + Math.random() * 0.5,
            r: 1.4 + Math.random() * 1.6, color: tankColor,
        });
    }

    function draw(): void {
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssPx, cssPx);

        const cx = cssPx / 2;
        const cy = cssPx / 2;

        // shake podium po ladowaniu (Sensoryka: gablota CZUJE ciezar czolgu)
        const shakeK = shakeT < SHAKE_DUR_S ? (1 - shakeT / SHAKE_DUR_S) : 0;
        const shX = shakeK * Math.sin(shakeT * 90) * 2.5;
        const shY = shakeK * Math.cos(shakeT * 70) * 1.5;

        // ── PODIUM: srebrny stol-gramofon (decyzja Mariusza) ────────────────
        // Walec: blat z zimnym gradientem + widoczny bok z jasnym paskiem wokolo.
        const pcx = cx + shX;
        const pr = cssPx * 0.44; // talerz odrobine szerszy — boczny widok miesci sie na blacie
        const ry = pr * 0.30;
        const wall = pr * 0.22;                       // wysokosc boku walca
        const py = cy + cssPx * 0.27 + shY - wall / 2; // blat wyzej, bok schodzi w dol
        // miekki cien pod calym stolem
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.beginPath(); ctx.ellipse(pcx, py + wall + 6, pr * 1.08, ry * 1.1, 0, 0, Math.PI * 2); ctx.fill();
        // bok walca (miedzy dolna polowa gornej i dolnej elipsy)
        const wg = ctx.createLinearGradient(0, py, 0, py + wall + ry);
        wg.addColorStop(0, '#dfe4ec');
        wg.addColorStop(0.55, '#a7b0bf');
        wg.addColorStop(1, '#6f7887');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(pcx + pr, py);
        ctx.lineTo(pcx + pr, py + wall);
        ctx.ellipse(pcx, py + wall, pr, ry, 0, 0, Math.PI);        // dol: luk przez przod
        ctx.lineTo(pcx - pr, py);
        ctx.ellipse(pcx, py, pr, ry, 0, Math.PI, 0, true);         // powrot lukiem gornej elipsy
        ctx.closePath();
        ctx.fill();
        // bialawy pasek wokolo boku (subtelny shimmer — zyje, ale nie miga)
        const bandA = reducedMotion ? 0.45 : 0.40 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 1.6));
        ctx.strokeStyle = `rgba(255,255,255,${bandA.toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(pcx, py + wall * 0.55, pr * 0.99, ry, 0, Math.PI * 0.06, Math.PI * 0.94); ctx.stroke();
        // blat: zimny srebrny gradient po przekatnej + rant + pierscien
        const tg = ctx.createLinearGradient(pcx - pr, py - ry, pcx + pr, py + ry);
        tg.addColorStop(0, '#f4f6fa');
        tg.addColorStop(0.5, '#cdd4de');
        tg.addColorStop(1, '#9aa3b2');
        ctx.fillStyle = tg;
        ctx.beginPath(); ctx.ellipse(pcx, py, pr, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#68717f';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(pcx, py, pr, ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(pcx, py, pr * 0.78, ry * 0.78, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(30,40,55,0.14)';
        ctx.beginPath(); ctx.ellipse(pcx, py, pr * 0.52, ry * 0.52, 0, 0, Math.PI * 2); ctx.stroke();

        // ── PARTICLES pod czolgiem (dust) rysowane przed, iskry po — patrz nizej
        for (const p of particles) {
            if (p.color !== tankColor) drawParticle(ctx, p);
        }

        // ── CZOLG: klatka z atlasu ───────────────────────────────────────────
        if (meta && atlas) {
            const fs = meta.frameSize;
            const fi = frameIndex();
            const sx = (fi % meta.cols) * fs;
            const sy = Math.floor(fi / meta.cols) * fs;

            // entrance drop (ease-out z lekkim odbiciem) + idle float
            let dropY = 0;
            if (enterT < ENTER_DUR_S) {
                const k = enterT / ENTER_DUR_S;
                const e = 1 - Math.pow(1 - k, 3);               // easeOutCubic
                const bounce = k > 0.82 ? Math.sin((k - 0.82) / 0.18 * Math.PI) * 4 : 0;
                dropY = -(1 - e) * cssPx * ENTER_DROP_FRAC - bounce;
            }
            const floatY = 0; // idle float usuniety — czolg stoi twardo na stole

            // v2: zoom usuniety (ostrosc), dw = pelny bok canvasa — czolg na max;
            // rozmiar realny robi CSS (.bt-gr2-stage2 .bt-gr2-canvas do 460px).
            // v3 FIX osi: dol czolgu (kotwica 0.85*klatki w atlasie) ma ladowac na
            // SRODKU blatu talerza, nie na przednim rancie — stad ujemny offset Y
            // (-0.082): bottom = cy+0.268*cssPx = srodek dysku + lekki przod.
            const dw = cssPx;
            const dx = cx - dw / 2 + shX;
            const dy = cy - dw / 2 - cssPx * 0.082 + dropY + floatY + shY;

            // sweep swiatla: gradient przyciety do alfy klatki (source-atop na offscreenie)
            const sweepPhase = reducedMotion ? -1
                : (elapsed % SWEEP_PERIOD_S) / SWEEP_DUR_S;
            // SKIN-1: filtr skina na KAZDYM rysowaniu klatki atlasu (czolg),
            // nigdy na podium/particles/sweep-gradiencie.
            const skinF = (filterSupported && skinFilter) ? skinFilter : null;
            if (sweepPhase >= 0 && sweepPhase <= 1 && enterT >= ENTER_DUR_S) {
                if (!fx) { fx = document.createElement('canvas'); }
                if (fx.width !== fs) { fx.width = fs; fx.height = fs; }
                const fc = fx.getContext('2d');
                if (fc) {
                    fc.setTransform(1, 0, 0, 1, 0, 0);
                    fc.clearRect(0, 0, fs, fs);
                    if (skinF) fc.filter = skinF;
                    fc.drawImage(atlas, sx, sy, fs, fs, 0, 0, fs, fs);
                    if (skinF) fc.filter = 'none';
                    fc.globalCompositeOperation = 'source-atop';
                    const bandC = (sweepPhase * 1.7 - 0.35) * fs;   // przelot przez cala klatke
                    const g = fc.createLinearGradient(bandC - fs * 0.22, 0, bandC + fs * 0.22, fs * 0.45);
                    g.addColorStop(0, 'rgba(255,255,255,0)');
                    g.addColorStop(0.5, 'rgba(255,255,255,0.34)');
                    g.addColorStop(1, 'rgba(255,255,255,0)');
                    fc.fillStyle = g;
                    fc.fillRect(0, 0, fs, fs);
                    fc.globalCompositeOperation = 'source-over';
                    ctx.drawImage(fx, 0, 0, fs, fs, dx, dy, dw, dw);
                }
            } else if (skinF) {
                ctx.filter = skinF;
                ctx.drawImage(atlas, sx, sy, fs, fs, dx, dy, dw, dw);
                ctx.filter = 'none';
            } else {
                ctx.drawImage(atlas, sx, sy, fs, fs, dx, dy, dw, dw);
            }
        }

        // iskry w kolorze czolgu NAD klatka (unosza sie wokol gabloty)
        for (const p of particles) {
            if (p.color === tankColor) drawParticle(ctx, p);
        }

        needsDraw = false;
    }

    function drawParticle(c: CanvasRenderingContext2D, p: Particle): void {
        const a = Math.max(0, 1 - p.life / p.maxLife);
        c.globalAlpha = a * 0.9;
        c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.r * (0.6 + 0.4 * a), 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
    }

    function stepParticles(dt: number): void {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life += dt;
            if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy -= 8 * dt; // lekki wznios (iskry/kurz plyna w gore)
        }
    }

    function loop(now: number): void {
        if (destroyed) return;
        if (!canvas.isConnected) { handle.destroy(); return; } // DOM przebudowane -> koniec
        rafId = requestAnimationFrame(loop);
        if (document.hidden) return; // pauza w tle (bateria)
        const dt = lastT > 0 ? Math.min(0.1, (now - lastT) / 1000) : 0;
        lastT = now;
        frame++;
        elapsed += dt;

        if (enterT < ENTER_DUR_S) {
            const before = enterT;
            enterT += dt;
            needsDraw = true;
            if (!landed && before < ENTER_DUR_S * 0.82 && enterT >= ENTER_DUR_S * 0.82) {
                landed = true;
                shakeT = 0;
                if (!reducedMotion) spawnDust(cssPx / 2, cssPx / 2 + cssPx * 0.27);
            }
        }
        if (shakeT < SHAKE_DUR_S + 1) { shakeT += dt; if (shakeT <= SHAKE_DUR_S) needsDraw = true; }

        // fling po dragu — wygasa do PELNEGO STOPU (zero auto-rotate)
        if (!dragging && Math.abs(spinVel) > INERTIA_MIN_RAD_S) {
            yaw += spinVel * dt;
            spinVel *= Math.pow(INERTIA_FRICTION_60, dt * 60);
            needsDraw = true;
        } else if (!dragging) {
            spinVel = 0;
        }
        stepParticles(dt);
        if (particles.length > 0) needsDraw = true;
        if (!reducedMotion) {
            sparkTimer += dt;
            if (sparkTimer >= SPARK_EVERY_S && enterT >= ENTER_DUR_S) {
                sparkTimer = 0;
                spawnSpark();
            }
            // sweep + shimmer paska zyja w czasie — odswiezaj w oknie sweepa
            const sp = (elapsed % SWEEP_PERIOD_S) / SWEEP_DUR_S;
            if (sp <= 1.05) needsDraw = true;
        }
        // throttle ~30 fps gdy nie ma draga/flinga (drag idzie pelnym rAF)
        if (!dragging && Math.abs(spinVel) <= INERTIA_MIN_RAD_S
            && frame % IDLE_FRAME_SKIP !== 0) return;

        if (needsDraw) draw();
    }

    // ── input: DRAG obraca (v3 — bez auto-rotate, bez zoomu) ────────────────
    let dragging = false;
    let lastX = 0;

    function onDown(e: PointerEvent): void {
        canvas.setPointerCapture(e.pointerId);
        dragging = true;
        spinVel = 0;
        lastX = e.clientX;
    }
    function onMove(e: PointerEvent): void {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        if (dx === 0) return;
        yaw += dx * DRAG_RAD_PER_PX;
        needsDraw = true;
    }
    function onUp(): void {
        if (!dragging) return;
        dragging = false;
        // GARAZ-3: fling USUNIETY — szybki zamach to teraz gest zmiany czolgu
        // (flick w GarageSection); obrot staje natychmiast po puszczeniu.
        spinVel = 0;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    /** Leniwe ladowanie meta+atlasu; petla startuje dopiero po sukcesie. */
    function loadAssets(id: string): void {
        const base = `${import.meta.env.BASE_URL}assets/tanks/turn/${id}/`;
        fetch(`${base}meta.json`)
            .then(r => {
                if (!r.ok) throw new Error(`meta.json HTTP ${r.status}`);
                // Vite dev (SPA fallback) oddaje 200 + index.html dla brakujacych
                // plikow — sprawdzamy content-type, zeby swiadomie zejsc na fallback.
                const ct = r.headers.get('content-type') ?? '';
                if (!ct.includes('json')) throw new Error(`meta.json missing (content-type: ${ct})`);
                return r.json();
            })
            .then((m: Turn360Meta) => new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    if (destroyed) return;
                    meta = m;
                    atlas = img;
                    resolve();
                };
                img.onerror = () => reject(new Error('atlas.webp load failed'));
                img.src = `${base}atlas.webp`;
            }))
            .then(() => {
                if (destroyed) return;
                yaw = 0;
                enterT = reducedMotion ? ENTER_DUR_S : 0; // reduced-motion: bez dropu
                landed = reducedMotion;
                needsDraw = true;
                canvas.classList.add('is-live'); // fade-in maskuje pierwszy frame
                if (!rafId) rafId = requestAnimationFrame(loop);
            })
            .catch(e => {
                // Klatek jeszcze nie ma (pilot w toku) albo blad sieci — gablota nie
                // moze byc pusta: delegujemy do starego turntable na tym samym canvasie.
                console.warn('[TankTurn360] frames unavailable, falling back to turntable:',
                    (e as Error).message ?? e, { brawlerId: id });
                if (destroyed || fallback) return;
                import('./tankTurntable')
                    .then(mod => {
                        if (destroyed || fallback) return;
                        teardownSelf(); // wlasne listenery/petla precz z canvasa
                        fallback = mod.mountTankTurntable(canvas, id, flagId);
                    })
                    .catch(e2 => {
                        console.error('[TankTurn360] fallback mount failed:',
                            (e2 as Error).stack ?? e2, { brawlerId: id });
                    });
            });
    }

    /** Zdejmuje petle/listenery TEGO viewera (nie rusza fallbacku). */
    function teardownSelf(): void {
        cancelAnimationFrame(rafId);
        resizeObs?.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
    }

    const handle: Turn360Handle = {
        setBrawler(id: string): void {
            if (fallback) { fallback.setBrawler(id); return; }
            if (id === currentId) return;
            playUiClick();
            currentId = id;
            loadAssets(id);
        },
        setSkin(hex: string | null, filter3d: string | null = null,
            patternId: string | null = null, animated = false): void {
            // SKIN-2: atlas nie umie wzorow — GarageSection montuje przy wzorze
            // zywa obrotnice; tu pattern/animated tylko delegujemy do fallbacku.
            if (fallback) { fallback.setSkin(hex, filter3d, patternId, animated); return; }
            skinFilter = filter3d;
            tankColor = hex ?? baseColor;
            needsDraw = true;
        },
        zoomBy(delta: number): void {
            // v2: zoom wylaczony (decyzja Mariusza — ostrosc bez skalowania);
            // delegacja zostaje dla fallbacku legacy.
            fallback?.zoomBy(delta);
        },
        destroy(): void {
            if (destroyed) return;
            destroyed = true;
            teardownSelf();
            fallback?.destroy();
            fallback = null;
            if (activeHandle === handle) activeHandle = null;
        },
    };
    activeHandle = handle;

    loadAssets(brawlerId);
    return handle;
}

