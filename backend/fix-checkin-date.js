const fs = require('fs');
let c = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/application/check-in-date.spec.ts', 'utf8');

// Add type imports
c = c.replace(
  `import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { Attendance } from '@prisma/client';`,
  `import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { OperarioStatusPort } from '../../iam/domain/ports/operario-status.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type { Attendance } from '@prisma/client';`
);

// Add typed return types to mock factories
c = c.replace(
  `function makeMockOperarioRepo() {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'O1', supervisorId: 'S1' }),
  };
}`,
  `function makeMockOperarioRepo(): { findById: jest.Mock } {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'O1', supervisorId: 'S1' }),
  };
}`
);

c = c.replace(
  `function makeMockStatusPort(isActive: boolean | null = true) {
  return { isActive: jest.fn().mockResolvedValue(isActive) };
}`,
  `function makeMockStatusPort(isActive: boolean | null = true): jest.Mocked<OperarioStatusPort> {
  return { isActive: jest.fn().mockResolvedValue(isActive) };
}`
);

c = c.replace(
  `function makeMockHolder(
  ctx: { supervisorId: string; zoneId: string; role: string } = {
    supervisorId: 'S1',
    zoneId: 'Z1',
    role: 'SUPERVISOR',
  },
) {
  return { current: jest.fn().mockReturnValue(ctx) };
}`,
  `function makeMockHolder(
  ctx: { supervisorId: string; zoneId: string; role: string } = {
    supervisorId: 'S1',
    zoneId: 'Z1',
    role: 'SUPERVISOR',
  },
): Pick<ScopeContextHolder, 'current'> {
  return { current: jest.fn().mockReturnValue(ctx) };
}`
);

// Replace all as any patterns
c = c.replace(/operarioRepo as any/g, 'operarioRepo');
c = c.replace(/holder as any/g, 'holder as ScopeContextHolder');
c = c.replace(/statusPort as any/g, 'statusPort');

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/asistencia/application/check-in-date.spec.ts', c);
console.log('Remaining as any:', (c.match(/as any/g)||[]).length);
