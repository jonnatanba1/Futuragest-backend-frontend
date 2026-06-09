import { Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import React from 'react';
import { ApiError } from '../../lib/api/client';
import { TableSkeleton } from '../../components/TableSkeleton';
import { usePayoutQuery } from './compensacion-queries';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PayoutPanelProps {
  operarioId: string | null;
  periodKey: string | null;
  /** True when the period has been closed in this session or was already closed. */
  closed: boolean;
  /** True for COMPENSACION_WRITE_ROLES only; renders nothing otherwise. */
  canWrite: boolean;
}

// ─── Stat card (mirrors BalancePanel's StatCard) ──────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Text fw={700} size="lg">
        {value}
      </Text>
    </Card>
  );
}

// ─── PayoutPanel ──────────────────────────────────────────────────────────────

/**
 * Inline payout panel shown automatically when the period is closed.
 * Visible only to COMPENSACION_WRITE_ROLES (canWrite prop).
 * Uses usePayoutQuery enabled-gate so an open period never fires the query.
 * 404 PERIOD_NOT_CLOSED → informational state (not an error).
 */
export function PayoutPanel({ operarioId, periodKey, closed, canWrite }: PayoutPanelProps) {
  // RBAC gate — render nothing for read-only roles.
  if (!canWrite) return null;

  const payout = usePayoutQuery(operarioId, periodKey, closed);

  if (payout.isLoading) {
    return <TableSkeleton rows={2} />;
  }

  if (payout.isError) {
    const err = payout.error;
    const status = err instanceof ApiError ? err.status : 0;

    // 404 PERIOD_NOT_CLOSED is a NORMAL informational state — not an error toast.
    if (status === 404) {
      return (
        <Text c="dimmed" size="sm">
          Liquidación disponible al cerrar el período.
        </Text>
      );
    }

    // Other errors show a generic message (no red Alert — keep it low-noise).
    return (
      <Text c="dimmed" size="sm">
        No se pudo cargar la liquidación.
      </Text>
    );
  }

  if (!payout.data) {
    // Query disabled (period not closed) — render nothing.
    return null;
  }

  const { saldoHoras, horasBase, factorRecargo, horasPagables } = payout.data;

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Title order={4}>Liquidación</Title>
        <Text size="xs" c="dimmed">
          Horas a liquidar = saldo × factor de recargo
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <StatCard label="Saldo de horas" value={saldoHoras} />
          <StatCard label="Horas base" value={horasBase} />
          <StatCard label="Factor de recargo" value={factorRecargo} />
          <StatCard label="Horas a liquidar" value={horasPagables} />
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
