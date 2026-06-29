-- Migration: compensation_payout_state
-- Adds paidAt/payoutRef (Fix 4), divergedAt (Fix 5), and backfills zoneId (Fix 7).

-- Payout liquidation state: set once when HR confirms the payout (immutable afterwards).
ALTER TABLE "CompensationPeriod" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "CompensationPeriod" ADD COLUMN "payoutRef" TEXT;

-- Drift marker: set when attendance data changes inside an already-closed period.
ALTER TABLE "CompensationPeriod" ADD COLUMN "divergedAt" TIMESTAMP(3);

-- Backfill zoneId on existing snapshots that were persisted with '' (pre-fix rows).
UPDATE "CompensationPeriod" cp
SET "zoneId" = s."zoneId"
FROM "Operario" o JOIN "Supervisor" s ON s."id" = o."supervisorId"
WHERE cp."operarioId" = o."id" AND cp."zoneId" = '';
