-- AddColumn: checkOutSignatureKey for SALIDA (check-out) signature
-- Additive migration — nullable column, safe with existing attendance rows.
ALTER TABLE "Attendance" ADD COLUMN "checkOutSignatureKey" TEXT;
