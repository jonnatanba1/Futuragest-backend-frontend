import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconPencil } from '@tabler/icons-react';
import React, { useMemo, useState } from 'react';
import type { JornadaPolicyDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, COMPENSACION_WRITE_ROLES } from '../../lib/auth/roles';
import { TableSkeleton } from '../../components/TableSkeleton';
import {
  useCreateJornadaPolicyMutation,
  useJornadaPoliciesQuery,
} from './compensacion-queries';
import { useOperarios, useZones } from '../operarios/operario-queries';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom',
};

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const GLOBAL_ZONE_OPTION = { value: '', label: 'Global (todas las zonas)' };

interface ZoneOption { id: string; name: string }
interface OperarioOption { id: string; fullName: string }

/** Build zone options array for the form Select, leading Global entry emits "".
 * Empty String "" is the frontend's signal for "global": the backend (T5) +
 * toJornadaPolicyQuery (T9) serialize zoneId="" as `zoneId=` → SQL IS NULL. */
export function buildZoneOptions(zones: ZoneOption[]): { value: string; label: string }[] {
  return [GLOBAL_ZONE_OPTION, ...zones.map((z) => ({ value: z.id, label: z.name }))];
}

/** Build operario options for the searchable Select. */
export function buildOperarioOptions(operarios: OperarioOption[]): { value: string; label: string }[] {
  return operarios.map((o) => ({ value: o.id, label: o.fullName }));
}

// ─── Form values ──────────────────────────────────────────────────────────────

interface PolicyFormValues {
  operarioId: string;
  zoneId: string;
  horaInicio: string;
  horaFin: string;
  diasLaborales: number[];
  almuerzoInicio: string;
  almuerzoFin: string;
  desayunoInicio: string;
  desayunoFin: string;
  toleranciaMin: number;
  horasDiarias: number | '';
  horasSemanales: number | '';
  vigenteDesde: string;
}

function emptyFormValues(): PolicyFormValues {
  return {
    operarioId: '',
    zoneId: '',
    horaInicio: '06:00',
    horaFin: '14:00',
    diasLaborales: [1, 2, 3, 4, 5],
    almuerzoInicio: '',
    almuerzoFin: '',
    desayunoInicio: '',
    desayunoFin: '',
    toleranciaMin: 5,
    horasDiarias: '',
    horasSemanales: 44,
    vigenteDesde: '',
  };
}

// ─── Validators (pure functions — unit-testable) ──────────────────────────────

export const policyValidators = {
  horaInicio: (v: string) => (!v ? 'Requerido' : null),
  horaFin: (v: string, values: PolicyFormValues) => {
    if (!v) return 'Requerido';
    if (values.horaInicio && v <= values.horaInicio)
      return 'La hora fin debe ser mayor a la hora inicio';
    return null;
  },
  diasLaborales: (v: number[]) =>
    !v || v.length === 0 ? 'Los días laborales son requeridos' : null,
  toleranciaMin: (v: number) =>
    v === undefined || v === null || Number.isNaN(v) || Number(v) < 0
      ? 'La tolerancia debe ser mayor o igual a 0'
      : null,
  horasDiarias: (v: number | '') => {
    if (v === '' || v === undefined || v === null) return 'Requerido';
    const n = Number(v);
    if (Number.isNaN(n)) return 'Requerido';
    if (n < 0.5 || n > 24) return 'Las horas diarias deben estar entre 0.5 y 24';
    return null;
  },
  horasSemanales: (v: number | '') =>
    v === '' || v === undefined || v === null || Number(v) <= 0
      ? 'Requerido'
      : null,
  vigenteDesde: (v: string) =>
    !v || v.trim() === '' ? 'Requerido' : null,
  almuerzoFin: (v: string, values: PolicyFormValues) => {
    if (!v && !values.almuerzoInicio) return null;
    if (v && values.almuerzoInicio && v <= values.almuerzoInicio)
      return 'El almuerzo fin debe ser mayor a inicio';
    return null;
  },
  desayunoFin: (v: string, values: PolicyFormValues) => {
    if (!v && !values.desayunoInicio) return null;
    if (v && values.desayunoInicio && v <= values.desayunoInicio)
      return 'El desayuno fin debe ser mayor a inicio';
    return null;
  },
};

// ─── Create/Edit Policy Form ──────────────────────────────────────────────────

interface CreatePolicyFormProps {
  /** When set, preloads all fields from this row (append-only Edit). */
  editingFrom?: JornadaPolicyDto | null;
  /** Callback so a ref can scrollIntoView + focus the date field. */
  formRef?: React.RefObject<HTMLFormElement | null>;
}

function CreatePolicyForm({ editingFrom, formRef }: CreatePolicyFormProps) {
  const createMutation = useCreateJornadaPolicyMutation();
  const operarios = useOperarios(true);
  const zones = useZones();

  const operarioOptions = useMemo(
    () => buildOperarioOptions((operarios.data ?? []) as OperarioOption[]),
    [operarios.data],
  );
  const zoneOptions = useMemo(
    () => buildZoneOptions((zones.data ?? []) as ZoneOption[]),
    [zones.data],
  );

  const form = useForm<PolicyFormValues>({
    mode: 'uncontrolled',
    validateInputOnBlur: true,
    validateInputOnChange: true,
    initialValues: rowToFormValues(editingFrom)
      ?? emptyFormValues(),
    validate: policyValidators,
  });

  // Whenever editingFrom changes, preload the form with the row's fields.
  React.useEffect(() => {
    if (editingFrom) {
      form.setValues(rowToFormValues(editingFrom));
      // Focus vigenteDesde (cleared — user must enter a new date).
      const dateEl = formRef?.current?.querySelector<HTMLInputElement>(
        'input[aria-label="Vigente desde"]',
      );
      dateEl?.focus();
      formRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFrom]);

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await createMutation.mutateAsync({
        operarioId: values.operarioId || '',
        zoneId: values.zoneId ?? '',
        horaInicio: values.horaInicio,
        horaFin: values.horaFin,
        diasLaborales: values.diasLaborales,
        almuerzoInicio: values.almuerzoInicio || null,
        almuerzoFin: values.almuerzoFin || null,
        desayunoInicio: values.desayunoInicio || null,
        desayunoFin: values.desayunoFin || null,
        toleranciaMin: values.toleranciaMin,
        horasDiarias: Number(values.horasDiarias),
        horasSemanales: Number(values.horasSemanales),
        vigenteDesde: values.vigenteDesde,
      });

      notifications.show({
        title: 'Política creada',
        message: `Nueva política vigente desde ${values.vigenteDesde} creada`,
        color: 'green',
      });

      form.reset();
    } catch (err) {
      notifications.show({
        color: 'red',
        title:
          err instanceof ApiError
            ? err.status === 409
              ? 'Conflicto de fechas'
              : 'Error'
            : 'Error',
        message:
          err instanceof ApiError
            ? err.message
            : 'No se pudo crear la política de jornada.',
      });
    }
  });

  return (
    <Card withBorder>
      <form ref={formRef} onSubmit={handleSubmit} noValidate id="jornada-policy-form">
        <Stack gap="sm">
          <Title order={5}>
            {editingFrom ? 'Editar política (crea una nueva registro)' : 'Nueva política'}
          </Title>

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

          <Group grow>
            <TextInput
              label="Desayuno inicio"
              aria-label="Desayuno inicio"
              placeholder="Auto"
              key={form.key('desayunoInicio')}
              {...form.getInputProps('desayunoInicio')}
            />
            <TextInput
              label="Desayuno fin"
              aria-label="Desayuno fin"
              placeholder="Auto"
              key={form.key('desayunoFin')}
              {...form.getInputProps('desayunoFin')}
            />
          </Group>

          <Checkbox.Group
            label="Días laborales"
            aria-label="Días laborales"
            key={form.key('diasLaborales')}
            {...form.getInputProps('diasLaborales')}
          >
            <Group mt="xs">
              {DAY_OPTIONS.map((d) => (
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

          <Button
            type="submit"
            loading={createMutation.isPending}
            disabled={!form.isValid()}
          >
            Agregar política
          </Button>
        </Stack>
      </form>
    </Card>
  );
}

// ─── Timeline zone filter ──────────────────────────────────────────────────────

interface TimelineZoneFilterProps {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  zoneOptions: { value: string; label: string }[];
}

/**
 * Presentational zone-filter Select above the timeline.
 * `undefined` = no filter (bare query); `""` = Global (IS NULL);
 * non-empty = a specific zone.
 */
export function TimelineZoneFilter({ value, onChange, zoneOptions }: TimelineZoneFilterProps) {
  return (
    <Select
      label="Filtrar por zona"
      aria-label="Filtrar por zona"
      placeholder="Todas las zonas"
      data={zoneOptions}
      clearable
      searchable
      value={value ?? null}
      onChange={(v) => onChange(v === null ? undefined : v)}
      w={280}
    />
  );
}

// ─── JornadaPolicyPanel ───────────────────────────────────────────────────────

/**
 * "Política de jornada" tab body.
 * - Timeline table visible to all OFFICE_ROLES (with optional zone filter).
 * - Create form visible only to COMPENSACION_WRITE_ROLES.
 * - "Editar" rows use append-only semantics: clicking preloads all fields
 *   except vigenteDesde (cleared — user picks a new effective date) and
 *   resubmits via POST (no PATCH; jornadaPolicyApi.update is dead code).
 */
export function JornadaPolicyPanel() {
  const { user } = useAuth();
  const canWrite = hasAnyRole(user?.role, COMPENSACION_WRITE_ROLES);

  const zones = useZones();
  const zoneOptions = useMemo(
    () => buildZoneOptions((zones.data ?? []) as ZoneOption[]),
    [zones.data],
  );

  const [zoneFilter, setZoneFilter] = useState<string | undefined>(undefined);
  // `undefined` → useJornadaPoliciesQuery() bare call (no filter).
  const policies = useJornadaPoliciesQuery(zoneFilter);

  // Append-only Edit: preload form with the clicked row (except vigenteDesde).
  const [editingFrom, setEditingFrom] = useState<JornadaPolicyDto | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  return (
    <Stack gap="lg">
      <Title order={3}>Políticas de jornada</Title>

      {/* Timeline zone filter (all roles) */}
      <TimelineZoneFilter
        value={zoneFilter}
        onChange={setZoneFilter}
        zoneOptions={zoneOptions}
      />

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
                  {canWrite && <Table.Th w={80}>Acciones</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {policies.data.map((policy) => (
                  <Table.Tr key={policy.id}>
                    <Table.Td>{policy.vigenteDesde}</Table.Td>
                    <Table.Td>{policy.horasDiarias}</Table.Td>
                    <Table.Td>{policy.createdAt}</Table.Td>
                    {canWrite && (
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          aria-label={`Editar ${policy.id}`}
                          onClick={() => setEditingFrom(policy)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}

      {/* Write-role-only create form */}
      {canWrite && (
        <CreatePolicyForm editingFrom={editingFrom} formRef={formRef} />
      )}
    </Stack>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a timeline row into form values for append-only Edit.
 * - All fields are copied verbatim from the row, EXCEPT vigenteDesde which is
 *   cleared (the user must paste a NEW effective date — old row stays).
 * - horasDiarias / horasSemanales string→number (Mantine NumberInput needs numbers).
 * - Empty optionals become '' (form's internal representation); the submit
 *   handler coerces '' back to null in the POST body.
 */
function rowToFormValues(row?: JornadaPolicyDto | null): PolicyFormValues | undefined {
  if (!row) return undefined;
  return {
    operarioId: row.operarioId ?? '',
    zoneId: row.zoneId ?? '',
    horaInicio: row.horaInicio,
    horaFin: row.horaFin,
    diasLaborales: [...row.diasLaborales],
    almuerzoInicio: row.almuerzoInicio ?? '',
    almuerzoFin: row.almuerzoFin ?? '',
    desayunoInicio: row.desayunoInicio ?? '',
    desayunoFin: row.desayunoFin ?? '',
    toleranciaMin: row.toleranciaMin,
    // Decimal strings from API (e.g. "8.00") → numbers for NumberInput.
    horasDiarias: row.horasDiarias ? Number(row.horasDiarias) : '',
    horasSemanales: row.horasSemanales ? Number(row.horasSemanales) : '',
    vigenteDesde: '', // ← cleared: user must enter a new date (new row, not edit).
  };
}