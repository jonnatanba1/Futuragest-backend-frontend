import {
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React, { useMemo, useState } from 'react';
import type { CompensatoryStatus, CompensatoryType } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, COMPENSACION_WRITE_ROLES } from '../../lib/auth/roles';
import { TableSkeleton } from '../../components/TableSkeleton';
import { useCompensatoryRestQuery, useScheduleCompensatoryMutation } from '../config/config-queries';
import { useOperarios } from '../operarios/operario-queries';

// ─── Labels ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CompensatoryType, { label: string; color: string }> = {
  OCCASIONAL: { label: 'OCCASIONAL', color: 'blue' },
  HABITUAL: { label: 'HABITUAL', color: 'red' },
};

const STATUS_LABELS: Record<CompensatoryStatus, { label: string; color: string }> = {
  PENDING: { label: 'PENDIENTE', color: 'yellow' },
  SCHEDULED: { label: 'PROGRAMADO', color: 'blue' },
  TAKEN: { label: 'TOMADO', color: 'green' },
};

// ─── CompensatoriosPanel ───────────────────────────────────────────────────────

export function CompensatoriosPanel() {
  const { user } = useAuth();
  const canWrite = hasAnyRole(user?.role, COMPENSACION_WRITE_ROLES);

  const [operarioFilter, setOperarioFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

  const rests = useCompensatoryRestQuery({
    operarioId: operarioFilter ?? undefined,
    month: monthFilter ?? undefined,
  });
  const operarios = useOperarios(true);
  const scheduleMutation = useScheduleCompensatoryMutation();

  const operarioOptions = useMemo(
    () => (operarios.data ?? []).map((o) => ({ value: o.id, label: o.fullName })),
    [operarios.data],
  );

  const operarioMap = useMemo(() => {
    const map = new Map<string, string>();
    (operarios.data ?? []).forEach((o) => map.set(o.id, o.fullName));
    return map;
  }, [operarios.data]);

  const monthOptions = useMemo(() => {
    const currentDate = new Date();
    const months: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });
      months.push({ value, label });
    }
    return months;
  }, []);

  const handleSchedule = async (id: string) => {
    const date = window.prompt('Fecha programada (YYYY-MM-DD):');
    if (!date) return;
    try {
      await scheduleMutation.mutateAsync({ id, scheduledDate: date });
      notifications.show({ color: 'teal', message: 'Descanso programado correctamente.' });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: err instanceof ApiError ? err.message : 'Error al programar.',
      });
    }
  };

  return (
    <Stack gap="lg" data-testid="compensatorios-tab-panel">
      {/* Filters */}
      <Group gap="sm">
        <Select
          placeholder="Filtrar por operario"
          aria-label="Filtrar operario"
          data={operarioOptions}
          value={operarioFilter}
          onChange={setOperarioFilter}
          searchable
          clearable
          w={240}
        />
        <Select
          placeholder="Filtrar por mes"
          aria-label="Filtrar mes"
          data={monthOptions}
          value={monthFilter}
          onChange={setMonthFilter}
          clearable
          w={200}
        />
      </Group>

      {/* Table */}
      {rests.isLoading && <TableSkeleton rows={4} />}

      {rests.isError && (
        <Alert color="red" title="Error">
          No se pudo cargar los descansos compensatorios.
        </Alert>
      )}

      {!rests.isLoading && !rests.isError && rests.data && (
        <>
          {rests.data.length === 0 ? (
            <Alert color="gray">No hay descansos compensatorios registrados.</Alert>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Operario</Table.Th>
                  <Table.Th>Mes</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Fecha programada</Table.Th>
                  {canWrite && <Table.Th>Acciones</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rests.data.map((cr) => {
                  const typeCfg = TYPE_LABELS[cr.type];
                  const statusCfg = STATUS_LABELS[cr.status];
                  return (
                    <Table.Tr key={cr.id}>
                      <Table.Td>{operarioMap.get(cr.operarioId) ?? cr.operarioId}</Table.Td>
                      <Table.Td>{cr.month}</Table.Td>
                      <Table.Td>
                        <Badge color={typeCfg.color} variant="light" size="sm">
                          {typeCfg.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={statusCfg.color} variant="light" size="sm">
                          {statusCfg.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{cr.scheduledDate ?? '—'}</Table.Td>
                      {canWrite && (
                        <Table.Td>
                          {cr.status === 'PENDING' && (
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => handleSchedule(cr.id)}
                              loading={scheduleMutation.isPending}
                            >
                              Programar
                            </Button>
                          )}
                        </Table.Td>
                      )}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </Stack>
  );
}
