import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOperarioRequest } from '@futuragest/contracts';
import { iamApi, orgApi } from '../../lib/api/client';

const OPERARIOS_KEY = 'operarios';
const FIVE_MIN = 5 * 60 * 1000;

export function useOperarios(includeInactive: boolean) {
  return useQuery({
    queryKey: [OPERARIOS_KEY, { includeInactive }],
    queryFn: () => iamApi.listOperarios({ includeInactive }),
    // Don't retry role-forbidden (403) reads — some office roles lack IAM access.
    retry: false,
  });
}

// Reference data changes rarely — cache longer. retry:false avoids 403 storms
// for roles without IAM/org read access (joins degrade to ids gracefully).
export function useSupervisors() {
  return useQuery({
    queryKey: ['supervisors'],
    queryFn: iamApi.listSupervisors,
    staleTime: FIVE_MIN,
    retry: false,
  });
}

export function useZones() {
  return useQuery({ queryKey: ['zones'], queryFn: orgApi.listZones, staleTime: FIVE_MIN, retry: false });
}

export function useMunicipios() {
  return useQuery({
    queryKey: ['municipios'],
    queryFn: orgApi.listMunicipios,
    staleTime: FIVE_MIN,
    retry: false,
  });
}

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: orgApi.listAreas,
    staleTime: FIVE_MIN,
    retry: false,
  });
}

export function useCreateOperario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOperarioRequest) => iamApi.createOperario(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [OPERARIOS_KEY] }),
  });
}

export function useDeactivateOperario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iamApi.deactivateOperario(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [OPERARIOS_KEY] }),
  });
}

export function useReactivateOperario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iamApi.reactivateOperario(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [OPERARIOS_KEY] }),
  });
}

export function useReassignOperario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, supervisorId }: { id: string; supervisorId: string }) =>
      iamApi.reassignOperario(id, supervisorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [OPERARIOS_KEY] }),
  });
}

export function useImportOperarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => iamApi.importOperarios(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: [OPERARIOS_KEY] }),
  });
}
