-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "verification_method" AS ENUM ('MSA', 'INGAME_CODE');

-- CreateEnum
CREATE TYPE "server_state" AS ENUM ('ONGOING', 'ARCHIVED', 'UPCOMING');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "username_cache" TEXT NOT NULL,
    "avatar_url_cache" TEXT,
    "roles_cache" TEXT[],
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "refreshed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_transactions" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT,
    "code_verifier" TEXT NOT NULL,
    "return_to" TEXT,
    "account_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minecraft_links" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "mc_uuid" UUID NOT NULL,
    "mc_username_cache" TEXT NOT NULL,
    "verified_via" "verification_method" NOT NULL,
    "verified_meta" JSONB,
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minecraft_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "consumed_server_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "server_state" NOT NULL,
    "icon_url" TEXT,
    "description" TEXT,
    "launch_date" DATE,
    "current_version" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_metrics" (
    "id" UUID NOT NULL,
    "mc_uuid" UUID NOT NULL,
    "server_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value_num" BIGINT,
    "value_json" JSONB,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "server_id" TEXT,
    "created_by" UUID,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_account_id" UUID,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_cache" (
    "mc_uuid" UUID NOT NULL,
    "skin" BYTEA NOT NULL,
    "slim" BOOLEAN NOT NULL DEFAULT false,
    "cape" BYTEA,
    "texture_url" TEXT,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skin_cache_pkey" PRIMARY KEY ("mc_uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "sessions"("account_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_transactions_state_key" ON "auth_transactions"("state");

-- CreateIndex
CREATE INDEX "auth_transactions_expires_at_idx" ON "auth_transactions"("expires_at");

-- CreateIndex
CREATE INDEX "minecraft_links_account_id_unlinked_at_idx" ON "minecraft_links"("account_id", "unlinked_at");

-- CreateIndex
CREATE INDEX "minecraft_links_mc_uuid_unlinked_at_idx" ON "minecraft_links"("mc_uuid", "unlinked_at");

-- CreateIndex
CREATE UNIQUE INDEX "link_codes_code_key" ON "link_codes"("code");

-- CreateIndex
CREATE INDEX "link_codes_account_id_consumed_at_idx" ON "link_codes"("account_id", "consumed_at");

-- CreateIndex
CREATE INDEX "link_codes_expires_at_idx" ON "link_codes"("expires_at");

-- CreateIndex
CREATE INDEX "servers_is_public_sort_order_idx" ON "servers"("is_public", "sort_order");

-- CreateIndex
CREATE INDEX "player_metrics_server_id_metric_idx" ON "player_metrics"("server_id", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "player_metrics_mc_uuid_server_id_metric_key" ON "player_metrics"("mc_uuid", "server_id", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_tokens_revoked_at_idx" ON "api_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_id_idx" ON "audit_log"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minecraft_links" ADD CONSTRAINT "minecraft_links_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_metrics" ADD CONSTRAINT "player_metrics_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The two rules the linking feature rests on, written by hand because Prisma's
-- schema language cannot express a partial unique index.
--
-- Unlinking is a soft delete, so an account that links, unlinks and links again
-- keeps every row. Uniqueness therefore has to apply only to the rows that are
-- still live, or re-linking would be impossible and the history would have to be
-- thrown away to allow it.
--
-- One account holds at most one Minecraft profile.
CREATE UNIQUE INDEX "minecraft_links_one_live_per_account"
    ON "minecraft_links" ("account_id")
    WHERE "unlinked_at" IS NULL;

-- One Minecraft profile belongs to at most one account. This is the index that
-- stops a player from attaching somebody else's UUID and inheriting their
-- statistics: the service checks for it first and returns a clean error, and
-- this is what holds if two requests race past that check at the same moment.
CREATE UNIQUE INDEX "minecraft_links_one_live_per_profile"
    ON "minecraft_links" ("mc_uuid")
    WHERE "unlinked_at" IS NULL;
