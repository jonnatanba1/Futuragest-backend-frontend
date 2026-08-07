import { describe, expect, it } from 'vitest';
import { automaticFactorToBase } from './inventory-unit-options';

describe('automaticFactorToBase', () => {
  it('converts grams and kilograms without manual configuration', () => {
    expect(automaticFactorToBase('G', 'KG')).toBe('1000');
    expect(automaticFactorToBase('KG', 'G')).toBe('0.001');
  });

  it('converts litres and millilitres without manual configuration', () => {
    expect(automaticFactorToBase('L', 'ML')).toBe('0.001');
    expect(automaticFactorToBase('ML', 'L')).toBe('1000');
  });

  it('keeps packaging conversions manual', () => {
    expect(automaticFactorToBase('UND', 'CAJA')).toBeNull();
  });
});