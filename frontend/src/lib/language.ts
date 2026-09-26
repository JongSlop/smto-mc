export type Language = 'en' | 'de';
export const LANGUAGES: readonly Language[] = ['en', 'de'];
export const LANGUAGE_COOKIE = 'smto_mc_lang';

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
};
