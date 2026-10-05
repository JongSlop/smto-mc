import 'reflect-metadata';

/**
 * The suite drives real HTTP against a real Postgres. Nothing here is mocked
 * except the two identity providers, which are not reachable from CI and are
 * not what these tests are about.
 */
process.env.NODE_ENV ??= 'test';

// One address makes every request in the suite, so the rate limiter would spend
// most of the run refusing us. Only honoured outside production, see AppModule.
process.env.THROTTLE_DISABLED = '1';

process.env.DATABASE_URL ??= 'postgresql://smto:smto@127.0.0.1:5434/smto_mc_link_test';
process.env.PUBLIC_ORIGIN ??= 'http://localhost:3010';
process.env.OIDC_ISSUER ??= 'https://smto.dev/account/oauth';
process.env.OIDC_CLIENT_ID ??= 'smto-mc-link-test';
process.env.OIDC_CLIENT_SECRET ??= 'test-secret';

// 32 bytes, base64. Test-only, and it never encrypts anything real here.
process.env.SESSION_ENC_KEY ??= Buffer.alloc(32, 7).toString('base64');

// Empty means the Microsoft path is switched off, which is what these tests
// want: the chain talks to Microsoft, Xbox Live and Mojang, none of which
// belong in a test suite.
process.env.MSA_CLIENT_SECRET ??= '';

// Hard assignment rather than a default, unlike everything above: the uploader
// is a live service, and minting against it creates real accounts and burns
// real credentials. A `.env` sitting next to the repo must not be able to point
// a test run at it, so the address here is one that cannot resolve and the one
// spec that exercises the call stubs `fetch` before making it.
//
// Set here rather than in that spec because ConfigModule.forRoot() reads the
// environment when app.module.ts is imported, which is before any hook runs.
process.env.UPLOADER_BASE_URL = 'https://uploader.invalid';
process.env.UPLOADER_API_KEY = 'test-key';
