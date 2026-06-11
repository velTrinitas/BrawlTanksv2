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
    'common.confirm': 'Potwierdz',
    'common.close': 'Zamknij',
    'common.soon': 'NADCHODZI',
    'common.locked': 'W BUDOWIE',
    'common.loading': 'Ladowanie...',
    'common.yes': 'Tak',
    'common.no': 'Nie',

    // ============================================================
    // Intro Screen
    // ============================================================
    'intro.start': 'START',
    'intro.tap_to_play': 'Stuknij aby zagrac',

    // ============================================================
    // Main Hub
    // ============================================================
    'hub.play': 'GRAJ',
    'hub.playSubNew': 'Nowa rozgrywka',
    'hub.playSubFirst': 'Rozpocznij przygode',
    'hub.howToPlay': 'PRZEWODNIK',
    'hub.settings': 'USTAWIENIA',
    'hub.leaderboard': 'LEADERBOARD',
    'hub.shop': 'SKLEP',
    'hub.continue': 'Kontynuuj jako {nickname} na mapie {map}',
    'hub.continueShort': 'Kontynuuj',
    'hub.changePlayer': 'Zmien gracza',
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

    'scenario.ctf.name': 'Capture the Flag',
    'scenario.ctf.desc': 'Zdobadz 3 flagi',
    'scenario.ctf.cta': 'GRAJ !',
    'scenario.ctf.mapBadge': 'Mapa: Fortified Ruins',

    'scenario.castle.name': 'Defend the Castle',
    'scenario.castle.desc': 'Bron zamku przez 6 fal',
    'scenario.castle.cta': 'GRAJ !',
    'scenario.castle.mapBadge': 'Mapa: Castle Grounds',

    'scenario.save_king.name': 'Save the King',
    'scenario.save_king.desc': 'Wkrotce dostepne!',
    'scenario.save_king.cta': 'GRAJ !',

    // ============================================================
    // Maps — display names + taglines
    // ============================================================
    'map.desert.name': 'PUSTYNIA',
    'map.desert.tagline': 'Egipska pustynia',

    'map.city.name': 'CYBERPUNK',
    'map.city.tagline': 'Neonowe miasto',

    'map.tropics.name': 'TROPIKI',
    'map.tropics.tagline': 'Dzungla i wodospady',

    'map.arctic.name': 'ARKTYKA',
    'map.arctic.tagline': 'Lodowa pustynia',

    // ============================================================
    // Difficulty levels
    // ============================================================
    'difficulty.easy.label': 'EASY',
    'difficulty.easy.desc': 'Mniej wrogow, slabszy boss',

    'difficulty.normal.label': 'NORMAL',
    'difficulty.normal.desc': 'Standardowe wyzwanie',

    'difficulty.hard.label': 'HARD',
    'difficulty.hard.desc': 'Wiecej wrogow, mocniejszy boss',

    'difficulty.nightmare.label': 'NIGHTMARE',
    'difficulty.nightmare.desc': 'Tylko dla najlepszych!',

    // ============================================================
    // Settings (stub — FAZA 8 wypelni)
    // ============================================================
    'settings.title': 'Ustawienia',
    'settings.audio': 'Dzwiek',
    'settings.music': 'Muzyka',
    'settings.sfx': 'Efekty dzwiekowe',
    'settings.controls': 'Sterowanie',
    'settings.language': 'Jezyk',
    'settings.language.pl': 'Polski',
    'settings.language.en': 'English',
    'settings.graphics': 'Grafika',
    'settings.comingSoon': 'Wkrotce dostepne',

    // ============================================================
    // Errors / Validation
    // ============================================================
    'error.missingFields': 'Brakuje wymaganych pol',
    'error.invalidConfig': 'Nieprawidlowa konfiguracja gry',
    'error.audioLoad': 'Nie udalo sie zaladowac dzwieku',

    // ============================================================
    // Notifications / In-game HUD (rozbudowywane w FAZIE 6b+)
    // ============================================================
    'notif.superCharge': '+{count} SUPER STRZALY!',
    'notif.megaBoss': 'UWAGA: MEGA BOSS!',
    'notif.victory': 'ZWYCIESTWO!',
    'notif.gameOver': 'PRZEGRANA',
    'notif.aura': 'TARCZA AKTYWNA!',
    'notif.megaBomb': 'MEGA BOMBA — {count} celow!',
    'notif.freeze': 'FREEZE — {count} wrogow!',
    'notif.magnet': 'MAGNET 5s!',

    // ============================================================
    // Profile / Onboarding (FAZA 7b)
    // ============================================================
    // Onboarding screen (IdentityScreen)
    'profile.onboarding.welcomeTitle': 'Witaj, dowodco!',
    'profile.onboarding.welcomeSubtitle': 'Stworz swoj profil zanim ruszysz do walki',
    'profile.onboarding.pickAvatarLabel': 'Wybierz awatara',
    'profile.onboarding.pickFlagLabel': 'Twoja flaga',
    'profile.onboarding.startButton': 'ROZPOCZNIJ',

    'profile.onboarding.nicknameLabel': 'Twoj pseudonim',
    'profile.onboarding.nicknamePlaceholder': 'np. Mariusz123',
    'profile.onboarding.nicknameHint': '2-16 znakow: litery i cyfry',
    'profile.onboarding.nicknameError': 'Pseudonim musi miec 2-16 liter lub cyfr',

    // Avatar names (zachowane PL — jak character names) + descriptions
    'profile.avatar.komandor.name': 'Komandor',
    'profile.avatar.komandor.desc': 'Doswiadczony taktyk',
    'profile.avatar.pilotka.name': 'Pilotka',
    'profile.avatar.pilotka.desc': 'Odwazna zwiadowczyni',
    'profile.avatar.smyk.name': 'Smyk',
    'profile.avatar.smyk.desc': 'Energiczny rookie',
    'profile.avatar.inzynier.name': 'Inzynier',
    'profile.avatar.inzynier.desc': 'Spokojny strateg',

    // Flag names
    'profile.flag.pl': 'Polska',
    'profile.flag.fr': 'Francja',
    'profile.flag.it': 'Wlochy',
    'profile.flag.de': 'Niemcy',
};