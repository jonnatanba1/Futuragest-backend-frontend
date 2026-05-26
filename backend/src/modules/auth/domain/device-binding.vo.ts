/**
 * Auth domain — DeviceBinding value object.
 *
 * Encapsulates the result of a device-binding check.
 */
export class DeviceBinding {
  constructor(
    public readonly deviceId: string,
    public readonly isBound: boolean,
    public readonly isRevoked: boolean,
  ) {}

  get isActive(): boolean {
    return this.isBound && !this.isRevoked;
  }
}
