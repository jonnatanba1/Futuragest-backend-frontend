/**
 * Cleans all transactional test data from the dev DB.
 * Preserves: operarios, supervisors, municipios, users, compensationPeriods.
 * Removes:   attendance, novedad.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

async function main() {
  // Novedad references Attendance via FK — must delete child before parent.
  const delNov = await prisma.novedad.deleteMany({});
  const delAtt = await prisma.attendance.deleteMany({});

  console.log(`Deleted novedades:   ${delNov.count}`);
  console.log(`Deleted attendance:  ${delAtt.count}`);

  const [oper, sup, mun, usr] = await Promise.all([
    prisma.operario.count(),
    prisma.supervisor.count(),
    prisma.municipio.count(),
    prisma.user.count(),
  ]);

  console.log('\nRemaining (untouched):');
  console.log(`  operario:  ${oper}`);
  console.log(`  supervisor: ${sup}`);
  console.log(`  municipio:  ${mun}`);
  console.log(`  user:       ${usr}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
