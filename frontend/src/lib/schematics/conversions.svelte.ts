import { DEFAULT_OPTIONS, type ConvertOptions } from '@smto/mc-schematics';

import { ConversionError, SchematicConverter, type Converted } from './client';
import type { FailureStage } from './protocol';

/**
 * The most a single file may weigh before it is turned away.
 *
 * Everything happens in the tab, and a gzip file can expand a hundredfold, so a
 * file that is merely large to download can still take the tab down when it is
 * unpacked. Real structures and Create schematics are a few hundred kilobytes
 * to a few megabytes; this is a long way above that and well below the point
 * where a browser gives up.
 */
export const MAX_INPUT_BYTES = 64 * 1024 * 1024;

/** How long to wait after the last change to an option before converting again. */
const OPTION_DEBOUNCE_MS = 200;

/** The options as the page shows them: one switch each, all of them on or off. */
export interface FormOptions {
  keepCreate: boolean;
  keepContainers: boolean;
  keepSigns: boolean;
  convertMods: boolean;
  keepEntities: boolean;
  dropKinetic: boolean;
  unknownAir: boolean;
}

export const DEFAULT_FORM_OPTIONS: FormOptions = {
  keepCreate: DEFAULT_OPTIONS.keepCreateBlockEntities,
  keepContainers: DEFAULT_OPTIONS.keepVanillaContainerItems,
  keepSigns: DEFAULT_OPTIONS.keepSignText,
  convertMods: DEFAULT_OPTIONS.otherModBlockEntities === 'convert',
  keepEntities: DEFAULT_OPTIONS.entities === 'convert',
  dropKinetic: DEFAULT_OPTIONS.dropKineticState,
  unknownAir: DEFAULT_OPTIONS.unknownBlocks === 'air',
};

export function toConvertOptions(form: FormOptions): ConvertOptions {
  return {
    ...DEFAULT_OPTIONS,
    keepCreateBlockEntities: form.keepCreate,
    keepVanillaContainerItems: form.keepContainers,
    keepSignText: form.keepSigns,
    otherModBlockEntities: form.convertMods ? 'convert' : 'strip',
    entities: form.keepEntities ? 'convert' : 'drop',
    dropKineticState: form.dropKinetic,
    unknownBlocks: form.unknownAir ? 'air' : 'keep',
  };
}

export type ItemStatus = 'working' | 'done' | 'failed';

export interface Failure {
  /** `size` is a file turned away before it was read. */
  stage: FailureStage | 'size';
  /** The technical reason, in English as the converter wrote it. */
  detail: string;
}

export type Preview =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; text: string; truncated: boolean }
  | { status: 'failed' };

/** One file on the page, and everything known about converting it. */
export class Item {
  status = $state<ItemStatus>('working');
  converted = $state.raw<Converted | null>(null);
  failure = $state.raw<Failure | null>(null);
  preview = $state.raw<Preview>({ status: 'idle' });

  /** Bumped by every conversion, so an answer to an older question can be told apart. */
  generation = 0;

  /**
   * The file as it was dropped, kept to convert again when an option changes.
   * Deliberately a plain field and not state: it is large and never displayed.
   */
  original: ArrayBuffer | null = null;

  constructor(
    readonly key: number,
    readonly name: string,
    readonly size: number,
  ) {}

  /** Lines worth a second look, as opposed to a record of what was done. */
  get warnings(): number {
    return this.converted?.entries.filter((entry) => entry.level === 'warn').length ?? 0;
  }

  get outputName(): string {
    return `${this.name.replace(/(\.nbt)?$/i, '')}-1.20.1.nbt`;
  }
}

/**
 * The files on the page and the options they are converted with.
 *
 * Changing an option converts everything again, because the result depends on
 * it and the original is still here to convert from. Each file keeps its own
 * generation counter: switching two options in quick succession starts two
 * conversions, and only the answer to the second may land.
 */
export class Conversions {
  options = $state<FormOptions>({ ...DEFAULT_FORM_OPTIONS });
  items = $state.raw<Item[]>([]);

  private readonly converter = new SchematicConverter();
  private nextKey = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;

  async add(files: File[]): Promise<void> {
    for (const file of files) {
      const item = new Item(this.nextKey++, file.name, file.size);
      this.items = [...this.items, item];

      if (file.size > MAX_INPUT_BYTES) {
        item.failure = { stage: 'size', detail: String(file.size) };
        item.status = 'failed';
        continue;
      }

      item.original = await file.arrayBuffer();
      void this.run(item);
    }
  }

  remove(item: Item): void {
    item.generation += 1;
    item.original = null;
    this.items = this.items.filter((other) => other !== item);
  }

  clear(): void {
    for (const item of this.items) {
      item.generation += 1;
      item.original = null;
    }
    this.items = [];
  }

  /** Call when an option changes. Waits for the changes to stop before converting. */
  optionsChanged(): void {
    clearTimeout(this.timer);

    for (const item of this.items) {
      // Its result is out of date from this moment, so it cannot be downloaded
      // while the new one is on its way.
      if (item.status === 'done') {
        item.status = 'working';
      }
    }

    this.timer = setTimeout(() => {
      for (const item of this.items) {
        if (item.original) {
          void this.run(item);
        }
      }
    }, OPTION_DEBOUNCE_MS);
  }

  async loadPreview(item: Item): Promise<void> {
    if (item.preview.status !== 'idle' || !item.converted) {
      return;
    }

    const generation = item.generation;
    item.preview = { status: 'loading' };

    try {
      const { text, truncated } = await this.converter.preview(item.converted.bytes);
      if (item.generation === generation) {
        item.preview = { status: 'ready', text, truncated };
      }
    } catch {
      if (item.generation === generation) {
        item.preview = { status: 'failed' };
      }
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.converter.dispose();
  }

  private async run(item: Item): Promise<void> {
    const original = item.original;
    if (!original) {
      return;
    }

    const generation = ++item.generation;
    item.status = 'working';
    item.preview = { status: 'idle' };

    try {
      const converted = await this.converter.convert(original, toConvertOptions(this.options));

      if (item.generation !== generation) {
        return;
      }
      item.converted = converted;
      item.failure = null;
      item.status = 'done';
    } catch (cause) {
      if (item.generation !== generation) {
        return;
      }
      item.converted = null;
      item.failure =
        cause instanceof ConversionError
          ? { stage: cause.stage, detail: cause.message }
          : { stage: 'convert', detail: cause instanceof Error ? cause.message : String(cause) };
      item.status = 'failed';
    }
  }
}
