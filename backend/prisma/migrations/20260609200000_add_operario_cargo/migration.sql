-- Migration: add cargo field to Operario
ALTER TABLE "Operario" ADD COLUMN "cargo" TEXT NOT NULL DEFAULT '';
