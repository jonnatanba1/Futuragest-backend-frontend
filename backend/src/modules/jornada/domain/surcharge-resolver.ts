import { SurchargeRate, SurchargeCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

export class SurchargeResolver {
  /**
   * Resolves the active surcharge rates for a given date from a list of all rates.
   * For each category, it finds the rate with the latest `vigenteDesde` that is <= targetDate.
   */
  static resolve(rates: SurchargeRate[], targetDate: Date): Map<SurchargeCategory, Decimal> {
    const activeRates = new Map<SurchargeCategory, Decimal>();
    const categories = Object.values(SurchargeCategory);

    for (const category of categories) {
      // Filter rates by category and where vigenteDesde <= targetDate
      const matchingRates = rates
        .filter((r) => r.category === category && new Date(r.vigenteDesde) <= targetDate)
        .sort((a, b) => new Date(b.vigenteDesde).getTime() - new Date(a.vigenteDesde).getTime());

      if (matchingRates.length > 0) {
        activeRates.set(category, new Decimal(matchingRates[0].percentage));
      } else {
        // Fallback to 0 if no rate is configured yet
        activeRates.set(category, new Decimal(0));
      }
    }

    return activeRates;
  }
}
