/**
 * T-08 — Compile-check test for OperarioRepositoryPort (RED phase).
 *
 * Asserts OPERARIO_REPOSITORY Symbol exists and OperarioRepositoryPort
 * interface has all required methods.
 */

import {
  OPERARIO_REPOSITORY,
  type OperarioRepositoryPort,
} from './operario.repository.port';

describe('OperarioRepositoryPort', () => {
  it('OPERARIO_REPOSITORY is a Symbol', () => {
    expect(typeof OPERARIO_REPOSITORY).toBe('symbol');
  });

  it('interface has all required method signatures (compile-time check)', () => {
    // This is a compile-time check — if the interface is missing methods, TS fails
    const _typeCheck = (port: OperarioRepositoryPort) => {
      port.create({ fullName: '', documento: '', supervisorId: '' });
      port.findByDocumento('');
      port.findByIdScoped('');
      port.setDeactivatedAt('', new Date());
      port.setDeactivatedAt('', null);
      port.bulkCreate([]);
      port.resolveSupervisorByEmail('');
    };
    expect(_typeCheck).toBeDefined();
  });
});
