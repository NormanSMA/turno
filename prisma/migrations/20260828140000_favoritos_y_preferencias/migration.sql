-- Favoritos y preferencias de aviso.
--
-- Los dos son personalización que tiene que seguir a la persona entre
-- dispositivos, no configuración de navegador.

CREATE TABLE "favorito" (
    "usuarioId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorito_pkey" PRIMARY KEY ("usuarioId","productoId")
);

CREATE INDEX "favorito_usuarioId_idx" ON "favorito"("usuarioId");

ALTER TABLE "favorito" ADD CONSTRAINT "favorito_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorito" ADD CONSTRAINT "favorito_productoId_fkey"
    FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La fila solo existe cuando alguien cambió algo: la ausencia significa
-- "todo activado".
CREATE TABLE "preferencia_aviso" (
    "usuarioId" UUID NOT NULL,
    "confirmacion" BOOLEAN NOT NULL DEFAULT true,
    "listo" BOOLEAN NOT NULL DEFAULT true,
    "recordatorio" BOOLEAN NOT NULL DEFAULT true,
    "promociones" BOOLEAN NOT NULL DEFAULT false,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "preferencia_aviso_pkey" PRIMARY KEY ("usuarioId")
);

ALTER TABLE "preferencia_aviso" ADD CONSTRAINT "preferencia_aviso_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
