-- Migration: add_compensation_period
-- PR-B: CompensationPeriod (immutable fortnight-close snapshot)
--
-- IMMUTABLE semantics: no UPDATE or DELETE on CompensationPeriod rows.
-- Uniqueness: one period per operario+periodKey enforced by hand-authored
-- partial unique index (Novedad pattern).

-- CreateEnum
CREATE TYPE "CompensationDisposition" AS ENUM ('CARRY_OVER', 'PAYROLL_DEDUCTION');

-- CreateTable
CREATE TABLE "CompensationPeriod" (
    "id"               TEXT         NOT NULL,
    "operarioId"       TEXT         NOT NULL,
    "zoneId"           TEXT         NOT NULL,
    "supervisorId"     TEXT         NOT NULL,
    "periodKey"        TEXT         NOT NULL,
    "desde"            TEXT         NOT NULL,
    "hasta"            TEXT         NOT NULL,
    "creditos"         DECIMAL(7,2) NOT NULL,
    "debitos"          DECIMAL(7,2) NOT NULL,
    "carryIn"          DECIMAL(7,2) NOT NULL,
    "saldo"            DECIMAL(7,2) NOT NULL,
    "disposition"      "CompensationDisposition",
    "approvedByUserId" TEXT,
    "decidedAt"        TIMESTAMP(3),
    "closedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRef"        TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompensationPeriod_operarioId_idx" ON "CompensationPeriod"("operarioId");

-- CreateIndex
CREATE INDEX "CompensationPeriod_zoneId_idx" ON "CompensationPeriod"("zoneId");

-- CreateIndex
CREATE INDEX "CompensationPeriod_supervisorId_idx" ON "CompensationPeriod"("supervisorId");

-- CreateIndex
CREATE INDEX "CompensationPeriod_periodKey_idx" ON "CompensationPeriod"("periodKey");

-- CreateIndex (unique — clientRef idempotency token)
CREATE UNIQUE INDEX "CompensationPeriod_clientRef_key" ON "CompensationPeriod"("clientRef") WHERE "clientRef" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "CompensationPeriod"
    ADD CONSTRAINT "CompensationPeriod_operarioId_fkey"
    FOREIGN KEY ("operarioId") REFERENCES "Operario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationPeriod"
    ADD CONSTRAINT "CompensationPeriod_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: one closed period per operario per fortnight.
-- Mirrors the Novedad pattern — authored by hand so it remains explicit
-- and future-proof (e.g. if soft-void is ever added, the WHERE clause changes here).
CREATE UNIQUE INDEX "CompensationPeriod_operario_period_key"
    ON "CompensationPeriod"("operarioId", "periodKey");
