/**
 * Auth application — GetMeUseCase.
 *
 * Fetches the authenticated user's profile from the repository
 * and shapes a role-discriminated MeResponse.
 * Actor id comes from req.user.userId (set by AuthGuard via ScopeContext).
 */

import type { MeResponse } from '@futuragest/contracts';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { UserProfile } from '../domain/user-profile';
import { UserNotFoundError } from '../domain/auth.errors';

export class GetMeUseCase {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async execute(input: { userId: string }): Promise<MeResponse> {
    const profile = await this.repo.findUserWithScope(input.userId);
    if (!profile) throw new UserNotFoundError();
    return this.mapToResponse(profile);
  }

  private mapToResponse(profile: UserProfile): MeResponse {
    const base = {
      id: profile.id,
      email: profile.email,
      mustChangePassword: profile.mustChangePassword,
    };

    if (profile.role === 'COORDINADOR') {
      return {
        ...base,
        role: 'COORDINADOR',
        coordinatedZone:
          profile.coordinatedZoneId && profile.coordinatedZoneName
            ? { id: profile.coordinatedZoneId, name: profile.coordinatedZoneName }
            : null,
        supervisor: null,
      };
    }

    if (profile.role === 'SUPERVISOR') {
      return {
        ...base,
        role: 'SUPERVISOR',
        coordinatedZone: null,
        supervisor: {
          id: profile.supervisorId!,
          area: profile.supervisorArea!,
          zone: {
            id: profile.supervisorZoneId!,
            name: profile.supervisorZoneName!,
          },
          municipio: {
            id: profile.supervisorMunicipioId!,
            name: profile.supervisorMunicipioName!,
          },
        },
      };
    }

    // Global roles: SYSTEM_ADMIN | GERENCIA | TALENTO_HUMANO | LIDER_OPERATIVO
    return {
      ...base,
      role: profile.role as Exclude<
        'SYSTEM_ADMIN' | 'GERENCIA' | 'TALENTO_HUMANO' | 'LIDER_OPERATIVO',
        'COORDINADOR' | 'SUPERVISOR'
      >,
      coordinatedZone: null,
      supervisor: null,
    };
  }
}
