# Crew Ranks System — Design Doc v1.1

**Status:** DRAFT (v1.1 — skorygowany pod realna architekture BrawlTanksv2)
**Author:** Mariusz + Claude
**Created:** 2026-08-20 · **Revised:** 2026-08-20 (v1.1)
**Target:** osobna faza PO sesji polish Tier 3 (bez twardych numerow wersji — patrz §11)

---

## TL;DR

Per-brawler drabinka mistrzostwa, 10 rang (ROOKIE -> COMMANDER), zdobywana WYGRANYMI danym
czolgiem. Zero wplywu na staty (konstytucyjne). Czysto kosmetyka + ekonomia sigm + prestiz.
Cel: retencja D7/D30 + long-tail mastery. 80 badge'y (8 czolgow x 10 rang) renderowanych
programistycznie (placeholder: 2 PNG w `public/ranks/`). Backend: pod-dokument JSONB w tabeli
`progression` (wzorzec powers/cosmetics/quests) + backfill jednym SQL-em z istniejacych `scores`.

---

## 1. Problem i cel

**Problem gracza:** trofea sa PER-KONTO — po odblokowaniu wszystkiego nie ma powodu grac
"swoim" czolgiem; mistrzostwo nie ma widocznego wyrazu.
**Problem biznesowy:** luka retencji D30.
**Rozwiazanie:** kazdy czolg ma wlasna 10-stopniowa drabinke; kazdy stopien = odrebny,
widoczny badge. Badge JEST nagroda.

## 2. Cele / nie-cele

**Cele:** per-brawler track na zawsze (bez resetow) · dopamina D0 (ROOKIE po 1. wygranej) ·
long-tail hook · zasilanie ekonomii sigm · honeypot anti-cheat (licznik serwerowy).
**Nie-cele:** JAKIKOLWIEK wplyw na staty · reset sezonowy · ranga konta (osobny przyszly doc)
· handel/utrata badge'y.

## 3. Decyzje zamkniete

1. Per-brawler (nie per-konto). 2. Metryka = WYGRANE. 3. 10 rang, permanentne.
4. Nazwy rang EN, caps, max 10 znakow (wsteha). **Wstega ZAWSZE EN — takze w PL lokalizacji**
   (decyzja Mariusza 2026-08-20; placeholder L1 "REKRUT" do podmiany na "ROOKIE" przy finalnym
   arcie). 5. Kosmetyka + sigmy, nigdy staty. 6. Docelowo art programistyczny (PIXI baker jak
   czolgi/Tier3Baker); PNG tylko jako placeholder teasera. 7. Server-authoritative (klient =
   cache/wyswietlanie).

## 4. Rangi i progi

**KOREKTA v1.1 (nasze dane kalibracji, NIE Brawl Stars):** mediana naszego gracza = 4 mecze,
p90 = 29 (Q4, 2026-08-02). Progi z v1.0 (kumulatywnie 1/5/15/40/100/200/400/700/1200/2000)
sa dla NAS o rzad za strome powyzej L4 — 95% graczy nigdy nie zobaczyloby L3+ i system bylby
niewidzialny. **Propozycja startowa = progi v1.0 podzielone ~/2:**

| Lvl | Name | Wins (kumulatywnie) | v1.0 bylo |
|-----|------|--------------------:|----------:|
| 1 | ROOKIE | 1 | 1 |
| 2 | GUNNER | 3 | 5 |
| 3 | VETERAN | 8 | 15 |
| 4 | SERGEANT | 20 | 40 |
| 5 | ELITE | 50 | 100 |
| 6 | ACE | 100 | 200 |
| 7 | HERO | 200 | 400 |
| 8 | CHAMPION | 350 | 700 |
| 9 | LEGEND | 600 | 1200 |
| 10 | COMMANDER | 1000 | 2000 |

Krzywa dalej nieliniowa (szybki start = dopamina, koniec = maraton). Kalibracja po 2 tygodniach
danych — progi w JEDNYM pliku config (`src/config/crewRanks.ts`), zmiana progow jest
samonaprawialna (rangi liczone Z wygranych, nie przechowywane — wzorzec progow trofeow mocy).

## 5. Co liczy sie jako wygrana

- **KTB:** mega boss pokonany (= `scores.mega_boss_defeated = true` — KOREKTA v1.1: kolumna
  `is_victory` NIE istnieje; to pole jest w bazie od v0.100.0 i juz zweryfikowane).
- **CTF:** 3/3 flagi — UWAGA: CTF dzis NIE submituje wynikow (decyzja F1/D10). Wygrane CTF
  doliczymy, gdy CTF dostanie submit (osobna decyzja; do tego czasu KTB-only).
- **Castle / PvP:** przy ich wdrozeniu.
- **NIE liczy sie:** przerwany mecz, mecz < 60s (anty-farm — sub-60s liczy sie do score, nie
  do rangi), przyszly practice mode.

## 6. Nagrody za awans — KOREKTA v1.1 (tylko ISTNIEJACE systemy)

v1.0 zakladal nieistniejace systemy ("Supply Drop tokens", "Trophy XP boost", "Cosmetic Slot
system not built"). Stan faktyczny: **system kosmetykow ISTNIEJE** (32 pozycje:
nickColor/frame/title, `ownedCosmetics` + granty), skrzynki = `cratesEarned+1`, waluta = sigmy.

| Lvl | Sigmy | Bonus (istniejacy mechanizm) |
|-----|------:|------------------------------|
| 1 ROOKIE | 50 | badge widoczny wszedzie |
| 2 GUNNER | 100 | +1 skrzynka (cratesEarned+1) |
| 3 VETERAN | 150 | +1 skrzynka |
| 4 SERGEANT | 300 | grant kosmetyku: nickColor (dedykowany "rangowy" — nowa pozycja w puli) |
| 5 ELITE | 500 | +1 skrzynka + grant frame |
| 6 ACE | 800 | +2 skrzynki |
| 7 HERO | 1200 | grant nickColor gold-tier + title |
| 8 CHAMPION | 2000 | skrzynka z gwarancja Rare+ (pity-mechanika istnieje) |
| 9 LEGEND | 3000 | grant frame diamond-tier |
| 10 COMMANDER | 5000 | tint czolgu in-game (JEDYNY nowy mechanizm — flagowac osobno) + title |

Kosmetyki rangowe = nowe wpisy w `config/cosmetics.ts` grantowane przez `ownedCosmetics`
(uklad juz obsluguje granty — zero nowego systemu).

## 7. Identyfikacja wizualna

Bez zmian vs v1.0 (hex-tarcza, nity, wstega, numeral I-X, metal wg tieru: braz+zielony /
srebro+cyjan / zloto+fiolet / diament+rainbow; czytelnosc od 48px).
**v1.1:** placeholder = 2 PNG 160px w `public/ranks/` (L1_rekrut, L2_gunner; teaser w Garazu
od v0.115.0). Docelowo `BadgeRenderer` (PIXI, RenderTexture per kombo, cache ~80 tekstur).
Precedens rastrow w hub-UI istnieje (avatary, portrety czolgow) — PNG w hubie OK, ale 80
badge'y x PNG to ~20MB => programmatic obowiazkowy przed pelnym rolloutem.

## 8. Powierzchnie

Jak v1.0 (HUD 48px, victory 256px, level-up popup 384px, picker 64px, profil grid 96px,
leaderboard 32px, hub flex 128px). **Krytyczne dla juiciness: level-up popup z celebracja
(reveal + count-up sigm) — bez tego system to muzeum.** Placeholder-teaser: Garaz (od v0.115.0).

## 9. Model danych — KOREKTA v1.1 (progression, nie profiles)

**Klient (offline-first, wzorzec F1b/F2b/F7a):**
```ts
// ProgressionState (src/services/ProgressionService.ts) — nowe pole:
/** Wygrane per czolg (id -> liczba). Merge miedzy urzadzeniami: MAX per klucz (monotoniczne). */
brawlerWins: Record<string, number>;
```
- Inkrement w triggerVictory (KTB; warunek >= 60s z `getElapsedSeconds`).
- Ranga LICZONA z wins (nie przechowywana) => zmiany progow samonaprawialne.
- Sync: pod-dokument w `progression.powers`-podobnej kolumnie JSONB (nowa kolumna `crew` lub
  rozszerzenie istniejacego syncPush) — merge per-brawler MAX (jak cratesEarned).

**Serwer (source of truth):** NIE nowy licznik — wygrane sa DERYWOWALNE z istniejacych
`scores` (kazdy wiersz ma `brawler_id` + `mega_boss_defeated`). Weryfikacja/rekoncyliacja =
zapytanie po scores; klientowy cache moze byc korygowany w dol przy niezgodnosci.
**Backfill dla obecnych graczy (jednorazowy SQL, idempotentny):**
```sql
-- wygrane KTB per profil per czolg, do zasilenia progression przy pierwszym sync
SELECT profile_id, brawler_id, COUNT(*) AS wins
FROM public.scores
WHERE mega_boss_defeated = true AND scenario = 'ktb'
GROUP BY profile_id, brawler_id;
```
**KOREKTA:** zadnego `profiles.brawler_wins`, zadnego nowego RPC/endpointu — reuse pipeline
submit-score (wiersz w scores JEST zdarzeniem wygranej). Anti-cheat: heurystyki v1.0
(delta>1/mecz, tempo >1/min) liczone z scores — juz mozliwe.

## 10. i18n

Jak v1.0 (klucze `rank.*` literalowe, PL z diakrytykami / EN bez; wstega badge zawsze EN).
Dodac przy implementacji do OBU plikow (`en: typeof pl`).

## 11. Fazy wdrozenia (est. 6-10 dni — mniej niz v1.0 dzieki reuse)

- **CR-1 Config + stan (1d):** `config/crewRanks.ts` (progi/nagrody), `brawlerWins` w
  ProgressionState + normalizacja + merge MAX + syncPush/Pull, inkrement w triggerVictory.
- **CR-2 Backfill + weryfikacja (0.5d):** SQL z §9 + zasilenie przy sync; test na zywym koncie.
- **CR-3 BadgeRenderer programmatic (3-4d):** PIXI baker (wzorzec Tier3Baker), 80 kombinacji
  cache; podmienia PNG placeholder.
- **CR-4 UI (2-3d):** popup awansu (celebracja!), picker, profil grid, victory screen.
- **CR-5 Rollout (0.5d):** flaga `?crewranks=1`, playtest A54 (gate), housekeeping.

Numery wersji nadawane przy realizacji (v1.0 zakladal v0.115-117 — nieaktualne).

## 12-14. Budzet mobile / anti-cheat / metryki

Jak v1.0 (badge = statyczny sprite, zero per-frame; heurystyki z scores; metryki sukcesu
%L1>90% w 3 sesjach itd.) — z poprawka: progi metryk odnosza sie do NOWYCH progow z §4.

## 15. Zaleznosci — KOREKTA v1.1

**Twarde (ISTNIEJA):** ekonomia sigm ✓ · skrzynki (cratesEarned) ✓ · progression sync ✓ ·
system kosmetykow ✓ (v1.0 blednie uznawal za niezbudowany) · i18n ✓.
**Nowe do zbudowania:** BadgeRenderer (CR-3) · popup awansu (CR-4) · tint czolgu (L10 —
flagowac osobno, moze degradowac do sigm na start).
**Ryzyka:** krzywa (mitygacja: progi /2 + kalibracja 2 tyg) · farming (60s min + heurystyki)
· CTF bez submitu (KTB-only na start — komunikowac w UI).

## 16. RICE

Reach 100 · Impact 3 · Confidence 80% · Effort 3 (6-10 dni po korektach) => **RICE = 80**
(v1.0: 60 przy Effort 4 — reuse istniejacych systemow obniza koszt).

## 17. Otwarte pytania

1. ~~Cosmetic slots timeline~~ — ROZWIAZANE v1.1: system istnieje, nagrody = granty.
2. Reset sezonowy — rekomendacja: permanentne (potwierdzic przy S2).
3. PvP wagi — 1:1 na start.
4. Nowe czolgi — startuja od 0 wygranych.
5. Board "Top Commanders" — per czolg, top 100 wg wins; przy CR-5.
6. **NOWE v1.1:** czy CTF dostaje submit (odblokowuje wygrane CTF do rang) — decyzja przy L2b.

## 18. Changelog

- **v1.1 (2026-08-20):** korekta pod realna architekture — (1) progression zamiast profiles,
  (2) wygrane z `mega_boss_defeated` (is_victory nie istnieje) + backfill z scores,
  (3) reuse pipeline submit-score (zero nowych endpointow), (4) nagrody wylacznie na
  istniejacych systemach (sigmy/skrzynki/granty kosmetykow — "cosmetic slots blocker"
  nieaktualny), (5) progi /2 wg naszej kalibracji (mediana 4 mecze), (6) wstega EN wszedzie
  (decyzja Mariusza; L1 REKRUT placeholder do podmiany), (7) bez twardych numerow wersji;
  RICE 60 -> 80. Teaser badge'y w Garazu od v0.115.0.
- **v1.0 (2026-08-20):** pierwotny draft.
