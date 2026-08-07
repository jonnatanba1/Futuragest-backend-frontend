-- CreateEnum
CREATE TYPE "InventoryLocationType" AS ENUM ('CENTRAL_WAREHOUSE', 'MUNICIPAL_WAREHOUSE', 'SUPERVISOR_CUSTODY', 'IN_TRANSIT');

-- CreateEnum
CREATE TYPE "InventoryAssignmentRole" AS ENUM ('CUSTODIAN', 'RECEIVER', 'COUNTER');

-- CreateEnum
CREATE TYPE "InventoryCommandType" AS ENUM ('OPENING_BALANCE', 'FIELD_ISSUE', 'FIELD_RETURN', 'DAMAGE_OR_LOSS', 'REVERSAL', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'COUNT_ADJUSTMENT', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "InventoryCommandStatus" AS ENUM ('RECEIVED', 'APPLIED', 'NEEDS_REVIEW', 'RESOLVED_APPLIED', 'RESOLVED_DISMISSED', 'REJECTED_CLIENT_ACTION');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_BALANCE', 'FIELD_ISSUE', 'FIELD_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'COUNT_ADJUSTMENT_IN', 'COUNT_ADJUSTMENT_OUT', 'DAMAGE_OR_LOSS', 'IN_TRANSIT_LOSS', 'IN_TRANSIT_DAMAGE', 'REVERSAL');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COMPRAS';

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUnitCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "factorToBase" DECIMAL(20,6) NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductUnitVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InventoryLocationType" NOT NULL,
    "zoneId" TEXT,
    "municipioId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocationAssignment" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "role" "InventoryAssignmentRole" NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLocationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCommand" (
    "id" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "deviceId" TEXT,
    "locationId" TEXT,
    "zoneId" TEXT,
    "supervisorId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "type" "InventoryCommandType" NOT NULL,
    "payload" JSONB NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "InventoryCommandStatus" NOT NULL DEFAULT 'RECEIVED',
    "result" JSONB,
    "reviewCode" TEXT,
    "reviewReason" TEXT,
    "capturedAtUtc" TIMESTAMP(3) NOT NULL,
    "capturedOffsetMin" INTEGER NOT NULL,
    "businessDate" TEXT NOT NULL,
    "clockSkewSeconds" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionCommandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitVersionId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantityBase" DECIMAL(20,6) NOT NULL,
    "sourceMovementId" TEXT,
    "capturedAtUtc" TIMESTAMP(3) NOT NULL,
    "businessDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMinimum" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityBase" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMinimum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt");

-- CreateIndex
CREATE INDEX "ProductUnitVersion_productId_validUntil_idx" ON "ProductUnitVersion"("productId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitVersion_productId_unitCode_validFrom_key" ON "ProductUnitVersion"("productId", "unitCode", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_code_key" ON "InventoryLocation"("code");

-- CreateIndex
CREATE INDEX "InventoryLocation_type_idx" ON "InventoryLocation"("type");

-- CreateIndex
CREATE INDEX "InventoryLocation_zoneId_idx" ON "InventoryLocation"("zoneId");

-- CreateIndex
CREATE INDEX "InventoryLocation_municipioId_idx" ON "InventoryLocation"("municipioId");

-- CreateIndex
CREATE INDEX "InventoryLocation_updatedAt_idx" ON "InventoryLocation"("updatedAt");

-- CreateIndex
CREATE INDEX "InventoryLocationAssignment_userId_validFrom_validUntil_idx" ON "InventoryLocationAssignment"("userId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "InventoryLocationAssignment_supervisorId_validFrom_validUnt_idx" ON "InventoryLocationAssignment"("supervisorId", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocationAssignment_locationId_userId_validFrom_key" ON "InventoryLocationAssignment"("locationId", "userId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCommand_clientCommandId_key" ON "InventoryCommand"("clientCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCommand_resolutionCommandId_key" ON "InventoryCommand"("resolutionCommandId");

-- CreateIndex
CREATE INDEX "InventoryCommand_actorUserId_receivedAt_idx" ON "InventoryCommand"("actorUserId", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryCommand_locationId_receivedAt_idx" ON "InventoryCommand"("locationId", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryCommand_zoneId_receivedAt_idx" ON "InventoryCommand"("zoneId", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryCommand_supervisorId_receivedAt_idx" ON "InventoryCommand"("supervisorId", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryCommand_status_receivedAt_idx" ON "InventoryCommand"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryCommand_businessDate_idx" ON "InventoryCommand"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_sourceMovementId_key" ON "InventoryMovement"("sourceMovementId");

-- CreateIndex
CREATE INDEX "InventoryMovement_locationId_productId_createdAt_idx" ON "InventoryMovement"("locationId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_businessDate_idx" ON "InventoryMovement"("productId", "businessDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_commandId_idx" ON "InventoryMovement"("commandId");

-- CreateIndex
CREATE INDEX "InventoryBalance_productId_idx" ON "InventoryBalance"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_locationId_productId_key" ON "InventoryBalance"("locationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMinimum_locationId_productId_key" ON "StockMinimum"("locationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Municipio_id_zoneId_key" ON "Municipio"("id", "zoneId");

-- AddForeignKey
ALTER TABLE "ProductUnitVersion" ADD CONSTRAINT "ProductUnitVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_municipioId_zoneId_fkey" FOREIGN KEY ("municipioId", "zoneId") REFERENCES "Municipio"("id", "zoneId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocationAssignment" ADD CONSTRAINT "InventoryLocationAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocationAssignment" ADD CONSTRAINT "InventoryLocationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocationAssignment" ADD CONSTRAINT "InventoryLocationAssignment_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_resolutionCommandId_fkey" FOREIGN KEY ("resolutionCommandId") REFERENCES "InventoryCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "InventoryCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_unitVersionId_fkey" FOREIGN KEY ("unitVersionId") REFERENCES "ProductUnitVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_sourceMovementId_fkey" FOREIGN KEY ("sourceMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMinimum" ADD CONSTRAINT "StockMinimum_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMinimum" ADD CONSTRAINT "StockMinimum_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express.
ALTER TABLE "InventoryLocation"
  ADD CONSTRAINT "InventoryLocation_municipio_requires_zone"
  CHECK ("municipioId" IS NULL OR "zoneId" IS NOT NULL);

ALTER TABLE "ProductUnitVersion"
  ADD CONSTRAINT "ProductUnitVersion_factor_positive" CHECK ("factorToBase" > 0),
  ADD CONSTRAINT "ProductUnitVersion_valid_window" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom");

CREATE UNIQUE INDEX "ProductUnitVersion_one_current_unit"
  ON "ProductUnitVersion"("productId", "unitCode")
  WHERE "validUntil" IS NULL;

CREATE UNIQUE INDEX "ProductUnitVersion_one_current_base"
  ON "ProductUnitVersion"("productId")
  WHERE "validUntil" IS NULL AND "isBase" = true;

ALTER TABLE "InventoryLocationAssignment"
  ADD CONSTRAINT "InventoryLocationAssignment_valid_window" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom"),
  ADD CONSTRAINT "InventoryLocationAssignment_version_positive" CHECK ("version" > 0);

CREATE UNIQUE INDEX "InventoryLocationAssignment_one_current_role"
  ON "InventoryLocationAssignment"("locationId", "userId", "role")
  WHERE "validUntil" IS NULL;

ALTER TABLE "InventoryCommand"
  ADD CONSTRAINT "InventoryCommand_schema_version_positive" CHECK ("schemaVersion" > 0),
  ADD CONSTRAINT "InventoryCommand_offset_range" CHECK ("capturedOffsetMin" BETWEEN -840 AND 840),
  ADD CONSTRAINT "InventoryCommand_business_date_format" CHECK ("businessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ADD CONSTRAINT "InventoryCommand_request_hash_format" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "InventoryCommand_resolution_not_self" CHECK ("resolutionCommandId" IS NULL OR "resolutionCommandId" <> "id");

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_quantity_positive" CHECK ("quantityBase" > 0),
  ADD CONSTRAINT "InventoryMovement_business_date_format" CHECK ("businessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ADD CONSTRAINT "InventoryMovement_source_not_self" CHECK ("sourceMovementId" IS NULL OR "sourceMovementId" <> "id");

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_non_negative" CHECK ("quantityBase" >= 0),
  ADD CONSTRAINT "InventoryBalance_version_non_negative" CHECK ("version" >= 0);

ALTER TABLE "StockMinimum"
  ADD CONSTRAINT "StockMinimum_non_negative" CHECK ("quantityBase" >= 0);

-- The ledger is append-only. Corrections are represented by compensating rows.
CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'InventoryMovement is append-only; create a reversal instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "InventoryMovement_append_only"
BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
