const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/asistencia.int-spec.ts', 'utf8');

// Fix 1: Add Role import
c = c.replace(
  `import type { PrismaClient } from '@prisma/client';`,
  `import type { PrismaClient, Role } from '@prisma/client';`
);

// Fix 2: role as any → role as Role
c = c.replace(/role: role as any/g, 'role: role as Role');

// Fix 3: tokenCoord unused var → prefix with _
// Remove the unused let declaration and the assignment
c = c.replace(
  `  let tokenCoord: string; // alias for tokenC1\n`,
  `  let _tokenCoord: string; // alias for tokenC1 — retained for potential future use\n`
);
c = c.replace('    tokenCoord = tokenC1;', '    _tokenCoord = tokenC1;');

// Fix 4: resp.body as any → resp.body as Record<string, unknown>
c = c.replace(/resp\.body as any/g, 'resp.body as Record<string, unknown>');
c = c.replace(/first\.body as any/g, 'first.body as Record<string, unknown>');
c = c.replace(/second\.body as any/g, 'second.body as Record<string, unknown>');
c = c.replace(/res\.body as any/g, 'res.body as Record<string, unknown>');
c = c.replace(/\.body as any\b/g, '.body as Record<string, unknown>');

// Fix 5: non-null assertion for prisma.operario.findUnique result
// op!.deactivatedAt → use a null check
c = c.replace(
  `const op = await prisma.operario.findUnique({ where: { id: activeOpId } });\n      expect(op!.deactivatedAt).toBeNull();`,
  `const op = await prisma.operario.findUnique({ where: { id: activeOpId } });\n      expect(op?.deactivatedAt).toBeNull();`
);

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/asistencia.int-spec.ts', c);

const remaining = (c.match(/as any/g)||[]).length;
const nni = (c.match(/[^?]!/g)||[]).length;
console.log('Remaining as any:', remaining);

// Show remaining
const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('as any') || (l.includes('!') && !l.includes('!='))) {
    if (l.includes('as any')) console.log('L'+(i+1)+':', l.trim());
  }
});
