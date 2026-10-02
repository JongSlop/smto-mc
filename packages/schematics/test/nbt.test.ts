import { readFileSync } from 'node:fs';
import { gunzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readNbt, writeNbtRaw } from '../src/nbt/index.js';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe('nbt reader/writer', () => {
  for (const name of ['building.nbt', 'create_structure.nbt']) {
    it(`round-trips ${name} byte for byte`, () => {
      const data = fixture(name);
      const parsed = readNbt(data);
      const rewritten = writeNbtRaw(parsed);
      expect(Buffer.from(rewritten).equals(Buffer.from(gunzipSync(data)))).toBe(true);
    });
  }
});
