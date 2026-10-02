import {
  cloneTag,
  compound,
  getCompound,
  getNumber,
  getString,
  long,
  str,
  type CompoundTag,
  type Tag,
} from '../nbt/index.js';

export function isFluidShaped(c: CompoundTag): boolean {
  const id = c.v.get('id');
  const amount = c.v.get('amount');
  return (
    id?.t === 'string' &&
    amount !== undefined &&
    !c.v.has('count') &&
    !c.v.has('Count') &&
    amount.t !== 'string'
  );
}

/**
 * 1.21.11 `{id, amount, components}` -> 1.20.1 Porting-Lib `{Variant:{fluid}, Amount}`.
 * Extra keys on the same compound (for example `In` or `Progress` on a pipe flow) are preserved.
 */
export function convertFluid(c: CompoundTag, passthrough: (k: string, v: Tag) => Tag): CompoundTag {
  const id = getString(c, 'id')!;
  const amount = getNumber(c, 'amount') ?? 0;
  const variant = compound({ fluid: str(id) });
  const tag = fluidTag(getCompound(c, 'components'));
  if (tag) variant.v.set('tag', cloneTag(tag));
  const out = new Map<string, Tag>();
  out.set('Variant', variant);
  out.set('Amount', long(BigInt(Math.trunc(amount))));
  if (tag) out.set('Tag', tag);
  for (const [k, v] of c.v) {
    if (k === 'id' || k === 'amount' || k === 'components') continue;
    out.set(k, passthrough(k, v));
  }
  return { t: 'compound', v: out };
}

/** Potion fluids carry their data in components in 1.21 and in a `Tag` compound in 1.20.1. */
function fluidTag(components: CompoundTag | undefined): CompoundTag | undefined {
  if (!components) return undefined;
  const out = new Map<string, Tag>();
  const potion = components.v.get('minecraft:potion_contents');
  const potionId =
    potion?.t === 'string'
      ? potion.v
      : potion?.t === 'compound'
        ? getString(potion, 'potion')
        : undefined;
  if (potionId) out.set('Potion', str(potionId));
  const bottle = components.v.get('create:potion_fluid_bottle_type');
  if (bottle?.t === 'string') out.set('Bottle', str(bottle.v.toUpperCase()));
  return out.size ? { t: 'compound', v: out } : undefined;
}
