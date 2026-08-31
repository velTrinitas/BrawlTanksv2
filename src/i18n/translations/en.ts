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
    // Tutorial / onboarding (FAZA A)
    // ============================================================
    'tutorial.badge': 'TUTORIAL · Step {step}',
    'tutorial.progress': 'Step {step}/{total}',
    'tutorial.infoBadge': 'GOOD TO KNOW',
    'tutorial.finishBadge': 'FINISH',
    'tutorial.next': 'NEXT',
    // Just-in-time item/zone hints (in-match bubbles, ItemHints)
    'hint.heart': '❤️ Heals your tank — grab it!',
    'hint.magnet': '🧲 Pulls gems to you!',
    'hint.cube': '📦 Powers up your tank! Grab it first',
    'hint.mediPad': '🏥 Stand here = heals your tank',
    'hint.powerPad': '⚡ Drive on = TURBO x2!',
    // FAZA C — mode goal card (in-game on first entry + "How to play" screen)
    'goal.title': 'YOUR GOAL',
    'goal.play': 'PLAY',
    'goal.ktb': 'Survive the waves and defeat the Mega Boss!',
    'goal.ctf': 'Grab the enemy flag and bring it to your base!',
    // "How to play" menu screen (cheat-sheet: controls + items + goals)
    'howto.title': 'HOW TO PLAY',
    'howto.controls': 'CONTROLS',
    'howto.items': 'ITEMS & ZONES',
    'howto.goals': 'MODE GOALS',
    'howto.replay': 'REPLAY TUTORIAL',
    'howto.move': 'Move',
    'howto.moveVal': 'Left joystick / WASD',
    'howto.shoot': 'Shoot',
    'howto.shootVal': 'Right joystick / LMB',
    'howto.super': 'Super shot',
    'howto.superVal': 'Charge it with gems',
    'howto.power': 'Super power',
    'howto.powerVal': 'Keys 1/2/3 · scroll = select · SPACE/RMB = use',
    'howto.heart': '❤️ Heart — heals your tank',
    'howto.magnet': '🧲 Magnet — pulls gems in',
    'howto.cube': '📦 Cube — ⚔ stronger shot / 💙 more HP',
    'howto.medipad': '❤️‍🩹 Medi pad — heals while you stand on it',
    'howto.powerpad': '⚡ Power pad — TURBO x2',
    // Leaderboard (public ranking)
    'leaderboard.title': 'LEADERBOARD',
    'leaderboard.tab.ktb': 'Kill the Boss',
    'leaderboard.tab.ctf': 'Flag',
    'leaderboard.tab.castle': 'Castle',
    'leaderboard.window.all': 'All time',
    'leaderboard.window.week': 'Week',
    'leaderboard.window.day': 'Today',
    'leaderboard.map.all': 'All',
    'leaderboard.map.city': 'City',
    'leaderboard.map.desert': 'Desert',
    'leaderboard.map.tropics': 'Tropics',
    'leaderboard.map.arctic': 'Arctic',
    'leaderboard.map.mars': 'Mars',
    'leaderboard.you': 'YOU',
    'leaderboard.noRank': 'Play a match to get ranked!',
    'leaderboard.empty': 'No scores yet — be the first!',
    'leaderboard.error': 'Could not load the leaderboard. Try again.',
    'leaderboard.loading': 'Loading…',
    'leaderboard.refresh': 'Refresh',
    'leaderboard.retry': 'Try again',
    'leaderboard.rankup': 'up!',
    'tutorial.heart.title': 'HEART',
    'tutorial.heart.hint': 'Grab it — heals your tank',
    'tutorial.magnet.title': 'MAGNET',
    'tutorial.magnet.hint': 'Pulls all gems toward you',
    'tutorial.medipad.title': 'MEDI PAD',
    'tutorial.medipad.hint': 'Stand on it — heals your tank',
    'tutorial.powerpad.title': 'POWER PAD',
    'tutorial.powerpad.hint': 'Drive onto it — TURBO, x2 speed!',
    'tutorial.move.title': 'MOVE!',
    'tutorial.move.hintTouch': 'Drag the left stick to drive',
    'tutorial.move.hintDesktop': 'Use WASD to drive',
    'tutorial.shoot.title': 'SHOOT!',
    'tutorial.shoot.hintTouch': 'Hold the right stick to shoot',
    'tutorial.shoot.hintDesktop': 'Hold the left mouse button to shoot',
    'tutorial.wave.title': 'WAVE!',
    'tutorial.wave.hintTouch': 'Wipe out the whole group!',
    'tutorial.wave.hintDesktop': 'Wipe out the whole group!',
    'tutorial.gems.title': 'GEMS!',
    'tutorial.gems.hintTouch': 'Collect gems — they charge the SUPER bar!',
    'tutorial.gems.hintDesktop': 'Collect gems — they charge the SUPER bar!',
    'tutorial.super.title': 'SUPER SHOT!',
    'tutorial.super.hintTouch': "You've got a super shot! Fire and wipe the enemy",
    'tutorial.super.hintDesktop': "You've got a super shot! Fire and wipe the enemy",
    'tutorial.power.title': 'SUPER POWER!',
    'tutorial.power.hintTouch': 'Tap a power button!',
    'tutorial.power.hintDesktop': 'Press 1, 2 or 3 (or SPACE) to use a power!',
    'tutorial.finish.title': 'READY!',
    'tutorial.finish.hint': 'Great! You know the basics. What now?',
    'tutorial.finish.play': 'KEEP PLAYING',
    'tutorial.finish.menu': 'MENU',
    'tutorial.skip': 'SKIP TUTORIAL',
    'tutorial.done': '✓ NICE!',

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
    // PROG-F1 — trophy bar in hub
    'hub.trophyLabel': 'TROPHIES',
    'hub.trophyNext': '{n} 🏆 to next reward',
    'hub.trophyMax': 'All rewards unlocked! 🏆',
    // HUB-0 — Menu Hub navigation (rail/dock)
    'hub.nav.battle': 'BATTLE',
    'hub.nav.garage': 'GARAGE',
    'hub.nav.quests': 'ORDERS',
    'hub.nav.trophies': 'TROPHIES',
    'hub.nav.rank': 'RANKING',
    'hub.nav.season': 'SEASON',
    // HUB-1 — season banner (static; real countdown in a later phase)
    'hub.season.eyebrow': 'Active season',
    // SEASON-1/2 — Season Track + season popup
    'hub.season.daysLeft': '{n} days left',
    'hub.season.ended': 'Season ended',
    'hub.season.whatsNew': 'What this season brings',
    'hub.season.viewTrack': 'VIEW SEASON TRACK',
    // Season roadmap (SEASON-2) — names + popup bullets
    'season.s2.name': 'Season 2 — Arena',
    'season.s2.short': 'Season 2',
    'season.s2.b1': 'New Season Track: 5 rewards for seasonal trophies',
    'season.s2.b2': 'Tanker ranks and the new profile page',
    'season.s2.b3': 'Finale Aug 31 — grab rewards before they vanish!',
    'season.s3.name': 'Season 3 — Back to School',
    'season.s3.short': 'Season 3',
    'season.s3.b1': 'Fresh Season Track: sigma and crates to earn',
    'season.s3.b2': 'School vibes: chalk, backpacks and trophy homework',
    'season.s3.b3': 'More surprises coming soon!',
    // SEASON KIT: name of the season collectible counter (HUD, end-of-run screen).    // SEASON 2 — collectibles (art and names shared with S3)
    'season.s2.counter': 'books',
    'season.s2.item1': 'Pencil',
    'season.s2.item2': 'Book',
    'season.s2.item3': 'Notebook',
    'season.s2.item4': 'Set square',
    'season.s2.item5': 'Backpack',
    'season.s2.item6': 'Globe',

    'season.s3.counter': 'books',
    // SEASON KIT — names of the 6 season-3 collectibles.
    'season.s3.item1': 'Pencil',
    'season.s3.item2': 'Book',
    'season.s3.item3': 'Notebook',
    'season.s3.item4': 'Set square',
    'season.s3.item5': 'Backpack',
    'season.s3.item6': 'Globe',
    // SEASON KIT — "all thresholds reached" state in the popup bar.
    'season.allRewards': 'all rewards earned!',
    'season.s4.name': 'Season 4 — Snow Ops',
    'season.s4.short': 'Season 4',
    'season.s4.b1': 'Fresh Season Track: sigma and crates to earn',
    'season.s4.b2': 'Winter vibes: snow, gifts and Santa on tracks',
    'season.s4.b3': 'More surprises coming soon!',
    'season.s5.name': 'Season 5 — Frost Blitz',
    'season.s5.short': 'Season 5',
    'season.s5.b1': 'Fresh Season Track: sigma and crates to earn',
    'season.s5.b2': 'New Year vibes: fireworks and an icy battlefield',
    'season.s5.b3': 'More surprises coming soon!',
    'season.s6.name': 'Season 6 — Mud Season',
    'season.s6.short': 'Season 6',
    'season.s6.b1': 'Fresh Season Track: sigma and crates to earn',
    'season.s6.b2': 'Spring vibes: thaw, mud and surprise eggs',
    'season.s6.b3': 'More surprises coming soon!',
    'season.s7.name': 'Season 7 — Tank BBQ',
    'season.s7.short': 'Season 7',
    'season.s7.b1': 'Fresh Season Track: sigma and crates to earn',
    'season.s7.b2': 'Picnic vibes: grill, sausage-rocket and sunshine',
    'season.s7.b3': 'More surprises coming soon!',
    'season.s8.name': 'Season 8 — Tropic Vacation',
    'season.s8.short': 'Season 8',
    'season.s8.b1': 'Fresh Season Track: sigma and crates to earn',
    'season.s8.b2': 'Beach vibes: coconuts, deck chairs and rubber ducks',
    'season.s8.b3': 'More surprises coming soon!',
    // HUB-4 — Trophy Road
    'hub.road.act1': 'Act I — Recruit',
    'hub.road.act2': 'Act II — Veteran',
    'hub.road.next': 'Next',
    'hub.road.seasonTitle': 'Season Track',
    // HUB-6 — Ranking (mini-board)
    'hub.rank.full': 'Full ranking',
    'hub.rank.you': 'YOU',
    'hub.rank.empty': 'No scores yet — play a match!',
    'hub.rank.error': 'Failed to load ranking',
    // HUB-5 — Stats
    'hub.stats.title': 'Stats',
    'hub.stats.bolts': 'Sigma',
    'hub.stats.milestones': 'Milestones',
    'hub.stats.games': 'Games played',
    'hub.stats.since': 'Playing since',
    'hub.stats.best': 'Best score',
    // PROFILE-1 — profile page (readout chip)
    'hub.profile.title': 'PROFILE',
    'hub.profile.edit': 'EDIT',
    'hub.profile.tab.overview': 'Overview',
    'hub.profile.tab.records': 'Records',
    'hub.profile.tab.collection': 'Collection',
    // SEASON KIT — SEASON tab in the profile.
    'season.findThemAll': 'Find them all!',
    'hub.profile.season.pointTrack': 'For points',
    'hub.profile.season.setTrack': 'For sets',
    'hub.profile.season.gateCrate': 'Three commons',
    'hub.profile.season.gateTitle': 'Five items',
    'hub.profile.season.gateFull': 'Full collection',
    'hub.profile.season.museumSoon': 'Finished seasons will be kept here in the collection museum.',
    'hub.profile.rank': 'Leaderboard rank',
    'hub.profile.kills': 'Enemies defeated',
    'hub.profile.gems': 'Gems collected',
    'hub.profile.time': 'Time played',
    'hub.profile.accuracy': 'Overall accuracy',
    'hub.profile.rec.kills': 'Most kills in a run',
    'hub.profile.rec.gems': 'Most gems in a run',
    'hub.profile.rec.time': 'Longest run',
    'hub.profile.rec.accuracy': 'Best accuracy',
    'hub.profile.rec.combo': 'Highest combo',
    'hub.profile.accHint': 'Accuracy counts from {n} shots in a match',
    'hub.profile.recHint': 'Combo record counts from now on',
    // RANKS-1 — TANKER RANK (per player) + rank-up celebration
    'hub.profile.rankTitle': 'Tanker Rank',
    'hub.profile.rankHint': 'Win matches to rank up!',
    'hub.profile.rankMax': 'Highest rank achieved!',
    'rankup.title': 'RANK UP!',
    'rankup.reward': 'Reward',
    'rankup.cta': 'AWESOME!',
    'hub.garage.cosmeticsMoved': 'Set your style in your profile — tap your avatar!',
    'hub.garage.cratesFrom': 'You earn them from orders, trophies and the season — or buy them in the shop.',
    // F2a — Crates + cosmetics
    'hub.garage.crates': 'Crates: {n}',
    'hub.garage.pity': 'To guaranteed rare: {n}',
    'hub.garage.open': 'OPEN',
    'hub.garage.cosmetics': 'Style {owned}/{total}',
    'hub.garage.type.nickColor': 'Nick colors',
    'hub.garage.type.frame': 'Avatar frames',
    'hub.garage.type.title': 'Titles',
    'hub.garage.type.horn': 'Horns 🖥️ (key H)',
    'hub.garage.type.voice': 'Commander voice',
    'hub.garage.type.sticker': 'Stickers',
    'hub.garage.type.crosshair': 'Crosshairs 🎯 (seen in game)',
    'crate.rarity.c': 'Common',
    'crate.rarity.r': 'Rare',
    'crate.rarity.e': 'Epic',
    'crate.rarity.l': 'Legendary',
    'crate.title': 'Supply Drop',
    'crate.tap': 'Tap to open!',
    'crate.pools': 'What can drop?',
    'crate.close': 'Close',
    'crate.newCosmetic': 'New cosmetic!',
    'crate.dup': 'Duplicate → sigma',
    'crate.bolts': 'sigma',
    'cosmetic.nc_silver': 'Silver nick',
    'cosmetic.nc_gold': 'Gold nick',
    'cosmetic.nc_lime': 'Lime nick',
    'cosmetic.nc_fire': 'Fire nick',
    'cosmetic.nc_ocean': 'Ocean nick',
    'cosmetic.nc_shimmer': 'Gold shimmer',
    'cosmetic.fr_steel': 'Steel frame',
    'cosmetic.fr_blue': 'Blue frame',
    'cosmetic.fr_purple': 'Purple glow',
    'cosmetic.fr_gold': 'Gold frame',
    'cosmetic.ti_recruit': 'Recruit',
    'cosmetic.ti_gunner': 'Gunner',
    'cosmetic.ti_ace': 'Armor Ace',
    'cosmetic.ti_legend': 'Arena Legend',
    'cosmetic.nc_mint': 'Mint nick',
    'cosmetic.nc_rose': 'Rose nick',
    'cosmetic.nc_sky': 'Sky nick',
    'cosmetic.nc_crimson': 'Crimson nick',
    'cosmetic.nc_violet': 'Violet nick',
    'cosmetic.nc_toxic': 'Toxic nick',
    'cosmetic.nc_rainbow': 'Rainbow glow',
    'cosmetic.fr_bronze': 'Bronze frame',
    'cosmetic.fr_forest': 'Forest frame',
    'cosmetic.fr_red': 'Red frame',
    'cosmetic.fr_teal': 'Teal glow',
    'cosmetic.fr_neon': 'Neon halo',
    'cosmetic.ti_driver': 'Driver',
    'cosmetic.ti_scout': 'Scout',
    'cosmetic.ti_sapper': 'Sapper',
    'cosmetic.ti_builder': 'Builder',
    'cosmetic.ti_bossbane': 'Boss Bane',
    'cosmetic.ti_immortal': 'Immortal',

    'hub.profile.sticker': 'Sticker',
    'hub.profile.stickerEmpty': 'No stickers yet. You can buy them in the SHOP.',

    // ── SHOP-1: shop-only goods ──
    // stickers — strength / body
    'cosmetic.st_biceps': 'Biceps',
    'cosmetic.st_fist': 'Fist',
    'cosmetic.st_punch': 'Punch',
    'cosmetic.st_glove': 'Boxing glove',
    'cosmetic.st_arm': 'Mech arm',
    'cosmetic.st_leg': 'Mech leg',
    // stickers — military
    'cosmetic.st_helmet': 'Helmet',
    'cosmetic.st_shield': 'Shield',
    'cosmetic.st_swords': 'Swords',
    'cosmetic.st_target': 'Target',
    'cosmetic.st_medal': 'Medal',
    'cosmetic.st_bolt': 'Bolt',
    // horns — WORKING names (files not listened to; rename = six strings each side)
    'cosmetic.hn_1': 'Horn 1',
    'cosmetic.hn_2': 'Horn 2',
    'cosmetic.hn_3': 'Horn 3',
    'cosmetic.hn_4': 'Horn 4',
    'cosmetic.hn_5': 'Horn 5',
    'cosmetic.hn_6': 'Horn 6',

    // SHOP-2 (v0.138.0) — crosshairs.
    'cosmetic.ch_sniper': 'Sniper',
    'cosmetic.ch_brackets': 'Brackets',
    'cosmetic.ch_ring': 'Ring',
    'cosmetic.ch_fangs': 'Fangs',
    'cosmetic.ch_laser': 'Laser',
    'cosmetic.ch_sigma': 'Sigma',
    'cosmetic.vo_commander': 'Commander',

    // ── SHOP ──
    'shop.title': 'SHOP',
    'shop.heroLine1': 'You earn sigmas in every battle — from trophies, orders and ranks.',
    'shop.heroLine2': 'Here you turn them into something of your own.',
    'shop.balance': 'YOU HAVE',
    'shop.impact.none': 'Cosmetic — no effect on gameplay',
    'shop.impact.boost': 'Boost — affects gameplay',
    'shop.badge.owned': 'OWNED',
    'shop.badge.soon': 'SOON',
    'shop.buy': 'BUY',
    'shop.listen': '▶ LISTEN',
    'shop.confirmQuestion': 'Buy for',
    'shop.confirmYes': 'YES, BUY',
    'shop.remaining': 'You will have:',
    'shop.tooPoor': 'Not enough sigmas',
    'shop.bought': 'Bought!',
    'shop.empty': 'Nothing here yet.',
    'shop.hornDesktopNote': '🖥️ Works ONLY on desktop — key H. It will not sound on a phone.',
    'shop.sandbox': 'SANDBOX — purchases are not saved',
    'shop.sandboxReset': 'RESET',
    'shop.tab.crates': 'CRATES',
    'shop.tab.crosshairs': 'CROSSHAIRS',
    'shop.tab.stickers': 'STICKERS',
    'shop.tab.horns': 'HORNS',
    'shop.tab.voice': 'VOICE',
    'shop.tab.soon': 'SOON',
    'shop.item.crate1.name': 'Crate',
    'shop.item.crate1.desc': 'One crate with a cosmetic and sigmas.',
    'shop.item.crate3.name': 'Three crates',
    'shop.item.crate3.desc': 'A pack of three — cheaper than one by one.',
    'shop.item.crate10.name': 'Ten crates',
    'shop.item.crate10.desc': 'Big pack. Best discount in the shop.',
    'shop.item.sticker.desc': 'A sticker next to your profile photo.',
    'shop.item.horn.desc': 'Press H in game to honk. It does nothing else.',
    'shop.item.crosshair.desc': 'Your crosshair in every match. Changes the look, not your aim.',
    'shop.item.vo_commander.name': 'Voice: Commander',
    'shop.item.vo_commander.desc': 'Fires you up at the start and warns you when you are losing armor.',
    'shop.item.soon_avatar.name': 'New avatars',
    'shop.item.soon_avatar.desc': 'More faces to pick in your profile.',
    'shop.item.soon_skin.name': 'Tank skins',
    'shop.item.soon_skin.desc': 'Your tank in different colors.',
    'shop.item.soon_part.name': 'Tank parts',
    'shop.item.soon_part.desc': 'Upgrade tree — speed and damage.',
    'shop.voice.start': 'Move out! Show them who rules here!',
    'shop.voice.lowHp': 'Careful! You are losing armor!',

    // ============================================================
    // ORDERS (PROG-F3 / HUB-3) — syntax: ICON + VERB + COUNTER
    // ============================================================
    // ============================================================
    // Super Powers (PROG-F7a — names via registry labelKey)
    // ============================================================
    'power.aura': 'Aura',
    'power.megaBomb': 'Bomb',
    'power.freeze': 'Freeze',
    'power.repair': 'Repair',
    'hud.repairStart': '🔧 REPAIR IN PROGRESS!',
    'hud.repairActive': '🔧 REPAIR {sec}s',
    'power.tower': 'Tower',
    'hud.towerStart': '🗼 MG TOWER DEPLOYED!',
    'power.rockets': 'Salvo',
    'hud.rocketsStart': '🚀 ROCKET SALVO!',
    'road.unlock.rockets': '🚀 Power: Rocket Salvo!',
    'power.ghost': 'Phantom',
    'hud.ghostStart': '👻 PHANTOM DECOYS ENEMIES!',
    'power.mines': 'Mines',
    'hud.minesStart': '💥 MINES ARMED — DRIVE!',
    'road.unlock.mines': '💥 Power: Mines!',
    'power.build': 'Wall',
    'hud.buildStart': '🧱 BUILDING WALL — DRIVE!',
    'road.unlock.build': '🧱 Power: Wall!',
    'power.strike': 'Airstrike',
    'hud.strikeStart': '🛸 AIRSTRIKE INCOMING!',
    'power.hole': 'Black Hole',
    'hud.holeStart': '🕳️ BLACK HOLE — VORTEX!',
    'power.laser': 'Laser',
    'hud.laserStart': '🔦 LASER LOCKED ON!',
    'power.pong': 'Ping-Pong',
    'hud.pongStart': '🏓 SERVE! DEFLECTING BULLETS!',
    'power.duck': 'Duck',
    'hud.duckStart': '🦆 GIGA DUCK! QUAAACK!',
    'power.locker': 'Parcel Box',
    'hud.lockerStart': '📦 PARCEL BOX — DELIVERY!',
    'power.disco': 'Disco',
    'hud.discoStart': '🪩 DISCO FEVER! EVERYBODY DANCE!',
    'power.granny': 'Granny',
    'hud.grannyStart': '👵 GRANNY — SHOO!',
    'power.burp': 'Mega Burp',
    'hud.burpStart': '📢 BUUURP!',
    // v0.119.0 — rich power cards in GARAGE (website box style):
    // descriptions from sigmatanks.eu + section headers + Cooldown/From chips.
    'power.aura.desc': 'A shield blocking all damage for 6 s.',
    'power.megaBomb.desc': 'Instant 800 dmg in a 250 px radius.',
    'power.freeze.desc': 'Freezes every enemy on screen for 5 s.',
    'power.rockets.desc': '8 homing rockets, 300 dmg with r=60 explosions.',
    'power.mines.desc': '7 s window: drop up to 14 mines (500 dmg, 5 s fuse).',
    'power.repair.desc': '3 s channel, restores 35% of your max HP.',
    'power.build.desc': '4 s window: build a wall of segments behind you for 8 s.',
    'power.tower.desc': 'MG turret for 8 s: auto-targets enemies within 420 px.',
    'power.ghost.desc': 'A decoy taunts enemies for 5 s, then explodes for 300 dmg.',
    'power.strike.desc': 'A squadron of 5 bombers carpets 12 bombs along your aim line.',
    'power.hole.desc': 'A 5 s vortex pulls enemies from 420 px and crushes them at the core.',
    'power.laser.desc': 'An orbital spot hunts enemies for 7.5 s — 600 dmg/s.',
    'power.pong.desc': 'A 5 s aura bounces enemy bullets back to their sender.',
    'power.duck.desc': 'A giant duck zigzags across the map, crushing everything in its path.',
    'power.locker.desc': 'A vending machine shells enemies with parcels — 450 dmg every half second.',
    'power.disco.desc': '6 s party: enemies dance and hit 20% weaker for the rest of the match.',
    'power.granny.desc': 'She toddles along healing 5% HP/s while enemies within 360 px flee.',
    'power.burp.desc': 'Four sound waves knock back and stun enemies for a second.',
    'hub.garage.powersTitle': 'Super Powers ({n})',
    'hub.garage.powersSub': '{n} loadout powers, unlocked on the Trophy Road.',
    'hub.garage.funSub': '{n} crazy powers from the 🎲 slot — pure fun.',
    'power.chip.cooldown': '⏱ {n} s',
    'power.chip.fromStart': 'From start',
    'power.chip.fromTrophies': 'From {n} 🏆',
    // v0.114.0 — dice slot (Crazy Powers)
    'power.dice': 'Dice',
    'hud.diceRolled': '🎲 {name}!',
    'hud.grannySay1': 'SHOO!',
    'hud.grannySay2': 'SOUP! 🍲',
    'hud.loadoutRemapped': '⚠️ Power not available in this mode — swapped!',
    'road.unlock.repair': '🔧 Power: Repair!',
    'road.unlock.tower': '🎯 Power: Tower!',
    'hub.garage.loadout': 'PICK 3 SUPER POWERS',
    'hub.garage.loadoutHint': 'Tap an empty field, then a power below — this is what you bring to battle!',
    'hub.garage.slot': 'Power {n}',
    'hub.garage.powerLocked': 'From {n} 🏆',
    'hub.garage.funMode': 'Crazy Powers',
    'hub.garage.funModeHint': 'A third 🎲 button rolls a random crazy power every time!',
    'hub.battle.difficulty': 'Difficulty',
    'hub.battle.pickTank': 'Pick your tank',
    // HUB-1.6b — tank descriptions (battle cards, matching sigmatanks.eu)
    'brawler.twardy.desc': 'The solid baseline. Balanced HP, damage and pace — a safe pick in any scenario.',
    'brawler.heavy.desc': 'A walking bunker with 700 HP. Slow reload, but soaks up what would wreck two other tanks.',
    'brawler.scout.desc': 'Fastest in the garage. 250 ms reload, only 200 HP — plays tempo, not trades.',
    'brawler.sniper.desc': 'One shot, 300 dmg. One-second reload. Punishes every enemy mistake at range.',
    'brawler.plasma.desc': 'Plasma shots, steady DPS and a solid 400 HP. Universal across all maps.',
    'brawler.pyro.desc': 'Fires a wide fan salvo. Covers a zone and melts enemy packs up close.',
    'brawler.shadow.desc': 'Agile assassin — 6.5 speed and 150 dmg. Gets in, finishes the job, gets out.',
    'brawler.king.desc': 'Elite with 500 HP and 200 dmg. The full package if you want one tank for everything.',

    'hub.quests.daily': 'DAILY ORDERS',
    'hub.quests.weekly': 'WEEKLY ORDERS',
    'hub.quests.claim': 'CLAIM',
    'hub.quests.claimed': 'CLAIMED',
    'hub.quests.setTitle': 'Daily set',
    'hub.quests.setDesc': 'Complete all 3 daily orders',
    'hub.quests.setReward': '+{bolts} sigma and a crate',
    'hub.quests.weekSetTitle': 'Weekly set',
    'hub.quests.weekSetReward': '+{bolts} sigma and {crates} crates',
    'hub.quests.locked': 'Orders from {n} 🏆',
    'hub.quests.lockedHint': 'Earn trophies in battles — {n} 🏆 to go',
    'hub.quests.resetDaily': 'New orders tomorrow',
    'hub.quests.resetWeekly': 'New set on Monday',
    'hub.quests.general': 'General Armour',
    'hub.quests.done': 'DONE',

    'quest.e_kill': 'Destroy enemies: {n}',
    'quest.e_gem': 'Collect gems: {n}',
    'quest.e_heart': 'Collect hearts: {n}',
    'quest.e_supershot': 'Fire super shots: {n}',
    'quest.e_superpwr': 'Use super powers: {n}',
    'quest.e_seconds': 'Survive in total: {n} min',
    'quest.e_match': 'Play battles: {n}',

    'quest.m_kill': 'Destroy enemies: {n}',
    'quest.m_boss': 'Defeat bosses: {n}',
    'quest.m_magnet': 'Grab magnets: {n}',
    'quest.m_cube': 'Collect power cubes: {n}',
    'quest.m_combo': 'Land a x{n} combo',
    'quest.m_trophies': 'Earn {n} trophies in one battle',
    'quest.m_runtime': 'Survive {n} min in one battle',
    'quest.m_rungems': 'Collect {n} gems in one battle',

    'quest.d_frozen': 'Destroy frozen enemies: {n}',
    'quest.d_bomb': 'Destroy {n} enemies with one Mega Bomb',
    'quest.d_ram': 'Ram enemies: {n}',
    'quest.d_stealth': 'Destroy enemies from a hiding zone: {n}',
    'quest.d_medipad': 'Use a healing pad: {n}',
    'quest.d_flag': 'Capture CTF flags: {n}',
    'quest.d_trophies': 'Earn trophies today: {n}',
    'quest.d_map': 'Play a battle on map: {map}',

    'quest.w_trophies': 'Earn trophies this week: {n}',
    'quest.w_maps': 'Play on {n} different maps',
    'quest.s_perfect': 'Finish a battle without taking damage',
    'quest.s_combo': 'Land a x{n} combo',
    'quest.s_trophies': 'Earn {n} trophies in one battle',

    'quest.general.1': 'Recruit, those gems will not collect themselves!',
    'quest.general.2': 'Report for your reward — after the work is done.',
    'quest.general.3': 'In my day tanks drove uphill. Both ways.',
    'quest.general.4': 'An order is an order. Lollipop comes later.',
    'quest.general.5': 'I watched your last battle. Room for improvement!',
    'quest.general.6': 'Do not just stand there, you will rust!',
    'quest.general.7': 'Whoever clears all three today eats lunch with me.',
    'quest.general.8': 'You have the armour. Courage? We will see.',
    'quest.general.9': 'Three orders. One day. Zero excuses.',
    'quest.general.10': 'Sigma does not grow on trees, recruit.',
    'quest.general.11': 'Chin up and into the tank!',
    'quest.general.12': 'General Armour reporting: you have work to do.',

    'hud.questDone': '✅ {name}',
    'hud.questProgress': '📋 {name} — {cur}/{max}',
    'end.questsDone': 'Orders: {n}',
    'end.funMode': 'Crazy Powers',
    // SEASON KIT — collectibles chip on the end-of-run screen.
    'end.seasonPickups': 'textbooks',

    // ============================================================
    // Scenario Picker
    // ============================================================
    'picker.scenarioTitle': 'Choose scenario',
    'picker.mapTitle': 'Choose location',
    'picker.mapChangeHint': 'Change map ›',
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

    'map.mars.name': 'MARS',
    'map.mars.tagline': 'Abandoned base and UFO',

    'map.range.name': 'FIRING RANGE',
    'map.range.tagline': 'Military obstacle course',

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

    // PROFILE-1: roster v2 — 9 tankers (names = files without _200, shared PL/EN)
    'profile.avatar.ash.name': 'Ash',
    'profile.avatar.ash.desc': 'Calm strategist',
    'profile.avatar.chris.name': 'Chris',
    'profile.avatar.chris.desc': 'Ramming master',
    'profile.avatar.dane.name': 'Dane',
    'profile.avatar.dane.desc': 'Fast scout',
    'profile.avatar.jack.name': 'Jack',
    'profile.avatar.jack.desc': 'Born leader',
    'profile.avatar.johny.name': 'Johny',
    'profile.avatar.johny.desc': 'Hothead',
    'profile.avatar.matti.name': 'Matti',
    'profile.avatar.matti.desc': 'Tech genius',
    'profile.avatar.pablo.name': 'Pablo',
    'profile.avatar.pablo.desc': 'Cheerful daredevil',
    'profile.avatar.steve.name': 'Steve',
    'profile.avatar.steve.desc': 'Tough veteran',
    'profile.avatar.tommy.name': 'Tommy',
    'profile.avatar.tommy.desc': 'Young talent',

    // PROFILE-1: 18 flags (names for aria/sorting — tiles show flags only)
    'profile.flag.ar': 'Argentina',
    'profile.flag.br': 'Brazil',
    'profile.flag.ca': 'Canada',
    'profile.flag.de': 'Germany',
    'profile.flag.es': 'Spain',
    'profile.flag.fr': 'France',
    'profile.flag.gb': 'Great Britain',
    'profile.flag.il': 'Israel',
    'profile.flag.it': 'Italy',
    'profile.flag.jp': 'Japan',
    'profile.flag.kr': 'South Korea',
    'profile.flag.nl': 'Netherlands',
    'profile.flag.pl': 'Poland',
    'profile.flag.pt': 'Portugal',
    'profile.flag.se': 'Sweden',
    'profile.flag.tr': 'Turkey',
    'profile.flag.ua': 'Ukraine',
    'profile.flag.us': 'USA',

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
    // PROG-F1 — progression on endcard
    'end.trophies': 'TROPHIES',
    'end.bolts': 'SIGMA',
    'end.milestone': 'MILESTONE',

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
    'hud.stealthBush':      '🌿 HIDDEN IN THE BUSHES (10s)!',
    'hud.stealthHydro':     '🌱 HIDDEN IN THE HYDROPONICS (10s)!',

    // CTF (FAZA CTF F2)
    'ctf.flagPickup':     '🚩 FLAG {name} TAKEN! RETURN TO BASE!',
    'ctf.flagCaptured':   '✅ FLAG {name} CAPTURED!',
    'ctf.bossRespawn':    '⚠️ BOSS RESPAWN!',
    'ctf.enemiesEnraged': '⚔️ ENEMIES ENRAGED!',
    'ctf.carryBanner':    '🚩 RETURN TO BASE!',
    'end.flags':          'Flags',
    'hud.stealthSpotted':   '👁️ YOU HAVE BEEN SPOTTED!',
    'hud.shotRevealed':     '🔫 SHOT REVEALED YOUR POSITION!',

    // Caravan (Desert)
    'hud.caravanGem':     '🐪 Caravan dropped 💎',
    'hud.caravanHeart':   '🐪 Caravan dropped ❤️',
    'hud.caravanMagnet':  '🐪 Caravan dropped 🧲',
    'hud.roverGem':       '🛰️ Rover dropped 💎',
    // SEASON KIT — HUD counter chip label.
    'hud.books': 'Books',
    // SEASON KIT — legendary collectible (1 per day).
    'hud.seasonLegendary': '📙 GOLDEN ENCYCLOPEDIA!',
    // SEASON KIT — first time this collectible type is picked up.
    'hud.seasonNewItem': 'NEW IN COLLECTION: {name}!',
    'hud.seasonNewShort': 'NEW!',
    'hud.roverHeart':     '🛰️ Rover dropped ❤️',
    'hud.roverMagnet':    '🛰️ Rover dropped 🧲',
    // ARC-R2 — penguins (Ice Arena)
    'hud.penguinGem':     '🐧 Penguin dropped 💎',
    'hud.penguinHeart':   '🐧 Penguin dropped ❤️',
    'hud.penguinMagnet':  '🐧 Penguin dropped 🧲',
    'hud.yetiRoar':       '🦍 YETI IS FURIOUS! Run!',
    'hud.blizzard':       '❄️ Blizzard!',
    'hud.dustStorm':      '🌪️ Dust storm!',
    'hud.ufoAbduct':      '🛸 UFO abducted an enemy!',
    'hud.ufoWarn':        '🛸 UFO WARNING! ({lvl}/{max})',
    'hud.ufoAngry':       '🛸 UFO IS FIRING BACK! Run!',
    'hud.ufoDown':        '🛸 YOU SHOT DOWN THE UFO! 💎💎💎',

    // Pickups (heal/turbo/super charge/magnet)
    // Pads — on-pad label (FAZA MARS M4)
    'pad.repairing':      'REPAIRING',
    'ctf.flagLabel':      'FLAG {team}',
    'portrait.title':     'Turn your phone sideways',
    'portrait.subtitle':  'Brawl Tanks plays best in landscape — you see more of the battlefield 🔄',

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
    'hud.powerHint':           '1/2/3 = power   ·   scroll = select   ·   SPACE/RMB = use',

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