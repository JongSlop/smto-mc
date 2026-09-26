# Observer API

Base URL: `https://smto.dev/mc/link/api/v1`
Interactive reference: `https://smto.dev/mc/link/api/docs`

This document is the contract the Minecraft server plugins are written against.
The plugin lives outside this repository. These routes do not change without
this document changing first.

Three surfaces, three ways in:

| Surface          | Prefix     | Credential                           |
| ---------------- | ---------- | ------------------------------------ |
| Public           | `/public/` | none                                 |
| Plugin ingest    | `/ingest/` | `X-Api-Key`                          |
| Signed-in person | `/me/`     | session cookie, browser only         |
| Admin            | `/admin/`  | session cookie plus the `admin` role |

Errors come back as JSON with a machine-readable code:

```json
{ "statusCode": 409, "message": "profile_already_linked", "error": "Conflict" }
```

Validation failures carry the offending fields:

```json
{
  "error": "validation_failed",
  "issues": [
    { "path": "entries.0.uuid", "code": "invalid_string", "message": "not a Minecraft UUID" }
  ]
}
```

---

## Tokens

Issued in the admin area. Format `smtomc_` plus 32 random bytes, base64url.

The token is shown exactly once, at creation. Only its SHA-256 is stored, so it
cannot be recovered later.

Send it as a header:

```
X-Api-Key: smtomc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Scopes:

| Scope         | Allows                     |
| ------------- | -------------------------- |
| `stats:write` | `POST /ingest/metrics`     |
| `link:redeem` | `POST /ingest/link/redeem` |
| `link:read`   | `GET /ingest/link/{uuid}`  |

**Issue one token per server, pinned to that server.** A pinned token can only
write its own server's data, so a config file that leaks cannot be used to
rewrite another server's statistics. An unpinned token can write for any server
and exists for tooling that genuinely spans the network.

Rate limit: 120 requests per minute per address by default. Batch rather than
sending one request per player and this is not a limit you will meet.

---

## `POST /ingest/metrics`

Scope `stats:write`. **The only way statistics arrive.** Playtime is not
special: it is the metric `playtime_seconds`, posted through here like
everything else.

```http
POST /api/v1/ingest/metrics
X-Api-Key: smtomc_...
Content-Type: application/json

{
  "serverId": "i5",
  "entries": [
    { "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5", "metric": "playtime_seconds", "value": 7200 },
    { "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5", "metric": "blocks_mined", "value": 48213 },
    { "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5", "metric": "deaths", "value": 12 }
  ]
}
```

**A new statistic needs no change here.** Metric names are free text within a
shape, so a plugin that starts recording something new just posts it. There is
no list to be added to and no deploy to wait for.

- `metric`: lowercase `snake_case`, up to 64 characters.
- Put the unit in the name so nobody has to remember it: `playtime_seconds`,
  `distance_cm`, `blocks_mined`.
- Exactly one of `value` (a non-negative integer) and `data` (an object, for a
  genuinely structured statistic such as a per-biome breakdown).
- Up to 500 entries per request.
- UUIDs are accepted dashed or undashed and are normalised to dashed.

**Send running totals, not deltas.** Post the total your plugin has recorded
locally. The write is idempotent, so a flush that is retried after a network
blip stores the same number twice rather than counting it twice.

Every metric is treated as a **counter** unless this service knows otherwise,
which means a value lower than the stored one is rejected. That is the safe
direction to be wrong in for a plugin reporting a running total. If you need a
metric that legitimately goes down, say so and it will be registered as a
gauge.

Response, always `200`:

```json
{ "accepted": 3, "rejected": [] }
```

A partial result is a success, not a failure. A batch of three hundred entries
where two look wrong writes the other 298 and hands the two back:

```json
{
  "accepted": 298,
  "rejected": [
    { "uuid": "069a79f4-...", "metric": "playtime_seconds", "reason": "counter_went_backwards" }
  ]
}
```

| `reason`                 | Meaning                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `unknown_server`         | No server with that id, or your token is pinned to a different one |
| `counter_went_backwards` | The value you sent is lower than the one stored                    |

`counter_went_backwards` almost always means the server lost its local state, a
wiped world or a restored backup. The old value is kept and the rejection is
written to the audit log, because accepting the lower number would erase real
playtime and nothing here can tell which of the two is the truth. If the new
number really is correct, an admin has to say so.

---

## `POST /ingest/link/redeem`

Scope `link:redeem`. The in-game half of linking.

A player asks the website for a code, then types it in chat. Your `/link`
command posts it here.

```http
POST /api/v1/ingest/link/redeem
X-Api-Key: smtomc_...
Content-Type: application/json

{
  "code": "K7X4-M2PQ",
  "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "username": "Notch",
  "serverId": "i5"
}
```

The code is accepted in any case, with or without the dash. Its alphabet is
Crockford base32 without `I`, `L`, `O` and `U`, so a player reading it off a
screen cannot confuse `1` with `l` or `0` with `O`. Uppercasing whatever they
typed before sending it is not necessary; this service does it.

**The UUID is trusted, and that is the whole security argument for this path.**
Every smto.dev server runs in online mode, so Mojang's session server verified
the player before they could type anything. That is also why `link:redeem`
belongs only to tokens held by servers we run.

Success, `200`:

```json
{
  "mcUuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "mcUsername": "Notch",
  "verifiedVia": "INGAME_CODE",
  "verifiedAt": "2026-09-05T18:22:41.031Z"
}
```

Failures:

| Status | Code                     | What to tell the player                                                     |
| ------ | ------------------------ | --------------------------------------------------------------------------- |
| 400    | `invalid_code`           | The code is unknown, already used or expired. Get a new one on the website. |
| 409    | `account_already_linked` | That smto.dev account already has a different profile linked.               |
| 409    | `profile_already_linked` | This Minecraft profile is already linked to another smto.dev account.       |

`invalid_code` covers unknown, spent and expired deliberately: telling them
apart would let somebody probe which codes exist.

Codes are single use and expire after ten minutes. Redemption is atomic, so two
servers racing on the same code produce one winner and one `invalid_code`.

---

## `GET /ingest/link/{uuid}`

Scope `link:read`. Who a Minecraft UUID belongs to, if anybody.

```http
GET /api/v1/ingest/link/069a79f4-44e9-4726-a5be-fca90e38aaf5
X-Api-Key: smtomc_...
```

```json
{ "linked": true, "accountId": "5f2c...", "username": "jong" }
```

```json
{ "linked": false, "accountId": null, "username": null }
```

Deliberately thin. A plugin gets an account id and a display name, enough to
greet somebody or gate a feature, and nothing else about the person. A
malformed UUID answers `linked: false` rather than erroring, so a plugin does
not need to validate before asking.

Store the `accountId`, never the `username`. The account system parks released
usernames for thirty days and then hands them on.

---

## `GET /public/servers`

No credentials. What the website shows, and what the launcher will eventually
read.

```json
[
  {
    "id": "i5",
    "name": "Laced Pack",
    "state": "ONGOING",
    "iconUrl": null,
    "description": "A custom pack designed for longevity and fun!",
    "launchDate": "2025-06-26",
    "currentVersion": "1.20.1",
    "sortOrder": 10,
    "isPublic": true,
    "extra": { "ip": "i5.smto.dev", "game": { "loader": "FABRIC" } },
    "createdAt": "2026-09-05T12:00:00.000Z",
    "updatedAt": "2026-09-05T12:00:00.000Z"
  }
]
```

`state` is one of `ONGOING`, `ARCHIVED`, `UPCOMING`. **Treat this set as
closed.** The launcher's deserialiser fails the whole pack on an unknown enum
value and the server then disappears from its list with no visible error, so a
fourth state needs a launcher release before it can appear here. New _fields_
are safe: nothing rejects what it does not recognise.

`extra` is an open object. It holds everything this service does not model yet,
including the launcher fields (`ip`, `game`, `additions`, `config`,
`background`, `news`). Read what you need out of it and ignore the rest.

`GET /public/servers/{id}` returns one, or `404 server_not_found`. A server
hidden from the public list answers exactly like one that does not exist.

Rate limit: 60 requests per minute per address.

---

## `GET /public/assets/{id}/{filename}`

No credentials. An image an admin uploaded for a server: an icon, a background,
whatever a pack JSON points at.

The address is handed out by the admin area, absolute and ready to paste. The
id resolves the file; the name on the end is decoration, so a URL says what it
is when somebody reads it in a config file.

Returns `image/png`, `image/jpeg`, `image/webp` or `image/gif`, cacheable for
an hour, with an `ETag` (the SHA-256 of the bytes) and
`X-Content-Type-Options: nosniff`. Send `If-None-Match` and an unchanged file
costs a `304`.

Re-uploading under the same name keeps the same URL and replaces the bytes, so
a corrected icon reaches everything pointing at it without an edit anywhere
else. That is also why the cache window is an hour rather than a year: assume a
replacement takes up to that long to reach every client.

Rate limit: 120 requests per minute per address.

---

## `GET /public/skins/{uuid}.png`

No credentials. A player's skin, proxied and cached from Mojang.

Returns `image/png`, cacheable for an hour. The `X-Skin-Model` header is
`slim` or `classic`, which a renderer needs and cannot read off the image.
`GET /public/skins/{uuid}/cape.png` returns the cape, or `404 no_cape`.

This exists so the website can render a skin on a canvas without a CORS
argument and without putting a third-party CDN in the page's request path. A
profile that has never set a skin gets the correct Mojang default for its UUID.

---

## `GET /leaderboards`

`X-Api-Key` or a browser session. No scope, so any live token can read it: a
server wanting its own `/top` command should not need a second credential.

Returns the top ten for every featured metric, summed across all servers:

```json
{
  "boards": [
    {
      "metric": "playtime_seconds",
      "entries": [{ "rank": 1, "mcUuid": "069a79f4-...", "mcUsername": "Notch", "value": 6000 }]
    }
  ]
}
```

Three rules worth knowing before you build against it. Only profiles linked
here appear, because the metric rows carry a UUID and the display name for one
exists only where somebody has linked an account. A total of zero is never
ranked, the same rule the website's lists follow. Boards nobody is on are left
out rather than returned empty, so the array is not a fixed length and you
should look metrics up by name rather than by position.

Throttled to 30 a minute per address. It is one grouped scan of the metric
table, so cache it for a minute rather than calling it per player.

---

## Worked example

Everything below runs against a local stack, no Minecraft server involved.

```bash
BASE=http://127.0.0.1:3011/api/v1
TOKEN=smtomc_...   # issued at /mc/link/admin/tokens

# The server list, no credentials
curl -s "$BASE/public/servers" | jq '.[] | {id, state}'

# Post playtime and a couple of other metrics in one flush
curl -s -X POST "$BASE/ingest/metrics" \
  -H "X-Api-Key: $TOKEN" -H 'content-type: application/json' \
  -d '{"serverId":"i5","entries":[
        {"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","metric":"playtime_seconds","value":7200},
        {"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","metric":"deaths","value":12}]}'
# {"accepted":2,"rejected":[]}

# Send it again: idempotent, the stored values do not double
# Send a lower value: rejected, the stored value is kept
curl -s -X POST "$BASE/ingest/metrics" \
  -H "X-Api-Key: $TOKEN" -H 'content-type: application/json' \
  -d '{"serverId":"i5","entries":[{"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","metric":"playtime_seconds","value":10}]}'
# {"accepted":0,"rejected":[{"uuid":"069a79f4-...","metric":"playtime_seconds","reason":"counter_went_backwards"}]}

# Redeem a code the website minted
curl -s -X POST "$BASE/ingest/link/redeem" \
  -H "X-Api-Key: $TOKEN" -H 'content-type: application/json' \
  -d '{"code":"K7X4-M2PQ","uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","username":"Notch","serverId":"i5"}'

# Look the player up afterwards
curl -s "$BASE/ingest/link/069a79f4-44e9-4726-a5be-fca90e38aaf5" -H "X-Api-Key: $TOKEN"
```

---

## Admin: server images

Browser session with the `admin` role. Not reachable with an `X-Api-Key`.

```
GET    /admin/servers/{id}/assets                   what is uploaded for this server
POST   /admin/servers/{id}/assets?filename=icon.png the file as the raw body
DELETE /admin/servers/{id}/assets/{assetId}
```

The upload is the file itself, not multipart: the `Content-Type` header is the
image type and the body is the bytes. Accepted types are PNG, JPEG, WebP and
GIF, up to 8 MiB.

Three things are enforced and worth knowing before automating against it. The
bytes are checked against their own signature, so a JPEG announced as a PNG is
refused with `asset_type_mismatch`. The extension is rewritten to match the
real type, so `background.png` holding a JPEG is stored as `background.jpg`.
And the name is unique per server: uploading over one that exists replaces the
image and keeps its id, which is what keeps the URL stable.

Both writes are audited as `server_asset_uploaded` and `server_asset_deleted`.
Deleting a server deletes its images with it.

---

## Notes for plugin authors

- **Flush on a timer, not on a tick.** Every few minutes for the whole server in
  one request. The batch limit is 500 players.
- **Flush on shutdown too**, or the last interval's playtime is lost.
- **Retry on 5xx and on a connection failure**, with a backoff. The writes are
  idempotent, so a retry is always safe.
- **Do not retry a 4xx.** Nothing about the request will get better by sending
  it again.
- **`rejected` is not a failure.** Log it and carry on. It is per entry, and the
  rest of the batch was written.
- **A new metric name is a new statistic.** Old rows keep their last value and
  go on being displayed, so pick names you can live with rather than renaming
  later.
- **Keep the token out of the world.** It goes in the server's config file, not
  in a command, and never anywhere a player can see it.
