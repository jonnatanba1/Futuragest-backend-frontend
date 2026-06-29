import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClosePeriodRequest,
  CompensationPeriodDto,
  ConfirmPayoutRequest,
  CreateJornadaPolicyRequest,
  JornadaPolicyDto,
  PeriodBalanceDto,
  PeriodPayoutDto,
} from '@futuragest/contracts';
import { compensacionApi } from '../../lib/api/client';

const FIVE_MIN = 5 * 60 * 1000;

// ─── Query keys ───────────────────────────────────────────────────────────────

const balanceKey = (operarioId: string, desde: string, hasta: string) =>
  ['compensacion', 'balance', operarioId, desde, hasta] as const;

const payoutKey = (operarioId: string, periodKey: string) =>
  ['compensacion', 'payout', operarioId, periodKey] as const;

const policiesKey = ['compensacion', 'policies'] as const;

// ─── Query hooks ──────────────────────────────────────────────────────────────

/**
 * Live period balance for an operario over a date range.
 * Query is disabled until all three params are truthy.
 */
export function useBalanceQuery(
  operarioId: string | null,
  desde: string,
  hasta: string,
) {
  return useQuery<PeriodBalanceDto>({
    queryKey: operarioId ? balanceKey(operarioId, desde, hasta) : ['compensacion', 'balance', null],
    queryFn: () => compensacionApi.getBalance(operarioId!, desde, hasta),
    enabled: Boolean(operarioId && desde && hasta),
    staleTime: 0,
    retry: false,
  });
}

/**
 * Payout calculation for a closed period.
 * Disabled when `enabled` flag is false or when operarioId/periodKey are absent.
 */
export function usePayoutQuery(
  operarioId: string | null,
  periodKey: string | null,
  enabled: boolean,
) {
  return useQuery<PeriodPayoutDto>({
    queryKey: operarioId && periodKey ? payoutKey(operarioId, periodKey) : ['compensacion', 'payout', null],
    queryFn: () => compensacionApi.getPayout(operarioId!, periodKey!),
    enabled: enabled && Boolean(operarioId && periodKey),
    staleTime: 0,
    retry: false,
  });
}

/** Jornada policy timeline (company-wide reference data; cached 5 min). */
export function useJornadaPoliciesQuery() {
  return useQuery<JornadaPolicyDto[]>({
    queryKey: policiesKey,
    queryFn: compensacionApi.getJornadaPolicies,
    staleTime: FIVE_MIN,
    retry: false,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/** Closes a fortnight for an operario. On success, invalidates the balance query. */
export function useClosePeriodMutation() {
  const qc = useQueryClient();
  return useMutation<
    CompensationPeriodDto,
    Error,
    { operarioId: string; body: ClosePeriodRequest }
  >({
    mutationFn: ({ operarioId, body }) => compensacionApi.closePeriod(operarioId, body),
    onSuccess: (_data, { operarioId }) => {
      // Invalidate all balance entries for this operario (any desde/hasta).
      qc.invalidateQueries({ queryKey: ['compensacion', 'balance', operarioId] });
      // Also invalidate payout for this operario.
      qc.invalidateQueries({ queryKey: ['compensacion', 'payout', operarioId] });
    },
  });
}

/**
 * Confirms (liquidates) a payout for a closed period.
 * On success, invalidates the payout query and the balance query for this operario.
 */
export function useConfirmPayoutMutation() {
  const qc = useQueryClient();
  return useMutation<
    PeriodPayoutDto,
    Error,
    { operarioId: string; body: ConfirmPayoutRequest }
  >({
    mutationFn: ({ operarioId, body }) => compensacionApi.confirmPayout(operarioId, body),
    onSuccess: (_data, { operarioId }) => {
      // Invalidate payout so the panel re-fetches with the stamped paidAt/payoutRef.
      qc.invalidateQueries({ queryKey: ['compensacion', 'payout', operarioId] });
      // Also invalidate balance — the period record now carries paidAt/payoutRef.
      qc.invalidateQueries({ queryKey: ['compensacion', 'balance', operarioId] });
    },
  });
}

/** Creates a new jornada policy. On success, invalidates the policies list. */
export function useCreateJornadaPolicyMutation() {
  const qc = useQueryClient();
  return useMutation<JornadaPolicyDto, Error, CreateJornadaPolicyRequest>({
    mutationFn: (body) => compensacionApi.createJornadaPolicy(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: policiesKey }),
  });
}
