import {
  cloneTag,
  getCompound,
  getString,
  isCompound,
  list,
  type CompoundTag,
  type Tag,
} from '../nbt/index.js';
import type { Ctx } from './types.js';
import { walkTag } from './walk.js';

/**
 * Only plain dropped items are carried over. Everything else (display entities, item frames, paintings,
 * armor stands, ...) changed format or needs data 1.20.1 does not have, and is dropped.
 */
const KEPT_ENTITIES = new Set(['minecraft:item']);

export function convertEntities(entities: Tag | undefined, ctx: Ctx): Tag | undefined {
  if (!entities || entities.t !== 'list') return entities;
  const kept: Tag[] = [];
  for (const e of entities.v) {
    if (!isCompound(e)) continue;
    const nbt = getCompound(e, 'nbt');
    const id = nbt ? getString(nbt, 'id') : undefined;
    if (ctx.opts.entities === 'drop' || !nbt || !id || !KEPT_ENTITIES.has(id)) {
      if (id) ctx.report.add('entityDropped', { id });
      else ctx.report.add('entityDroppedUnknown');
      continue;
    }
    const copy = cloneTag(e) as CompoundTag;
    copy.v.set('nbt', walkTag(getCompound(copy, 'nbt')!, undefined, ctx, { blockPos: false }));
    kept.push(copy);
    ctx.report.add('entityKept', { id });
  }
  return list(kept.length ? 'compound' : entities.of, kept);
}
