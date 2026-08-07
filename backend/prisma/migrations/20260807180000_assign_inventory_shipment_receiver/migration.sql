-- Bind every new municipal shipment to one existing responsible person.
ALTER TABLE "Shipment"
ADD COLUMN "receiverUserId" TEXT;

ALTER TABLE "ShipmentReceipt"
ADD COLUMN "verificationMethod" "VerificationMethod",
ADD COLUMN "verificationReason" TEXT,
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "capturedAtUtc" TIMESTAMP(3),
ADD COLUMN "capturedOffsetMin" INTEGER;

-- Preserve legacy shipments by selecting an existing destination assignee.
-- Preference order: explicit receiver, custodian, municipal supervisor,
-- then the coordinator of the destination zone. No identity is created.
UPDATE "Shipment" shipment
SET "receiverUserId" = (
  SELECT selected."userId"
  FROM (
    SELECT assignment."userId", 1 AS priority, assignment."validFrom" AS effective_at
    FROM "InventoryLocationAssignment" assignment
    JOIN "InventoryLocation" location
      ON location."id" = assignment."locationId"
    JOIN "User" app_user
      ON app_user."id" = assignment."userId"
    LEFT JOIN "Supervisor" supervisor
      ON supervisor."userId" = app_user."id"
    WHERE assignment."locationId" = shipment."destinationLocationId"
      AND assignment."validUntil" IS NULL
      AND assignment."role" = 'RECEIVER'
      AND (
        (
          app_user."role" = 'SUPERVISOR'
          AND supervisor."municipioId" = location."municipioId"
          AND supervisor."zoneId" = location."zoneId"
        )
        OR (
          app_user."role" = 'COORDINADOR'
          AND app_user."coordinatedZoneId" = location."zoneId"
        )
      )

    UNION ALL

    SELECT assignment."userId", 2 AS priority, assignment."validFrom" AS effective_at
    FROM "InventoryLocationAssignment" assignment
    JOIN "InventoryLocation" location
      ON location."id" = assignment."locationId"
    JOIN "User" app_user
      ON app_user."id" = assignment."userId"
    LEFT JOIN "Supervisor" supervisor
      ON supervisor."userId" = app_user."id"
    WHERE assignment."locationId" = shipment."destinationLocationId"
      AND assignment."validUntil" IS NULL
      AND assignment."role" = 'CUSTODIAN'
      AND (
        (
          app_user."role" = 'SUPERVISOR'
          AND supervisor."municipioId" = location."municipioId"
          AND supervisor."zoneId" = location."zoneId"
        )
        OR (
          app_user."role" = 'COORDINADOR'
          AND app_user."coordinatedZoneId" = location."zoneId"
        )
      )

    UNION ALL

    SELECT supervisor."userId", 3 AS priority, supervisor."createdAt" AS effective_at
    FROM "InventoryLocation" location
    JOIN "Supervisor" supervisor
      ON supervisor."municipioId" = location."municipioId"
     AND supervisor."zoneId" = location."zoneId"
    WHERE location."id" = shipment."destinationLocationId"

    UNION ALL

    SELECT app_user."id" AS "userId", 4 AS priority, app_user."createdAt" AS effective_at
    FROM "InventoryLocation" location
    JOIN "User" app_user
      ON app_user."role" = 'COORDINADOR'
     AND app_user."coordinatedZoneId" = location."zoneId"
    WHERE location."id" = shipment."destinationLocationId"
  ) selected
  ORDER BY selected.priority, selected.effective_at DESC, selected."userId"
  LIMIT 1
)
WHERE shipment."receiverUserId" IS NULL;

CREATE INDEX "Shipment_receiverUserId_status_idx"
ON "Shipment"("receiverUserId", "status");

ALTER TABLE "Shipment"
ADD CONSTRAINT "Shipment_receiverUserId_fkey"
FOREIGN KEY ("receiverUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
