-- Names for players who never linked, looked up from Mojang and cached. A new
-- table and nothing existing is touched, so this is safe to run against live data.
CREATE TABLE "player_names" (
    "mc_uuid" UUID NOT NULL,
    "username" TEXT,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_names_pkey" PRIMARY KEY ("mc_uuid")
);
