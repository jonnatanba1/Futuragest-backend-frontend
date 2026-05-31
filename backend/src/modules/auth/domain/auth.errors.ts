/**
 * Auth domain errors.
 *
 * Domain-level error classes. Use cases throw these;
 * the interface layer maps them to HTTP status codes.
 */

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class PasswordMismatchError extends Error {
  constructor() {
    super('Current password is incorrect');
    this.name = 'PasswordMismatchError';
  }
}

export class SamePasswordError extends Error {
  constructor() {
    super('New password must differ from the current password');
    this.name = 'SamePasswordError';
  }
}

export class DeviceNotBoundError extends Error {
  constructor(deviceId: string) {
    super(`Device '${deviceId}' is not bound to this user`);
    this.name = 'DeviceNotBoundError';
  }
}

export class DeviceRevokedError extends Error {
  constructor(deviceId: string) {
    super(`Device '${deviceId}' has been revoked`);
    this.name = 'DeviceRevokedError';
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found');
    this.name = 'SessionNotFoundError';
  }
}

export class MaxDevicesExceededError extends Error {
  constructor(max: number) {
    super(`Maximum number of active devices (${max}) exceeded`);
    this.name = 'MaxDevicesExceededError';
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}
