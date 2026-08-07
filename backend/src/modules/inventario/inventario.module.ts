import { Module, Scope } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { SCOPE_CONTEXT_HOLDER, type ScopeContextHolder } from '../auth/domain/scope-context';
import { IamModule } from '../iam/iam.module';
import { SyncInventoryUseCase } from './application/sync-inventory.use-case';
import { GetInventoryContextUseCase } from './application/get-inventory-context.use-case';
import {
  INVENTORY_COMMAND_REPOSITORY,
  type InventoryCommandRepositoryPort,
} from './domain/inventory-command';
import {
  INVENTORY_CONTEXT_REPOSITORY,
  type InventoryContextRepositoryPort,
} from './domain/inventory-context';
import { PrismaInventoryCommandRepository } from './infrastructure/prisma-inventory-command.repository';
import { PrismaInventoryContextRepository } from './infrastructure/prisma-inventory-context.repository';
import {
  GET_INVENTORY_CONTEXT_USE_CASE,
  InventoryController,
  SYNC_INVENTORY_USE_CASE,
} from './interface/inventory.controller';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: INVENTORY_COMMAND_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInventoryCommandRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INVENTORY_CONTEXT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInventoryContextRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: SYNC_INVENTORY_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repository: InventoryCommandRepositoryPort, holder: ScopeContextHolder) =>
        new SyncInventoryUseCase(repository, holder),
      inject: [INVENTORY_COMMAND_REPOSITORY, SCOPE_CONTEXT_HOLDER],
    },
    {
      provide: GET_INVENTORY_CONTEXT_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repository: InventoryContextRepositoryPort, holder: ScopeContextHolder) =>
        new GetInventoryContextUseCase(repository, holder),
      inject: [INVENTORY_CONTEXT_REPOSITORY, SCOPE_CONTEXT_HOLDER],
    },
  ],
})
export class InventarioModule {}
