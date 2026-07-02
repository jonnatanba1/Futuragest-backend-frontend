-- Drop the old index
DROP INDEX IF EXISTS "Novedad_attendanceId_active_key";

-- Create the new index including "tipoNovedad"
CREATE UNIQUE INDEX "Novedad_attendanceId_active_key"
  ON "Novedad"("attendanceId", "tipoNovedad")
  WHERE status IN ('PENDING', 'APPROVED');
