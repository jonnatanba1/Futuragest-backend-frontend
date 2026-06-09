import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Table,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import React, { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { ApiError } from '../../lib/api/client';
import { useMunicipios, useSupervisors, useZones } from '../operarios/operario-queries';
import { useCreateSupervisor } from './admin-queries';

const AREAS = ['BARRIDO', 'RECOLECCION', 'SUPERNUMERARIO'];

export function SupervisoresAdmin() {
  const supervisors = useSupervisors();
  const zones = useZones();
  const municipios = useMunicipios();
  const createSupervisor = useCreateSupervisor();

  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const zoneName = useMemo(() => new Map((zones.data ?? []).map((z) => [z.id, z.name])), [zones.data]);
  const muniName = useMemo(
    () => new Map((municipios.data ?? []).map((m) => [m.id, m.name])),
    [municipios.data],
  );

  const form = useForm({
    mode: 'controlled',
    initialValues: { email: '', password: '', area: '', zoneId: '', municipioId: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Ingrese un correo válido'),
      password: (v) => (v.length >= 8 ? null : 'Al menos 8 caracteres'),
      area: (v) => (v ? null : 'Seleccione un área'),
      zoneId: (v) => (v ? null : 'Seleccione una zona'),
      municipioId: (v) => (v ? null : 'Seleccione un municipio'),
    },
  });

  const zoneOptions = (zones.data ?? []).map((z) => ({ value: z.id, label: z.name }));
  const muniOptions = (municipios.data ?? [])
    .filter((m) => m.zoneId === form.values.zoneId)
    .map((m) => ({ value: m.id, label: m.name }));

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      await createSupervisor.mutateAsync(values);
      notifications.show({ color: 'teal', message: 'Supervisor creado' });
      form.reset();
      setOpen(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Algo salió mal.');
    }
  });

  if (supervisors.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar los supervisores.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="flex-end">
        <Button onClick={() => setOpen(true)}>Nuevo supervisor</Button>
      </Group>

      {supervisors.isLoading ? (
        <TableSkeleton />
      ) : (supervisors.data ?? []).length === 0 ? (
        <EmptyState icon="🧑‍💼" title="Sin supervisores" message="Cree el primer supervisor." />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Correo electrónico</Table.Th>
              <Table.Th>Área</Table.Th>
              <Table.Th>Zona</Table.Th>
              <Table.Th>Municipio</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(supervisors.data ?? []).map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.email}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{s.area}</Badge>
                </Table.Td>
                <Table.Td>{zoneName.get(s.zoneId) ?? s.zoneId}</Table.Td>
                <Table.Td>{muniName.get(s.municipioId) ?? s.municipioId}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Nuevo supervisor" centered>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            {submitError && (
              <Alert color="red" role="alert" variant="light">
                {submitError}
              </Alert>
            )}
            <TextInput label="Correo electrónico" type="email" required key={form.key('email')} {...form.getInputProps('email')} />
            <PasswordInput
              label="Contraseña temporal"
              required
              key={form.key('password')}
              {...form.getInputProps('password')}
            />
            <Select label="Área" placeholder="Seleccione un área" data={AREAS} required {...form.getInputProps('area')} />
            <Select
              label="Zona"
              placeholder="Seleccione una zona"
              data={zoneOptions}
              searchable
              required
              {...form.getInputProps('zoneId')}
              onChange={(v) => {
                form.setFieldValue('zoneId', v ?? '');
                form.setFieldValue('municipioId', '');
              }}
            />
            <Select
              label="Municipio"
              placeholder={form.values.zoneId ? 'Seleccione un municipio' : 'Seleccione una zona primero'}
              data={muniOptions}
              searchable
              required
              disabled={!form.values.zoneId}
              {...form.getInputProps('municipioId')}
            />
            <Button type="submit" loading={createSupervisor.isPending}>
              Crear supervisor
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
