/**
 * Profile translations — English (full grammar)
 *
 * Type-narrowed against PROFILE_TRANSLATIONS_PL so missing/extra keys = compile error.
 *
 * Merge into your main en.ts:
 *   import { PROFILE_TRANSLATIONS_EN } from './translations/profile/en';
 *   export const en: typeof pl = { ...existing, profile: PROFILE_TRANSLATIONS_EN };
 */
import type { ProfileTranslationsPL } from './pl';

export const PROFILE_TRANSLATIONS_EN: ProfileTranslationsPL = {
  onboarding: {
    welcomeTitle: 'Welcome, Commander!',
    welcomeSubtitle: 'Set up your profile before heading into battle',
    pickAvatarLabel: 'Choose your avatar',
    pickFlagLabel: 'Your flag',
    startButton: 'START',
    skipButton: 'SKIP',
  },
  profile: {
    yourProfile: 'Your profile',
    changeAvatar: 'Change avatar',
    changeFlag: 'Change flag',
    totalGamesLabel: 'Games played',
    memberSinceLabel: 'Member since',
    lastPlayedLabel: 'Last played',
    deleteProfile: 'Delete profile',
    confirmDelete: 'Are you sure you want to delete this profile?',
  },
  avatar: {
    komandor: {
      name: 'Commander',
      desc: 'Seasoned tactician',
    },
    pilotka: {
      name: 'Aviator',
      desc: 'Fearless scout',
    },
    smyk: {
      name: 'Rookie',
      desc: 'Energetic newcomer',
    },
    inzynier: {
      name: 'Engineer',
      desc: 'Calm strategist',
    },
  },
  flag: {
    pl: 'Poland',
    fr: 'France',
    it: 'Italy',
    de: 'Germany',
  },
  mainHub: {
    continueAs: 'Continue as',
    continueOn: 'on',
    welcomeBack: 'Welcome back',
  },
};