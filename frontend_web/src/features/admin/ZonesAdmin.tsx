import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { ZoneResponseDto } from '@futuragest/contracts';
import React, { useState } from 'react';
import { AdminDetailDrawer } from './AdminDetailDrawer';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { ApiError } from '../../lib/api/client';
import { useZones } from '../operarios/operario-queries';
import { useCreateZone, useDeleteZone, useUpdateZone } from './admin-queries';

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

export function ZonesAdmin() {
  const zones = useZones();
  const createZone = useCreateZone();
  const updateZone = useUpdateZone();
  const deleteZone = useDeleteZone();

  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; zone?: ZoneResponseDto } | null>(
    null,
  );
  const [toDelete, setToDelete] = useState<ZoneResponseDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ZoneResponseDto | null>(null);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { name: '' },
    validate: { name: (v) => (v.trim().length > 0 ? null : 'Ingrese un nombre') },
  });

  const openCreate = () => {
    form.setValues({ name: '' });
    setSubmitError(null);
    setEditor({ mode: 'create' });
  };
  const openEdit = (zone: ZoneResponseDto) => {
    form.setValues({ name: zone.name });
    setSubmitError(null);
    setEditor({ mode: 'edit', zone });
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (editor?.mode === 'edit' && editor.zone) {
        await updateZone.mutateAsync({ id: editor.zone.id, name: values.name.trim() });
        notifications.show({ color: 'teal', message: 'Zona actualizada' });
      } else {
        await createZone.mutateAsync(values.name.trim());
        notifications.show({ color: 'teal', message: 'Zona creada' });
      }
      setEditor(null);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Algo salió mal.');
    }
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteZone.mutateAsync(toDelete.id);
      notifications.show({ color: 'teal', message: 'Zona eliminada' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'No se pudo eliminar la zona',
      });
    } finally {
      setToDelete(null);
    }
  };

  if (zones.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar las zonas.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="flex-end">
        <Button onClick={openCreate}>Nueva zona</Button>
      </Group>

      {zones.isLoading ? (
        <TableSkeleton />
      ) : (zones.data ?? []).length === 0 ? (
        <EmptyState icon="🗺️" title="Sin zonas" message="Cree la primera zona." />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(zones.data ?? []).map((z) => (
              <Table.Tr
                key={z.id}
                onClick={() => setSelected(z)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>{z.name}</Table.Td>
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
        title={editor?.mode === 'edit' ? 'Editar zona' : 'Nueva zona'}
        centered
      >
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            {submitError && (
              <Alert color="red" role="alert" variant="light">
                {submitError}
              </Alert>
            )}
            <TextInput label="Nombre" required autoFocus key={form.key('name')} {...form.getInputProps('name')} />
            <Button type="submit" loading={createZone.isPending || updateZone.isPending}>
              {editor?.mode === 'edit' ? 'Guardar' : 'Crear'}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={toDelete !== null} onClose={() => setToDelete(null)} title="Eliminar zona" centered>
        {toDelete && (
          <Stack>
            <Text size="sm">
              ¿Eliminar <strong>{toDelete.name}</strong>? Solo es posible si la zona no tiene
              municipios, supervisores ni coordinador asignado.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setToDelete(null)}>
                Cancelar
              </Button>
              <Button color="red" loading={deleteZone.isPending} onClick={handleDelete}>
                Eliminar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
