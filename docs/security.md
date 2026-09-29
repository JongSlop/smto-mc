# Security notes

What this service protects and how. Written for whoever has to change it later.

## What is actually at stake

Two things, and they are not equally important.

**A link is an identity claim.** If somebody can attach another player's UUID to
their own account, they inherit that player's statistics and, once rewards
exist, whatever those statistics are worth. Every rule below about linking
exists for that.

**Statistics are worth lying about.** A plugin token is a bearer secret sitting
in a server's config file. The scoping rules exist so that one leaking is a
contained problem rather than a network-wide one.

There is very little personal data here. This service stores an account UUID, a
Minecraft UUID, a cached display name and playtime numbers. It never sees a
password, and it never stores anything from Microsoft.

## Credentials

| Credential                          | Stored as   | Why                                                                         |
| ----------------------------------- | ----------- | --------------------------------------------------------------------------- |
| Session token                       | SHA-256     | 256 random bits, nothing to brute force, and it is checked on every request |
| Plugin API token                    | SHA-256     | Same, and nothing ever needs the plaintext back                             |
| Account system refresh token        | AES-256-GCM | We do have to send this one back to them, so it cannot be hashed            |
| Microsoft / Xbox / Minecraft tokens | not stored  | Read the profile once, discard everything                                   |
| Uploader API key                    | .env only   | Their shared key, read by the backend, never sent to a browser              |

`SecretCipherService` is for the refresh token and nothing else. If something
new needs to be readable again, that is worth arguing about before it gets a
second caller.

## Sessions

The browser holds one cookie, `smto_mc_session`: HttpOnly, `SameSite=Lax`,
`Secure` outside dev, and scoped to `path=/mc/link`.

**The path scope is not cosmetic.** Several services share `smto.dev`. The
account system scopes its cookies to `/account` for exactly this reason and this
service does the same. A cookie at `/` would be sent to every other service on
the domain.

Sessions are resolved server side only. No page ever holds a token in
JavaScript, so an XSS bug in a page cannot walk off with one.

### Revocation

The account system is the source of truth for who somebody is and what they may
do, and we cannot read its database. Instead, `SessionService` refreshes against
it at most every `ROLE_REFRESH_MINUTES` (15 by default) and rewrites the cached
roles from what comes back. Their provider refuses to issue anything for a
disabled or email-unverified account, so a disabled account turns into a clean
401 here within that window.

That window is the honest answer to "how fast does a demotion take effect". It
is a tradeoff: shorter means more traffic to the account system on every page
view. Fifteen minutes is short enough that an admin who was just demoted does
not keep the admin pages for an afternoon.

Their refresh tokens rotate on every use and a replay kills the whole family, so
the rotated value is written back inside the same transaction as the account
update. A crash between the two would otherwise leave a session holding a token
the account system has already retired.

## Logging out

Three things have to happen for a logout to mean what people assume it means,
and they are separate mechanisms.

**Logging out here** ends the session row and revokes the refresh token, then
sends the browser to the account system's `end_session_endpoint` so its own
session ends too. That last step only happens when
`OIDC_POST_LOGOUT_REDIRECT_URI` is set and registered on the client; with it
empty, signing out here and signing straight back in never asks for a password,
because the provider still holds a session and answers the next authorize
silently.

**Logging out over there** reaches us through OpenID Connect Back-Channel
Logout. The provider posts a signed logout token to
`/api/v1/auth/backchannel-logout` and we delete the sessions it names. Nothing
else would work: our session holds an `offline_access` refresh token, which by
design keeps working while the person is away, so no amount of re-checking on
our side would notice that their browser session is over.

The endpoint is public because the token is the credential. It is verified
against the provider's keys, must name this client in `aud`, must carry the
`http://schemas.openid.net/event/backchannel-logout` event, and must **not**
carry a `nonce`. That last rule is the one doing the security work: without it,
an ID token from a real login could be posted here as though it were a logout
instruction, and it would pass everything else.

Sessions carry the provider's `sid`, so a logout takes out the one browser it
happened in rather than every device the person is signed in on. A token with
both `sid` and `sub` is matched on both, so one client's session id can never
end another account's session.

The exception is a session opened before the provider was asked to send a
`sid`, which has none stored. Those rows cannot be told apart, so any logout
for that account takes them: a logout that silently misses is worse than one
that also closes a second tab. They stop appearing as soon as everybody has
signed in once since the back-channel URI was registered. Token ids are remembered for five minutes to
refuse a replay, which matters little on its own since deleting a deleted
session does nothing, and costs nothing.

## Authorization flows

Two flows, both authorization code with PKCE S256, and both with the same shape.

**Nothing security-relevant is parked in the browser.** The PKCE verifier, the
expected `state` and the nonce live in `auth_transactions`, keyed by the `state`
that comes back in the redirect. Rows are single use: `consume()` deletes as it
reads, and it deletes before validating the rest, so even a rejected callback
burns the row.

The MSA flow takes the account id from that row rather than from whoever holds
the session when the callback arrives. Otherwise a callback replayed into a
second browser would attach the profile to the wrong account.

**Starting a login is a POST.** A GET that redirects to an identity provider can
be triggered by any page that can load an image, which is how login CSRF works.
Coming through a form post means the origin check has already run.

**Redirect targets are never taken from the caller.** `returnTo` is validated to
be a path inside this app and stored server side; the post-logout redirect comes
from `OIDC_POST_LOGOUT_REDIRECT_URI`. Either one accepted from a request would be
an open redirect wearing our domain.

## The two linking paths

They are equally trustworthy, for different reasons.

**In-game code.** Every smto.dev server runs in online mode, so Mojang's session
server verified the player before they could type anything in chat. This service
verifies nothing itself; it only checks that the code came from the account that
asked for it, recently, once. That is why `link:redeem` belongs only to tokens
held by servers we run: the whole argument rests on the caller being an
online-mode server.

Codes are 8 characters of Crockford base32 minus `I`, `L`, `O` and `U`, from
`crypto.randomInt` rather than `Math.random`. They live ten minutes, there is at
most one live per account, and redemption is a conditional `UPDATE` so two
servers racing on the same code produce one winner and one `invalid_code`.

`invalid_code` covers unknown, spent and expired deliberately. Telling them
apart would let somebody probe which codes exist.

**Microsoft.** The launcher's chain, unchanged: MSA → Xbox Live → XSTS →
`login_with_xbox` → entitlements → profile. The entitlement check is not
optional; an account can pass Xbox Live cleanly and not own Java Edition.

Only `XboxLive.signin` is requested, deliberately not `offline_access`. This
service reads the profile once and is done, so there is no refresh token to
store and nothing long-lived to leak.

## The uniqueness rules

One account holds at most one profile. One profile belongs to at most one
account. A profile already held by somebody else is **refused, never moved**:
reassigning it would hand one player another player's statistics, and nothing
here can tell which of the two is telling the truth.

Both rules are enforced by partial unique indexes over the rows that are still
live (`backend/prisma/migrations/*/migration.sql`). The service checks first and
returns a clean error; the indexes are what hold when two requests race past
that check. Unlinking is a soft delete, which is why the indexes have to be
partial.

Statistics are keyed by Minecraft UUID rather than by account, so they survive
unlinking and come back if the same profile is linked again. Unlinking is how
somebody stops showing a profile, not how they delete their playtime.

## Who can see a player's page

A player page (`GET /players/{uuid}`, and `/players/{uuid}` on the website) is
behind a session or a plugin token, exactly like the leaderboards that link to
it. A profile pairs a name with everything that player has done, which is more
than a leaderboard row shows, so it would make no sense for the row to need a
credential and the page not to. Any signed-in smto.dev account can open any
linked profile; there is no per-player privacy setting yet. If one is wanted, it
belongs on the account and has to be honoured by the leaderboards as well, or it
protects nothing.

What another person sees is deliberately narrow: the cached Minecraft name, the
UUID, the date the profile was linked, and the numbers. Not the smto.dev account
id or username, and not how the profile was verified.

Two rules keep the page from becoming a way to learn things it should not:

- **A page exists only while a link is live.** Statistics are keyed by UUID and
  survive unlinking, so metric rows alone are not enough to answer. Otherwise
  unlinking, which is how somebody stops showing a profile, would do nothing.
  "Never linked" and "unlinked since" return the same 404.
- **Hidden servers are left out** of a profile and of the leaderboard sums. A
  server with `isPublic` off is one nobody was meant to see, and its numbers
  showing up inside a total would tell them it exists.

## What is open without signing in

Server metadata, uploaded server images, skins, and one number set:
`GET /public/servers/{id}/stats`, a server's counters added up across all its
players. That one is open on purpose. It has no names and no per player rows, so
there is nothing in it that belongs to a person, unlike a leaderboard row or a
profile, which pair a name with what somebody did and stay behind a session.

Two limits on that. On a server with one player the total is that player's
numbers, so it is only anonymous in proportion to how many people play. And
polling it over time shows when somebody is playing; the same is already true of
the server list ping in the game. Neither seemed worth hiding a server's own
totals for, but if either matters, the fix is to require a session on this one
route, which is a single decorator.

## The speech bubble

The one thing on the site that a player writes and strangers read, so it gets
the care the rest of the data does not need.

- **Text only, one line, 80 characters.** No markup and no formatting, so there
  is nothing to render badly. It is escaped by Svelte on the way out and is
  never inserted as HTML anywhere.
- **Cleaned on the way in, so the stored text is the shown text.** Newlines and
  control characters become spaces and runs of whitespace collapse. Invisible
  format characters are removed: the bidirectional overrides can make a line
  read backwards, and zero width characters can pad a message with nothing. The
  zero width joiner is kept, since emoji sequences depend on it. The limit is
  counted in characters a person would count, not bytes.
- **Only the owner writes it,** through `PUT /me/message`, which acts on the
  caller's own account and takes no target. A plugin token has no account and is
  refused. It needs a live link, since there would be no page to show it on, and
  it is throttled to 20 a minute.
- **Admins can take it down,** with `DELETE /admin/players/{uuid}/message`. The
  text that was removed is written to the audit log as `profile_message_cleared`,
  because once it is gone that is the only record of what was said. Removing
  nothing logs nothing.
- **It lives on the account,** so it survives an unlink and comes back on a
  relink, but is not visible while there is no live link: the page does not
  exist then.

What is not there: nothing stops a player writing a new message straight after
an admin removed one, and there is no report button or word filter. If that
becomes a problem the next step is a per-account block that the save refuses,
not a longer blocklist.

## The API surface

Guards run globally in this order: throttler, authenticate, roles, scopes.
**Routes are closed by default**; `@Public()` opens them one at a time. Getting
that the other way around is how endpoints quietly ship unprotected.

`ScopesGuard` here is stricter than the account system's equivalent. There, an
admin may call a scoped route in place of an API key. Here they may not: the
ingest routes write other players' statistics and resolve UUIDs to people, and
there is no reason for a browser to do either. A stolen admin session cannot
rewrite the network's playtime.

**Issue one token per server, pinned to that server.** `StatsService` refuses a
batch whose `serverId` does not match the token's pin, so a config file that
leaks cannot be used against another server's data.

## Uploaded images

Admins can upload images for a server, and those files are then served from
this service's own origin. That is the risky part, and it is what the rules
below are about.

Raster images only: PNG, JPEG, WebP and GIF. **SVG is refused on purpose.** An
SVG is a document that can carry script, and one served from our origin would
run with the privileges of the pages around it. Only admins can upload, so this
is depth rather than the only line, but the cost of the rule is one file format
nobody has asked for.

The declared type is not trusted. The bytes are matched against their own
signature and a mismatch is refused, the stored extension is rewritten to match
what the file really is, and the response carries
`X-Content-Type-Options: nosniff` so no browser tries to be helpful about it.

The file name never touches a filesystem: it is a column, the bytes live in the
database, and the name is restricted to letters, digits, dots, dashes and
underscores. There is no path to traverse. Uploads are capped at 8 MiB, checked
while reading rather than after, so an oversized body is cut off at the ceiling
rather than buffered first.

Both writes are audited. Deleting a server takes its images with it, through the
same cascade as its statistics.

## The counter rule

A counter that arrives lower than the stored value is rejected and audit
logged, not written. It almost always means the server lost its local state, a
wiped world or a restored backup, and accepting it would erase real playtime.
Nothing here can tell whether the new number is the truth, so a human decides.

Unknown metrics default to counter, because that is what a plugin reporting a
running total is, and it is the safe direction to be wrong in.

## Outbound requests

The only hosts this service ever calls are the account system, Microsoft's
`consumers` tenant, Xbox Live, `api.minecraftservices.com`, Mojang's session and
texture servers, and the uploader at `UPLOADER_BASE_URL` when one is configured.

Skin textures are downloaded only from `textures.minecraft.net`, and the host is
checked even though the URL comes out of a signed property. A change on their
side should not be able to turn this into a request to somewhere else.

## Handing a player to another service

`UPLOADER_API_KEY` mints an uploader session for any player it names, so it is a
root credential over there and is treated as one: it lives in `.env`, only the
backend reads it, and the browser sees nothing but the link that comes back.
That link is single use and expires in minutes, so it is followed by a redirect
and never rendered, logged or stored. The audit row records the profile and the
moment, not the link.

Two rules make this hard to misuse. Minting needs a browser session **and** a
linked Minecraft profile, so nobody can ask for a session as somebody else, and
the returned URL is rejected unless its origin is the uploader's own: a
compromised or misconfigured uploader must not be able to point our signed-in
players anywhere it likes. The menu entry is a form post rather than a link,
because this app preloads links on hover and a link would spend a credential
every time the pointer crossed the menu.

## Rate limits

120 requests per minute per address by default; 60 on the public server list,
120 on skins, 10 per minute on minting an uploader session, and 6 per minute on
minting a link code. The tight one on code
minting is not about load: the codes are typed in public chat, and somebody
spamming the button would fill a screen with codes that all look current.

`THROTTLE_DISABLED` is honoured only outside production, so a stray variable in
a compose file cannot switch rate limiting off on a deployment nobody is
watching.

## Things deliberately not done

- **No password, no second identity provider for accounts.** smto.dev accounts
  are the only way in. Adding a second one means a second set of these rules.
- **No client-side token handling.** Everything goes through the SvelteKit
  server.
- **No storing Minecraft usernames as keys.** The account system parks released
  usernames for thirty days and then hands them on; the same is true of Mojang
  names. UUIDs are the identity, names are a display cache.
