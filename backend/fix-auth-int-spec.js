const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/auth/auth.int-spec.ts', 'utf8');

// Pattern 1: adminUser!.id where adminUser was returned by findUnique (nullable)
// Replace with adminUser?.id
c = c.replace(/adminUser!\.id/g, 'adminUser?.id');

// Pattern 2: session!.refreshTokenHash, session!.revokedAt
c = c.replace(/session!\.refreshTokenHash/g, 'session?.refreshTokenHash');
c = c.replace(/session!\.revokedAt/g, 'session?.revokedAt');

// Pattern 3: updated!.mustChangePassword
c = c.replace(/updated!\.mustChangePassword/g, 'updated?.mustChangePassword');

// Pattern 4: adminUser!.id in refresh payload
// Already handled above

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/auth/auth.int-spec.ts', c);
const remaining = (c.match(/[a-zA-Z\d\])]!\./g)||[]).length;
console.log('Remaining !. assertions:', remaining);
const lines = c.split('\n');
lines.forEach((l,i) => {
  if (l.match(/\w!\./) && !l.includes('//')) console.log('L'+(i+1)+':', l.trim());
});
