/**
 * GetSignatureUrlUseCase — returns a presigned GET URL for an attendance signature.
 *
 * AT-19: happy path — calls storage.getPresignedGetUrl with 300s TTL.
 * AT-20: attendance not found → AttendanceNotFoundError (404).
 * AT-21: signatureKey null (not uploaded yet) → AttendanceNotFoundError (404).
 *
 * Scope-gated: scoped findById returns null for out-of-scope records → 404 (fail-closed).
 * Bucket: 'futuragest' (hardcoded per design).
 */

import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { StoragePort } from '../../storage/domain/storage.port';
import { AttendanceNotFoundError } from '../domain/attendance.errors';

const BUCKET = 'futuragest';
const PRESIGNED_TTL_SECONDS = 300;

export interface GetSignatureUrlInput {
  id: string;
}

export interface GetSignatureUrlOutput {
  url: string;
}

export class GetSignatureUrlUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly storage: StoragePort,
  ) {}

  async execute(input: GetSignatureUrlInput): Promise<GetSignatureUrlOutput> {
    // 1. Scoped lookup — null = not found or out of scope → 404
    const attendance = await this.attendanceRepo.findById(input.id);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.id);
    }

    // 2. Signature existence check — null = not yet uploaded → 404
    if (!attendance.signatureKey) {
      throw new AttendanceNotFoundError(`${input.id} (no signature uploaded)`);
    }

    // 3. Get presigned URL (~300s TTL)
    const url = await this.storage.getPresignedGetUrl(
      BUCKET,
      attendance.signatureKey,
      PRESIGNED_TTL_SECONDS,
    );

    return { url };
  }
}
