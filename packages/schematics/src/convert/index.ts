import {
  cloneTag,
  compound,
  getString,
  int,
  isCompound,
  isList,
  str,
  type CompoundTag,
  type NbtFile,
} from '../nbt/index.js';
import { convertModBlockEntity } from './create.js';
import { convertEntities } from './entities.js';
import { convertPalettes, modBlockNamespaces } from './palette.js';
import { Report } from './report.js';
import { DEFAULT_OPTIONS, TARGET_DATA_VERSION, type ConvertOptions, type Ctx } from './types.js';
import { convertVanillaBlockEntity } from './vanilla.js';

export { DEFAULT_OPTIONS, TARGET_DATA_VERSION };
export type { ConvertOptions };
export {
  REPORT_LEVELS,
  REPORT_TEMPLATES,
  Report,
  describeEntry,
  renderTemplate,
  type ReportCode,
  type ReportEntry,
  type ReportLevel,
  type ReportParamValues,
  type ReportParams,
} from './report.js';

export interface ConvertResult {
  file: NbtFile;
  report: Report;
}

function convertBlockEntity(nbt: CompoundTag, ctx: Ctx): CompoundTag | undefined {
  const id = getString(nbt, 'id');
  if (!id) {
    ctx.report.add('blockEntityWithoutId');
    return undefined;
  }
  const ns = id.split(':')[0];
  if (ns === 'minecraft') return convertVanillaBlockEntity(nbt, ctx);
  const keep =
    ns === 'create'
      ? ctx.opts.keepCreateBlockEntities
      : ctx.opts.otherModBlockEntities === 'convert';
  if (!keep) {
    ctx.report.add('blockEntityStripped', { id });
    return compound({ id: str(id) });
  }
  return convertModBlockEntity(nbt, ctx);
}

/** Converts a 1.21.11 structure / Create schematic into one that 1.20.1 (Create 6.0.8) can load. */
export function convertStructure(
  input: NbtFile,
  options: Partial<ConvertOptions> = {},
): ConvertResult {
  const ctx: Ctx = { opts: { ...DEFAULT_OPTIONS, ...options }, report: new Report() };
  const root = cloneTag(input.root);

  const oldVersion = root.v.get('DataVersion');
  root.v.set('DataVersion', int(TARGET_DATA_VERSION));
  if (oldVersion && 'v' in oldVersion) {
    ctx.report.add('dataVersion', { from: String(oldVersion.v), to: TARGET_DATA_VERSION });
  } else {
    ctx.report.add('dataVersionMissing', { to: TARGET_DATA_VERSION });
  }

  convertPalettes(root, ctx);

  const blocks = root.v.get('blocks');
  if (blocks && isList(blocks)) {
    for (const block of blocks.v) {
      if (!isCompound(block)) continue;
      const nbt = block.v.get('nbt');
      if (!nbt || !isCompound(nbt)) continue;
      const converted = convertBlockEntity(nbt, ctx);
      if (converted) block.v.set('nbt', converted);
      else block.v.delete('nbt');
    }
  }

  const entities = convertEntities(root.v.get('entities'), ctx);
  if (entities) root.v.set('entities', entities);

  for (const [ns, n] of modBlockNamespaces(root)) {
    if (ns !== 'create') ctx.report.add('modPalette', { namespace: ns, count: n });
  }

  return { file: { name: input.name, root }, report: ctx.report };
}
