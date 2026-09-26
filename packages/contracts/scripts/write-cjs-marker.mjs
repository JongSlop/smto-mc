import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The package is ESM by default, so the CommonJS build needs its own marker or
// Node treats those .js files as ES modules and refuses to require them.
const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'dist', 'cjs', 'package.json');

writeFileSync(target, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
