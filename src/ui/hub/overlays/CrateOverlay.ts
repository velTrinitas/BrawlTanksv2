import { t } from '../../../i18n/i18n';
import { crateIcon } from '../gameIcons';
import { ProgressionService } from '../../../services/ProgressionService';
import { AudioSys } from '../../../audio/AudioSys';
import { getCosmetic, RARITY_COLOR, RARITY_LABEL_KEY, type Rarity } from '../../../config/cosmetics';
import { CRATE_RARITY_WEIGHTS, type CrateOpenResult } from '../../../config/progression';

/**
 * Art skrzynki (assety Mariusza, v0.131.0). Emoji 📦 bylo bitmapowe (mastery ~128 px)
 * i przy skalowaniu tapami do ~257 px widac bylo piksele.
 *
 * Wieko `crate_lid_512.png` jest w swoim pliku narysowane jako samodzielny obiekt na
 * srodku kadru, a NIE w pozycji, ktora zajmuje na zamknietej skrzyni. Offset startowy
 * nadaje wiec CSS (`.bt-hub0-crate-lid`, translateY -14%) — wartosc zmierzona
 * porownaniem zlozenia body+lid z gotowa `crate_closed`, zeby przy podmianie w
 * momencie wybuchu wieko nie podskoczylo.
 */
const CRATE_ART = {
    closed: `${import.meta.env.BASE_URL}assets/items/crate_closed_512.png`,
    body: `${import.meta.env.BASE_URL}assets/items/crate_body_512.png`,
    lid: `${import.meta.env.BASE_URL}assets/items/crate_lid_512.png`,
} as const;

/**
 * CrateOverlay (F2a §4, redesign v0.109.0 wg feedbacku Mariusza) — skrzynia (2x wieksza,
 * BEZ spadochroniarza) SPADA z gory i laduje z kurzem; 3 tapy (glow + powiekszanie),
 * 3. tap = blysk + zloty kurz + reveal z promieniami rzadkosci (wzorzec Brawl Stars).
 * Stara wersja: skrzynia na spadochronie, 3 tapy by otworzyc
 * (rosnace napiecie), reveal-karta (kolor rzadkosci + kosmetyk/duplikat + srubki),
 * jawne pule z % ("Co moze wypasc?"). Juice = CSS transform/opacity (mobile-safe, zero
 * PIXI/overdraw), prefers-reduced-motion respektowany w hub-styles. Wzorzec StatsOverlay.
 */
export class CrateOverlay {
    private el: HTMLElement | null = null;
    private tapsLeft = 3;
    private onDone: (() => void) | null = null;

    open(parent: HTMLElement, profileId: string, onDone: () => void): void {
        this.close();
        this.onDone = onDone;
        this.tapsLeft = 3;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = this.sceneHtml();
        parent.appendChild(this.el);
        this.wireScene(profileId);
    }

    private sceneHtml(): string {
        return `
            <div class="bt-hub0-modal bt-hub0-crate-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="done" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">${crateIcon(20)} ${t('crate.title')}</h3>
                <div class="bt-hub0-crate-scene">
                    <button class="bt-hub0-crate-box is-dropping" data-action="tap" type="button" aria-label="${t('crate.tap')}">
                        <img src="${CRATE_ART.closed}" alt="" draggable="false">
                    </button>
                    <div class="bt-hub0-crate-dust" aria-hidden="true"></div>
                </div>
                <div class="bt-hub0-crate-hint">${t('crate.tap')} (${this.tapsLeft}/3)</div>
                <button class="bt-hub0-rankfull" data-action="pools" type="button">${t('crate.pools')}</button>
            </div>`;
    }

    private wireScene(profileId: string): void {
        const el = this.el;
        if (!el) return;
        el.addEventListener('click', (e) => {
            const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
            if (action === 'done' || (e.target === el)) { this.close(); this.onDone?.(); }
            else if (action === 'tap') this.onTap(profileId);
            else if (action === 'pools') this.showPools();
        });
        // v0.144.0 — DZWIEK STARTUJE NA POCZATKU LOTU, NIE PO LADOWANIU.
        //
        // Zgloszenie z playtestu brzmialo „skrzynia spada za szybko, rozjazd z dzwiekiem",
        // ale pomiar pokazal co innego. Obwiednia RMS `crate_drop.mp3` (kubelki 50 ms):
        // uderzenie na 100 ms, cisza 450-600 ms, GLOWNY HUK na 650 ms, potem 800 ms
        // poglosu. Do v0.143.0 `playCrateDrop()` wisial na `animationend` (550 ms), wiec
        // huk padal na 1200 ms — 780 ms PO tym, jak skrzynia juz lezala.
        //
        // Spowolnienie spadania (o co prosil Michal) samo w sobie POGORSZYLOBY rozjazd,
        // bo przesuwa `animationend` razem ze startem dzwieku. Dlatego dzwiek rusza tu,
        // a czas spadania jest dobrany tak, zeby wizualne uderzenie (keyframe 76%)
        // wypadlo na 650 ms — patrz `bt-crate-drop` w hub-styles.css.
        AudioSys.getInstance().playCrateDrop();

        // v0.109.0 — ladowanie zrzutu: koniec animacji spadania => huk (thud modala)
        // + rozprysk kurzu przy ziemi. Tapowanie odblokowuje sie dopiero po ladowaniu
        // (pointer-events w CSS na .is-dropping).
        const box = el.querySelector<HTMLElement>('.bt-hub0-crate-box');
        box?.addEventListener('animationend', (ev) => {
            if ((ev as AnimationEvent).animationName !== 'bt-crate-drop') return;
            box.classList.remove('is-dropping');
            const modal = el.querySelector<HTMLElement>('.bt-hub0-crate-modal');
            modal?.classList.add('thud');
            // v0.131.0 — scena drga WLASNYM, krotszym wstrzasem niz modal: sam modal
            // dawal ruch calego okna, przez co uderzenie czytalo sie jako blad layoutu,
            // a nie jako masa spadajacej skrzyni.
            const scene = el.querySelector<HTMLElement>('.bt-hub0-crate-scene');
            scene?.classList.add('quake');
            setTimeout(() => scene?.classList.remove('quake'), 260);
            this.spawnDust(false);
        }, { once: true });
    }

    /**
     * v0.137.0 — ILE ISKIER leci przy otwarciu, per rzadkosc.
     *
     * Playtest Michala: „nie jestem w stanie rozroznic rarity skrzynek". Do v0.136.0
     * rzadkosc zmieniala WYLACZNIE ODCIEN — a kolor sam z siebie nie niesie hierarchii
     * (nikt nie wie, czy fiolet bije zloto). Roznica musi byc w ILOSCI i SILE, nie w barwie.
     *
     * Gorna granica 30 jest TWARDA i policzona pod mobile: to nadal jedna salwa
     * krotkozyjacych <i> na transform/opacity, sprzatana po 1100 ms. Zero PIXI.
     */
    private static readonly SPARKS_BY_RARITY: Record<Rarity, number> = {
        c: 14, r: 18, e: 24, l: 30,
    };

    /** Rzadkosci, ktore dostaja DRUGA, opozniona salwe — „petarda strzela, potem huk". */
    private static readonly DOUBLE_VOLLEY: ReadonlySet<Rarity> = new Set<Rarity>(['e', 'l']);

    /**
     * Rozprysk przy ziemi. `gold` = finalowe otwarcie (zlote kleby zamiast szarych),
     * `sparkColor` = dodatkowe ISKRY w kolorze rzadkosci (tylko przy wybuchu — rzadkosc
     * jest znana dopiero po `openCrate()`, czyli przy trzecim tapie).
     *
     * LIMITY sa twarde i celowe (mobile-first): 10 klebow + max 30 iskier na salwe,
     * czyste CSS transform/opacity, sprzatane po 1100 ms. Zero PIXI, zero overdraw.
     */
    private spawnDust(gold: boolean, sparkColor?: string, rarity?: Rarity): void {
        const dust = this.el?.querySelector<HTMLElement>('.bt-hub0-crate-dust');
        if (!dust) return;
        for (let i = 0; i < 10; i++) {
            const s = document.createElement('span');
            if (gold) s.className = 'gold';
            const ang = Math.PI * (1 + Math.random());            // gorna polkula (kurz idzie w boki/gore)
            const dist = 34 + Math.random() * 56;
            s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
            s.style.setProperty('--dy', `${Math.sin(ang) * dist * 0.6}px`);
            s.style.setProperty('--s', String(0.8 + Math.random() * 1.1));
            dust.appendChild(s);
        }
        if (sparkColor) {
            const rr = rarity ?? 'c';
            const count = CrateOverlay.SPARKS_BY_RARITY[rr];
            this.spawnSparkVolley(dust, sparkColor, count, 1);
            // Druga salwa leci PO pierwszej i szerzej — dopiero to czyta sie jako
            // „petarda", a nie jako jeden rozprysk. Wpiete przez setTimeout, bo ma
            // byc slyszalna przerwa miedzy wystrzalem a rozblyskiem.
            if (CrateOverlay.DOUBLE_VOLLEY.has(rr)) {
                setTimeout(() => this.spawnSparkVolley(dust, sparkColor, count, 1.45), 220);
            }
        }
        setTimeout(() => { dust.innerHTML = ''; }, 1100);
    }

    /** Jedna salwa iskier rozchodzaca sie promieniscie. `reach` skaluje zasieg. */
    private spawnSparkVolley(dust: HTMLElement, color: string, count: number, reach: number): void {
        for (let i = 0; i < count; i++) {
            const s = document.createElement('i');
            s.className = 'spark';
            // Wspolrzedne BIEGUNOWE, nie x/y: iskra ma byc obrocona ZGODNIE
            // z kierunkiem lotu, wiec kat steruje i obrotem, i przesunieciem.
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4; // pelny okrag, lekko rozstrojony
            s.style.setProperty('--rot', `${(ang * 180) / Math.PI}deg`);
            s.style.setProperty('--dist', `${(60 + Math.random() * 70) * reach}px`);
            s.style.setProperty('--rc', color);
            dust.appendChild(s);
        }
    }

    private onTap(profileId: string): void {
        if (!this.el) return;
        this.tapsLeft -= 1;
        const box = this.el.querySelector<HTMLElement>('.bt-hub0-crate-box');
        box?.classList.remove('shake'); void box?.offsetWidth; box?.classList.add('shake');
        box?.style.setProperty('--glow', String((3 - this.tapsLeft) / 3));
        // v0.109.0 — kazdy tap POWIEKSZA skrzynie (napiecie rosnie: 1.0 -> 1.09 -> 1.18)
        box?.style.setProperty('--tapscale', String(1 + (3 - this.tapsLeft) * 0.09));
        // Pitch rosnie z kazdym tapem (0 -> 1 -> 2) — napiecie ma narastac.
        AudioSys.getInstance().playCrateTap(3 - this.tapsLeft - 1);
        const hint = this.el.querySelector('.bt-hub0-crate-hint');
        if (this.tapsLeft > 0) {
            if (hint) hint.textContent = `${t('crate.tap')} (${this.tapsLeft}/3)`;
            return;
        }
        const result = ProgressionService.openCrate(profileId);
        if (!result) { this.close(); this.onDone?.(); return; } // brak skrzynek (nie powinno)

        // v0.131.0 — WIEKO ODLATUJE. Do v0.130.0 skrzynia po prostu rosla i gasla,
        // czyli otwarcie nie bylo w ogole pokazane. Teraz: obrazek podmienia sie na
        // skrzynie BEZ wieka, a samo wieko wylatuje w gore z obrotem jako osobny
        // element. Wieko nie jest wyrownane 1:1 do zamknietej skrzyni (narysowane jako
        // samodzielny obiekt na srodku swojego kadru), wiec pozycje startowa nadaje
        // CSS `.bt-hub0-crate-lid`, dopasowana do krawedzi otworu w `crate_body`.
        const img = box?.querySelector('img');
        if (img) img.src = CRATE_ART.body;
        const scene = this.el.querySelector<HTMLElement>('.bt-hub0-crate-scene');
        if (scene) {
            const lid = document.createElement('img');
            lid.className = 'bt-hub0-crate-lid';
            lid.src = CRATE_ART.lid;
            lid.alt = '';
            scene.appendChild(lid);
            const flash = document.createElement('div');
            flash.className = 'bt-hub0-crate-flash';
            // v0.137.0: rozblysk skaluje sie z rzadkoscia (CSS czyta data-rarity).
            flash.dataset.rarity = result.rarity;
            scene.appendChild(flash);
        }
        // Korpus gasnie DOPIERO po odlocie wieka (opoznienie 0.22 s w CSS) — inaczej
        // wieko odrywaloby sie od czegos, czego juz nie ma.
        box?.classList.add('is-bursting');
        // Podpowiedz „Tapnij (1/3)" MUSI zniknac razem ze skrzynia: przez ~700 ms do
        // revealu scena jest pusta, a instrukcja do tapania nadal wisiala pod spodem
        // i kazala klikac w cos, czego juz nie ma.
        if (hint) hint.textContent = '';

        AudioSys.getInstance().playCrateOpen();
        if (result.rarity === 'l') AudioSys.getInstance().playCrateLegendary();
        this.spawnDust(true, RARITY_COLOR[result.rarity], result.rarity);
        setTimeout(() => this.renderReveal(result), 700);
    }

    private renderReveal(r: CrateOpenResult): void {
        if (!this.el) return;
        const color = RARITY_COLOR[r.rarity];
        const cosDef = r.cosmeticId ? getCosmetic(r.cosmeticId) : undefined;
        const rewardLine = cosDef
            ? `<div class="bt-hub0-reveal-cos">${t('crate.newCosmetic')}<b>${t(cosDef.labelKey)}</b></div>`
            : `<div class="bt-hub0-reveal-cos">${t('crate.dup')}</div>`;
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-hub0-crate-modal" role="dialog" aria-modal="true">
                <div class="bt-hub0-reveal" data-rarity="${r.rarity}" style="--rc:${color};">
                    <div class="bt-hub0-reveal-rays" aria-hidden="true"></div>
                    <div class="bt-hub0-reveal-rarity" style="color:${color};">${t(RARITY_LABEL_KEY[r.rarity])}</div>
                    ${rewardLine}
                    <div class="bt-hub0-reveal-bolts"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""> +${r.bolts} ${t('crate.bolts')}</div>
                    <button class="bt-hub0-play" data-action="done" type="button">${t('common.close')}</button>
                </div>
            </div>`;
        // re-wire (nowy DOM)
        this.el.querySelector('[data-action="done"]')?.addEventListener('click', () => { this.close(); this.onDone?.(); });
    }

    private showPools(): void {
        if (!this.el) return;
        const rows = (['l', 'e', 'r', 'c'] as Rarity[]).map(rr => `
            <div class="bt-hub0-rankrow">
                <span class="pos" style="color:${RARITY_COLOR[rr]};">●</span>
                <span class="who">${t(RARITY_LABEL_KEY[rr])}</span>
                <span class="pts">${CRATE_RARITY_WEIGHTS[rr]}%</span>
            </div>`).join('');
        this.el.innerHTML = `
            <div class="bt-hub0-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="back" type="button" aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">${t('crate.pools')}</h3>
                <div class="bt-hub0-ranklist">${rows}</div>
            </div>`;
        this.el.querySelector('[data-action="back"]')?.addEventListener('click', () => { this.close(); this.onDone?.(); });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }
}
