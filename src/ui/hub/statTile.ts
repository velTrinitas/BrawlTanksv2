/**
 * statTile.ts — GARAZ-3 (v0.158.0). Wspoldzielony kafel "record boxa".
 *
 * Wyciagniety 1:1 z ProfileSection.tileHtml (v0.145.0 — kafel z ilustracja):
 * styl .bt-hub0-stat--art (wcisniety gradient + poswiata --art + ziarno) to
 * JEDYNY jezyk ramek w hubie po redesignie Garazu — sloty mocy w Garazu
 * uzywaja dokladnie tego samego generatora co kafle Rekordow w Profilu
 * (decyzja Mariusza: reuse istniejacego komponentu, zero nowych stylow).
 *
 * DLUGOSC WARTOSCI STERUJE SKALA LICZBY (data-vlen): dlugosc stringa znamy
 * tutaj, wiec skala jest deterministyczna i niezalezna od szerokosci okna
 * (clamp(vw) mierzyl OKNO, nie kafel — patrz komentarz w ProfileSection).
 */
export function statTileHtml(
    artHtml: string,
    accent: string,
    value: string | number,
    label: string,
    extraCss = '',
): string {
    const plain = String(value).replace(/<[^>]*>/g, '');   // wartosc moze niesc HTML
    return `
        <div class="bt-hub0-stat bt-hub0-stat--art${extraCss ? ' ' + extraCss : ''}"
             style="--art:${accent}" data-vlen="${Math.min(9, plain.length)}">
            <span class="art" aria-hidden="true">${artHtml}</span>
            <span class="val"><b>${value}</b><small>${label}</small></span>
        </div>`;
}
