#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  DEFAULT_OPTIONS,
  convertStructure,
  describeEntry,
  type ConvertOptions,
} from './convert/index.js';
import { readNbt, toSnbt, writeNbt } from './nbt/index.js';

const USAGE = `Usage: pnpm --filter @smto/mc-schematics convert <input.nbt> [output.nbt] [options]

Converts a 1.21.11 (Create Fly) structure/schematic to 1.20.1 (Create Fabric 6.0.8).

Options:
  --strip-create-be        Strip Create block entities to {id}
  --strip-mod-be           Strip block entities from other mods
  --no-container-items     Drop vanilla container contents
  --no-sign-text           Blank signs instead of converting their text
  --drop-kinetic-state     Drop Source/Network/Speed (Create recomputes them)
  --no-entities            Drop all entities
  --unknown-blocks-air     Replace vanilla blocks that do not exist in 1.20.1 with air
  --dump                   Print the converted NBT as text
`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0 || flags.has('--help')) {
  console.log(USAGE);
  process.exit(files.length === 0 ? 1 : 0);
}

const input = files[0]!;
const output = files[1] ?? input.replace(/(\.nbt)?$/, '.1.20.1.nbt');
const options: ConvertOptions = {
  ...DEFAULT_OPTIONS,
  keepCreateBlockEntities: !flags.has('--strip-create-be'),
  otherModBlockEntities: flags.has('--strip-mod-be') ? 'strip' : 'convert',
  keepVanillaContainerItems: !flags.has('--no-container-items'),
  keepSignText: !flags.has('--no-sign-text'),
  dropKineticState: flags.has('--drop-kinetic-state'),
  entities: flags.has('--no-entities') ? 'drop' : 'convert',
  unknownBlocks: flags.has('--unknown-blocks-air') ? 'air' : 'keep',
};

const { file, report } = convertStructure(readNbt(new Uint8Array(readFileSync(input))), options);
writeFileSync(output, writeNbt(file));
if (flags.has('--dump')) console.log(toSnbt(file.root));

console.log(`${basename(input)} -> ${output}`);
for (const e of report.entries) {
  console.log(
    `${e.level === 'warn' ? 'WARN' : 'info'}  ${e.count > 1 ? `${e.count}x ` : ''}${describeEntry(e)}`,
  );
}
