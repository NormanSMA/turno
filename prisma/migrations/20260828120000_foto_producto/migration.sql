-- CreateTable
CREATE TABLE "foto_producto" (
    "id" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "datos" BYTEA NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'image/webp',
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "foto_producto_productoId_key" ON "foto_producto"("productoId");

-- AddForeignKey
ALTER TABLE "foto_producto" ADD CONSTRAINT "foto_producto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

