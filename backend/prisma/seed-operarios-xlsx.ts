/**
 * Seed operarios from the Excel file at doc/operarios de prueba.xlsx.
 *
 * Run: pnpm exec tsx prisma/seed-operarios-xlsx.ts
 * Idempotent: upserts on documento — safe to re-run.
 *
 * Assignment strategy: round-robin across supervisors in the same municipio.
 * Rows whose municipio doesn't exist in the DB are logged and skipped.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import * as XLSX from 'xlsx';
import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

const XLSX_PATH = path.resolve(__dirname, '..', '..', 'doc', 'operarios de prueba.xlsx');

// Normalize municipio name for matching: uppercase, trim, remove diacritics.
function normalize(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');
}

// Canonical DB municipio names → their normalized forms for lookup.
// Keys: normalized form → DB name as stored in Prisma.
const MUNICIPIO_MAP: Record<string, string> = {
  APARTADO: 'Apartadó',
  BAJIRA: 'Bajirá',
  MUTATA: 'Mutatá',
  TURBO: 'Turbo',
  'SAN PEDRO DE URABA': 'San Pedro de Urabá',
  'SAN PEDRO': 'San Pedro de Urabá',
  NECOCLI: 'Necoclí',
  'SAN JUAN DE URABA': 'San Juan de Urabá',
  'SAN JUAN': 'San Juan de Urabá',
  ARBOLETES: 'Arboletes',
  'RELLENO TEJAR': 'Turbo',
  CAUCASIA: 'Caucasia',
  TARAZA: 'Tarazá',
  NECHI: 'Nechí',
  ZARAGOZA: 'Zaragoza',
  CACERES: 'Cáceres',
};

// Cargo variants in the Excel that mean the same position → canonical name.
const CARGO_MAP: Record<string, string> = {
  BARRIDO: 'OPERARIO DE BARRIDO VIAL',
  'OPERARIO BARRIDO VIAL': 'OPERARIO DE BARRIDO VIAL',
  'CONDUCTOR MOTO CARRO': 'CONDUCTOR MOTOCARRO',
  'OPERARIO DISPOSICION FINAL': 'OPERARIO DE DISPOSICION FINAL',
  'OPERARIO MAQUINARIA': 'OPERARIO DE MAQUINARIA',
  'OPERARIO DE RECOLECCION': 'RECOLECCION',
};

function canonicalCargo(raw: string): string {
  const trimmed = raw.trim();
  return CARGO_MAP[normalize(trimmed)] ?? trimmed;
}

interface ExcelRow {
  documento: string;
  fullName: string;
  cargo: string;
  rawMunicipio: string;
}

async function main() {
  console.log('Reading Excel file...');
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets['Hoja1'];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });

  // Skip header row; parse each data row.
  const rows: ExcelRow[] = raw
    .slice(1)
    .filter((r) => r[0] !== '')
    .map((r) => ({
      documento: String(r[0]).trim(),
      fullName: String(r[1]).trim(),
      cargo: canonicalCargo(String(r[2])),
      rawMunicipio: String(r[3]).trim(),
    }));

  console.log(`Parsed ${rows.length} operario rows from Excel.`);

  // Load all supervisors grouped by their municipio DB name.
  const supervisors = await prisma.supervisor.findMany({
    orderBy: { createdAt: 'asc' },
    include: { municipio: { select: { name: true } } },
  });

  if (supervisors.length === 0) {
    throw new Error('No supervisors found. Run the main seed first.');
  }

  // Build map: DB municipio name → supervisors[].
  const supsByMunicipio = new Map<string, typeof supervisors>();
  for (const sup of supervisors) {
    const name = sup.municipio.name;
    if (!supsByMunicipio.has(name)) supsByMunicipio.set(name, []);
    supsByMunicipio.get(name)!.push(sup);
  }

  // Round-robin counters per municipio DB name.
  const rrCounters = new Map<string, number>();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skippedMunicipios = new Map<string, number>();

  for (const row of rows) {
    const dbMunicipio = MUNICIPIO_MAP[normalize(row.rawMunicipio)];

    if (!dbMunicipio) {
      skippedMunicipios.set(
        row.rawMunicipio,
        (skippedMunicipios.get(row.rawMunicipio) ?? 0) + 1,
      );
      skipped++;
      continue;
    }

    const sups = supsByMunicipio.get(dbMunicipio);
    if (!sups || sups.length === 0) {
      skippedMunicipios.set(
        row.rawMunicipio,
        (skippedMunicipios.get(row.rawMunicipio) ?? 0) + 1,
      );
      skipped++;
      continue;
    }

    // Round-robin supervisor selection.
    const idx = (rrCounters.get(dbMunicipio) ?? 0) % sups.length;
    rrCounters.set(dbMunicipio, idx + 1);
    const supervisor = sups[idx];

    const existing = await prisma.operario.findUnique({
      where: { documento: row.documento },
    });

    await prisma.operario.upsert({
      where: { documento: row.documento },
      update: {
        fullName: row.fullName,
        cargo: row.cargo,
        supervisorId: supervisor.id,
        deactivatedAt: null,
      },
      create: {
        documento: row.documento,
        fullName: row.fullName,
        cargo: row.cargo,
        supervisorId: supervisor.id,
      },
    });

    if (existing) updated++;
    else inserted++;
  }

  console.log('\nSeed complete:');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);

  if (skippedMunicipios.size > 0) {
    console.log('\nSkipped municipios (not in DB):');
    for (const [mun, count] of skippedMunicipios.entries()) {
      console.log(`  ${count.toString().padStart(3)}  ${mun}`);
    }
  }

  const total = await prisma.operario.count({ where: { deactivatedAt: null } });
  console.log(`\nTotal active operarios in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
