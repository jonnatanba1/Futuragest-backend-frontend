import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

async function main() {
  const [att, nov, oper, sup, mun, usr, comp] = await Promise.all([
    prisma.attendance.count(),
    prisma.novedad.count(),
    prisma.operario.count(),
    prisma.supervisor.count(),
    prisma.municipio.count(),
    prisma.user.count(),
    prisma.compensationPeriod.count(),
  ]);
  console.log(JSON.stringify({ attendance: att, novedad: nov, operario: oper, supervisor: sup, municipio: mun, user: usr, compensationPeriod: comp }, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
