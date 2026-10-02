import {
  byte,
  compound,
  getCompound,
  getList,
  getNumber,
  getString,
  int,
  isCompound,
  isList,
  list,
  str,
  type CompoundTag,
  type Tag,
} from '../nbt/index.js';
import { textToJson } from './text.js';
import type { Ctx } from './types.js';
import { walkTag } from './walk.js';

const CONTAINERS = new Set([
  'minecraft:chest',
  'minecraft:trapped_chest',
  'minecraft:barrel',
  'minecraft:hopper',
  'minecraft:dropper',
  'minecraft:dispenser',
  'minecraft:shulker_box',
  'minecraft:furnace',
  'minecraft:blast_furnace',
  'minecraft:smoker',
  'minecraft:brewing_stand',
]);

const SIGNS = new Set(['minecraft:sign', 'minecraft:hanging_sign']);

const blankMessage = () => str('{"text":""}');

function convertSignSide(side: CompoundTag | undefined, keepText: boolean): CompoundTag {
  const messages: Tag[] = [];
  const src = side && keepText ? getList(side, 'messages') : undefined;
  for (let i = 0; i < 4; i++) {
    const m = src?.v[i];
    messages.push(m ? str(textToJson(m)) : blankMessage());
  }
  return compound({
    messages: list('string', messages),
    color: str((side && getString(side, 'color')) || 'black'),
    has_glowing_text: byte(side && getNumber(side, 'has_glowing_text') ? 1 : 0),
  });
}

/**
 * Vanilla block entities are reduced to the minimum 1.20.1 can read. Block entity data is not
 * needed for the build to work, and the formats of text components and item stacks changed.
 */
export function convertVanillaBlockEntity(nbt: CompoundTag, ctx: Ctx): CompoundTag {
  const id = getString(nbt, 'id')!;
  const out = compound({ id: str(id) });

  if (SIGNS.has(id)) {
    const keep = ctx.opts.keepSignText;
    out.v.set('is_waxed', byte(getNumber(nbt, 'is_waxed') ? 1 : 0));
    out.v.set('front_text', convertSignSide(getCompound(nbt, 'front_text'), keep));
    out.v.set('back_text', convertSignSide(getCompound(nbt, 'back_text'), keep));
    ctx.report.add(keep ? 'signConverted' : 'signReset', { id });
    return out;
  }

  if (CONTAINERS.has(id) && ctx.opts.keepVanillaContainerItems) {
    const items = nbt.v.get('Items');
    if (items && isList(items)) {
      const converted = items.v
        .filter(isCompound)
        .map((e) => walkTag(e, undefined, ctx, { blockPos: false }));
      out.v.set('Items', list('compound', converted));
    }
    if (id === 'minecraft:hopper' && nbt.v.has('TransferCooldown')) {
      out.v.set('TransferCooldown', int(getNumber(nbt, 'TransferCooldown') ?? -1));
    }
    ctx.report.add('containerKept', { id });
    return out;
  }

  ctx.report.add('blockEntityStripped', { id });
  return out;
}
