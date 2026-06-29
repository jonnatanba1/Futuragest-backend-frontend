import {
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Title,
} from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import type { HolidayType } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { TableSkeleton } from '../../components/TableSkeleton';
import { useGenerateHolidaysMutation, useHolidaysQuery } from './config-queries';

// ─── Color map for holiday types ──────────────────────────────────────────────

const TYPE_CONFIG: Record<HolidayType, { label: string; color: string }> = {
  FIXED: { label: 'FIJOS', color: 'red' },
  EMILIANI: { label: 'EMILIANI', color: 'blue' },
  EASTER_BASED: { label: 'PASCUA', color: 'green' },
  MANUAL: { label: 'MANUAL', color: 'orange' },
};

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ─── Year selector generator ──────────────────────────────────────────────────

function yearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  return [currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => ({
    value: String(y),
    label: String(y),
  }));
}

// ─── ConfigHolidaysPage ───────────────────────────────────────────────────────

export function ConfigHolidaysPage() {
  useDocumentTitle('FuturaGest · Festivos');

  const { user } = useAuth();
  const isAdmin = user?.role === 'SYSTEM_ADMIN';

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const holidays = useHolidaysQuery(year);
  const generateMutation = useGenerateHolidaysMutation();

  const handleGenerate = async () => {
    try {
      await generateMutation.mutateAsync(year);
      notifications.show({ color: 'teal', message: `Festivos ${year} generados correctamente.` });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: err instanceof ApiError ? err.message : 'Error al generar festivos.',
      });
    }
  };

  // Group holidays by month for display
  const groupedByMonth = React.useMemo(() => {
    if (!holidays.data) return new Map<number, typeof holidays.data>();
    const map = new Map<number, typeof holidays.data>();
    for (const h of holidays.data) {
      const month = parseInt(h.date.slice(5, 7), 10);
      if (!map.has(month)) map.set(month, []);
      map.get(month)!.push(h);
    }
    return map;
  }, [holidays.data]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Festivos</Title>
        <Group>
          {isAdmin && (
            <Button variant="outline">Agregar manual</Button>
          )}
          <Button
            onClick={handleGenerate}
            loading={generateMutation.isPending}
          >
            Generar automáticamente
          </Button>
        </Group>
      </Group>

      {/* Year selector */}
      <Group gap="sm">
        <Select
          aria-label="Año"
          data={yearOptions()}
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          w={120}
          allowDeselect={false}
        />
      </Group>

      {/* Color legend */}
      <Group gap="sm">
        {(Object.entries(TYPE_CONFIG) as [HolidayType, { label: string; color: string }][]).map(
          ([type, cfg]) => (
            <Badge key={type} color={cfg.color} variant="light">
              {cfg.label}
            </Badge>
          ),
        )}
      </Group>

      {/* Holiday table by month */}
      {holidays.isLoading && <TableSkeleton rows={5} />}

      {holidays.isError && (
        <Alert color="red" title="Error">
          No se pudo cargar los festivos.
        </Alert>
      )}

      {!holidays.isLoading && !holidays.isError && holidays.data && (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Mes</Table.Th>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Tipo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const monthHolidays = groupedByMonth.get(month) ?? [];
              if (monthHolidays.length === 0) {
                return (
                  <Table.Tr key={`empty-${month}`}>
                    <Table.Td>{MONTH_LABELS[month - 1]}</Table.Td>
                    <Table.Td colSpan={3}>
                      <span style={{ color: 'var(--mantine-color-dimmed)' }}>Sin festivos</span>
                    </Table.Td>
                  </Table.Tr>
                );
              }
              return monthHolidays.map((h, idx) => {
                const cfg = TYPE_CONFIG[h.type];
                return (
                  <Table.Tr key={h.id}>
                    {idx === 0 && (
                      <Table.Td rowSpan={monthHolidays.length}>{MONTH_LABELS[month - 1]}</Table.Td>
                    )}
                    <Table.Td>{h.date}</Table.Td>
                    <Table.Td>{h.name}</Table.Td>
                    <Table.Td>
                      <Badge color={cfg.color} variant="light" size="sm">
                        {cfg.label}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              });
            })}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
