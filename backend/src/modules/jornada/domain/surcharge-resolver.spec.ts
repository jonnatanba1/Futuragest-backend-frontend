import { SurchargeResolver } from './surcharge-resolver';
import { SurchargeCategory, SurchargeRate } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

describe('SurchargeResolver', () => {
  const mockRates: SurchargeRate[] = [
    {
      id: '1',
      category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO,
      percentage: new Decimal(80.0),
      vigenteDesde: new Date('2025-07-01'),
      creadoPor: 'admin',
      legalRef: 'Ley 2466/2025',
      createdAt: new Date(),
    },
    {
      id: '2',
      category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO,
      percentage: new Decimal(90.0),
      vigenteDesde: new Date('2026-07-01'),
      creadoPor: 'admin',
      legalRef: 'Ley 2466/2025',
      createdAt: new Date(),
    },
    {
      id: '3',
      category: SurchargeCategory.RECARGO_NOCTURNO,
      percentage: new Decimal(35.0),
      vigenteDesde: new Date('2025-07-01'),
      creadoPor: 'admin',
      legalRef: 'Art. 168',
      createdAt: new Date(),
    },
  ];

  it('should resolve the correct dominical rate for a date before July 1, 2026', () => {
    const targetDate = new Date('2026-06-29'); // Before July 1
    const resolved = SurchargeResolver.resolve(mockRates, targetDate);

    expect(resolved.get(SurchargeCategory.RECARGO_DOMINICAL_FESTIVO)?.toNumber()).toBe(80);
    expect(resolved.get(SurchargeCategory.RECARGO_NOCTURNO)?.toNumber()).toBe(35);
  });

  it('should resolve the correct dominical rate for a date on or after July 1, 2026', () => {
    const targetDate = new Date('2026-07-02'); // After July 1
    const resolved = SurchargeResolver.resolve(mockRates, targetDate);

    expect(resolved.get(SurchargeCategory.RECARGO_DOMINICAL_FESTIVO)?.toNumber()).toBe(90);
    expect(resolved.get(SurchargeCategory.RECARGO_NOCTURNO)?.toNumber()).toBe(35);
  });

  it('should fallback to 0 for categories with no rates <= targetDate', () => {
    const targetDate = new Date('2024-01-01'); // Long before all rates
    const resolved = SurchargeResolver.resolve(mockRates, targetDate);

    expect(resolved.get(SurchargeCategory.RECARGO_DOMINICAL_FESTIVO)?.toNumber()).toBe(0);
    expect(resolved.get(SurchargeCategory.HORA_EXTRA_DIURNA)?.toNumber()).toBe(0);
  });
});
