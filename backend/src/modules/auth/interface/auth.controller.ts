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
import {
  InvalidCredentialsError,
  PasswordMismatchError,
  SamePasswordError,
  DeviceRevokedError,
  DeviceNotBoundError,
  SessionNotFoundError,
  MaxDevicesExceededError,
  UserNotFoundError,
} from '../domain/auth.errors';
import { LoginDto, ChangePasswordDto, RefreshDto } from './dtos';
import { Public } from './public.decorator';
import { SkipMustChangePasswordCheck } from './skip-mcp.decorator';
import type { ScopeContext } from '../domain/scope-context';
import type { MeResponse } from '@futuragest/contracts';

// Injection tokens for use cases (bound in AuthModule)
export const LOGIN_USE_CASE = Symbol('LoginUseCase');
export const CHANGE_PASSWORD_USE_CASE = Symbol('ChangePasswordUseCase');
export const REFRESH_USE_CASE = Symbol('RefreshUseCase');
export const REVOKE_DEVICE_USE_CASE = Symbol('RevokeDeviceUseCase');
export const GET_ME_USE_CASE = Symbol('GetMeUseCase');

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LOGIN_USE_CASE) private readonly loginUseCase: LoginUseCase,
    @Inject(CHANGE_PASSWORD_USE_CASE) private readonly changePasswordUseCase: ChangePasswordUseCase,
    @Inject(REFRESH_USE_CASE) private readonly refreshUseCase: RefreshUseCase,
    @Inject(REVOKE_DEVICE_USE_CASE) private readonly revokeDeviceUseCase: RevokeDeviceUseCase,
    @Inject(GET_ME_USE_CASE) private readonly getMeUseCase: GetMeUseCase,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
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
        throw new UnauthorizedException('Invalid email or password');
      }
      throw err;
    }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    try {
      return await this.refreshUseCase.execute({
        userId: dto.userId,
        deviceId: dto.deviceId,
        refreshToken: dto.refreshToken,
      });
    } catch (err) {
      if (err instanceof DeviceRevokedError || err instanceof DeviceNotBoundError) {
        throw new UnauthorizedException('Invalid or revoked refresh token');
      }
      throw err;
    }
  }

  @SkipMustChangePasswordCheck()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
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
      return { message: 'Password changed successfully' };
    } catch (err) {
      if (err instanceof PasswordMismatchError) {
        throw new BadRequestException('Current password is incorrect');
      }
      if (err instanceof SamePasswordError) {
        throw new BadRequestException('New password must differ from the current password');
      }
      throw err;
    }
  }

  @SkipMustChangePasswordCheck()
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@Request() req: { user: ScopeContext }): Promise<MeResponse> {
    try {
      return await this.getMeUseCase.execute({ userId: req.user.userId });
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        throw new NotFoundException('User not found');
      }
      throw err;
    }
  }

  @Delete('sessions/:deviceId')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param('deviceId') deviceId: string,
    @Request() req: { user: ScopeContext },
  ) {
    try {
      await this.revokeDeviceUseCase.execute({
        userId: req.user.userId,
        deviceId,
      });
      return { message: 'Device session revoked' };
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        throw new UnauthorizedException('Session not found');
      }
      if (err instanceof MaxDevicesExceededError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
