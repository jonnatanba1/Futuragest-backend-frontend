const fs = require('fs');

// Import line to inject into files that need PrismaService
const PRISMA_SERVICE_IMPORT = "import type { PrismaService } from '../../../database/prisma.service';";
const PRISMA_SERVICE_IMPORT_COMPENSACION = "import type { PrismaService } from '../../database/prisma.service';";

// ── scoped-municipio.repository.spec.ts ──────────────────────────────────────
{
  const file = 'C:/DEV/Futuragest/backend/src/modules/iam/infrastructure/scoped-municipio.repository.spec.ts';
  let c = fs.readFileSync(file, 'utf8');
  // Add PrismaService import after last import
  c = c.replace(
    "import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';",
    "import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';\n" + PRISMA_SERVICE_IMPORT
  );
  // Replace all `as any` on makePrisma calls
  c = c.replace(/makePrisma\(delegate\) as any/g, 'makePrisma(delegate) as unknown as PrismaService');
  fs.writeFileSync(file, c);
  console.log('scoped-municipio:', (c.match(/as any/g)||[]).length, 'as any remaining');
}

// ── scoped-zone.repository.spec.ts ───────────────────────────────────────────
{
  const file = 'C:/DEV/Futuragest/backend/src/modules/iam/infrastructure/scoped-zone.repository.spec.ts';
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(
    "import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';",
    "import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';\n" + PRISMA_SERVICE_IMPORT
  );
  c = c.replace(/makePrisma\(delegate\) as any/g, 'makePrisma(delegate) as unknown as PrismaService');
  fs.writeFileSync(file, c);
  console.log('scoped-zone:', (c.match(/as any/g)||[]).length, 'as any remaining');
}

// ── scoped-operario.repository.spec.ts ───────────────────────────────────────
{
  const file = 'C:/DEV/Futuragest/backend/src/modules/iam/infrastructure/scoped-operario.repository.spec.ts';
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(
    "import type { ScopeContextHolder } from '../../auth/domain/scope-context';",
    "import type { ScopeContextHolder } from '../../auth/domain/scope-context';\nimport type { PrismaService } from '../../../database/prisma.service';"
  );
  // The makePrisma() returns `as any` inline — replace with `as unknown as PrismaService`
  c = c.replace(/\} as any;(\s*\n\s*function makeHolder)/, '} as unknown as PrismaService;$1');
  // Also fix inline `) as any` in cases like operario-management
  c = c.replace(/\}\s*as any;(\s*)$/m, '} as unknown as PrismaService;$1');
  fs.writeFileSync(file, c);
  console.log('scoped-operario:', (c.match(/as any/g)||[]).length, 'as any remaining');
}

// ── scoped-attendance.repository.spec.ts ─────────────────────────────────────
{
  const file = 'C:/DEV/Futuragest/backend/src/modules/iam/infrastructure/scoped-attendance.repository.spec.ts';
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(
    "import type { Attendance } from '@prisma/client';",
    "import type { Attendance } from '@prisma/client';\nimport type { PrismaService } from '../../../database/prisma.service';"
  );
  c = c.replace("const prisma = { attendance: delegate } as any;", "const prisma = { attendance: delegate } as unknown as PrismaService;");
  fs.writeFileSync(file, c);
  console.log('scoped-attendance:', (c.match(/as any/g)||[]).length, 'as any remaining');
}
