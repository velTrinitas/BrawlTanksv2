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
    'brawler.shadow.name': 'SHADOW',
    'brawler.king.name': 'KING',

    // ============================================================
    // Settings (v0.42.0 FAZA 8a finalize + v0.43.0 FAZA 8b: profile section)
    // ============================================================
    'settings.title': 'Ustawienia',
    'settings.audio': 'Dźwięk',
    'settings.music': 'Muzyka',
    'settings.sfx': 'Efekty dźwiękowe',
    'settings.profile': 'Profil',
    'settings.editProfile': 'Edytuj profil',
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
    'profile.flag.it': 'Włochy',
    'profile.flag.de': 'Niemcy',

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
    'hud.stealthSpotted':   '👁️ ZOSTAŁEŚ ZAUWAŻONY!',
    'hud.shotRevealed':     '🔫 STRZAŁ ZDRADZIŁ POZYCJĘ!',

    // Karawana (Desert)
    'hud.caravanGem':     '🐪 Karawana dropiła 💎',
    'hud.caravanHeart':   '🐪 Karawana dropiła ❤️',
    'hud.caravanMagnet':  '🐪 Karawana dropiła 🧲',

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
    'hud.powerHint':           'scroll = wybierz   ·   PPM/SPACE = użyj',

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
};