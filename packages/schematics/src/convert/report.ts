/**
 * What the converter tells the person about what it did.
 *
 * Messages are codes with parameters rather than sentences, because the website
 * shows them in German and English and a sentence built inside the converter
 * could only ever be one of the two. The English wording lives here, in
 * REPORT_TEMPLATES, for the command line and for tests; the website carries its
 * own copy of every template under `schematics_report_<code>` in its message
 * files, and a test in this package fails if a code has no copy in either
 * language or if the English drifts from the text below.
 */

export type ReportLevel = 'info' | 'warn';

/** Placeholders are written `{name}` and filled from the entry's params. */
export const REPORT_TEMPLATES = {
  dataVersion: 'Data version changed from {from} to {to}',
  dataVersionMissing: 'The file had no data version, set to {to}',
  blockRenamed: 'Renamed block {from} to {to}',
  blockMissingReplaced: 'Block {name} does not exist in 1.20.1 and was replaced with air',
  blockMissingKept: 'Block {name} does not exist in 1.20.1 and will load as air',
  modPalette:
    'Blocks from the mod "{namespace}" are in the palette, {count} in total, and are not checked against 1.20.1',
  blockEntityWithoutId: 'Dropped a block entity without an id',
  blockEntityStripped: 'Stripped {id} block entity data down to its id',
  blockEntityConverted: 'Converted {id} block entities',
  createUnverified: 'create:{name} has no specific rules and was converted generically, unverified',
  modBlockEntityUnverified:
    '{id} is a block entity from another mod and was converted generically, unverified',
  sequenceDropped: '{id}: the sequenced gearshift program cannot be converted and was dropped',
  signConverted: 'Converted {id} text to JSON components',
  signReset: 'Reset {id} text',
  containerKept: 'Kept the contents of {id}',
  entityKept: 'Kept {id} entities, item format converted',
  entityDropped: 'Dropped entity {id}',
  entityDroppedUnknown: 'Dropped an entity without an id',
  itemsConverted: 'Converted item stacks, count and components to Count and tag',
  fluidsConverted: 'Converted fluid stacks, id and amount to Variant and Amount',
  componentsDropped: 'Dropped data components on block entities and entities',
  droppedItemComponent: 'Dropped item component {name}',
  attributeFilterDropped:
    'The attribute filter {item} lost its matched attributes, which cannot be converted',
  blockPosConverted: 'Converted block position arrays to X, Y, Z compounds ({key})',
  blockPosConvertedInList: 'Converted block position arrays to X, Y, Z compounds (list entry)',
} as const;

export type ReportCode = keyof typeof REPORT_TEMPLATES;

/** Which codes are worth a second look. Everything else is just a record of what happened. */
export const REPORT_LEVELS: Record<ReportCode, ReportLevel> = {
  dataVersion: 'info',
  dataVersionMissing: 'info',
  blockRenamed: 'info',
  blockMissingReplaced: 'warn',
  blockMissingKept: 'warn',
  modPalette: 'warn',
  blockEntityWithoutId: 'warn',
  blockEntityStripped: 'info',
  blockEntityConverted: 'info',
  createUnverified: 'warn',
  modBlockEntityUnverified: 'warn',
  sequenceDropped: 'warn',
  signConverted: 'info',
  signReset: 'info',
  containerKept: 'info',
  entityKept: 'info',
  entityDropped: 'info',
  entityDroppedUnknown: 'info',
  itemsConverted: 'info',
  fluidsConverted: 'info',
  componentsDropped: 'info',
  droppedItemComponent: 'info',
  attributeFilterDropped: 'warn',
  blockPosConverted: 'info',
  blockPosConvertedInList: 'info',
};

/** The parameters each code carries. `undefined` means the message has none. */
export interface ReportParams {
  dataVersion: { from: string; to: number };
  dataVersionMissing: { to: number };
  blockRenamed: { from: string; to: string };
  blockMissingReplaced: { name: string };
  blockMissingKept: { name: string };
  modPalette: { namespace: string; count: number };
  blockEntityWithoutId: undefined;
  blockEntityStripped: { id: string };
  blockEntityConverted: { id: string };
  createUnverified: { name: string };
  modBlockEntityUnverified: { id: string };
  sequenceDropped: { id: string };
  signConverted: { id: string };
  signReset: { id: string };
  containerKept: { id: string };
  entityKept: { id: string };
  entityDropped: { id: string };
  entityDroppedUnknown: undefined;
  itemsConverted: undefined;
  fluidsConverted: undefined;
  componentsDropped: undefined;
  droppedItemComponent: { name: string };
  attributeFilterDropped: { item: string };
  blockPosConverted: { key: string };
  blockPosConvertedInList: undefined;
}

type ParamArgs<C extends ReportCode> = ReportParams[C] extends undefined ? [] : [ReportParams[C]];

export type ReportParamValues = Record<string, string | number>;

/**
 * One line of a report. Plain data on purpose: it crosses from the web worker
 * to the page, and a class instance or a getter would not survive that.
 */
export interface ReportEntry {
  level: ReportLevel;
  code: ReportCode;
  params?: ReportParamValues;
  /** How many times this exact message came up. */
  count: number;
}

export function renderTemplate(template: string, params: ReportParamValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** An entry as one English sentence, without its count. */
export function describeEntry(entry: Pick<ReportEntry, 'code' | 'params'>): string {
  return renderTemplate(REPORT_TEMPLATES[entry.code], entry.params);
}

/** Collects what the converter did so a person can spot new offenders. */
export class Report {
  private readonly map = new Map<string, ReportEntry>();

  add<C extends ReportCode>(code: C, ...args: ParamArgs<C>): void {
    const params = args[0] as ReportParamValues | undefined;
    const key = `${code}\u0000${params ? JSON.stringify(params) : ''}`;
    const existing = this.map.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      this.map.set(key, {
        level: REPORT_LEVELS[code],
        code,
        ...(params ? { params } : {}),
        count: 1,
      });
    }
  }

  /** Warnings first, then the most frequent, then alphabetical so the order is stable. */
  get entries(): ReportEntry[] {
    return [...this.map.values()].sort(
      (a, b) =>
        (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1) ||
        b.count - a.count ||
        describeEntry(a).localeCompare(describeEntry(b)),
    );
  }

  get warnings(): ReportEntry[] {
    return this.entries.filter((entry) => entry.level === 'warn');
  }
}
