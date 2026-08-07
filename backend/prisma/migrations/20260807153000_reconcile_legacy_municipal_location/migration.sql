-- Preserve legacy inventory records while linking active municipal warehouses
-- to the existing organization hierarchy. Historical replacement locations
-- remain inactive instead of being deleted.

DO $$
DECLARE
  repair_at TIMESTAMPTZ := NOW();
  legacy_location RECORD;
  municipality RECORD;
  generated_location RECORD;
  assignment RECORD;
BEGIN
  FOR legacy_location IN
    SELECT location.*
    FROM "InventoryLocation" location
    WHERE location."type" = 'MUNICIPAL_WAREHOUSE'::"InventoryLocationType"
      AND location."active" = TRUE
      AND location."municipioId" IS NULL
  LOOP
    SELECT municipio.*
    INTO municipality
    FROM "Municipio" municipio
    WHERE TRANSLATE(LOWER(TRIM(municipio."name")), 'áéíóúüñ', 'aeiouun') =
          TRANSLATE(
            LOWER(TRIM(REGEXP_REPLACE(legacy_location."name", '^Bodega\s+', '', 'i'))),
            'áéíóúüñ',
            'aeiouun'
          )
    ORDER BY municipio."createdAt", municipio."id"
    LIMIT 1;

    IF municipality."id" IS NULL THEN
      CONTINUE;
    END IF;

    SELECT location.*
    INTO generated_location
    FROM "InventoryLocation" location
    WHERE location."municipioId" = municipality."id"
      AND location."type" = 'MUNICIPAL_WAREHOUSE'::"InventoryLocationType"
      AND location."active" = TRUE
      AND location."id" <> legacy_location."id"
    ORDER BY location."createdAt", location."id"
    LIMIT 1;

    IF generated_location."id" IS NOT NULL THEN
      FOR assignment IN
        SELECT DISTINCT ON (current_assignment."userId") current_assignment.*
        FROM "InventoryLocationAssignment" current_assignment
        WHERE current_assignment."locationId" = generated_location."id"
          AND current_assignment."validFrom" <= repair_at
          AND (current_assignment."validUntil" IS NULL OR current_assignment."validUntil" > repair_at)
        ORDER BY current_assignment."userId", current_assignment."validFrom" DESC, current_assignment."version" DESC
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM "InventoryLocationAssignment" existing
          WHERE existing."locationId" = legacy_location."id"
            AND existing."userId" = assignment."userId"
            AND existing."validFrom" <= repair_at
            AND (existing."validUntil" IS NULL OR existing."validUntil" > repair_at)
        ) THEN
          INSERT INTO "InventoryLocationAssignment" (
            "id",
            "locationId",
            "userId",
            "supervisorId",
            "role",
            "validFrom",
            "version",
            "deviceId",
            "createdAt"
          ) VALUES (
            gen_random_uuid(),
            legacy_location."id",
            assignment."userId",
            assignment."supervisorId",
            assignment."role",
            repair_at,
            assignment."version" + 1,
            assignment."deviceId",
            repair_at
          );
        END IF;
      END LOOP;

      UPDATE "InventoryLocationAssignment"
      SET "validUntil" = repair_at
      WHERE "locationId" = generated_location."id"
        AND "validFrom" <= repair_at
        AND ("validUntil" IS NULL OR "validUntil" > repair_at);

      UPDATE "InventoryLocation"
      SET
        "active" = FALSE,
        "inventoryEnabled" = FALSE,
        "updatedAt" = repair_at
      WHERE "id" = generated_location."id";
    END IF;

    UPDATE "InventoryLocation"
    SET
      "name" = 'Bodega ' || municipality."name",
      "zoneId" = municipality."zoneId",
      "municipioId" = municipality."id",
      "updatedAt" = repair_at
    WHERE "id" = legacy_location."id";
  END LOOP;
END $$;

CREATE UNIQUE INDEX "InventoryLocation_one_active_municipal_warehouse"
ON "InventoryLocation" ("municipioId")
WHERE "type" = 'MUNICIPAL_WAREHOUSE'::"InventoryLocationType"
  AND "active" = TRUE
  AND "municipioId" IS NOT NULL;
