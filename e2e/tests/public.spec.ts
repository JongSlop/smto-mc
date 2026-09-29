import { expect, test } from '@playwright/test';

/** The subpath the app is mounted at, matching svelte.config.js and nginx. */
const APP = '/mc/link';

/**
 * What a visitor who is not signed in can see.
 *
 * Everything past the sign in button needs a real smto.dev account and a real
 * authorization at the account system, which is not something a CI run can do
 * on its own. The signed-in paths are covered by the backend suite, which
 * exercises the same endpoints these pages call.
 */
test.describe('anonymous', () => {
  test('the landing page offers a sign in and says what this is for', async ({ page }) => {
    await page.goto(`${APP}/`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|anmelden/i }).first()).toBeVisible();
    // The three things somebody gets for signing in. No server list any more:
    // the servers are behind the header dropdown, which needs a session.
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
    await expect(page.getByText('Laced Pack')).toHaveCount(0);
  });

  test('a server page renders without a session', async ({ page }) => {
    // There is no server index any more: the header dropdown is the way in, and
    // it only exists for somebody signed in. The pages themselves stay public,
    // which is what makes one worth linking to.
    await page.goto(`${APP}/servers/i5`);

    await expect(page.getByRole('heading', { level: 1, name: 'Laced Pack' })).toBeVisible();
    // Seeded from the live pack JSON, and the one thing a player came for.
    await expect(page.getByText('i5.smto.dev')).toBeVisible();
    // Statistics need a session, so this half asks for one instead.
    await expect(
      page.getByRole('link', { name: /link a profile|profil verbinden/i }),
    ).toBeVisible();
  });

  test('the archive renders, and says so when nothing is archived', async ({ page }) => {
    // Public like the server pages themselves. The header entry that points
    // here needs a session, the page does not.
    await page.goto(`${APP}/servers/archived`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The seed creates i5 and nothing else, and i5 is running, so this page has
    // nothing to list and has to say that rather than render an empty box.
    await expect(page.getByRole('link', { name: /Laced Pack/ })).toHaveCount(0);
    await expect(page.getByText(/nothing has been archived/i)).toBeVisible();
  });

  test('an unknown server is a 404, not an empty page', async ({ page }) => {
    const response = await page.goto(`${APP}/servers/not-a-server`);

    expect(response?.status()).toBe(404);
  });

  test('the dashboard sends a signed out visitor back to the start', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);

    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
  });

  test('a leaderboard tab is an address, not client state', async ({ page }) => {
    // Signed out this redirects, which is enough to prove the parameter is
    // carried through the load rather than being lost on the way.
    await page.goto(`${APP}/leaderboards?metric=blocks_mined`);

    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
  });

  test('a leaderboard server filter is an address too', async ({ page }) => {
    // Signed out this redirects as well. The narrowed view itself is covered by
    // the backend suite, which is where the ranking rules live.
    await page.goto(`${APP}/leaderboards?metric=deaths&server=i5`);

    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
  });

  test('the leaderboards need a session', async ({ page }) => {
    // The boards pair a name with someone's playtime, so they sit behind a
    // credential rather than on the open web.
    await page.goto(`${APP}/leaderboards`);

    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
  });

  test('a player page needs a session, with or without a server filter', async ({ page }) => {
    // A profile pairs a name with everything somebody has done, so it sits
    // behind the same credential as the boards that link to it.
    await page.goto(`${APP}/players/069a79f4-44e9-4726-a5be-fca90e38aaf5?server=i5`);

    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
  });

  test('the admin area is closed', async ({ page }) => {
    await page.goto(`${APP}/admin/servers`);

    // Signed out lands back on the landing page. There is no admin page here
    // either way; the backend refuses the calls regardless of what renders.
    await expect(page).toHaveURL(new RegExp(`${APP}/?$`));
  });

  test('the language switch applies on the click, not on the next reload', async ({ page }) => {
    await page.goto(`${APP}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Clicking, rather than navigating to ?lang= directly. The direct
    // navigation is a full page load and always worked; the click is what was
    // broken, because a client side navigation re-rendered neither the cached
    // layout data nor the <html lang> attribute the server injects.
    await page.getByRole('link', { name: 'Deutsch' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ein Konto für alle Server');

    // The parameter is stripped by the redirect, so the cookie is what carries
    // the choice from here on.
    await expect(page).not.toHaveURL(/lang=/);

    await page.getByRole('link', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('a skin is served from our own origin as a real PNG', async ({ request }) => {
    // The 3D renderer reads these pixels off a canvas, which only works
    // same-origin, and a serialised Buffer under an image/png header would look
    // fine here right up until it did not render.
    const response = await request.get(
      `${APP}/api/v1/public/skins/069a79f4-44e9-4726-a5be-fca90e38aaf5.png`,
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');

    const body = await response.body();
    expect(body.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  test('an unknown page is a 404 rather than a crash', async ({ page }) => {
    const response = await page.goto(`${APP}/nonsense`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
