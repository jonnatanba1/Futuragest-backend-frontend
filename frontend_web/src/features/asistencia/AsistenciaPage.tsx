import {
  Alert,
  Badge,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import type { AttendanceDto } from '@futuragest/contracts';
import React, { useMemo, useState } from 'react';
import { ApiError } from '../../lib/api/client';
import {
  useMunicipios,
  useOperarios,
  useSupervisors,
  useZones,
} from '../operarios/operario-queries';
import { buildSupervisorLabelMap } from '../operarios/supervisor-label';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { VerificationBadge } from '../../components/VerificationBadge';
import { AttendanceDetailDrawer } from './AttendanceDetailDrawer';
import { useAttendances } from './attendance-queries';
import { formatTime } from './format';

const PAGE_SIZE = 15;
type StatusFilter = 'all' | 'open' | 'completed';

export function AsistenciaPage() {
  useDocumentTitle('FuturaGest · Asistencia');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [filterSupervisorId, setFilterSupervisorId] = useState<string | null>(null);
  const [filterMunicipioId, setFilterMunicipioId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AttendanceDto | null>(null);
  const [drawerOpened, drawer] = useDisclosure(false);

  const attendances = useAttendances();
  const operarios = useOperarios(true);
  const supervisors = useSupervisors();
  const zones = useZones();
  const municipios = useMunicipios();

  const operarioName = useMemo(
    () => new Map((operarios.data ?? []).map((o) => [o.id, o.fullName])),
    [operarios.data],
  );
  const supervisorLabel = useMemo(
    () => buildSupervisorLabelMap(supervisors.data ?? [], zones.data ?? [], municipios.data ?? []),
    [supervisors.data, zones.data, municipios.data],
  );
  const zoneName = useMemo(
    () => new Map((zones.data ?? []).map((z) => [z.id, z.name])),
    [zones.data],
  );
  const supervisorMap = useMemo(
    () => new Map((supervisors.data ?? []).map((s) => [s.id, s])),
    [supervisors.data],
  );
  const supervisorOptions = useMemo(
    () => (supervisors.data ?? []).map((s) => ({ value: s.id, label: supervisorLabel.get(s.id) ?? s.id })),
    [supervisors.data, supervisorLabel],
  );
  const municipioOptions = useMemo(
    () => (municipios.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    [municipios.data],
  );

  const nameOf = (id: string) => operarioName.get(id) ?? id;
  const supOf = (id: string) => supervisorLabel.get(id) ?? id;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (attendances.data ?? [])
      .filter((a) => (date ? a.date === date : true))
      .filter((a) =>
        status === 'all' ? true : status === 'completed' ? a.completedAt != null : a.completedAt == null,
      )
      .filter((a) => {
        if (filterSupervisorId && a.supervisorId !== filterSupervisorId) return false;
        if (filterMunicipioId) {
          const sup = supervisorMap.get(a.supervisorId);
          if (!sup || sup.municipioId !== filterMunicipioId) return false;
        }
        if (!q) return true;
        return nameOf(a.operarioId).toLowerCase().includes(q) || supOf(a.supervisorId).toLowerCase().includes(q);
      })
      .sort((a, b) => (b.checkInReceivedAt ?? '').localeCompare(a.checkInReceivedAt ?? ''));
  }, [attendances.data, date, status, search, filterSupervisorId, filterMunicipioId, operarioName, supervisorLabel, supervisorMap]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openDetail = (a: AttendanceDto) => {
    setSelected(a);
    drawer.open();
  };

  if (attendances.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudo cargar la asistencia.{' '}
        {attendances.error instanceof ApiError ? attendances.error.message : ''}
      </Alert>
    );
  }

  return (
    <Stack>
      <Title order={2}>Asistencia</Title>

      <Stack gap="xs">
        <Group wrap="wrap">
          <TextInput
            placeholder="Buscar por operario o supervisor"
            aria-label="Buscar asistencia"
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            style={{ flex: 1, minWidth: 200 }}
          />
          <TextInput
            type="date"
            aria-label="Filtrar por fecha"
            value={date}
            onChange={(e) => { setDate(e.currentTarget.value); setPage(1); }}
          />
          <Select
            aria-label="Filtrar por estado"
            data={[
              { value: 'all', label: 'Todas' },
              { value: 'open', label: 'Abiertas' },
              { value: 'completed', label: 'Completadas' },
            ]}
            value={status}
            onChange={(v) => { setStatus((v as StatusFilter) ?? 'all'); setPage(1); }}
            allowDeselect={false}
            w={140}
          />
        </Group>
        <Group wrap="wrap" gap="sm">
          <Select
            placeholder="Supervisor"
            aria-label="Filtrar por supervisor"
            data={supervisorOptions}
            value={filterSupervisorId}
            onChange={(v) => { setFilterSupervisorId(v); setPage(1); }}
            clearable
            searchable
            w={220}
          />
          <Select
            placeholder="Municipio"
            aria-label="Filtrar por municipio"
            data={municipioOptions}
            value={filterMunicipioId}
            onChange={(v) => { setFilterMunicipioId(v); setPage(1); }}
            clearable
            w={180}
          />
        </Group>
      </Stack>

      {attendances.isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="Sin registros de asistencia"
          message="Ningún registro coincide con los filtros. Intente con otra fecha o estado."
        />
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Operario</Table.Th>
                <Table.Th>Supervisor</Table.Th>
                <Table.Th>Ingreso</Table.Th>
                <Table.Th>Salida</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Verificación</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map((a) => (
                <Table.Tr
                  key={a.id}
                  onClick={() => openDetail(a)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(a);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Ver asistencia de ${nameOf(a.operarioId)} el ${a.date}`}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>{a.date}</Table.Td>
                  <Table.Td>{nameOf(a.operarioId)}</Table.Td>
                  <Table.Td>{supOf(a.supervisorId)}</Table.Td>
                  <Table.Td>{formatTime(a.checkInCapturedAt)}</Table.Td>
                  <Table.Td>{formatTime(a.checkOutCapturedAt)}</Table.Td>
                  <Table.Td>
                    <Badge color={a.completedAt != null ? 'teal' : 'yellow'} variant="light">
                      {a.completedAt != null ? 'Completada' : 'Abierta'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <VerificationBadge method={a.checkInVerification} />
                  </Table.Td>
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

      <AttendanceDetailDrawer
        attendance={selected}
        opened={drawerOpened}
        onClose={drawer.close}
        operarioName={selected ? nameOf(selected.operarioId) : ''}
        supervisorLabel={selected ? supOf(selected.supervisorId) : ''}
        zoneName={selected ? (zoneName.get(selected.zoneId) ?? selected.zoneId) : ''}
      />
    </Stack>
  );
}
