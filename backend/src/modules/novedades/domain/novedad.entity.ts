/**
 * Novedad domain entity.
 *
 * Re-exports the Prisma `Novedad` type as the domain entity.
 * This keeps the domain layer thin — the Prisma type is the source of truth
 * for the Novedad shape, same pattern as Attendance.
 *
 * Note: horasExtra is typed as Prisma Decimal — serializes to string in JSON.
 * Controllers must return the plain Prisma object; JSON serialization converts
 * Decimal to string automatically.
 */

export type { Novedad } from '@prisma/client';
export type { NovedadStatus } from '@prisma/client';
