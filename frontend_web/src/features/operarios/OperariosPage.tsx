import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
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
  useDeactivateOperario,
  useMunicipios,
  useOperarios,
  useReactivateOperario,
  useReassignOperario,
  useSupervisors,
  useZones,
} from './operario-queries';
import { buildSupervisorLabelMap } from './supervisor-label';

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
  const [page, setPage] = useState(1);
  const [modalOpened, modal] = useDisclosure(false);
  const [importOpened, importModal] = useDisclosure(false);
  const [toDeactivate, setToDeactivate] = useState<OperarioDto | null>(null);
  const [toReassign, setToReassign] = useState<OperarioDto | null>(null);
  const [reassignSup, setReassignSup] = useState<string | null>(null);

  const operarios = useOperarios(includeInactive);
  const supervisors = useSupervisors();
  const zones = useZones();
  const municipios = useMunicipios();
  const deactivate = useDeactivateOperario();
  const reactivate = useReactivateOperario();
  const reassign = useReassignOperario();

  const labelMap = useMemo(
    () => buildSupervisorLabelMap(supervisors.data ?? [], zones.data ?? [], municipios.data ?? []),
    [supervisors.data, zones.data, municipios.data],
  );

  const supervisorOptions = useMemo(
    () => (supervisors.data ?? []).map((s) => ({ value: s.id, label: labelMap.get(s.id) ?? s.id })),
    [supervisors.data, labelMap],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = operarios.data ?? [];
    if (!q) return rows;
    return rows.filter(
      (o) => o.fullName.toLowerCase().includes(q) || o.documento.toLowerCase().includes(q),
    );
  }, [operarios.data, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const onSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const onIncludeInactiveChange = (value: boolean) => {
    setIncludeInactive(value);
    setPage(1);
  };

  const runAction = async (action: Promise<unknown>, ok: string) => {
    try {
      await action;
      notifications.show({ color: 'teal', message: ok });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'La acción falló',
      });
    }
  };

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
            <Button onClick={modal.open}>Nuevo operario</Button>
          </Group>
        )}
      </Group>

      <Group>
        <TextInput
          placeholder="Buscar por nombre o documento"
          aria-label="Buscar operarios"
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          flex={1}
        />
        <Switch
          label="Mostrar inactivos"
          checked={includeInactive}
          onChange={(e) => onIncludeInactiveChange(e.currentTarget.checked)}
        />
      </Group>

      {operarios.isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👷"
          title="Sin operarios"
          message={
            search || includeInactive
              ? 'Ningún operario coincide con los filtros actuales.'
              : 'Agregue el primer operario para comenzar.'
          }
          action={canWrite ? <Button onClick={modal.open}>Nuevo operario</Button> : undefined}
        />
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Documento</Table.Th>
                <Table.Th>Supervisor</Table.Th>
                <Table.Th>Estado</Table.Th>
                {canWrite && <Table.Th>Acciones</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map((op) => (
                <Table.Tr key={op.id}>
                  <Table.Td>{op.fullName}</Table.Td>
                  <Table.Td>{op.documento}</Table.Td>
                  <Table.Td>{labelMap.get(op.supervisorId) ?? op.supervisorId}</Table.Td>
                  <Table.Td>
                    <Badge color={isActive(op) ? 'teal' : 'gray'} variant="light">
                      {isActive(op) ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Table.Td>
                  {canWrite && (
                    <Table.Td>
                      <Group gap="xs">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => {
                          setToReassign(op);
                          setReassignSup(op.supervisorId);
                        }}
                      >
                        Reasignar
                      </Button>
                      {isActive(op) ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          loading={deactivate.isPending && deactivate.variables === op.id}
                          onClick={() => setToDeactivate(op)}
                        >
                          Desactivar
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="subtle"
                          loading={reactivate.isPending && reactivate.variables === op.id}
                          onClick={() =>
                            runAction(reactivate.mutateAsync(op.id), 'Operario reactivado')
                          }
                        >
                          Reactivar
                        </Button>
                      )}
                      </Group>
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

      <CreateOperarioModal
        opened={modalOpened}
        onClose={modal.close}
        supervisorOptions={supervisorOptions}
      />
      <ImportOperariosModal opened={importOpened} onClose={importModal.close} />

      <Modal
        opened={toDeactivate !== null}
        onClose={() => setToDeactivate(null)}
        title="Desactivar operario"
        centered
      >
        {toDeactivate && (
          <Stack>
            <Text size="sm">
              ¿Desactivar a <strong>{toDeactivate.fullName}</strong>? Saldrá de la lista activa
              y ya no podrá registrar asistencia. Puede reactivarlo más adelante.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setToDeactivate(null)}>
                Cancelar
              </Button>
              <Button
                color="red"
                loading={deactivate.isPending}
                onClick={() =>
                  void runAction(
                    deactivate.mutateAsync(toDeactivate.id),
                    'Operario desactivado',
                  ).finally(() => setToDeactivate(null))
                }
              >
                Desactivar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={toReassign !== null}
        onClose={() => setToReassign(null)}
        title="Reasignar operario"
        centered
      >
        {toReassign && (
          <Stack>
            <Text size="sm">
              Reasigne a <strong>{toReassign.fullName}</strong> a un supervisor diferente.
            </Text>
            <Select
              label="Supervisor"
              placeholder="Seleccione un supervisor"
              data={supervisorOptions}
              searchable
              value={reassignSup}
              onChange={setReassignSup}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setToReassign(null)}>
                Cancelar
              </Button>
              <Button
                loading={reassign.isPending}
                disabled={!reassignSup || reassignSup === toReassign.supervisorId}
                onClick={() =>
                  void runAction(
                    reassign.mutateAsync({ id: toReassign.id, supervisorId: reassignSup as string }),
                    'Operario reasignado',
                  ).finally(() => setToReassign(null))
                }
              >
                Reasignar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
