import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClosePeriodRequest,
  CompensationPeriodDto,
  ConfirmPayoutRequest,
  CreateJornadaPolicyRequest,
  EnhancedPeriodBalanceDto,
  JornadaPolicyDto,
  PeriodBalanceDto,
  PeriodPayoutDto,
} from '@futuragest/contracts';
import { compensacionApi, enhancedBalanceApi, jornadaPolicyApi } from '../../lib/api/client';

const FIVE_MIN = 5 * 60 * 1000;

// ─── Query keys ───────────────────────────────────────────────────────────────

const balanceKey = (operarioId: string, desde: string, hasta: string) =>
  ['compensacion', 'balance', operarioId, desde, hasta] as const;

const payoutKey = (operarioId: string, periodKey: string) =>
  ['compensacion', 'payout', operarioId, periodKey] as const;

const policiesKey = ['compensacion', 'policies'] as const;

/**
 * Query key for the jornada-policy timeline, scoped by zone.
 * - undefined zoneId ⇒ 'all' sentinel (full timeline, back-compat)
 * - null / "" zoneId ⇒ '' (global / IS NULL filter)
 * - non-empty zoneId ⇒ that value
 * Using a sentinel avoids [.., undefined] collisions across cache entries.
 */
const policiesKeyByZone = (zoneId?: string | null) =>
  ['compensacion', 'policies', zoneId === undefined ? 'all' : zoneId] as const;

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

/**
 * Jornada policy timeline, optionally scoped by zone.
 * - `undefined` zoneId ⇒ no filter (full timeline; back-compat with the
 *   unscoped call site).
 * - `null` or `""` zoneId ⇒ `{ zoneId: "" }` (global / IS NULL filter).
 * - non-empty zoneId ⇒ `{ zoneId }` (that zone's timeline).
 * Cached 5 min; kept broad so the panel can switch filters cheaply.
 */
export function useJornadaPoliciesQuery(zoneId?: string | null) {
  return useQuery<JornadaPolicyDto[]>({
    queryKey: policiesKeyByZone(zoneId),
    // Wrap in an arrow so TanStack's queryFn context object is NOT passed as
    // the filter argument to getJornadaPolicies.
    queryFn: () =>
      compensacionApi.getJornadaPolicies(
        zoneId === undefined ? undefined : { zoneId: zoneId ?? '' },
      ),
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
    // Broad prefix (exact:false) so every zone-scoped entry refetches, not
    // just the unscoped one.
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: policiesKey, exact: false }),
  });
}

/** Archives (deletes) a jornada policy by ID. On success, invalidates the policies list. */
export function useArchiveJornadaPolicyMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => jornadaPolicyApi.archive(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: policiesKey, exact: false }),
  });
}

// ─── Enhanced balance (PR 5) ──────────────────────────────────────────────────

const enhancedBalanceKey = (operarioId: string, desde: string, hasta: string) =>
  ['compensacion', 'enhanced-balance', operarioId, desde, hasta] as const;

/**
 * Enhanced period balance with category breakdown + surcharge values.
 * Falls back gracefully if the backend doesn't support the enhanced=true param.
 */
export function useEnhancedBalanceQuery(
  operarioId: string | null,
  desde: string,
  hasta: string,
) {
  return useQuery<EnhancedPeriodBalanceDto>({
    queryKey: operarioId ? enhancedBalanceKey(operarioId, desde, hasta) : ['compensacion', 'enhanced-balance', null],
    queryFn: () => enhancedBalanceApi.getBalance(operarioId!, desde, hasta),
    enabled: Boolean(operarioId && desde && hasta),
    staleTime: 0,
    retry: false,
  });
}
