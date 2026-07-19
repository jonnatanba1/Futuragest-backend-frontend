import { useQuery } from '@tanstack/react-query';
import { reportesApi } from '../../lib/api/client';

export function usePslReportPreview(desde: string, hasta: string, zoneId?: string | null) {
  return useQuery({
    queryKey: ['reportes', 'psl-preview', desde, hasta, zoneId],
    queryFn: () => reportesApi.getPreview(desde, hasta, zoneId || undefined),
    enabled: !!desde && !!hasta,
  });
}
