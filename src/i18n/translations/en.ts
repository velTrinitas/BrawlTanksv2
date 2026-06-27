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
    'scenario.ktb.cta.arctic': 'PLAY !',

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
    // @deprecated v0.51.0 — moved to hud.* namespace (bottom of file).
    // Kept here as no-op for safety until full repo grep sweep removes them.
    // DO NOT use in new code.
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
    'profile.onboarding.nicknameTaken': 'Nickname taken — choose another',

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

    // ============================================================
    // Pickups / In-game events (v0.44.0 FAZA 8.6 — PowerCube)
    // ============================================================
    'pickup.dmgUp': '+DMG! ⚔',
    'pickup.hpUp': '+HP! 💙',
    'pickup.cubeStolen': 'Cube stolen! 👀',

    // ──────────────────────────────────────────────────────────
    // HUD — labels (on pills)
    // ──────────────────────────────────────────────────────────
    'hud.hp': 'HP',
    'hud.score': 'SCORE',
    'hud.kills': 'KILLS',
    'hud.gems': 'GEMS',

    // ============================================================
    // End screen — Defeat / Victory (v0.46.0 i18n)
    // ============================================================
    'end.defeat.title': 'DEFEAT',
    'end.defeat.subtitle': 'Your tank was destroyed',
    'end.victory.title': 'VICTORY!',
    'end.victory.subtitle': 'Mega Boss defeated!',
    'end.kills': 'Kills',
    'end.gems': 'Gems',
    'end.cubes': 'PowerCubes',
    'end.combo': 'Combo',
    'end.hearts': 'Medkits',
    'end.supers': 'Powers',
    'end.score': 'Score',
    'end.time': 'Time',
    'end.bosses': 'Bosses',
    'end.megaBoss': 'Mega Boss',
    'end.megaBossDefeated': 'DEFEATED!',
    'end.dmgBonus': 'DMG',
    'end.hpBonus': 'HP',
    'end.backToMenu': 'BACK TO MENU',

    // ============================================================
    // HUD notifications (v0.51.0 — i18n migration from main.ts + HUD.ts)
    // See pl.ts for full rationale and parameter naming convention.
    // ============================================================

    // Powers (super activation)
    'hud.shieldActive':   '🛡️ SHIELD ACTIVATED!',
    'hud.megaBombHit':    '💣 MEGA BOMB — {count} targets!',
    'hud.multiKill':      '💥 MULTI KILL ×{count}!',
    'hud.freezeAll':      '❄️ FREEZE ALL ENEMIES!',

    // Mute toggle
    'hud.muted':          '🔇 MUTED',
    'hud.unmuted':        '🔊 SOUND ON',

    // Stealth (sugarcane / corn / oasis + reveal)
    'hud.stealthSugarcane': '🎋 HIDDEN IN SUGARCANE (10s)!',
    'hud.stealthCorn':      '🌾 HIDDEN IN CORN (10s)!',
    'hud.stealthOasis':     '🌴 INVISIBLE (10s)!',
    'hud.stealthNeon': 'CRYO-CLOAK! Fog hides your tank',
    'hud.stealthSpotted':   '👁️ YOU HAVE BEEN SPOTTED!',
    'hud.shotRevealed':     '🔫 SHOT REVEALED YOUR POSITION!',

    // Caravan (Desert)
    'hud.caravanGem':     '🐪 Caravan dropped 💎',
    'hud.caravanHeart':   '🐪 Caravan dropped ❤️',
    'hud.caravanMagnet':  '🐪 Caravan dropped 🧲',

    // Pickups (heal/turbo/super charge/magnet)
    'hud.mediPadHeal':    '🔧 +{hp} HP',
    'hud.heartHeal':      '❤️ +{hp} HP',
    'hud.turboBoost':     '⚡ TURBO ×2 — {sec}s!',
    'hud.superCharge':    '⚡ +{count} SUPER SHOTS! (×{total})',
    'hud.magnetActive':   '🧲 MAGNET {sec}s!',

    // Achievement (end-game)
    'hud.perfectRun':     '⭐ PERFECT RUN! +{bonus} pts',

    // Combo (PL=EN — gaming convention)
    'hud.comboDouble':    'DOUBLE!',
    'hud.comboTriple':    'TRIPLE!',
    'hud.comboMega':      'MEGA KILL! 💥',

    // ── HUD.ts (canvas-rendered) ──

    // Pills and hints
    'hud.superShot':           'SUPER SHOT',
    'hud.killProgressTaunt':   '💀 DESTROY BOSSES!',
    'hud.powerHint':           'scroll = select   ·   RMB/SPACE = use',

    // Active power status (bottom-center, when aura/freeze active)
    'hud.auraActive':          '🛡️ SHIELD — {sec}s 🛡️',
    'hud.freezeActiveStatus':  '❄️ FREEZE — {sec}s ❄️',

    // Status pills (right column)
    'hud.magnetStatus':        '🧲 MAGNET {sec}s',
    'hud.turboStatus':         '⚡ TURBO ×2 {sec}s',

    // Mega boss (phases + alert + bar label)
    'hud.megaBossPhaseRush':    'CHARGE',
    'hud.megaBossPhaseStrafe':  'STRAFING',
    'hud.megaBossPhaseEnraged': 'ENRAGED',
    'hud.megaBossLabel':        '👑 MEGA BOSS — {phase}',
    'hud.megaBossIncoming':     '⚠️ MEGA BOSS INCOMING!',

    // ============================================================
    // Map objects — world-space diegetic text (v0.52.x)
    // SludgeReactor (cyberpunk): holo warning during HIT state.
    // ============================================================
    'reactor.pressureSpike': 'PRESSURE SPIKE',
    'reactor.ecoCrime': 'ECO CRIME — POLICE CHASE',
    'reactor.pursuitIncoming': 'PURSUIT VEHICLE INCOMING!',
};