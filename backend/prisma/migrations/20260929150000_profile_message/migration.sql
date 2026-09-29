-- The speech bubble on a player's page. Nullable and with no default, so the
-- migration is a metadata change and every existing account simply has none.
ALTER TABLE "accounts" ADD COLUMN "profile_message" TEXT;
