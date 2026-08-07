-- Municipal warehouses are the municipal stock locations and must be visible
-- to their assigned supervisor/coordinator in the inventory context.
UPDATE "InventoryLocation"
SET "inventoryEnabled" = TRUE,
    "updatedAt" = NOW()
WHERE "active" = TRUE
  AND "type" = 'MUNICIPAL_WAREHOUSE'::"InventoryLocationType"
  AND "inventoryEnabled" = FALSE;

-- Correct receipt result payloads that were marked as discrepancy only because
-- Decimal#isPositive considers zero as positive. Real damage/loss is preserved.
WITH corrected AS (
  SELECT shipment."id"
  FROM "Shipment" shipment
  WHERE shipment."status" = 'DISCREPANCY_REVIEW'::"ShipmentStatus"
    AND NOT EXISTS (
      SELECT 1
      FROM "ShipmentItem" item
      WHERE item."shipmentId" = shipment."id"
        AND (item."damagedBase" <> 0 OR item."lostBase" <> 0)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "ShipmentItem" item
      WHERE item."shipmentId" = shipment."id"
        AND item."receivedBase" + item."damagedBase" + item."lostBase" <> item."quantityBase"
    )
)
UPDATE "ShipmentReceipt" receipt
SET "result" = jsonb_set(receipt."result", '{code}', '"SHIPMENT_RECEIVED"'::jsonb)
FROM corrected
WHERE receipt."shipmentId" = corrected."id"
  AND receipt."result" ->> 'code' = 'SHIPMENT_DISCREPANCY_REVIEW';

WITH corrected AS (
  SELECT shipment."id"
  FROM "Shipment" shipment
  WHERE shipment."status" = 'DISCREPANCY_REVIEW'::"ShipmentStatus"
    AND NOT EXISTS (
      SELECT 1
      FROM "ShipmentItem" item
      WHERE item."shipmentId" = shipment."id"
        AND (item."damagedBase" <> 0 OR item."lostBase" <> 0)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "ShipmentItem" item
      WHERE item."shipmentId" = shipment."id"
        AND item."receivedBase" + item."damagedBase" + item."lostBase" <> item."quantityBase"
    )
)
UPDATE "InventoryCommand" command
SET "result" = jsonb_set(command."result", '{code}', '"SHIPMENT_RECEIVED"'::jsonb)
FROM "ShipmentReceipt" receipt, corrected
WHERE receipt."shipmentId" = corrected."id"
  AND command."id" = receipt."commandId"
  AND command."result" ->> 'code' = 'SHIPMENT_DISCREPANCY_REVIEW';

WITH corrected AS (
  SELECT shipment."id"
  FROM "Shipment" shipment
  WHERE shipment."status" = 'DISCREPANCY_REVIEW'::"ShipmentStatus"
    AND NOT EXISTS (
      SELECT 1
      FROM "ShipmentItem" item
      WHERE item."shipmentId" = shipment."id"
        AND (item."damagedBase" <> 0 OR item."lostBase" <> 0)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "ShipmentItem" item
      WHERE item."shipmentId" = shipment."id"
        AND item."receivedBase" + item."damagedBase" + item."lostBase" <> item."quantityBase"
    )
)
UPDATE "Shipment" shipment
SET "status" = 'RECEIVED'::"ShipmentStatus",
    "completedAt" = COALESCE(
      shipment."completedAt",
      (SELECT MAX(receipt."capturedAtUtc")
       FROM "ShipmentReceipt" receipt
       WHERE receipt."shipmentId" = shipment."id"),
      NOW()
    ),
    "updatedAt" = NOW()
FROM corrected
WHERE shipment."id" = corrected."id";
