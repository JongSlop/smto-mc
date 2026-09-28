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
| Redirect URI | `https://smto.dev/mc/link/auth/callback`             |
| Post-logout  | `https://smto.dev/mc/link/`                          |
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

### 2. Add a Web platform to the launcher's Azure app

Only needed for the Microsoft linking path. Leaving `MSA_CLIENT_SECRET` empty
switches that path off and the website offers only the in-game code, which is a
supported way to run this.

In the Azure portal, on the **existing** registration
`d28a75f9-769f-4bd1-aa82-9791e38c6f67`:

- Add a **Web** platform with redirect URI
  `https://smto.dev/mc/link/link/msa/callback`.
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

`PUBLIC_ORIGIN=https://smto.dev/mc/link`, no trailing slash. Every redirect URI
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
start. The seed fills an empty server list and leaves existing rows alone, so it
never pushes the checked-in defaults back over an admin's edits.

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
curl -s https://smto.dev/mc/link/api/v1/public/servers | jq '.[] | {id, state}'

# The frontend is up and knows its base path
curl -sI https://smto.dev/mc/link/ | head -1

# Swagger renders
curl -sI https://smto.dev/mc/link/api/docs | head -1
```

Then sign in through the website once. If the login round trips and lands on the
dashboard, the client registration, the redirect URI, the secret and the cookie
path are all correct, which is most of what can go wrong.

## Things that will bite

**The redirect URI does not match.** The account system rejects it outright.
Check `PUBLIC_ORIGIN` for a trailing slash.

**Cookies from the account system arriving here, or the other way round.** They
should not. Their cookies are scoped to `/account` and ours to `/mc/link`,
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
