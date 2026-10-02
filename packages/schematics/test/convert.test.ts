import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, convertStructure, describeEntry } from '../src/convert/index.js';
import {
  getCompound,
  getList,
  getNumber,
  getString,
  isCompound,
  readNbt,
  writeNbt,
  type CompoundTag,
  type NbtFile,
  type Tag,
} from '../src/nbt/index.js';

const load = (name: string): NbtFile =>
  readNbt(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));

/** Every block entity (`blocks[].nbt`) of a structure. */
function blockEntities(root: CompoundTag): CompoundTag[] {
  const out: CompoundTag[] = [];
  for (const b of getList(root, 'blocks')?.v ?? []) {
    if (isCompound(b)) {
      const n = b.v.get('nbt');
      if (isCompound(n)) out.push(n);
    }
  }
  return out;
}
const byId = (root: CompoundTag, id: string) =>
  blockEntities(root).filter((n) => getString(n, 'id') === id);

/** Depth-first visit of every compound key/value pair below `tag`. */
function visit(tag: Tag, fn: (key: string, value: Tag, parent: CompoundTag) => void) {
  if (tag.t === 'compound') {
    for (const [k, v] of tag.v) {
      fn(k, v, tag);
      visit(v, fn);
    }
  } else if (tag.t === 'list') for (const x of tag.v) visit(x, fn);
}

describe.each(['building.nbt', 'create_structure.nbt'])('invariants for %s', (name) => {
  const { file, report } = convertStructure(load(name));
  const root = file.root;

  it('targets the 1.20.1 data version', () => {
    expect(getNumber(root, 'DataVersion')).toBe(3465);
  });

  it('leaves no 1.21 shaped data in block entities or entities', () => {
    const bad: string[] = [];
    visit(root, (k, v, parent) => {
      if (k === 'components') bad.push('components');
      if (k.startsWith('!')) bad.push(k);
      if (k === 'count' && parent.v.has('id')) bad.push('count');
      if (k === 'amount' && parent.v.has('id')) bad.push('amount');
    });
    for (const be of blockEntities(root)) {
      visit(be, (k, v) => {
        if (v.t === 'ints' && v.v.length === 3) bad.push(`blockpos int array at ${k}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('writes and re-reads without changes', () => {
    const again = readNbt(writeNbt(file));
    expect(again.root).toEqual(root);
  });

  it('produces no warnings except about unchecked mod blocks', () => {
    expect(report.warnings.map((w) => describeEntry(w))).toEqual([]);
  });
});

describe('building.nbt', () => {
  const { file, report } = convertStructure(load('building.nbt'));

  it('renames iron_chain to chain', () => {
    const names = (getList(file.root, 'palette')?.v ?? []).map((s) =>
      isCompound(s) ? getString(s, 'Name') : '',
    );
    expect(names).toContain('minecraft:chain');
    expect(names).not.toContain('minecraft:iron_chain');
  });

  it('turns sign messages into JSON text components', () => {
    const sign = byId(file.root, 'minecraft:sign')[0]!;
    const front = getCompound(sign, 'front_text')!;
    const messages = getList(front, 'messages')!.v.map((m) =>
      m.t === 'string' ? JSON.parse(m.v) : null,
    );
    expect(messages).toEqual([{ text: '' }, { text: 'placeholder' }, { text: '' }, { text: '' }]);
    expect(getString(front, 'color')).toBe('black');
    expect(sign.v.has('components')).toBe(false);
  });

  it('drops the polydecorations item_display entities', () => {
    expect(getList(file.root, 'entities')?.v).toHaveLength(0);
    expect(
      report.entries.find(
        (e) => e.code === 'entityDropped' && e.params?.id === 'minecraft:item_display',
      )?.count,
    ).toBe(81);
  });
});

describe('create_structure.nbt', () => {
  const { file } = convertStructure(load('create_structure.nbt'));
  const root = file.root;
  const first = (id: string) => byId(root, id)[0]!;

  it('converts kinetic Source to a {X,Y,Z} compound', () => {
    const src = getCompound(first('create:millstone'), 'Source')!;
    expect([getNumber(src, 'X'), getNumber(src, 'Y'), getNumber(src, 'Z')]).toEqual([
      576, 102, -156,
    ]);
  });

  it('converts multiblock controller references', () => {
    const vault = byId(root, 'create:item_vault').find((v) => v.v.has('Controller'))!;
    expect(getCompound(vault, 'Controller')?.v.has('X')).toBe(true);
    expect(getCompound(vault, 'LastKnownPos')?.v.has('Y')).toBe(true);
  });

  it('converts the redstone link frequency items and position', () => {
    const link = first('create:redstone_link');
    expect(getString(getCompound(link, 'FrequencyFirst')!, 'id')).toBe('minecraft:brick');
    expect(getNumber(getCompound(link, 'FrequencyFirst')!, 'Count')).toBe(1);
    expect(link.v.get('LastKnownPosition')?.t).toBe('long');
  });

  it('maps the millstone inventory onto input and output handlers', () => {
    const mill = byId(root, 'create:millstone').find(
      (m) => (getList(getCompound(m, 'InputInventory')!, 'Items')?.v.length ?? 0) > 0,
    )!;
    const item = getList(getCompound(mill, 'InputInventory')!, 'Items')!.v[0] as CompoundTag;
    expect(getString(item, 'id')).toBe('minecraft:cobblestone');
    expect(getNumber(item, 'Count')).toBe(64);
    expect(getNumber(item, 'Slot')).toBe(0);
    expect(mill.v.has('Inventory')).toBe(false);
  });

  it('maps the basin inventory and nests tank levels', () => {
    const basin = first('create:basin');
    const input = getList(getCompound(basin, 'InputItems')!, 'Items')!.v[0] as CompoundTag;
    expect(getString(input, 'id')).toBe('minecraft:brick');
    expect(getNumber(input, 'Count')).toBe(8);
    const tank = getList(basin, 'InputTanks')!.v[0] as CompoundTag;
    expect(getCompound(tank, 'Level')?.v.has('Speed')).toBe(true);
    expect(tank.v.has('Speed')).toBe(false);
  });

  it('uses upper case enum names and numeric directions', () => {
    const belt = byId(root, 'create:belt').find(
      (b) =>
        getCompound(b, 'Inventory')?.v.has('Items') &&
        (getList(getCompound(b, 'Inventory')!, 'Items')?.v.length ?? 0) > 0,
    )!;
    expect(['NONE', 'BRASS']).toContain(getString(belt, 'Casing'));
    const stack = getList(getCompound(belt, 'Inventory')!, 'Items')!.v[0] as CompoundTag;
    expect(stack.v.get('InDirection')?.t).toBe('int');
    const arm = first('create:mechanical_arm');
    expect(getString(arm, 'Phase')).toBe('SEARCH_INPUTS');
    expect(['TAKE', 'DEPOSIT']).toContain(
      getString(getList(arm, 'InteractionPoints')!.v[0] as CompoundTag, 'Mode'),
    );
    const tunnel = first('create:brass_tunnel');
    expect(getList(tunnel, 'Sides')!.of).toBe('int');
    expect(
      getList(tunnel, 'Filters')!.v.every((f) => (f as CompoundTag).v.get('Side')?.t === 'int'),
    ).toBe(true);
  });

  it('converts brass tunnel targets', () => {
    const withTarget = byId(root, 'create:brass_tunnel').find(
      (t) => (getList(t, 'Targets')?.v.length ?? 0) > 0,
    );
    if (!withTarget) return;
    const target = getList(withTarget, 'Targets')!.v[0] as CompoundTag;
    expect(getCompound(target, 'Pos')?.v.has('X')).toBe(true);
    expect(target.v.get('Face')?.t).toBe('int');
  });

  it('converts fluids to Porting-Lib variants', () => {
    const spout = first('create:spout');
    const content = getCompound(getList(spout, 'Tanks')!.v[0] as CompoundTag, 'TankContent')!;
    expect(getString(getCompound(content, 'Variant')!, 'fluid')).toBe('minecraft:lava');
    expect(content.v.get('Amount')).toEqual({ t: 'long', v: 81000n });
  });

  it('flattens pipe flows and open ends', () => {
    const pump = byId(root, 'create:mechanical_pump').find((p) =>
      getCompound(p, 'down')?.v.has('OpenEnd'),
    )!;
    const open = getCompound(getCompound(pump, 'down')!, 'OpenEnd')!;
    expect(getCompound(open, 'Variant')).toBeDefined();
    expect(getString(getCompound(open, 'Location')!, 'Face')).toBe('DOWN');
    const flow = getCompound(getCompound(pump, 'down')!, 'Flow')!;
    expect(flow.v.has('Fluid')).toBe(false);
    expect(flow.v.has('Variant')).toBe(true);
  });

  it('converts filter items into the 1.20.1 filter tag', () => {
    const funnel = byId(root, 'create:funnel').find(
      (f) =>
        getString(
          getCompound(f, 'Filter') ?? ({ v: new Map() } as unknown as CompoundTag),
          'id',
        ) === 'create:filter',
    )!;
    const filter = getCompound(funnel, 'Filter')!;
    expect(getNumber(filter, 'Count')).toBe(1);
    const tag = getCompound(filter, 'tag')!;
    const items = getList(getCompound(tag, 'Items')!, 'Items')!.v as CompoundTag[];
    expect(items.map((i) => getString(i, 'id'))).toEqual([
      'minecraft:flint',
      'minecraft:clay_ball',
    ]);
    expect(items.map((i) => getNumber(i, 'Slot'))).toEqual([0, 1]);
    expect(getNumber(tag, 'Blacklist')).toBe(0);
  });

  it('keeps dropped item entities in the 1.20.1 item format', () => {
    const entities = getList(root, 'entities')!.v as CompoundTag[];
    expect(entities).toHaveLength(6);
    const item = getCompound(getCompound(entities[0]!, 'nbt')!, 'Item')!;
    expect(item.v.has('Count')).toBe(true);
    expect(item.v.has('count')).toBe(false);
  });

  it('can drop kinetic state and entities on request', () => {
    const { file: f2 } = convertStructure(load('create_structure.nbt'), {
      ...DEFAULT_OPTIONS,
      dropKineticState: true,
      entities: 'drop',
    });
    const mill = byId(f2.root, 'create:millstone')[0]!;
    for (const k of ['Source', 'Network', 'Speed']) expect(mill.v.has(k)).toBe(false);
    expect(getList(f2.root, 'entities')!.v).toHaveLength(0);
  });

  it('does not mutate its input', () => {
    const input = load('create_structure.nbt');
    const before = writeNbt(input);
    convertStructure(input);
    expect(Buffer.from(writeNbt(input)).equals(Buffer.from(before))).toBe(true);
  });
});
