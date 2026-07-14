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
import type { MunicipioResponseDto } from '@futuragest/contracts';
import React, { useMemo, useState } from 'react';
import { AdminDetailDrawer } from './AdminDetailDrawer';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { ApiError } from '../../lib/api/client';
import { useMunicipios, useZones } from '../operarios/operario-queries';
import { useCreateMunicipio, useDeleteMunicipio, useUpdateMunicipio } from './admin-queries';

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

export function MunicipiosAdmin() {
  const municipios = useMunicipios();
  const zones = useZones();
  const createMunicipio = useCreateMunicipio();
  const updateMunicipio = useUpdateMunicipio();
  const deleteMunicipio = useDeleteMunicipio();

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    municipio?: MunicipioResponseDto;
  } | null>(null);
  const [toDelete, setToDelete] = useState<MunicipioResponseDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MunicipioResponseDto | null>(null);

  const zoneName = useMemo(
    () => new Map((zones.data ?? []).map((z) => [z.id, z.name])),
    [zones.data],
  );
  const zoneOptions = (zones.data ?? []).map((z) => ({ value: z.id, label: z.name }));

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { name: '', zoneId: '' },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : 'Ingrese un nombre'),
      zoneId: (v) => (v ? null : 'Seleccione una zona'),
    },
  });

  const openCreate = () => {
    form.setValues({ name: '', zoneId: '' });
    setSubmitError(null);
    setEditor({ mode: 'create' });
  };
  const openEdit = (m: MunicipioResponseDto) => {
    form.setValues({ name: m.name, zoneId: m.zoneId });
    setSubmitError(null);
    setEditor({ mode: 'edit', municipio: m });
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (editor?.mode === 'edit' && editor.municipio) {
        await updateMunicipio.mutateAsync({
          id: editor.municipio.id,
          name: values.name.trim(),
          zoneId: values.zoneId,
        });
        notifications.show({ color: 'teal', message: 'Municipio actualizado' });
      } else {
        await createMunicipio.mutateAsync({ name: values.name.trim(), zoneId: values.zoneId });
        notifications.show({ color: 'teal', message: 'Municipio creado' });
      }
      setEditor(null);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Algo salió mal.');
    }
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMunicipio.mutateAsync(toDelete.id);
      notifications.show({ color: 'teal', message: 'Municipio eliminado' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'No se pudo eliminar el municipio',
      });
    } finally {
      setToDelete(null);
    }
  };

  if (municipios.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar los municipios.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="flex-end">
        <Button onClick={openCreate}>Nuevo municipio</Button>
      </Group>

      {municipios.isLoading ? (
        <TableSkeleton />
      ) : (municipios.data ?? []).length === 0 ? (
        <EmptyState icon="📍" title="Sin municipios" message="Cree el primer municipio." />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Zona</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(municipios.data ?? []).map((m) => (
              <Table.Tr
                key={m.id}
                onClick={() => setSelected(m)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>{m.name}</Table.Td>
                <Table.Td>{zoneName.get(m.zoneId) ?? m.zoneId}</Table.Td>
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
        title={editor?.mode === 'edit' ? 'Editar municipio' : 'Nuevo municipio'}
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
            <Select
              label="Zona"
              placeholder="Seleccione una zona"
              data={zoneOptions}
              searchable
              required
              key={form.key('zoneId')}
              {...form.getInputProps('zoneId')}
            />
            <Button type="submit" loading={createMunicipio.isPending || updateMunicipio.isPending}>
              {editor?.mode === 'edit' ? 'Guardar' : 'Crear'}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Eliminar municipio"
        centered
      >
        {toDelete && (
          <Stack>
            <Text size="sm">
              ¿Eliminar <strong>{toDelete.name}</strong>? Solo es posible si no hay supervisores
              asignados a este municipio.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setToDelete(null)}>
                Cancelar
              </Button>
              <Button color="red" loading={deleteMunicipio.isPending} onClick={handleDelete}>
                Eliminar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
