/**
 * Auth domain errors.
 *
 * Domain-level error classes. Use cases throw these;
 * the interface layer maps them to HTTP status codes.
 */

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Correo o contraseña incorrectos');
    this.name = 'InvalidCredentialsError';
  }
}

export class PasswordMismatchError extends Error {
  constructor() {
    super('La contraseña actual es incorrecta');
    this.name = 'PasswordMismatchError';
  }
}

export class SamePasswordError extends Error {
  constructor() {
    super('La contraseña nueva debe ser distinta de la actual');
    this.name = 'SamePasswordError';
  }
}

export class DeviceNotBoundError extends Error {
  constructor(deviceId: string) {
    super(`El dispositivo '${deviceId}' no está vinculado a este usuario`);
    this.name = 'DeviceNotBoundError';
  }
}

export class DeviceRevokedError extends Error {
  constructor(deviceId: string) {
    super(`El dispositivo '${deviceId}' ha sido revocado`);
    this.name = 'DeviceRevokedError';
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super('Sesión no encontrada');
    this.name = 'SessionNotFoundError';
  }
}

export class MaxDevicesExceededError extends Error {
  constructor(max: number) {
    super(`Se superó el número máximo de dispositivos activos (${max})`);
    this.name = 'MaxDevicesExceededError';
  }
}

export class MissingDeviceContextError extends Error {
  constructor() {
    super('Se requiere una sesión vinculada a un dispositivo para gestionar tokens de notificación');
    this.name = 'MissingDeviceContextError';
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('Usuario no encontrado');
    this.name = 'UserNotFoundError';
  }
}
