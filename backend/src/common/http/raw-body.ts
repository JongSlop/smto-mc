import { PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads a request body as bytes, with a ceiling.
 *
 * Nest's body parsers only claim JSON and form encodings, so an `image/png`
 * request arrives here untouched and the stream is ours to read. That is the
 * whole reason uploads are sent as a raw body rather than as multipart: no
 * extra dependency, no temporary files on disk, and one obvious place where
 * the size limit is enforced.
 *
 * The limit is applied while reading rather than afterwards, so an oversized
 * upload is cut off at the ceiling instead of being buffered in full first.
 */
export async function readRawBody(request: Request, limit: number): Promise<Buffer> {
  const declared = Number(request.headers['content-length'] ?? 0);

  // A truthful content-length lets us refuse before reading anything at all.
  // A lying one is caught by the running total below.
  if (Number.isFinite(declared) && declared > limit) {
    throw new PayloadTooLargeException('asset_too_large');
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;

    if (size > limit) {
      request.destroy();
      throw new PayloadTooLargeException('asset_too_large');
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
