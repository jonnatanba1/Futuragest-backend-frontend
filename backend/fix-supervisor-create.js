const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/iam/supervisor-create.int-spec.ts', 'utf8');

// Replace all !. with ?.
// For `user!.id` used as a value passed to push() or as a where clause, ?.  returns undefined
// which is fine since if the tests reaches this point, user is not null.
// Jest will catch any undefined where string is expected.

c = c.replace(/sup!\.zoneId/g, 'sup?.zoneId');
c = c.replace(/sup!\.municipioId/g, 'sup?.municipioId');
c = c.replace(/sup!\.area/g, 'sup?.area');
c = c.replace(/sup!\.userId/g, 'sup?.userId');

c = c.replace(/user!\.email/g, 'user?.email');
c = c.replace(/user!\.role/g, 'user?.role');
c = c.replace(/user!\.mustChangePassword/g, 'user?.mustChangePassword');
c = c.replace(/user!\.passwordHash/g, 'user?.passwordHash');
c = c.replace(/user!\.id/g, 'user?.id');

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/iam/supervisor-create.int-spec.ts', c);
const remaining = (c.match(/\w!\./g)||[]).length;
console.log('!. remaining:', remaining);
if (remaining > 0) {
  c.split('\n').forEach((l,i) => {
    if (l.match(/\w!\./) && !l.includes('//')) console.log('L'+(i+1)+':', l.trim());
  });
}
