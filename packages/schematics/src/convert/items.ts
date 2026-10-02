import {
  bool,
  byte,
  compound,
  getCompound,
  getNumber,
  getString,
  int,
  isCompound,
  isList,
  isNumeric,
  list,
  listOf,
  short,
  str,
  type CompoundTag,
  type Tag,
} from '../nbt/index.js';
import { textToJson } from './text.js';
import type { Ctx } from './types.js';

/** 1.21 item stack: `{id, count, components}`; 1.20.1: `{id, Count, tag}`. */
export function isItemShaped(c: CompoundTag): boolean {
  const id = c.v.get('id');
  const count = c.v.get('count');
  return id?.t === 'string' && isNumeric(count) && !c.v.has('Count') && !c.v.has('amount');
}

/** Item filter whitelist modes in 1.20.1 order (stored as an ordinal). */
const WHITELIST_MODES = ['whitelist_conj', 'whitelist_disj', 'blacklist'];

export function convertItem(c: CompoundTag, ctx: Ctx): CompoundTag {
  const out = new Map<string, Tag>();
  const count = getNumber(c, 'count') ?? 1;
  const id = getString(c, 'id')!;
  for (const [k, v] of c.v) {
    if (k === 'id') out.set('id', v);
    else if (k === 'count') out.set('Count', byte(Math.max(0, Math.min(127, Math.trunc(count)))));
    else if (k === 'components') continue;
    else out.set(k, v); // e.g. `Slot`
  }
  const tag = componentsToTag(getCompound(c, 'components'), id, ctx);
  if (tag && tag.v.size > 0) out.set('tag', tag);
  // Keep `id`, `Count`, `tag` in the conventional order
  const ordered = new Map<string, Tag>();
  for (const k of ['id', 'Count', 'tag']) if (out.has(k)) ordered.set(k, out.get(k)!);
  for (const [k, v] of out) if (!ordered.has(k)) ordered.set(k, v);
  return { t: 'compound', v: ordered };
}

export const emptyItem = (): CompoundTag => compound({ id: str('minecraft:air'), Count: byte(0) });

function enchantments(c: CompoundTag): Tag | undefined {
  const levels = getCompound(c, 'levels') ?? c;
  const entries: Tag[] = [];
  for (const [k, v] of levels.v) {
    if (k === 'show_in_tooltip' || !isNumeric(v)) continue;
    entries.push(compound({ id: str(k), lvl: short(v.v) }));
  }
  return entries.length ? listOf(entries) : undefined;
}

function itemContainerToHandler(contents: Tag, ctx: Ctx): CompoundTag | undefined {
  if (!isList(contents)) return undefined;
  const items: Tag[] = [];
  for (const entry of contents.v) {
    if (!isCompound(entry)) continue;
    const item = getCompound(entry, 'item');
    const slot = getNumber(entry, 'slot') ?? items.length;
    if (!item || !isItemShaped(item)) continue;
    const converted = convertItem(item, ctx);
    converted.v.set('Slot', int(slot));
    items.push(converted);
  }
  return compound({ Size: int(18), Items: list('compound', items) });
}

/** Converts 1.21 item data components to the 1.20.1 `tag` compound. Unknown components are dropped and reported. */
export function componentsToTag(
  components: CompoundTag | undefined,
  itemId: string,
  ctx: Ctx,
): CompoundTag | undefined {
  if (!components) return undefined;
  const tag = new Map<string, Tag>();
  const display = new Map<string, Tag>();
  const drop = (name: string) => ctx.report.add('droppedItemComponent', { name });

  for (const [name, v] of components.v) {
    if (name.startsWith('!')) continue; // component removal markers
    switch (name) {
      case 'minecraft:custom_data':
        if (isCompound(v)) for (const [k, x] of v.v) tag.set(k, x);
        break;
      case 'minecraft:damage':
        if (isNumeric(v)) tag.set('Damage', int(v.v));
        break;
      case 'minecraft:repair_cost':
        if (isNumeric(v)) tag.set('RepairCost', int(v.v));
        break;
      case 'minecraft:unbreakable':
        tag.set('Unbreakable', byte(1));
        break;
      case 'minecraft:custom_name':
        display.set('Name', str(textToJson(v)));
        break;
      case 'minecraft:lore':
        if (isList(v))
          display.set(
            'Lore',
            list(
              'string',
              v.v.map((x) => str(textToJson(x))),
            ),
          );
        break;
      case 'minecraft:dyed_color': {
        const rgb = isNumeric(v) ? v.v : isCompound(v) ? getNumber(v, 'rgb') : undefined;
        if (rgb !== undefined) display.set('color', int(rgb));
        break;
      }
      case 'minecraft:enchantments':
      case 'minecraft:stored_enchantments': {
        if (!isCompound(v)) break;
        const e = enchantments(v);
        if (e)
          tag.set(name === 'minecraft:enchantments' ? 'Enchantments' : 'StoredEnchantments', e);
        break;
      }
      case 'minecraft:potion_contents': {
        const potion = v.t === 'string' ? v.v : isCompound(v) ? getString(v, 'potion') : undefined;
        if (potion) tag.set('Potion', str(potion));
        break;
      }
      // Create
      case 'create:filter_items': {
        const handler = itemContainerToHandler(v, ctx);
        if (handler) tag.set('Items', handler);
        break;
      }
      case 'create:filter_items_respect_nbt':
        if (isNumeric(v)) tag.set('RespectNBT', bool(v.v !== 0));
        break;
      case 'create:filter_items_blacklist':
        if (isNumeric(v)) tag.set('Blacklist', bool(v.v !== 0));
        break;
      case 'create:attribute_filter_whitelist_mode': {
        const idx =
          v.t === 'string' ? WHITELIST_MODES.indexOf(v.v.toLowerCase()) : isNumeric(v) ? v.v : -1;
        if (idx >= 0) tag.set('WhitelistMode', int(idx));
        break;
      }
      case 'create:attribute_filter_matched_attributes':
        ctx.report.add('attributeFilterDropped', { item: itemId });
        break;
      case 'create:package_address':
        if (v.t === 'string') tag.set('Address', v);
        break;
      default:
        drop(name);
    }
  }
  if (display.size) tag.set('display', { t: 'compound', v: display });
  return tag.size ? { t: 'compound', v: tag } : undefined;
}
