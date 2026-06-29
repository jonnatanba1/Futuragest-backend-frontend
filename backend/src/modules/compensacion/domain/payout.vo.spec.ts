import { Decimal } from '@prisma/client/runtime/client';
import { calculatePayout, RECARGO_DIURNO } from './payout.vo';

describe('calculatePayout (PR-C — recargo liquidation)', () => {
  it('applies the 1.25x daytime factor to a positive saldo', () => {
    const result = calculatePayout(new Decimal('8'));
    expect(result.horasBase.toString()).toBe('8');
    expect(result.factorRecargo.toString()).toBe('1.25');
    expect(result.horasPagables.toString()).toBe('10'); // 8 * 1.25
  });

  it('returns zero payable hours when saldo is exactly zero', () => {
    const result = calculatePayout(new Decimal('0'));
    expect(result.horasBase.toString()).toBe('0');
    expect(result.horasPagables.toString()).toBe('0');
  });

  it('returns zero payable hours when saldo is negative (debt handled at close)', () => {
    const result = calculatePayout(new Decimal('-3.5'));
    expect(result.horasBase.toString()).toBe('0');
    expect(result.horasPagables.toString()).toBe('0');
  });

  it('rounds HALF_UP to 2 decimal places', () => {
    // 2.5 * 1.25 = 3.125 → 3.13 (HALF_UP)
    const result = calculatePayout(new Decimal('2.5'));
    expect(result.horasPagables.toString()).toBe('3.13');
  });

  it('uses the default RECARGO_DIURNO factor when none is provided', () => {
    const result = calculatePayout(new Decimal('4'));
    expect(result.factorRecargo.equals(RECARGO_DIURNO)).toBe(true);
    expect(result.horasPagables.toString()).toBe('5'); // 4 * 1.25
  });

  it('honors a custom factor (future nocturnal/holiday extension)', () => {
    const result = calculatePayout(new Decimal('10'), new Decimal('1.75'));
    expect(result.factorRecargo.toString()).toBe('1.75');
    expect(result.horasPagables.toString()).toBe('17.5'); // 10 * 1.75
  });

  it('never mutates via float arithmetic (decimal precision preserved)', () => {
    // 0.1 + 0.2 style drift must not appear
    const result = calculatePayout(new Decimal('0.1').plus(new Decimal('0.2'))); // 0.3
    expect(result.horasBase.toString()).toBe('0.3');
    expect(result.horasPagables.toString()).toBe('0.38'); // 0.3 * 1.25 = 0.375 → 0.38
  });
});
