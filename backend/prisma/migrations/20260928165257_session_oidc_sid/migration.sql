-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "oidc_sid" TEXT;

-- CreateIndex
CREATE INDEX "sessions_oidc_sid_idx" ON "sessions"("oidc_sid");
