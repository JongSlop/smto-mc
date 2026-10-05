-- Per-player key/value strings that plugins sync across servers. A new table and
-- nothing existing is touched, so this is safe to run against live data.
CREATE TABLE "player_settings" (
    "id" UUID NOT NULL,
    "mc_uuid" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_settings_mc_uuid_key_key" ON "player_settings"("mc_uuid", "key");
