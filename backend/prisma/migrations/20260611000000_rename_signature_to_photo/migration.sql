-- Rename signature columns to photo columns on the Attendance table.
ALTER TABLE "Attendance" RENAME COLUMN "signatureKey" TO "checkInPhotoKey";
ALTER TABLE "Attendance" RENAME COLUMN "checkOutSignatureKey" TO "checkOutPhotoKey";
