/**
 * Auth interface — AuthController (T3.9).
 *
 * Endpoints:
 * - POST /auth/login          → LoginUseCase (public)
 * - POST /auth/refresh        → RefreshUseCase (public — carries its own token validation)
 * - POST /auth/change-password → ChangePasswordUseCase (requires JWT, skip mcp check)
 * - DELETE /auth/sessions/:deviceId → RevokeDeviceUseCase (requires JWT)
 *
 * Error mapping:
 * - InvalidCredentialsError → 401
 * - PasswordMismatchError / SamePasswordError → 400
 * - DeviceRevokedError / SessionNotFoundError → 401
 * - MaxDevicesExceededError → 409
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Request,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { LoginUseCase } from '../application/login.use-case';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import { RefreshUseCase } from '../application/refresh.use-case';
import { RevokeDeviceUseCase } from '../application/revoke-device.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import type { RegisterPushTokenUseCase } from '../application/register-push-token.use-case';
import type { UnregisterPushTokenUseCase } from '../application/unregister-push-token.use-case';
import {
  InvalidCredentialsError,
  PasswordMismatchError,
  SamePasswordError,
  DeviceRevokedError,
  DeviceNotBoundError,
  SessionNotFoundError,
  MaxDevicesExceededError,
  UserNotFoundError,
  MissingDeviceContextError,
} from '../domain/auth.errors';
import { LoginDto, ChangePasswordDto, RefreshDto, PushTokenDto } from './dtos';
import { Public } from './public.decorator';
import { SkipMustChangePasswordCheck } from './skip-mcp.decorator';
import type { ScopeContext } from '../domain/scope-context';
import type { MeResponse } from '@futuragest/contracts';
import { ApiOkResponse, ApiNoContentResponse } from '@nestjs/swagger';
import {
  LoginResponseDto,
  RefreshResponseDto,
  MessageResponseDto,
  MeResponseDto,
} from './response-dtos';

// Injection tokens for use cases (bound in AuthModule)
export const LOGIN_USE_CASE = Symbol('LoginUseCase');
export const CHANGE_PASSWORD_USE_CASE = Symbol('ChangePasswordUseCase');
export const REFRESH_USE_CASE = Symbol('RefreshUseCase');
export const REVOKE_DEVICE_USE_CASE = Symbol('RevokeDeviceUseCase');
export const GET_ME_USE_CASE = Symbol('GetMeUseCase');
export const REGISTER_PUSH_TOKEN_USE_CASE = Symbol('RegisterPushTokenUseCase');
export const UNREGISTER_PUSH_TOKEN_USE_CASE = Symbol('UnregisterPushTokenUseCase');

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LOGIN_USE_CASE) private readonly loginUseCase: LoginUseCase,
    @Inject(CHANGE_PASSWORD_USE_CASE) private readonly changePasswordUseCase: ChangePasswordUseCase,
    @Inject(REFRESH_USE_CASE) private readonly refreshUseCase: RefreshUseCase,
    @Inject(REVOKE_DEVICE_USE_CASE) private readonly revokeDeviceUseCase: RevokeDeviceUseCase,
    @Inject(GET_ME_USE_CASE) private readonly getMeUseCase: GetMeUseCase,
    @Inject(REGISTER_PUSH_TOKEN_USE_CASE) private readonly registerPushTokenUseCase: RegisterPushTokenUseCase,
    @Inject(UNREGISTER_PUSH_TOKEN_USE_CASE) private readonly unregisterPushTokenUseCase: UnregisterPushTokenUseCase,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  async login(@Body() dto: LoginDto) {
    try {
      return await this.loginUseCase.execute({
        email: dto.email,
        password: dto.password,
        deviceId: dto.deviceId,
        deviceLabel: dto.deviceLabel,
      });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new UnauthorizedException('Correo o contraseña incorrectos');
      }
      throw err;
    }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RefreshResponseDto })
  async refresh(@Body() dto: RefreshDto) {
    try {
      return await this.refreshUseCase.execute({
        userId: dto.userId,
        deviceId: dto.deviceId,
        refreshToken: dto.refreshToken,
      });
    } catch (err) {
      if (err instanceof DeviceRevokedError || err instanceof DeviceNotBoundError) {
        throw new UnauthorizedException('Token de actualización inválido o revocado');
      }
      throw err;
    }
  }

  @SkipMustChangePasswordCheck()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MessageResponseDto })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Request() req: { user: ScopeContext },
  ) {
    try {
      await this.changePasswordUseCase.execute({
        userId: req.user.userId,
        oldPassword: dto.oldPassword,
        newPassword: dto.newPassword,
      });
      return { message: 'Contraseña cambiada correctamente' };
    } catch (err) {
      if (err instanceof PasswordMismatchError) {
        throw new BadRequestException('La contraseña actual es incorrecta');
      }
      if (err instanceof SamePasswordError) {
        throw new BadRequestException('La contraseña nueva debe ser distinta de la actual');
      }
      throw err;
    }
  }

  @SkipMustChangePasswordCheck()
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MeResponseDto })
  async getMe(@Request() req: { user: ScopeContext }): Promise<MeResponse> {
    try {
      return await this.getMeUseCase.execute({ userId: req.user.userId });
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        throw new NotFoundException('Usuario no encontrado');
      }
      throw err;
    }
  }

  /**
   * POST /auth/push-token
   * Register or update the caller's push notification token for their current device session.
   * userId and deviceId are always resolved from the JWT (ScopeContext), never from the body.
   * Returns 204 No Content on success.
   * Returns 400 if pushToken is missing or empty (class-validator).
   * Returns 401 if unauthenticated (AuthGuard) or if the JWT carries no deviceId.
   */
  @Post('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Push token registered successfully' })
  async registerPushToken(
    @Body() dto: PushTokenDto,
    @Request() req: { user: ScopeContext },
  ): Promise<void> {
    try {
      // deviceId may be absent on deviceId-less JWTs — the use case validates and rejects.
      await this.registerPushTokenUseCase.execute({
        userId: req.user.userId,
        deviceId: req.user.deviceId,
        pushToken: dto.pushToken,
        pushPlatform: dto.pushPlatform,
      });
    } catch (err) {
      if (err instanceof MissingDeviceContextError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /auth/push-token
   * Unregister (clear) the caller's push notification token for their current device session.
   * userId and deviceId are always resolved from the JWT (ScopeContext), never from the body.
   * Carries NO request body. Returns 204 No Content on success.
   * Returns 401 if unauthenticated (AuthGuard) or if the JWT carries no deviceId.
   * Idempotent: clearing an already-null token is a no-op (still 204).
   */
  @Delete('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Push token unregistered successfully' })
  async unregisterPushToken(@Request() req: { user: ScopeContext }): Promise<void> {
    try {
      // deviceId may be absent on deviceId-less JWTs — the use case validates and rejects.
      await this.unregisterPushTokenUseCase.execute({
        userId: req.user.userId,
        deviceId: req.user.deviceId,
      });
    } catch (err) {
      if (err instanceof MissingDeviceContextError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }
  }

  @Delete('sessions/:deviceId')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MessageResponseDto })
  async revokeSession(
    @Param('deviceId') deviceId: string,
    @Request() req: { user: ScopeContext },
  ) {
    try {
      await this.revokeDeviceUseCase.execute({
        userId: req.user.userId,
        deviceId,
      });
      return { message: 'Sesión del dispositivo revocada' };
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        throw new UnauthorizedException('Sesión no encontrada');
      }
      if (err instanceof MaxDevicesExceededError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
