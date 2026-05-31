import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/interface/auth.guard';
import { MustChangePasswordGuard } from './modules/auth/interface/must-change-password.guard';
import { IamModule } from './modules/iam/iam.module';
import { RolesGuard } from './modules/iam/interface/roles.guard';
import { StorageModule } from './modules/storage/storage.module';
import { AsistenciaModule } from './modules/asistencia/asistencia.module';
import { NovedadesModule } from './modules/novedades/novedades.module';

@Module({
  imports: [
    // ConfigModule must be first — other modules depend on ConfigService
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    IamModule,
    StorageModule,
    AsistenciaModule,
    NovedadesModule,
  ],
  controllers: [AppController],
  providers: [
    // Global guards — NestJS resolves these from the module graph.
    // Guard order matters: AuthGuard runs first (sets ScopeContext),
    // then MustChangePasswordGuard, then RolesGuard (reads ScopeContext).
    {
      provide: APP_GUARD,
      useExisting: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: MustChangePasswordGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
  ],
})
export class AppModule {}
