/**
 * UploadPhotoUseCase — stores a photo image in MinIO and updates the
 * attendance record's photo key for the requested phase.
 *
 * AT-11: happy path — stores JPG/PNG; updates checkInPhotoKey (checkin) or checkOutPhotoKey (checkout).
 * AT-13: not found → AttendanceNotFoundError (404).
 * AT-38: completed record → ImmutableAttendanceError (409).
 * AT-17: wrong mime type (not png/jpeg) → PhotoRequiredError (422).
 * AT-18: file > 5MB → PhotoRequiredError (422).
 *
 * Key scheme:
 *   checkin  → `photos/{supervisorId}/{attendanceId}-checkin.{ext}`
 *   checkout → `photos/{supervisorId}/{attendanceId}-checkout.{ext}`
 *
 * ext is derived from mimetype: image/jpeg → jpg, image/png → png.
 *
 * supervisorId comes from the scoped record (already scope-verified), not from JWT holder,
 * so COORDINADOR/global reads of an existing record still build the correct key.
 *
 * Immutability guard: completedAt !== null → ImmutableAttendanceError.
 * The checkout photo is uploaded BEFORE check-out while completedAt is still null,
 * so the guard stays correct for both phases.
 *
 * Bucket: 'futuragest' (hardcoded per design).
 */

import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { StoragePort } from '../../storage/domain/storage.port';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  PhotoRequiredError,
} from '../domain/attendance.errors';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (camera photos are bigger than signature PNGs)
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);
const BUCKET = 'futuragest';

function extFromMime(mimetype: string): string {
  if (mimetype === 'image/jpeg') return 'jpg';
  return 'png';
}

export interface UploadPhotoInput {
  id: string;
  /** 'checkin' (default) writes checkInPhotoKey; 'checkout' writes checkOutPhotoKey. */
  phase?: 'checkin' | 'checkout';
  file: {
    buffer: Buffer;
    mimetype: string;
    size: number;
  };
}

export interface UploadPhotoOutput {
  attendanceId: string;
  photoKey: string;
}

export class UploadPhotoUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly storage: StoragePort,
  ) {}

  async execute(input: UploadPhotoInput): Promise<UploadPhotoOutput> {
    // 1. Load attendance (scoped) — null = 404
    const attendance = await this.attendanceRepo.findById(input.id);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.id);
    }

    // 2. Immutability guard — completedAt set = locked
    // Note: the checkout photo is uploaded BEFORE check-out (completedAt still null),
    // so this guard is correct for both phases.
    if (attendance.completedAt !== null) {
      throw new ImmutableAttendanceError(input.id, attendance);
    }

    // 3. Mime type validation
    if (!ALLOWED_MIMES.has(input.file.mimetype)) {
      throw new PhotoRequiredError(
        `${input.id} (invalid MIME type: ${input.file.mimetype}; expected image/png or image/jpeg)`,
      );
    }

    // 4. File size validation
    if (input.file.size > MAX_SIZE_BYTES) {
      throw new PhotoRequiredError(
        `${input.id} (file too large: ${input.file.size} bytes; max ${MAX_SIZE_BYTES})`,
      );
    }

    // 5. Build deterministic key based on phase and derived extension.
    //    checkin  → photos/{supervisorId}/{id}-checkin.{ext}
    //    checkout → photos/{supervisorId}/{id}-checkout.{ext}
    const phase = input.phase ?? 'checkin';
    const ext = extFromMime(input.file.mimetype);
    const key = `photos/${attendance.supervisorId}/${input.id}-${phase}.${ext}`;

    // 6. Store in MinIO
    await this.storage.putObject(BUCKET, key, input.file.buffer, input.file.mimetype);

    // 7. Write to the correct column based on phase
    if (phase === 'checkout') {
      await this.attendanceRepo.update(input.id, { checkOutPhotoKey: key });
    } else {
      await this.attendanceRepo.update(input.id, { checkInPhotoKey: key });
    }

    return { attendanceId: input.id, photoKey: key };
  }
}
