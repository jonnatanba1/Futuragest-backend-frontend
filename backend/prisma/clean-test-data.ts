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
  // Clear all transactional and period tables in FK-safe order
  const delNov = await prisma.novedad.deleteMany({});
  const delCompRest = await prisma.compensatoryRest.deleteMany({});
  const delBreak = await prisma.attendanceBreakdown.deleteMany({});
  const delAtt = await prisma.attendance.deleteMany({});
  const delPeriod = await prisma.compensationPeriod.deleteMany({});

  console.log(`Deleted novedades:           ${delNov.count}`);
  console.log(`Deleted compensatory rests:  ${delCompRest.count}`);
  console.log(`Deleted breakdowns:          ${delBreak.count}`);
  console.log(`Deleted attendance:          ${delAtt.count}`);
  console.log(`Deleted compensation periods:${delPeriod.count}`);

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
