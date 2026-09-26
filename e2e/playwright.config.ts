import { defineConfig, devices } from '@playwright/test';

/**
 * The origin only, not the app's subpath.
 *
 * Playwright resolves a navigation with `new URL(path, baseURL)`, and an
 * absolute path replaces the whole path of the base: with a baseURL of
 * `http://host/mc/link`, `goto('/dashboard')` lands on `http://host/dashboard`,
 * which is outside the app. Keeping the base an origin and writing the prefix
 * into every path is unambiguous, and it also means the tests assert that the
 * app really is mounted where the nginx config says it is.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3010';

/**
 * Browser tests against a running stack.
 *
 * They deliberately do not start the app themselves: this project is a compose
 * stack with a database and two containers, and reproducing that here would
 * duplicate the deployment. Bring it up with `docker compose up` and point
 * E2E_BASE_URL at the origin.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
