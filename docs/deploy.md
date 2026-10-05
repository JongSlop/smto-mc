# Deploying

The stack is three containers: Postgres, the Nest backend on `127.0.0.1:3011`
and the SvelteKit server on `127.0.0.1:3010`, behind the existing nginx on
`smto.dev`. Ports 3010 and 3011 rather than 3000 and 3001, so this and the
account system can share a host.

## Before the first deploy

### 1. Register the OAuth client

At `https://smto.dev/account/admin/oauth-clients`:

| Field        | Value                                                |
| ------------ | ---------------------------------------------------- |
| Client id    | `smto-mc-link`                                       |
| Type         | confidential, `client_secret_basic`                  |
| PKCE         | required, S256 (the provider insists on this anyway) |
| Grants       | `authorization_code`, `refresh_token`                |
| Scopes       | `openid profile email roles offline_access`          |
| Redirect URI | `https://mc.smto.dev/auth/callback`             |
| Post-logout  | `https://mc.smto.dev/`                          |
| Skip consent | off                                                  |

Redirect URIs are matched exactly, with no wildcards, so these strings and
`PUBLIC_ORIGIN` have to agree character for character.

`offline_access` is not optional. Without a refresh token a session dies after
an hour and, worse, this service loses the only way it has to notice that
somebody was disabled or demoted over there.

The secret is shown once. Put it in `OIDC_CLIENT_SECRET`.

The post-logout redirect has to be registered too, or logging out fails:
node-oidc-provider refuses any `post_logout_redirect_uri` that is not on the
client, the same way it refuses an unregistered redirect URI
(`lib/actions/end_session.js`). It also has to match
`OIDC_POST_LOGOUT_REDIRECT_URI` here character for character, trailing slash
included.

That field is new on the account system side, so it only appears in their admin
UI once they are deployed with the migration that added it
(`20260926150000_client_post_logout_redirects`). Until then leave
`OIDC_POST_LOGOUT_REDIRECT_URI` empty. Logging out then ends the session here and
revokes our refresh token, and leaves their single sign-on cookie alone, so the
next sign-in does not ask for a password again.

### 1b. Wire up logout, both directions

Two settings, and skipping either leaves a logout that does not log out.

On the client row in `https://smto.dev/account/admin/oauth-clients`:

| Field                                | Value                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| Post-logout redirect URI             | `https://mc.smto.dev/`                               |
| Back-channel logout URI              | `https://mc.smto.dev/api/v1/auth/backchannel-logout` |
| Back-channel logout session required | on                                                        |

In this service's `.env`:

```
OIDC_POST_LOGOUT_REDIRECT_URI=https://mc.smto.dev/
```

The account system also needs `features.backchannelLogout` enabled on its
provider, and its own page logout has to end the provider session, or a logout
on the account pages still leaves every relying party signed in.

Two halves of it can be checked without signing in at all:

```bash
# The provider accepts our post-logout URI, and only ours
curl -sI "https://smto.dev/account/oauth/session/end?client_id=smto-mc-link\
&post_logout_redirect_uri=https%3A%2F%2Fsmto.dev%2Fmc%2Flink%2F" | head -1   # 200
curl -s "https://smto.dev/account/oauth/session/end?client_id=smto-mc-link\
&post_logout_redirect_uri=https%3A%2F%2Fevil.example%2F" | grep -o 'not registered'

# Our endpoint exists and refuses nonsense
curl -s -X POST -d 'logout_token=not-a-token' \
  https://mc.smto.dev/api/v1/auth/backchannel-logout                    # 400
```

The rest needs a person: sign in, sign out on the account pages, and reload the
dashboard here. It should send you back to the start. Without the back-channel
half registered, the session survives until its own expiry instead.

### 2. Add a Web platform to the launcher's Azure app

Only needed for the Microsoft linking path. Leaving `MSA_CLIENT_SECRET` empty
switches that path off and the website offers only the in-game code, which is a
supported way to run this.

In the Azure portal, on the **existing** registration
`d28a75f9-769f-4bd1-aa82-9791e38c6f67`:

- Add a **Web** platform with redirect URI
  `https://mc.smto.dev/link/msa/callback`.
- Leave the launcher's existing mobile/desktop loopback client alone. One
  registration holds both.
- Create a client secret and put it in `MSA_CLIENT_SECRET`.

**Reuse this registration rather than creating a new one.** The Minecraft API
permission (`XboxLive.signin`) is granted per application and takes weeks to
months to obtain. A fresh app would have to go through that again and the
Microsoft path could not ship until it did.

### 3. Fill in `.env`

Copy `.env.example` and fill it in. The two you have to generate:

```bash
openssl rand -base64 32   # SESSION_ENC_KEY
openssl rand -base64 32   # POSTGRES_PASSWORD
```

`PUBLIC_ORIGIN=https://mc.smto.dev`, no trailing slash. Every redirect URI
is built from it.

### 4. Point at the uploader, if it is running

`UPLOADER_BASE_URL` is the uploader's origin and `UPLOADER_API_KEY` is the same
shared key its in-game commands use. With both set, players get a **Services**
menu in the header with an Audio and a Video entry: pressing either asks the
uploader for a one time sign in link for their linked Minecraft profile and
sends the browser straight there, on the matching library tab. That is the same
`intent` parameter the in-game commands append.

The link also carries `logoutUrl`, built from `PUBLIC_ORIGIN`, so signing out
of the uploader lands the player back on this service rather than on a signed
out page with nothing pointing home. Leave either empty and the menu is not rendered at all.

The key mints a session for any player it is asked about, so it is a root
credential over there. It stays in this file, it is read only by the backend,
and it never reaches a browser: the browser only ever sees the single use link
that comes back, which dies on first use and expires in minutes anyway. If it
leaks, rotate it on both sides at once.

Players need a linked Minecraft profile to use this, because the UUID is what
the uploader keys its accounts on.

### 5. nginx

Add the two locations from `docs/nginx-snippet.conf` to the `smto.dev` server
block and reload. Read the comments in it: the API prefix is stripped and the
app prefix is kept, and the two are not interchangeable.

Both locations set `client_max_body_size 12m`, and that number has a partner:
the frontend container sets `BODY_SIZE_LIMIT: 12M` because adapter-node refuses
anything over 512 kB by default. Server images are uploaded through the admin
area at up to 8 MiB each, so raising one of the two without the other just
moves which layer says no.

## Deploying

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The backend's entrypoint runs `prisma migrate deploy` and then the seed on every
start. The seed only ever acts on an **empty** server table: one row, `i5`, so
a fresh deployment is not blank. If the table has anything in it the seed does
nothing at all, which is what makes deleting a server in the admin area stick
rather than coming back at the next deploy.

Servers are added through the admin area as they start reporting. The packs
that have not been integrated yet are still described by the launcher's own
JSON at `https://smto.dev/mc/launcher/v2/pack-<id>.json`, which is where to
copy their metadata from.

Watchtower picks up new images from GHCR on its own, the same as the account
system's.

It runs `ghcr.io/nicholas-fedor/watchtower`, a maintained fork, and not
`containrrr/watchtower`, which has had no release since 2023. The original
speaks Docker API 1.25 and every engine from 25 on refuses anything below 1.40,
so it ends up in a restart loop logging `client version 1.25 is too old` and
quietly updating nothing at all. Worth checking after an engine upgrade:

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep watchtower   # not "Restarting"
docker logs --tail 20 smto-mc-link-watchtower-1
```

## Checking it worked

```bash
# The backend is up and can reach its database
curl -s https://mc.smto.dev/api/v1/public/servers | jq '.[] | {id, state}'

# The frontend is up and knows its base path
curl -sI https://mc.smto.dev/ | head -1

# Swagger renders
curl -sI https://mc.smto.dev/api/docs | head -1
```

Then sign in through the website once. If the login round trips and lands on the
dashboard, the client registration, the redirect URI, the secret and the cookie
path are all correct, which is most of what can go wrong.

## Things that will bite

**The redirect URI does not match.** The account system rejects it outright.
Check `PUBLIC_ORIGIN` for a trailing slash.

**Cookies from the account system arriving here, or the other way round.** They
should not. Their cookies are scoped to `/account` and ours to `/`,
deliberately, because several services share `smto.dev`. If a cookie ever shows
up on the wrong path, something set `path=/` and it needs fixing rather than
working around.

**`post_logout_redirect_uri not registered` on logout.**
`OIDC_POST_LOGOUT_REDIRECT_URI` is set to something the client does not carry in
its post-logout redirect URIs. Check for a missing trailing slash, and check the
account system is deployed with the migration that added the field. Emptying the
variable is the way out in the meantime: logout then stops at this service.

**`no_refresh_token` on login.** Check the client registration first: it needs
the `refresh_token` grant and the `offline_access` scope.

If both are already set, the cause is on our side and it fails silently. OIDC
Core section 11 says a provider must ignore `offline_access` unless the request
carries `prompt=consent`, and node-oidc-provider enforces that by deleting the
scope from the request before anything else sees it
(`lib/actions/authorization/check_scope.js`). The authorization then succeeds,
the ID token verifies, and the token response just has no refresh token in it.
`OidcClientService.authorizeUrl` sends `prompt=consent` for exactly this
reason; if somebody removes it as a way to skip the consent screen, this error
comes straight back.

**The launcher's pack JSON.** This deploy does not touch
`https://smto.dev/mc/launcher/v2/*.json`. They are still hand-edited files. The
metadata API exists and the admin UI edits it, but nothing reads it yet. After
deploying, running `cargo test` in `../smto-launcher-v2` confirms the nginx
changes did not disturb those paths: two of its tests hit the live endpoints and
assert every pack still resolves.

## Backups

One volume, `postgres-data`. Everything except the skin cache is worth keeping,
and the skin cache rebuilds itself one fetch at a time.

Images uploaded for a server are in there too, as rows rather than files, which
is the reason there is no second volume to remember. It also means a restore
brings the images back with the metadata that points at them, and that a dump
is as big as the images are.

```bash
docker compose exec postgres pg_dump -U smto smto_mc_link | gzip > mc-link-$(date +%F).sql.gz
```
