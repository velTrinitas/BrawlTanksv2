# Zaplecze Supabase — pułapki, które kosztują produkcję

Krótka lista rzeczy, których złamanie kosztuje dane graczy albo odrzucenie paczki.
Pełny runbook (co robi każdy plik `.sql`, kolejność wdrożenia, rollbacki):
**`supabase/README.md`** — zajrzyj tam, zanim ruszysz cokolwiek w `supabase/`.

## 1. NIE uruchamiaj `supabase/schema.sql` na produkcji

Jego polityki RLS są historyczne (`USING (true)`). Odtworzenie ich **cofa trzy wdrożone
zabezpieczenia naraz**: lockdown `scores` (anti-cheat L2a), `profiles` i `progression`
(Z0.10b). Plik służy wyłącznie do postawienia bazy od zera — wtedy oba pliki
`rls_lockdown_*.sql` idą zaraz po nim.

## 2. Kolejność: SQL → Edge Function → klient. Lockdowny RLS ZAWSZE ostatnie

Klient przy odpowiedzi **4xx cicho porzuca wynik** — kolejkuje tylko 5xx/429
(`SupabaseScoreService.isTransientError`). Wypuszczenie klienta przed zapleczem nie daje
błędu, tylko ciche znikanie danych. Dokładnie tak zniknęło 49% rozgrywki w oknie testów
01–23.09: 120 meczów Zamku i Królowej, zero wyników w bazie.

Lockdown RLS puszczony przed wdrożeniem nowego klienta odcina graczy od zapisu profilu
i progresji.

## 3. `profile_id` jest PUBLICZNY — nie jest sekretem

Ranking (`leaderboard_top`) zwraca `profile_id`. Żaden mechanizm bezpieczeństwa nie może
zakładać, że znajomość tego id cokolwiek dowodzi. Właścicielem wiersza jest `owner_uid`
(uid anonimowej sesji), którego klient nie może podrobić.

## 4. Anonimowy użytkownik ma rolę `authenticated`, nie `anon`

Po `signInAnonymously()` klient działa jako `authenticated`. **Każda nowa polityka RLS
albo GRANT napisany tylko `TO anon` przestanie go obejmować.** Konwencja w projekcie:
zawsze `TO anon, authenticated` (poza politykami `*_own`, które celowo wymagają sesji).

## 5. Cała łączność z chmurą jest za flagą `CLOUD_LIVE`

`src/config/cloud.ts`, rollback `?cloud=0` — istnieje na wypadek, gdyby polityka Poki
wykluczyła ruch do zewnętrznego zaplecza. Strażnik `isCloudEnabled()` musi stać na
wejściu **każdej** metody sieciowej.

Dodając nową metodę dotykającą Supabase: dopisz strażnik i uruchom
`node tools/check-cloud-guards.cjs` (wychodzi z kodem 1, gdy któreś wyjście jest bez
ochrony). Strażnik idzie do metody serwisu, **nie** do `getSupabase()` — rzucanie
z singletona przechodzi przez `pushProfileToCloud()` do UI, które przy błędzie nie
zapisuje profilu lokalnie, czyli wyłączenie chmury zablokowałoby zakładanie konta.

## 6. `score_version` w zapytaniach musi zgadzać się z `CURRENT_SCORE_VERSION`

Dziś **4** (`src/services/SupabaseScoreService.ts`). Drugi argument RPC rankingu i filtry
w plikach kalibracyjnych. Wpisanie starej wartości zwraca pustkę i wygląda jak zepsuty
deploy, choć wszystko działa. Przy bumpie podbij RÓWNIEŻ `progression_calibration.sql`
i `quest_calibration.sql`.
