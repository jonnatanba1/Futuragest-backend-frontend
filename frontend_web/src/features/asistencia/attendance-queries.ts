import { useQuery } from '@tanstack/react-query';
import { asistenciaApi } from '../../lib/api/client';

export function useAttendances() {
  return useQuery({
    queryKey: ['attendances'],
    queryFn: () => asistenciaApi.listAttendance(),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Presigned photo URL for an attendance. The backend URL is short-lived
 * (~300s). We use staleTime 0 so re-opening the drawer (which re-enables the
 * query) always refetches a fresh URL rather than serving an expired one.
 * Only fetches when an id is provided (drawer open AND a photo exists).
 */
export function usePhotoUrl(id: string | null, phase: 'checkin' | 'checkout' = 'checkin') {
  return useQuery({
    queryKey: ['attendance-photo', id, phase],
    queryFn: () => asistenciaApi.getPhotoUrl(id as string, phase),
    enabled: id !== null,
    staleTime: 0,
    retry: false,
  });
}
