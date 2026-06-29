const fs = require('fs');
let content = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/interface/attendance.controller.spec.ts', 'utf8');

// Add imports for response type and the body types
const importInsert = `import type { Response } from 'express';\nimport { CheckInBody, CheckOutBody } from './attendance.controller';`;
content = content.replace(
  `import type { Attendance } from '@prisma/client';`,
  `import type { Attendance } from '@prisma/client';\nimport type { Response } from 'express';\nimport { CheckInBody, CheckOutBody } from './attendance.controller';`
);

// Replace the mock response definition
content = content.replace(
  `const mockRes = { status: jest.fn().mockReturnThis() } as any;`,
  `const mockRes = { status: jest.fn().mockReturnThis() } as unknown as Response;`
);

// The (err as ConflictException).getResponse() as any pattern - change to unknown
content = content.replace(
  /\.getResponse\(\) as any/g,
  '.getResponse() as Record<string, unknown>'
);

// For body as any and {} as any - use proper types
// checkIn(body as any, ...) -> checkIn(body as CheckInBody, ...)
// checkIn({} as any, ...) -> checkIn({} as CheckInBody, ...)
// checkOut('ATT-1', {} as any, ...) -> checkOut('ATT-1', {} as CheckOutBody, ...)
// checkOut('ATT-1', body as any, ...) -> checkOut('ATT-1', body as CheckOutBody, ...)
content = content.replace(/controller\.checkIn\(body as any,/g, 'controller.checkIn(body as CheckInBody,');
content = content.replace(/controller\.checkIn\(\{\} as any,/g, 'controller.checkIn({} as CheckInBody,');
content = content.replace(/controller\.checkOut\('ATT-1', \{\} as any,/g, "controller.checkOut('ATT-1', {} as CheckOutBody,");
content = content.replace(/controller\.checkOut\('ATT-1', body as any,/g, "controller.checkOut('ATT-1', body as CheckOutBody,");

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/interface/attendance.controller.spec.ts', content);

const remaining = (content.match(/as any/g) || []).length;
console.log('Remaining as any:', remaining);
// Show remaining ones
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('as any')) console.log('L'+(i+1)+':', l.trim());
});
