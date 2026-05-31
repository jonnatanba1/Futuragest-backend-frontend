-- Migration: add_reference_updatedat
-- Adds updatedAt column to Operario, Zone, and Municipio (reference data models
-- that previously only had createdAt). DEFAULT CURRENT_TIMESTAMP backfills
-- existing rows in-place — avoids a separate UPDATE pass, consistent with
-- Prisma @updatedAt semantics on new rows.
--
-- Also adds @@index([updatedAt]) on Operario, Attendance, and Novedad for
-- efficient delta queries (?since= filter on updatedAt >= cursor).

-- ── Operario ──────────────────────────────────────────────────────────────────

ALTER TABLE "Operario" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Operario_updatedAt_idx" ON "Operario"("updatedAt");

-- ── Zone ─────────────────────────────────────────────────────────────────────

ALTER TABLE "Zone" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Municipio ─────────────────────────────────────────────────────────────────

ALTER TABLE "Municipio" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Attendance (already has updatedAt — add index only) ───────────────────────

CREATE INDEX "Attendance_updatedAt_idx" ON "Attendance"("updatedAt");

-- ── Novedad (already has updatedAt — add index only) ─────────────────────────

CREATE INDEX "Novedad_updatedAt_idx" ON "Novedad"("updatedAt");
