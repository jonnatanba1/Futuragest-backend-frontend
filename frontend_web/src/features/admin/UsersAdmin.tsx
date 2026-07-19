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
import type { SupervisorDto, UserListItemDto } from '../../lib/api/client';
import React, { useMemo, useState } from 'react';
import { AdminDetailDrawer } from './AdminDetailDrawer';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { ApiError } from '../../lib/api/client';
import { useZones, useSupervisors, useMunicipios } from '../operarios/operario-queries';
import {
  useAssignCoordinador,
  useCreateSupervisor,
  useProvisionUser,
  useUpdateSupervisor,
  useUpdateUser,
  useUsers,
} from './admin-queries';

const PROVISIONABLE_ROLES = ['GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO'];
const SUPERVISOR_ROLE = 'SUPERVISOR';
const ALL_CREATE_ROLES = [...PROVISIONABLE_ROLES, SUPERVISOR_ROLE];
const AREAS = ['BARRIDO', 'RECOLECCION', 'SUPERNUMERARIO'];

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

export function UsersAdmin() {
  const users = useUsers();
  const supervisors = useSupervisors();
  const zones = useZones();
  const municipios = useMunicipios();
  const provision = useProvisionUser();
  const createSupervisor = useCreateSupervisor();
  const updateSupervisor = useUpdateSupervisor();
  const assign = useAssignCoordinador();
  const updateUser = useUpdateUser();

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<UserListItemDto | null>(null);
  const [assignZone, setAssignZone] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserListItemDto | null>(null);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Supervisor join: userId → SupervisorDto
  const supervisorByUserId = useMemo(
    () => new Map((supervisors.data ?? []).map((s) => [s.userId, s])),
    [supervisors.data],
  );

  const zoneName = useMemo(
    () => new Map((zones.data ?? []).map((z) => [z.id, z.name])),
    [zones.data],
  );
  const muniName = useMemo(
    () => new Map((municipios.data ?? []).map((m) => [m.id, m.name])),
    [municipios.data],
  );

  const zoneOptions = (zones.data ?? []).map((z) => ({ value: z.id, label: z.name }));

  // --- Create form ---
  const createForm = useForm({
    mode: 'controlled',
    initialValues: {
      email: '',
      password: '',
      role: '',
      displayName: '',
      area: '',
      zoneId: '',
      municipioId: '',
    },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Ingrese un correo válido'),
      password: (v) => (v.length >= 8 ? null : 'Al menos 8 caracteres'),
      role: (v) => (v ? null : 'Seleccione un rol'),
    },
    validateInputOnChange: true,
  });

  const isSupervisorCreate = createForm.values.role === SUPERVISOR_ROLE;

  const createMuniOptions = (municipios.data ?? [])
    .filter((m) => m.zoneId === createForm.values.zoneId)
    .map((m) => ({ value: m.id, label: m.name }));

  const handleProvision = createForm.onSubmit(async (values) => {
    setProvisionError(null);
    try {
      if (values.role === SUPERVISOR_ROLE) {
        if (!values.area || !values.zoneId || !values.municipioId) {
          setProvisionError('Complete todos los campos del supervisor.');
          return;
        }
        await createSupervisor.mutateAsync({
          email: values.email,
          password: values.password,
          area: values.area,
          zoneId: values.zoneId,
          municipioId: values.municipioId,
          displayName: values.displayName.trim() || undefined,
        });
        notifications.show({ color: 'teal', message: 'Supervisor creado' });
      } else {
        await provision.mutateAsync({
          email: values.email,
          password: values.password,
          role: values.role,
          displayName: values.displayName.trim() || undefined,
        });
        notifications.show({ color: 'teal', message: 'Usuario creado' });
      }
      createForm.reset();
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

  // --- Edit form: regular user ---
  const editUserForm = useForm({
    mode: 'uncontrolled',
    initialValues: { displayName: '', role: '' },
    validate: {
      role: (v) => (v ? null : 'Seleccione un rol'),
    },
  });

  // --- Edit form: supervisor ---
  const editSupForm = useForm({
    mode: 'uncontrolled',
    initialValues: { municipioId: '', area: '', displayName: '', zoneId: '' },
    validate: {
      area: (v) => (v ? null : 'Seleccione un área'),
      municipioId: (v) => (v ? null : 'Seleccione un municipio'),
    },
  });

  const editSupMuniOptions = (municipios.data ?? [])
    .filter((m) => m.zoneId === editSupForm.values.zoneId)
    .map((m) => ({ value: m.id, label: m.name }));

  const isSupervisorEdit = selected?.role === SUPERVISOR_ROLE;

  const openEdit = (u: UserListItemDto) => {
    if (u.role === SUPERVISOR_ROLE) {
      const sup = supervisorByUserId.get(u.id);
      editSupForm.setValues({
        municipioId: sup?.municipioId ?? '',
        area: sup?.area ?? '',
        displayName: u.displayName ?? '',
        zoneId: sup?.zoneId ?? '',
      });
    } else {
      editUserForm.setValues({
        displayName: u.displayName ?? '',
        role: u.role,
      });
    }
    setEditError(null);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selected) return;
    setEditError(null);

    try {
      if (isSupervisorEdit) {
        const sup = supervisorByUserId.get(selected.id);
        if (!sup) {
          setEditError('No se encontraron los datos del supervisor.');
          return;
        }
        const supValues = editSupForm.getValues();
        if (!supValues.area || !supValues.municipioId) {
          setEditError('Complete todos los campos obligatorios.');
          return;
        }
        await updateSupervisor.mutateAsync({
          id: sup.id,
          municipioId: supValues.municipioId,
          area: supValues.area,
          displayName: supValues.displayName.trim() || undefined,
        });
        notifications.show({ color: 'teal', message: 'Supervisor actualizado' });
      } else {
        const userValues = editUserForm.getValues();
        if (!userValues.role) {
          setEditError('Seleccione un rol.');
          return;
        }
        await updateUser.mutateAsync({
          id: selected.id,
          displayName: userValues.displayName.trim() || undefined,
          role: userValues.role,
        });
        notifications.show({ color: 'teal', message: 'Usuario actualizado' });
      }
      setEditOpen(false);
      setSelected(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Algo salió mal.');
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
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Correo electrónico</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>Área</Table.Th>
              <Table.Th>Municipio</Table.Th>
              <Table.Th>Zona</Table.Th>
              <Table.Th>Estado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(users.data ?? []).map((u) => {
              const sup = u.role === SUPERVISOR_ROLE ? supervisorByUserId.get(u.id) : null;
              return (
                <Table.Tr
                  key={u.id}
                  onClick={() => setSelected(u)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>{u.displayName || '—'}</Table.Td>
                  <Table.Td>{u.email}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{u.role}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {sup ? <Badge variant="light">{sup.area}</Badge> : '—'}
                  </Table.Td>
                  <Table.Td>
                    {sup ? (muniName.get(sup.municipioId) ?? sup.municipioId) : '—'}
                  </Table.Td>
                  <Table.Td>
                    {u.coordinatedZoneId
                      ? (zoneName.get(u.coordinatedZoneId) ?? u.coordinatedZoneId)
                      : sup
                        ? (zoneName.get(sup.zoneId) ?? sup.zoneId)
                        : '—'}
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
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      <AdminDetailDrawer
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.email ?? ''}
      >
        {selected && (
          <>
            <Field label="Correo electrónico" value={selected.email} />
            <Field label="Nombre visible" value={selected.displayName || '—'} />
            <Field label="Rol" value={selected.role} />
            {selected.role === SUPERVISOR_ROLE && (() => {
              const sup = supervisorByUserId.get(selected.id);
              if (!sup) return null;
              return (
                <>
                  <Field label="Área" value={sup.area} />
                  <Field label="Zona" value={zoneName.get(sup.zoneId) ?? sup.zoneId} />
                  <Field label="Municipio" value={muniName.get(sup.municipioId) ?? sup.municipioId} />
                </>
              );
            })()}
            <Field
              label="Zona (coordinador)"
              value={
                selected.coordinatedZoneId
                  ? (zoneName.get(selected.coordinatedZoneId) ?? selected.coordinatedZoneId)
                  : '—'
              }
            />

            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={() => openEdit(selected)}>
                Editar
              </Button>
              {selected.role === 'COORDINADOR' && (
                <Button
                  variant="light"
                  onClick={() => {
                    setAssignFor(selected);
                    setAssignZone(selected.coordinatedZoneId);
                  }}
                >
                  Asignar zona
                </Button>
              )}
            </Group>
          </>
        )}
      </AdminDetailDrawer>

      {/* Create user modal */}
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
            <TextInput
              label="Correo electrónico"
              type="email"
              required
              key={createForm.key('email')}
              {...createForm.getInputProps('email')}
            />
            <PasswordInput
              label="Contraseña temporal"
              required
              key={createForm.key('password')}
              {...createForm.getInputProps('password')}
            />
            <TextInput
              label="Nombre visible"
              key={createForm.key('displayName')}
              {...createForm.getInputProps('displayName')}
            />
            <Select
              label="Rol"
              placeholder="Seleccione un rol"
              data={ALL_CREATE_ROLES}
              required
              key={createForm.key('role')}
              {...createForm.getInputProps('role')}
              onChange={(v) => {
                createForm.setFieldValue('role', v ?? '');
                if (v !== SUPERVISOR_ROLE) {
                  createForm.setFieldValue('area', '');
                  createForm.setFieldValue('zoneId', '');
                  createForm.setFieldValue('municipioId', '');
                }
              }}
            />
            {isSupervisorCreate && (
              <>
                <Select
                  label="Área"
                  placeholder="Seleccione un área"
                  data={AREAS}
                  required
                  {...createForm.getInputProps('area')}
                />
                <Select
                  label="Zona"
                  placeholder="Seleccione una zona"
                  data={zoneOptions}
                  searchable
                  required
                  {...createForm.getInputProps('zoneId')}
                  onChange={(v) => {
                    createForm.setFieldValue('zoneId', v ?? '');
                    createForm.setFieldValue('municipioId', '');
                  }}
                />
                <Select
                  label="Municipio"
                  placeholder={
                    createForm.values.zoneId
                      ? 'Seleccione un municipio'
                      : 'Seleccione una zona primero'
                  }
                  data={createMuniOptions}
                  searchable
                  required
                  disabled={!createForm.values.zoneId}
                  {...createForm.getInputProps('municipioId')}
                />
              </>
            )}
            <Button type="submit" loading={provision.isPending || createSupervisor.isPending}>
              Crear
            </Button>
          </Stack>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        title={isSupervisorEdit ? 'Editar supervisor' : 'Editar usuario'}
        centered
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleEdit();
          }}
          noValidate
        >
          <Stack>
            {editError && (
              <Alert color="red" role="alert" variant="light">
                {editError}
              </Alert>
            )}

            {isSupervisorEdit ? (
              <>
                <Select
                  label="Área"
                  placeholder="Seleccione un área"
                  data={AREAS}
                  required
                  key={editSupForm.key('area')}
                  {...editSupForm.getInputProps('area')}
                />
                <Select
                  label="Zona"
                  placeholder="Seleccione una zona"
                  data={zoneOptions}
                  searchable
                  required
                  key={editSupForm.key('zoneId')}
                  {...editSupForm.getInputProps('zoneId')}
                  onChange={(v) => {
                    editSupForm.setFieldValue('zoneId', v ?? '');
                    editSupForm.setFieldValue('municipioId', '');
                  }}
                />
                <Select
                  label="Municipio"
                  placeholder={
                    editSupForm.values.zoneId
                      ? 'Seleccione un municipio'
                      : 'Seleccione una zona primero'
                  }
                  data={editSupMuniOptions}
                  searchable
                  required
                  disabled={!editSupForm.values.zoneId}
                  key={editSupForm.key('municipioId')}
                  {...editSupForm.getInputProps('municipioId')}
                />
                <TextInput
                  label="Nombre visible"
                  key={editSupForm.key('displayName')}
                  {...editSupForm.getInputProps('displayName')}
                />
              </>
            ) : (
              <>
                <TextInput
                  label="Nombre visible"
                  key={editUserForm.key('displayName')}
                  {...editUserForm.getInputProps('displayName')}
                />
                <Select
                  label="Rol"
                  placeholder="Seleccione un rol"
                  data={PROVISIONABLE_ROLES}
                  required
                  key={editUserForm.key('role')}
                  {...editUserForm.getInputProps('role')}
                />
              </>
            )}

            <Button type="submit" loading={updateUser.isPending || updateSupervisor.isPending}>
              Guardar
            </Button>
          </Stack>
        </form>
      </Modal>

      {/* Assign zone modal */}
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
