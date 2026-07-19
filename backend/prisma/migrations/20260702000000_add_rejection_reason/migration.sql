-- Add nullable rejection reason column to Novedad.
-- Stores the reason provided by a líder operativo when rejecting a novedad.
ALTER TABLE "Novedad" ADD COLUMN "rejectionReason" TEXT;
