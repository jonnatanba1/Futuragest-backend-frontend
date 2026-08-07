-- Link the existing organization hierarchy to inventory without creating
-- duplicate Municipio, Supervisor, or User records.

INSERT INTO "InventoryLocation" (
  "id",
  "code",
  "name",
  "type",
  "zoneId",
  "municipioId",
  "active",
  "inventoryEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'MW-' || UPPER(REPLACE(m."id", '-', '')),
  'Bodega ' || m."name",
  'MUNICIPAL_WAREHOUSE'::"InventoryLocationType",
  m."zoneId",
  m."id",
  TRUE,
  FALSE,
  NOW(),
  NOW()
FROM "Municipio" m
WHERE NOT EXISTS (
  SELECT 1
  FROM "InventoryLocation" location
  WHERE location."municipioId" = m."id"
    AND location."type" = 'MUNICIPAL_WAREHOUSE'::"InventoryLocationType"
);

INSERT INTO "InventoryLocationAssignment" (
  "id",
  "locationId",
  "userId",
  "supervisorId",
  "role",
  "validFrom",
  "version",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  location."id",
  supervisor."userId",
  supervisor."id",
  'CUSTODIAN'::"InventoryAssignmentRole",
  NOW(),
  1,
  NOW()
FROM "Supervisor" supervisor
JOIN LATERAL (
  SELECT candidate."id"
  FROM "InventoryLocation" candidate
  WHERE candidate."municipioId" = supervisor."municipioId"
    AND candidate."type" = 'MUNICIPAL_WAREHOUSE'::"InventoryLocationType"
  ORDER BY candidate."createdAt" ASC, candidate."id" ASC
  LIMIT 1
) location ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM "InventoryLocationAssignment" assignment
  WHERE assignment."locationId" = location."id"
    AND assignment."userId" = supervisor."userId"
    AND assignment."supervisorId" = supervisor."id"
    AND assignment."validFrom" <= NOW()
    AND (assignment."validUntil" IS NULL OR assignment."validUntil" > NOW())
);
