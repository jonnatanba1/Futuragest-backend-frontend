const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/interface/attendance.controller.spec.ts', 'utf8');
c = c.replace("controller.checkOut('ATT-999', {} as any, mockRes)", "controller.checkOut('ATT-999', {} as CheckOutBody, mockRes)");
fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/interface/attendance.controller.spec.ts', c);
console.log('Remaining as any:', (c.match(/as any/g)||[]).length);
