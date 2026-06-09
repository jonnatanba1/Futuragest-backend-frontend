/**
 * UploadSignatureUseCase — stores a signature image in MinIO and updates the
 * attendance record's signature key for the requested phase.
 *
 * AT-11: happy path — stores PNG; updates signatureKey (checkin) or checkOutSignatureKey (checkout).
 * AT-13: not found → AttendanceNotFoundError (404).
 * AT-38: completed record → ImmutableAttendanceError (409).
 * AT-17: wrong mime type (not png/jpeg) → SignatureRequiredError (422).
 * AT-18: file > 2MB → SignatureRequiredError (422).
 *
 * Key scheme:
 *   checkin  → `signatures/{supervisorId}/{attendanceId}.png`
 *   checkout → `signatures/{supervisorId}/{attendanceId}-checkout.png`
 *
 * supervisorId comes from the scoped record (already scope-verified), not from JWT holder,
 * so COORDINADOR/global reads of an existing record still build the correct key.
 *
 * Immutability guard: completedAt !== null → ImmutableAttendanceError.
 * The checkout signature is uploaded BEFORE check-out while completedAt is still null,
 * so the guard stays correct for both phases.
 *
 * Bucket: 'futuragest' (hardcoded per design).
 */

import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { StoragePort } from '../../storage/domain/storage.port';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  SignatureRequiredError,
} from '../domain/attendance.errors';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);
const BUCKET = 'futuragest';

export interface UploadSignatureInput {
  id: string;
  /** 'checkin' (default) writes signatureKey; 'checkout' writes checkOutSignatureKey. */
  phase?: 'checkin' | 'checkout';
  file: {
    buffer: Buffer;
    mimetype: string;
    size: number;
  };
}

export interface UploadSignatureOutput {
  attendanceId: string;
  signatureKey: string;
}

export class UploadSignatureUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly storage: StoragePort,
  ) {}

  async execute(input: UploadSignatureInput): Promise<UploadSignatureOutput> {
    // 1. Load attendance (scoped) — null = 404
    const attendance = await this.attendanceRepo.findById(input.id);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.id);
    }

    // 2. Immutability guard — completedAt set = locked
    // Note: the checkout signature is uploaded BEFORE check-out (completedAt still null),
    // so this guard is correct for both phases.
    if (attendance.completedAt !== null) {
      throw new ImmutableAttendanceError(input.id, attendance);
    }

    // 3. Mime type validation
    if (!ALLOWED_MIMES.has(input.file.mimetype)) {
      throw new SignatureRequiredError(
        `${input.id} (invalid MIME type: ${input.file.mimetype}; expected image/png or image/jpeg)`,
      );
    }

    // 4. File size validation
    if (input.file.size > MAX_SIZE_BYTES) {
      throw new SignatureRequiredError(
        `${input.id} (file too large: ${input.file.size} bytes; max ${MAX_SIZE_BYTES})`,
      );
    }

    // 5. Build deterministic key based on phase.
    //    checkin  → signatures/{supervisorId}/{id}.png        (unchanged)
    //    checkout → signatures/{supervisorId}/{id}-checkout.png
    const phase = input.phase ?? 'checkin';
    const suffix = phase === 'checkout' ? '-checkout' : '';
    const key = `signatures/${attendance.supervisorId}/${input.id}${suffix}.png`;

    // 6. Store in MinIO
    await this.storage.putObject(BUCKET, key, input.file.buffer, input.file.mimetype);

    // 7. Write to the correct column based on phase
    if (phase === 'checkout') {
      await this.attendanceRepo.update(input.id, { checkOutSignatureKey: key });
    } else {
      await this.attendanceRepo.update(input.id, { signatureKey: key });
    }

    return { attendanceId: input.id, signatureKey: key };
  }
}
