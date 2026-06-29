const { execSync } = require('child_process');
const files = [
  'src/modules/iam/infrastructure/prisma-org.repository.spec.ts',
  'src/modules/iam/operario-management.int-spec.ts',
  'src/modules/iam/sync-delta-pull.int-spec.ts',
  'src/modules/iam/supervisor-create.int-spec.ts',
  'src/modules/iam/zone-municipio-crud.int-spec.ts',
  'src/modules/auth/auth.int-spec.ts',
  'src/modules/iam/infrastructure/scoped-municipio.repository.spec.ts',
  'src/modules/iam/infrastructure/scoped-zone.repository.spec.ts',
  'src/modules/compensacion/compensacion.int-spec.ts',
  'src/database/schema.int-spec.ts',
  'src/modules/iam/application/provision-management-user.use-case.spec.ts',
  'src/modules/iam/infrastructure/jornada-policy.repository.spec.ts',
  'src/modules/iam/infrastructure/scoped-operario.repository.spec.ts',
  'src/modules/asistencia/domain/ports/attendance-repository.port.spec.ts',
  'src/modules/compensacion/application/confirm-period-payout.use-case.spec.ts',
  'src/modules/asistencia/domain/attendance.errors.spec.ts',
  'src/modules/iam/interface/operario.controller.spec.ts',
  'src/modules/iam/infrastructure/scoped-attendance.repository.spec.ts',
  'src/modules/iam/application/bulk-import-operarios.use-case.spec.ts',
];

const raw = execSync(
  'pnpm exec eslint --format json ' + files.join(' '),
  { cwd: 'C:/DEV/Futuragest/backend', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
).replace(/^﻿/, '');

const idx = raw.indexOf('[');
const results = JSON.parse(raw.slice(idx));
for (const f of results) {
  if (f.messages.length) {
    const short = f.filePath.replace(/.*\\src\\/, 'src/').replace(/\\/g, '/');
    console.log('\n---', short);
    for (const m of f.messages) {
      console.log('  L' + m.line + ': [' + m.ruleId + ']', m.message.slice(0, 90));
    }
  }
}
console.log('\nDone.');
