-- AlterTable
ALTER TABLE "Operario" ADD COLUMN     "areaId" TEXT;

-- AddForeignKey
ALTER TABLE "Operario" ADD CONSTRAINT "Operario_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
