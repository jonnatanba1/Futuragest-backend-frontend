import 'dotenv/config';
import { createPrismaClient } from './src/database/prisma-client';
import * as argon2 from 'argon2';

const prisma = createPrismaClient();

async function main() {
  console.log('Iniciando actualización de contraseñas de supervisores...');
  
  const supervisors = await prisma.user.findMany({
    where: { role: 'SUPERVISOR' },
  });

  console.log(`Se encontraron ${supervisors.length} supervisores.`);

  for (const user of supervisors) {
    const newHash = await argon2.hash('Futuraseo');
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        passwordHash: newHash,
        mustChangePassword: true,
      },
    });
    console.log(`Contraseña actualizada para el supervisor: ${user.email}`);
  }

  console.log('Actualización completada.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
