import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { iamApi, orgApi } from '../../lib/api/client';

export function useCreateSupervisor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      email: string;
      password: string;
      area: string;
      zoneId: string;
      municipioId: string;
    }) => iamApi.createSupervisor(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supervisors'] }),
  });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: orgApi.listUsers, staleTime: 60_000, retry: false });
}

export function useProvisionUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; role: string }) =>
      orgApi.provisionUser(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useAssignCoordinador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; zoneId: string }) => orgApi.assignCoordinador(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['supervisors'] });
    },
  });
}

// Reads (useZones / useMunicipios) are reused from operario-queries.
// These mutations invalidate the same query keys so lists refresh.

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => orgApi.createZone({ name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => orgApi.updateZone(id, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orgApi.deleteZone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['municipios'] });
    },
  });
}

export function useCreateMunicipio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; zoneId: string }) => orgApi.createMunicipio(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['municipios'] }),
  });
}

export function useUpdateMunicipio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; zoneId?: string }) =>
      orgApi.updateMunicipio(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['municipios'] }),
  });
}

export function useDeleteMunicipio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orgApi.deleteMunicipio(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['municipios'] }),
  });
}
