/**
 * Profile translations — Polski (no diacritics per Constitution §4)
 *
 * Merge into your main pl.ts via spread:
 *   import { PROFILE_TRANSLATIONS_PL } from './translations/profile/pl';
 *   export const pl = { ...existing, profile: PROFILE_TRANSLATIONS_PL };
 *
 * Then look up via t('profile.onboarding.welcomeTitle') etc.
 *
 * NOTE: BRAK `as const` na koncu obiektu. Powod:
 *   `as const` zamienilby kazdy string na literal type ("Witaj" zamiast string),
 *   przez co EN nie moglby przypisac wlasnych tlumaczen. TS wymagalby identycznych
 *   literali. Konstrukt `typeof PROFILE_TRANSLATIONS_PL` w en.ts dalej enforces
 *   strukture kluczy (parity), ale typy wartosci sa `string` — co pozwala
 *   na rozne tlumaczenia tej samej struktury.
 */

export const PROFILE_TRANSLATIONS_PL = {
  onboarding: {
    welcomeTitle: 'Witaj, dowodco!',
    welcomeSubtitle: 'Stworz swoj profil zanim ruszysz do walki',
    pickAvatarLabel: 'Wybierz awatara',
    pickFlagLabel: 'Twoja flaga',
    startButton: 'ROZPOCZNIJ',
    skipButton: 'POMIN',
  },
  profile: {
    yourProfile: 'Twoj profil',
    changeAvatar: 'Zmien awatara',
    changeFlag: 'Zmien flage',
    totalGamesLabel: 'Rozegrane gry',
    memberSinceLabel: 'Gracz od',
    lastPlayedLabel: 'Ostatnia gra',
    deleteProfile: 'Usun profil',
    confirmDelete: 'Na pewno usunac profil?',
  },
  avatar: {
    komandor: {
      name: 'Komandor',
      desc: 'Doswiadczony taktyk',
    },
    pilotka: {
      name: 'Pilotka',
      desc: 'Odwazna zwiadowczyni',
    },
    smyk: {
      name: 'Smyk',
      desc: 'Energiczny rookie',
    },
    inzynier: {
      name: 'Inzynier',
      desc: 'Spokojny strateg',
    },
  },
  flag: {
    pl: 'Polska',
    fr: 'Francja',
    it: 'Wlochy',
    de: 'Niemcy',
  },
  mainHub: {
    continueAs: 'Kontynuuj jako',
    continueOn: 'na',
    welcomeBack: 'Witaj z powrotem',
  },
};

export type ProfileTranslationsPL = typeof PROFILE_TRANSLATIONS_PL;