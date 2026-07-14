-- Migración de datos: crear Áreas desde Supervisor.area y asignar a Operarios
-- Correr en el servidor de producción contra futuragest-db

-- 1. Crear registros de Area desde los valores del enum Supervisor.area
--    Asumimos zoneId de la zona donde están los supervisores
INSERT INTO "Area" (id, name, "horaInicio", "horaFin", "zoneId", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  s.area,
  '06:00',
  '14:00',
  s."zoneId",
  NOW(),
  NOW()
FROM "Supervisor" s
WHERE s.area IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Area" a WHERE a.name = s.area AND a."zoneId" = s."zoneId"
  )
GROUP BY s.area, s."zoneId";

-- 2. Asignar areaId a cada Operario basado en el area de su Supervisor
UPDATE "Operario" o
SET "areaId" = a.id
FROM "Supervisor" s
JOIN "Area" a ON a.name = s.area AND a."zoneId" = s."zoneId"
WHERE o."supervisorId" = s.id
  AND o."areaId" IS NULL;

-- 3. Verificar
SELECT a.name AS area, a."zoneId", COUNT(o.id) AS operarios
FROM "Area" a
LEFT JOIN "Operario" o ON o."areaId" = a.id
GROUP BY a.name, a."zoneId"
ORDER BY a.name;
