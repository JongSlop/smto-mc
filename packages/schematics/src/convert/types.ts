import type { Report } from './report.js';

export interface ConvertOptions {
  /** Keep (and convert) NBT of `create:*` block entities. Disabling strips them down to `{id}`. */
  keepCreateBlockEntities: boolean;
  /** What to do with block entities from other mods: convert generically, or strip to `{id}`. */
  otherModBlockEntities: 'convert' | 'strip';
  /** Keep the contents of vanilla containers (chests, hoppers, ...). */
  keepVanillaContainerItems: boolean;
  /** Convert sign text instead of blanking it. */
  keepSignText: boolean;
  /** Drop kinetic runtime state (Source/Network/Speed). Create recomputes it after placement. */
  dropKineticState: boolean;
  /** `convert` keeps dropped items; `drop` removes every entity. */
  entities: 'convert' | 'drop';
  /** Unknown vanilla blocks are only reported by default; `air` replaces them. */
  unknownBlocks: 'keep' | 'air';
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  keepCreateBlockEntities: true,
  otherModBlockEntities: 'convert',
  keepVanillaContainerItems: true,
  keepSignText: true,
  dropKineticState: false,
  entities: 'convert',
  unknownBlocks: 'keep',
};

export interface Ctx {
  opts: ConvertOptions;
  report: Report;
}

export const TARGET_DATA_VERSION = 3465; // Minecraft 1.20.1
