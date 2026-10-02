import type { Language } from './language';

/**
 * Playtime, read the way somebody would say it.
 *
 * Two units at most. "312 hours 47 minutes" is precise and unreadable, and a
 * player who has been on a server for a year does not care about the minutes.
 * Below an hour the minutes are the whole story, so they stay.
 */
export function formatPlaytime(seconds: number, lang: Language): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const unit = (value: number, en: [string, string], de: [string, string]): string => {
    const [singular, plural] = lang === 'de' ? de : en;
    return `${value} ${value === 1 ? singular : plural}`;
  };

  if (hours === 0) {
    return unit(minutes, ['minute', 'minutes'], ['Minute', 'Minuten']);
  }

  if (hours < 100 && minutes > 0) {
    return `${unit(hours, ['hour', 'hours'], ['Stunde', 'Stunden'])} ${unit(
      minutes,
      ['minute', 'minutes'],
      ['Minute', 'Minuten'],
    )}`;
  }

  return unit(hours, ['hour', 'hours'], ['Stunde', 'Stunden']);
}

/** Dates in the reader's own convention rather than one fixed format. */
export function formatDate(iso: string | null, lang: Language): string {
  if (!iso) {
    return '';
  }

  return new Date(iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * The same date, short enough for a stat tile.
 *
 * The display font is wide and a tile is narrow, so "26 September 2026" wraps
 * onto two lines and drags the whole row taller. "26 Sept 2026" does not.
 */
export function formatDateShort(iso: string | null, lang: Language): string {
  if (!iso) {
    return '';
  }

  return new Date(iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string | null, lang: Language): string {
  if (!iso) {
    return '';
  }

  return new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * How long is left on something, in whole minutes.
 *
 * Used for the link code, where the number is a reassurance rather than a
 * countdown: it is rendered once by the server and not ticked down, because a
 * ticking clock invites somebody to watch it instead of going to type the code.
 */
export function minutesUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

/** A byte count in KiB with one decimal, written the way the reader writes numbers. */
export function formatKiB(bytes: number, lang: Language): string {
  return (bytes / 1024).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
