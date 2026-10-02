import type { ConvertOptions, ReportEntry } from '@smto/mc-schematics';

/**
 * What the page and the conversion worker say to each other.
 *
 * Plain data only: everything here is cloned across the worker boundary, so a
 * class instance or a getter would arrive as something else. The report in
 * particular travels as its entries, not as the Report that made them.
 */

export type WorkerRequest =
  | { type: 'convert'; id: number; data: ArrayBuffer; options: ConvertOptions }
  | { type: 'preview'; id: number; data: ArrayBuffer };

/** Where a conversion stopped: reading the file, or converting what was read. */
export type FailureStage = 'read' | 'convert';

export type WorkerResponse =
  | {
      type: 'converted';
      id: number;
      bytes: ArrayBuffer;
      inputSize: number;
      entries: ReportEntry[];
    }
  | { type: 'failed'; id: number; stage: FailureStage; detail: string }
  | { type: 'preview'; id: number; text: string; truncated: boolean };

/**
 * The most text a preview will carry. A structure of a few hundred thousand
 * blocks dumps to tens of megabytes, which a <pre> cannot show without hanging
 * the tab, and nobody reads past the first screenfuls of it anyway.
 */
export const PREVIEW_MAX_CHARS = 200_000;
