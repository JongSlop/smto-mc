# Schematic converter

Converts structure files and Create schematics from Minecraft 1.21.11 (Create
Fly) to 1.20.1 (Create Fabric 6.0.8), at `/services/schematics`, under Services
in the header.

The two versions share the vanilla structure format, so a new file fails to
load on the old game wherever a data structure changed between them: sign text,
item stacks, fluid stacks, block positions, and a long tail of Create block
entities. The converter rewrites those to what 1.20.1 can read, and says what it
did.

It started life as a standalone tool (`schem-conv-v2`) and was moved in here
with its conversion rules untouched. Run on the two real fixtures, with each
option switched on its own and with all of them together, the output is byte for
byte what the standalone tool produced.

## Nothing is uploaded

Everything happens in the visitor's browser. The page reads the file, hands it
to a Web Worker, and offers the result as a download. No request carries the
file, there is no backend route for it, and the page needs no account, which is
why it is public like the server pages. The header entry only appears for
somebody signed in, because the whole Services menu does.

The worker matters. Reading, converting and compressing a large structure takes
seconds (a two million block, 6.7 MB file took about six), and on the page's own
thread that is a frozen tab. In the worker the page stays responsive: during that
conversion the longest the main thread stalled was 26 ms.

## Where things are

| Path                                             | What it is                                                  |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `packages/schematics/src/nbt/`                   | NBT reader and writer, with exact types so files round trip |
| `packages/schematics/src/convert/`               | The conversion rules, one file per kind of data             |
| `packages/schematics/src/convert/report.ts`      | What the converter tells the person, as codes               |
| `packages/schematics/src/cli.ts`                 | Command line, for scripting and for trying a file           |
| `packages/schematics/test/`                      | Tests, with two real structures in `fixtures/`              |
| `frontend/src/lib/schematics/`                   | Worker, its client, and the page's state                    |
| `frontend/src/routes/(app)/services/schematics/` | The page                                                    |

The package is plain TypeScript with no framework in it. The frontend imports
its compiled output, so build it first (`pnpm build` does, in the right order).

## Command line

```bash
pnpm --filter @smto/mc-schematics convert path/to/in.nbt [out.nbt] [--no-sign-text ...]
```

Without an output path it writes `in.1.20.1.nbt` next to the input. `--help`
lists the options, which are the ones on the page.

## What is not converted

Block entity data is the part that cannot always survive. By design:

- **Dropped:** Sequenced Gearshift programs, the matched attributes of Attribute
  Filters, data components on block entities and entities, and every entity
  except plain dropped items.
- **Reduced:** most vanilla block entities keep only their id. Signs and
  container contents are kept, rewritten into the old formats.
- **Converted but unverified:** Create block entities not listed in
  `VERIFIED_CREATE_BLOCK_ENTITIES`, and any other mod's, are run through the
  generic rules and flagged as warnings in the report.

Blocks that do not exist in 1.20.1 are reported, and load as air whether or not
"replace with air" is ticked; the option only makes the file say so.

## The report, and its two languages

The converter does not write sentences. Each line of the report is a code with
parameters (`blockRenamed` with `from` and `to`), because the page shows it in
German and English and a sentence built inside the converter could only be one.

The English wording lives in `REPORT_TEMPLATES` in `report.ts`, and is what the
command line prints. The page has its own copy of every template under
`schematics_report_<code>` in `frontend/messages/en.json` and `de.json`.

**To add a message:** add the code to `REPORT_TEMPLATES`, `REPORT_LEVELS` and
`ReportParams` in `report.ts` (the compiler refuses a half done one), call
`ctx.report.add('yourCode', { ... })`, then add the key to both message files.
`packages/schematics/test/report.test.ts` fails if either language is missing,
if the English differs from the template, or if the German lost a placeholder.

A level of `warn` means "somebody should look at this". Use it sparingly: the
page keeps warnings on show and folds the rest away, so a warning that is always
there stops being read.

## Adding rules for another Create block entity

1. Add a fixer to `FIXERS` in `convert/create.ts` if its data needs more than the
   generic rules (inventories, nested positions and fluid tanks are already
   handled generically).
2. Put a real structure containing it in `test/fixtures/` and assert on the shape
   1.20.1 reads, in `test/convert.test.ts`. Compare against what Create Fabric's
   `read()` expects rather than against what looks plausible.
3. Only then add its name to `VERIFIED_CREATE_BLOCK_ENTITIES`, which is what
   stops it being reported as unverified.

## The block list

`src/convert/data/blocks-1.20.1.ts` is every vanilla block id in 1.20.1, used to
flag blocks that would load as air. It is generated and committed; it only needs
regenerating if the target version changes. `minecraft-data` is several hundred
megabytes, so it is not a dependency of the workspace. Install it somewhere
disposable and point the script at it:

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null && npm install minecraft-data
MINECRAFT_DATA="$PWD/node_modules/minecraft-data" pnpm --filter @smto/mc-schematics gen:blocks
```

## Limits

- Files over 64 MiB are turned away before they are read (`MAX_INPUT_BYTES`). A
  gzip file can expand a hundredfold, and everything happens in the tab.
- Changing an option while a very large file is converting queues another
  conversion behind it, because the worker cannot be interrupted part way; the
  first result is discarded when it arrives.
- Nothing is saved. Reloading the page forgets the files.
