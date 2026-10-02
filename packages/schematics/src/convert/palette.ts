import { getString, isCompound, isList, str, type CompoundTag, type Tag } from '../nbt/index.js';
import { BLOCKS_1_20_1 } from './data/blocks-1.20.1.js';
import type { Ctx } from './types.js';

const KNOWN_BLOCKS = new Set<string>(BLOCKS_1_20_1);

/** Blocks that were renamed between 1.20.1 and 1.21.11 (new name -> 1.20.1 name). */
export const BLOCK_DOWNGRADES: Record<string, string> = {
  'minecraft:iron_chain': 'minecraft:chain', // renamed in 1.21.9
  'minecraft:short_grass': 'minecraft:grass', // renamed in 1.20.3
};

function convertState(state: CompoundTag, ctx: Ctx) {
  const name = getString(state, 'Name');
  if (!name) return;
  const renamed = BLOCK_DOWNGRADES[name];
  if (renamed) {
    state.v.set('Name', str(renamed));
    ctx.report.add('blockRenamed', { from: name, to: renamed });
    return;
  }
  if (name.startsWith('minecraft:') && !KNOWN_BLOCKS.has(name)) {
    if (ctx.opts.unknownBlocks === 'air') {
      state.v.set('Name', str('minecraft:air'));
      state.v.delete('Properties');
      ctx.report.add('blockMissingReplaced', { name });
    } else {
      ctx.report.add('blockMissingKept', { name });
    }
  }
}

export function convertPalettes(root: CompoundTag, ctx: Ctx) {
  const handle = (palette: Tag) => {
    if (!isList(palette)) return;
    for (const s of palette.v) if (isCompound(s)) convertState(s, ctx);
  };
  const palette = root.v.get('palette');
  if (palette) handle(palette);
  const palettes = root.v.get('palettes');
  if (palettes && isList(palettes)) for (const p of palettes.v) handle(p);
}

/** Names of every non-vanilla block in the palette, for the report. */
export function modBlockNamespaces(root: CompoundTag): Map<string, number> {
  const out = new Map<string, number>();
  const palette = root.v.get('palette');
  if (!palette || !isList(palette)) return out;
  for (const s of palette.v) {
    if (!isCompound(s)) continue;
    const ns = (getString(s, 'Name') ?? '').split(':')[0] ?? '';
    if (ns && ns !== 'minecraft') out.set(ns, (out.get(ns) ?? 0) + 1);
  }
  return out;
}
