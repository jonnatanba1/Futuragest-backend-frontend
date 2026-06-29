import { Badge, Button, Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React from 'react';
import { ApiError } from '../../lib/api/client';
import { TableSkeleton } from '../../components/TableSkeleton';
import { usePayoutQuery, useConfirmPayoutMutation } from './compensacion-queries';

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
 *
 * Paid state: shows a teal "Liquidado" badge with date + payoutRef, no confirm button.
 * Unpaid + payable + canWrite: shows "Confirmar liquidación" button.
 * Zero horasPagables: no button (nothing to pay).
 */
export function PayoutPanel({ operarioId, periodKey, closed, canWrite }: PayoutPanelProps) {
  // Hooks first — rules of hooks forbid calls after a conditional return.
  // The query's enabled-gate also requires canWrite so read-only roles never fetch.
  const payout = usePayoutQuery(operarioId, periodKey, closed && canWrite);
  const confirmMutation = useConfirmPayoutMutation();

  const handleConfirm = async () => {
    if (!operarioId || !periodKey) return;
    try {
      await confirmMutation.mutateAsync({ operarioId, body: { periodKey } });
      notifications.show({
        color: 'teal',
        message: 'Liquidación confirmada.',
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        notifications.show({
          color: 'yellow',
          title: 'Sin horas a liquidar',
          message: err.message,
        });
      } else {
        notifications.show({
          color: 'red',
          title: 'Error',
          message: err instanceof ApiError ? err.message : 'Ocurrió un error al confirmar la liquidación.',
        });
      }
    }
  };

  // RBAC gate — render nothing for read-only roles (after hooks).
  if (!canWrite) return null;

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

  const { saldoHoras, horasBase, factorRecargo, horasPagables, paidAt, payoutRef } = payout.data;
  const isPayable = parseFloat(horasPagables) > 0;

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

        {paidAt ? (
          <Stack gap={4}>
            <Badge color="teal" variant="filled">Liquidado</Badge>
            <Text size="sm">{paidAt.slice(0, 10)}</Text>
            {payoutRef && (
              <Text size="xs" c="dimmed">
                {payoutRef}
              </Text>
            )}
          </Stack>
        ) : isPayable ? (
          <Button
            data-testid="confirm-payout-btn"
            color="teal"
            loading={confirmMutation.isPending}
            onClick={handleConfirm}
          >
            Confirmar liquidación
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
