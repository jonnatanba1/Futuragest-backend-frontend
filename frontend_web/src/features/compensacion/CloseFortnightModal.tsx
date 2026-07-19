import { Button, Modal, Select, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import React, { useId, useRef } from 'react';
import { ApiError } from '../../lib/api/client';
import { useClosePeriodMutation } from './compensacion-queries';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloseFortnightModalProps {
  opened: boolean;
  onClose: () => void;
  /** Operario to close the period for. */
  operarioId: string;
  /** Period start date (YYYY-MM-DD). */
  desde: string;
  /** Period end date (YYYY-MM-DD). */
  hasta: string;
  /** Period key, e.g. "2026-05-Q1". */
  periodKey: string;
  /**
   * Current saldo as a decimal string (e.g. "-2.50").
   * Passed in from the already-fetched balance — this component never fetches.
   * Parsed ONLY to decide whether disposition is required; never displayed as float.
   */
  saldoHoras: string;
  /** Called on successful close so the parent can mark the period as closed. */
  onSuccess?: () => void;
}

// ─── Disposition options ──────────────────────────────────────────────────────

const DISPOSITION_OPTIONS = [
  { value: 'CARRY_OVER', label: 'Trasladar saldo' },
  { value: 'PAYROLL_DEDUCTION', label: 'Deducir en nómina' },
];

// ─── Simple UUID v4-like generator (no dependency) ───────────────────────────

function generateClientRef(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CloseFortnightModal({
  opened,
  onClose,
  operarioId,
  desde,
  hasta,
  saldoHoras,
  onSuccess,
}: CloseFortnightModalProps) {
  const isNegative = parseFloat(saldoHoras) < 0;
  const closeMutation = useClosePeriodMutation();
  const disposicionId = useId();

  // C-04: Persist clientRef across retries so the backend can recognize
  // idempotent replays. Regenerate only when the period context changes.
  const clientRefRef = useRef(generateClientRef());
  const clientRefKey = `${operarioId}|${desde}|${hasta}`;
  const lastKeyRef = useRef(clientRefKey);
  if (lastKeyRef.current !== clientRefKey) {
    lastKeyRef.current = clientRefKey;
    clientRefRef.current = generateClientRef();
  }
  const clientRef = clientRefRef.current;

  const form = useForm({
    mode: 'uncontrolled',
    validateInputOnBlur: true,
    initialValues: {
      disposition: '' as string,
    },
    validate: {
      disposition: (v) =>
        isNegative && !v ? 'Seleccione cómo procesar el saldo negativo' : null,
    },
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await closeMutation.mutateAsync({
        operarioId,
        body: {
          desde,
          hasta,
          disposition: isNegative
            ? (values.disposition as 'CARRY_OVER' | 'PAYROLL_DEDUCTION')
            : null,
          clientRef,
        },
      });

      notifications.show({
        color: 'teal',
        message: 'Período cerrado correctamente.',
      });

      handleClose();
      onSuccess?.();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: err instanceof ApiError ? err.message : 'Ocurrió un error al cerrar el período.',
      });
    }
  });

  return (
    <Modal opened={opened} onClose={handleClose} title="Cerrar período" centered>
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Período
            </Text>
            <Text fw={500}>
              {desde} — {hasta}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Saldo de horas
            </Text>
            <Text fw={700}>{saldoHoras}</Text>
          </Stack>

          {isNegative && (
            <Select
              id={disposicionId}
              label="Disposición del saldo"
              aria-label="Disposición"
              placeholder="Seleccione una opción"
              data={DISPOSITION_OPTIONS}
              required
              key={form.key('disposition')}
              {...form.getInputProps('disposition')}
            />
          )}

          <Button type="submit" loading={closeMutation.isPending} color="red">
            Confirmar cierre
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
