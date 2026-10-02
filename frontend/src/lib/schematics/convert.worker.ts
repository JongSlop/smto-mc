/// <reference lib="webworker" />
import { convertStructure, readNbt, toSnbt, writeNbt } from '@smto/mc-schematics';

import { PREVIEW_MAX_CHARS, type WorkerRequest, type WorkerResponse } from './protocol';

/**
 * The conversion, off the main thread.
 *
 * Reading, converting and compressing a large structure takes seconds, and on
 * the page's own thread that is seconds of a frozen tab with a button that does
 * not press. Here it costs nothing the person can feel. The worker is stateless:
 * every request carries everything it needs, so a crash or a restart loses
 * nothing and requests cannot interfere with each other.
 */

function reply(message: WorkerResponse, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

function detailOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'convert') {
    const input = new Uint8Array(request.data);

    let parsed;
    try {
      parsed = readNbt(input);
    } catch (cause) {
      reply({ type: 'failed', id: request.id, stage: 'read', detail: detailOf(cause) });
      return;
    }

    try {
      const { file, report } = convertStructure(parsed, request.options);
      const bytes = writeNbt(file);
      // Copied into a buffer of exactly its own size: gzip hands back a view
      // onto a larger one, and transferring that would send the slack along.
      const exact = bytes.slice().buffer;

      reply(
        {
          type: 'converted',
          id: request.id,
          bytes: exact,
          inputSize: input.byteLength,
          entries: report.entries,
        },
        [exact],
      );
    } catch (cause) {
      reply({ type: 'failed', id: request.id, stage: 'convert', detail: detailOf(cause) });
    }
    return;
  }

  // A preview is the converted file read back and dumped as text, which is both
  // what the person is going to download and the cheapest way to get it here.
  try {
    const text = toSnbt(readNbt(new Uint8Array(request.data)).root, 0, 50);
    const truncated = text.length > PREVIEW_MAX_CHARS;
    reply({
      type: 'preview',
      id: request.id,
      text: truncated ? text.slice(0, PREVIEW_MAX_CHARS) : text,
      truncated,
    });
  } catch (cause) {
    reply({ type: 'failed', id: request.id, stage: 'read', detail: detailOf(cause) });
  }
};
