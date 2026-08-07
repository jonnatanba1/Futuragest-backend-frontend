-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'DISCREPANCY_REVIEW', 'RECEIVED', 'CANCELLED', 'RETURNED', 'CLOSED_WITH_DISCREPANCY');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('OPEN', 'SUBMITTED', 'CLOSED', 'CANCELLED');

-- Add gradual rollout flag to existing inventory locations.
ALTER TABLE "InventoryLocation"
ADD COLUMN "inventoryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "originLocationId" TEXT NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "inTransitLocationId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "dispatchedByUserId" TEXT,
    "dispatchCommandId" TEXT,
    "notes" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitVersionId" TEXT NOT NULL,
    "quantityBase" DECIMAL(20,6) NOT NULL,
    "receivedBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "damagedBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lostBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentReceipt" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "receivedBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "damagedBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "missingBase" DECIMAL(20,6) NOT NULL DEFAULT 0,

    CONSTRAINT "ShipmentReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'OPEN',
    "counterUserId" TEXT NOT NULL,
    "approverUserId" TEXT,
    "approvalCommandId" TEXT,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitVersionId" TEXT NOT NULL,
    "expectedBase" DECIMAL(20,6) NOT NULL,
    "countedBase" DECIMAL(20,6),
    "differenceBase" DECIMAL(20,6),
    "adjustmentMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- Domain invariants
ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_distinct_locations_check"
  CHECK ("originLocationId" <> "destinationLocationId");

ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_quantity_positive_check" CHECK ("quantityBase" > 0),
  ADD CONSTRAINT "ShipmentItem_totals_nonnegative_check"
    CHECK ("receivedBase" >= 0 AND "damagedBase" >= 0 AND "lostBase" >= 0),
  ADD CONSTRAINT "ShipmentItem_totals_within_dispatched_check"
    CHECK ("receivedBase" + "damagedBase" + "lostBase" <= "quantityBase");

ALTER TABLE "ShipmentReceiptItem"
  ADD CONSTRAINT "ShipmentReceiptItem_totals_nonnegative_check"
    CHECK ("receivedBase" >= 0 AND "damagedBase" >= 0 AND "missingBase" >= 0);

ALTER TABLE "InventoryCountLine"
  ADD CONSTRAINT "InventoryCountLine_expected_nonnegative_check" CHECK ("expectedBase" >= 0),
  ADD CONSTRAINT "InventoryCountLine_counted_nonnegative_check"
    CHECK ("countedBase" IS NULL OR "countedBase" >= 0);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_dispatchCommandId_key" ON "Shipment"("dispatchCommandId");

-- CreateIndex
CREATE INDEX "Shipment_status_createdAt_idx" ON "Shipment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_originLocationId_status_idx" ON "Shipment"("originLocationId", "status");

-- CreateIndex
CREATE INDEX "Shipment_destinationLocationId_status_idx" ON "Shipment"("destinationLocationId", "status");

-- CreateIndex
CREATE INDEX "ShipmentItem_productId_idx" ON "ShipmentItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_productId_key" ON "ShipmentItem"("shipmentId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentReceipt_clientCommandId_key" ON "ShipmentReceipt"("clientCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentReceipt_commandId_key" ON "ShipmentReceipt"("commandId");

-- CreateIndex
CREATE INDEX "ShipmentReceipt_shipmentId_receivedAt_idx" ON "ShipmentReceipt"("shipmentId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentReceiptItem_receiptId_shipmentItemId_key" ON "ShipmentReceiptItem"("receiptId", "shipmentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_approvalCommandId_key" ON "InventoryCount"("approvalCommandId");

-- CreateIndex
CREATE INDEX "InventoryCount_locationId_status_idx" ON "InventoryCount"("locationId", "status");

-- CreateIndex
CREATE INDEX "InventoryCount_status_createdAt_idx" ON "InventoryCount"("status", "createdAt");

CREATE UNIQUE INDEX "InventoryCount_one_active_per_location_key"
ON "InventoryCount"("locationId")
WHERE "status" IN ('OPEN', 'SUBMITTED');

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_adjustmentMovementId_key" ON "InventoryCountLine"("adjustmentMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_countId_productId_key" ON "InventoryCountLine"("countId", "productId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_inTransitLocationId_fkey" FOREIGN KEY ("inTransitLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_dispatchedByUserId_fkey" FOREIGN KEY ("dispatchedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_dispatchCommandId_fkey" FOREIGN KEY ("dispatchCommandId") REFERENCES "InventoryCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_unitVersionId_fkey" FOREIGN KEY ("unitVersionId") REFERENCES "ProductUnitVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentReceipt" ADD CONSTRAINT "ShipmentReceipt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentReceipt" ADD CONSTRAINT "ShipmentReceipt_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "InventoryCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentReceipt" ADD CONSTRAINT "ShipmentReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentReceiptItem" ADD CONSTRAINT "ShipmentReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ShipmentReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentReceiptItem" ADD CONSTRAINT "ShipmentReceiptItem_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_counterUserId_fkey" FOREIGN KEY ("counterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_approvalCommandId_fkey" FOREIGN KEY ("approvalCommandId") REFERENCES "InventoryCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_unitVersionId_fkey" FOREIGN KEY ("unitVersionId") REFERENCES "ProductUnitVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_adjustmentMovementId_fkey" FOREIGN KEY ("adjustmentMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
