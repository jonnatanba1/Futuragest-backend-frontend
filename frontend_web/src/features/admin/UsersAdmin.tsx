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
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { UserListItemDto } from '../../lib/api/client';
import React, { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { ApiError } from '../../lib/api/client';
import { useZones } from '../operarios/operario-queries';
import { useAssignCoordinador, useProvisionUser, useUsers } from './admin-queries';

const PROVISIONABLE_ROLES = ['GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO'];

export function UsersAdmin() {
  const users = useUsers();
  const zones = useZones();
  const provision = useProvisionUser();
  const assign = useAssignCoordinador();

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<UserListItemDto | null>(null);
  const [assignZone, setAssignZone] = useState<string | null>(null);

  const zoneName = useMemo(
    () => new Map((zones.data ?? []).map((z) => [z.id, z.name])),
    [zones.data],
  );
  const zoneOptions = (zones.data ?? []).map((z) => ({ value: z.id, label: z.name }));

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '', role: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Ingrese un correo válido'),
      password: (v) => (v.length >= 8 ? null : 'Al menos 8 caracteres'),
      role: (v) => (v ? null : 'Seleccione un rol'),
    },
  });

  const handleProvision = form.onSubmit(async (values) => {
    setProvisionError(null);
    try {
      await provision.mutateAsync(values);
      notifications.show({ color: 'teal', message: 'Usuario creado' });
      form.reset();
      setProvisionOpen(false);
    } catch (err) {
      setProvisionError(err instanceof ApiError ? err.message : 'Algo salió mal.');
    }
  });

  const handleAssign = async () => {
    if (!assignFor || !assignZone) return;
    try {
      await assign.mutateAsync({ userId: assignFor.id, zoneId: assignZone });
      notifications.show({ color: 'teal', message: 'Zona asignada' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'No se pudo asignar la zona',
      });
    } finally {
      setAssignFor(null);
      setAssignZone(null);
    }
  };

  if (users.isError) {
    return (
      <Alert color="red" role="alert">
        No se pudieron cargar los usuarios.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="flex-end">
        <Button onClick={() => setProvisionOpen(true)}>Crear usuario</Button>
      </Group>

      {users.isLoading ? (
        <TableSkeleton />
      ) : (users.data ?? []).length === 0 ? (
        <EmptyState icon="👥" title="Sin usuarios" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Correo electrónico</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>Zona (coordinador)</Table.Th>
              <Table.Th>Estado</Table.Th>
              <Table.Th>Acciones</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(users.data ?? []).map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.email}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{u.role}</Badge>
                </Table.Td>
                <Table.Td>
                  {u.coordinatedZoneId ? (zoneName.get(u.coordinatedZoneId) ?? u.coordinatedZoneId) : '—'}
                </Table.Td>
                <Table.Td>
                  {u.mustChangePassword ? (
                    <Badge color="yellow" variant="light">
                      Debe cambiar la contraseña
                    </Badge>
                  ) : (
                    <Badge color="teal" variant="light">
                      Activo
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {u.role === 'COORDINADOR' && (
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => {
                        setAssignFor(u);
                        setAssignZone(u.coordinatedZoneId);
                      }}
                    >
                      Asignar zona
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        title="Crear usuario"
        centered
      >
        <form onSubmit={handleProvision} noValidate>
          <Stack>
            {provisionError && (
              <Alert color="red" role="alert" variant="light">
                {provisionError}
              </Alert>
            )}
            <TextInput label="Correo electrónico" type="email" required key={form.key('email')} {...form.getInputProps('email')} />
            <PasswordInput
              label="Contraseña temporal"
              required
              key={form.key('password')}
              {...form.getInputProps('password')}
            />
            <Select
              label="Rol"
              placeholder="Seleccione un rol"
              data={PROVISIONABLE_ROLES}
              required
              key={form.key('role')}
              {...form.getInputProps('role')}
            />
            <Button type="submit" loading={provision.isPending}>
              Crear
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={assignFor !== null}
        onClose={() => setAssignFor(null)}
        title="Asignar zona a coordinador"
        centered
      >
        {assignFor && (
          <Stack>
            <Text size="sm">
              Asigne una zona a <strong>{assignFor.email}</strong>. Esto reemplaza al coordinador
              actual de esa zona.
            </Text>
            <Select
              label="Zona"
              placeholder="Seleccione una zona"
              data={zoneOptions}
              searchable
              value={assignZone}
              onChange={setAssignZone}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAssignFor(null)}>
                Cancelar
              </Button>
              <Button loading={assign.isPending} disabled={!assignZone} onClick={handleAssign}>
                Asignar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
