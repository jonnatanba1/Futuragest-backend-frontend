-- Migration: add pushToken and pushPlatform to DeviceSession
-- Additive, nullable, no backfill needed, no NOT NULL constraint
ALTER TABLE "DeviceSession" ADD COLUMN "pushToken" TEXT;
ALTER TABLE "DeviceSession" ADD COLUMN "pushPlatform" TEXT;
