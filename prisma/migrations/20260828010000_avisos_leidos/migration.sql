-- AlterTable
ALTER TABLE "notificacion" ADD COLUMN     "leidaEn" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "notificacion_leidaEn_creadaEn_idx" ON "notificacion"("leidaEn", "creadaEn");

