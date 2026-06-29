const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/iam/operario-management.int-spec.ts', 'utf8');
const original = c;

// 1. Add Role import
if (!c.includes('import type { PrismaClient, Role }')) {
  c = c.replace(
    "import type { PrismaClient } from '@prisma/client';",
    "import type { PrismaClient, Role } from '@prisma/client';"
  );
}

// 2. Fix role as any
c = c.replace(/role: role as any/g, 'role: role as Role');

// 3. Fix unused vars: s1UserId, s2UserId — remove declarations and assignments
// L94: let s1UserId: string;
c = c.replace('  let s1UserId: string;\n', '');
c = c.replace('  let s2UserId: string;\n', '');
// L202: s1UserId = s1.userId;
c = c.replace('    s1UserId = s1.userId;\n', '');
// L207: s2UserId = s2.userId;
c = c.replace('    s2UserId = s2.userId;\n', '');

// 4. Fix unused id at L312
c = c.replace('    const id = await createOperario(s1Id, documento, ', '    await createOperario(s1Id, documento, ');

// 5. Fix all non-null assertions with optional chaining
// Pattern: row!.xxx, created!.xxx, beforeRow!.xxx, afterRow!.xxx
c = c.replace(/\brow!\.(\w+)/g, 'row?.$1');
c = c.replace(/\bcreated!\.(\w+)/g, 'created?.$1');
c = c.replace(/\bbeforeRow!\.(\w+)/g, 'beforeRow?.$1');
c = c.replace(/\bafterRow!\.(\w+)/g, 'afterRow?.$1');

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/iam/operario-management.int-spec.ts', c);
const anyRemaining = (c.match(/as any/g)||[]).length;
const nniRemaining = (c.match(/\w!\./g)||[]).length;
console.log('as any remaining:', anyRemaining);
console.log('!. remaining:', nniRemaining);
if (nniRemaining > 0 || anyRemaining > 0) {
  c.split('\n').forEach((l,i) => {
    if ((l.includes('as any') || l.match(/\w!\./)) && !l.includes('//')) {
      console.log('L'+(i+1)+':', l.trim());
    }
  });
}
