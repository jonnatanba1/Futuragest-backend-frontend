-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE');

-- AlterTable: add checkInVerification and checkOutVerification to Attendance
ALTER TABLE "Attendance"
  ADD COLUMN "checkInVerification"  "VerificationMethod",
  ADD COLUMN "checkOutVerification" "VerificationMethod";

-- AlterTable: add decisionVerification to Novedad
ALTER TABLE "Novedad"
  ADD COLUMN "decisionVerification" "VerificationMethod";
