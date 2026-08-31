/**
 * Polskie tlumaczenia.
 *
 * v0.27.0+: PL diacritics ODBLOKOWANE (Titan One Latin Extended supports).
 * Nowe stringi moga uzywac ąćęłńóśźż. Pre-v0.27.0 stringi stopniowo migrowane
 * per-fix/feature, nie hurtem.
 *
 * Reguly:
 * - Polszczyzna sensowna, gramatyka zachowana.
 * - Klucze hierarchiczne: 'sekcja.element.wariant'.
 * - Parametry w wartoiach: {nazwaParametru} (substytuowane przez t() w runtime).
 *
 * Dodawanie nowego klucza:
 * 1. Dodaj tutaj
 * 2. Dodaj odpowiednik w en.ts (TypeScript wymusi)
 * 3. Uzyj w UI: t('twoj.klucz')
 */
export const pl = {
    // ============================================================
    // App / Branding
    // ============================================================
    'app.title': 'Brawl Tanks',
    'app.tagline': 'Season 2',

    // ============================================================
    // Common UI elements
    // ============================================================
    'common.back': 'Cofnij',
    'common.next': 'Dalej',
    'common.play': 'Graj!',
    'common.cancel': 'Anuluj',
    'common.confirm': 'Potwierdź',
    'common.close': 'Zamknij',
    'common.soon': 'WKRÓTCE',
    'common.locked': 'W BUDOWIE',
    'common.loading': 'Ładowanie...',
    'common.yes': 'Tak',
    'common.no': 'Nie',

    // ============================================================
    // Tutorial / onboarding (FAZA A)
    // ============================================================
    'tutorial.badge': 'SAMOUCZEK · Krok {step}',
    'tutorial.progress': 'Krok {step}/{total}',
    'tutorial.infoBadge': 'DOBRZE WIEDZIEĆ',
    'tutorial.finishBadge': 'FINISZ',
    'tutorial.next': 'DALEJ',
    // Just-in-time podpowiedzi przedmiotow/stref (dymki w meczu, ItemHints)
    'hint.heart': '❤️ Leczy czołg — zbierz!',
    'hint.magnet': '🧲 Przyciąga gemy!',
    'hint.cube': '📦 Wzmacnia czołg! Złap przed wrogiem',
    'hint.mediPad': '🏥 Stań tu = leczysz czołg',
    'hint.powerPad': '⚡ Wjedź = TURBO ×2!',
    // FAZA C — karta celu trybu (in-game przy 1. wejsciu + ekran "Jak grac")
    'goal.title': 'TWÓJ CEL',
    'goal.play': 'GRAJ',
    'goal.ktb': 'Przetrwaj fale wrogów i pokonaj Mega Bossa!',
    'goal.ctf': 'Zdobądź flagę wroga i zanieś ją do swojej bazy!',
    // Ekran "Jak grac" w menu (sciaga: sterowanie + przedmioty + cele)
    'howto.title': 'JAK GRAĆ',
    'howto.controls': 'STEROWANIE',
    'howto.items': 'PRZEDMIOTY I STREFY',
    'howto.goals': 'CELE TRYBÓW',
    'howto.replay': 'POWTÓRZ SAMOUCZEK',
    'howto.move': 'Ruch',
    'howto.moveVal': 'Lewy joystick / WASD',
    'howto.shoot': 'Strzał',
    'howto.shootVal': 'Prawy joystick / LPM',
    'howto.super': 'Super-strzał',
    'howto.superVal': 'Naładuj gemami',
    'howto.power': 'Super-moc',
    'howto.powerVal': 'Klawisze 1/2/3 · scroll = wybierz · SPACJA/PPM = użyj',
    'howto.heart': '❤️ Serce — leczy czołg',
    'howto.magnet': '🧲 Magnes — przyciąga gemy',
    'howto.cube': '📦 Kostka — ⚔ mocniejszy strzał / 💙 więcej HP',
    'howto.medipad': '❤️‍🩹 Medi pad — leczy gdy stoisz',
    'howto.powerpad': '⚡ Power pad — TURBO ×2',
    // Leaderboard (ranking publiczny)
    'leaderboard.title': 'RANKING',
    'leaderboard.tab.ktb': 'Ubij bossa',
    'leaderboard.tab.ctf': 'Zabierz flagę',
    'leaderboard.tab.castle': 'Obroń zamek',
    'leaderboard.window.all': 'Wszech czasów',
    'leaderboard.window.week': 'Tydzień',
    'leaderboard.window.day': 'Dziś',
    'leaderboard.map.all': 'Wszystkie',
    'leaderboard.map.city': 'Miasto',
    'leaderboard.map.desert': 'Pustynia',
    'leaderboard.map.tropics': 'Tropiki',
    'leaderboard.map.arctic': 'Arktyka',
    'leaderboard.map.mars': 'Mars',
    'leaderboard.you': 'TY',
    'leaderboard.noRank': 'Zagraj mecz, żeby trafić do rankingu!',
    'leaderboard.empty': 'Brak wyników — bądź pierwszy!',
    'leaderboard.error': 'Nie udało się wczytać rankingu. Spróbuj ponownie.',
    'leaderboard.loading': 'Wczytywanie…',
    'leaderboard.refresh': 'Odśwież',
    'leaderboard.retry': 'Spróbuj ponownie',
    'leaderboard.rankup': 'awans!',
    'tutorial.heart.title': 'SERCE',
    'tutorial.heart.hint': 'Zbierz je — leczy Twój czołg',
    'tutorial.magnet.title': 'MAGNES',
    'tutorial.magnet.hint': 'Przyciąga wszystkie gemy do Ciebie',
    'tutorial.medipad.title': 'MEDI PAD',
    'tutorial.medipad.hint': 'Stań na nim — leczy czołg gdy na nim stoisz',
    'tutorial.powerpad.title': 'POWER PAD',
    'tutorial.powerpad.hint': 'Wjedź na niego — TURBO, szybszy czołg ×2!',
    'tutorial.move.title': 'RUSZAJ!',
    'tutorial.move.hintTouch': 'Przesuń lewym joystickiem, żeby jechać',
    'tutorial.move.hintDesktop': 'Użyj klawiszy WASD, żeby jechać',
    'tutorial.shoot.title': 'STRZELAJ!',
    'tutorial.shoot.hintTouch': 'Trzymaj prawy dżojstik, żeby strzelać',
    'tutorial.shoot.hintDesktop': 'Trzymaj lewy przycisk myszy, żeby strzelać',
    'tutorial.wave.title': 'FALA!',
    'tutorial.wave.hintTouch': 'Rozwal całą grupę wrogów!',
    'tutorial.wave.hintDesktop': 'Rozwal całą grupę wrogów!',
    'tutorial.gems.title': 'GEMY!',
    'tutorial.gems.hintTouch': 'Zbieraj gemy — ładują pasek SUPER!',
    'tutorial.gems.hintDesktop': 'Zbieraj gemy — ładują pasek SUPER!',
    'tutorial.super.title': 'SUPER STRZAŁ!',
    'tutorial.super.hintTouch': 'Masz super-pocisk! Strzelaj i zmieć wroga',
    'tutorial.super.hintDesktop': 'Masz super-pocisk! Strzelaj i zmieć wroga',
    'tutorial.power.title': 'SUPER MOC!',
    'tutorial.power.hintTouch': 'Tapnij przycisk mocy!',
    'tutorial.power.hintDesktop': 'Wciśnij 1, 2 lub 3 (albo SPACJĘ), by użyć mocy!',
    'tutorial.finish.title': 'GOTOWY!',
    'tutorial.finish.hint': 'Świetnie! Znasz już podstawy. Co teraz?',
    'tutorial.finish.play': 'GRAJ DALEJ',
    'tutorial.finish.menu': 'MENU',
    'tutorial.skip': 'POMIŃ SAMOUCZEK',
    'tutorial.done': '✓ ŚWIETNIE!',

    // ============================================================
    // Intro Screen
    // ============================================================
    'intro.start': 'START',
    'intro.tap_to_play': 'Stuknij, aby zagrać',

    // ============================================================
    // Main Hub
    // ============================================================
    'hub.play': 'GRAJ',
    'hub.playSubNew': 'Nowa rozgrywka',
    'hub.playSubFirst': 'Rozpocznij przygodę',
    'hub.howToPlay': 'PRZEWODNIK',
    'hub.settings': 'USTAWIENIA',
    'hub.leaderboard': 'LEADERBOARD',
    'hub.shop': 'SKLEP',
    'hub.continue': 'Kontynuuj jako {nickname} na mapie {map}',
    'hub.continueShort': 'Kontynuuj',
    'hub.changePlayer': 'Zmień gracza',
    'hub.welcome': 'Witaj, {name}!',
    'hub.editProfile': 'Edytuj profil',
    // PROG-F1 — pasek trofeów w hubie
    'hub.trophyLabel': 'TROFEA',
    'hub.trophyNext': 'jeszcze {n} 🏆 do nagrody',
    'hub.trophyMax': 'Wszystkie nagrody zdobyte! 🏆',
    // HUB-0 — nawigacja Menu Hub (rail/dock)
    'hub.nav.battle': 'BITWA',
    'hub.nav.garage': 'GARAŻ',
    'hub.nav.quests': 'ROZKAZY',
    'hub.nav.trophies': 'TROFEA',
    'hub.nav.rank': 'RANKING',
    'hub.nav.season': 'SEZON',
    // HUB-1 — baner sezonu (statyczny; realny countdown w pozniejszej fazie)
    'hub.season.eyebrow': 'Aktywny sezon',
    // SEASON-1/2 — Season Track + popup sezonu
    'hub.season.daysLeft': 'Do końca: {n} dni',
    'hub.season.ended': 'Sezon zakończony',
    'hub.season.whatsNew': 'Co wprowadza sezon',
    'hub.season.viewTrack': 'ZOBACZ SEASON TRACK',
    // Roadmapa sezonow (SEASON-2) — nazwy + bullety popupu
    'season.s2.name': 'Sezon 2 — Arena',
    'season.s2.short': 'Sezon 2',
    'season.s2.b1': 'Nowy Season Track: 5 nagród za trofea sezonowe',
    'season.s2.b2': 'Rangi czołgisty i nowa strona profilu',
    'season.s2.b3': 'Finał 31.08 — zgarnij nagrody, zanim znikną!',
    'season.s3.name': 'Sezon 3 — Powrót do szkoły',
    'season.s3.short': 'Sezon 3',
    'season.s3.b1': 'Świeży Season Track: sigmy i skrzynki do zdobycia',
    'season.s3.b2': 'Szkolny klimat: kreda, plecaki i praca domowa z trofeów',
    'season.s3.b3': 'Więcej niespodzianek wkrótce!',
    // SEASON KIT: nazwa licznika znajdziek sezonu (HUD, ekran konca meczu).
    // SEZON 2 — znajdzki (art i nazwy wspolne z S3, patrz seasonContent.ts)
    'season.s2.counter': 'książki',
    'season.s2.item1': 'Ołówek',
    'season.s2.item2': 'Książka',
    'season.s2.item3': 'Zeszyt',
    'season.s2.item4': 'Ekierka',
    'season.s2.item5': 'Plecak',
    'season.s2.item6': 'Globus',
    'season.s3.counter': 'książki',
    // SEASON KIT — nazwy 6 znajdziek sezonu 3 (dec. A, 28.08.2026).
    'season.s3.item1': 'Ołówek',
    'season.s3.item2': 'Książka',
    'season.s3.item3': 'Zeszyt',
    'season.s3.item4': 'Ekierka',
    'season.s3.item5': 'Plecak',
    'season.s3.item6': 'Globus',
    // SEASON KIT — stan "wszystkie progi zdobyte" w pasku popupu.
    'season.allRewards': 'wszystkie nagrody zdobyte!',
    'season.s4.name': 'Sezon 4 — Śnieżna Ofensywa',
    'season.s4.short': 'Sezon 4',
    'season.s4.b1': 'Świeży Season Track: sigmy i skrzynki do zdobycia',
    'season.s4.b2': 'Zimowy klimat: śnieg, prezenty i Mikołaj na gąsienicach',
    'season.s4.b3': 'Więcej niespodzianek wkrótce!',
    'season.s5.name': 'Sezon 5 — Lodowy Blitz',
    'season.s5.short': 'Sezon 5',
    'season.s5.b1': 'Świeży Season Track: sigmy i skrzynki do zdobycia',
    'season.s5.b2': 'Noworoczny klimat: fajerwerki i lodowe pole bitwy',
    'season.s5.b3': 'Więcej niespodzianek wkrótce!',
    'season.s6.name': 'Sezon 6 — Błotna Wiosna',
    'season.s6.short': 'Sezon 6',
    'season.s6.b1': 'Świeży Season Track: sigmy i skrzynki do zdobycia',
    'season.s6.b2': 'Wiosenny klimat: roztopy, błoto i jajka-niespodzianki',
    'season.s6.b3': 'Więcej niespodzianek wkrótce!',
    'season.s7.name': 'Sezon 7 — Czołgowy Grill',
    'season.s7.short': 'Sezon 7',
    'season.s7.b1': 'Świeży Season Track: sigmy i skrzynki do zdobycia',
    'season.s7.b2': 'Majówkowy klimat: grill, piknik i kiełbasa-rakieta',
    'season.s7.b3': 'Więcej niespodzianek wkrótce!',
    'season.s8.name': 'Sezon 8 — Tropikalne Wakacje',
    'season.s8.short': 'Sezon 8',
    'season.s8.b1': 'Świeży Season Track: sigmy i skrzynki do zdobycia',
    'season.s8.b2': 'Plażowy klimat: kokosy, leżaki i gumowe kaczki',
    'season.s8.b3': 'Więcej niespodzianek wkrótce!',
    // HUB-4 — Szlak Trofeow
    'hub.road.act1': 'Akt I — Rekrut',
    'hub.road.act2': 'Akt II — Weteran',
    'hub.road.next': 'Następna',
    'hub.road.seasonTitle': 'Ścieżka Sezonu',
    // HUB-6 — Ranking (mini-board)
    'hub.rank.full': 'Pełny ranking',
    'hub.rank.you': 'TY',
    'hub.rank.empty': 'Brak wyników — zagraj mecz!',
    'hub.rank.error': 'Nie udało się wczytać rankingu',
    // HUB-5 — Statystyki
    'hub.stats.title': 'Statystyki',
    'hub.stats.bolts': 'Sigmy',
    'hub.stats.milestones': 'Kamienie milowe',
    'hub.stats.games': 'Rozegrane gry',
    'hub.stats.since': 'Gra od',
    'hub.stats.best': 'Najlepszy wynik',
    // PROFILE-1 — strona profilu (chip w readoucie)
    'hub.profile.title': 'PROFIL',
    'hub.profile.edit': 'EDYTUJ',
    'hub.profile.tab.overview': 'Przegląd',
    'hub.profile.tab.records': 'Rekordy',
    'hub.profile.tab.collection': 'Kolekcja',
    // SEASON KIT — zakladka SEZON w profilu.
    'season.findThemAll': 'Znajdź je wszystkie!',
    'hub.profile.season.pointTrack': 'Za punkty',
    'hub.profile.season.setTrack': 'Za komplety',
    'hub.profile.season.gateCrate': 'Trzy pospolite',
    'hub.profile.season.gateTitle': 'Piec przedmiotow',
    'hub.profile.season.gateFull': 'Cala kolekcja',
    'hub.profile.season.museumSoon': 'Zakonczone sezony trafia tu do muzeum kolekcji.',
    'hub.profile.rank': 'Miejsce w rankingu',
    'hub.profile.kills': 'Pokonani wrogowie',
    'hub.profile.gems': 'Zebrane gemy',
    'hub.profile.time': 'Czas w grze',
    'hub.profile.accuracy': 'Celność ogólna',
    'hub.profile.rec.kills': 'Najwięcej pokonanych',
    'hub.profile.rec.gems': 'Najwięcej gemów',
    'hub.profile.rec.time': 'Najdłuższy mecz',
    'hub.profile.rec.accuracy': 'Najlepsza celność',
    'hub.profile.rec.combo': 'Najwyższe combo',
    'hub.profile.accHint': 'Celność liczy się od {n} strzałów w meczu',
    'hub.profile.recHint': 'Rekord combo liczony od teraz',
    // RANKS-1 — RANGA CZOLGISTY (per gracz) + celebracja awansu
    'hub.profile.rankTitle': 'Ranga czołgisty',
    'hub.profile.rankHint': 'Wygrywaj mecze, by awansować!',
    'hub.profile.rankMax': 'Najwyższa ranga osiągnięta!',
    'rankup.title': 'AWANS!',
    'rankup.reward': 'Nagroda',
    'rankup.cta': 'SUPER!',
    'hub.garage.cosmeticsMoved': 'Swój styl ustawisz w profilu — tapnij swój awatar!',
    'hub.garage.cratesFrom': 'Zdobywasz je za rozkazy, trofea i sezon — albo kupujesz w sklepie.',
    // F2a — Zrzuty (skrzynki) + kosmetyki
    'hub.garage.crates': 'Skrzynki: {n}',
    'hub.garage.pity': 'Do gwarantowanego rzadkiego: {n}',
    'hub.garage.open': 'OTWÓRZ',
    'hub.garage.cosmetics': 'Styl {owned}/{total}',
    'hub.garage.type.nickColor': 'Kolory nicku',
    'hub.garage.type.frame': 'Ramki avatara',
    'hub.garage.type.title': 'Tytuły',
    'hub.garage.type.horn': 'Klaksony 🖥️ (klawisz H)',
    'hub.garage.type.voice': 'Głos dowódcy',
    'crate.rarity.c': 'Zwykły',
    'crate.rarity.r': 'Rzadki',
    'crate.rarity.e': 'Epicki',
    'crate.rarity.l': 'Legendarny',
    'crate.title': 'Zrzut zaopatrzenia',
    'crate.tap': 'Tapnij, by otworzyć!',
    'crate.pools': 'Co może wypaść?',
    'crate.close': 'Zamknij',
    'crate.newCosmetic': 'Nowy kosmetyk!',
    'crate.dup': 'Duplikat → sigmy',
    'crate.bolts': 'sigm',
    'cosmetic.nc_silver': 'Srebrny nick',
    'cosmetic.nc_gold': 'Złoty nick',
    'cosmetic.nc_lime': 'Limonkowy nick',
    'cosmetic.nc_fire': 'Ognisty nick',
    'cosmetic.nc_ocean': 'Oceaniczny nick',
    'cosmetic.nc_shimmer': 'Złoty blask',
    'cosmetic.fr_steel': 'Stalowa ramka',
    'cosmetic.fr_blue': 'Niebieska ramka',
    'cosmetic.fr_purple': 'Fioletowa poświata',
    'cosmetic.fr_gold': 'Złota ramka',
    'cosmetic.ti_recruit': 'Rekrut',
    'cosmetic.ti_gunner': 'Kanonier',
    'cosmetic.ti_ace': 'As Pancerny',
    'cosmetic.ti_legend': 'Legenda Areny',
    'cosmetic.nc_mint': 'Miętowy nick',
    'cosmetic.nc_rose': 'Różowy nick',
    'cosmetic.nc_sky': 'Błękitny nick',
    'cosmetic.nc_crimson': 'Karmazynowy nick',
    'cosmetic.nc_violet': 'Fioletowy nick',
    'cosmetic.nc_toxic': 'Toksyczny nick',
    'cosmetic.nc_rainbow': 'Tęczowy blask',
    'cosmetic.fr_bronze': 'Brązowa ramka',
    'cosmetic.fr_forest': 'Leśna ramka',
    'cosmetic.fr_red': 'Czerwona ramka',
    'cosmetic.fr_teal': 'Turkusowa poświata',
    'cosmetic.fr_neon': 'Neonowa aureola',
    'cosmetic.ti_driver': 'Kierowca',
    'cosmetic.ti_scout': 'Zwiadowca',
    'cosmetic.ti_sapper': 'Saper',
    'cosmetic.ti_builder': 'Budowniczy',
    'cosmetic.ti_bossbane': 'Pogromca Bossów',
    'cosmetic.ti_immortal': 'Nieśmiertelny',

    'hub.profile.sticker': 'Sticker',
    'hub.profile.stickerEmpty': 'Nie masz jeszcze stickerów. Kupisz je w SKLEPIE.',

    // ── SHOP-1: towar wyłącznie sklepowy ──
    // stickery — siła / ciało
    'cosmetic.st_biceps': 'Biceps',
    'cosmetic.st_fist': 'Pięść',
    'cosmetic.st_punch': 'Cios',
    'cosmetic.st_glove': 'Rękawica',
    'cosmetic.st_arm': 'Mechaniczne ramię',
    'cosmetic.st_leg': 'Mechaniczna noga',
    // stickery — militaria
    'cosmetic.st_helmet': 'Hełm',
    'cosmetic.st_shield': 'Tarcza',
    'cosmetic.st_swords': 'Miecze',
    'cosmetic.st_target': 'Cel',
    'cosmetic.st_medal': 'Medal',
    'cosmetic.st_bolt': 'Śruba',
    // klaksony — nazwy ROBOCZE: nie znam brzmienia plików, więc ponumerowałem.
    // Zmiana nazwy to sześć stringów tutaj i sześć w en.ts.
    'cosmetic.hn_1': 'Klakson 1',
    'cosmetic.hn_2': 'Klakson 2',
    'cosmetic.hn_3': 'Klakson 3',
    'cosmetic.hn_4': 'Klakson 4',
    'cosmetic.hn_5': 'Klakson 5',
    'cosmetic.hn_6': 'Klakson 6',
    'cosmetic.vo_commander': 'Dowódca',

    // ── SKLEP ──
    'shop.title': 'SKLEP',
    'shop.heroLine1': 'Sigmy zdobywasz w każdej bitwie — za trofea, rozkazy i rangi.',
    'shop.heroLine2': 'Tutaj zamieniasz je na coś swojego.',
    'shop.balance': 'MASZ',
    'shop.impact.none': 'Kosmetyczne — 0 wpływu na grę',
    'shop.impact.boost': 'Wzmocnienie — wpływa na grę',
    'shop.badge.owned': 'MASZ',
    'shop.badge.soon': 'WKRÓTCE',
    'shop.buy': 'KUP',
    'shop.listen': '▶ POSŁUCHAJ',
    'shop.confirmQuestion': 'Kupić za',
    'shop.confirmYes': 'TAK, KUP',
    'shop.remaining': 'Zostanie Ci:',
    'shop.tooPoor': 'Za mało sigm',
    'shop.bought': 'Kupione!',
    'shop.empty': 'Tu jeszcze nic nie ma.',
    'shop.hornDesktopNote': '🖥️ Działa TYLKO na komputerze — klawisz H. Na telefonie nie zabrzmi.',
    'shop.sandbox': 'PIASKOWNICA — zakupy nie są zapisywane',
    'shop.sandboxReset': 'RESET',
    'shop.tab.crates': 'SKRZYNKI',
    'shop.tab.stickers': 'NAKLEJKI',
    'shop.tab.horns': 'KLAKSONY',
    'shop.tab.voice': 'GŁOS',
    'shop.tab.soon': 'WKRÓTCE',
    'shop.item.crate1.name': 'Skrzynka',
    'shop.item.crate1.desc': 'Jedna skrzynka z kosmetyką i sigmami.',
    'shop.item.crate3.name': 'Trzy skrzynki',
    'shop.item.crate3.desc': 'Paczka trzech skrzynek — taniej niż pojedynczo.',
    'shop.item.crate10.name': 'Dziesięć skrzynek',
    'shop.item.crate10.desc': 'Duża paczka. Największy rabat w sklepie.',
    'shop.item.sticker.desc': 'Naklejka przy Twoim zdjęciu w profilu.',
    'shop.item.horn.desc': 'Wciśnij H w grze, żeby zatrąbić. Nic więcej nie robi.',
    'shop.item.vo_commander.name': 'Głos: Dowódca',
    'shop.item.vo_commander.desc': 'Zagrzewa Cię na starcie i ostrzega, gdy tracisz życie.',
    'shop.item.soon_avatar.name': 'Nowe awatary',
    'shop.item.soon_avatar.desc': 'Kolejne twarze do wyboru w profilu.',
    'shop.item.soon_skin.name': 'Skiny czołgu',
    'shop.item.soon_skin.desc': 'Twój czołg w innych barwach.',
    'shop.item.soon_part.name': 'Części czołgu',
    'shop.item.soon_part.desc': 'Drzewko rozwoju — prędkość i obrażenia.',
    'shop.voice.start': 'Do boju! Pokaż im, kto tu rządzi!',
    'shop.voice.lowHp': 'Uważaj! Tracisz pancerz!',

    // ============================================================
    // ROZKAZY (PROG-F3 / HUB-3) — skladnia: IKONA + CZASOWNIK + LICZNIK
    // Forma "Czasownik rzecz: {n}" jest odporna na polska odmiane liczebnika
    // (2 wrogow / 5 wrogow) i skanuje sie wzrokiem, a nie czyta zdaniem.
    // ============================================================
    // ============================================================
    // Super Moce (PROG-F7a — nazwy w rejestrze przez labelKey)
    // ============================================================
    'power.aura': 'Aura',
    'power.megaBomb': 'Bomba',
    'power.freeze': 'Mróz',
    'power.repair': 'Naprawa',
    'hud.repairStart': '🔧 NAPRAWA W TOKU!',
    'hud.repairActive': '🔧 NAPRAWA {sec}s',
    'power.tower': 'Wieża',
    'hud.towerStart': '🗼 WIEŻA MG ROZSTAWIONA!',
    'power.rockets': 'Salwa',
    'hud.rocketsStart': '🚀 SALWA RAKIET!',
    'road.unlock.rockets': '🚀 Moc: Salwa Rakiet!',
    'power.ghost': 'Widmo',
    'hud.ghostStart': '👻 WIDMO ZWODZI WROGÓW!',
    'power.mines': 'Miny',
    'hud.minesStart': '💥 MINY UZBROJONE — JEDŹ!',
    'road.unlock.mines': '💥 Moc: Miny!',
    'power.build': 'Mur',
    'hud.buildStart': '🧱 BUDOWA MURU — JEDŹ!',
    'road.unlock.build': '🧱 Moc: Mur!',
    'power.strike': 'Nalot',
    'hud.strikeStart': '🛸 NALOT NADCIĄGA!',
    'power.hole': 'Dziura',
    'hud.holeStart': '🕳️ CZARNA DZIURA — WIR!',
    'power.laser': 'Laser',
    'hud.laserStart': '🔦 LASER NAMIERZA CELE!',
    'power.pong': 'Ping-Pong',
    'hud.pongStart': '🏓 SERWUJ! ODBIJASZ POCISKI!',
    'power.duck': 'Kaczka',
    'hud.duckStart': '🦆 GIGA KACZKA! KWAAAK!',
    'power.locker': 'Paczkomat',
    'hud.lockerStart': '📦 PACZKOMAT — DOSTAWA!',
    'power.disco': 'Disco',
    'hud.discoStart': '🪩 DISCO SZAŁ! WSZYSCY TAŃCZĄ!',
    'power.granny': 'Babcia',
    'hud.grannyStart': '👵 BABCIA — A SIO!',
    'power.burp': 'Mega Bek',
    'hud.burpStart': '📢 BEEEEK!',
    // v0.119.0 — bogate karty mocy w GARAZU (odwzorowanie boxow ze strony www):
    // opisy 1:1 z sigmatanks.eu + naglowki sekcji + chipy Cooldown/Od.
    'power.aura.desc': 'Tarcza blokująca całkowicie obrażenia przez 6 s.',
    'power.megaBomb.desc': 'Natychmiastowe 800 dmg w promieniu 250 px.',
    'power.freeze.desc': 'Zamraża wszystkich wrogów na ekranie na 5 s.',
    'power.rockets.desc': '8 samosterujących rakiet, 300 dmg i eksplozja r=60.',
    'power.mines.desc': '7 s okna: zostawiasz do 14 min (500 dmg, zapalnik 5 s).',
    'power.repair.desc': 'Kanał 3 s, odzyskujesz 35% maksymalnego HP.',
    'power.build.desc': '4 s okna: stawiasz za sobą zaporę z segmentów na 8 s.',
    'power.tower.desc': 'Wieżyczka MG na 8 s: sama namierza wrogów w zasięgu 420 px.',
    'power.ghost.desc': 'Wabik ściąga wrogów na 5 s, potem znika w eksplozji 300 dmg.',
    'power.strike.desc': 'Eskadra 5 bombowców zrzuca dywan 12 bomb po linii celowania.',
    'power.hole.desc': 'Wir na 5 s zasysa wrogów z 420 px i miażdży w rdzeniu.',
    'power.laser.desc': 'Orbitalna plamka na 7,5 s sama goni wrogów — 600 dmg/s.',
    'power.pong.desc': 'Aura na 5 s odbija pociski wroga z powrotem do nadawcy.',
    'power.duck.desc': 'Gigantyczna kaczka zygzakuje po mapie i miażdży wszystko na drodze.',
    'power.locker.desc': 'Automat ostrzeliwuje wrogów paczkami — 450 dmg co pół sekundy.',
    'power.disco.desc': '6 s imprezy: wrogowie tańczą i do końca meczu biją 20% słabiej.',
    'power.granny.desc': 'Dreptaczka leczy 5% HP/s, a wrogowie w promieniu 360 px uciekają.',
    'power.burp.desc': 'Cztery fale dźwiękowe odrzucają i ogłuszają wrogów na sekundę.',
    'hub.garage.powersTitle': 'Super Moce ({n})',
    'hub.garage.powersSub': '{n} mocy do wyboru, odblokowywanych na Szlaku Trofeów.',
    'hub.garage.funSub': '{n} szalonych mocy ze slotu 🎲 — czysta zabawa.',
    'power.chip.cooldown': '⏱ {n} s',
    'power.chip.fromStart': 'Od startu',
    'power.chip.fromTrophies': 'Od {n} 🏆',
    // v0.114.0 — slot 🎲 (Szalone Moce)
    'power.dice': 'Kostka',
    'hud.diceRolled': '🎲 {name}!',
    'hud.grannySay1': 'A SIO!',
    'hud.grannySay2': 'ZUPA! 🍲',
    'hud.loadoutRemapped': '⚠️ Moc niedostępna w tym trybie — podmieniono!',
    'road.unlock.repair': '🔧 Moc: Naprawa!',
    'road.unlock.tower': '🎯 Moc: Wieża!',
    'hub.garage.loadout': 'WYBIERZ 3 SUPER MOCE',
    'hub.garage.loadoutHint': 'Tapnij puste pole, potem moc z listy — z tym wjedziesz do bitwy!',
    'hub.garage.slot': 'Moc {n}',
    'hub.garage.powerLocked': 'Od {n} 🏆',
    'hub.garage.funMode': 'Szalone Moce',
    'hub.garage.funModeHint': 'Trzeci przycisk 🎲 losuje szaloną moc przy każdym użyciu!',
    'hub.battle.difficulty': 'Poziom trudności',
    'hub.battle.pickTank': 'Wybierz czołg',
    // HUB-1.6b — opisy czolgow 1:1 ze strony sigmatanks.eu (karty w BITWIE)
    'brawler.twardy.desc': 'Solidna baza. Zbalansowany HP, obrażenia i tempo — bezpieczny start w każdym scenariuszu.',
    'brawler.heavy.desc': 'Chodzący bunkier z 700 HP. Wolno przeładowuje, ale wchłania to, co zniosłoby dwa inne czołgi.',
    'brawler.scout.desc': 'Najszybszy w garażu. Reload 250 ms, tylko 200 HP — gra tempem, nie wymianą ciosów.',
    'brawler.sniper.desc': 'Jeden strzał, 300 dmg. Reload sekunda. Karze każdy błąd wroga na dystansie.',
    'brawler.plasma.desc': 'Plazmowe pociski, stałe DPS i solidne 400 HP. Uniwersalny do wszystkich map.',
    'brawler.pyro.desc': 'Strzela szeroką wachlarzową salwą. Pokrywa strefę, roztapia grupki wrogów z bliska.',
    'brawler.shadow.desc': 'Zwrotny assassin — 6.5 speed i 150 dmg. Wchodzi, kończy cel, wychodzi.',
    'brawler.king.desc': 'Elita z 500 HP i 200 dmg. Pełny pakiet, jeśli wolisz jeden czołg do wszystkiego.',

    'hub.quests.daily': 'ROZKAZY DNIA',
    'hub.quests.weekly': 'ROZKAZY TYGODNIA',
    'hub.quests.claim': 'ODBIERZ',
    'hub.quests.claimed': 'ODEBRANE',
    'hub.quests.setTitle': 'Komplet dnia',
    'hub.quests.setDesc': 'Wykonaj wszystkie 3 rozkazy dnia',
    'hub.quests.setReward': '+{bolts} sigm i skrzynka',
    'hub.quests.weekSetTitle': 'Komplet tygodnia',
    'hub.quests.weekSetReward': '+{bolts} sigm i {crates} skrzynki',
    'hub.quests.locked': 'Rozkazy od {n} 🏆',
    'hub.quests.lockedHint': 'Zdobywaj trofea w meczach — zostało {n} 🏆',
    'hub.quests.resetDaily': 'Nowe rozkazy jutro',
    'hub.quests.resetWeekly': 'Nowy zestaw w poniedziałek',
    'hub.quests.general': 'Generał Pancerz',
    'hub.quests.done': 'WYKONANO',

    'quest.e_kill': 'Zniszcz wrogów: {n}',
    'quest.e_gem': 'Zbierz gemy: {n}',
    'quest.e_heart': 'Zbierz serca: {n}',
    'quest.e_supershot': 'Odpal super strzały: {n}',
    'quest.e_superpwr': 'Użyj super mocy: {n}',
    'quest.e_seconds': 'Przetrwaj łącznie: {n} min',
    'quest.e_match': 'Rozegraj mecze: {n}',

    'quest.m_kill': 'Zniszcz wrogów: {n}',
    'quest.m_boss': 'Pokonaj bossów: {n}',
    'quest.m_magnet': 'Złap magnesy: {n}',
    'quest.m_cube': 'Zbierz kostki mocy: {n}',
    'quest.m_combo': 'Zrób combo ×{n}',
    'quest.m_trophies': 'Zdobądź {n} trofeów w jednym meczu',
    'quest.m_runtime': 'Przetrwaj {n} min w jednym meczu',
    'quest.m_rungems': 'Zbierz {n} gemów w jednym meczu',

    'quest.d_frozen': 'Zniszcz zamrożonych wrogów: {n}',
    'quest.d_bomb': 'Zniszcz {n} wrogów jedną Mega Bombą',
    'quest.d_ram': 'Staranuj wrogów: {n}',
    'quest.d_stealth': 'Zniszcz wrogów ze strefy ukrycia: {n}',
    'quest.d_medipad': 'Skorzystaj z pada leczącego: {n}',
    'quest.d_flag': 'Zdobądź flagi w CTF: {n}',
    'quest.d_trophies': 'Zdobądź dziś trofea: {n}',
    'quest.d_map': 'Rozegraj mecz na mapie: {map}',

    'quest.w_trophies': 'Zdobądź trofea w tym tygodniu: {n}',
    'quest.w_maps': 'Zagraj na {n} różnych mapach',
    'quest.s_perfect': 'Ukończ mecz bez utraty życia',
    'quest.s_combo': 'Zrób combo ×{n}',
    'quest.s_trophies': 'Zdobądź {n} trofeów w jednym meczu',

    'quest.general.1': 'Rekrucie, te gemy same się nie zbiorą!',
    'quest.general.2': 'Melduj się po nagrodę — ale najpierw robota.',
    'quest.general.3': 'W moich czasach czołgi jeździły pod górkę. W obie strony.',
    'quest.general.4': 'Rozkaz to rozkaz. Lizak dostaniesz później.',
    'quest.general.5': 'Widziałem twój ostatni mecz. Może być lepiej!',
    'quest.general.6': 'Nie stój, bo zardzewiejesz!',
    'quest.general.7': 'Kto dziś zrobi wszystkie trzy, ten je ze mną obiad.',
    'quest.general.8': 'Pancerz masz. Odwagę? Zaraz sprawdzimy.',
    'quest.general.9': 'Trzy rozkazy. Jeden dzień. Zero wymówek.',
    'quest.general.10': 'Sigmy nie rosną na drzewach, rekrucie.',
    'quest.general.11': 'Uśmiech na twarz i marsz do czołgu!',
    'quest.general.12': 'Generał Pancerz melduje: masz robotę.',

    'hud.questDone': '✅ {name}',
    'hud.questProgress': '📋 {name} — {cur}/{max}',
    'end.questsDone': 'Rozkazy: {n}',
    'end.funMode': 'Szalone Moce',
    // SEASON KIT — chip znajdziek na ekranie konca meczu.
    'end.seasonPickups': 'podreczniki',

    // ============================================================
    // Scenario Picker (Ekran 1)
    // ============================================================
    'picker.scenarioTitle': 'Wybierz scenariusz',
    'picker.mapTitle':      'Wybierz mapę',
    'picker.mapChangeHint': 'Zmień mapę ›',
    'picker.brawlerTitle': 'Wybierz pojazd',
    'picker.difficultyTitle': 'Poziom trudności',
    'picker.step': 'Krok {current} z {total}',

    // Scenarios — name, description, CTA
    'scenario.ktb.name': 'Ubij bossa',
    'scenario.ktb.desc': 'Zniszcz Mega Bossa',
    'scenario.ktb.cta.desert': 'GRAJ !',
    'scenario.ktb.cta.city': 'GRAJ !',
    'scenario.ktb.cta.tropics': 'GRAJ !',
    'scenario.ktb.cta.arctic': 'GRAJ !',

    'scenario.ctf.name': 'Zabierz flagę',
    'scenario.ctf.desc': 'Dowieź 3 flagi do bazy',
    'scenario.ctf.cta': 'GRAJ !',
    'scenario.ctf.mapBadge': 'Mapa: Fortified Ruins',

    'scenario.castle.name': 'Obroń zamek',
    'scenario.castle.desc': 'Broń zamku przez 6 fal',
    'scenario.castle.cta': 'GRAJ !',
    'scenario.castle.mapBadge': 'Mapa: Castle Grounds',

    'scenario.save_king.name': 'Uratuj króla',
    'scenario.save_king.desc': 'Wkrótce dostępne!',
    'scenario.save_king.cta': 'GRAJ !',

    // ============================================================
    // Maps — display names + taglines
    // ============================================================
    'map.desert.name': 'PUSTYNIA',
    'map.desert.tagline': 'Złota pustynia faraonów',

    'map.city.name': 'CYBERPUNK',
    'map.city.tagline': 'Neonowe miasto przyszłości',

    'map.tropics.name': 'TROPIKI',
    'map.tropics.tagline': 'Karaibskie gospodarstwo',

    'map.arctic.name': 'ARKTYKA',
    'map.arctic.tagline': 'Lodowa pustynia',

    'map.mars.name': 'MARS',
    'map.mars.tagline': 'Opuszczona baza i UFO',

    'map.range.name': 'POLIGON',
    'map.range.tagline': 'Wojskowy tor przeszkód',

    // ============================================================
    // Difficulty levels
    // ============================================================
    'difficulty.easy.label': 'LATWY',
    'difficulty.easy.desc': 'Mniej wrogów, słabszy boss',

    'difficulty.normal.label': 'NORMALNY',
    'difficulty.normal.desc': 'Standardowe wyzwanie',

    'difficulty.hard.label': 'TRUDNY',
    'difficulty.hard.desc': 'Więcej wrogów, mocniejszy boss',

    'difficulty.nightmare.label': 'KOSZMAR',
    'difficulty.nightmare.desc': 'Tylko dla najlepszych!',

    // ============================================================
    // Brawler display names
    // ============================================================
    'brawler.twardy.name': 'TWARDY',
    'brawler.heavy.name': 'PANCERNY',
    'brawler.scout.name': 'ZWIAD',
    'brawler.sniper.name': 'SNAJPER',
    'brawler.plasma.name': 'TECH',
    'brawler.pyro.name': 'OGNIARZ',
    'brawler.shadow.name': 'CIEŃ',
    'brawler.king.name': 'KRÓL',

    // ============================================================
    // Settings (v0.42.0 FAZA 8a finalize + v0.43.0 FAZA 8b: profile section)
    // ============================================================
    'settings.title': 'Ustawienia',
    'settings.audio': 'Dźwięk',
    'settings.music': 'Muzyka',
    'settings.sfx': 'Efekty dźwiękowe',
    'settings.controls': 'Sterowanie',
    'settings.language': 'Język',
    'settings.language.pl': 'Polski',
    'settings.language.en': 'English',
    'settings.graphics': 'Grafika',
    'settings.comingSoon': 'Wkrótce dostępne',

    // ============================================================
    // Errors / Validation
    // ============================================================
    'error.missingFields': 'Brakuje wymaganych pól',
    'error.invalidConfig': 'Nieprawidłowa konfiguracja gry',
    'error.audioLoad': 'Nie udało się załadować dźwięku',

    // ============================================================
    // Notifications / In-game HUD
    // @deprecated v0.51.0 — przeniesione do namespace hud.* (sekcja na dole pliku).
    // Klucze ponizej zostawione bezinwazyjnie do osobnego sweep'u po grep'ie
    // wszystkich call-sites w repo. NIE uzywaj w nowym kodzie.
    // ============================================================
    'notif.superCharge': '+{count} SUPER STRZAŁY!',
    'notif.megaBoss': 'UWAGA: MEGA BOSS!',
    'notif.victory': 'ZWYCIĘSTWO!',
    'notif.gameOver': 'PRZEGRANA',
    'notif.aura': 'TARCZA AKTYWNA!',
    'notif.megaBomb': 'MEGA BOMBA — {count} celów!',
    'notif.freeze': 'FREEZE — {count} wrogów!',
    'notif.magnet': 'MAGNET 5s!',

    // ============================================================
    // Profile / Onboarding (FAZA 7b)
    // ============================================================
    'profile.onboarding.welcomeTitle': 'Witaj, dowodco!',
    'profile.onboarding.welcomeSubtitle': 'Stwórz swój profil zanim ruszysz do walki',
    'profile.onboarding.pickAvatarLabel': 'Wybierz awatara',
    'profile.onboarding.pickFlagLabel': 'Twoja flaga',
    'profile.onboarding.startButton': 'ROZPOCZNIJ',

    'profile.onboarding.nicknameLabel': 'Twój pseudonim',
    'profile.onboarding.nicknamePlaceholder': 'np. Mariusz123',
    'profile.onboarding.nicknameHint': '2-16 znaków: litery i cyfry',
    'profile.onboarding.nicknameError': 'Pseudonim musi mieć 2-16 liter lub cyfr',
    'profile.onboarding.nicknameTaken': 'Pseudonim zajęty — wybierz inny',

    // ============================================================
    // Profile / Edit (v0.43.0 FAZA 8b)
    // ============================================================
    'profile.edit.title': 'Edycja profilu',
    'profile.edit.subtitle': 'Zmień swój wygląd i pseudonim',
    'profile.edit.saveButton': 'ZAPISZ ZMIANY',
    'profile.edit.savedToast': 'Profil zaktualizowany ✓',
    'profile.edit.nicknameUnchanged': 'Pseudonim niezmieniony',
    'profile.edit.nicknameTaken': 'Pseudonim zajęty — wybierz inny',
    'profile.edit.noProfileTitle': 'Brak aktywnego profilu',
    'profile.edit.noProfileSubtitle': 'Wróć do menu i stwórz profil',

    // PROFILE-1: roster v2 — 9 czolgistow (nazwy = pliki bez _200, wspolne PL/EN)
    'profile.avatar.ash.name': 'Ash',
    'profile.avatar.ash.desc': 'Spokojny strateg',
    'profile.avatar.chris.name': 'Chris',
    'profile.avatar.chris.desc': 'Mistrz taranowania',
    'profile.avatar.dane.name': 'Dane',
    'profile.avatar.dane.desc': 'Szybki zwiadowca',
    'profile.avatar.jack.name': 'Jack',
    'profile.avatar.jack.desc': 'Urodzony lider',
    'profile.avatar.johny.name': 'Johny',
    'profile.avatar.johny.desc': 'Gorąca głowa',
    'profile.avatar.matti.name': 'Matti',
    'profile.avatar.matti.desc': 'Techniczny geniusz',
    'profile.avatar.pablo.name': 'Pablo',
    'profile.avatar.pablo.desc': 'Wesoły ryzykant',
    'profile.avatar.steve.name': 'Steve',
    'profile.avatar.steve.desc': 'Twardy weteran',
    'profile.avatar.tommy.name': 'Tommy',
    'profile.avatar.tommy.desc': 'Młody talent',

    // PROFILE-1: 18 flag (nazwy do aria/sortowania — na kaflach same flagi)
    'profile.flag.ar': 'Argentyna',
    'profile.flag.br': 'Brazylia',
    'profile.flag.ca': 'Kanada',
    'profile.flag.de': 'Niemcy',
    'profile.flag.es': 'Hiszpania',
    'profile.flag.fr': 'Francja',
    'profile.flag.gb': 'Wielka Brytania',
    'profile.flag.il': 'Izrael',
    'profile.flag.it': 'Włochy',
    'profile.flag.jp': 'Japonia',
    'profile.flag.kr': 'Korea Południowa',
    'profile.flag.nl': 'Holandia',
    'profile.flag.pl': 'Polska',
    'profile.flag.pt': 'Portugalia',
    'profile.flag.se': 'Szwecja',
    'profile.flag.tr': 'Turcja',
    'profile.flag.ua': 'Ukraina',
    'profile.flag.us': 'USA',

    // ============================================================
    // Pickups / In-game events (v0.44.0 FAZA 8.6 — PowerCube)
    // ============================================================
    'pickup.dmgUp': '+DMG! ⚔',
    'pickup.hpUp': '+HP! 💙',
    'pickup.cubeStolen': 'Cube skradziony! 👀',

    // ──────────────────────────────────────────────────────────
    // HUD — labele (na pillach)
    // ──────────────────────────────────────────────────────────
    'hud.hp': 'HP',
    'hud.score': 'WYNIK',
    'hud.kills': 'ZABICI',
    'hud.gems': 'GEMY',

    // ============================================================
    // End screen — Przegrana / Zwyciestwo (v0.46.0 i18n)
    // ============================================================
    'end.defeat.title': 'PRZEGRANA',
    'end.defeat.subtitle': 'Twój czołg został zniszczony',
    'end.victory.title': 'ZWYCIĘSTWO!',
    'end.victory.subtitle': 'Mega Boss pokonany!',
    'end.kills': 'Pokonani',
    'end.gems': 'Gemy',
    'end.cubes': 'PowerCube’y',
    'end.combo': 'Combo',
    'end.hearts': 'Apteczki',
    'end.supers': 'Supermoce',
    'end.score': 'Punkty',
    'end.time': 'Czas',
    'end.bosses': 'Bossowie',
    'end.megaBoss': 'Mega Boss',
    'end.megaBossDefeated': 'POKONANY!',
    'end.dmgBonus': 'DMG',
    'end.hpBonus': 'HP',
    'end.backToMenu': 'POWRÓT DO MENU',
    // PROG-F1 — progresja na endcardzie
    'end.trophies': 'TROFEA',
    'end.bolts': 'SIGMY',
    'end.milestone': 'KAMIEŃ MILOWY',

    // ============================================================
    // HUD notifications (v0.51.0 — i18n migration z main.ts + HUD.ts)
    //
    // Konwencja: 'hud.<kategoria><Wariant>'. Parametry: {count}, {hp},
    // {sec}, {bonus}, {total}, {phase} — substytuowane przez t() runtime.
    //
    // Wszystkie stringi wczesniej hardcoded w main.ts (notify popups) i
    // HUD.ts (canvas-rendered labels/status pille/mega boss bar).
    // ============================================================

    // Powers (super moce — aktywacja)
    'hud.shieldActive':   '🛡️ TARCZA AKTYWNA!',
    'hud.megaBombHit':    '💣 MEGA BOMBA — {count} celów!',
    'hud.multiKill':      '💥 MULTI KILL ×{count}!',
    'hud.freezeAll':      '❄️ MRÓZ NA WSZYSTKICH WROGACH!',

    // Mute toggle
    'hud.muted':          '🔇 WYCISZONO',
    'hud.unmuted':        '🔊 DŹWIĘK WŁ.',

    // Stealth (kukurydza / trzcina / oaza + zerwanie stealth)
    'hud.stealthSugarcane': '🎋 UKRYTY W TRZCINIE (10s)!',
    'hud.stealthCorn':      '🌾 UKRYTY W KUKURYDZY (10s)!',
    'hud.stealthOasis':     '🌴 NIEWIDZIALNY (10s)!',
    'hud.stealthNeon': 'KRIO-KAMUFLAŻ! Mgła ukryła Twój czołg',
    'hud.stealthBush':      '🌿 UKRYTY W ZAROŚLACH (10s)!',
    'hud.stealthHydro':     '🌱 UKRYTY W HYDROPONICE (10s)!',

    // CTF (FAZA CTF F2)
    'ctf.flagPickup':     '🚩 FLAGA {name} POBRANA! WRACAJ DO BAZY!',
    'ctf.flagCaptured':   '✅ FLAGA {name} ZDOBYTA!',
    'ctf.bossRespawn':    '⚠️ BOSS RESPAWN!',
    'ctf.enemiesEnraged': '⚔️ WROGOWIE WŚCIEKLI!',
    'ctf.carryBanner':    '🚩 WRACAJ DO BAZY!',
    'end.flags':          'Flagi',
    'hud.stealthSpotted':   '👁️ ZOSTAŁEŚ ZAUWAŻONY!',
    'hud.shotRevealed':     '🔫 STRZAŁ ZDRADZIŁ POZYCJĘ!',

    // Karawana (Desert)
    'hud.caravanGem':     '🐪 Karawana dropiła 💎',
    'hud.caravanHeart':   '🐪 Karawana dropiła ❤️',
    'hud.caravanMagnet':  '🐪 Karawana dropiła 🧲',
    'hud.roverGem':       '🛰️ Łazik zgubił 💎',
    // SEASON KIT — podpis chipa licznika w HUD.
    'hud.books': 'Książki',
    // SEASON KIT — legendarna znajdzka (1 na dobe).
    'hud.seasonLegendary': '📙 ZŁOTA ENCYKLOPEDIA!',
    // SEASON KIT — pierwsze zdobycie danego typu znajdzki.
    'hud.seasonNewItem': 'NOWY W KOLEKCJI: {name}!',
    'hud.seasonNewShort': 'NOWY!',
    'hud.roverHeart':     '🛰️ Łazik zgubił ❤️',
    'hud.roverMagnet':    '🛰️ Łazik zgubił 🧲',
    // ARC-R2 — pingwiny (Lodowa Arena)
    'hud.penguinGem':     '🐧 Pingwin zgubił 💎',
    'hud.penguinHeart':   '🐧 Pingwin zgubił ❤️',
    'hud.penguinMagnet':  '🐧 Pingwin zgubił 🧲',
    'hud.yetiRoar':       '🦍 YETI JEST WŚCIEKŁY! Uciekaj!',
    'hud.blizzard':       '❄️ Śnieżyca!',
    'hud.dustStorm':      '🌪️ Burza pyłowa!',
    'hud.ufoAbduct':      '🛸 UFO porwało wroga!',
    'hud.ufoWarn':        '🛸 UFO OSTRZEGA! ({lvl}/{max})',
    'hud.ufoAngry':       '🛸 UFO ODDAJE OGIEŃ! Uciekaj!',
    'hud.ufoDown':        '🛸 ZESTRZELIŁEŚ UFO! 💎💎💎',

    // Pady — etykieta na padzie (FAZA MARS M4; starsze pady maja hardcoded PL)
    'pad.repairing':      'NAPRAWA',
    'ctf.flagLabel':      'FLAGA {team}',
    'portrait.title':     'Obróć telefon do poziomu',
    'portrait.subtitle':  'Brawl Tanks gra się najlepiej w trybie poziomym — szersze pole bitwy widać lepiej 🔄',

    // Pickupy (heal/turbo/super charge/magnet)
    'hud.mediPadHeal':    '🔧 +{hp} HP',
    'hud.heartHeal':      '❤️ +{hp} HP',
    'hud.turboBoost':     '⚡ TURBO ×2 — {sec}s!',
    'hud.superCharge':    '⚡ +{count} SUPER STRZAŁY! (×{total})',
    'hud.magnetActive':   '🧲 MAGNET {sec}s!',

    // Achievement (end-game)
    'hud.perfectRun':     '⭐ PERFECT RUN! +{bonus} pkt',

    // Combo (PL=EN — gaming convention, dzieciaki znaja terminy z innych gier)
    'hud.comboDouble':    'DOUBLE!',
    'hud.comboTriple':    'TRIPLE!',
    'hud.comboMega':      'MEGA KILL! 💥',

    // ── HUD.ts (canvas-rendered) ──

    // Pille i hinty
    'hud.superShot':           'SUPER SHOT',
    'hud.killProgressTaunt':   '💀 ZNISZCZ BOSSÓW!',
    'hud.powerHint':           '1/2/3 = moc   ·   scroll = wybierz   ·   SPACJA/PPM = użyj',

    // Active power status (bottom-center, gdy aura/mroz aktywne)
    'hud.auraActive':          '🛡️ TARCZA — {sec}s 🛡️',
    'hud.freezeActiveStatus':  '❄️ MRÓZ — {sec}s ❄️',

    // Status pille (prawa kolumna)
    'hud.magnetStatus':        '🧲 MAGNET {sec}s',
    'hud.turboStatus':         '⚡ TURBO ×2 {sec}s',

    // Mega boss (fazy + alert + label paska)
    'hud.megaBossPhaseRush':    'SZARŻA',
    'hud.megaBossPhaseStrafe':  'OKRĄŻA',
    'hud.megaBossPhaseEnraged': 'WŚCIEKŁY',
    'hud.megaBossLabel':        '👑 MEGA BOSS — {phase}',
    'hud.megaBossIncoming':     '⚠️ MEGA BOSS NADCHODZI!',

    // ============================================================
    // Map objects — world-space diegetic text (v0.52.x)
    //
    // Tekst rysowany jako PIXI.Text na obiektach mapy (nie HUD overlay).
    // SludgeReactor (cyberpunk): holo warning podczas HIT state.
    // ============================================================
    'reactor.pressureSpike': 'SKOK CIŚNIENIA',
    'reactor.ecoCrime': 'EKO-PRZESTĘPSTWO — POŚCIG POLICJI',
    'reactor.pursuitIncoming': 'WÓZ POŚCIGOWY NADJEŻDŻA!',
};