import type { CompoundTag, ListTag, Tag, TagType } from './types.js';

export const byte = (v: number): Tag => ({ t: 'byte', v });
export const short = (v: number): Tag => ({ t: 'short', v });
export const int = (v: number): Tag => ({ t: 'int', v });
export const long = (v: bigint): Tag => ({ t: 'long', v });
export const float = (v: number): Tag => ({ t: 'float', v });
export const double = (v: number): Tag => ({ t: 'double', v });
export const str = (v: string): Tag => ({ t: 'string', v });
export const bool = (v: boolean): Tag => byte(v ? 1 : 0);

export function compound(entries: Record<string, Tag> | Map<string, Tag> = {}): CompoundTag {
  return { t: 'compound', v: entries instanceof Map ? entries : new Map(Object.entries(entries)) };
}

export function list(of: TagType, v: Tag[] = []): ListTag {
  return { t: 'list', of, v };
}

/** A list whose element type is inferred (empty lists get the `end` type, like vanilla). */
export function listOf(v: Tag[]): ListTag {
  return { t: 'list', of: v[0]?.t ?? 'end', v };
}

export const isCompound = (t: Tag | undefined): t is CompoundTag => t?.t === 'compound';
export const isList = (t: Tag | undefined): t is ListTag => t?.t === 'list';
export const isString = (t: Tag | undefined): t is Extract<Tag, { t: 'string' }> =>
  t?.t === 'string';
export const isNumeric = (
  t: Tag | undefined,
): t is Extract<Tag, { t: 'byte' | 'short' | 'int' | 'float' | 'double' }> =>
  t !== undefined &&
  (t.t === 'byte' || t.t === 'short' || t.t === 'int' || t.t === 'float' || t.t === 'double');

export function getString(c: CompoundTag, key: string): string | undefined {
  const t = c.v.get(key);
  return t?.t === 'string' ? t.v : undefined;
}

export function getNumber(c: CompoundTag, key: string): number | undefined {
  const t = c.v.get(key);
  if (!t) return undefined;
  if (t.t === 'long') return Number(t.v);
  return isNumeric(t) ? t.v : undefined;
}

export function getCompound(c: CompoundTag, key: string): CompoundTag | undefined {
  const t = c.v.get(key);
  return isCompound(t) ? t : undefined;
}

export function getList(c: CompoundTag, key: string): ListTag | undefined {
  const t = c.v.get(key);
  return isList(t) ? t : undefined;
}

export function cloneTag<T extends Tag>(tag: T): T {
  switch (tag.t) {
    case 'compound': {
      const m = new Map<string, Tag>();
      for (const [k, v] of tag.v) m.set(k, cloneTag(v));
      return { t: 'compound', v: m } as T;
    }
    case 'list':
      return { t: 'list', of: tag.of, v: tag.v.map((x) => cloneTag(x)) } as T;
    case 'bytes':
      return { t: 'bytes', v: tag.v.slice() } as T;
    case 'ints':
      return { t: 'ints', v: tag.v.slice() } as T;
    case 'longs':
      return { t: 'longs', v: tag.v.slice() } as T;
    default:
      return { ...tag } as T;
  }
}
