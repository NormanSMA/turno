-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('CORREO', 'PUSH');

-- DropIndex
DROP INDEX "notificacion_estado_creadaEn_idx";

-- DropIndex
DROP INDEX "notificacion_pedidoId_tipo_key";

-- AlterTable
ALTER TABLE "notificacion" ADD COLUMN     "canal" "CanalNotificacion" NOT NULL DEFAULT 'CORREO';

-- CreateTable
CREATE TABLE "suscripcion_push" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoEnvioEn" TIMESTAMPTZ(3),
    "fallos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripcion_push_endpoint_key" ON "suscripcion_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripcion_push_usuarioId_idx" ON "suscripcion_push"("usuarioId");

-- CreateIndex
CREATE INDEX "notificacion_estado_canal_creadaEn_idx" ON "notificacion"("estado", "canal", "creadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_pedidoId_tipo_canal_key" ON "notificacion"("pedidoId", "tipo", "canal");

-- AddForeignKey
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

