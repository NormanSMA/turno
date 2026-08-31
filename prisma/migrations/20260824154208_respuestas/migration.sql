-- CreateEnum
CREATE TYPE "TipoRespuesta" AS ENUM ('MICRO', 'SUS');

-- CreateTable
CREATE TABLE "respuesta" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "pedidoId" UUID,
    "tipo" "TipoRespuesta" NOT NULL,
    "pregunta" TEXT NOT NULL,
    "valores" JSONB NOT NULL,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "respuesta_usuarioId_idx" ON "respuesta"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_pedidoId_tipo_key" ON "respuesta"("pedidoId", "tipo");

-- AddForeignKey
ALTER TABLE "respuesta" ADD CONSTRAINT "respuesta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta" ADD CONSTRAINT "respuesta_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
