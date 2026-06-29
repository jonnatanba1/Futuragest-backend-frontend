const fs = require('fs');

function fixFile(path, extraFixes) {
  let c = fs.readFileSync(path, 'utf8');

  // Common fixes
  // 1. role as any → role as Role (with import)
  if (c.includes('role: role as any') || c.includes('role: data.role as any') || c.includes('role as any')) {
    if (!c.includes("import type { PrismaClient, Role }") && !c.includes("import { Role }")) {
      c = c.replace(
        `import type { PrismaClient } from '@prisma/client';`,
        `import type { PrismaClient, Role } from '@prisma/client';`
      );
      if (!c.includes('import type { PrismaClient }')) {
        // Try other import patterns
        c = c.replace(
          `import type { PrismaClient, Operario } from '@prisma/client';`,
          `import type { PrismaClient, Operario, Role } from '@prisma/client';`
        );
        c = c.replace(
          `import type { PrismaClient, Supervisor } from '@prisma/client';`,
          `import type { PrismaClient, Supervisor, Role } from '@prisma/client';`
        );
      }
    }
    c = c.replace(/\brole: role as any\b/g, 'role: role as Role');
    c = c.replace(/\brole: data\.role as any\b/g, 'role: data.role as Role');
  }

  // 2. resp.body as any / first.body as any / etc → Record<string, unknown>
  c = c.replace(/\b(\w+)\.body as any\b/g, '$1.body as Record<string, unknown>');

  // 3. Unused vars - prefix with _
  // This is handled per-file in extraFixes

  // 4. Non-null assertions after expect(x).not.toBeNull() - use optional chaining
  // Pattern: x!.field -> x?.field
  // But only in test files where it's safe

  if (extraFixes) extraFixes(c, (newC) => { c = newC; });

  fs.writeFileSync(path, c);
  const remaining = (c.match(/as any/g)||[]).length;
  return remaining;
}

// Fix org-management.int-spec.ts
{
  let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/iam/org-management.int-spec.ts', 'utf8');

  // Add Role import
  c = c.replace(
    `import type { PrismaClient } from '@prisma/client';`,
    `import type { PrismaClient, Role } from '@prisma/client';`
  );
  c = c.replace('role: role as any', 'role: role as Role');

  // Fix body as any
  c = c.replace(/\.body as any\b/g, '.body as Record<string, unknown>');

  // Fix unused vars - prefix coordBajoCaucaUserId, createdDeviceSessions, resp
  c = c.replace('  let coordBajoCaucaUserId: string;', '  let _coordBajoCaucaUserId: string;');
  c = c.replace('  const createdDeviceSessions: string[] = [];', '  const _createdDeviceSessions: string[] = [];');
  // resp is assigned but not used - prefix with _
  c = c.replace('      const resp = await request(app.getHttpServer())\n        .post(\'/org/coordinadores/assign\')',
                '      const _resp = await request(app.getHttpServer())\n        .post(\'/org/coordinadores/assign\')');

  // Fix assignments that reference these vars
  c = c.replace(/\bcoordBajoCaucaUserId\s*=/g, '_coordBajoCaucaUserId =');

  // Fix non-null assertions after expect(user).not.toBeNull()
  // user!.xxx -> user?.xxx  (safe: if user is null, ?.xxx returns undefined which will fail toBe checks)
  c = c.replace(/expect\(user!\.(\w+)\)/g, 'expect(user?.$1)');

  fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/iam/org-management.int-spec.ts', c);
  console.log('org-management: remaining as any:', (c.match(/as any/g)||[]).length);
  console.log('  nni remaining:', (c.match(/[a-z\d\])]!\.|\]!,|\]!\)/g)||[]).length);
}
