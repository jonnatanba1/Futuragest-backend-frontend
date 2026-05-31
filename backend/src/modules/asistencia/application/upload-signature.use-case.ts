/**
 * UploadSignatureUseCase — stores a signature image in MinIO and updates the
 * attendance record's signatureKey.
 *
 * AT-11: happy path — stores PNG; updates signatureKey.
 * AT-13: not found → AttendanceNotFoundError (404).
 * AT-38: completed record → ImmutableAttendanceError (409).
 * AT-17: wrong mime type (not png/jpeg) → SignatureRequiredError (422).
 * AT-18: file > 2MB → SignatureRequiredError (422).
 *
 * Key scheme: `signatures/{supervisorId}/{attendanceId}.png`
 * supervisorId comes from the scoped record (already scope-verified), not from JWT holder,
 * so COORDINADOR/global reads of an existing record still build the correct key.
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

    // 5. Build deterministic key using supervisorId from the scoped record
    const key = `signatures/${attendance.supervisorId}/${input.id}.png`;

    // 6. Store in MinIO
    await this.storage.putObject(BUCKET, key, input.file.buffer, input.file.mimetype);

    // 7. Update signatureKey on the attendance record
    await this.attendanceRepo.update(input.id, { signatureKey: key });

    return { attendanceId: input.id, signatureKey: key };
  }
}
