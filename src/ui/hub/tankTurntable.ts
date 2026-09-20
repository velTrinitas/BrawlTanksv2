/**
 * tankTurntable.ts — GARAZ-2 (v0.156.0). Centralna obrotnica czolgu w Garazu.
 *
 * TECHNIKA (decyzja z planu, po pomiarach): ZYWY Canvas2D przez `drawTank` z
 * `experimental/tank25d/render2d` — TA SAMA funkcja programistycznego artu,
 * ktorej TankSpriteBaker uzywa pod spodem. Nie bake:
 *  - obrot CIAGLY (bake = skok co 10 stopni, widoczny przy wolnej gablocie),
 *  - zero VRAM (bake: ~29.5 MB/czolg @res2) i zero hitchu 72 rysowan,
 *  - hub zostaje bez PIXI (zero importow pixi.js w src/ui/ — utrzymane),
 *  - flaga narodowa i przyszla customizacja = zwykly re-render configu.
 *
 * GUARDRAIL: render2d ma module-level patch CanvasRenderingContext2D.prototype
 * (FIX#1, patrz TankSpriteBaker.ts:15-20) — importujemy go WYLACZNIE dynamicznie,
 * dopiero przy mount(). Gracz bez ?choose=1 nie placi ani bajta i nie dostaje
 * patcha globalnego prototypu.
 *
 * WZORZEC HUBA (crosshairPreview.ts): html-string emituje pusty <canvas>,
 * malowanie po wstawieniu do DOM; petla rAF z twardym teardownem (handle-singleton
 * — mount niszczy poprzedni; canvas.isConnected konczy petle po przebudowie DOM).
 *
 * KOSZT MOBILE (policzone w planie): 1 canvas <=200 CSS px @DPR2 (~0.64 MB),
 * JEDNO drawTank na klatke tylko podczas draga/spinu; idle spin throttlowany
 * do ~30 fps; pauzy: dotyk, document.hidden, prefers-reduced-motion (lekcja
 * baterii z MapPickerOverlay). Zero overdraw poza canvasem.
 */

import { playUiClick } from '../uiSounds';

/** Cap DPR 1:1 z rendererem gry (v0.133.0) i crosshairPreview. */
const DPR_CAP = 2;
/** Predkosc idle auto-spinu (rad/s) — wolna gablota, nie karuzela. */
const IDLE_SPIN_RAD_S = 0.45;
/** Drag: piksele -> radiany (lewar czulosci). */
const DRAG_RAD_PER_PX = 0.012;
/** Zakres zoomu (spec: lekki, sprite'owy scale). */
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.2;
/** Koperta rysowania: BAKE_TEX_SIZE(160)+margines — czolg miesci sie w kadrze. */
const ENVELOPE_PX = 172;
/** Idle: rysuj co 2. klatke (~30 fps) — drag/zoom ida pelnym rAF. */
const IDLE_FRAME_SKIP = 2;

/**
 * GARAZ-4 (2026-09-10): styl podium.
 *  'pad'  = LADOWISKO — okragly pad hangarowy w TEJ SAMEJ projekcji co czolg
 *           (elipsa o proporcji CAMERA_TILT_Y z render2d, wycentrowana pod
 *           czolgiem). Naprawia niedopasowanie kamer: drawTank patrzy ~60 st.
 *           z gory, a stary talerz (0.30) byl widokiem prawie z boku pod atlas 360.
 *  'disc' = stary talerz produktowy (rollback bez rebuildu: ?podium=disc).
 */
type PodiumStyle = 'pad' | 'disc';
const PODIUM_STYLE_DEFAULT: PodiumStyle = 'pad';
function readPodiumStyle(): PodiumStyle {
    try {
        const v = new URLSearchParams(window.location.search).get('podium');
        if (v === 'disc' || v === 'pad') return v;
    } catch (e) {
        console.warn('[TankTurntable] podium param read failed:', (e as Error).stack ?? e);
    }
    return PODIUM_STYLE_DEFAULT;
}
/** Promien pada wzgledem boku canvasa (jeden mnoznik do strojenia na oko). */
const PAD_RADIUS_FRAC = 0.40;
/** Segmenty pierscienia ostrzegawczego (parzyste = rowne pary zolty/czarny). */
const PAD_HAZARD_SEGMENTS = 16;

export interface TurntableHandle {
    /** Podmien czolg na obrotnicy (preview z overlaya). */
    setBrawler(brawlerId: string): void;
    /**
     * SKIN-1/2: podmien skina. hex = paleta (derive); filter3d uzywa tylko
     * viewer atlasowy (turn360) — tu ignorowany; patternId = wzor (SKIN-2),
     * animated = wzor animowany (wymusza redraw ~30fps). Wspolna sygnatura
     * trzyma oba handle pod jednym typem w GarageSection.
     */
    setSkin(hex: string | null, filter3d?: string | null,
        patternId?: string | null, animated?: boolean): void;
    zoomBy(delta: number): void;
    destroy(): void;
}

/**
 * Pusty canvas do markupu sekcji (malowany po mount — wzorzec crosshairPreview).
 * GARAZ-2.5 fix: BEZ inline width/height — inline styl wygrywal z CSS i zabijal
 * clamp(120px,40vh,200px) oraz breakpoint landscape/560px w hub-styles.css.
 * Rozmiar CSS robi .bt-gr2-canvas; bufor bierze mount z clientWidth.
 */
export function turntableCanvasHtml(): string {
    return `<canvas class="bt-gr2-canvas" aria-hidden="true"></canvas>`;
}

/** Jedna aktywna obrotnica na hub — mount niszczy poprzednia (sekcje przebudowuja DOM). */
let activeHandle: TurntableHandle | null = null;

/**
 * Montuje obrotnice na PODANYM canvasie (juz w DOM). Asynchronicznie dociaga
 * render2d; do tego czasu canvas jest pusty (fade-in maskuje pierwszy frame).
 */
export function mountTankTurntable(
    canvas: HTMLCanvasElement,
    brawlerId: string,
    flagId: string | null,
    initialSkinHex: string | null = null, // SKIN-1: remount po zmianie czolgu niesie skina
): TurntableHandle {
    activeHandle?.destroy();

    let destroyed = false;
    let r2d: typeof import('../../experimental/tank25d/render2d') | null = null;
    // SKIN-1: paleta skina cache'owana przy setSkin (derive RAZ na zmiane, nie per klatke).
    let skinHex: string | null = initialSkinHex;
    let skinColors: unknown | null = null;
    // SKIN-2: wzor + zywa faza animacji (akumulator czasu — jedyne zrodlo fazy
    // dla painterow; wlasny performance.now() painterow psuje bake).
    let skinPatternId: string | null = null;
    let skinAnimated = false;
    let skinElapsed = 0;
    const SKIN_ANIM_HZ = 0.5; // pelny cykl fazy = 2 s

    // ── stan obrotnicy ──────────────────────────────────────────────────────
    let hullAngle = -Math.PI / 4;   // 3/4 widok na start (przod-lewo — czytelna sylwetka)
    let turretAngle = hullAngle;    // wieza podaza z lagiem (Sensoryka: zyje)
    let treadShift = 0;             // gasienice "ida" przy obrocie
    let zoom = 1.0;
    const podiumStyle: PodiumStyle = readPodiumStyle();
    let dragging = false;
    let currentId = brawlerId;
    let needsDraw = true;
    let frame = 0;
    let lastT = 0;
    let rafId = 0;

    const reducedMotion = ((): boolean => {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch { return false; }
    })();

    // ── canvas/DPR (wzorzec crosshairPreview.prepare) ───────────────────────
    const cssPx = canvas.clientWidth || 150;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(cssPx * dpr);
    canvas.height = Math.round(cssPx * dpr);
    canvas.style.touchAction = 'none'; // drag obrotnicy nie walczy ze scrollem sekcji
    const ctx = canvas.getContext('2d');

    function currentBrawler(): unknown | null {
        if (!r2d) return null;
        const src = (r2d.BRAWLERS as Array<{ id: string }>).find(b => b.id === currentId)
            ?? (r2d.BRAWLERS as Array<{ id: string }>)[0];
        // Mapowanie flagi gry -> FLAGS render2d (ten sam ruch co TankSpriteBaker.mapFlag).
        const flags = r2d.FLAGS as string[];
        const f = flagId && flags.includes(flagId) ? flagId : flags[0];
        // SKIN-1: skin = podmiana OBU pol (color + colors) — regula spojnosci
        // kazdego spreadu brawlera pod render2d (fire.ts czyta .color).
        if (skinHex && !skinColors) {
            skinColors = (r2d.derive as (hex: string) => unknown)(skinHex);
        }
        // reduced-motion: faza zamrozona na 0.25 (kazdy wzor "w pelni", np.
        // zyly lawy rozswietlone w polowie), nie 0.
        const phase = reducedMotion ? 0.25 : (skinElapsed * SKIN_ANIM_HZ) % 1;
        return {
            ...src,
            flag: f,
            _skinPhase: phase,
            ...(skinHex && skinColors ? { color: skinHex, colors: skinColors } : {}),
            ...(skinPatternId ? { skinPattern: skinPatternId } : {}),
        };
    }

    /** Stary talerz produktowy (GARAZ-2) — zachowany 1:1 jako rollback (?podium=disc). */
    function drawPodiumDisc(c: CanvasRenderingContext2D, cx: number, cy: number): void {
        // Dysk 2.5D: rant (ciemny) + blat (jasniejszy) + miekki cien pod spodem.
        const pr = cssPx * 0.42 * Math.min(zoom, 1.15); // podium rosnie lekko z zoomem
        const py = cy + cssPx * 0.27;
        c.fillStyle = 'rgba(0,0,0,0.28)';
        c.beginPath(); c.ellipse(cx, py + 7, pr * 1.06, pr * 0.34, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#232a38';
        c.beginPath(); c.ellipse(cx, py + 5, pr, pr * 0.30, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#2f3a50';
        c.beginPath(); c.ellipse(cx, py, pr, pr * 0.30, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.10)';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(cx, py, pr * 0.94, pr * 0.27, 0, 0, Math.PI * 2); c.stroke();
    }
    /**
     * LADOWISKO (GARAZ-4): pad hangarowy w rzucie z gory — ta sama kamera co
     * drawTank (proporcja elipsy = CAMERA_TILT_Y z render2d, nie hardcode).
     * (cx, cy) = punkt, w ktorym drawTank stawia czolg -> czolg stoi NA srodku.
     * Cien czolgu rysuje juz drawTank; tu tylko cien samego pada.
     *
     * FAKE 3D (v2, na prosbe Mariusza "uzyj wszystkiego"): swiatlo z gory-lewej,
     * widoczna gruba scianka (poziomy + pionowy gradient, AO przy podlodze),
     * blat z radialnym gradientem + rozblysk, fazowane krawedzie (jasna od
     * swiatla, ciemna po przeciwnej), wglebiony pierscien ostrzegawczy z
     * cieniowaniem segmentow, szwy plyt, sruby z kloszem i cieniem.
     * Wszystko normal-alpha (zero blend modes / glow — §10, mobile).
     * Koszt: ~60 sciezek + 8 gradientow na klatke, zero tekstur.
     */
    function drawPodiumPad(c: CanvasRenderingContext2D, cx: number, cy: number): void {
        const tilt = (r2d && typeof r2d.CAMERA_TILT_Y === 'number') ? r2d.CAMERA_TILT_Y : 0.866;
        const R = cssPx * PAD_RADIUS_FRAC * Math.min(zoom, 1.15);
        const ry = (r: number): number => r * tilt;
        const ell = (x: number, y: number, r: number): void => {
            c.beginPath(); c.ellipse(x, y, r, ry(r), 0, 0, Math.PI * 2);
        };
        // Grubosc pada w px ekranu — skaluje sie z padem, zeby na 140px nie zniknela.
        const H = Math.max(6, R * 0.13);
        // Kierunek swiatla: gora-lewo (tak jak highlighty czolgu w render2d).
        const lx = cx - R * 0.45;
        const ly = cy - ry(R) * 0.55;

        // 1. CIEN NA PODLODZE (ambient occlusion): dwa poziomy, mocniej pod scianka.
        c.fillStyle = 'rgba(0,0,0,0.18)';
        ell(cx + R * 0.05, cy + H + 6, R * 1.10); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.30)';
        ell(cx + R * 0.03, cy + H + 2, R * 1.02); c.fill();

        // 2. SCIANKA (bryla): wypelnienie miedzy elipsa dolna i gorna.
        //    Gradient poziomy: lewa strona (do swiatla) jasniejsza, prawa w cieniu.
        const wallGrad = c.createLinearGradient(cx - R, 0, cx + R, 0);
        wallGrad.addColorStop(0.00, '#3a4358');
        wallGrad.addColorStop(0.35, '#2b3345');
        wallGrad.addColorStop(0.70, '#1e2433');
        wallGrad.addColorStop(1.00, '#161a26');
        c.fillStyle = wallGrad;
        c.beginPath();
        c.ellipse(cx, cy + H, R, ry(R), 0, 0, Math.PI, false);      // dolny luk (przod)
        c.ellipse(cx, cy, R, ry(R), 0, Math.PI, 0, true);            // gorny luk wstecz
        c.closePath(); c.fill();
        // Pionowy "spad" scianki: jasna krawedz przy blacie, ciemniej przy podlodze (AO).
        const wallV = c.createLinearGradient(0, cy, 0, cy + ry(R) + H);
        wallV.addColorStop(0.0, 'rgba(255,255,255,0.10)');
        wallV.addColorStop(0.4, 'rgba(0,0,0,0.00)');
        wallV.addColorStop(1.0, 'rgba(0,0,0,0.45)');
        c.fillStyle = wallV;
        c.beginPath();
        c.ellipse(cx, cy + H, R, ry(R), 0, 0, Math.PI, false);
        c.ellipse(cx, cy, R, ry(R), 0, Math.PI, 0, true);
        c.closePath(); c.fill();
        // Dolna krawedz scianki: cienka ciemna linia = kontakt z podloga.
        c.strokeStyle = 'rgba(0,0,0,0.55)';
        c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(cx, cy + H, R, ry(R), 0, 0, Math.PI); c.stroke();

        // 3. BLAT: radialny gradient od swiatla (jasny) do krawedzi (ciemny).
        const topGrad = c.createRadialGradient(lx, ly, R * 0.05, cx, cy, R * 1.05);
        topGrad.addColorStop(0.00, '#4d5a75');
        topGrad.addColorStop(0.45, '#344057');
        topGrad.addColorStop(1.00, '#222a3a');
        c.fillStyle = topGrad;
        ell(cx, cy, R); c.fill();
        // Faza zewnetrzna blatu: jasna krawedz od strony swiatla, ciemna po przeciwnej.
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(255,255,255,0.22)';
        c.beginPath(); c.ellipse(cx, cy, R - 1, ry(R) - 1, 0, Math.PI * 1.05, Math.PI * 1.85); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.45)';
        c.beginPath(); c.ellipse(cx, cy, R - 1, ry(R) - 1, 0, Math.PI * 0.05, Math.PI * 0.85); c.stroke();

        // 4. SZWY PLYT: 8 promieni miedzy pierscieniami — czytelne, ale delikatne.
        c.strokeStyle = 'rgba(0,0,0,0.28)';
        c.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            c.beginPath();
            c.moveTo(cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * ry(R * 0.58));
            c.lineTo(cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * ry(R * 0.84));
            c.stroke();
        }

        // 5. PIERSCIEN OSTRZEGAWCZY (wglebiony): najpierw rowek (ciemny), potem segmenty.
        const rOut = R * 0.94;
        const rIn = R * 0.85;
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath();
        c.ellipse(cx, cy + 1.5, rOut + 1, ry(rOut) + 1, 0, 0, Math.PI * 2);
        c.ellipse(cx, cy + 1.5, rIn - 1, ry(rIn) - 1, 0, 0, Math.PI * 2, true);
        c.fill();
        const seg = (Math.PI * 2) / PAD_HAZARD_SEGMENTS;
        for (let i = 0; i < PAD_HAZARD_SEGMENTS; i++) {
            const a0 = i * seg;
            const a1 = a0 + seg;
            const mid = a0 + seg / 2;
            // Cieniowanie segmentu wzgledem swiatla: 1 = zwrocony do gory-lewej.
            const lit = 0.5 + 0.5 * Math.cos(mid - Math.PI * 1.25);
            const base: [number, number, number] = (i % 2 === 0) ? [242, 194, 48] : [27, 31, 43];
            const k = 0.72 + 0.38 * lit;
            const rr = Math.min(255, base[0] * k) | 0;
            const gg = Math.min(255, base[1] * k) | 0;
            const bb = Math.min(255, base[2] * k) | 0;
            c.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
            c.beginPath();
            c.ellipse(cx, cy, rOut, ry(rOut), 0, a0, a1);
            c.ellipse(cx, cy, rIn, ry(rIn), 0, a1, a0, true);
            c.closePath(); c.fill();
        }
        // Faza pierscienia: jasna krawedz wewnetrzna od gory, cien zewnetrzny od dolu.
        c.lineWidth = 1.5;
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.beginPath(); c.ellipse(cx, cy, rIn, ry(rIn), 0, Math.PI * 1.05, Math.PI * 1.9); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.40)';
        c.beginPath(); c.ellipse(cx, cy, rOut, ry(rOut), 0, Math.PI * 0.1, Math.PI * 0.9); c.stroke();

        // 6. WEWNETRZNY PIERSCIEN (wytloczony): ciemna linia pod, jasna nad.
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        ell(cx, cy + 1.5, R * 0.56); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.14)';
        ell(cx, cy, R * 0.56); c.stroke();
        // Rozblysk na blacie (specular) — miekka plama od strony swiatla.
        const spec = c.createRadialGradient(lx, ly, 0, lx, ly, R * 0.55);
        spec.addColorStop(0, 'rgba(255,255,255,0.16)');
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = spec;
        ell(cx, cy, R * 0.84); c.fill();

        // 7. SRUBY: 4 na osiach, kazda z cieniem, kloszem i highlightem.
        const boltR = Math.max(3.5, R * 0.05);
        const bd = R * 0.70;
        const bolts: Array<[number, number]> = [[bd, 0], [-bd, 0], [0, bd], [0, -bd]];
        for (const [bx, by] of bolts) {
            const x = cx + bx;
            const y = cy + ry(by);
            c.fillStyle = 'rgba(0,0,0,0.40)';
            c.beginPath(); c.ellipse(x + 1.5, y + 2, boltR, ry(boltR), 0, 0, Math.PI * 2); c.fill();
            const bg = c.createRadialGradient(x - boltR * 0.35, y - boltR * 0.35, 0, x, y, boltR);
            bg.addColorStop(0, '#6b7791');
            bg.addColorStop(0.6, '#3a4358');
            bg.addColorStop(1, '#161a26');
            c.fillStyle = bg;
            c.beginPath(); c.ellipse(x, y, boltR, ry(boltR), 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.35)';
            c.beginPath();
            c.ellipse(x - boltR * 0.3, y - boltR * 0.38, boltR * 0.32, ry(boltR * 0.32), 0, 0, Math.PI * 2);
            c.fill();
        }
    }

    /**
     * v0.199.0 (PERF) — PODIUM PIECZONE RAZ.
     *
     * Podium bylo rysowane OD ZERA w kazdej klatce (~60 sciezek + 8 gradientow), mimo ze
     * jego wyglad zalezy WYLACZNIE od: stylu (pad/disc), `cssPx`, `dpr`, `CAMERA_TILT_Y`
     * i `min(zoom, 1.15)`. Pierwsze cztery sa stale przez cale zycie instancji (canvas nie
     * ma resize handlera, tilt to stala render2d), wiec w praktyce re-bake zdarza sie tylko
     * przy zmianie zoomu. Idle spin i animowany wzor skina — czyli 100% normalnego czasu
     * w Garazu — nie kosztuja juz NIC poza jednym `drawImage`.
     *
     * Wyglad jest identyczny co do piksela, bo offscreen dostaje DOKLADNIE ten sam setup co
     * canvas widoczny: ten sam rozmiar bufora (cssPx * dpr), `setTransform(dpr,...)` i
     * `_lwBase = dpr`. To ostatnie jest krytyczne: `render2d` patchuje globalnie
     * `CanvasRenderingContext2D.prototype.stroke` i kompensuje `lineWidth` wzgledem
     * `_lwBase` vs skala transformu (render2d.ts:119-141). Bez tego pola obrysy podium
     * wyszlyby w innej grubosci niz przed zmiana.
     */
    let podiumTex: HTMLCanvasElement | null = null;
    let podiumKey = '';
    /** Rollback bez rebuildu (wzorzec ?skins=0 z v0.198.1): wraca rysowanie per klatka. */
    const podiumBake = ((): boolean => {
        try { return new URLSearchParams(window.location.search).get('podiumbake') !== '0'; }
        catch { return true; }
    })();

    function podiumTexture(): HTMLCanvasElement | null {
        if (!podiumBake) return null;
        // `zoom` wchodzi do rysunku wylacznie jako min(zoom, 1.15) — powyzej progu
        // podium zastyga, wiec zoom 1.2 i 1.4 trafiaja w ten sam bake.
        const pz = Math.min(zoom, 1.15);
        const tilt = (r2d && typeof r2d.CAMERA_TILT_Y === 'number') ? r2d.CAMERA_TILT_Y : 0.866;
        const key = `${podiumStyle}|${cssPx}|${dpr}|${pz.toFixed(3)}|${tilt}`;
        if (podiumTex && podiumKey === key) return podiumTex;

        try {
            const off = podiumTex ?? document.createElement('canvas');
            off.width = canvas.width;
            off.height = canvas.height;
            const oc = off.getContext('2d');
            if (!oc) return null;
            oc.setTransform(dpr, 0, 0, dpr, 0, 0);
            (oc as unknown as { _lwBase: number })._lwBase = dpr;
            oc.clearRect(0, 0, cssPx, cssPx);
            const cx = cssPx / 2;
            const cy = cssPx / 2;
            if (podiumStyle === 'disc') drawPodiumDisc(oc, cx, cy);
            else drawPodiumPad(oc, cx, cy + cssPx * 0.06);
            podiumTex = off;
            podiumKey = key;
            return off;
        } catch (e) {
            console.error('[TankTurntable] podium bake failed:', (e as Error).stack ?? e,
                { brawlerId: currentId, podiumStyle, cssPx, dpr });
            podiumTex = null;
            podiumKey = '';
            return null;
        }
    }

    function draw(): void {
        if (!ctx || !r2d) return;
        const b = currentBrawler();
        if (!b) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // _lwBase = dpr => grubosci kresek stale w CSS px i ostre na retinie
        // (ten sam hack co lab.ts:44 i TankSpriteBaker.bakeLayer).
        (ctx as unknown as { _lwBase: number })._lwBase = dpr;
        ctx.clearRect(0, 0, cssPx, cssPx);

        const cx = cssPx / 2;
        const cy = cssPx / 2;
        const s = (cssPx / ENVELOPE_PX) * zoom;

        // ── PODIUM (programistyczne — §10; normal-alpha, zero glow) ─────────
        // v0.199.0: jeden drawImage z bake'u zamiast ~60 sciezek per klatke.
        // Fallback na rysowanie wprost, gdyby bake padl (nigdy cichy brak podium).
        const pod = podiumTexture();
        if (pod) ctx.drawImage(pod, 0, 0, cssPx, cssPx);
        else if (podiumStyle === 'disc') drawPodiumDisc(ctx, cx, cy);
        else drawPodiumPad(ctx, cx, cy + cssPx * 0.06);

        // ── CZOLG (ten sam art co mecz — drawTank rysuje tez wlasny cien) ───
        ctx.save();
        ctx.translate(cx, cy + cssPx * 0.06);
        ctx.scale(s, s);
        const tank = {
            brawler: b,
            x: 0, y: 0,
            hullAngle, turretAngle,
            recoil: 0, pitch: 0,
            treadShift,
            hitFlashTimer: 0,
            isIdle: !dragging,
        };
        try {
            (r2d.drawTank as (c: CanvasRenderingContext2D, t: unknown) => void)(ctx, tank);
        } catch (e) {
            console.error('[TankTurntable] drawTank failed:', (e as Error).stack ?? e,
                { brawlerId: currentId });
        }
        ctx.restore();
        needsDraw = false;
    }

    function loop(now: number): void {
        if (destroyed) return;
        if (!canvas.isConnected) { handle.destroy(); return; } // DOM przebudowane -> koniec
        rafId = requestAnimationFrame(loop);
        if (document.hidden) return; // pauza w tle (bateria)
        const dt = lastT > 0 ? Math.min(0.1, (now - lastT) / 1000) : 0;
        lastT = now;
        frame++;

        // SKIN-2: animowany wzor zyje niezaleznie od spinu/draga (odporne na
        // ewentualne usuniecie auto-rotate) — redraw z throttle ~30 fps.
        if (skinAnimated && !reducedMotion) {
            skinElapsed += dt;
            if (frame % IDLE_FRAME_SKIP === 0) needsDraw = true;
        }

        if (!dragging && !reducedMotion) {
            hullAngle += IDLE_SPIN_RAD_S * dt;
            treadShift += IDLE_SPIN_RAD_S * dt * 26; // gasienice ida w rytmie obrotu
            needsDraw = true;
            if (frame % IDLE_FRAME_SKIP !== 0) return; // idle throttle ~30 fps
        }
        // wieza podaza za kadlubem z lekkim lagiem (gablota "zyje", nie sztywny klocek)
        const lag = turretAngle + (hullAngle - turretAngle) * Math.min(1, dt * 8);
        if (Math.abs(lag - turretAngle) > 0.0005) { turretAngle = lag; needsDraw = true; }

        if (needsDraw) draw();
    }

    // ── input: drag (poziomy) + pinch (2 pointery) ──────────────────────────
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    function onDown(e: PointerEvent): void {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        dragging = true;
        if (pointers.size === 2) {
            const [a, bb] = [...pointers.values()];
            pinchDist = Math.hypot(a.x - bb.x, a.y - bb.y);
        }
    }
    function onMove(e: PointerEvent): void {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        pointers.set(e.pointerId, cur);
        if (pointers.size === 2) {
            // pinch-zoom (fallbackiem sa przyciski +/- w sekcji)
            const [a, bb] = [...pointers.values()];
            const d = Math.hypot(a.x - bb.x, a.y - bb.y);
            if (pinchDist > 0) {
                zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (d / pinchDist)));
                needsDraw = true;
            }
            pinchDist = d;
            return;
        }
        const dx = cur.x - prev.x;
        if (dx !== 0) {
            hullAngle += dx * DRAG_RAD_PER_PX;
            treadShift += dx * 0.22; // Sensoryka: gasienice reaguja na rake
            needsDraw = true;
        }
    }
    function onUp(e: PointerEvent): void {
        pointers.delete(e.pointerId);
        pinchDist = 0;
        if (pointers.size === 0) dragging = false; // release -> idle auto-spin wraca
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const handle: TurntableHandle = {
        setBrawler(id: string): void {
            if (id === currentId) return;
            playUiClick();
            currentId = id;
            hullAngle = -Math.PI / 4; // nowy czolg wjezdza w kanonicznym 3/4
            turretAngle = hullAngle;
            needsDraw = true;
        },
        setSkin(hex: string | null, _filter3d: string | null = null,
            patternId: string | null = null, animated = false): void {
            if (hex === skinHex && patternId === skinPatternId
                && animated === skinAnimated) return;
            skinHex = hex;
            skinColors = null; // przeliczy sie leniwie przy najblizszym draw
            skinPatternId = patternId;
            skinAnimated = animated;
            needsDraw = true;
        },
        zoomBy(delta: number): void {
            zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta * ZOOM_STEP));
            needsDraw = true;
        },
        destroy(): void {
            if (destroyed) return;
            destroyed = true;
            cancelAnimationFrame(rafId);
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            // v0.199.0: zwolnij bake podium od razu (0x0 oddaje pamiec bufora, nie czeka na GC)
            if (podiumTex) { podiumTex.width = 0; podiumTex.height = 0; podiumTex = null; }
            podiumKey = '';
            if (activeHandle === handle) activeHandle = null;
        },
    };
    activeHandle = handle;

    // Dynamic import DOPIERO tutaj (guardrail patcha prototypu — patrz naglowek).
    import('../../experimental/tank25d/render2d')
        .then(mod => {
            if (destroyed) return;
            r2d = mod;
            needsDraw = true;
            canvas.classList.add('is-live'); // fade-in maskuje pierwszy frame
            rafId = requestAnimationFrame(loop);
        })
        .catch(e => {
            console.error('[TankTurntable] render2d import failed:', (e as Error).stack ?? e,
                { brawlerId });
        });

    return handle;
}
