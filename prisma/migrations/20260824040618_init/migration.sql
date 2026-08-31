-- CreateEnum
CREATE TYPE "CondicionExperimental" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('RECIBIDO', 'EN_PREPARACION', 'LISTO', 'RETIRADO', 'NO_SHOW', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Cumplimiento" AS ENUM ('PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ESTUDIANTE', 'COMERCIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('ABIERTO', 'PAUSADO', 'CERRADO');

-- CreateEnum
CREATE TYPE "MotivoAsignacion" AS ENUM ('SOLICITADA_POR_USUARIO', 'SUGERIDA_ACEPTADA', 'ALTERNATIVA_ACEPTADA');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('PEDIDO_CONFIRMADO', 'PEDIDO_LISTO', 'ENLACE_ACCESO');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'ESTUDIANTE',
    "facultad" TEXT,
    "carrera" TEXT,
    "anio" INTEGER,
    "frecuenciaCompraPrevia" TEXT,
    "condicionExperimental" "CondicionExperimental" NOT NULL,
    "consentimiento" BOOLEAN NOT NULL DEFAULT false,
    "enListaEspera" BOOLEAN NOT NULL DEFAULT false,
    "canalCaptacion" TEXT,
    "comercioId" UUID,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primerPedidoEn" TIMESTAMPTZ(3),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMPTZ(3) NOT NULL,
    "revocadaEn" TIMESTAMPTZ(3),
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_acceso" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMPTZ(3) NOT NULL,
    "usadoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_limite" (
    "clave" TEXT NOT NULL,
    "ventanaEn" TIMESTAMPTZ(3) NOT NULL,
    "conteo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_limite_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "comercio" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "personalCocina" INTEGER NOT NULL DEFAULT 1,
    "anchoFranjaMin" INTEGER NOT NULL DEFAULT 10,
    "factorSeguridad" DECIMAL(4,3) NOT NULL DEFAULT 0.85,
    "tiempoMinAnticipable" INTEGER NOT NULL DEFAULT 3,
    "margenCutoffMin" INTEGER NOT NULL DEFAULT 2,
    "minutosNoShow" INTEGER NOT NULL DEFAULT 20,
    "maxPedidosActivos" INTEGER NOT NULL DEFAULT 2,
    "estadoOperacion" "EstadoOperacion" NOT NULL DEFAULT 'ABIERTO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL,
    "comercioId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(10,2) NOT NULL,
    "tiempoPreparacionMin" INTEGER NOT NULL,
    "anticipable" BOOLEAN NOT NULL DEFAULT false,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "archivado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franja" (
    "id" UUID NOT NULL,
    "comercioId" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "capacidadMinutos" INTEGER NOT NULL,
    "cargaAsignada" INTEGER NOT NULL DEFAULT 0,
    "abierta" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "franja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "franjaId" UUID NOT NULL,
    "condicionExperimental" "CondicionExperimental" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "franjaSolicitadaId" UUID,
    "franjasOfrecidas" JSONB,
    "motivoAsignacion" "MotivoAsignacion" NOT NULL DEFAULT 'SOLICITADA_POR_USUARIO',
    "cargaEstimadaMin" INTEGER NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'RECIBIDO',
    "cumplimiento" "Cumplimiento" NOT NULL DEFAULT 'PENDIENTE',
    "total" DECIMAL(10,2) NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
    "listoEn" TIMESTAMPTZ(3),
    "retiradoEn" TIMESTAMPTZ(3),
    "canceladoEn" TIMESTAMPTZ(3),
    "capacidadLiberada" BOOLEAN NOT NULL DEFAULT false,
    "canalCaptacion" TEXT,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_pedido" (
    "id" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "nombreProducto" TEXT NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "tiempoPreparacionMin" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "item_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_pedido" (
    "id" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "estado" "EstadoPedido" NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "nota" TEXT,

    CONSTRAINT "evento_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL,
    "pedidoId" UUID,
    "destinatario" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadaEn" TIMESTAMPTZ(3),
    "payload" JSONB,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_admin" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_tokenHash_key" ON "sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "sesion_usuarioId_idx" ON "sesion"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "token_acceso_tokenHash_key" ON "token_acceso"("tokenHash");

-- CreateIndex
CREATE INDEX "token_acceso_usuarioId_idx" ON "token_acceso"("usuarioId");

-- CreateIndex
CREATE INDEX "contador_limite_ventanaEn_idx" ON "contador_limite"("ventanaEn");

-- CreateIndex
CREATE UNIQUE INDEX "comercio_slug_key" ON "comercio"("slug");

-- CreateIndex
CREATE INDEX "producto_comercioId_idx" ON "producto"("comercioId");

-- CreateIndex
CREATE INDEX "franja_comercioId_inicio_idx" ON "franja"("comercioId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "franja_comercioId_inicio_key" ON "franja"("comercioId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_codigo_key" ON "pedido"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_idempotencyKey_key" ON "pedido"("idempotencyKey");

-- CreateIndex
CREATE INDEX "pedido_franjaId_idx" ON "pedido"("franjaId");

-- CreateIndex
CREATE INDEX "pedido_usuarioId_estado_idx" ON "pedido"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "pedido_creadoEn_idx" ON "pedido"("creadoEn");

-- CreateIndex
CREATE INDEX "item_pedido_pedidoId_idx" ON "item_pedido"("pedidoId");

-- CreateIndex
CREATE INDEX "evento_pedido_pedidoId_idx" ON "evento_pedido"("pedidoId");

-- CreateIndex
CREATE INDEX "notificacion_estado_creadaEn_idx" ON "notificacion"("estado", "creadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_pedidoId_tipo_key" ON "notificacion"("pedidoId", "tipo");

-- CreateIndex
CREATE INDEX "auditoria_admin_timestamp_idx" ON "auditoria_admin"("timestamp");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_acceso" ADD CONSTRAINT "token_acceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franja" ADD CONSTRAINT "franja_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_franjaId_fkey" FOREIGN KEY ("franjaId") REFERENCES "franja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_pedido" ADD CONSTRAINT "evento_pedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_admin" ADD CONSTRAINT "auditoria_admin_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
