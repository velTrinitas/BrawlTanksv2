# Zaplecze Supabase — runbook

Ten katalog ma kilkanaście plików `.sql` i **kolejność ich uruchamiania ma znaczenie**.
Ten plik jest mapą: co czym jest, czego nie wolno ruszać i jak wszystko wycofać.

Projekt: `brawltanks-dev` (eu-central-1, Frankfurt). Dashboard obsługuje **Mariusz** —
Claude nie ma tam dostępu i może wyłącznie przygotować pliki.

---

## 🛑 Czego NIE uruchamiać na produkcji

**`schema.sql`** — służy wyłącznie do postawienia bazy **od zera**. Jego polityki RLS
są historyczne (`USING (true)`) i ich odtworzenie **cofnęłoby trzy wdrożone
zabezpieczenia naraz**:

| Cofnięte | Przywraca to |
|---|---|
| `scores` | `rls_lockdown_scores.sql` (anti-cheat L2a, v0.88.0) |
| `profiles` | `rls_lockdown_profiles_progression.sql` (Z0.10b) |
| `progression` | jw. |

Jeśli kiedykolwiek odtwarzasz środowisko: `schema.sql` → migracje kolumn → **oba pliki
lockdownu na końcu**.

---

## Kolejność wdrożenia — reguła ogólna

> **SQL → Edge Function → klient.** Nigdy odwrotnie.

Powód jest konkretny: klient przy odpowiedzi 4xx **cicho porzuca wynik**
(`src/services/SupabaseScoreService.ts`, `isTransientError` kolejkuje tylko 5xx/429).
Wypuszczenie klienta przed zapleczem nie daje błędu — daje ciche znikanie danych.

Wyjątek: **lockdowny RLS idą jako OSTATNIE**, już po tym, jak nowy klient jest na
produkcji. Odwrotna kolejność odcina graczy od zapisu.

---

## Pliki

### Fundament
| Plik | Co robi | Kiedy uruchamiać |
|---|---|---|
| `schema.sql` | `profiles`, `scores`, `sessions` + indeksy + trigger `updated_at` | **tylko przy stawianiu od zera** |
| `progression_sync.sql` | tabela `progression` (1:1 z profilem, pola monotoniczne) | od zera |
| `telemetry.sql` | `telemetry` + widok `telemetry_by_device` | od zera |

### Migracje kolumn (idempotentne, `ADD COLUMN IF NOT EXISTS`)
| Plik | Co dokłada |
|---|---|
| `progression_cosmetics.sql` | `progression.cosmetics` |
| `progression_quests.sql` | `progression.quests` |
| `progression_powers.sql` | `progression.powers` |
| `progression_stats.sql` | `progression.stats` + RPC `profile_lifetime_stats` |
| `fun_mode.sql` | `scores.fun_mode` (run ze slotem 🎲) |
| `scores_mode.sql` | `scores.mode` + `scores.match_id` (fundament koopa) |
| `owner_uid_columns.sql` | `profiles.owner_uid`, `progression.owner_uid` (**Z0.10b krok 1/2**) |

### Ranking
| Plik | Co robi |
|---|---|
| `leaderboard_rpc.sql` | `leaderboard_top` + `leaderboard_my_rank` (dedupe best-per-player, okna all/week/day) |

> Drugi argument RPC to `score_version` i **musi** równać się `CURRENT_SCORE_VERSION`
> (`src/services/SupabaseScoreService.ts`) — dziś **4**. Wpisanie starej wartości zwraca
> pustkę i wygląda jak zepsuty deploy.

### Zabezpieczenia (uruchamiane OSTATNIE, każdy ma rollback w komentarzu)
| Plik | Co zamyka |
|---|---|
| `rls_lockdown_scores.sql` | insert do `scores` tylko przez Edge (service-role) |
| `rls_lockdown_profiles_progression.sql` | zapis do `profiles`/`progression` tylko dla właściciela (**Z0.10b krok 2/2**) |

### Narzędzia analityczne (read-only, nic nie zmieniają)
`progression_calibration.sql`, `quest_calibration.sql` — filtrują po `score_version`,
**podbij je razem z każdym bumpem**, inaczej czytają martwe dane.

### Edge Functions
`functions/submit-score/` — jedyna funkcja. Waliduje payload (whitelisty scenariuszy,
map, trudności, trybu), rate-limituje (20/h/profil) i wstawia wiersz na service-role.

---

## Z0.10b — własność wiersza (wdrożenie w 4 krokach)

Do v0.204.0 klient **nie miał anonimowej sesji**, więc `auth.uid()` było NULL, a RLS
miało `USING (true)`. Ponieważ `profile_id` jest **publiczny** (zwraca go ranking),
wystarczyło odczytać cudze id z tablicy wyników, żeby nadpisać tamten profil lub
progresję. `owner_uid` daje wierszowi właściciela, którego klient nie może podrobić.

1. Dashboard → Authentication → Providers → **włącz „Anonymous sign-ins"**
2. SQL: `owner_uid_columns.sql`
3. **Push klienta** + playtest
4. SQL: `rls_lockdown_profiles_progression.sql`

**Świadomy kompromis:** wiersze sprzed Z0.10b mają `owner_uid = NULL` i polityka UPDATE
celowo pozwala je przejąć przy pierwszym zapisie — inaczej istniejące profile stałyby się
nieedytowalne. Dopóki wiersz jest nieprzejęty, przejąć go może każdy. Przy dwóch graczach
to akceptowalne; **przed publicznym uruchomieniem porzucone profile testowe trzeba
skasować albo przypisać ręcznie.**

**Uwaga o rolach:** anonimowy użytkownik Supabase dostaje rolę **`authenticated`**, nie
`anon`. Każda nowa polityka pisana tylko `TO anon` przestanie obejmować klienta. Audyt
z 24.09.2026: wszystkie polityki mają `TO anon, authenticated` — utrzymaj tę konwencję.

---

## Pełna powierzchnia Supabase w kliencie

Potrzebne, gdyby polityka Poki wymusiła odcięcie zewnętrznego zaplecza.

| Co | Gdzie | Po odcięciu |
|---|---|---|
| Profil (upsert, fetch, wolny nick) | `services/SupabaseProfileService.ts` | działa lokalnie, brak synchronizacji między urządzeniami |
| Progresja (trofea, śrubki, kosmetyki) | `services/SupabaseProgressionService.ts` | jw. — `localStorage` jest źródłem prawdy |
| Wysyłka wyniku | `services/SupabaseScoreService.ts` (Edge `submit-score`) | wynik liczy się lokalnie i pokazuje na end-screenie |
| Ranking globalny | `SupabaseScoreService.getLeaderboard` / `getMyRank` (RPC) | **znika** — jedyna realnie tracona funkcja |
| Telemetria | `services/TelemetryService.ts` | znika (osobna flaga `TELEMETRY_LIVE`) |

**Wyłącznik:** `src/config/cloud.ts` → `CLOUD_LIVE = false`, rollback URL `?cloud=0`.
Strażnik `isCloudEnabled()` stoi na wejściu **każdej** z 13 metod sieciowych; pilnuje
tego `node tools/check-cloud-guards.cjs` (exit 1, gdy ktoś doda metodę bez strażnika).

Weryfikacja odcięcia: wejść z `?cloud=0`, zakładka Network → **zero żądań do
`*.supabase.co`**, a gra ma być w pełni grywalna.

Gra bez chmury działa w całości: profil, progresja, trofea, kosmetyki, sklep, skrzynki,
wszystkie scenariusze. `ProfileService` i `ProgressionService` od początku trzymają
`localStorage` jako źródło prawdy, a chmura była osobnym, best-effort concernem.
