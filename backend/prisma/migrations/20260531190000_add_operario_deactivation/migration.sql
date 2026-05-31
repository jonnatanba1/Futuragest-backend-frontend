-- AlterTable: add soft-deactivation column to Operario (nullable, no default)
ALTER TABLE "Operario" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
