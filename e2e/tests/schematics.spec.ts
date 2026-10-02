import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { getList, getNumber, readNbt } from '@smto/mc-schematics';
import { expect, test, type Page } from '@playwright/test';

/** The subpath the app is mounted at, matching svelte.config.js and nginx. */
const APP = '/mc/link';

/**
 * Opens the converter and waits until it can take a file.
 *
 * Choosing a file the instant the page has loaded races the script that listens
 * for it: the server-rendered input exists first, and a change event fired into
 * that gap goes nowhere. The page marks the drop zone once it is listening.
 */
async function openConverter(page: Page, language?: 'de'): Promise<void> {
  await page.goto(`${APP}/services/schematics${language ? `?lang=${language}` : ''}`);
  await expect(page.locator('.drop[data-ready="true"]')).toBeAttached();
}

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../packages/schematics/test/fixtures/${name}`, import.meta.url));

/**
 * The schematic converter.
 *
 * It runs entirely in the browser and needs no account, so unlike most of the
 * site it can be driven all the way through here: a real file goes into the real
 * input, the worker converts it, and the download that comes out is read back
 * and checked to be what it claims to be.
 */
test.describe('schematic converter', () => {
  test('renders without a session, with its drop zone and options', async ({ page }) => {
    await openConverter(page);

    await expect(page.getByRole('heading', { level: 1, name: /schematic/i })).toBeVisible();
    await expect(page.locator('input[type=file]')).toBeAttached();
    // Seven switches, and the two that are off by default are really off.
    await expect(page.getByRole('checkbox')).toHaveCount(7);
    await expect(page.getByLabel(/drop kinetic state|kinetischen zustand/i)).not.toBeChecked();
    await expect(page.getByLabel(/convert sign text|schildtext umwandeln/i)).toBeChecked();
  });

  test('converts a Create schematic and hands back a 1.20.1 file', async ({ page }) => {
    await openConverter(page);

    await page.locator('input[type=file]').setInputFiles(fixture('create_structure.nbt'));

    await expect(
      page.getByRole('heading', { level: 3, name: 'create_structure.nbt' }),
    ).toBeVisible();
    const download = page.getByRole('button', { name: /download converted file|herunterladen/i });
    await expect(download).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.report')).toBeVisible();

    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toBe('create_structure-1.20.1.nbt');

    const path = await file.path();
    const converted = readNbt(new Uint8Array(gunzipSync(readFileSync(path))));

    // 3465 is Minecraft 1.20.1, and the blocks survived the trip.
    expect(getNumber(converted.root, 'DataVersion')).toBe(3465);
    expect(getList(converted.root, 'blocks')?.v.length).toBeGreaterThan(0);
  });

  test('converts again when an option changes, and the change reaches the file', async ({
    page,
  }) => {
    await openConverter(page);
    await page.locator('input[type=file]').setInputFiles(fixture('building.nbt'));

    const download = page.getByRole('button', { name: /download converted file|herunterladen/i });
    await expect(download).toBeVisible({ timeout: 30_000 });

    // Ticked: the signs keep their text. Unticked: they are blank. The report line
    // for it flips with the option, which is the visible proof that it ran again.
    await expect(page.getByText(/converted minecraft:sign text/i)).toBeVisible();
    await page.getByLabel(/convert sign text|schildtext umwandeln/i).uncheck();

    await expect(page.getByText(/reset minecraft:sign text/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/converted minecraft:sign text/i)).toHaveCount(0);
  });

  test('says so, in the page’s language, when a file is not NBT at all', async ({ page }) => {
    await openConverter(page, 'de');

    await page.locator('input[type=file]').setInputFiles({
      name: 'notes.nbt',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('this is not nbt'),
    });

    await expect(page.getByRole('alert')).toContainText('lässt sich nicht als NBT lesen');
    await expect(page.getByRole('button', { name: /herunterladen/i })).toHaveCount(0);
  });

  test('removing a file clears it from the page', async ({ page }) => {
    await openConverter(page);
    await page.locator('input[type=file]').setInputFiles(fixture('building.nbt'));
    await expect(page.getByRole('heading', { level: 3, name: 'building.nbt' })).toBeVisible();

    await page.getByRole('button', { name: /^(remove|entfernen)$/i }).click();

    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(0);
  });
});
