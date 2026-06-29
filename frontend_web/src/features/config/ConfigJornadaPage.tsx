import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import React, { useMemo, useState } from 'react';
import type { JornadaPolicyDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, COMPENSACION_WRITE_ROLES } from '../../lib/auth/roles';
import { TableSkeleton } from '../../components/TableSkeleton';
import {
  useCreateJornadaPolicyMutation,
  useJornadaPoliciesQuery,
} from '../compensacion/compensacion-queries';
import { useOperarios, useZones } from '../operarios/operario-queries';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom',
};

function diasLabel(dias: number[]): string {
  return dias.map((d) => DAY_LABELS[d] ?? d).join(', ');
}

function scopeLabel(policy: JornadaPolicyDto, operarios: { id: string; fullName: string }[], zones: { id: string; name: string }[]): string {
  if (policy.operarioId) {
    const op = operarios.find((o) => o.id === policy.operarioId);
    return op?.fullName ?? policy.operarioId;
  }
  if (policy.zoneId) {
    const z = zones.find((z) => z.id === policy.zoneId);
    return z?.name ?? policy.zoneId;
  }
  return 'Global';
}

// ─── Create/Edit Policy Form ──────────────────────────────────────────────────

interface PolicyFormValues {
  operarioId: string | null;
  zoneId: string | null;
  horaInicio: string;
  horaFin: string;
  diasLaborales: number[];
  almuerzoInicio: string;
  almuerzoFin: string;
  toleranciaMin: number;
  horasDiarias: number | '';
  horasSemanales: number | '';
  vigenteDesde: string;
}

function PolicyModal({
  opened,
  onClose,
  editing,
}: {
  opened: boolean;
  onClose: () => void;
  editing?: JornadaPolicyDto | null;
}) {
  const createMutation = useCreateJornadaPolicyMutation();
  const operarios = useOperarios(true);
  const zones = useZones();

  const operarioOptions = useMemo(
    () => (operarios.data ?? []).map((o) => ({ value: o.id, label: o.fullName })),
    [operarios.data],
  );

  const zoneOptions = useMemo(
    () => (zones.data ?? []).map((z) => ({ value: z.id, label: z.name })),
    [zones.data],
  );

  const form = useForm<PolicyFormValues>({
    mode: 'uncontrolled',
    initialValues: {
      operarioId: editing?.operarioId ?? null,
      zoneId: editing?.zoneId ?? null,
      horaInicio: editing?.horaInicio ?? '06:00',
      horaFin: editing?.horaFin ?? '14:00',
      diasLaborales: editing?.diasLaborales ?? [1, 2, 3, 4, 5],
      almuerzoInicio: editing?.almuerzoInicio ?? '',
      almuerzoFin: editing?.almuerzoFin ?? '',
      toleranciaMin: editing?.toleranciaMin ?? 5,
      horasDiarias: editing?.horasDiarias ? Number(editing.horasDiarias) : '',
      horasSemanales: editing?.horasSemanales ? Number(editing.horasSemanales) : '',
      vigenteDesde: editing?.vigenteDesde?.slice(0, 10) ?? '',
    },
    validate: {
      horaInicio: (v) => (!v ? 'Requerido' : null),
      horaFin: (v) => (!v ? 'Requerido' : null),
      horasDiarias: (v) => (v === '' || Number(v) <= 0 ? 'Requerido' : null),
      horasSemanales: (v) => (v === '' || Number(v) <= 0 ? 'Requerido' : null),
      vigenteDesde: (v) => (!v ? 'Requerido' : null),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await createMutation.mutateAsync({
        operarioId: values.operarioId || null,
        zoneId: values.operarioId ? null : (values.zoneId || null),
        horaInicio: values.horaInicio,
        horaFin: values.horaFin,
        diasLaborales: values.diasLaborales,
        almuerzoInicio: values.almuerzoInicio || null,
        almuerzoFin: values.almuerzoFin || null,
        toleranciaMin: values.toleranciaMin,
        horasDiarias: Number(values.horasDiarias),
        horasSemanales: Number(values.horasSemanales),
        vigenteDesde: values.vigenteDesde,
      });
      notifications.show({ color: 'teal', message: 'Política creada correctamente.' });
      form.reset();
      onClose();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: err instanceof ApiError ? (err.status === 409 ? 'Conflicto' : 'Error') : 'Error',
        message: err instanceof ApiError ? err.message : 'Error inesperado.',
      });
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? 'Editar política' : 'Crear política'}
      size="lg"
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="sm">
          <Select
            label="Operario (opcional)"
            aria-label="Operario"
            placeholder="Global / por zona"
            data={operarioOptions}
            clearable
            searchable
            key={form.key('operarioId')}
            {...form.getInputProps('operarioId')}
          />

          <Select
            label="Zona (opcional)"
            aria-label="Zona"
            placeholder="Global"
            data={zoneOptions}
            clearable
            searchable
            disabled={!!form.getValues().operarioId}
            key={form.key('zoneId')}
            {...form.getInputProps('zoneId')}
          />

          <Group grow>
            <TextInput
              label="Hora inicio"
              aria-label="Hora inicio"
              placeholder="06:00"
              key={form.key('horaInicio')}
              {...form.getInputProps('horaInicio')}
            />
            <TextInput
              label="Hora fin"
              aria-label="Hora fin"
              placeholder="14:00"
              key={form.key('horaFin')}
              {...form.getInputProps('horaFin')}
            />
          </Group>

          <Group grow>
            <TextInput
              label="Almuerzo inicio"
              aria-label="Almuerzo inicio"
              placeholder="Auto"
              key={form.key('almuerzoInicio')}
              {...form.getInputProps('almuerzoInicio')}
            />
            <TextInput
              label="Almuerzo fin"
              aria-label="Almuerzo fin"
              placeholder="Auto"
              key={form.key('almuerzoFin')}
              {...form.getInputProps('almuerzoFin')}
            />
          </Group>

          <Checkbox.Group
            label="Días laborales"
            key={form.key('diasLaborales')}
            {...form.getInputProps('diasLaborales')}
          >
            <Group mt="xs">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <Checkbox key={d} value={d} label={DAY_LABELS[d]} />
              ))}
            </Group>
          </Checkbox.Group>

          <Group grow>
            <NumberInput
              label="Tolerancia (min)"
              aria-label="Tolerancia"
              min={0}
              max={60}
              key={form.key('toleranciaMin')}
              {...form.getInputProps('toleranciaMin')}
            />
            <NumberInput
              label="Horas diarias"
              aria-label="Horas diarias"
              min={0.5}
              max={24}
              step={0.5}
              decimalScale={2}
              required
              key={form.key('horasDiarias')}
              {...form.getInputProps('horasDiarias')}
            />
          </Group>

          <Group grow>
            <NumberInput
              label="Horas semanales"
              aria-label="Horas semanales"
              min={1}
              max={72}
              step={1}
              decimalScale={2}
              required
              key={form.key('horasSemanales')}
              {...form.getInputProps('horasSemanales')}
            />
            <TextInput
              label="Vigente desde"
              aria-label="Vigente desde"
              placeholder="YYYY-MM-DD"
              required
              key={form.key('vigenteDesde')}
              {...form.getInputProps('vigenteDesde')}
            />
          </Group>

          <Button type="submit" loading={createMutation.isPending}>
            {editing ? 'Guardar cambios' : 'Crear política'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

// ─── ConfigJornadaPage ────────────────────────────────────────────────────────

export function ConfigJornadaPage() {
  useDocumentTitle('FuturaGest · Configuración de Jornada');

  const { user } = useAuth();
  const canWrite = hasAnyRole(user?.role, COMPENSACION_WRITE_ROLES);

  const policies = useJornadaPoliciesQuery();
  const operarios = useOperarios(true);
  const zones = useZones();

  const [search, setSearch] = useState('');
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const operarioMap = useMemo(() => operarios.data ?? [], [operarios.data]);
  const zoneMap = useMemo(() => zones.data ?? [], [zones.data]);

  const filtered = useMemo(() => {
    if (!policies.data) return [];
    if (!search) return policies.data;
    const q = search.toLowerCase();
    return policies.data.filter((p) => {
      const scope = scopeLabel(p, operarioMap, zoneMap).toLowerCase();
      return (
        scope.includes(q) ||
        p.horaInicio.includes(q) ||
        p.horaFin.includes(q) ||
        p.vigenteDesde.includes(q)
      );
    });
  }, [policies.data, search, operarioMap, zoneMap]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Configuración de Jornada</Title>
        {canWrite && (
          <Button onClick={openModal}>Nueva política</Button>
        )}
      </Group>

      {/* Search filter */}
      <TextInput
        placeholder="Buscar operario, zona, o fecha..."
        aria-label="Buscar políticas"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        w={320}
      />

      {/* Table */}
      {policies.isLoading && <TableSkeleton rows={4} />}

      {policies.isError && (
        <Alert color="red" title="Error">
          No se pudo cargar el historial de políticas.
        </Alert>
      )}

      {!policies.isLoading && !policies.isError && policies.data && (
        <>
          {filtered.length === 0 ? (
            <Text c="dimmed" size="sm">
              No hay políticas de jornada registradas.
            </Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ámbito</Table.Th>
                  <Table.Th>Horario</Table.Th>
                  <Table.Th>Almuerzo</Table.Th>
                  <Table.Th>Días</Table.Th>
                  <Table.Th>Horas/día</Table.Th>
                  <Table.Th>Horas/sem</Table.Th>
                  <Table.Th>Tol.</Table.Th>
                  <Table.Th>Vigente desde</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((policy) => (
                  <Table.Tr key={policy.id}>
                    <Table.Td>
                      <Badge variant="light">
                        {scopeLabel(policy, operarioMap, zoneMap)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {policy.horaInicio} – {policy.horaFin}
                    </Table.Td>
                    <Table.Td>
                      {policy.almuerzoInicio ? `${policy.almuerzoInicio}–${policy.almuerzoFin}` : 'Auto'}
                    </Table.Td>
                    <Table.Td>{diasLabel(policy.diasLaborales)}</Table.Td>
                    <Table.Td>{policy.horasDiarias}</Table.Td>
                    <Table.Td>{policy.horasSemanales}</Table.Td>
                    <Table.Td>{policy.toleranciaMin} min</Table.Td>
                    <Table.Td>{policy.vigenteDesde?.slice(0, 10)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}

      {/* Create Modal */}
      {canWrite && (
        <PolicyModal opened={modalOpened} onClose={closeModal} />
      )}
    </Stack>
  );
}
