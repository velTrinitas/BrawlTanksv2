/**
 * English translations.
 *
 * Type-enforced: `en: typeof pl` — TypeScript wymusi te same klucze co pl.ts.
 * Jezeli dodasz nowy klucz w pl.ts a zapomnisz tutaj, compile error.
 */
import type { pl } from './pl';

export const en: typeof pl = {
    // ============================================================
    // App / Branding
    // ============================================================
    'app.title': 'Brawl Tanks',
    'app.tagline': 'Season 2',

    // ============================================================
    // Common UI elements
    // ============================================================
    'common.back': 'Back',
    'common.next': 'Next',
    'common.play': 'Play!',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.close': 'Close',
    'common.soon': 'COMING SOON',
    'common.locked': 'COMING SOON',
    'common.loading': 'Loading...',
    'common.yes': 'Yes',
    'common.no': 'No',

    // ============================================================
    // Intro Screen
    // ============================================================
    'intro.start': 'START',
    'intro.tap_to_play': 'Tap to play',

    // ============================================================
    // Main Hub
    // ============================================================
    'hub.play': 'PLAY',
    'hub.playSubNew': 'New game',
    'hub.playSubFirst': 'Start your adventure',
    'hub.howToPlay': 'GUIDE',
    'hub.settings': 'SETTINGS',
    'hub.leaderboard': 'LEADERBOARD',
    'hub.shop': 'SHOP',
    'hub.continue': 'Continue as {nickname} on {map}',
    'hub.continueShort': 'Continue',
    'hub.changePlayer': 'Change player',
    'hub.welcome': 'Welcome, {name}!',
    'hub.editProfile': 'Edit profile',

    // ============================================================
    // Scenario Picker
    // ============================================================
    'picker.scenarioTitle': 'Choose scenario',
    'picker.mapTitle': 'Choose location',
    'picker.brawlerTitle': 'Choose vehicle',
    'picker.difficultyTitle': 'DIFFICULTY',
    'picker.step': 'Step {current} of {total}',

    'scenario.ktb.name': 'Kill the Boss',
    'scenario.ktb.desc': 'Destroy the Mega Boss',
    'scenario.ktb.cta.desert': 'PLAY !',
    'scenario.ktb.cta.city': 'PLAY !',
    'scenario.ktb.cta.tropics': 'PLAY !',

    'scenario.ctf.name': 'Capture the Flag',
    'scenario.ctf.desc': 'Capture 3 flags',
    'scenario.ctf.cta': 'PLAY !',
    'scenario.ctf.mapBadge': 'Map: Fortified Ruins',

    'scenario.castle.name': 'Defend the Castle',
    'scenario.castle.desc': 'Defend through 6 waves',
    'scenario.castle.cta': 'PLAY !',
    'scenario.castle.mapBadge': 'Map: Castle Grounds',

    'scenario.save_king.name': 'Save the King',
    'scenario.save_king.desc': 'Coming soon!',
    'scenario.save_king.cta': 'PLAY !',

    // ============================================================
    // Maps
    // ============================================================
    'map.desert.name': 'DESERT',
    'map.desert.tagline': 'Egyptian wasteland',

    'map.city.name': 'CYBERPUNK',
    'map.city.tagline': 'Neon megacity',

    'map.tropics.name': 'TROPICS',
    'map.tropics.tagline': 'Caribbean Farmstead',

    'map.arctic.name': 'ARCTIC',
    'map.arctic.tagline': 'Frozen wasteland',

    // ============================================================
    // Difficulty
    // ============================================================
    'difficulty.easy.label': 'EASY',
    'difficulty.easy.desc': 'Fewer enemies, weaker boss',

    'difficulty.normal.label': 'NORMAL',
    'difficulty.normal.desc': 'Standard challenge',

    'difficulty.hard.label': 'HARD',
    'difficulty.hard.desc': 'More enemies, stronger boss',

    'difficulty.nightmare.label': 'NIGHTMARE',
    'difficulty.nightmare.desc': 'For experts only!',

    // ============================================================
    // Brawler display names
    // ============================================================
    'brawler.twardy.name': 'HARDY',
    'brawler.heavy.name': 'HEAVY',
    'brawler.scout.name': 'SCOUT',
    'brawler.sniper.name': 'SNIPER',
    'brawler.plasma.name': 'TECH',
    'brawler.pyro.name': 'BURNER',
    'brawler.shadow.name': 'SHADOW',
    'brawler.king.name': 'KING',

    // ============================================================
    // Settings
    // ============================================================
    'settings.title': 'Settings',
    'settings.audio': 'Audio',
    'settings.music': 'Music',
    'settings.sfx': 'Sound effects',
    'settings.profile': 'Profile',
    'settings.editProfile': 'Edit profile',
    'settings.controls': 'Controls',
    'settings.language': 'Language',
    'settings.language.pl': 'Polski',
    'settings.language.en': 'English',
    'settings.graphics': 'Graphics',
    'settings.comingSoon': 'Coming soon',

    // ============================================================
    // Errors
    // ============================================================
    'error.missingFields': 'Missing required fields',
    'error.invalidConfig': 'Invalid game configuration',
    'error.audioLoad': 'Failed to load audio',

    // ============================================================
    // Notifications / HUD
    // ============================================================
    'notif.superCharge': '+{count} SUPER SHOTS!',
    'notif.megaBoss': 'WARNING: MEGA BOSS!',
    'notif.victory': 'VICTORY!',
    'notif.gameOver': 'GAME OVER',
    'notif.aura': 'SHIELD ACTIVATED!',
    'notif.megaBomb': 'MEGA BOMB — {count} targets!',
    'notif.freeze': 'FREEZE — {count} enemies!',
    'notif.magnet': 'MAGNET 5s!',

    // ============================================================
    // Profile / Onboarding (FAZA 7b)
    // ============================================================
    'profile.onboarding.welcomeTitle': 'Welcome, Commander!',
    'profile.onboarding.welcomeSubtitle': 'Create your profile before joining the battle',
    'profile.onboarding.pickAvatarLabel': 'Choose your avatar',
    'profile.onboarding.pickFlagLabel': 'Your flag',
    'profile.onboarding.startButton': 'BEGIN',

    'profile.onboarding.nicknameLabel': 'Your nickname',
    'profile.onboarding.nicknamePlaceholder': 'e.g. Mariusz123',
    'profile.onboarding.nicknameHint': '2-16 characters: letters and digits',
    'profile.onboarding.nicknameError': 'Nickname must be 2-16 letters or digits',

    // ============================================================
    // Profile / Edit (v0.43.0 FAZA 8b)
    // ============================================================
    'profile.edit.title': 'Edit profile',
    'profile.edit.subtitle': 'Change your appearance and nickname',
    'profile.edit.saveButton': 'SAVE CHANGES',
    'profile.edit.savedToast': 'Profile updated ✓',
    'profile.edit.nicknameUnchanged': 'Nickname unchanged',
    'profile.edit.nicknameTaken': 'Nickname taken — choose another',
    'profile.edit.noProfileTitle': 'No active profile',
    'profile.edit.noProfileSubtitle': 'Return to menu and create a profile',

    'profile.avatar.komandor.name': 'Commander',
    'profile.avatar.komandor.desc': 'Experienced tactician',
    'profile.avatar.pilotka.name': 'Pilot',
    'profile.avatar.pilotka.desc': 'Brave scout',
    'profile.avatar.smyk.name': 'Kid',
    'profile.avatar.smyk.desc': 'Energetic rookie',
    'profile.avatar.inzynier.name': 'Engineer',
    'profile.avatar.inzynier.desc': 'Calm strategist',

    'profile.flag.pl': 'Poland',
    'profile.flag.fr': 'France',
    'profile.flag.it': 'Italy',
    'profile.flag.de': 'Germany',

    // ──────────────────────────────────────────────────────────
    // HUD
    // ──────────────────────────────────────────────────────────
    'hud.hp': 'HP',
    'hud.score': 'SCORE',
    'hud.kills': 'KILLS',
    'hud.gems': 'GEMS',
};