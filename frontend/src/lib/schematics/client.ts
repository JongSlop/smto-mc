import type { ConvertOptions, ReportEntry } from '@smto/mc-schematics';

import type { FailureStage, WorkerRequest, WorkerResponse } from './protocol';

export interface Converted {
  bytes: Uint8Array<ArrayBuffer>;
  inputSize: number;
  entries: ReportEntry[];
}

/** A conversion that did not produce a file, and where it stopped. */
export class ConversionError extends Error {
  constructor(
    readonly stage: FailureStage,
    detail: string,
  ) {
    super(detail);
    this.name = 'ConversionError';
  }
}

interface Pending {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: unknown) => void;
}

/**
 * The page's handle on the conversion worker.
 *
 * Starts the worker on first use rather than on import, so server rendering,
 * which imports this module along with everything else on the page, never
 * reaches for a Worker that does not exist there. If the worker dies, which in
 * practice means the tab ran out of memory on a very large file, everything
 * waiting on it fails and the next request starts a fresh one.
 */
export class SchematicConverter {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private start(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const waiting = this.pending.get(event.data.id);
      if (waiting) {
        this.pending.delete(event.data.id);
        waiting.resolve(event.data);
      }
    };

    worker.onerror = (event) => {
      event.preventDefault();
      this.worker?.terminate();
      this.worker = null;

      const crash = new Error(event.message || 'The conversion worker stopped unexpectedly');
      for (const waiting of this.pending.values()) {
        waiting.reject(crash);
      }
      this.pending.clear();
    };

    this.worker = worker;
    return worker;
  }

  private ask(
    request: DistributiveOmit<WorkerRequest, 'id'>,
    transfer: Transferable[],
  ): Promise<WorkerResponse> {
    const id = this.nextId++;
    const worker = this.start();

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id }, transfer);
    });
  }

  /**
   * Converts a file. `data` is copied before it is sent, so the caller keeps its
   * original and can convert the same file again with other options.
   */
  async convert(data: ArrayBuffer, options: ConvertOptions): Promise<Converted> {
    const copy = data.slice(0);
    const response = await this.ask({ type: 'convert', data: copy, options }, [copy]);

    if (response.type === 'failed') {
      throw new ConversionError(response.stage, response.detail);
    }
    if (response.type !== 'converted') {
      throw new Error('Unexpected reply from the conversion worker');
    }

    return {
      bytes: new Uint8Array(response.bytes),
      inputSize: response.inputSize,
      entries: response.entries,
    };
  }

  /** The converted file as text, cut off at a length a page can show. */
  async preview(bytes: Uint8Array<ArrayBuffer>): Promise<{ text: string; truncated: boolean }> {
    const copy = bytes.slice().buffer;
    const response = await this.ask({ type: 'preview', data: copy }, [copy]);

    if (response.type === 'failed') {
      throw new ConversionError(response.stage, response.detail);
    }
    if (response.type !== 'preview') {
      throw new Error('Unexpected reply from the conversion worker');
    }

    return { text: response.text, truncated: response.truncated };
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;

    const gone = new Error('The converter was closed');
    for (const waiting of this.pending.values()) {
      waiting.reject(gone);
    }
    this.pending.clear();
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
