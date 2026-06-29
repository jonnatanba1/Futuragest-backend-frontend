import {
  Alert,
  Button,
  Card,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import React from 'react';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, COMPENSACION_WRITE_ROLES } from '../../lib/auth/roles';
import { TableSkeleton } from '../../components/TableSkeleton';
import {
  useCreateJornadaPolicyMutation,
  useJornadaPoliciesQuery,
} from './compensacion-queries';

// ─── Create-policy form ───────────────────────────────────────────────────────

interface PolicyFormValues {
  horasDiarias: number | '';
  vigenteDesde: string;
}

function CreatePolicyForm() {
  const createMutation = useCreateJornadaPolicyMutation();

  const form = useForm<PolicyFormValues>({
    mode: 'uncontrolled',
    validateInputOnBlur: true,
    initialValues: {
      horasDiarias: '',
      vigenteDesde: '',
    },
    validate: {
      horasDiarias: (v) => {
        if (v === '' || v === undefined || v === null) return 'Las horas diarias son requeridas';
        if (Number(v) <= 0) return 'Las horas diarias deben ser mayores a 0';
        return null;
      },
      vigenteDesde: (v) =>
        !v || v.trim() === '' ? 'La fecha de vigencia es requerida' : null,
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await createMutation.mutateAsync({
        horasDiarias: Number(values.horasDiarias),
        vigenteDesde: values.vigenteDesde,
      });

      notifications.show({
        color: 'teal',
        message: 'Política de jornada creada correctamente.',
      });

      form.reset();
    } catch (err) {
      if (err instanceof ApiError) {
        notifications.show({
          color: 'red',
          title: err.status === 409 ? 'Conflicto de fechas' : 'Error',
          message:
            err.message ||
            'No se pudo crear la política de jornada.',
        });
      } else {
        notifications.show({
          color: 'red',
          title: 'Error',
          message: 'Ocurrió un error inesperado.',
        });
      }
    }
  });

  return (
    <Card withBorder>
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="sm">
          <Title order={5}>Nueva política</Title>

          <NumberInput
            label="Horas diarias"
            aria-label="Horas diarias"
            placeholder="8"
            min={0.01}
            step={0.5}
            decimalScale={2}
            required
            key={form.key('horasDiarias')}
            {...form.getInputProps('horasDiarias')}
          />

          <TextInput
            label="Vigente desde"
            aria-label="Vigente desde"
            placeholder="YYYY-MM-DD"
            required
            key={form.key('vigenteDesde')}
            {...form.getInputProps('vigenteDesde')}
          />

          <Button
            type="submit"
            loading={createMutation.isPending}
          >
            Agregar política
          </Button>
        </Stack>
      </form>
    </Card>
  );
}

// ─── Policy timeline table ────────────────────────────────────────────────────

// ─── JornadaPolicyPanel ───────────────────────────────────────────────────────

/**
 * "Política de jornada" tab body.
 * - Timeline table visible to all OFFICE_ROLES.
 * - Create form visible only to COMPENSACION_WRITE_ROLES.
 */
export function JornadaPolicyPanel() {
  const { user } = useAuth();
  const canWrite = hasAnyRole(user?.role, COMPENSACION_WRITE_ROLES);

  const policies = useJornadaPoliciesQuery();

  return (
    <Stack gap="lg">
      <Title order={3}>Políticas de jornada</Title>

      {/* Timeline */}
      {policies.isLoading && <TableSkeleton rows={3} />}

      {policies.isError && (
        <Alert color="red" title="Error">
          No se pudo cargar el historial de políticas.
        </Alert>
      )}

      {!policies.isLoading && !policies.isError && policies.data && (
        <>
          {policies.data.length === 0 ? (
            <Text c="dimmed" size="sm">
              No hay políticas de jornada registradas.
            </Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Vigente desde</Table.Th>
                  <Table.Th>Horas diarias</Table.Th>
                  <Table.Th>Creado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {policies.data.map((policy) => (
                  <Table.Tr key={policy.id}>
                    <Table.Td>{policy.vigenteDesde}</Table.Td>
                    <Table.Td>{policy.horasDiarias}</Table.Td>
                    <Table.Td>{policy.createdAt}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}

      {/* Write-role-only create form */}
      {canWrite && <CreatePolicyForm />}
    </Stack>
  );
}
