const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/iam/sync-delta-pull.int-spec.ts', 'utf8');

// 1. Add Role import
if (!c.includes('Role')) {
  c = c.replace(
    "import type { PrismaClient } from '@prisma/client';",
    "import type { PrismaClient, Role } from '@prisma/client';"
  );
}

// 2. Fix role as any
c = c.replace(/role: role as any/g, 'role: role as Role');

// 3. Fix (o: any) => o.id patterns — replace any with { id: string }
c = c.replace(/\(o: any\) => o\.id/g, '(o: { id: string }) => o.id');
c = c.replace(/\(a: any\) => a\.id/g, '(a: { id: string }) => a.id');
c = c.replace(/\(n: any\) => n\.id/g, '(n: { id: string }) => n.id');

// 4. Fix non-null assertions
c = c.replace(/\bbefore!\.(\w+)/g, 'before?.$1');
c = c.replace(/\bafter!\.(\w+)/g, 'after?.$1');
c = c.replace(/\bbeforeDeact!\.(\w+)/g, 'beforeDeact?.$1');
c = c.replace(/\bo1Row!\.(\w+)/g, 'o1Row?.$1');

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/iam/sync-delta-pull.int-spec.ts', c);
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
