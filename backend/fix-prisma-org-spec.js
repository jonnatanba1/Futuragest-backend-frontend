const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/iam/infrastructure/prisma-org.repository.spec.ts', 'utf8');

// Add PrismaService import
c = c.replace(
  "import type { Zone, Municipio } from '@prisma/client';",
  "import type { Zone, Municipio } from '@prisma/client';\nimport type { PrismaService } from '../../../database/prisma.service';"
);

// Replace prisma as any -> prisma as unknown as PrismaService
c = c.replace(/\bprisma as any\b/g, 'prisma as unknown as PrismaService');

// Replace makeZoneRepo() as any -> makeZoneRepo() as unknown as ScopedZoneRepository
c = c.replace(/\bmakeZoneRepo\(\) as any\b/g, 'makeZoneRepo() as unknown as ScopedZoneRepository');
c = c.replace(/\bzoneRepo as any\b/g, 'zoneRepo as unknown as ScopedZoneRepository');

// Replace makeMunicipioRepo() as any -> makeMunicipioRepo() as unknown as ScopedMunicipioRepository
c = c.replace(/\bmakeMunicipioRepo\(\) as any\b/g, 'makeMunicipioRepo() as unknown as ScopedMunicipioRepository');

// Fix non-null assertions
c = c.replace(/capturedTx!\.user/g, 'capturedTx?.user');

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/iam/infrastructure/prisma-org.repository.spec.ts', c);

const anyRemaining = (c.match(/as any/g)||[]).length;
const nniRemaining = (c.match(/\w!\./g)||[]).length;
console.log('as any remaining:', anyRemaining);
console.log('!. remaining:', nniRemaining);
if (anyRemaining > 0 || nniRemaining > 0) {
  c.split('\n').forEach((l,i) => {
    if ((l.includes('as any') || l.match(/\w!\./)) && !l.includes('//')) {
      console.log('L'+(i+1)+':', l.trim());
    }
  });
}
