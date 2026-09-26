# Observer

Links a Minecraft profile to a smto.dev account, collects playtime and other
statistics from the network's servers, and shows them back to the player.

The service is called Observer in everything a person sees. The repository,
package and image identifiers are still `smto-account-mc-link` and `@smto/mc-*`,
because those are wired into nginx, GHCR and the deploy.

Served at `https://smto.dev/mc/link/`, alongside the account system at
`/account/`, which it signs people in with.

## What it does

- **Sign in** with a smto.dev account, and nothing else. This service is an
  OAuth client of `../smto-account-system`.
- **Link a Minecraft profile**, two ways, both of which prove the profile is
  really the person's:
  - a Microsoft account, through the same Xbox Live chain the launcher uses;
  - a code typed in chat on any smto.dev server, which are all online mode, so
    Mojang has already done the checking.
- **Show the statistics**, per server, with the player's skin rendered in 3D.
- **Take statistics from the plugins** over a token-authenticated API that does
  not need changing when a plugin starts recording something new.
- **Serve server metadata** publicly and unauthenticated, and let an admin edit
  it. This is what eventually replaces the hand-edited `pack-*.json` files the
  launcher reads today.

## Layout

```
packages/contracts/   @smto/mc-contracts, zod schemas shared by both apps
backend/              NestJS 11, Prisma 7, Postgres 18
frontend/             SvelteKit 2, Svelte 5, Paraglide (en/de)
e2e/                  Playwright
docker/               images for the two apps
docs/                 api.md, deploy.md, security.md, nginx-snippet.conf
```

The shape mirrors `../smto-account-system` deliberately, down to the conventions
and the tooling, so that anybody who has worked on one can read the other.

## Running it locally

```bash
pnpm install
cp .env.example .env      # fill in the secrets, see docs/deploy.md
docker compose up --build # postgres, backend:3011, frontend:3010
```

Then open `http://localhost:3010/mc/link/`.

Signing in needs an OAuth client registered at the account system pointing at
your local redirect URI. `docs/deploy.md` walks through it. Without one, the
public pages still work and the whole plugin API can be exercised with `curl`.

Without `MSA_CLIENT_SECRET` the Microsoft linking path is switched off and the
site offers only the in-game code. That is a supported way to run this.

## Working on it

```bash
pnpm build         # contracts first, then both apps
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm test:browser  # needs a running stack, see e2e/playwright.config.ts
```

`pnpm build` before `pnpm typecheck` on a clean checkout: both apps import the
compiled contracts, and `svelte-check` reads the Paraglide output the frontend
build emits.

Backend tests need a database:

```bash
createdb smto_mc_link_test
DATABASE_URL=postgresql://smto:smto@127.0.0.1:5434/smto_mc_link_test \
  pnpm --filter @smto/mc-backend exec prisma migrate deploy
pnpm --filter @smto/mc-backend test:e2e
```

Use `migrate deploy` rather than `db push`. The migration creates partial unique
indexes that the schema language cannot express, and the linking tests depend on
them.

## For plugin authors

`docs/api.md` is the contract, and Swagger at `/mc/link/api/docs` is the
interactive version of it. The Minecraft plugin lives outside this repository;
these routes do not change without that document changing first.

The short version: issue one token per server in the admin area, then

```bash
curl -X POST https://smto.dev/mc/link/api/v1/ingest/metrics \
  -H "X-Api-Key: smtomc_..." -H 'content-type: application/json' \
  -d '{"serverId":"i5","entries":[
        {"uuid":"069a79f4-...","metric":"playtime_seconds","value":7200},
        {"uuid":"069a79f4-...","metric":"deaths","value":12}]}'
```

One route for every statistic, playtime included. Send running totals, not
deltas; the write is idempotent.

## Notes worth reading before changing things

- `docs/security.md` explains why the credentials are stored the way they are,
  and why the linking rules are what they are.
- The launcher's `state` enum is closed. Adding a fourth value makes servers
  disappear from installed launchers with no visible error. See
  `packages/contracts/src/server.ts`.
- UUIDs are the identity, everywhere. Usernames, both smto.dev and Minecraft
  ones, are released and handed on, and are only ever a display cache here.
