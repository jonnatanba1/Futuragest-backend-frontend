/**
 * T-02 — Compile-time shape check for OrgRepositoryPort.
 *
 * This test asserts that OrgRepositoryPort exports the expected interface with
 * the four required methods. We verify both at the type level (TypeScript
 * structural type checking catches shape mismatches at compile time) and at
 * runtime (a stub implementation must satisfy the interface).
 *
 * Written FIRST (TDD red phase) — fails to compile before org-repository.port.ts exists.
 */

import type { OrgRepositoryPort } from './org-repository.port';
import type { Zone, Municipio } from '@prisma/client';

// A minimal stub that satisfies the interface shape — proves the interface
// declares the required methods with compatible signatures.
class StubOrgRepository implements OrgRepositoryPort {
  createManagementUser(_params: Parameters<OrgRepositoryPort['createManagementUser']>[0]): Promise<{ id: string }> {
    return Promise.resolve({ id: 'stub-id' });
  }

  assignCoordinador(_params: Parameters<OrgRepositoryPort['assignCoordinador']>[0]): Promise<void> {
    return Promise.resolve();
  }

  findZones(): Promise<Zone[]> {
    return Promise.resolve([]);
  }

  findMunicipios(): Promise<Municipio[]> {
    return Promise.resolve([]);
  }

  createZone(_params: Parameters<OrgRepositoryPort['createZone']>[0]): Promise<{ id: string }> {
    return Promise.resolve({ id: 'stub-zone-id' });
  }

  updateZone(_id: string, _params: Parameters<OrgRepositoryPort['updateZone']>[1]): Promise<Zone> {
    return Promise.resolve({ id: 'stub-zone-id', name: 'stub', createdAt: new Date(), updatedAt: new Date() });
  }

  deleteZone(_id: string): Promise<void> {
    return Promise.resolve();
  }

  createMunicipio(_params: Parameters<OrgRepositoryPort['createMunicipio']>[0]): Promise<{ id: string }> {
    return Promise.resolve({ id: 'stub-muni-id' });
  }

  updateMunicipio(_id: string, _params: Parameters<OrgRepositoryPort['updateMunicipio']>[1]): Promise<Municipio> {
    return Promise.resolve({ id: 'stub-muni-id', name: 'stub', zoneId: 'stub-zone-id', createdAt: new Date(), updatedAt: new Date() });
  }

  deleteMunicipio(_id: string): Promise<void> {
    return Promise.resolve();
  }

  findUsers(): Promise<Awaited<ReturnType<OrgRepositoryPort['findUsers']>>> {
    return Promise.resolve([]);
  }
}

describe('OrgRepositoryPort — interface shape', () => {
  it('has a createManagementUser method', () => {
    const repo: OrgRepositoryPort = new StubOrgRepository();
    expect(typeof repo.createManagementUser).toBe('function');
  });

  it('has an assignCoordinador method', () => {
    const repo: OrgRepositoryPort = new StubOrgRepository();
    expect(typeof repo.assignCoordinador).toBe('function');
  });

  it('has a findZones method', () => {
    const repo: OrgRepositoryPort = new StubOrgRepository();
    expect(typeof repo.findZones).toBe('function');
  });

  it('has a findMunicipios method', () => {
    const repo: OrgRepositoryPort = new StubOrgRepository();
    expect(typeof repo.findMunicipios).toBe('function');
  });

  it('createManagementUser returns a Promise resolving with an id', async () => {
    const repo = new StubOrgRepository();
    const result = await repo.createManagementUser({
      email: 'test@futuragest.co',
      passwordHash: '$argon2id$stub',
      role: 'GERENCIA',
    });
    expect(result).toHaveProperty('id');
  });
});
