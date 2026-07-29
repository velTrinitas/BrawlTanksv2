/**
 * ItemHints — kontekstowe podpowiedzi JUST-IN-TIME (decyzja Mariusza + market best practice).
 *
 * Pierwszy raz gdy gracz spotka dany przedmiot/strefe w meczu -> maly dymek przy REALNYM obiekcie
 * na ~3.5s, RAZ na urzadzenie (flaga bt2:hint_<id>). Uczy w momencie istotnosci (najwyzsza retencja),
 * zero slideshow, prawdziwa grafika gratis (dymek wskazuje realny obiekt w swiecie). Dziala w KAZDYM
 * meczu (nie w tutorialu). Brawl Stars / Clash / Squad Busters robia dokladnie to.
 *
 * DOM (nie PIXI): tekst crisp, rozmiar screen-consistent. Pozycja world->screen liczona z
 * worldContainer.x/y + zoom (dokladnie jak sprite'y). Jeden dymek na raz; pointer-events:none.
 *
 * v0.82 (uwagi Mariusza mobile): dymek MNIEJSZY na dotyku + tekst zawija sie (max-width) + pozycja
 * CLAMPowana do widocznego ekranu (nigdy nie wychodzi poza krawedz), a strzalka nadal celuje w obiekt.
 */

export type ItemHintId = 'heart' | 'magnet' | 'cube' | 'mediPad' | 'powerPad';
const ALL_IDS: ItemHintId[] = ['heart', 'magnet', 'cube', 'mediPad', 'powerPad'];
const SHOW_MS = 3500;
const FADE_MS = 450;
const EDGE_MARGIN = 8;   // min. odstep dymka od krawedzi ekranu (px)
const ITEM_GAP = 14;     // odstep strzalki nad obiektem (px)
const GOLD = '#ffd24a';

export class ItemHints {
    private readonly isTouch: boolean;
    private root!: HTMLDivElement;
    private bubbleEl!: HTMLDivElement;
    private textEl!: HTMLSpanElement;
    private arrowEl!: HTMLDivElement;
    private seen = new Set<ItemHintId>();
    private activeId: ItemHintId | null = null;
    private wx = 0;
    private wy = 0;
    private hideAt = 0;

    constructor(isTouch: boolean) {
        this.isTouch = isTouch;
        this.buildDom();
        for (const id of ALL_IDS) {
            try { if (localStorage.getItem(this.key(id)) === '1') this.seen.add(id); } catch { /* blocked */ }
        }
    }

    private key(id: ItemHintId): string { return 'bt2:hint_' + id; }
    hasSeen(id: ItemHintId): boolean { return this.seen.has(id); }
    isActive(): boolean { return this.activeId !== null; }

    private buildDom(): void {
        if (!document.getElementById('bt-itemhint-style')) {
            const st = document.createElement('style');
            st.id = 'bt-itemhint-style';
            st.textContent =
                '@keyframes bt-hint-pop{0%{transform:scale(.62);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1}}' +
                '@keyframes bt-hint-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}';
            document.head.appendChild(st);
        }
        const touch = this.isTouch;

        // root: kotwica pozycjonowana lewym-gornym rogiem dymka (left/top liczone w updateWorld).
        // transform-origin: dol-srodek => pop skaluje sie "z obiektu". Brak translate w bazie.
        const root = document.createElement('div');
        root.id = 'bt-itemhint-root';
        root.style.cssText = 'position:fixed;display:none;left:0;top:0;z-index:58;pointer-events:none;transform-origin:50% 100%;will-change:left,top,opacity,transform';

        // dymek (bobuje), tekst zawija sie w max-width; mniejszy na dotyku.
        const bubble = document.createElement('div');
        bubble.style.cssText =
            'position:relative;text-align:center;font-family:"Titan One",cursive;color:#fff;' +
            'font-size:' + (touch ? 'clamp(11px,2.5vw,14px)' : '16px') + ';letter-spacing:.3px;line-height:1.25;' +
            'max-width:' + (touch ? '58vw' : '340px') + ';white-space:normal;word-break:break-word;' +
            'background:linear-gradient(180deg,rgba(52,56,78,.98),rgba(26,29,42,.98));' +
            'border:2.5px solid ' + GOLD + ';border-radius:13px;padding:' + (touch ? '5px 11px' : '8px 16px') + ';' +
            'box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 14px rgba(255,210,74,.4);' +
            'text-shadow:0 2px 0 rgba(0,0,0,.5);animation:bt-hint-bob 1s ease-in-out infinite';
        const text = document.createElement('span');
        // strzalka w dol (do obiektu) — left ustawiany w updateWorld by celowala nawet po CLAMPie.
        const arrow = document.createElement('div');
        arrow.style.cssText = 'position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);width:0;height:0;' +
            'border-left:9px solid transparent;border-right:9px solid transparent;border-top:9px solid ' + GOLD;
        bubble.append(text, arrow);
        root.appendChild(bubble);
        document.body.appendChild(root);
        this.root = root; this.bubbleEl = bubble; this.textEl = text; this.arrowEl = arrow;
    }

    /** Odpal podpowiedz (main.ts wola po wykryciu 1. spotkania + !hasSeen + !isActive). */
    trigger(id: ItemHintId, text: string, worldX: number, worldY: number): void {
        if (this.activeId || this.seen.has(id)) return;
        this.seen.add(id);
        try { localStorage.setItem(this.key(id), '1'); } catch { /* blocked */ }
        this.activeId = id;
        this.wx = worldX; this.wy = worldY;
        this.hideAt = performance.now() + SHOW_MS;
        this.textEl.textContent = text;
        this.root.style.display = '';
        this.root.style.opacity = '1';
        this.root.style.animation = 'bt-hint-pop .3s cubic-bezier(.2,.9,.3,1.3)';
    }

    /**
     * Aktualizuj pozycje ekranowa (co klatke gdy aktywny). Ekran = worldX*zoom + worldContainer.x
     * (jak sprite'y). Dymek CLAMPowany w [margin, viewport-margin] by nie wychodzil poza ekran;
     * strzalka przesuwana tak, by nadal celowala w obiekt. Po SHOW_MS chowa (z fade).
     */
    updateWorld(worldContainerX: number, worldContainerY: number, zoom: number): void {
        if (!this.activeId) return;
        const now = performance.now();
        if (now >= this.hideAt) { this.dismiss(); return; }

        const itemX = this.wx * zoom + worldContainerX; // punkt obiektu na ekranie
        const itemY = this.wy * zoom + worldContainerY;
        const vw = window.innerWidth;
        const bw = this.bubbleEl.offsetWidth;
        const bh = this.bubbleEl.offsetHeight;

        // left dymka = wycentrowany na obiekcie, ale CLAMPowany do widocznego ekranu
        let left = itemX - bw / 2;
        left = Math.max(EDGE_MARGIN, Math.min(vw - bw - EDGE_MARGIN, left));
        const top = itemY - bh - ITEM_GAP; // dymek nad obiektem (strzalka ITEM_GAP nad punktem)
        this.root.style.left = left + 'px';
        this.root.style.top = Math.max(EDGE_MARGIN, top) + 'px';

        // strzalka celuje w obiekt nawet po CLAMPie (offset wzgledem lewej krawedzi dymka)
        const arrowX = Math.max(14, Math.min(bw - 14, itemX - left));
        this.arrowEl.style.left = arrowX + 'px';

        const remain = this.hideAt - now;
        this.root.style.opacity = remain < FADE_MS ? String(remain / FADE_MS) : '1';
    }

    private dismiss(): void {
        this.activeId = null;
        this.root.style.display = 'none';
        this.root.style.animation = '';
    }

    /** Awaryjne sprzatniecie (koniec meczu / powrot do menu). */
    public clear(): void { this.dismiss(); }
}
