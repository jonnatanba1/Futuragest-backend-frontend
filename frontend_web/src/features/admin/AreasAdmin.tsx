import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { AreaResponseDto } from '@futuragest/contracts';
import React, { useMemo, useState } from 'react';
import { AdminDetailDrawer } from './AdminDetailDrawer';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { useAreas, useZones } from '../operarios/operario-queries';
import { useCreateArea, useDeleteArea, useUpdateArea } from './admin-queries';

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

export function AreasAdmin() {
  const areas = useAreas();
  const zones = useZones();
  const createArea = useCreateArea();
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();
  const { user } = useAuth();

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    area?: AreaResponseDto;
  } | null>(null);
  const [toDelete, setToDelete] = useState<AreaResponseDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AreaResponseDto | null>(null);

  const isCoordinador = user?.role === 'COORDINADOR';
  const coordinadorZoneId =
    user?.role === 'COORDINADOR' && user.coordinatedZone ? user.coordinatedZone.id : null;

  const zoneName = useMemo(
    () => new Map((zones.data ?? []).map((z) => [z.id, z.name])),
    [zones.data],
  );
  const zoneOptions = (zones.data ?? []).map((z) => ({ value: z.id, label: z.name }));

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { name: '', horaInicio: '', horaFin: '', zoneId: '' },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : 'Ingrese un nombre'),
      horaInicio: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'Formato HH:MM requerido'),
      horaFin: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'Formato HH:MM requerido'),
      zoneId: (v) => (v ? null : 'Seleccione una zona'),
    },
  });

  const openCreate = () => {
    form.setValues({
      name: '',
      horaInicio: '',
      horaFin: '',
      zoneId: isCoordinador && coordinadorZoneId ? coordinadorZoneId : '',
    });
    setSubmitError(null);
    setEditor({ mode: 'create' });
  };
  const openEdit = (a: AreaResponseDto) => {
    form.setValues({
      name: a.name,
      horaInicio: a.horaInicio,
      horaFin: a.horaFin,
      zoneId: a.zoneId,
    });
    setSubmitError(null);
    setEditor({ mode: 'edit', area: a });
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (editor?.mode === 'edit' && editor.area) {
        await updateArea.mutateAsync({
          id: editor.area.id,
          name: values.name.trim(),
          horaInicio: values.horaInicio,
          horaFin: values.horaFin,
        });
        notifications.show({ color: 'teal', message: 'Área actualizada' });
      } else {
        await createArea.mutateAsync({
          name: values.name.trim(),
          horaInicio: values.horaInicio,
          horaFin: values.horaFin,
          zoneId: isCoordinador && coordinadorZoneId ? coordinadorZoneId : values.zoneId,
        });
        notifications.show({ color: 'teal', message: 'Área creada' });
      }
      setEditor(null);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Algo salió mal.');
    }
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteArea.mutateAsync(toDelete.id);
      notifications.show({ color: 'teal', message: 'Área eliminada' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'No se pudo eliminar el área',
      });
    } finally {
      setToDelete(null);
    }
  };

  if (areas.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar las áreas.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="flex-end">
        <Button onClick={openCreate}>Nueva área</Button>
      </Group>

      {areas.isLoading ? (
        <TableSkeleton />
      ) : (areas.data ?? []).length === 0 ? (
        <EmptyState icon="🏢" title="Sin áreas" message="Cree la primera área." />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Zona</Table.Th>
              <Table.Th>Hora Inicio</Table.Th>
              <Table.Th>Hora Fin</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(areas.data ?? []).map((a) => (
              <Table.Tr
                key={a.id}
                onClick={() => setSelected(a)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>{a.name}</Table.Td>
                <Table.Td>{zoneName.get(a.zoneId) ?? a.zoneId}</Table.Td>
                <Table.Td>{a.horaInicio}</Table.Td>
                <Table.Td>{a.horaFin}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <AdminDetailDrawer
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
      >
        {selected && (
          <>
            <Field label="ID" value={selected.id} />
            <Field label="Nombre" value={selected.name} />
            <Field label="Hora Inicio" value={selected.horaInicio} />
            <Field label="Hora Fin" value={selected.horaFin} />
            <Field label="Zona" value={zoneName.get(selected.zoneId) ?? selected.zoneId} />
            <Field label="Creado el" value={selected.createdAt?.slice(0, 10) ?? '—'} />

            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={() => openEdit(selected)}>
                Editar
              </Button>
              <Button
                variant="light"
                color="red"
                onClick={() => setToDelete(selected)}
              >
                Eliminar
              </Button>
            </Group>
          </>
        )}
      </AdminDetailDrawer>

      <Modal
        opened={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? 'Editar área' : 'Nueva área'}
        centered
      >
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            {submitError && (
              <Alert color="red" role="alert" variant="light">
                {submitError}
              </Alert>
            )}
            {!isCoordinador && (
              <Select
                label="Zona"
                placeholder="Seleccione una zona"
                data={zoneOptions}
                searchable
                required
                key={form.key('zoneId')}
                {...form.getInputProps('zoneId')}
              />
            )}
            <TextInput
              label="Nombre"
              required
              autoFocus
              key={form.key('name')}
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Hora Inicio"
              required
              placeholder="HH:MM"
              key={form.key('horaInicio')}
              {...form.getInputProps('horaInicio')}
            />
            <TextInput
              label="Hora Fin"
              required
              placeholder="HH:MM"
              key={form.key('horaFin')}
              {...form.getInputProps('horaFin')}
            />
            <Button type="submit" loading={createArea.isPending || updateArea.isPending}>
              {editor?.mode === 'edit' ? 'Guardar' : 'Crear'}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Eliminar área"
        centered
      >
        {toDelete && (
          <Stack>
            <Text size="sm">
              ¿Eliminar <strong>{toDelete.name}</strong>? Solo es posible si el área no tiene
              operarios asignados.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setToDelete(null)}>
                Cancelar
              </Button>
              <Button color="red" loading={deleteArea.isPending} onClick={handleDelete}>
                Eliminar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
