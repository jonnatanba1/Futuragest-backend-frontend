const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/iam/zone-municipio-crud.int-spec.ts', 'utf8');

// Add Role import
const prismaImport = "import type { PrismaClient } from '@prisma/client';";
if (!c.includes('Role')) {
  c = c.replace(prismaImport, "import type { PrismaClient, Role } from '@prisma/client';");
}

// Fix role as any
c = c.replace(/role: role as any/g, 'role: role as Role');

// Fix non-null assertions
c = c.replace(/row!\.name/g, "row?.name");
c = c.replace(/row!\.zoneId/g, "row?.zoneId");

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/iam/zone-municipio-crud.int-spec.ts', c);
const remaining = (c.match(/as any/g)||[]).length;
const nni = (c.match(/\w!\./g)||[]).length;
console.log('as any remaining:', remaining);
console.log('!. remaining:', nni);
