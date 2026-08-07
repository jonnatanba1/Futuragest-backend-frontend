ALTER TABLE "ShipmentReceipt"
ADD COLUMN "capturedLatitude" DOUBLE PRECISION,
ADD COLUMN "capturedLongitude" DOUBLE PRECISION,
ADD COLUMN "capturedAccuracyM" DOUBLE PRECISION;

ALTER TABLE "ShipmentReceipt"
ADD CONSTRAINT "ShipmentReceipt_gps_pair_check"
CHECK (
  ("capturedLatitude" IS NULL AND "capturedLongitude" IS NULL)
  OR (
    "capturedLatitude" BETWEEN -90 AND 90
    AND "capturedLongitude" BETWEEN -180 AND 180
  )
);

ALTER TABLE "ShipmentReceipt"
ADD CONSTRAINT "ShipmentReceipt_gps_accuracy_check"
CHECK ("capturedAccuracyM" IS NULL OR "capturedAccuracyM" >= 0);
