import {
  Alert,
  Card,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import React, { useMemo, useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { TableSkeleton } from '../../components/TableSkeleton';
import { useOperarios } from '../operarios/operario-queries';
import { useBalanceQuery } from './compensacion-queries';
import { DayBreakdown } from './DayBreakdown';
import { quincenaToRange } from './quincena';
import type { Quincena } from './quincena';

// ─── Month picker helpers ─────────────────────────────────────────────────────

const MONTH_OPTIONS = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const YEAR_OPTIONS = (() => {
  const currentYear = new Date().getFullYear();
  return [currentYear - 1, currentYear, currentYear + 1].map((y) => ({
    value: String(y),
    label: String(y),
  }));
})();

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Text fw={700} size="lg">
        {value}
      </Text>
    </Paper>
  );
}

// ─── BalancePanel ──────────────────────────────────────────────────────────────

/**
 * Balance filter bar + balance card + collapsible day breakdown.
 * State: operarioId / year / month / quincena — all local to this component.
 * Query: useBalanceQuery — disabled until all three selections are made.
 */
export function BalancePanel() {
  const currentDate = new Date();
  const [operarioId, setOperarioId] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(currentDate.getFullYear()));
  const [month, setMonth] = useState<string>(String(currentDate.getMonth() + 1));
  const [quincena, setQuincena] = useState<Quincena>('Q1');

  const operarios = useOperarios(true);

  const operarioOptions = useMemo(
    () => (operarios.data ?? []).map((o) => ({ value: o.id, label: o.fullName })),
    [operarios.data],
  );

  // Derive desde/hasta from selections (always computable even without an operario)
  const range = quincenaToRange(Number(year), Number(month), quincena);

  const balance = useBalanceQuery(operarioId, range.desde, range.hasta);

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderContent() {
    if (balance.isLoading) {
      return <TableSkeleton rows={4} />;
    }

    if (balance.isError) {
      const err = balance.error;
      const status = err instanceof ApiError ? err.status : 0;

      if (status === 422) {
        return (
          <Alert color="yellow" title="Sin política de jornada">
            No existe una política de jornada para este período. Configúrela en la
            pestaña{' '}
            <Text component="span" fw={600}>
              Política de jornada
            </Text>
            .
          </Alert>
        );
      }

      if (status === 404) {
        return (
          <Alert color="gray" title="Sin registros">
            No hay registros de compensación para el operario en este período.
          </Alert>
        );
      }

      return (
        <Alert color="red" title="Error">
          {err instanceof ApiError ? err.message : 'Error al cargar el balance.'}
        </Alert>
      );
    }

    if (!balance.data) {
      return (
        <Text c="dimmed" size="sm" data-testid="balance-tab-panel">
          Seleccione un operario y un período para ver el balance.
        </Text>
      );
    }

    const { carryIn, creditosHoras, debitosHoras, saldoHoras, breakdown } = balance.data;

    return (
      <Stack gap="md">
        <Card withBorder>
          <Stack gap="sm">
            <Title order={4}>Balance de horas</Title>
            <Text size="xs" c="dimmed">
              Saldo de horas = Arrastre + Créditos − Débitos
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <StatCard label="Arrastre" value={carryIn} />
              <StatCard label="Créditos" value={creditosHoras} />
              <StatCard label="Débitos" value={debitosHoras} />
              <StatCard label="Saldo de horas" value={saldoHoras} />
            </SimpleGrid>
          </Stack>
        </Card>

        {breakdown.length > 0 && <DayBreakdown breakdown={breakdown} />}
      </Stack>
    );
  }

  // ─── Filter bar + content ─────────────────────────────────────────────────

  return (
    <Stack gap="md">
      {/* Filter bar */}
      <Group gap="sm" wrap="wrap">
        <Select
          placeholder="Buscar operario"
          aria-label="Seleccionar operario"
          data={operarioOptions}
          value={operarioId}
          onChange={setOperarioId}
          searchable
          clearable
          w={240}
        />

        <Select
          aria-label="Seleccionar año"
          data={YEAR_OPTIONS}
          value={year}
          onChange={(v) => setYear(v ?? year)}
          w={100}
          allowDeselect={false}
        />

        <Select
          aria-label="Seleccionar mes"
          data={MONTH_OPTIONS}
          value={month}
          onChange={(v) => setMonth(v ?? month)}
          w={140}
          allowDeselect={false}
        />

        <SegmentedControl
          data={[
            { value: 'Q1', label: '1.ª quincena' },
            { value: 'Q2', label: '2.ª quincena' },
          ]}
          value={quincena}
          onChange={(v) => setQuincena(v as Quincena)}
        />
      </Group>

      {/* Content area */}
      {renderContent()}
    </Stack>
  );
}
