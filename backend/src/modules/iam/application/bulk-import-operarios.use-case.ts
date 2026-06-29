/**
 * PR-2 — BulkImportOperariosUseCase.
 *
 * Receives pre-parsed import rows (OperarioImportRow[]) and:
 *   1. Validates each row: required fields, in-file dup documento (Set),
 *      vs-DB dup (findByDocumento), supervisor email resolution.
 *   2. Collects ImportRowError per failed row.
 *   3. Commits valid rows atomically in ONE bulkCreate $transaction.
 *   4. Returns ImportResultDto { imported, failed, errors[] }.
 *
 * Partial-success semantics:
 *   - Invalid rows are reported in errors[] and never persisted.
 *   - Valid rows are committed even when others fail.
 *   - If no valid rows → bulkCreate is NOT called.
 *
 * Note: parsing (Buffer → rows) is done by parseOperarioImport in the controller
 * layer; this use-case receives already-parsed rows as its input.
 *
 * Covers: OP-41, OP-42, OP-43, REQ-05, INV-06, INV-07.
 */

import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import type { OperarioImportRow, ImportResultDto, ImportRowError } from '@futuragest/contracts';

export interface BulkImportOperariosInput {
  /** Pre-parsed import rows from the parser layer. */
  rows: OperarioImportRow[];
}

export class BulkImportOperariosUseCase {
  constructor(private readonly repo: OperarioRepositoryPort) {}

  async execute(input: BulkImportOperariosInput): Promise<ImportResultDto> {
    const { rows } = input;

    const errors: ImportRowError[] = [];

    // Track documentos seen in this file for in-file dup detection (INV-07)
    const seenDocumentos = new Set<string>();

    // Valid rows to commit in one transaction
    const validRows: Array<{
      fullName: string;
      documento: string;
      supervisorId: string;
      cargo: string;
    }> = [];

    for (const row of rows) {
      const validationResult = await this.validateRow(row, seenDocumentos);
      if (validationResult.error) {
        errors.push(validationResult.error);
      } else {
        // Row passed validation — supervisorId resolved during validation
        seenDocumentos.add(row.documento.toLowerCase());
        validRows.push({
          fullName: row.fullName,
          documento: row.documento,
          supervisorId: validationResult.supervisorId,
          cargo: '',  // CSV import does not have a cargo column — defaults to empty
        });
      }
    }

    // Commit valid rows atomically in one transaction (INV-06)
    let imported = 0;
    if (validRows.length > 0) {
      imported = await this.repo.bulkCreate(validRows);
    }

    return {
      imported,
      failed: errors.length,
      errors,
    };
  }

  /**
   * Validates a single import row against required fields, in-file dups, DB dups,
   * and supervisor email resolution.
   *
   * Returns either { error } on failure or { supervisorId } on success.
   * The seenDocumentos set is NOT mutated here — caller mutates it after a valid result,
   * so in-file dup detection key is added only when the row is confirmed valid.
   */
  private async validateRow(
    row: OperarioImportRow,
    seenDocumentos: Set<string>,
  ): Promise<{ error: ImportRowError; supervisorId?: never } | { supervisorId: string; error?: never }> {
    const { rowNumber, fullName, documento, supervisorEmail } = row;

    // REQ-05: required fields
    if (!fullName || !documento || !supervisorEmail) {
      return {
        error: {
          row: rowNumber,
          documento: documento || null,
          reason: 'Campo obligatorio faltante (fullName, documento o supervisorEmail)',
        },
      };
    }

    // INV-07: in-file duplicate documento (case-insensitive key)
    const docKey = documento.toLowerCase();
    if (seenDocumentos.has(docKey)) {
      return {
        error: {
          row: rowNumber,
          documento,
          reason: 'Documento duplicado en el archivo',
        },
      };
    }

    // Vs-DB duplicate documento
    const existing = await this.repo.findByDocumento(documento);
    if (existing) {
      return {
        error: {
          row: rowNumber,
          documento,
          reason: 'Documento duplicado',
        },
      };
    }

    // Supervisor email resolution — single call, id captured here
    const supervisor = await this.repo.resolveSupervisorByEmail(supervisorEmail);
    if (!supervisor) {
      return {
        error: {
          row: rowNumber,
          documento,
          reason: 'Supervisor no encontrado',
        },
      };
    }

    return { supervisorId: supervisor.id };
  }
}
