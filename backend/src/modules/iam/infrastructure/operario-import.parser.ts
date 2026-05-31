/**
 * PR-2 + PR-3 — operario-import.parser.ts
 *
 * Pure, framework-free parser for operario import files.
 * CSV: csv-parse with columns:true, trim:true, skip_empty_lines:true.
 * XLSX: exceljs — first worksheet, row 1 = header, numeric cells coerced to trimmed strings.
 *
 * Format detection: by file extension (primary).
 * Unsupported extension → UnsupportedImportFormatError (HTTP 400 from controller).
 *
 * Covers: OP-48, OP-49, OP-50, REQ-05, REQ-15.
 */

import { parse as parseCsv } from 'csv-parse';
import ExcelJS from 'exceljs';
import type { OperarioImportRow } from '@futuragest/contracts';

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the uploaded file has an unsupported extension/format.
 * Maps to HTTP 400 (spec: unsupported mimetype/extension → 400).
 */
export class UnsupportedImportFormatError extends Error {
  readonly httpStatus = 400 as const;

  constructor(extension: string) {
    super(
      `[operario-import] Unsupported file format "${extension}". ` +
        `Accepted formats: .csv, .xlsx.`,
    );
    this.name = 'UnsupportedImportFormatError';
  }
}

// ─── Format detection ─────────────────────────────────────────────────────────

function detectExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filename.slice(dotIndex).toLowerCase();
}

// ─── CSV branch ───────────────────────────────────────────────────────────────

/**
 * Parses a CSV buffer into OperarioImportRow[].
 * Expects header row: fullName, documento, supervisorEmail.
 * Skips blank rows (all values empty after trimming).
 * rowNumber is 1-based, header excluded.
 */
function parseCsvBuffer(buffer: Buffer): Promise<OperarioImportRow[]> {
  return new Promise((resolve, reject) => {
    parseCsv(
      buffer,
      {
        columns: true,
        trim: true,
        skip_empty_lines: true,
        relax_quotes: true,
      },
      (err, records: Array<Record<string, string>>) => {
        if (err) return reject(err);

        const rows: OperarioImportRow[] = [];
        let dataRowNumber = 0;

        for (const record of records) {
          const fullName = (record['fullName'] ?? '').trim();
          const documento = (record['documento'] ?? '').trim();
          const supervisorEmail = (record['supervisorEmail'] ?? '').trim();

          // Skip all-blank rows
          if (!fullName && !documento && !supervisorEmail) continue;

          dataRowNumber++;
          rows.push({ rowNumber: dataRowNumber, fullName, documento, supervisorEmail });
        }

        resolve(rows);
      },
    );
  });
}

// ─── XLSX branch ──────────────────────────────────────────────────────────────

/**
 * Coerces an ExcelJS cell value to a trimmed string.
 * Numeric valores → String(value). Null/undefined → ''.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value).trim();
  if (typeof value === 'string') return value.trim();
  // Date, RichText, or other object types
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text: string }).text === 'string') {
      return (value as { text: string }).text.trim();
    }
    return String(value).trim();
  }
  return String(value).trim();
}

/**
 * Parses an XLSX buffer using exceljs.
 * First worksheet; row 1 = header (fullName, documento, supervisorEmail).
 * Numeric cells coerced to trimmed strings (INV-12, OP-49).
 */
async function parseXlsxBuffer(buffer: Buffer): Promise<OperarioImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs types expect ArrayBuffer; cast via underlying buffer for Node.js compat
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  // Build header index from row 1
  const headerRow = sheet.getRow(1);
  const colIndex: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value).toLowerCase();
    colIndex[header] = colNumber;
  });

  const fullNameCol = colIndex['fullname'] ?? colIndex['nombre'];
  const documentoCol = colIndex['documento'];
  const supervisorEmailCol = colIndex['supervisoremail'] ?? colIndex['supervisor'];

  const rows: OperarioImportRow[] = [];
  let dataRowNumber = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const fullName = fullNameCol ? cellToString(row.getCell(fullNameCol).value) : '';
    const documento = documentoCol ? cellToString(row.getCell(documentoCol).value) : '';
    const supervisorEmail = supervisorEmailCol
      ? cellToString(row.getCell(supervisorEmailCol).value)
      : '';

    // Skip all-blank rows
    if (!fullName && !documento && !supervisorEmail) return;

    dataRowNumber++;
    rows.push({ rowNumber: dataRowNumber, fullName, documento, supervisorEmail });
  });

  return rows;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses an import file buffer into OperarioImportRow[].
 *
 * @param buffer  - Raw file buffer from multer.
 * @param filename - Original filename (used for format detection by extension).
 * @returns Array of parsed rows (structural parse only; semantic validation is the use-case's job).
 * @throws UnsupportedImportFormatError for unsupported extensions.
 */
export async function parseOperarioImport(
  buffer: Buffer,
  filename: string,
): Promise<OperarioImportRow[]> {
  const ext = detectExtension(filename);

  if (ext === '.csv') {
    return parseCsvBuffer(buffer);
  }

  if (ext === '.xlsx') {
    return parseXlsxBuffer(buffer);
  }

  throw new UnsupportedImportFormatError(ext || filename);
}
