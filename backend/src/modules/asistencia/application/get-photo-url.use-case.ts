/**
 * GetPhotoUrlUseCase — returns a presigned GET URL for an attendance photo.
 *
 * AT-19: happy path — calls storage.getPresignedGetUrl with 300s TTL.
 * AT-20: attendance not found → AttendanceNotFoundError (404).
 * AT-21: checkInPhotoKey null (not uploaded yet) → AttendanceNotFoundError (404).
 *
 * Scope-gated: scoped findById returns null for out-of-scope records → 404 (fail-closed).
 * Bucket: 'futuragest' (hardcoded per design).
 */

import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { StoragePort } from '../../storage/domain/storage.port';
import { AttendanceNotFoundError } from '../domain/attendance.errors';

const BUCKET = 'futuragest';
const PRESIGNED_TTL_SECONDS = 300;

export interface GetPhotoUrlInput {
  id: string;
  /** Which photo to fetch. Defaults to 'checkin'. */
  phase?: 'checkin' | 'checkout';
}

export interface GetPhotoUrlOutput {
  url: string;
}

export class GetPhotoUrlUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly storage: StoragePort,
  ) {}

  async execute(input: GetPhotoUrlInput): Promise<GetPhotoUrlOutput> {
    // 1. Scoped lookup — null = not found or out of scope → 404
    const attendance = await this.attendanceRepo.findById(input.id);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.id);
    }

    // 2. Pick the requested photo key (default: check-in).
    const phase = input.phase ?? 'checkin';
    const key = phase === 'checkout' ? attendance.checkOutPhotoKey : attendance.checkInPhotoKey;

    // 3. Photo existence check — null = not yet uploaded → 404
    if (!key) {
      throw new AttendanceNotFoundError(`${input.id} (no ${phase} photo uploaded)`);
    }

    // 4. Get presigned URL (~300s TTL)
    const url = await this.storage.getPresignedGetUrl(BUCKET, key, PRESIGNED_TTL_SECONDS);

    return { url };
  }
}
