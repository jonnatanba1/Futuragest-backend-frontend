// @ts-check
/**
 * ESLint rule: no-raw-prisma-scoped-query
 *
 * Bans direct prisma.<scopedModel>.<bannedMethod>() calls for ALL read AND write
 * operations on scoped models, ANYWHERE in backend/src (not just src/modules/).
 * Callers must go through ScopedRepository subclasses to ensure RBAC scope-filters
 * are applied on every read.
 *
 * C1 fix — previously only banned findMany + findFirst. Now covers:
 *   READ:   findMany, findFirst, findUnique, findFirstOrThrow, findUniqueOrThrow, count, aggregate, groupBy
 *   WRITE:  create, createMany, update, updateMany, upsert, delete, deleteMany
 *
 * C1 fix — destructuring bypass: also catches the pattern
 *   const { operario } = this.prisma; operario.findMany(...)
 * by flagging ANY method call on a standalone Identifier whose name matches a
 * scoped model (e.g. `operario.findMany()`), not just chained member expressions.
 *
 * C1 fix — path broadened: rule now fires on ALL of backend/src/**,
 * not just src/modules/**. The sanctioned allowlist (see isSanctionedFile)
 * remains in place.
 *
 * Scoped models: supervisor, operario, assignment, municipio
 * (lowercase — Prisma client properties use camelCase model names)
 *
 * Sanctioned allowlist (exempt files):
 *  - ScopedRepository base class (scoped-repository.ts)
 *  - Concrete ScopedRepository subclasses (scoped-*.repository.ts)
 *  - Test/spec files (*.spec.ts, *.int-spec.ts) — fixture setup via direct Prisma
 *  - Seed file (prisma/seed)
 *  - Jest global setup (jest-global-setup)
 *  - Auth repository (prisma-auth.repository — auth model, not IAM scoped model)
 */

/** @type {string[]} */
const SCOPED_MODELS = ['supervisor', 'operario', 'assignment', 'municipio'];

/**
 * All read and write operations that bypass scope filtering when called directly.
 * Any of these called on a scoped model outside a ScopedRepository is a security defect.
 */
/** @type {string[]} */
const BANNED_METHODS = [
  // Read operations
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  // Write operations (writes also need scope enforcement to prevent cross-zone mutation)
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
];

/** @param {string} filename */
function isSanctionedFile(filename) {
  // ScopedRepository base class and all concrete subclasses are allowed
  if (
    filename.includes('scoped-repository') ||
    /scoped-[a-z-]+\.repository/.test(filename)
  ) {
    return true;
  }

  // Test files are exempt — they set up fixtures directly via Prisma
  if (filename.includes('.spec.ts') || filename.includes('.int-spec.ts')) {
    return true;
  }

  // Seed file and test global setup
  if (filename.includes('prisma/seed') || filename.includes('jest-global-setup')) {
    return true;
  }

  // Auth repository — operates on User/DeviceSession (not IAM scoped models)
  if (filename.includes('prisma-auth.repository')) {
    return true;
  }

  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw Prisma calls on scoped models outside ScopedRepository subclasses. ' +
        'Use ScopedRepository methods (findManyScoped, findFirstScoped, etc.) to ensure ' +
        'RBAC scope-filters are applied. Bypassing this is a security defect.',
      recommended: true,
    },
    schema: [],
    messages: {
      noRawScopedQuery:
        'Raw prisma.{{model}}.{{method}}() detected outside a ScopedRepository. ' +
        'Use ScopedRepository scoped methods to ensure RBAC scope-filters are applied. ' +
        'Bypassing this is a security defect.',
      noRawScopedQueryDestructured:
        'Destructured scoped-model accessor "{{model}}.{{method}}()" detected. ' +
        'Do not destructure prisma.<scopedModel> — always access it through a ScopedRepository. ' +
        'Destructuring bypasses the RBAC scope-filter guardrail.',
    },
  },

  create(context) {
    const filename = context.getFilename().replace(/\\/g, '/');

    // Broadened path: enforce across all of backend/src (not just src/modules/).
    // This catches controllers, services, and other helpers that might be added
    // outside the modules/ directory.
    if (!filename.includes('/src/')) {
      return {};
    }

    // Sanctioned allowlist (ScopedRepository implementations, seed, test setup)
    if (isSanctionedFile(filename)) {
      return {};
    }

    return {
      /**
       * Pattern 1 — chained member expression:
       *   this.prisma.supervisor.findMany(...)
       *   prismaService.operario.count(...)
       *   anyVar.assignment.update(...)
       *
       * AST shape: CallExpression
       *   callee: MemberExpression  (X.<method>)
       *     object: MemberExpression  (Y.<model>)
       */
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;

        const method = callee.property;
        if (method.type !== 'Identifier') return;
        if (!BANNED_METHODS.includes(method.name)) return;

        const object = callee.object;
        if (object.type !== 'MemberExpression') return;

        const modelProp = object.property;
        if (modelProp.type !== 'Identifier') return;
        if (!SCOPED_MODELS.includes(modelProp.name)) return;

        context.report({
          node,
          messageId: 'noRawScopedQuery',
          data: {
            model: modelProp.name,
            method: method.name,
          },
        });
      },

      /**
       * Pattern 2 — destructured accessor (C1 bypass fix):
       *   const { operario } = this.prisma;
       *   operario.findMany(...)  ← caught here
       *
       * AST shape: CallExpression
       *   callee: MemberExpression
       *     object: Identifier  (name matches a scoped model)
       *     property: Identifier (name in BANNED_METHODS)
       *
       * This catches any standalone identifier whose name is a scoped model
       * calling a banned method — whether from destructuring, aliasing, or
       * any other indirect access pattern.
       */
      'CallExpression > MemberExpression'(node) {
        // node is the MemberExpression that is the callee of a CallExpression
        const memberExpr = /** @type {import('eslint').Rule.Node & {type:'MemberExpression'}} */ (node);
        if (memberExpr.parent.type !== 'CallExpression') return;
        if (memberExpr.parent.callee !== memberExpr) return;

        const method = memberExpr.property;
        if (method.type !== 'Identifier') return;
        if (!BANNED_METHODS.includes(method.name)) return;

        const object = memberExpr.object;
        // Only flag when the object is a plain Identifier (destructured case)
        // A MemberExpression object is already handled by Pattern 1
        if (object.type !== 'Identifier') return;
        if (!SCOPED_MODELS.includes(object.name)) return;

        context.report({
          node: memberExpr.parent,
          messageId: 'noRawScopedQueryDestructured',
          data: {
            model: object.name,
            method: method.name,
          },
        });
      },
    };
  },
};

module.exports = rule;
