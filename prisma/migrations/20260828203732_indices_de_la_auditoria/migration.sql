-- DropIndex
DROP INDEX "franja_comercioId_inicio_idx";

-- CreateIndex
CREATE INDEX "pedido_franjaId_estado_idx" ON "pedido"("franjaId", "estado");
