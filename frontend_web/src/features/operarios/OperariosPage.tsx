import {
  Alert,
  Badge,
  Button,
  Group,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import type { OperarioDto } from '@futuragest/contracts';
import React, { useMemo, useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, OPERARIO_WRITE_ROLES } from '../../lib/auth/roles';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { CreateOperarioModal } from './CreateOperarioModal';
import { ImportOperariosModal } from './ImportOperariosModal';
import {
  useAreas,
  useMunicipios,
  useOperarios,
  useSupervisors,
  useZones,
} from './operario-queries';
import { buildSupervisorLabelMap } from './supervisor-label';
import { OperarioDetailDrawer } from './OperarioDetailDrawer';

const PAGE_SIZE = 10;

function isActive(op: OperarioDto): boolean {
  // Backend sends deactivatedAt: null for active rows; `== null` also tolerates
  // the field being omitted entirely. Never trust OperarioDto.active (not sent).
  return op.deactivatedAt == null;
}

export function OperariosPage() {
  useDocumentTitle('FuturaGest · Operarios');
  const { user } = useAuth();
  const canWrite = hasAnyRole(user?.role, OPERARIO_WRITE_ROLES);

  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [filterCargo, setFilterCargo] = useState<string | null>(null);
  const [filterSupervisorId, setFilterSupervisorId] = useState<string | null>(null);
  const [filterMunicipioId, setFilterMunicipioId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [modalOpened, modal] = useDisclosure(false);
  const [importOpened, importModal] = useDisclosure(false);
  const [selectedOp, setSelectedOp] = useState<OperarioDto | null>(null);

  const operarios = useOperarios(includeInactive);
  const supervisors = useSupervisors();
  const zones = useZones();
  const municipios = useMunicipios();
  const areas = useAreas();

  const labelMap = useMemo(
    () => buildSupervisorLabelMap(supervisors.data ?? [], zones.data ?? [], municipios.data ?? []),
    [supervisors.data, zones.data, municipios.data],
  );

  const zoneMap = useMemo(
    () => new Map((zones.data ?? []).map((z) => [z.id, z.name])),
    [zones.data],
  );
  const municipioMap = useMemo(
    () => new Map((municipios.data ?? []).map((m) => [m.id, m.name])),
    [municipios.data],
  );
  const supervisorMap = useMemo(
    () => new Map((supervisors.data ?? []).map((s) => [s.id, s])),
    [supervisors.data],
  );

  const supervisorOptions = useMemo(
    () => (supervisors.data ?? []).map((s) => ({ value: s.id, label: labelMap.get(s.id) ?? s.id })),
    [supervisors.data, labelMap],
  );

  const areaOptions = useMemo(
    () => (areas.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.horaInicio}–${a.horaFin})` })),
    [areas.data],
  );

  const cargoOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (operarios.data ?? [])
            .map((o) => o.cargo?.trim())
            .filter((c): c is string => !!c),
        ),
      )
        .sort()
        .map((c) => ({ value: c, label: c })),
    [operarios.data],
  );

  const municipioOptions = useMemo(
    () => (municipios.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    [municipios.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (operarios.data ?? []).filter((o) => {
      if (q && !o.fullName.toLowerCase().includes(q) && !o.documento.toLowerCase().includes(q))
        return false;
      if (filterCargo && (o.cargo?.trim() || '') !== filterCargo) return false;
      if (filterSupervisorId && o.supervisorId !== filterSupervisorId) return false;
      if (filterMunicipioId) {
        const sup = supervisorMap.get(o.supervisorId);
        if (!sup || sup.municipioId !== filterMunicipioId) return false;
      }
      return true;
    });
  }, [operarios.data, search, filterCargo, filterSupervisorId, filterMunicipioId, supervisorMap]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const onSearchChange = (value: string) => { setSearch(value); setPage(1); };
  const onIncludeInactiveChange = (value: boolean) => { setIncludeInactive(value); setPage(1); };
  const onCargoChange = (value: string | null) => { setFilterCargo(value); setPage(1); };
  const onSupervisorChange = (value: string | null) => { setFilterSupervisorId(value); setPage(1); };
  const onMunicipioChange = (value: string | null) => { setFilterMunicipioId(value); setPage(1); };

  if (operarios.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar los operarios. {operarios.error instanceof ApiError ? operarios.error.message : ''}
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Operarios</Title>
        {canWrite && (
          <Group gap="sm">
            <Button variant="default" onClick={importModal.open}>
              Importar
            </Button>
            {/* Oculto temporalmente a pedido del usuario (deshabilitado la creación manual)
            <Button onClick={modal.open}>Nuevo operario</Button>
            */}
          </Group>
        )}
      </Group>

      <Stack gap="xs">
        <Group wrap="wrap">
          <TextInput
            placeholder="Buscar por nombre o documento"
            aria-label="Buscar operarios"
            value={search}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Switch
            label="Mostrar inactivos"
            checked={includeInactive}
            onChange={(e) => onIncludeInactiveChange(e.currentTarget.checked)}
          />
        </Group>
        <Group wrap="wrap" gap="sm">
          <Select
            placeholder="Cargo"
            aria-label="Filtrar por cargo"
            data={cargoOptions}
            value={filterCargo}
            onChange={onCargoChange}
            clearable
            w={180}
          />
          <Select
            placeholder="Supervisor"
            aria-label="Filtrar por supervisor"
            data={supervisorOptions}
            value={filterSupervisorId}
            onChange={onSupervisorChange}
            clearable
            searchable
            w={220}
          />
          <Select
            placeholder="Municipio"
            aria-label="Filtrar por municipio"
            data={municipioOptions}
            value={filterMunicipioId}
            onChange={onMunicipioChange}
            clearable
            w={180}
          />
        </Group>
      </Stack>

      {operarios.isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👷"
          title="Sin operarios"
          message={
            search || includeInactive || filterCargo || filterSupervisorId || filterMunicipioId
              ? 'Ningún operario coincide con los filtros actuales.'
              : 'Agregue el primer operario para comenzar.'
          }
          // Oculto temporalmente a pedido del usuario (deshabilitado la creación manual)
          // action={canWrite ? <Button onClick={modal.open}>Nuevo operario</Button> : undefined}
        />
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Documento</Table.Th>
                <Table.Th>Cargo</Table.Th>
                <Table.Th>Zona</Table.Th>
                <Table.Th>Municipio</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map((op) => {
                const sup = supervisorMap.get(op.supervisorId);
                const zoneName = sup ? (zoneMap.get(sup.zoneId) ?? sup.zoneId) : '—';
                const municipioName = sup ? (municipioMap.get(sup.municipioId) ?? sup.municipioId) : '—';
                return (
                <Table.Tr
                  key={op.id}
                  onClick={() => setSelectedOp(op)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>{op.fullName}</Table.Td>
                  <Table.Td>{op.documento}</Table.Td>
                  <Table.Td>{op.cargo || '—'}</Table.Td>
                  <Table.Td>{zoneName}</Table.Td>
                  <Table.Td>{municipioName}</Table.Td>
                  <Table.Td>
                    <Badge color={isActive(op) ? 'teal' : 'gray'} variant="light">
                      {isActive(op) ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          {pageCount > 1 && (
            <Group justify="center">
              <Pagination total={pageCount} value={currentPage} onChange={setPage} />
            </Group>
          )}
        </>
      )}

      <CreateOperarioModal
        opened={modalOpened}
        onClose={modal.close}
        supervisorOptions={supervisorOptions}
        areaOptions={areaOptions}
      />
      <ImportOperariosModal opened={importOpened} onClose={importModal.close} />

      <OperarioDetailDrawer
        operario={selectedOp}
        onClose={() => setSelectedOp(null)}
        supervisorOptions={supervisorOptions}
        supervisorMap={supervisorMap}
        zoneMap={zoneMap}
        municipioMap={municipioMap}
        canWrite={canWrite}
      />
    </Stack>
  );
}
