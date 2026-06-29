/**
 * TDD: RED phase — Seed verification integration test.
 *
 * Verifies that prisma db seed produces the expected JornadaPolicy
 * and SurchargeRate data with the new schema fields (operarioId, almuerzo,
 * toleranciaMin, TipoNovedad).
 *
 * This test will FAIL (RED) until the seed is updated to include:
 *   - Global JornadaPolicy: 6:00–14:00, almuerzo null (auto), tol=5,
 *     horasDiarias=7.50, horasSemanales=37.50, vigenteDesde=2025-07-16
 *   - Same policy with vigenteDesde=2026-07-16
 *   - SurchargeRate: RECARGO_DOMINICAL_FESTIVO 80%, 90%, 100%
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { SurchargeCategory } from '@prisma/client';

describe('Jornada Seed Verification (T1.6)', () => {
  let prisma: PrismaService;
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── SEED-01: Global JornadaPolicy 2025-07-16 ─────────────────────────

  it('SEED-01: global policy vigenteDesde 2025-07-16 exists with correct values', async () => {
    const policy = await prisma.jornadaPolicy.findFirst({
      where: {
        operarioId: null,
        zoneId: null,
        vigenteDesde: new Date('2025-07-16T00:00:00.000Z'),
      },
    });

    expect(policy).not.toBeNull();
    expect(policy!.horaInicio).toBe('06:00');
    expect(policy!.horaFin).toBe('14:00');
    expect(policy!.horasDiarias.toNumber()).toBe(7.50);
    expect(policy!.horasSemanales.toNumber()).toBe(37.50);
    expect(policy!.toleranciaMin).toBe(5);
    expect(policy!.almuerzoInicio).toBeNull();
    expect(policy!.almuerzoFin).toBeNull();
    expect(policy!.diasLaborales).toEqual([1, 2, 3, 4, 5]);
  });

  // ── SEED-02: Global JornadaPolicy 2026-07-16 ─────────────────────────

  it('SEED-02: global policy vigenteDesde 2026-07-16 exists (legal milestone)', async () => {
    const policy = await prisma.jornadaPolicy.findFirst({
      where: {
        operarioId: null,
        zoneId: null,
        vigenteDesde: new Date('2026-07-16T00:00:00.000Z'),
      },
    });

    expect(policy).not.toBeNull();
    expect(policy!.horaInicio).toBe('06:00');
    expect(policy!.horaFin).toBe('14:00');
    expect(policy!.horasDiarias.toNumber()).toBe(7.50);
    expect(policy!.horasSemanales.toNumber()).toBe(37.50);
    expect(policy!.toleranciaMin).toBe(5);
    expect(policy!.almuerzoInicio).toBeNull();
    expect(policy!.almuerzoFin).toBeNull();
  });

  // ── SEED-03: RECARGO_NOCTURNO 35% ────────────────────────────────────

  it('SEED-03: RECARGO_NOCTURNO 35% exists', async () => {
    const rate = await prisma.surchargeRate.findFirst({
      where: { category: SurchargeCategory.RECARGO_NOCTURNO },
      orderBy: { vigenteDesde: 'asc' },
    });

    expect(rate).not.toBeNull();
    expect(rate!.percentage.toNumber()).toBe(0.35);
  });

  // ── SEED-04: HORA_EXTRA_DIURNA 25% ───────────────────────────────────

  it('SEED-04: HORA_EXTRA_DIURNA 25% exists', async () => {
    const rate = await prisma.surchargeRate.findFirst({
      where: { category: SurchargeCategory.HORA_EXTRA_DIURNA },
      orderBy: { vigenteDesde: 'asc' },
    });

    expect(rate).not.toBeNull();
    expect(rate!.percentage.toNumber()).toBe(0.25);
  });

  // ── SEED-05: HORA_EXTRA_NOCTURNA 75% ────────────────────────────────

  it('SEED-05: HORA_EXTRA_NOCTURNA 75% exists', async () => {
    const rate = await prisma.surchargeRate.findFirst({
      where: { category: SurchargeCategory.HORA_EXTRA_NOCTURNA },
      orderBy: { vigenteDesde: 'asc' },
    });

    expect(rate).not.toBeNull();
    expect(rate!.percentage.toNumber()).toBe(0.75);
  });

  // ── SEED-06: RECARGO_DOMINICAL_FESTIVO 80% ──────────────────────────

  it('SEED-06: RECARGO_DOMINICAL_FESTIVO 80% exists (pre-July 2026)', async () => {
    const rate = await prisma.surchargeRate.findFirst({
      where: {
        category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO,
        percentage: { equals: 0.80 },
      },
    });

    expect(rate).not.toBeNull();
  });

  // ── SEED-07: RECARGO_DOMINICAL_FESTIVO 90% ──────────────────────────

  it('SEED-07: RECARGO_DOMINICAL_FESTIVO 90% exists (from July 1 2026)', async () => {
    const rate = await prisma.surchargeRate.findFirst({
      where: {
        category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO,
        vigenteDesde: new Date('2026-07-01T00:00:00.000Z'),
      },
    });

    expect(rate).not.toBeNull();
    expect(rate!.percentage.toNumber()).toBe(0.90);
  });

  // ── SEED-08: RECARGO_DOMINICAL_FESTIVO 100% ─────────────────────────

  it('SEED-08: RECARGO_DOMINICAL_FESTIVO 100% exists (from July 1 2027)', async () => {
    const rate = await prisma.surchargeRate.findFirst({
      where: {
        category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO,
        vigenteDesde: new Date('2027-07-01T00:00:00.000Z'),
      },
    });

    expect(rate).not.toBeNull();
    expect(rate!.percentage.toNumber()).toBe(1.00);
  });
});
