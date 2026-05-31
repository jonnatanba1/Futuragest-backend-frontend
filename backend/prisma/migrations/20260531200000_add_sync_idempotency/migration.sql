-- AlterTable: add checkout idempotency ref to Attendance
ALTER TABLE "Attendance" ADD COLUMN "checkOutClientRef" TEXT;

-- AlterTable: add create idempotency ref to Novedad
ALTER TABLE "Novedad" ADD COLUMN "clientRef" TEXT;
CREATE UNIQUE INDEX "Novedad_clientRef_key" ON "Novedad"("clientRef");
