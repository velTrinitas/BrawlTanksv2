/**
 * csv.mjs — minimalny parser CSV dla eksportow z Supabase (KROK 1 PLAN_PO_TESTACH).
 *
 * PO CO WLASNY, A NIE PACZKA: kolumny `cosmetics`/`quests`/`powers`/`stats` w tabeli
 * `progression` to JSON-y wstawione w pole CSV — pelne przecinkow i podwojonych
 * cudzyslowow (`""`). Naiwny `split(',')` rozjezdza na nich caly wiersz i daje
 * ciche przesuniecie kolumn, ktorego nie widac w zadnej sumie. Ten parser trzyma
 * stan cudzyslowu, wiec przechodzi przez nie poprawnie. Zero nowych zaleznosci —
 * repo ma miec lekki bundle (mobile-first §5), a to narzedzie dev.
 */
import fs from 'node:fs';

/** Parsuje tekst CSV do tablicy obiektow (pierwszy wiersz = naglowek). */
export function parseCsv(text) {
    // BOM z Excela/Supabase potrafi wkleic sie w nazwe PIERWSZEJ kolumny i wtedy
    // `row.id` jest undefined, a kazdy filtr po niej cicho zwraca zero wierszy.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [], cur = '', inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
            } else cur += c;
            continue;
        }
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
        else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }

    const header = rows.shift();
    if (!header) return [];
    return rows
        .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
        .map(r => Object.fromEntries(header.map((k, j) => [k.trim(), r[j] ?? ''])));
}

/** Czyta plik CSV z dysku; zwraca [] gdy pliku nie ma (sekcja raportu = "brak danych"). */
export function readCsv(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return parseCsv(fs.readFileSync(filePath, 'utf8'));
}
