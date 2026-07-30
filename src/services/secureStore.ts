/**
 * secureStore.ts — Anti-cheat L1 (obfuskacja sync localStorage).
 *
 * UWAGA — to OBFUSKACJA, nie bezpieczenstwo. Klucz siedzi w bundlu przegladarki, wiec
 * zdeterminowany atakujacy go wyciagnie. Cel L1: podniesc bariere przeciw CASUALOWEJ
 * edycji (dzieciak otwiera devtools i widzi `bt1:9fA2...` zamiast `{"score":999999}`).
 * Prawdziwa brama zaufania = walidacja serwerowa (L2, Supabase Edge Function).
 *
 * Sync (XOR + base64, UTF-8-safe) — zeby NIE wymuszac async refaktoru sync-owych
 * loadQueue/saveQueue. Prefix MAGIC odroznia zaciemnione od LEGACY plaintext (starzy
 * gracze maja czysty JSON w localStorage) — deobfuscate zwraca legacy as-is, a nastepny
 * zapis nadpisze go juz zaciemniony. Bledny odczyt -> null (traktowane jak brak danych).
 */

const MAGIC = 'bt1:';
// Klucz zaciemniania (nie sekret — patrz naglowek). 16 bajtow, cyklowany XOR-em.
const K = Uint8Array.from([0x5b, 0x2a, 0x71, 0xc3, 0x14, 0x8f, 0x3d, 0xa6, 0x62, 0x0e, 0xd9, 0x47, 0x91, 0xba, 0x2c, 0xf5]);

function xor(bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ K[i % K.length];
    return out;
}

/** Zaciemnij string do postaci `bt1:<base64>`. */
export function obfuscate(plain: string): string {
    const x = xor(new TextEncoder().encode(plain));
    let bin = '';
    for (let i = 0; i < x.length; i++) bin += String.fromCharCode(x[i]);
    return MAGIC + btoa(bin);
}

/** Odczytaj wartosc: zaciemniona (prefix MAGIC) -> odkoduj; legacy plaintext -> as-is; blad -> null. */
export function deobfuscate(stored: string | null): string | null {
    if (stored == null) return null;
    if (!stored.startsWith(MAGIC)) return stored; // legacy plaintext (sprzed L1)
    try {
        const bin = atob(stored.slice(MAGIC.length));
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(xor(bytes));
    } catch {
        return null;
    }
}
