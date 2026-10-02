import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REPORT_LEVELS,
  REPORT_TEMPLATES,
  Report,
  describeEntry,
  renderTemplate,
  type ReportCode,
} from '../src/convert/index.js';

const codes = Object.keys(REPORT_TEMPLATES) as ReportCode[];

describe('Report', () => {
  it('counts the same message once, however often it comes up', () => {
    const report = new Report();
    report.add('blockRenamed', { from: 'minecraft:iron_chain', to: 'minecraft:chain' });
    report.add('blockRenamed', { from: 'minecraft:iron_chain', to: 'minecraft:chain' });
    report.add('blockRenamed', { from: 'minecraft:iron_chain', to: 'minecraft:chain' });

    expect(report.entries).toEqual([
      {
        level: 'info',
        code: 'blockRenamed',
        params: { from: 'minecraft:iron_chain', to: 'minecraft:chain' },
        count: 3,
      },
    ]);
  });

  it('keeps messages with different parameters apart', () => {
    const report = new Report();
    report.add('entityDropped', { id: 'minecraft:item_display' });
    report.add('entityDropped', { id: 'minecraft:painting' });

    expect(report.entries).toHaveLength(2);
  });

  it('carries no params for a message that has none', () => {
    const report = new Report();
    report.add('itemsConverted');

    expect(report.entries[0]).toEqual({ level: 'info', code: 'itemsConverted', count: 1 });
  });

  it('puts warnings first, then the most frequent, then alphabetical', () => {
    const report = new Report();
    report.add('itemsConverted');
    report.add('fluidsConverted');
    report.add('fluidsConverted');
    report.add('blockMissingKept', { name: 'minecraft:copper_bulb' });

    expect(report.entries.map((entry) => entry.code)).toEqual([
      'blockMissingKept',
      'fluidsConverted',
      'itemsConverted',
    ]);
    expect(report.warnings.map((entry) => entry.code)).toEqual(['blockMissingKept']);
  });

  it('survives being copied across a worker boundary', () => {
    const report = new Report();
    report.add('modPalette', { namespace: 'examplemod', count: 2 });

    expect(structuredClone(report.entries)).toEqual(report.entries);
  });
});

describe('describeEntry', () => {
  it('fills the placeholders of the English template', () => {
    expect(describeEntry({ code: 'blockRenamed', params: { from: 'a', to: 'b' } })).toBe(
      'Renamed block a to b',
    );
  });

  it('leaves a placeholder alone when its parameter is missing, rather than hiding the gap', () => {
    expect(renderTemplate('Block {name} is gone', {})).toBe('Block {name} is gone');
  });
});

describe('report codes', () => {
  it('has a level for every code, and only warns where somebody needs to look', () => {
    expect(Object.keys(REPORT_LEVELS).sort()).toEqual([...codes].sort());
    expect(codes.filter((code) => REPORT_LEVELS[code] === 'warn').sort()).toEqual([
      'attributeFilterDropped',
      'blockEntityWithoutId',
      'blockMissingKept',
      'blockMissingReplaced',
      'createUnverified',
      'modBlockEntityUnverified',
      'modPalette',
      'sequenceDropped',
    ]);
  });
});

/**
 * The website shows the report in German and English, and keeps the wording in
 * its own message files. Those are read from here so that adding a code without
 * writing it in both languages, or editing the English in one place and not the
 * other, fails this suite instead of showing somebody a blank line or a raw key.
 */
describe('the website’s copy for every report code', () => {
  const messages = (language: 'en' | 'de'): Record<string, string> =>
    JSON.parse(
      readFileSync(new URL(`../../../frontend/messages/${language}.json`, import.meta.url), 'utf8'),
    ) as Record<string, string>;

  const en = messages('en');
  const de = messages('de');
  const placeholders = (text: string): string[] =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

  it.each(codes)('%s is written in both languages', (code) => {
    expect(en[`schematics_report_${code}`], 'English').toBeTypeOf('string');
    expect(de[`schematics_report_${code}`], 'German').toBeTypeOf('string');
  });

  it.each(codes)('%s reads the same in English as on the command line', (code) => {
    expect(en[`schematics_report_${code}`]).toBe(REPORT_TEMPLATES[code]);
  });

  it.each(codes)('%s uses the same placeholders in German as in English', (code) => {
    expect(placeholders(de[`schematics_report_${code}`]!)).toEqual(
      placeholders(REPORT_TEMPLATES[code]),
    );
  });

  it('has no copy left over for a code that no longer exists', () => {
    const known = new Set(codes.map((code) => `schematics_report_${code}`));
    const stale = Object.keys(en)
      .concat(Object.keys(de))
      .filter((key) => key.startsWith('schematics_report_') && !known.has(key));

    expect(stale).toEqual([]);
  });
});
