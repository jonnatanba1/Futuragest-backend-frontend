/**
 * Auth interface — Request/Response DTOs with class-validator decorators.
 *
 * @ApiProperty decorators feed the OpenAPI schema (read at runtime by
 * SwaggerModule) so the generated client types are real, not empty stubs.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'user@futuragest.co' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ description: 'Stable per-device id' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiPropertyOptional({ description: 'Human-readable device label' })
  @IsString()
  @IsOptional()
  deviceLabel?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({ description: 'Opaque refresh token from login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class PushTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pushToken!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pushPlatform?: string;
}
