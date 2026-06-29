import {
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { OperarioDto } from '@futuragest/contracts';
import React, { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api/client';
import type { SupervisorDto } from '../../lib/api/client';
import {
  useDeactivateOperario,
  useReactivateOperario,
  useReassignOperario,
} from './operario-queries';

interface OperarioDetailDrawerProps {
  operario: OperarioDto | null;
  onClose: () => void;
  supervisorOptions: { value: string; label: string }[];
  supervisorMap: Map<string, SupervisorDto>;
  zoneMap: Map<string, string>;
  municipioMap: Map<string, string>;
  canWrite: boolean;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </div>
  );
}

function isActive(op: OperarioDto): boolean {
  return op.deactivatedAt == null;
}

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

export function OperarioDetailDrawer({
  operario,
  onClose,
  supervisorOptions,
  supervisorMap,
  zoneMap,
  municipioMap,
  canWrite,
}: OperarioDetailDrawerProps) {
  const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [reassignSup, setReassignSup] = useState<string | null>(null);

  const deactivate = useDeactivateOperario();
  const reactivate = useReactivateOperario();
  const reassign = useReassignOperario();

  // Sync reassignSup when the selected operario changes
  useEffect(() => {
    setReassignSup(operario?.supervisorId ?? null);
  }, [operario?.supervisorId, operario?.id]);

  const active = operario ? isActive(operario) : false;

  const sup = operario ? supervisorMap.get(operario.supervisorId) : undefined;
  const zoneName = sup ? (zoneMap.get(sup.zoneId) ?? sup.zoneId) : '—';
  const municipioName = sup ? (municipioMap.get(sup.municipioId) ?? sup.municipioId) : '—';
  const createdAtDisplay = operario?.createdAt ? operario.createdAt.slice(0, 10) : '—';

  const handleReassign = async () => {
    if (!operario || !reassignSup) return;
    await runAction(
      reassign.mutateAsync({ id: operario.id, supervisorId: reassignSup }),
      'Operario reasignado',
    );
    onClose();
  };

  const handleDeactivate = async () => {
    if (!operario) return;
    await runAction(deactivate.mutateAsync(operario.id), 'Operario desactivado');
    closeConfirm();
    onClose();
  };

  const handleReactivate = async () => {
    if (!operario) return;
    await runAction(reactivate.mutateAsync(operario.id), 'Operario reactivado');
    onClose();
  };

  return (
    <>
      <Drawer
        opened={operario !== null}
        onClose={onClose}
        title={operario?.fullName ?? ''}
        position="right"
        size="md"
      >
        {operario && (
          <Stack>
            <Badge color={active ? 'teal' : 'gray'} variant="light" w="fit-content">
              {active ? 'Activo' : 'Inactivo'}
            </Badge>

            <Field label="Nombre completo" value={operario.fullName} />
            <Field label="Documento" value={operario.documento} />
            <Field label="Cargo" value={operario.cargo || '—'} />
            <Field label="Supervisor" value={sup?.email ?? '—'} />
            <Field label="Zona" value={zoneName} />
            <Field label="Municipio" value={municipioName} />
            <Field label="Creado el" value={createdAtDisplay} />

            {canWrite && (
              <Stack mt="md">
                <Text fw={600} size="sm">
                  Reasignar supervisor
                </Text>
                <Select
                  label="Supervisor"
                  placeholder="Seleccione un supervisor"
                  data={supervisorOptions}
                  searchable
                  value={reassignSup}
                  onChange={setReassignSup}
                />
                <Button
                  onClick={() => void handleReassign()}
                  disabled={!reassignSup || reassignSup === operario.supervisorId}
                  loading={reassign.isPending}
                >
                  Reasignar
                </Button>

                {active ? (
                  <Button color="red" variant="light" onClick={openConfirm}>
                    Desactivar
                  </Button>
                ) : (
                  <Button
                    variant="light"
                    loading={reactivate.isPending}
                    onClick={() => void handleReactivate()}
                  >
                    Reactivar
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </Drawer>

      <Modal
        opened={confirmOpen}
        onClose={closeConfirm}
        title="Desactivar operario"
        centered
      >
        {operario && (
          <Stack>
            <Text size="sm">
              ¿Desactivar a <strong>{operario.fullName}</strong>? Saldrá de la lista activa y ya no
              podrá registrar asistencia. Puede reactivarlo más adelante.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={closeConfirm}>
                Cancelar
              </Button>
              <Button
                color="red"
                loading={deactivate.isPending}
                onClick={() => void handleDeactivate()}
              >
                Desactivar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
