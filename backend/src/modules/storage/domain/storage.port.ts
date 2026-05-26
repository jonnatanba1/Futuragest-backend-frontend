export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoragePort {
  putObject(
    bucket: string,
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<void>;

  getPresignedGetUrl(
    bucket: string,
    key: string,
    expirySeconds?: number,
  ): Promise<string>;

  getPresignedPutUrl(
    bucket: string,
    key: string,
    expirySeconds?: number,
  ): Promise<string>;

  removeObject(bucket: string, key: string): Promise<void>;
}
