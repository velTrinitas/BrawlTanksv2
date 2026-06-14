/**
 * Polskie tlumaczenia — BEZ ZNAKOW DIAKRYTYCZNYCH.
 *
 * Reguly:
 * - Nigdy a/c/e/l/n/o/s/z/z (ani uppercase).
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
    'hub.editProfile': 'Edytuj w Ustawieniach',

    // ============================================================
    // Scenario Picker (Ekran 1)
    // ============================================================
    'picker.scenarioTitle': 'Wybierz scenariusz',
    'picker.mapTitle': 'Wybierz otoczenie',
    'picker.brawlerTitle': 'Wybierz pojazd',
    'picker.difficultyTitle': 'POZIOM TRUDU',
    'picker.step': 'Krok {current} z {total}',

    // Scenarios — name, description, CTA
    'scenario.ktb.name': 'Kill the Boss',
    'scenario.ktb.desc': 'Zniszcz Mega Bossa',
    'scenario.ktb.cta.desert': 'GRAJ !',
    'scenario.ktb.cta.city': 'GRAJ !',
    'scenario.ktb.cta.tropics': 'GRAJ !',

    'scenario.ctf.name': 'Capture the Flag',
    'scenario.ctf.desc': 'Zdobądź 3 flagi',
    'scenario.ctf.cta': 'GRAJ !',
    'scenario.ctf.mapBadge': 'Mapa: Fortified Ruins',

    'scenario.castle.name': 'Defend the Castle',
    'scenario.castle.desc': 'Broń zamku przez 6 fal',
    'scenario.castle.cta': 'GRAJ !',
    'scenario.castle.mapBadge': 'Mapa: Castle Grounds',

    'scenario.save_king.name': 'Save the King',
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

    // ============================================================
    // Difficulty levels (v0.24.0: PL labels translated, dorzucone KOSZMAR)
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
    // Brawler display names (v0.24.0: i18n per brawler id)
    // ============================================================
    'brawler.twardy.name': 'TWARDY',
    'brawler.heavy.name': 'PANCERNY',
    'brawler.scout.name': 'ZWIAD',
    'brawler.sniper.name': 'SNAJPER',
    'brawler.plasma.name': 'TECH',
    'brawler.pyro.name': 'OGNIARZ',
    'brawler.shadow.name': 'SHADOW',
    'brawler.king.name': 'KING',

    // ============================================================
    // Settings (stub — FAZA 8 wypelni)
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
    'settings.comingSoon': 'Wkrótce dostepne',

    // ============================================================
    // Errors / Validation
    // ============================================================
    'error.missingFields': 'Brakuje wymaganych pól',
    'error.invalidConfig': 'Nieprawidłowa konfiguracja gry',
    'error.audioLoad': 'Nie udało się załadować dźwięku',

    // ============================================================
    // Notifications / In-game HUD (rozbudowywane w FAZIE 6b+)
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

    'profile.avatar.komandor.name': 'Komandor',
    'profile.avatar.komandor.desc': 'Doświadczony taktyk',
    'profile.avatar.pilotka.name': 'Pilotka',
    'profile.avatar.pilotka.desc': 'Odważna zwiadowczyni',
    'profile.avatar.smyk.name': 'Smyk',
    'profile.avatar.smyk.desc': 'Energiczny rookie',
    'profile.avatar.inzynier.name': 'Inżynier',
    'profile.avatar.inzynier.desc': 'Spokojny strateg',

    'profile.flag.pl': 'Polska',
    'profile.flag.fr': 'Francja',
    'profile.flag.it': 'Wlochy',
    'profile.flag.de': 'Niemcy',

    // ──────────────────────────────────────────────────────────
    // HUD (v0.27.0 FAZA F-fix3 + Wariant A renaming)
    // hud.score = WYNIK (centralny pill, sumuje punkty za zabicia)
    // hud.kills = ZABICI (prawy pill z 💀, liczba zabitych wrogow)
    // hud.gems = GEMY (lewy pill, zebrane gemy → super charges)
    // ──────────────────────────────────────────────────────────
    'hud.hp': 'HP',
    'hud.score': 'WYNIK',
    'hud.kills': 'ZABICI',
    'hud.gems': 'GEMY',
};