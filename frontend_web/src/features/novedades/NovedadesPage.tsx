import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { NovedadDto, NovedadStatus } from '@futuragest/contracts';
import React, { useMemo, useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, NOVEDAD_APPROVE_ROLES } from '../../lib/auth/roles';
import { formatDateTime } from '../asistencia/format';
import { useAttendances } from '../asistencia/attendance-queries';
import { useMunicipios, useOperarios, useSupervisors, useZones } from '../operarios/operario-queries';
import { buildSupervisorLabelMap } from '../operarios/supervisor-label';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { useApproveNovedad, useNovedades, useRejectNovedad } from './novedad-queries';

const PAGE_SIZE = 15;
type StatusFilter = 'all' | NovedadStatus;

const STATUS_COLOR: Record<NovedadStatus, string> = {
  PENDING: 'yellow',
  APPROVED: 'teal',
  REJECTED: 'red',
};

const STATUS_LABEL: Record<NovedadStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};

interface PendingAction {
  novedad: NovedadDto;
  action: 'approve' | 'reject';
}

export function NovedadesPage() {
  useDocumentTitle('FuturaGest · Novedades');
  const { user } = useAuth();
  const canApprove = hasAnyRole(user?.role, NOVEDAD_APPROVE_ROLES);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const novedades = useNovedades();
  const attendances = useAttendances();
  // includeInactive: novedades can reference deactivated operarios. This (and the
  // org/supervisor queries) may 403 for roles without IAM read (e.g. LIDER_OPERATIVO);
  // retry:false + id fallbacks keep the join graceful — do NOT "fix" the retry.
  const operarios = useOperarios(true);
  const supervisors = useSupervisors();
  const zones = useZones();
  const municipios = useMunicipios();
  const approve = useApproveNovedad();
  const reject = useRejectNovedad();

  const supervisorLabel = useMemo(
    () => buildSupervisorLabelMap(supervisors.data ?? [], zones.data ?? [], municipios.data ?? []),
    [supervisors.data, zones.data, municipios.data],
  );
  const operarioName = useMemo(
    () => new Map((operarios.data ?? []).map((o) => [o.id, o.fullName])),
    [operarios.data],
  );
  const attendanceOperario = useMemo(
    () => new Map((attendances.data ?? []).map((a) => [a.id, a.operarioId])),
    [attendances.data],
  );

  const supOf = (id: string) => supervisorLabel.get(id) ?? id;
  const operarioOf = (attendanceId: string) => {
    const operarioId = attendanceOperario.get(attendanceId);
    return operarioId ? (operarioName.get(operarioId) ?? operarioId) : '—';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (novedades.data ?? [])
      .filter((n) => (status === 'all' ? true : n.status === status))
      .filter((n) => {
        if (!q) return true;
        return (
          supOf(n.supervisorId).toLowerCase().includes(q) ||
          (n.motivo ?? '').toLowerCase().includes(q) ||
          operarioOf(n.attendanceId).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [novedades.data, status, search, supervisorLabel, attendanceOperario, operarioName]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const runPending = async () => {
    if (!pending) return;
    const mutation = pending.action === 'approve' ? approve : reject;
    try {
      await mutation.mutateAsync(pending.novedad.id);
      const msg = pending.action === 'approve' ? 'Novedad aprobada' : 'Novedad rechazada';
      notifications.show({ color: 'teal', message: msg });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'La acción falló',
      });
    } finally {
      setPending(null);
    }
  };

  if (novedades.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar las novedades.{' '}
        {novedades.error instanceof ApiError ? novedades.error.message : ''}
      </Alert>
    );
  }

  const actionInFlight = approve.isPending || reject.isPending;

  return (
    <Stack>
      <Title order={2}>Novedades</Title>

      <Group>
        <TextInput
          placeholder="Buscar por operario, supervisor o motivo"
          aria-label="Buscar novedades"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          flex={1}
        />
        <Select
          aria-label="Filtrar por estado"
          data={[
            { value: 'all', label: 'Todas' },
            { value: 'PENDING', label: 'Pendientes' },
            { value: 'APPROVED', label: 'Aprobadas' },
            { value: 'REJECTED', label: 'Rechazadas' },
          ]}
          value={status}
          onChange={(v) => {
            setStatus((v as StatusFilter) ?? 'all');
            setPage(1);
          }}
          allowDeselect={false}
          w={150}
        />
      </Group>

      {novedades.isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Sin novedades"
          message="Nada para revisar con los filtros actuales."
        />
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Operario</Table.Th>
                <Table.Th>Supervisor</Table.Th>
                <Table.Th>Horas extra</Table.Th>
                <Table.Th>Motivo</Table.Th>
                <Table.Th>Estado</Table.Th>
                {canApprove && <Table.Th>Acciones</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map((n) => (
                <Table.Tr key={n.id}>
                  <Table.Td>{formatDateTime(n.createdAt)}</Table.Td>
                  <Table.Td>{operarioOf(n.attendanceId)}</Table.Td>
                  <Table.Td>{supOf(n.supervisorId)}</Table.Td>
                  <Table.Td>{n.horasExtra}</Table.Td>
                  <Table.Td>{n.motivo ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[n.status]} variant="light">
                      {STATUS_LABEL[n.status]}
                    </Badge>
                  </Table.Td>
                  {canApprove && (
                    <Table.Td>
                      {n.status === 'PENDING' && (
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            color="teal"
                            disabled={actionInFlight}
                            onClick={() => setPending({ novedad: n, action: 'approve' })}
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={actionInFlight}
                            onClick={() => setPending({ novedad: n, action: 'reject' })}
                          >
                            Rechazar
                          </Button>
                        </Group>
                      )}
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {pageCount > 1 && (
            <Group justify="center">
              <Pagination total={pageCount} value={currentPage} onChange={setPage} />
            </Group>
          )}
        </>
      )}

      <Modal
        opened={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === 'approve' ? 'Aprobar novedad' : 'Rechazar novedad'}
        centered
      >
        {pending && (
          <Stack>
            <Text size="sm">
              ¿{pending.action === 'approve' ? 'Aprobar' : 'Rechazar'} las{' '}
              <strong>{pending.novedad.horasExtra} h</strong> extra de{' '}
              <strong>{operarioOf(pending.novedad.attendanceId)}</strong>?
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button
                color={pending.action === 'approve' ? 'teal' : 'red'}
                loading={actionInFlight}
                onClick={runPending}
              >
                {pending.action === 'approve' ? 'Aprobar' : 'Rechazar'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
