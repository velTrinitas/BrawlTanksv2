import type { IScreen } from '../MainMenu';
import { t } from '../../i18n/i18n';
import { ProfileService } from '../../services/ProfileService';
import { ProgressionService } from '../../services/ProgressionService';
import type { ScenarioId } from '../../types/Scenario';
import type { MapId } from '../../types/MapType';
import type { HubSection, HubSelection } from './sections/HubSection';
import { BattleSection } from './sections/BattleSection';
import { GarageSection } from './sections/GarageSection';
import { LoadoutOverlay } from './overlays/LoadoutOverlay'; // GARAZ-3 — wybor mocy (?choose=1)
import { SkinsOverlay } from './overlays/SkinsOverlay';     // GARAZ v2 — przymierzalnia barw
import { sessionService } from '../../services/SessionService';  // GARAZ-2 — seed HubSelection
import { BRAWLERS } from '../../config/brawlers';                // GARAZ-2 — walidacja seedu
import { QuestsSection } from './sections/QuestsSection';
import { attachRipple, countUp, floatDelta, retrigger, stagger, flyCoins } from './juice'; // v0.208.0 — MENU JUICE
import { playUiClick, playUiSelect } from '../uiSounds';                                    // v0.208.0 — dock mial ZERO dzwieku
import { haptic, HAPTIC } from '../../input/Haptics';                                       // v0.208.0
import { AudioSys } from '../../audio/AudioSys';                                            // v0.208.0 — stingery sekcji
import { QuestService } from '../../services/QuestService'; // v0.207.0 — kropka ROZKAZY
import { TrophyRoadSection } from './sections/TrophyRoadSection';
import { RankSection } from './sections/RankSection';
import { ProfileSection } from './sections/ProfileSection'; // PROFILE-1 (zastapil StatsOverlay)
import { ShopSection } from './sections/ShopSection';       // SHOP-1
import { ShopOverlay } from './overlays/ShopOverlay';       // SHOP-1
import { isShopEnabled } from '../../config/shop';          // SHOP-1
import { CrateOverlay } from './overlays/CrateOverlay';
import { getCosmetic, nickColorStyle, frameStyle, avatarBgStyle } from '../../config/cosmetics'; // F2a
import { AVATARS } from '../../config/avatars'; // PROFILE-1 — miniatura w chipie
import { seasonShortKey } from '../../config/season'; // SEASON-1/2 — pill sezonu
import { SeasonSection } from './sections/SeasonSection'; // v0.129.0 — strona sezonu
import { MapPickerOverlay } from './overlays/MapPickerOverlay'; // v0.127.0 — wybor mapy 3x2
import { RankUpOverlay } from './overlays/RankUpOverlay'; // RANKS-1 — celebracja awansu
import type { DifficultyId } from '../../types/GameConfig'; // HUB-1.5

import './hub-styles.css';
import './shop-styles.css'; // SHOP-1 — izolacja per-feature (design-values.md)

/**
 * HubShell — Menu Hub „COMMAND DECK” (HUB-0, DOM-overlay za flaga ?hub=1).
 *
 * IScreen (wzorzec LeaderboardScreen): buduje wlasny root .bt-hub0-screen, montuje w
 * kontenerze MainMenu (ktory daje warstwe fixed inset:0). Chrome = gorny readout
 * (profil + 2 waluty Trofea/Srubki + ⚙️ + tab S2) + nawigacja (rail desktop / dock
 * mobile — jeden element .bt-hub0-nav, orientacje robi CSS via body.bt-desktop) +
 * content routujacy 5 sekcji. HUB-0: sekcje to stuby; tresc dochodzi w HUB-1+.
 *
 * Nawigacja i akcje przez nullable callbacki (jak inne ekrany) — HubShell nie importuje
 * logiki MainMenu. Match-launch idzie przez onPlay → MainMenu.show('scenarioPicker')
 * (HUB-0 nie buduje wlasnego GRAJ-flow — to HUB-1).
 */

type SectionId = 'battle' | 'garage' | 'shop' | 'quests' | 'trophies' | 'rank' | 'profile' | 'season';

/**
 * v0.126.0 — ktore sekcje maja PRZYCISK W NAWIGACJI. Reszta jest normalnie renderowana,
 * tylko wchodzi sie do niej inaczej (decyzja Mariusza po playtescie A54):
 *  - TROFEA  -> pigulka 🏆 na gornej belce,
 *  - PROFIL  -> chip gracza (tak bylo od PROFILE-1).
 * Dok na telefonie schudl z 6 przyciskow do 4 + GRAJ — duplikowanie wejscia do tej samej
 * sekcji zjadalo tam szerokosc i nic nie wnosilo.
 *
 * SKLEP i TROFEA sa wyjatkami: siedza w tym zbiorze, ale CSS chowa je na dotyku
 * (`body:not(.bt-desktop)`). Powod: pionowy rail desktopu ma miejsca pod dostatkiem,
 * a dok telefonu nie — wiec tam zostaja same pigulki gornej belki (sigmy i 🏆).
 * v0.128.0: TROFEA dolaczyly do SKLEPU, ktory wrocil do railu w v0.126.0.
 */
const NAV_SECTIONS: ReadonlySet<string> = new Set(['battle', 'garage', 'shop', 'quests', 'trophies', 'rank']);

export class HubShell implements IScreen {
    private rootEl: HTMLElement | null = null;
    private activeSection: SectionId = 'battle';
    /** PROG-F2b — odsubskrybowanie nasluchu "chmura domergowala progresje". */
    private unsubscribeSync: (() => void) | null = null;

    /**
     * GARAZ-2 (v0.156.0) — WSPOLNY wybor czolgu (jedno zrodlo prawdy dla gridu
     * w BITWIE i obrotnicy w GARAZU). Seed = dawna logika BattleSection 1:1:
     * LastSession (walidowany) -> BRAWLERS[0]. Zywotnosc = zywotnosc shella,
     * wiec dock GRAJ z KAZDEJ sekcji startuje tym samym, aktualnym wyborem.
     * UWAGA kolejnosc pol: hubSel MUSI byc zadeklarowany przed battle/garage
     * (inicjalizatory pol biegna w kolejnosci deklaracji).
     */
    private readonly hubSel: HubSelection = (() => {
        const last = sessionService.getLastSession();
        const ok = !!last && BRAWLERS.some(b => b.id === last.brawlerId);
        return { brawlerId: ok && last ? last.brawlerId : (BRAWLERS[0]?.id ?? 'twardy') };
    })();
    private readonly battle = new BattleSection(this.hubSel);
    private readonly garage = new GarageSection(this.hubSel);
    /** GARAZ-3 — pelnoekranowy wybor mocy; otwierany tylko z Garaza (?choose=1). */
    private readonly loadout = new LoadoutOverlay();
    /** GARAZ v2 — przymierzalnia barw czolgu (duzy czolg + siatka, WYSIWYG). */
    private readonly skins = new SkinsOverlay();
    private readonly quests = new QuestsSection();
    /** v0.208.0 — trzymany z nazwy, bo HubShell podaje mu `prevTrophies` (pasek dojezdza). */
    private readonly trophyRoad = new TrophyRoadSection();
    /** v0.208.0 (J4) — ostatnio POKAZANE wartosci belki; roznica = count-up + „+N". */
    private lastReadout: { trophies: number; bolts: number } | null = null;
    private readonly rank = new RankSection();
    /** SHOP-1 — sekcja tylko za flaga ?shop=1 (towar to jeszcze placeholdery). */
    private readonly shop = new ShopSection();
    private readonly shopModal = new ShopOverlay();
    /** PROFILE-1 — strona profilu (ukryta sekcja poza nav, wejscie przez chip). */
    private readonly profile = new ProfileSection();
    private readonly crate = new CrateOverlay();
    /** v0.129.0 — SEZON jako pelna strona (byl popup); wejscie przez pill na belce. */
    private readonly season = new SeasonSection();
    /** v0.127.0 — wybor mapy KTB w popupie (siatka 3x2) zamiast listy inline. */
    private readonly mapPicker = new MapPickerOverlay();

    /** RANKS-1 — spektakularna celebracja awansu rangi. */
    private readonly rankUp = new RankUpOverlay();
    private readonly sections: HubSection[];
    /** Sekcja, z ktorej otwarto profil — ← wraca dokladnie tam. */
    private prevSection: SectionId = 'battle';

    // callbacki wpinane przez MainMenu.createHub0Screen()
    public onOpenSettings: (() => void) | null = null;
    public onOpenLeaderboard: (() => void) | null = null;
    /** HUB-1.5: pelny wybor z BITWY — MainMenu buduje GameConfig i startuje mecz od razu. */
    public onPlay: ((scenario: ScenarioId, map: MapId, brawlerId: string, difficulty: DifficultyId) => void) | null = null;

    constructor() {
        // HUB-1.5b: wybor czolgu zyje INLINE w BattleSection (grid 8 kart) —
        // hub tylko przekazuje pelny wybor do MainMenu (bezposredni start meczu).
        this.battle.onPlay = (scenario, map, brawlerId, difficulty) =>
            this.onPlay?.(scenario, map, brawlerId, difficulty);
        // v0.127.0 — sekcja prosi o popup mapy, shell montuje go w swoim roocie
        // (ta sama sciezka co CrateOverlay / SeasonOverlay).
        this.battle.onOpenMapPicker = (selected, pick, cards) => {
            if (this.rootEl) this.mapPicker.open(this.rootEl, selected, pick, cards);
        };
        this.rank.onOpenLeaderboard = () => this.onOpenLeaderboard?.();
        // F2a — GARAŻ: OTWÓRZ skrzynkę => CrateOverlay; po zamknięciu re-render GARAŻU
        // v0.130.0 FIX (zgloszenie z playtestu "sigmy ze skrzynek nie dodaja sie do puli"):
        // sigmy DODAWALY sie poprawnie (`openCrate` robi `st.bolts += result.bolts` i zapisuje),
        // ale ta jedna sciezka jako JEDYNA nie odswiezala gornej belki — licznik stal
        // w miejscu do czasu przejscia miedzy sekcjami, wiec wygladalo to na zgubione
        // sigmy. Wszystkie pozostale sciezki skrzynek (rozkazy, zakup w sklepie) mialy
        // `refreshReadout()` od v0.126.0; garazowa, czyli ta pierwotna, zostala w tyle.
        // GARAZ-3 — Garaz prosi o pelnoekranowy wybor mocy, shell montuje go
        // w swoim roocie (ta sama sciezka co CrateOverlay). Po zamknieciu
        // targeted refresh rzedu slotow (obrotnica NIE remountuje sie).
        // v0.199.1 (Mariusz: "szerokosc strony z wyborem mocy ma byc jak RANKING i ROZKAZY"):
        // overlay montuje sie w `.bt-hub0-main`, czyli w tej samej kolumnie tresci co sekcje
        // (te same gutter'y desktopu). Wczesniej szedl w `rootEl` i przykrywal rail + topbar,
        // przez co byl szerszy niz kazdy inny ekran hubu.
        // v0.208.0 (C) — zablokowana moc w loadoucie prowadzi do SWOJEGO wezla na Szlaku.
        this.loadout.onShowOnRoad = (threshold) => this.openRoadAt(threshold);
        this.garage.onOpenLoadout = (slot) => {
            const host = this.rootEl?.querySelector<HTMLElement>('.bt-hub0-main') ?? this.rootEl;
            if (host) this.loadout.open(host, this.pid(), slot,
                () => this.garage.refreshSlots());
        };
        // SKIN-1 — hint preview skina prowadzi do SKLEPU (gdy sklep w nawigacji)
        this.garage.onOpenShop = () => {
            if (isShopEnabled()) this.setActive('shop');
        };
        // GARAZ v2 — PRZYMIERZALNIA barw. Overlay montuje wlasna obrotnice (singleton
        // modulu ubija gablote Garazu), wiec `onDone` MUSI ja przemontowac.
        // Zakup: Garaz przymierza, Sklep sprzedaje — CTA prowadzi wprost do karty SKU.
        this.garage.onOpenSkins = () => {
            if (!this.rootEl) return;
            this.skins.open(this.rootEl, {
                pid: this.pid(),
                brawlerId: this.hubSel.brawlerId,
                flagId: ProfileService.getActiveProfile()?.flagId ?? null,
                onBuy: (sku) => {
                    if (!isShopEnabled()) return;
                    this.setActive('shop');
                    if (this.rootEl) this.shopModal.openDetail(this.rootEl, sku, this.pid());
                },
                onDone: () => this.garage.refreshAfterSkins(),
            });
        };
        this.garage.onOpenCrate = () => {
            if (this.rootEl) this.crate.open(this.rootEl, this.pid(), () => {
                this.refreshReadout();
                this.renderMain();
            });
        };
        // PROFILE-1 — powrot ze strony profilu + refresh readoutu po zmianach
        // (awatar/nick/kosmetyk zmieniaja chip na zywo).
        this.profile.onBack = () => this.setActive(this.prevSection);
        this.profile.onProfileChanged = () => this.refreshReadout();
        // v0.126.0 — pigulki w profilu prowadza do TROFEOW / SKLEPU (obie sekcje wypadly
        // z doku, wiec potrzebuja drugiego wejscia poza pigulkami gornej belki).
        this.profile.onNavigate = (id) => this.setActive(id);
        // SEASON-2 — CTA strony sezonu prowadzi do Season Tracku w TROFEA.
        this.season.onViewTrack = () => this.openSeasonTrack();
        // PROG-F3 — nagroda za rozkaz zmienia srubki (readout) i moze dosypac skrzynke (GARAŻ).
        this.quests.onRewardClaimed = ({ bolts, from }) => {
            // J6 — sigmy leca do coina; count-up rusza przy PIERWSZEJ monecie, nie przy kliknieciu.
            haptic(HAPTIC.reward);
            const coin = this.rootEl?.querySelector<HTMLElement>('[data-coin="bolts"]') ?? null;
            if (bolts > 0 && from && coin) {
                let started = false;
                flyCoins(from, coin, Math.ceil(bolts / 40), `${import.meta.env.BASE_URL}assets/sigma.png`, () => {
                    if (started) { retrigger(coin.querySelector('.bt-sigma'), 'is-tick'); return; }
                    started = true;
                    this.refreshReadout();
                });
            } else {
                this.refreshReadout();
            }
        };
        // v0.126.0 — skrzynka z rozkazu otwiera sie OD RAZU, tym samym overlayem co
        // w Garazu i sklepie. Wczesniej ladowala po cichu w Garazu i gracz mial pelne
        // prawo myslec, ze klikniecie ODBIERZ nic nie zrobilo.
        this.quests.onCratesGranted = () => {
            if (this.rootEl) this.crate.open(this.rootEl, this.pid(), () => {
                this.refreshReadout();
                this.renderMain();
            });
        };
        // SHOP-1 — kafel otwiera modal szczegolow; zakup odswieza siatke I belke
        // (saldo zyje w dwoch miejscach naraz, wiec musi sie zgadzac bez wychodzenia).
        this.shop.onOpenItem = (sku) => {
            if (this.rootEl) this.shopModal.openDetail(this.rootEl, sku, this.pid());
        };
        this.shop.onBalanceChanged = () => this.refreshReadout();
        this.shopModal.onPurchased = () => {
            this.refreshReadout();
            this.renderMain();
        };
        // Kupiona skrzynka otwiera sie OD RAZU — ten sam overlay co w GARAZU, zero
        // nowego flow. Zakup, po ktorym nic sie nie dzieje, to zla sensoryka, a przy
        // wydanych sigmach takze zla Czytelnosc ("zaplacilem i co?").
        this.shopModal.onCratesBought = () => {
            if (this.rootEl) this.crate.open(this.rootEl, this.pid(), () => {
                this.refreshReadout();
                this.renderMain();
            });
        };
        this.sections = [
            this.battle,
            this.garage,
            // SHOP-1: SKLEP siedzi zaraz za GARAZEM (tematycznie sasiaduje ze skrzynkami
            // i kosmetyka). Bez flagi w ogole nie wchodzi do nawigacji.
            ...(isShopEnabled() ? [this.shop] : []),
            this.quests,
            this.trophyRoad,
            this.rank,
            // v0.129.0 — SEZON poza NAV_SECTIONS: wejsciem jest pill na belce, tak jak
            // PROFIL wchodzi chipem gracza. Sekcja renderuje sie normalnie.
            this.season,
        ];
    }

    private pid(): string {
        return ProfileService.getActiveProfile()?.id ?? 'default';
    }

    /** F2a — odswiez tylko gorny readout (po equip kosmetyku). */
    private refreshReadout(): void {
        const top = this.rootEl?.querySelector('.bt-hub0-top') as HTMLElement | null;
        if (!top) return;
        const prev = this.lastReadout;
        const cur = this.readoutValues();
        top.innerHTML = this.renderReadout();
        // v0.208.0 (J4) — liczby NABIJAJA sie od poprzednio pokazanej wartosci, ikona
        // podskakuje co ~10% drogi, na koncu wylatuje „+N". Do tej wersji liczba po meczu
        // po prostu byla inna — gracz nie widzial, ze mecz cos dal.
        if (prev) {
            this.animateCoin(top, 'trophies', prev.trophies, cur.trophies);
            this.animateCoin(top, 'bolts', prev.bolts, cur.bolts);
            if (cur.trophies > prev.trophies) this.trophyRoad.prevTrophies = prev.trophies;
        }
        this.lastReadout = cur;
        // v0.207.0 — kropki na doku jada na tej samej sciezce co readout: mount, powrot
        // z meczu, merge z chmury, otwarcie skrzynki, odebranie rozkazu. Zero nowych hookow.
        this.refreshBadges();
    }

    /**
     * v0.207.0 (Mariusz, playtest mobile: "skrzynki w Garazu trudno zidentyfikowac").
     * Kryterium kropki jest JEDNO: akcja gracza czeka i ZNIKNIE po kliknieciu. Nie
     * "nowosc", nie "informacja" — inaczej po tygodniu kropki sa wszedzie i gracz
     * przestaje je widziec. Dlatego tylko GARAZ (nieotwarte skrzynki) i ROZKAZY
     * (ukonczone, nieodebrane). Pucharki/Sezon wyplacaja sie same i wracaja tu jako
     * skrzynki, wiec ich kropka bylaby duplikatem.
     */
    private readoutValues(): { trophies: number; bolts: number } {
        const pid = this.pid();
        return { trophies: ProgressionService.getTrophies(pid), bolts: ProgressionService.getBoltsBalance(pid) };
    }

    private animateCoin(top: HTMLElement, coin: 'trophies' | 'bolts', from: number, to: number): void {
        if (from === to) return;
        const host = top.querySelector<HTMLElement>(`[data-coin="${coin}"]`);
        const valEl = host?.querySelector<HTMLElement>('.val');
        if (!host || !valEl) return;
        const icon = host.querySelector('.ic, .bt-sigma');
        // 1400 ms (bylo 650): playtest A54 — „wolniej, zeby cieszylo oko".
        countUp(valEl, from, to, 1400, () => retrigger(icon, 'is-tick'));
        floatDelta(host, to - from);
    }

    /**
     * v0.208.0 (C) — z zablokowanej mocy w loadoucie prosto do JEJ wezla na Szlaku:
     * overlay zamyka sie, sekcja PUCHARKI, wezel w centrum + dwa pulsy zlotej obwodki.
     */
    openRoadAt(threshold: number): void {
        this.loadout.close();
        this.setActive('trophies');
        const main = this.rootEl?.querySelector<HTMLElement>('.bt-hub0-main');
        requestAnimationFrame(() => {
            const node = main?.querySelector<HTMLElement>(`[data-threshold="${threshold}"]`);
            if (!node) { console.warn('[HubShell] openRoadAt: no node for', threshold); return; }
            // Natychmiast, nie smooth: smooth przegrywal wyscig z animacjami wejscia sekcji
            // (wezel zostawal poza kadrem). Puls obwodki robi robote „patrz tu".
            node.scrollIntoView({ block: 'center', behavior: 'auto' });
            retrigger(node, 'is-spotlight');
        });
    }

    /** v0.208.0 (J2) — wskaznik aktywnej sekcji JEDZIE po docku (mobile: pasek pod
     *  przyciskiem, desktop: kreska przy lewej krawedzi railu) zamiast znikac i pojawiac sie. */
    private positionNavIndicator(): void {
        const nav = this.rootEl?.querySelector<HTMLElement>('.bt-hub0-nav');
        const ind = nav?.querySelector<HTMLElement>('.bt-hub0-navind');
        const btn = nav?.querySelector<HTMLElement>('.bt-hub0-navbtn.is-active');
        if (!nav || !ind) return;
        if (!btn) { ind.style.opacity = '0'; return; }
        ind.style.opacity = '1';
        if (document.body.classList.contains('bt-desktop')) {
            ind.style.transform = `translate(0px, ${btn.offsetTop}px)`;
            ind.style.width = '3px'; ind.style.height = `${btn.offsetHeight}px`;
        } else {
            const pad = 10;
            ind.style.transform = `translate(${btn.offsetLeft + pad}px, 0px)`;
            ind.style.width = `${Math.max(0, btn.offsetWidth - pad * 2)}px`; ind.style.height = '3px';
        }
    }

    private badgeCounts(): Partial<Record<SectionId, number>> {
        const pid = this.pid();
        const out: Partial<Record<SectionId, number>> = {};
        try {
            out.garage = ProgressionService.getCosmeticState(pid).crateCount;
            const board = QuestService.getBoard(pid, ProgressionService.getSnapshot(pid).trophies);
            if (board.unlocked) {
                const claimable = (q: { done: boolean; claimed: boolean }) => q.done && !q.claimed;
                out.quests = board.daily.filter(claimable).length
                    + board.weekly.filter(claimable).length
                    + (board.dailySetReady && !board.dailySetClaimed ? 1 : 0)
                    + (board.weeklySetReady && !board.weeklySetClaimed ? 1 : 0);
            }
        } catch (err) {
            console.error('[HubShell] badgeCounts failed', pid, (err as Error).stack ?? err);
        }
        return out;
    }

    /** DOM-patch, nie re-render: chrome doku nie jest odswiezany po meczu, wiec kropka
     *  wpisana w szablon gnilaby. Jeden <i> w .gi (przy ikonie — dziala i w row, i w column).
     *  Bez liczby (Mariusz: liczby zabijaly czytelnosc) — licznik jest na chipie w Garazu. */
    private refreshBadges(): void {
        if (!this.rootEl) return;
        const counts = this.badgeCounts();
        this.rootEl.querySelectorAll<HTMLElement>('.bt-hub0-navbtn[data-section]').forEach(btn => {
            const id = btn.dataset.section as SectionId;
            const n = counts[id] ?? 0;
            const host = btn.querySelector('.gi');
            if (!host) return;
            let dot = host.querySelector<HTMLElement>('.bt-hub0-dot');
            if (n <= 0) { dot?.remove(); return; }
            if (!dot) { dot = document.createElement('i'); dot.className = 'bt-hub0-dot'; host.appendChild(dot); }
        });
    }

    mount(root: HTMLElement): void {
        // PROG-F2b — syncPull startuje na boocie fire-and-forget (main.ts), wiec hub potrafi
        // wyrenderowac sie zanim chmura wroci. Po domergowaniu odswiez readout + aktywna sekcje
        // (inaczej gracz po zmianie urzadzenia widzi stara kolekcje az do restartu).
        this.unsubscribeSync?.();
        this.unsubscribeSync = ProgressionService.subscribeSync(() => {
            if (!this.rootEl) return;
            this.refreshReadout();
            this.renderMain();
            this.maybeCelebrateRank(); // RANKS-1 — awans domergowany z chmury
        });

        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-hub0-screen';
        this.rootEl.innerHTML = this.renderChrome();
        root.appendChild(this.rootEl);
        this.wire();
        this.refreshBadges(); // v0.207.0 — mount maluje chrome bez refreshReadout, wiec kropki osobno
        attachRipple(this.rootEl);            // v0.208.0 (J1) — ripple + squash + haptyka na kazdy tap
        this.lastReadout = this.readoutValues(); // J4: pierwszy render bez count-upu
        this.renderMain();
        this.positionNavIndicator();
        // Hub zyje przez cala sesje (MainMenu trzyma go schowanego w meczu) — jeden listener.
        window.addEventListener('resize', () => this.positionNavIndicator(), { passive: true });
        this.maybeCelebrateRank(); // RANKS-1 — awans z ostatniego meczu (powrot do huba)
    }

    /**
     * RANKS-1 fix: powrot z meczu NIE remountuje huba (MainMenu.show ma guard
     * "juz na hubie" — hub zyje schowany przez caly mecz), wiec mount-trigger
     * celebracji nie odpalal. MainMenu.showHub wola ten hook przy re-show:
     * odswieza readout (trofea/sigmy z meczu) + sekcje + sprawdza awans.
     */
    onReshown(): void {
        if (!this.rootEl) return;
        this.refreshReadout();
        this.renderMain();
        this.maybeCelebrateRank();
    }

    /**
     * RANKS-1: odpal celebracje awansu, gdy ranga czeka na pokazanie
     * (rankShown < poziom). Po zamknieciu stemplujemy rankShown (takze sync),
     * a readout/sekcja odswieza sie z nowa ranga i naliczonymi nagrodami.
     */
    private maybeCelebrateRank(): void {
        if (!this.rootEl || this.rankUp.isOpen) return;
        const pid = this.pid();
        const pending = ProgressionService.getRankState(pid).pendingCelebration;
        if (!pending) return;
        this.rankUp.open(this.rootEl, pending, () => {
            ProgressionService.markRankShown(pid, pending.level);
            this.refreshReadout();
            this.renderMain();
        });
    }

    unmount(): void {
        this.unsubscribeSync?.();
        this.unsubscribeSync = null;
        this.crate.close();
        this.rankUp.close();
        this.shopModal.close();
        this.loadout.close(); // GARAZ-3
        this.skins.close();   // GARAZ v2
        this.rootEl?.remove();
        this.rootEl = null;
    }

    // ── render ──────────────────────────────────────────────────────────────
    private renderChrome(): string {
        // v0.108.0 — BITWA dostala modyfikator `--battle` (wtedy: wyniesiony zloty FAB).
        // v0.206.0 (Mariusz, playtest mobile): FAB ZDJETY — przycisk nazywa sie TRYB GRY
        // i wyglada jak reszta doku; zloto i ⚔️ przeszly na GRAJ, bo to TAM zaczyna sie
        // walka. Modyfikator zostaje jako hak (dzis bez stylu).
        const nav = this.sections
            .filter(s => NAV_SECTIONS.has(s.id))
            .map(s => `
            <button class="bt-hub0-navbtn${s.id === 'battle' ? ' bt-hub0-navbtn--battle' : ''}${s.id === this.activeSection ? ' is-active' : ''}"
                    data-section="${s.id}" type="button">
                <span class="gi" aria-hidden="true">${s.icon}</span>
                <small>${s.label()}</small>
            </button>`).join('');

        // v0.126.0 — GRAJ W DOKU (decyzja Mariusza po playtescie A54): glowna akcja gry
        // ma byc pod kciukiem z KAZDEGO ekranu huba, nie tylko z sekcji BITWA. Startuje
        // biezacym wyborem (`BattleSection.startCurrentMatch`), wiec nie trzeba tam wchodzic.
        // Widoczny TYLKO na mobile — na desktopie zostaje pasek akcji w sekcji BITWA,
        // bo pionowy rail nie jest miejscem na akcje domykajaca.
        const play = `
            <button class="bt-hub0-navbtn bt-hub0-navbtn--play" data-action="play-dock" type="button"
                    aria-label="${t('hub.play')}">
                <span class="np-ico" aria-hidden="true">⚔️</span>
                <span class="np-label">${t('hub.play')}</span>
                <span class="np-arrow" aria-hidden="true">»</span>
            </button>`;

        return `
            <div class="bt-hub0-top">${this.renderReadout()}</div>
            <nav class="bt-hub0-nav">${nav}${play}<i class="bt-hub0-navind" aria-hidden="true"></i></nav>
            <div class="bt-hub0-main"></div>
        `;
    }

    private renderReadout(): string {
        const profile = ProfileService.getActiveProfile();
        const name = profile?.nickname ?? 'Brawler';
        const pid = profile?.id ?? 'default';
        const trophies = ProgressionService.getTrophies(pid);
        // SHOP-1: belka pokazuje SALDO (zdobyte - wydane), nie lifetime. Gracz mysli
        // "ile moge wydac", a nie "ile kiedykolwiek zebralem". Bez sklepu obie liczby
        // sa identyczne, wiec dla istniejacych kont nic sie nie zmienia.
        const bolts = ProgressionService.getBoltsBalance(pid);

        // F2a — equipped kosmetyki (kolor nicku / ramka avatara). PROFILE-1: tytul
        // WYCIETY z chipa (kolidowal z planowanymi Rangami Zalog), chip pokazuje
        // MINIATURE awatara (PNG) zamiast litery — tap otwiera strone profilu.
        const cos = ProgressionService.getCosmeticState(pid);
        const nickDef = cos.equipped.nickColor ? getCosmetic(cos.equipped.nickColor) : undefined;
        const frameDef = cos.equipped.frame ? getCosmetic(cos.equipped.frame) : undefined;
        // v0.144.0 — tlo pod awatarem. Pusty string gdy nic nie zalozone => zostaje
        // domyslny gradient z `.bt-hub0-avatar`, czyli wyglad sprzed zmiany.
        const bgDef = cos.equipped.avatarBg ? getCosmetic(cos.equipped.avatarBg) : undefined;
        const nickStyle = nickColorStyle(nickDef);
        const shimmer = nickDef?.animated ? ' bt-cos-shimmer' : '';
        const avatarInner = profile
            ? `<img src="${import.meta.env.BASE_URL}${AVATARS[profile.avatarId].assetPath}" alt="" draggable="false">`
            : name.charAt(0).toUpperCase();

        return `
            <button class="bt-hub0-profile" data-action="profile" type="button">
                <span class="bt-hub0-avatar" aria-hidden="true" style="${avatarBgStyle(bgDef)}${frameStyle(frameDef)}">${avatarInner}</span>
                <span class="bt-hub0-pname${shimmer}" style="${nickStyle}">${name}</span>
            </button>
            <span class="bt-hub0-spacer"></span>
            <span class="bt-hub0-wallet">
                <button class="bt-hub0-coin bt-hub0-coin--btn" data-action="trophies" type="button"
                        aria-label="${t('hub.nav.trophies')}" data-coin="trophies"><span class="ic" aria-hidden="true">🏆</span><span class="val">${trophies}</span></button>
                ${isShopEnabled()
                    // SHOP-1: pigulka sigm prowadzi do sklepu — dokladnie tak, jak
                    // sasiedni przycisk trofeow prowadzi do Szlaku. Zero nowego CSS,
                    // ta sama para klas co tam. Bez sklepu zostaje zwyklym <span>.
                    ? `<button class="bt-hub0-coin bt-hub0-coin--btn" data-action="shop" type="button"
                               aria-label="${t('hub.shop')}" data-coin="bolts"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""><span class="val">${bolts}</span></button>`
                    : `<span class="bt-hub0-coin" data-coin="bolts"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""><span class="val">${bolts}</span></span>`}
            </span>
            <button class="bt-hub0-gear" data-action="settings" type="button"
                    aria-label="${t('hub.settings')}">⚙️</button>
            <button class="bt-hub0-s2" data-action="season" type="button"
                    aria-label="${t('hub.season.eyebrow')}"><span>${t(seasonShortKey())}</span></button>
        `;
    }

    private renderMain(): void {
        const main = this.rootEl?.querySelector('.bt-hub0-main') as HTMLElement | null;
        if (!main) return;
        // v0.126.0 — TRYB DZIELONY dla BITWY: przewija sie tylko `.bt-battle-scroll`,
        // a pasek z GRAJ stoi POZA scrollem, wiec nigdy nie zaslania tresci.
        // Toggle musi byc TUTAJ, bo `innerHTML = ''` czysci dzieci, ale NIE klasy —
        // bez zdejmowania klasa zostalaby na kolejnej sekcji i zabila jej przewijanie.
        main.classList.toggle('bt-hub0-main--split', this.activeSection === 'battle');
        main.innerHTML = '';
        // PROFILE-1 — profil to ukryta sekcja poza nav (wejscie przez chip w readoucie).
        if (this.activeSection === 'profile') {
            this.profile.render(main);
        } else {
            this.sections.find(s => s.id === this.activeSection)?.render(main);
        }
        // v0.206.0 (bug z playtestu: „Sezon 3 wrzuca mnie w polowe strony"). `innerHTML=''`
        // i `render()` wykonuja sie w JEDNYM zadaniu, bez layoutu pomiedzy, wiec przegladarka
        // nie ma momentu, w ktorym kontener jest pusty i moglaby przyciac scrollTop do zera —
        // nowa sekcja montuje sie juz przewinieta o tyle, o ile byla poprzednia. Dotyczylo
        // KAZDEGO przejscia (garaz -> sklep, pucharki -> rozkazy); pill sezonu byl tylko
        // najbardziej widoczny, bo PUCHARKI to najdluzsza strona, a SEZON krotka.
        main.scrollTop = 0;
        stagger(main); // v0.208.0 (J3) — sekcja WJEZDZA kaskada, naglowek sie stempluje
    }

    /** Powrot na gore biezacej sekcji — klik w aktywna sekcje/pill ma cos robic. */
    private scrollMainToTop(): void {
        const main = this.rootEl?.querySelector('.bt-hub0-main') as HTMLElement | null;
        if (main) main.scrollTop = 0;
        // BITWA przewija wlasny `.bt-battle-scroll` (tryb dzielony) — jego tez.
        const battle = this.rootEl?.querySelector('.bt-battle-scroll') as HTMLElement | null;
        if (battle) battle.scrollTop = 0;
    }

    // ── input ───────────────────────────────────────────────────────────────
    private wire(): void {
        const r = this.rootEl;
        if (!r) return;
        r.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const navBtn = target.closest<HTMLElement>('[data-section]');
            if (navBtn?.dataset.section) {
                // v0.119.0 (decyzja Mariusza): nav RANKING otwiera OD RAZU pelny
                // LeaderboardScreen — mini-board z przyciskiem "Pelny ranking" byl
                // zbednym krokiem. Hub zostaje na biezacej sekcji (BACK wraca tu).
                playUiClick(); // v0.208.0 — dock byl jedynym cichym miejscem huba
                if (navBtn.dataset.section === 'rank') {
                    this.onOpenLeaderboard?.();
                    return;
                }
                this.setActive(navBtn.dataset.section as SectionId);
                return;
            }
            const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
            // Throttle 60 ms w AudioSys zbija duplikat, gdy sekcja gra swoj klik dla tej samej akcji.
            if (action && action !== 'play-dock') playUiClick();
            if (action === 'settings') this.onOpenSettings?.();
            else if (action === 'profile') this.openProfile(); // PROFILE-1 — strona profilu
            else if (action === 'trophies') this.setActive('trophies'); // PROFILE-1 — pill 🏆
            else if (action === 'shop') this.setActive('shop');         // SHOP-1 — pill sigm
            // v0.126.0 — GRAJ z doku: startuje BIEZACYM wyborem BattleSection, wiec
            // dziala z kazdej sekcji huba bez wchodzenia do BITWY.
            else if (action === 'play-dock') { playUiSelect(); haptic(HAPTIC.confirm); this.battle.startCurrentMatch(); }
            // v0.129.0 — pill sezonu przelacza na STRONE sezonu (byl popup).
            else if (action === 'season') this.setActive('season');
            // 'play' obslugiwane wewnatrz BattleSection (wlasny listener)
        });
    }

    /**
     * SEASON-1 — badge S2: sekcja TROFEA + scroll do Season Tracku (wszystko
     * o sezonie zyje w TROFEA — badge przestaje byc dekoracja-zagadka).
     */
    private openSeasonTrack(): void {
        this.setActive('trophies');
        const main = this.rootEl?.querySelector('.bt-hub0-main');
        main?.querySelector('[data-season-track]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /** PROFILE-1 — otworz strone profilu (chip); ← wraca do zapamietanej sekcji. */
    private openProfile(): void {
        if (this.activeSection === 'profile') { this.scrollMainToTop(); return; }
        this.prevSection = this.activeSection;
        this.activeSection = 'profile';
        // Zdejmij podswietlenie nav (profil nie jest przypisany do zadnego przycisku).
        this.rootEl?.querySelectorAll<HTMLElement>('.bt-hub0-navbtn').forEach(btn => {
            btn.classList.remove('is-active');
        });
        this.renderMain();
    }

    private setActive(id: SectionId): void {
        // Juz tu jestesmy => „wroc na gore" zamiast nic (drugi wariant zgloszenia o pillu).
        if (id === this.activeSection) { this.scrollMainToTop(); return; }
        this.activeSection = id;
        this.rootEl?.querySelectorAll<HTMLElement>('.bt-hub0-navbtn').forEach(btn => {
            const active = btn.dataset.section === id;
            btn.classList.toggle('is-active', active);
            if (active) retrigger(btn.querySelector('.gi'), 'is-hop'); // J2 — ikona podskakuje
        });
        this.renderMain();
        this.positionNavIndicator();
        const stinger = SECTION_STINGERS[id];
        if (stinger) AudioSys.getInstance().playSectionStinger(stinger); // J8
    }
}

/** v0.208.0 (J8) — dwie nuty per sekcja (Hz); syntezowane w AudioSys, zero assetow. */
const SECTION_STINGERS: Partial<Record<SectionId, readonly [number, number]>> = {
    battle: [164.8, 196.0],    // E3 -> G3 „beben"
    garage: [329.6, 392.0],    // E4 -> G4 „klucz"
    shop: [523.3, 659.3],      // C5 -> E5 „kasa"
    quests: [392.0, 493.9],    // G4 -> B4 „kartka"
    trophies: [261.6, 392.0],  // C4 -> G4 fanfara
    season: [440.0, 523.3],    // A4 -> C5
    profile: [349.2, 440.0],   // F4 -> A4
};
