import {
  cloneTag,
  compound,
  double,
  getCompound,
  getList,
  getString,
  int,
  isCompound,
  isList,
  list,
  str,
  type CompoundTag,
  type Tag,
} from '../nbt/index.js';
import { DIRECTIONS, directionIndex } from './dirs.js';
import type { Ctx } from './types.js';
import { blockPosTag, walkTag } from './walk.js';

/**
 * Create block entity ids that are covered by the fixtures in `test/` and whose 1.20.1 `read()` was
 * compared against Create Fly's writer. Other ids are still converted by the generic rules but reported.
 */
export const VERIFIED_CREATE_BLOCK_ENTITIES = new Set([
  'basin',
  'belt',
  'blaze_heater',
  'bracketed_kinetic',
  'brass_tunnel',
  'clutch',
  'crushing_wheel',
  'crushing_wheel_controller',
  'depot',
  'drill',
  'encased_fan',
  'encased_shaft',
  'fluid_pipe',
  'fluid_tank',
  'funnel',
  'gearbox',
  'glass_fluid_pipe',
  'item_vault',
  'mechanical_arm',
  'mechanical_press',
  'mechanical_pump',
  'millstone',
  'powered_shaft',
  'redstone_link',
  'rotation_speed_controller',
  'spout',
  'steam_engine',
  'stockpile_switch',
]);

/**
 * Create Fly stores inventories as `Inventory: [stack, ...]` (usually with empty slots omitted).
 * 1.20.1 uses Porting-Lib's `ItemStackHandler`: `{Items: [{Slot, id, Count, tag}]}`.
 * `Size` is left out on purpose: the handler then keeps the size it was constructed with.
 */
function handler(stacks: Tag[], startSlot = 0): CompoundTag {
  const items: Tag[] = [];
  stacks.forEach((s, i) => {
    if (!isCompound(s) || s.v.size === 0) return; // empty slot
    const copy = cloneTag(s);
    copy.v.set('Slot', int(i + startSlot));
    items.push(copy);
  });
  return compound({ Items: list('compound', items) });
}

function takeList(c: CompoundTag, key: string): Tag[] | undefined {
  const l = getList(c, key);
  if (!l) return undefined;
  c.v.delete(key);
  return l.v;
}

type Fixer = (c: CompoundTag, ctx: Ctx) => void;

const FIXERS: Record<string, Fixer> = {
  millstone(c) {
    const inv = takeList(c, 'Inventory');
    if (!inv) return;
    // slot 0 is the input slot, everything after it are the output slots
    c.v.set('InputInventory', handler(inv.slice(0, 1)));
    c.v.set('OutputInventory', handler(inv.slice(1)));
  },
  crushing_wheel_controller(c) {
    const inv = takeList(c, 'Inventory');
    if (inv) c.v.set('Inventory', handler(inv));
  },
  depot(c) {
    const inv = takeList(c, 'Inventory');
    if (inv) c.v.set('OutputBuffer', handler(inv));
  },
  item_vault(c) {
    const inv = takeList(c, 'Inventory');
    if (inv) c.v.set('Inventory', handler(inv));
  },
  basin(c) {
    const inv = getCompound(c, 'Inventory');
    if (!inv) return;
    c.v.delete('Inventory');
    c.v.set('InputItems', handler(getList(inv, 'Input')?.v ?? []));
    c.v.set('OutputItems', handler(getList(inv, 'Output')?.v ?? []));
  },
  brass_tunnel(c) {
    for (const key of ['Targets', 'FilteredTargets']) {
      const l = getList(c, key);
      if (!l) continue;
      const v: Tag[] = [];
      for (const e of l.v) {
        if (!isCompound(e)) continue;
        const first = e.v.get('first');
        const second = e.v.get('second');
        const face = second?.t === 'string' ? directionIndex(second.v) : undefined;
        if (first?.t !== 'ints' || first.v.length !== 3 || face === undefined) continue;
        v.push(
          compound({ Pos: blockPosTag(first.v[0]!, first.v[1]!, first.v[2]!), Face: int(face) }),
        );
      }
      c.v.set(key, list('compound', v));
    }
  },
  fluid_tank(c) {
    const boiler = getCompound(c, 'Boiler');
    const supply = boiler?.v.get('Supply');
    if (boiler && supply && supply.t === 'float') boiler.v.set('Supply', double(supply.v));
  },
  powered_shaft() {
    // EngineType is a block id string in both versions; EnginePos is handled by the generic block position rule
  },
};

/** Fluid pipe connections: one compound per face with `Flow`, `OpenEnd` and `Pressure`. */
function fixPipeConnections(c: CompoundTag) {
  const flatten = (src: CompoundTag): Map<string, Tag> => {
    const out = new Map<string, Tag>();
    const fluid = getCompound(src, 'Fluid');
    if (fluid) for (const [k, v] of fluid.v) out.set(k, v);
    for (const [k, v] of src.v) if (k !== 'Fluid') out.set(k, v);
    return out;
  };
  for (const face of DIRECTIONS) {
    const conn = getCompound(c, face);
    if (!conn || !(conn.v.has('Flow') || conn.v.has('OpenEnd') || conn.v.has('Pressure'))) continue;
    const flow = getCompound(conn, 'Flow');
    if (flow) conn.v.set('Flow', { t: 'compound', v: flatten(flow) });
    const open = getCompound(conn, 'OpenEnd');
    if (open) {
      const flat = flatten(open);
      const dir = flat.get('Direction');
      flat.delete('Direction');
      // 1.20.1 only reads the face of `Location`; the position is replaced by the block entity's own
      flat.set(
        'Location',
        compound({
          Pos: blockPosTag(0, 0, 0),
          Face: str((dir?.t === 'string' ? dir.v : face).toUpperCase()),
        }),
      );
      conn.v.set('OpenEnd', { t: 'compound', v: flat });
    }
  }
}

/**
 * SmartFluidTankBehaviour: Create Fly writes the lerped fill level inline,
 * 1.20.1 nests it in a `Level` compound.
 */
function fixTankLists(c: CompoundTag) {
  for (const [key, value] of c.v) {
    if (!key.endsWith('Tanks') || !isList(value)) continue;
    const tanks: Tag[] = [];
    for (const t of value.v) {
      if (!isCompound(t)) continue;
      const out = new Map<string, Tag>();
      const level = new Map<string, Tag>();
      for (const [k, v] of t.v) {
        if (k === 'Value' || k === 'Target' || k === 'Speed' || k === 'Force') level.set(k, v);
        else out.set(k, v);
      }
      if (!out.has('TankContent')) out.set('TankContent', compound({}));
      out.set('Level', { t: 'compound', v: level });
      tanks.push({ t: 'compound', v: out });
    }
    c.v.set(key, list('compound', tanks));
  }
}

/** Generic fallback: any remaining `Inventory` list becomes an `ItemStackHandler` compound. */
function fixGenericInventory(c: CompoundTag) {
  const inv = getList(c, 'Inventory');
  if (inv) c.v.set('Inventory', handler(inv.v));
}

const KINETIC_STATE_KEYS = ['Source', 'Network', 'Speed', 'NeedsSpeedUpdate'];

/**
 * Converts one Create (or other mod) block entity. Returns `undefined` if it should be stripped.
 * The input is mutated.
 */
export function convertModBlockEntity(nbt: CompoundTag, ctx: Ctx): CompoundTag {
  const id = getString(nbt, 'id') ?? '';
  const [ns, name = ''] = id.split(':');
  const fixer = FIXERS[name];
  if (ns === 'create') {
    if (!fixer && !VERIFIED_CREATE_BLOCK_ENTITIES.has(name)) {
      ctx.report.add('createUnverified', { name });
    }
  } else {
    ctx.report.add('modBlockEntityUnverified', { id });
  }

  if (nbt.v.has('Sequence')) {
    nbt.v.delete('Sequence');
    ctx.report.add('sequenceDropped', { id });
  }
  if (ctx.opts.dropKineticState) for (const k of KINETIC_STATE_KEYS) nbt.v.delete(k);

  if (fixer && ns === 'create') fixer(nbt, ctx);
  fixPipeConnections(nbt);
  fixTankLists(nbt);
  fixGenericInventory(nbt);

  const out = walkTag(nbt, undefined, ctx, { blockPos: true }) as CompoundTag;
  ctx.report.add('blockEntityConverted', { id });
  return out;
}
