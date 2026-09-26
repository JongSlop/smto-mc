import { FEATURED_METRICS, PLAYTIME_METRIC } from '@smto/mc-contracts';

import { formatPlaytime } from './format';
import type { translate } from './i18n';
import type { Language } from './language';

export type MetricValue = number | Record<string, unknown>;

/**
 * A metric nobody has moved yet.
 *
 * Zero means "recorded, but not by this player", and a dashboard padded with
 * two dozen empty rows hides the handful that say anything. Every view drops
 * them, so the numbers on screen are all counts that actually happened.
 *
 * Structured metrics are never zero: an empty object has no entries but is
 * still something a plugin went out of its way to send, so it is left to the
 * formatter rather than silently dropped.
 */
export function isZeroMetric(value: MetricValue): boolean {
  return value === 0;
}

/**
 * What a metric is called, in the reader's language.
 *
 * Metric keys are free text by design, so the UI cannot know them all: a plugin
 * can start recording `ancient_debris_mined` tomorrow and this has to render
 * something sensible without a deploy. Copy in the message files wins, and
 * anything unknown falls back to the key with its underscores opened up, which
 * reads acceptably in English and is at least unambiguous in German.
 *
 * That fallback is the reason a metric never needs to be registered anywhere to
 * appear on the dashboard.
 */
export function metricLabel(t: ReturnType<typeof translate>, key: string): string {
  const message = t[`metric_${key}` as keyof typeof t];

  if (typeof message === 'function') {
    return (message as () => string)();
  }

  // The unit suffix is the formatter's business, not the label's: the value
  // already reads `91.2 km`, so a label of "Distance cm" is both redundant and
  // wrong. Keep this list in step with formatMetric below.
  return key
    .replace(/_(seconds|cm)$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

/**
 * A metric as a person would read it.
 *
 * The unit lives in the key's suffix, which is the convention the API
 * documents, so the formatter can be driven by the name rather than by a
 * registry that has to be kept in step. Anything with no recognised suffix is a
 * plain count, grouped so six figures stay readable.
 */
export function formatMetric(value: MetricValue, key: string, lang: Language): string {
  if (typeof value !== 'number') {
    // A structured metric, the rare case `data` exists for. Showing how many
    // entries it holds beats rendering an object at somebody.
    return String(Object.keys(value).length);
  }

  if (key === PLAYTIME_METRIC || key.endsWith('_seconds')) {
    return formatPlaytime(value, lang);
  }

  if (key.endsWith('_cm')) {
    const locale = lang === 'de' ? 'de-DE' : 'en-GB';
    return value >= 100_000
      ? `${(value / 100_000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`
      : `${Math.round(value / 100).toLocaleString(locale)} m`;
  }

  return value.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');
}

export interface FeaturedMetric {
  key: string;
  value: MetricValue;
}

/**
 * Whether a metric is worth putting on the page at all.
 *
 * A plugin registers a statistic for every player it sees, so a profile carries
 * a row for everything the network measures, most of it at zero. Those rows are
 * noise: a list of twenty "0" values buries the four numbers that are not zero,
 * and a zero says nothing a missing row does not already say. Hidden rather
 * than rendered, in every list.
 *
 * The featured tiles are the exception, and splitMetrics says why.
 *
 * A structured metric with no entries is the same statement in the other shape.
 */
export function hasRecordedValue(value: MetricValue): boolean {
  return typeof value === 'number' ? value !== 0 : Object.keys(value).length > 0;
}

/**
 * Everything a server recorded, in the order it should render.
 *
 * Sorted by key, because any order is arbitrary and alphabetical is at least
 * predictable, and stable in the reader's language only by accident: the label
 * is translated but the sort is on the key, so a list does not reshuffle itself
 * when somebody switches language.
 */
export function metricEntries(metrics: Record<string, MetricValue>): [string, MetricValue][] {
  return Object.entries(metrics)
    .filter(([, value]) => hasRecordedValue(value))
    .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * Splits what was recorded into the handful that get a tile and the rest.
 *
 * Featured metrics keep the order they are listed in, so the dashboard does not
 * reshuffle itself as values arrive, and unlike the lists below they are shown
 * at zero. The zero rule exists because twenty empty rows bury the four that
 * say something, and that reasoning does not reach up here: the headline row is
 * a fixed handful, and nought deaths is a fact somebody would like to see
 * rather than noise. A headline that appears and disappears depending on
 * whether you died this week is also a worse dashboard than one that always
 * says the same few things.
 *
 * Nothing recorded anywhere is still nothing: a profile that has never been
 * seen on a server gets no tiles rather than a row of confident zeroes.
 */
export function splitMetrics(metrics: Record<string, MetricValue>): {
  featured: FeaturedMetric[];
  rest: [string, MetricValue][];
} {
  const featured: FeaturedMetric[] = [];
  const anythingRecorded = Object.values(metrics).some(hasRecordedValue);

  if (anythingRecorded) {
    for (const key of FEATURED_METRICS) {
      // Missing rather than zero for a metric the plugins have not sent yet.
      // They report every statistic they track for every player they see, so
      // in practice an absent featured metric is one nobody has moved.
      featured.push({ key, value: metrics[key] ?? 0 });
    }
  }

  const featuredKeys = new Set(FEATURED_METRICS);
  const rest = metricEntries(metrics).filter(([key]) => !featuredKeys.has(key));

  return { featured, rest };
}
