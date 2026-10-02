import {
  compound,
  int,
  listOf,
  long,
  str,
  type CompoundTag,
  type ListTag,
  type Tag,
} from '../nbt/index.js';
import { directionIndex } from './dirs.js';
import { convertFluid, isFluidShaped } from './fluids.js';
import { convertItem, isItemShaped } from './items.js';
import type { Ctx } from './types.js';

export interface WalkOptions {
  /** Convert `[I;x,y,z]` arrays into `{X,Y,Z}` compounds (block entities only; entities use UUID int arrays). */
  blockPos: boolean;
}

/** Enums written with `NBTHelper.writeEnum` use `Enum.name()` in 1.20.1 (upper case); Create Fly writes lower case. */
const UPPERCASE_ENUM_KEYS = new Set([
  'Casing',
  'Dye',
  'Mode',
  'Phase',
  'StackEnteredFrom',
  'PreferredSpoutput',
]);
/** Strings holding a Direction that 1.20.1 stores as a 3D data value. */
const DIRECTION_INT_KEYS = new Set(['InDirection', 'Side']);
const UPPERCASE_LIST_KEYS = new Set(['DisabledSpoutput']);
const DIRECTION_INT_LIST_KEYS = new Set(['Flaps', 'Sides']);
/** Keys that 1.20.1 stores as `BlockPos.asLong()` instead of a block position compound. */
const LONG_POS_KEYS = new Set(['LastKnownPosition']);

export const blockPosTag = (x: number, y: number, z: number): CompoundTag =>
  compound({ X: int(x), Y: int(y), Z: int(z) });

/** `BlockPos.asLong()` */
export function packBlockPos(x: number, y: number, z: number): bigint {
  const m26 = 0x3ffffffn;
  const v = ((BigInt(x) & m26) << 38n) | ((BigInt(z) & m26) << 12n) | (BigInt(y) & 0xfffn);
  return BigInt.asIntN(64, v);
}

export function walkTag(tag: Tag, key: string | undefined, ctx: Ctx, o: WalkOptions): Tag {
  switch (tag.t) {
    case 'compound':
      return walkCompound(tag, ctx, o);
    case 'list':
      return walkList(tag, key, ctx, o);
    case 'ints':
      if (o.blockPos && tag.v.length === 3) {
        const [x, y, z] = tag.v as unknown as [number, number, number];
        if (key && LONG_POS_KEYS.has(key)) return long(packBlockPos(x, y, z));
        if (key) ctx.report.add('blockPosConverted', { key });
        else ctx.report.add('blockPosConvertedInList');
        return blockPosTag(x, y, z);
      }
      return tag;
    case 'string':
      if (key && UPPERCASE_ENUM_KEYS.has(key)) return str(tag.v.toUpperCase());
      if (key && DIRECTION_INT_KEYS.has(key)) {
        const i = directionIndex(tag.v);
        if (i !== undefined) return int(i);
      }
      return tag;
    default:
      return tag;
  }
}

function walkCompound(c: CompoundTag, ctx: Ctx, o: WalkOptions): CompoundTag {
  if (isItemShaped(c)) {
    // Convert the stack first, then walk any extra keys it carried
    const converted = convertItem(c, ctx);
    ctx.report.add('itemsConverted');
    return converted;
  }
  if (isFluidShaped(c)) {
    ctx.report.add('fluidsConverted');
    return convertFluid(c, (k, v) => walkTag(v, k, ctx, o));
  }
  const out = new Map<string, Tag>();
  for (const [k, v] of c.v) {
    if (k.startsWith('!')) continue;
    if (k === 'components') {
      ctx.report.add('componentsDropped');
      continue;
    }
    out.set(k, walkTag(v, k, ctx, o));
  }
  return { t: 'compound', v: out };
}

function walkList(l: ListTag, key: string | undefined, ctx: Ctx, o: WalkOptions): ListTag {
  if (l.of === 'string' && key) {
    if (UPPERCASE_LIST_KEYS.has(key))
      return {
        t: 'list',
        of: 'string',
        v: l.v.map((x) => (x.t === 'string' ? str(x.v.toUpperCase()) : x)),
      };
    if (DIRECTION_INT_LIST_KEYS.has(key)) {
      const ints: Tag[] = [];
      for (const x of l.v) {
        const i = x.t === 'string' ? directionIndex(x.v) : undefined;
        if (i !== undefined) ints.push(int(i));
      }
      return { t: 'list', of: 'int', v: ints };
    }
  }
  if (l.of === 'compound' || l.of === 'list' || l.of === 'ints') {
    const v = l.v.map((x) => walkTag(x, key, ctx, o));
    return v.length ? listOf(v) : l;
  }
  return l;
}
