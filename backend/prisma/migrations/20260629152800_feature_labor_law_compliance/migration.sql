-- CreateEnum
CREATE TYPE "TipoHoraExtra" AS ENUM ('EXTRA_DIURNA', 'EXTRA_NOCTURNA', 'DOMINICAL_FESTIVA_DIURNA', 'DOMINICAL_FESTIVA_NOCTURNA');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('FIXED', 'EMILIANI', 'EASTER_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "SurchargeCategory" AS ENUM ('RECARGO_NOCTURNO', 'HORA_EXTRA_DIURNA', 'HORA_EXTRA_NOCTURNA', 'RECARGO_DOMINICAL_FESTIVO');

-- CreateEnum
CREATE TYPE "CompensatoryType" AS ENUM ('OCCASIONAL', 'HABITUAL');

-- CreateEnum
CREATE TYPE "CompensatoryStatus" AS ENUM ('PENDING', 'PAID_ONLY', 'SCHEDULED', 'TAKEN');

-- AlterTable
ALTER TABLE "CompensationPeriod" ADD COLUMN     "horasDominicalesFestivas" DECIMAL(7,2),
ADD COLUMN     "horasExtraDiurnas" DECIMAL(7,2),
ADD COLUMN     "horasExtraNocturnas" DECIMAL(7,2),
ADD COLUMN     "horasOrdinariasDiurnas" DECIMAL(7,2),
ADD COLUMN     "horasOrdinariasNocturnas" DECIMAL(7,2),
ADD COLUMN     "tasaDominicalAplicada" DECIMAL(5,2),
ADD COLUMN     "valorRecargos" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "JornadaPolicy" ADD COLUMN     "diasLaborales" INTEGER[],
ADD COLUMN     "horaFin" TEXT NOT NULL,
ADD COLUMN     "horaInicio" TEXT NOT NULL,
ADD COLUMN     "horasSemanales" DECIMAL(4,2) NOT NULL,
ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "Novedad" ADD COLUMN     "tipoHoraExtra" "TipoHoraExtra";

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "year" INTEGER NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurchargeRate" (
    "id" TEXT NOT NULL,
    "category" "SurchargeCategory" NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "creadoPor" TEXT,
    "legalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurchargeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceBreakdown" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "horasOrdinariasDiurnas" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horasOrdinariasNocturnas" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horasExtraDiurnas" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horasExtraNocturnas" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "totalHoras" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "esDominical" BOOLEAN NOT NULL DEFAULT false,
    "esFestivo" BOOLEAN NOT NULL DEFAULT false,
    "esDiaLaboral" BOOLEAN NOT NULL DEFAULT true,
    "jornadaPolicyId" TEXT NOT NULL,
    "horaInicioAplicada" TEXT NOT NULL,
    "horaFinAplicada" TEXT NOT NULL,
    "horasDiariasAplicada" DECIMAL(4,2) NOT NULL,
    "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recalculatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensatoryRest" (
    "id" TEXT NOT NULL,
    "operarioId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "type" "CompensatoryType" NOT NULL,
    "status" "CompensatoryStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledDate" TEXT,
    "takenDate" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensatoryRest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_year_idx" ON "Holiday"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "SurchargeRate_category_idx" ON "SurchargeRate"("category");

-- CreateIndex
CREATE INDEX "SurchargeRate_vigenteDesde_idx" ON "SurchargeRate"("vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "SurchargeRate_category_vigenteDesde_key" ON "SurchargeRate"("category", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceBreakdown_attendanceId_key" ON "AttendanceBreakdown"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceBreakdown_attendanceId_idx" ON "AttendanceBreakdown"("attendanceId");

-- CreateIndex
CREATE UNIQUE INDEX "CompensatoryRest_attendanceId_key" ON "CompensatoryRest"("attendanceId");

-- CreateIndex
CREATE INDEX "CompensatoryRest_operarioId_month_idx" ON "CompensatoryRest"("operarioId", "month");

-- CreateIndex
CREATE INDEX "CompensatoryRest_status_idx" ON "CompensatoryRest"("status");

-- CreateIndex
CREATE INDEX "JornadaPolicy_zoneId_idx" ON "JornadaPolicy"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "JornadaPolicy_zoneId_vigenteDesde_key" ON "JornadaPolicy"("zoneId", "vigenteDesde");

-- AddForeignKey
ALTER TABLE "JornadaPolicy" ADD CONSTRAINT "JornadaPolicy_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreakdown" ADD CONSTRAINT "AttendanceBreakdown_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreakdown" ADD CONSTRAINT "AttendanceBreakdown_jornadaPolicyId_fkey" FOREIGN KEY ("jornadaPolicyId") REFERENCES "JornadaPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensatoryRest" ADD CONSTRAINT "CompensatoryRest_operarioId_fkey" FOREIGN KEY ("operarioId") REFERENCES "Operario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensatoryRest" ADD CONSTRAINT "CompensatoryRest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

