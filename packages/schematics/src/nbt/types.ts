/** Minimal typed NBT model. Every value keeps its exact NBT type so files round-trip losslessly. */
export type TagType =
  | 'end'
  | 'byte'
  | 'short'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'bytes'
  | 'string'
  | 'list'
  | 'compound'
  | 'ints'
  | 'longs';

export type Tag =
  | { t: 'byte' | 'short' | 'int' | 'float' | 'double'; v: number }
  | { t: 'long'; v: bigint }
  | { t: 'string'; v: string }
  | { t: 'bytes'; v: Int8Array }
  | { t: 'ints'; v: Int32Array }
  | { t: 'longs'; v: BigInt64Array }
  | { t: 'list'; of: TagType; v: Tag[] }
  | { t: 'compound'; v: Map<string, Tag> };

export type CompoundTag = Extract<Tag, { t: 'compound' }>;
export type ListTag = Extract<Tag, { t: 'list' }>;
export type StringTag = Extract<Tag, { t: 'string' }>;

export const TAG_IDS: TagType[] = [
  'end',
  'byte',
  'short',
  'int',
  'long',
  'float',
  'double',
  'bytes',
  'string',
  'list',
  'compound',
  'ints',
  'longs',
];

/** The root of an NBT file: a named compound. */
export interface NbtFile {
  name: string;
  root: CompoundTag;
}
