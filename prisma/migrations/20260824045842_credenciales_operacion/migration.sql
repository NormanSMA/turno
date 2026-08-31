-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "ultimoAccesoEn" TIMESTAMPTZ(3);
