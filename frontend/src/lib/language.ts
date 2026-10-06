// A type import only, on purpose: this file is loaded by the shared layout, and
// a runtime import of the contracts package would put zod in every page's bundle.
import type { SiteLanguage } from '@smto/mc-contracts';

/**
 * The list of languages is defined in the contracts package, because the backend
 * validates the stored `preferred_language` setting against it. Typing from it,
 * and requiring a name for every member below, means adding a language there
 * fails the typecheck here until the website has one too.
 */
export type Language = SiteLanguage;

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
};

export const LANGUAGES = Object.keys(LANGUAGE_NAMES) as Language[];
export const LANGUAGE_COOKIE = 'smto_mc_lang';
