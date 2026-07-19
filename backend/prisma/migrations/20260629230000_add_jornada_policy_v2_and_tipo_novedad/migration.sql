-- CreateEnum
CREATE TYPE "TipoNovedad" AS ENUM ('LLEGADA_TARDE', 'HORAS_EXTRA');

-- AlterTable — JornadaPolicy: add operario-level scope, lunch window, tolerance
ALTER TABLE "JornadaPolicy"
  ADD COLUMN "operarioId" TEXT,
  ADD COLUMN "almuerzoInicio" TEXT,
  ADD COLUMN "almuerzoFin" TEXT,
  ADD COLUMN "toleranciaMin" INTEGER NOT NULL DEFAULT 5;

-- Drop old 2-column unique constraint before creating the new 3-column one
DROP INDEX IF EXISTS "JornadaPolicy_zoneId_vigenteDesde_key";

-- CreateIndex — new 3-level unique constraint
CREATE UNIQUE INDEX "JornadaPolicy_operarioId_zoneId_vigenteDesde_key"
  ON "JornadaPolicy"("operarioId", "zoneId", "vigenteDesde");

-- CreateIndex — efficient lookup by operarioId
CREATE INDEX "JornadaPolicy_operarioId_idx" ON "JornadaPolicy"("operarioId");

-- AddForeignKey — JornadaPolicy → Operario
ALTER TABLE "JornadaPolicy"
  ADD CONSTRAINT "JornadaPolicy_operarioId_fkey"
  FOREIGN KEY ("operarioId") REFERENCES "Operario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable — Novedad: add tipoNovedad, minutosTarde, autoGenerada
ALTER TABLE "Novedad"
  ADD COLUMN "tipoNovedad" "TipoNovedad" NOT NULL DEFAULT 'HORAS_EXTRA',
  ADD COLUMN "minutosTarde" INTEGER,
  ADD COLUMN "autoGenerada" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex — partial unique: one auto-generated LLEGADA_TARDE per attendance
CREATE UNIQUE INDEX "Novedad_attendanceId_late_arrival_auto_key"
  ON "Novedad"("attendanceId")
  WHERE "tipoNovedad" = 'LLEGADA_TARDE' AND "autoGenerada" = true;
