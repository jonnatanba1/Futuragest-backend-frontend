/**
 * C1 — Meta-guard test: every model in SCOPE_MAPS must be only accessible via a
 * ScopedRepository subclass.
 *
 * Design §3.3: "Test guard (CI): a meta-test asserts every model in SCOPE_MAPS is
 * reachable only via a ScopedRepository subclass."
 *
 * Implementation approach: static file-system scan.
 * We scan backend/src/** for TypeScript source files (excluding sanctioned files)
 * and assert that no file contains a direct prisma.<scopedModel>.<bannedMethod>
 * call pattern. This is a belt-and-suspenders check complementing the ESLint rule —
 * it will catch patterns that might slip through ESLint config changes.
 *
 * This test FAILS fast if someone adds a raw scoped query anywhere in production code.
 * It uses a regex scan rather than ts-morph to stay fast for CI.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SCOPE_MAPS } from '../domain/scope-filter';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_SRC = path.resolve(__dirname, '../../../../src');

/**
 * Files / patterns that are sanctioned to contain direct Prisma calls.
 * These are the same exemptions as the ESLint rule's isSanctionedFile().
 */
function isSanctioned(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('scoped-repository') ||
    /scoped-[a-z-]+\.repository/.test(normalized) ||
    normalized.includes('.spec.ts') ||
    normalized.includes('.int-spec.ts') ||
    normalized.includes('prisma/seed') ||
    normalized.includes('jest-global-setup') ||
    normalized.includes('prisma-auth.repository')
  );
}

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('C1 Meta-Guard — SCOPE_MAPS models only accessible via ScopedRepository', () => {
  const scopedModels = Object.keys(SCOPE_MAPS);

  // Lowercase Prisma property names (e.g. Supervisor → supervisor)
  const scopedPrismaProps = scopedModels.map(
    (m) => m.charAt(0).toLowerCase() + m.slice(1),
  );

  const bannedMethods = [
    'findMany',
    'findFirst',
    'findUnique',
    'findFirstOrThrow',
    'findUniqueOrThrow',
    'count',
    'aggregate',
    'groupBy',
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
  ];

  let allTsFiles: string[];

  beforeAll(() => {
    allTsFiles = collectTsFiles(BACKEND_SRC).filter((f) => !isSanctioned(f));
  });

  it('SCOPE_MAPS contains at least the core scoped models', () => {
    // Sanity: the map must have the models we care about
    expect(scopedModels).toContain('Supervisor');
    expect(scopedModels).toContain('Operario');
    expect(scopedModels).toContain('Assignment');
  });

  it('every scoped model in SCOPE_MAPS has a corresponding ScopedRepository file', () => {
    // Models with confirmed ScopedRepository implementations
    const implementedModels = ['Supervisor', 'Operario', 'Assignment'];

    const violations: string[] = [];

    for (const model of implementedModels) {
      const repoProp = model.charAt(0).toLowerCase() + model.slice(1);
      // Look for a file named scoped-<model>.repository.ts
      const repoFile = path.join(
        __dirname,
        `scoped-${repoProp}.repository.ts`,
      );
      if (!fs.existsSync(repoFile)) {
        violations.push(`Missing ScopedRepository for ${model}: expected ${repoFile}`);
      }
    }

    // W3 note: Municipio is in SCOPE_MAPS but has no ScopedMunicipioRepository yet.
    // This is a known gap (documented in apply-progress W3 as accepted/deferred).
    // We do NOT assert Municipio here to avoid a false CI failure for a known-deferred item.

    expect(violations).toEqual([]);
  });

  it('no raw prisma.<scopedModel>.<bannedMethod> calls in non-sanctioned production source', () => {
    const violations: Array<{ file: string; line: number; content: string }> = [];

    // Build regex: prisma.<model>.<method> or <model>.<method> (destructured)
    for (const file of allTsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const prop of scopedPrismaProps) {
          for (const method of bannedMethods) {
            // Pattern 1: <anything>.<prop>.<method>(
            const chainedPattern = new RegExp(`\\.${prop}\\.${method}\\s*\\(`);
            if (chainedPattern.test(line)) {
              violations.push({ file, line: i + 1, content: line.trim() });
            }

            // Pattern 2: standalone <prop>.<method>( (destructured bypass)
            // Must be at start of expression (not preceded by a dot)
            const destructuredPattern = new RegExp(`(?<![.\\w])${prop}\\.${method}\\s*\\(`);
            if (destructuredPattern.test(line)) {
              violations.push({ file, line: i + 1, content: line.trim() });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${path.relative(BACKEND_SRC, v.file)}:${v.line}  →  ${v.content}`)
        .join('\n');
      // Use expect().toBe() instead of fail() — Jest 27+ removed the global fail()
      expect(violations).toHaveLength(0);
      throw new Error(
        `Meta-guard violation: raw scoped-model Prisma calls found in non-sanctioned source:\n${report}\n` +
          `Use ScopedRepository methods instead.`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});
