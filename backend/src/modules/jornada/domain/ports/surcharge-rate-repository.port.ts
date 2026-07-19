import { SurchargeRate, Prisma } from '@prisma/client';

export const SURCHARGE_RATE_REPOSITORY_PORT = Symbol('SurchargeRateRepositoryPort');

export interface SurchargeRateRepositoryPort {
  /**
   * Find all surcharge rates.
   * Can be filtered or returned all for resolution in-memory.
   */
  findAll(): Promise<SurchargeRate[]>;

  /**
   * Create a new surcharge rate.
   * The unique constraint (category, vigenteDesde) is enforced by the DB.
   */
  create(data: Prisma.SurchargeRateCreateInput): Promise<SurchargeRate>;
}
