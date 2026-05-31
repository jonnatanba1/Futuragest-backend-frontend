/**
 * OP-48, OP-49, OP-50 — Unit tests for operario-import.parser (CSV + XLSX branches).
 *
 * Pure parser: Buffer + filename → OperarioImportRow[].
 * No framework dependencies, no DB — purely structural parse + format detection.
 *
 * PR-2: CSV branch. PR-3: XLSX branch (exceljs).
 */

import ExcelJS from 'exceljs';
import { parseOperarioImport, UnsupportedImportFormatError } from './operario-import.parser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

// ─── CSV parsing (OP-48) ──────────────────────────────────────────────────────

describe('parseOperarioImport — CSV', () => {
  it('OP-48 — parses 2-row CSV into ImportRow[] with correct rowNumbers', async () => {
    const buf = csvBuffer(
      'fullName,documento,supervisorEmail\n' +
        'Juan Perez,12345,s@test.co\n' +
        'Ana Lopez,67890,t@test.co\n',
    );

    const rows = await parseOperarioImport(buf, 'operarios.csv');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      rowNumber: 1,
      fullName: 'Juan Perez',
      documento: '12345',
      supervisorEmail: 's@test.co',
    });
    expect(rows[1]).toEqual({
      rowNumber: 2,
      fullName: 'Ana Lopez',
      documento: '67890',
      supervisorEmail: 't@test.co',
    });
  });

  it('trims whitespace from all fields', async () => {
    const buf = csvBuffer(
      'fullName,documento,supervisorEmail\n' +
        '  Pedro Garcia  ,  11111  ,  sup@co.com  \n',
    );

    const rows = await parseOperarioImport(buf, 'operarios.csv');

    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe('Pedro Garcia');
    expect(rows[0].documento).toBe('11111');
    expect(rows[0].supervisorEmail).toBe('sup@co.com');
  });

  it('skips blank rows (all-empty lines)', async () => {
    const buf = csvBuffer(
      'fullName,documento,supervisorEmail\n' +
        'Juan Perez,12345,s@test.co\n' +
        '\n' +
        '   ,   ,   \n' +
        'Ana Lopez,67890,t@test.co\n',
    );

    const rows = await parseOperarioImport(buf, 'operarios.csv');

    // Blank line skipped; whitespace-only row skipped
    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(1);
    expect(rows[1].rowNumber).toBe(2);
  });

  it('assigns sequential rowNumbers starting from 1 (header excluded)', async () => {
    const buf = csvBuffer(
      'fullName,documento,supervisorEmail\n' +
        'A,1,a@x.co\n' +
        'B,2,b@x.co\n' +
        'C,3,c@x.co\n',
    );

    const rows = await parseOperarioImport(buf, 'test.csv');

    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2, 3]);
  });

  it('throws UnsupportedImportFormatError for .txt extension', async () => {
    const buf = csvBuffer('fullName,documento,supervisorEmail\nA,1,a@x.co\n');

    await expect(parseOperarioImport(buf, 'data.txt')).rejects.toThrow(
      UnsupportedImportFormatError,
    );
  });
});

// ─── XLSX parsing (OP-49) ─────────────────────────────────────────────────────

async function buildXlsxBuffer(
  rows: Array<[string, string | number, string]>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Operarios');
  sheet.addRow(['fullName', 'documento', 'supervisorEmail']);
  for (const [fullName, documento, supervisorEmail] of rows) {
    sheet.addRow([fullName, documento, supervisorEmail]);
  }
  const result = await wb.xlsx.writeBuffer();
  return Buffer.from(result);
}

describe('parseOperarioImport — XLSX (OP-49)', () => {
  it('OP-49 — parses 2-row XLSX into ImportRow[] with correct rowNumbers', async () => {
    const buf = await buildXlsxBuffer([
      ['Juan Perez', '12345', 's@test.co'],
      ['Ana Lopez', '67890', 't@test.co'],
    ]);

    const rows = await parseOperarioImport(buf, 'operarios.xlsx');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      rowNumber: 1,
      fullName: 'Juan Perez',
      documento: '12345',
      supervisorEmail: 's@test.co',
    });
    expect(rows[1]).toEqual({
      rowNumber: 2,
      fullName: 'Ana Lopez',
      documento: '67890',
      supervisorEmail: 't@test.co',
    });
  });

  it('numeric documento cell → trimmed string (leading-zero scenario)', async () => {
    const buf = await buildXlsxBuffer([
      ['Pedro Garcia', 12345 as unknown as string, 'sup@co.com'],
    ]);

    const rows = await parseOperarioImport(buf, 'operarios.xlsx');

    expect(rows).toHaveLength(1);
    // Numeric cell must become string, not number
    expect(typeof rows[0].documento).toBe('string');
    expect(rows[0].documento).toBe('12345');
  });

  it('trims whitespace from string cells', async () => {
    const buf = await buildXlsxBuffer([
      ['  Worker Name  ', '  11111  ', '  sup@co.com  '],
    ]);

    const rows = await parseOperarioImport(buf, 'operarios.xlsx');

    expect(rows[0].fullName).toBe('Worker Name');
    expect(rows[0].documento).toBe('11111');
    expect(rows[0].supervisorEmail).toBe('sup@co.com');
  });

  it('skips blank rows (all-empty cells)', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Sheet1');
    sheet.addRow(['fullName', 'documento', 'supervisorEmail']);
    sheet.addRow(['Row A', '111', 'a@x.co']);
    sheet.addRow(['', '', '']); // blank row
    sheet.addRow(['Row B', '222', 'b@x.co']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const rows = await parseOperarioImport(buf, 'data.xlsx');

    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(1);
    expect(rows[1].rowNumber).toBe(2);
  });

  it('case-insensitive extension (.XLSX)', async () => {
    const buf = await buildXlsxBuffer([['Worker', '999', 'e@x.co']]);
    const rows = await parseOperarioImport(buf, 'data.XLSX');
    expect(rows).toHaveLength(1);
  });
});

// ─── Format detection (OP-50) ─────────────────────────────────────────────────

describe('parseOperarioImport — format detection by extension (OP-50)', () => {
  it('.csv → parsed as CSV', async () => {
    const buf = csvBuffer('fullName,documento,supervisorEmail\nTest,99,sup@co.com\n');
    const rows = await parseOperarioImport(buf, 'myfile.CSV'); // case-insensitive
    expect(rows).toHaveLength(1);
  });

  it('.xlsx → parsed as XLSX (returns rows)', async () => {
    const buf = await buildXlsxBuffer([['Worker', '123', 'sup@co.com']]);
    const rows = await parseOperarioImport(buf, 'data.xlsx');
    expect(rows).toHaveLength(1);
  });

  it('.txt → UnsupportedImportFormatError', async () => {
    const buf = csvBuffer('anything');
    await expect(parseOperarioImport(buf, 'data.txt')).rejects.toThrow(
      UnsupportedImportFormatError,
    );
  });

  it('invalid binary content sent as .xlsx → error (not UnsupportedImportFormatError)', async () => {
    // Non-XLSX binary sent with .xlsx extension — exceljs rejects parsing
    const buf = Buffer.from('this is definitely not an xlsx file', 'utf-8');
    await expect(parseOperarioImport(buf, 'data.xlsx')).rejects.toThrow();
  });
});

// ─── UnsupportedImportFormatError shape ──────────────────────────────────────

describe('UnsupportedImportFormatError', () => {
  it('is an Error subclass with correct name', () => {
    const err = new UnsupportedImportFormatError('.pdf');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnsupportedImportFormatError');
    expect(err.message).toContain('.pdf');
  });
});
