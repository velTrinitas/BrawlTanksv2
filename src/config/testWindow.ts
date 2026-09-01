/**
 * testWindow.ts — TEST-1 (v0.142.0). Data waznosci paczki TESTOWEJ.
 *
 * PO CO. Testerzy dostaja gre pod wlasnym adresem (`test.sigmatanks.eu`) zamiast
 * `veltrinitas.github.io/BrawlTanksv2/`, ktory zdradza konto GitHub, nazwe repo i —
 * bo repo jest publiczne — caly kod zrodlowy. Testy koncza sie 23.09.2026; od 24.09
 * paczka blokuje sie SAMA, bez zadnej akcji po stronie Mariusza.
 *
 * ── DLACZEGO NIE MA TU ZADNEJ FURTKI ────────────────────────────────────────────
 * Data przychodzi z `VITE_TEST_EXPIRES`, ustawianej WYLACZNIE przy recznym buildzie
 * paczki testowej (`npm run build:test`). `deploy.yml` tej zmiennej nie zna, wiec build
 * produkcyjny nie ma zadnej daty i NIGDY nie wygasa. To sa dwie osobne paczki o dwoch
 * osobnych zyciach — zero hasel, zero `?dev=1`, zero ryzyka wyciekniecia obejscia.
 *
 * ── SEMANTYKA DATY (latwo tu o blad o jeden dzien) ──────────────────────────────
 * `VITE_TEST_EXPIRES='2026-09-23'` znaczy OSTATNI DZIEN GRANIA. Blokada zapada
 * 24.09 o 00:00 czasu LOKALNEGO urzadzenia — dlatego parsujemy date jako polnoc
 * lokalna i dodajemy dobe, zamiast porownywac do `Date.parse('2026-09-23')`, ktore
 * dla formatu ISO bez godziny daje polnoc UTC i odcieloby czesc testerow za wczesnie.
 *
 * ── SWIADOME OGRANICZENIE ───────────────────────────────────────────────────────
 * Tester, ktory cofnie zegar w telefonie, gra dalej. Bez serwera nie da sie tego
 * zalatac, a twardym odcieciem i tak jest skasowanie rekordu CNAME i projektu
 * w Cloudflare. Ta warstwa ma byc UPRZEJMA, nie szczelna.
 *
 * ── EKRAN PO POLSKU, BEZ i18n (wyjatek od reguly `t('key')`) ────────────────────
 * Overlay renderuje sie PRZED bootem gry, czyli przed inicjalizacja i18n — nie ma
 * jeszcze czego wolac. Jest tymczasowy (znika razem z paczka testowa) i trafia
 * wylacznie do polskich testerow.
 */

/** Ile ms ma doba — czytelniej niz 86_400_000 rozsiane po warunkach. */
const DAY_MS = 86_400_000;

/**
 * Moment BLOKADY w ms (czyli polnoc PO ostatnim dniu grania), albo `null`, gdy
 * paczka nie ma daty waznosci — to jest normalny stan buildu produkcyjnego.
 *
 * Niepoprawna wartosc tez daje `null`. Swiadomie NIE rzucamy tu bledem: literowka
 * w zmiennej srodowiskowej nie moze zamienic sie w gre, ktora nie startuje. Gorszy
 * z dwoch bledow to zablokowana gra, nie paczka bez daty.
 */
export const TEST_EXPIRES_AT: number | null = (() => {
    const raw = import.meta.env.VITE_TEST_EXPIRES;
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
    const [y, m, d] = raw.trim().split('-').map(Number);
    // Konstruktor z trzema argumentami = POLNOC LOKALNA (nie UTC) — patrz naglowek.
    const lastDay = new Date(y, m - 1, d);
    if (Number.isNaN(lastDay.getTime())) return null;
    return lastDay.getTime() + DAY_MS;
})();

/** Czy okno testow juz sie zamknelo. `false`, gdy paczka nie ma daty (produkcja). */
export function isTestWindowClosed(now: number = Date.now()): boolean {
    return TEST_EXPIRES_AT !== null && now >= TEST_EXPIRES_AT;
}

/**
 * Ekran konca testow. Czysty DOM, jeden `<div>` — zero PIXI, zero fill-rate,
 * zero wplywu na petle gry (ktora i tak nigdy nie wystartuje, gdy to sie pokaze).
 *
 * `z-index` maksymalny, bo overlay ma przykryc rowniez ostrzezenie o orientacji
 * z `index.html`, ktore siedzi w markupie od poczatku.
 */
function renderEndScreen(): void {
    const el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center', 'gap:14px',
        'padding:24px', 'box-sizing:border-box', 'text-align:center',
        // #1a252f = theme_color z manifestu, wiec pasek UA i tlo ekranu sa jednym kolorem
        'background:#1a252f', 'color:#eef5fa',
        "font-family:'Titan One',cursive,sans-serif",
        '-webkit-user-select:none', 'user-select:none',
    ].join(';');

    const icon = document.createElement('div');
    icon.textContent = '🏁';
    // WLASNY font-family dla emoji. Kontener wymusza Titan One, ktory nie ma glifu
    // szachownicy — przegladarka schodzila do monochromatycznego zastepnika i emoji
    // wygladalo jak szara kratka. Stos emoji przywraca kolorowa wersje systemowa.
    icon.style.cssText = 'font-size:56px;line-height:1;'
        + 'font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Testy zakończone';
    // clamp zamiast stalej: tytul ma byc duzy na desktopie i nie lamac sie @375px
    title.style.cssText = 'font-size:clamp(24px,7vw,40px);line-height:1.15;color:#f1c40f';

    const sub = document.createElement('div');
    sub.textContent = 'Dzięki za granie!';
    sub.style.cssText = 'font-size:clamp(14px,4vw,20px);line-height:1.3;opacity:0.85';

    el.append(icon, title, sub);
    document.body.appendChild(el);
}

/**
 * STRAZNIK. Wolany jako PIERWSZA instrukcja ciala `main.ts`.
 *
 * RZUCA wyjatek, gdy okno testow jest zamkniete — i to jest celowe, nie niedbalstwo.
 * Samo narysowanie overlaya nie wystarczy: bez przerwania modulu wystartowalaby petla
 * gry, audio i submit wyniku do Supabase POD spodem. Rzucenie jest jedynym sposobem,
 * zeby zatrzymac wykonanie ciala modulu ES.
 */
export function guardTestWindow(): void {
    // Podglad ekranu wylacznie w dev. Warunek `DEV` jest wycinany z buildu, wiec
    // w paczce testowej ta sciezka NIE ISTNIEJE — nie ma czego wyklikac.
    const forced = import.meta.env.DEV
        && new URLSearchParams(window.location.search).get('testend') === '1';

    if (!forced && !isTestWindowClosed()) return;

    renderEndScreen();
    throw new Error('[TestWindow] Okno testow zamkniete — start gry przerwany.');
}
