-- CreateTable
CREATE TABLE "server_assets" (
    "id" UUID NOT NULL,
    "server_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "server_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_assets_server_id_created_at_idx" ON "server_assets"("server_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "server_assets_server_id_filename_key" ON "server_assets"("server_id", "filename");

-- AddForeignKey
ALTER TABLE "server_assets" ADD CONSTRAINT "server_assets_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
