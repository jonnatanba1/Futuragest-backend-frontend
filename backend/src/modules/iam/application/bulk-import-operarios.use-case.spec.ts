/**
 * OP-41, OP-42, OP-43 — Unit tests for BulkImportOperariosUseCase.
 *
 * Strict TDD: RED → GREEN. Tests are the spec.
 * Mocks: OperarioRepositoryPort (bulkCreate, findByDocumento, resolveSupervisorByEmail).
 * Parser is injected as a mock function — parser unit tests are in operario-import.parser.spec.ts.
 *
 * Business rules under test:
 *   - Per-row validation: required fields, in-file dup documento, vs-DB dup, supervisor not found.
 *   - Valid rows committed atomically via bulkCreate (single call).
 *   - Invalid rows listed in errors[], never persisted.
 *   - Partial-success: valid rows persist even when others fail.
 *   - all-invalid → imported:0, bulkCreate NOT called.
 *   - In-file dup: first occurrence wins, second+ is error.
 *
 * Covers: OP-41 (mixed valid/invalid), OP-42 (in-file dup), OP-43 (all-invalid).
 */

import { BulkImportOperariosUseCase } from './bulk-import-operarios.use-case';
import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import type { OperarioImportRow } from '@futuragest/contracts';
import type { Operario } from '@prisma/client';

// ─── Mock repo factory ────────────────────────────────────────────────────────

function makeRepo(overrides?: Partial<OperarioRepositoryPort>): jest.Mocked<OperarioRepositoryPort> {
  return {
    create: jest.fn(),
    findByDocumento: jest.fn().mockResolvedValue(null), // default: no dup in DB
    findByIdScoped: jest.fn(),
    setDeactivatedAt: jest.fn(),
    bulkCreate: jest.fn().mockResolvedValue(0),
    resolveSupervisorByEmail: jest.fn().mockResolvedValue({ id: 'sup-1' }), // default: found
    ...overrides,
  } as jest.Mocked<OperarioRepositoryPort>;
}

// ─── Row factory ──────────────────────────────────────────────────────────────

function row(
  overrides?: Partial<OperarioImportRow>,
): OperarioImportRow {
  return {
    rowNumber: 1,
    fullName: 'Test Worker',
    documento: 'DOC-001',
    supervisorEmail: 'supervisor@test.co',
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('BulkImportOperariosUseCase', () => {
  // ─── OP-41: mixed valid/invalid ───────────────────────────────────────────

  describe('OP-41 — mixed: valid rows committed, invalid rows reported', () => {
    it('commits valid rows and reports per-row errors for invalid', async () => {
      const repo = makeRepo({
        resolveSupervisorByEmail: jest.fn().mockImplementation((email: string) => {
          if (email === 'unknown@x.com') return Promise.resolve(null); // unknown supervisor
          return Promise.resolve({ id: 'sup-1' });
        }),
        findByDocumento: jest.fn().mockImplementation((doc: string) => {
          if (doc === 'DUP-DB') return Promise.resolve({ id: 'existing', documento: 'DUP-DB' } as unknown as Operario); // DB dup
          return Promise.resolve(null);
        }),
        bulkCreate: jest.fn().mockResolvedValue(2),
      });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, documento: 'DOC-001', supervisorEmail: 'supervisor@test.co' }),
        row({ rowNumber: 2, documento: 'DUP-DB', supervisorEmail: 'supervisor@test.co' }),
        row({ rowNumber: 3, documento: 'DOC-003', supervisorEmail: 'unknown@x.com' }),
        row({ rowNumber: 4, documento: 'DOC-004', supervisorEmail: 'supervisor@test.co' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);

      const errorDocs = result.errors.map((e) => e.documento);
      expect(errorDocs).toContain('DUP-DB');
      expect(errorDocs).toContain('DOC-003');

      // bulkCreate called once with the 2 valid rows only
      expect(repo.bulkCreate).toHaveBeenCalledTimes(1);
      const bulkRows = repo.bulkCreate.mock.calls[0][0] as Array<{ documento: string }>;
      expect(bulkRows.map((r) => r.documento)).toEqual(
        expect.arrayContaining(['DOC-001', 'DOC-004']),
      );
      expect(bulkRows.map((r) => r.documento)).not.toContain('DUP-DB');
      expect(bulkRows.map((r) => r.documento)).not.toContain('DOC-003');
    });
  });

  // ─── OP-42: in-file duplicate detection ───────────────────────────────────

  describe('OP-42 — in-file duplicate documento: first occurrence wins', () => {
    it('second occurrence of same documento is a row error; first proceeds', async () => {
      const repo = makeRepo({
        bulkCreate: jest.fn().mockResolvedValue(2),
      });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, documento: 'DUPFILE', supervisorEmail: 'supervisor@test.co' }),
        row({ rowNumber: 2, documento: 'UNIQUE-B', supervisorEmail: 'supervisor@test.co' }),
        row({ rowNumber: 3, documento: 'DUPFILE', supervisorEmail: 'supervisor@test.co' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(2); // rows 1 and 2
      expect(result.failed).toBe(1);   // row 3 (second DUPFILE)
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(3);
      expect(result.errors[0].documento).toBe('DUPFILE');
      expect(result.errors[0].reason).toMatch(/duplicado/i);

      // bulkCreate receives rows 1 and 2 only
      const bulkRows = repo.bulkCreate.mock.calls[0][0] as Array<{ documento: string }>;
      expect(bulkRows.map((r) => r.documento)).toContain('DUPFILE');  // first occurrence
      expect(bulkRows.map((r) => r.documento)).toContain('UNIQUE-B');
      expect(bulkRows).toHaveLength(2);
    });
  });

  // ─── OP-43: all-invalid → imported:0, bulkCreate NOT called ──────────────

  describe('OP-43 — all-invalid: imported:0, bulkCreate not called', () => {
    it('returns imported:0 and does not call bulkCreate when no valid rows', async () => {
      const repo = makeRepo({
        resolveSupervisorByEmail: jest.fn().mockResolvedValue(null), // all supervisors unknown
        bulkCreate: jest.fn(),
      });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, documento: 'A', supervisorEmail: 'nobody1@x.com' }),
        row({ rowNumber: 2, documento: 'B', supervisorEmail: 'nobody2@x.com' }),
        row({ rowNumber: 3, documento: 'C', supervisorEmail: 'nobody3@x.com' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.errors).toHaveLength(3);
      expect(repo.bulkCreate).not.toHaveBeenCalled();
    });
  });

  // ─── All-valid (happy path) ───────────────────────────────────────────────

  describe('all-valid rows', () => {
    it('commits all rows and returns imported == rows.length, errors:[]', async () => {
      const repo = makeRepo({
        bulkCreate: jest.fn().mockResolvedValue(3),
      });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, documento: 'DOC-A', supervisorEmail: 'sup@test.co' }),
        row({ rowNumber: 2, documento: 'DOC-B', supervisorEmail: 'sup@test.co' }),
        row({ rowNumber: 3, documento: 'DOC-C', supervisorEmail: 'sup@test.co' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(repo.bulkCreate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Missing required fields ──────────────────────────────────────────────

  describe('row validation — missing required fields', () => {
    it('reports error for row missing fullName', async () => {
      const repo = makeRepo({ bulkCreate: jest.fn() });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, fullName: '', documento: 'DOC-1', supervisorEmail: 'sup@test.co' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(0);
      expect(result.errors[0].reason).toMatch(/obligatorio/i);
      expect(repo.bulkCreate).not.toHaveBeenCalled();
    });

    it('reports error for row missing documento', async () => {
      const repo = makeRepo({ bulkCreate: jest.fn() });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, fullName: 'Test', documento: '', supervisorEmail: 'sup@test.co' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(0);
      expect(result.errors[0].reason).toMatch(/obligatorio/i);
    });

    it('reports error for row missing supervisorEmail', async () => {
      const repo = makeRepo({ bulkCreate: jest.fn() });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, fullName: 'Test', documento: 'DOC-1', supervisorEmail: '' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      const result = await useCase.execute({ rows });

      expect(result.imported).toBe(0);
      expect(result.errors[0].reason).toMatch(/obligatorio/i);
    });
  });

  // ─── supervisorId resolved from email (not body) ─────────────────────────

  describe('supervisor resolution by email', () => {
    it('resolves supervisorId from email and passes it to bulkCreate', async () => {
      const repo = makeRepo({
        resolveSupervisorByEmail: jest.fn().mockResolvedValue({ id: 'sup-resolved-id' }),
        bulkCreate: jest.fn().mockResolvedValue(1),
      });

      const rows: OperarioImportRow[] = [
        row({ rowNumber: 1, documento: 'DOC-X', supervisorEmail: 'the-sup@test.co' }),
      ];

      const useCase = new BulkImportOperariosUseCase(repo);
      await useCase.execute({ rows });

      const bulkRows = repo.bulkCreate.mock.calls[0][0] as Array<{ supervisorId: string }>;
      expect(bulkRows[0].supervisorId).toBe('sup-resolved-id');
    });
  });
});
