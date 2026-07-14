import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompensatoryRestDto,
  CreateSurchargeRateRequest,
  HolidayDto,
  SurchargeRateDto,
} from '@futuragest/contracts';
import { holidayApi, surchargeRateApi, compensatoryRestApi } from '../../lib/api/client';

// ─── Query keys ───────────────────────────────────────────────────────────────

const holidaysKey = (year: number) => ['holidays', year] as const;
const surchargeRatesKey = ['surcharge-rates'] as const;
const compensatoryRestKey = ['compensatory-rest'] as const;

// ─── Holidays ─────────────────────────────────────────────────────────────────

export function useHolidaysQuery(year: number) {
  return useQuery<HolidayDto[]>({
    queryKey: holidaysKey(year),
    queryFn: () => holidayApi.listByYear(year),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useGenerateHolidaysMutation() {
  const qc = useQueryClient();
  return useMutation<HolidayDto[], Error, number>({
    mutationFn: (year) => holidayApi.generateYear(year),
    onSuccess: (_data, year) => qc.invalidateQueries({ queryKey: holidaysKey(year) }),
  });
}

export function useCreateHolidayMutation() {
  const qc = useQueryClient();
  return useMutation<HolidayDto, Error, { date: string; name: string }>({
    mutationFn: (body) => holidayApi.create(body),
    onSuccess: (_data, _vars, _ctx) => {
      // Invalidate all holiday queries since we don't know the year
      qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });
}

// ─── Surcharge Rates ──────────────────────────────────────────────────────────

export function useSurchargeRatesQuery() {
  return useQuery<SurchargeRateDto[]>({
    queryKey: surchargeRatesKey,
    queryFn: surchargeRateApi.list,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreateSurchargeRateMutation() {
  const qc = useQueryClient();
  return useMutation<SurchargeRateDto, Error, CreateSurchargeRateRequest>({
    mutationFn: (body) => surchargeRateApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: surchargeRatesKey }),
  });
}

// ─── Compensatory Rest ────────────────────────────────────────────────────────

export function useCompensatoryRestQuery(opts: { operarioId?: string; month?: string } = {}) {
  return useQuery<CompensatoryRestDto[]>({
    queryKey: [...compensatoryRestKey, opts.operarioId, opts.month],
    queryFn: () => compensatoryRestApi.list(opts),
    staleTime: 0,
    retry: false,
  });
}

export function useScheduleCompensatoryMutation() {
  const qc = useQueryClient();
  return useMutation<CompensatoryRestDto, Error, { id: string; scheduledDate: string; notes?: string | null }>({
    mutationFn: ({ id, scheduledDate, notes }) =>
      compensatoryRestApi.schedule(id, { scheduledDate, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: compensatoryRestKey }),
  });
}
