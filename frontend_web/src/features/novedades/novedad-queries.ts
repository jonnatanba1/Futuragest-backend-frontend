import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { novedadesApi } from '../../lib/api/client';

const NOVEDADES_KEY = 'novedades';

export function useNovedades() {
  return useQuery({
    queryKey: [NOVEDADES_KEY],
    queryFn: () => novedadesApi.listNovedades(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useApproveNovedad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => novedadesApi.approveNovedad(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOVEDADES_KEY] }),
  });
}

export function useRejectNovedad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      novedadesApi.rejectNovedad(id, reason ? { reason } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOVEDADES_KEY] }),
  });
}
