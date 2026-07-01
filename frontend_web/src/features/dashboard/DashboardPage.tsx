import {
  AreaChart,
  BarChart,
  DonutChart,
  Sparkline,
} from '@mantine/charts';
import {
  Badge,
  Box,
  Card,
  Grid,
  Group,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendarStats,
  IconClock,
  IconClockHour4,
  IconUserOff,
  IconUsers,
  IconUserPlus,
} from '@tabler/icons-react';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { VerificationBadge } from '../../components/VerificationBadge';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { useAttendances } from '../asistencia/attendance-queries';
import { useJornadaPoliciesQuery } from '../compensacion/compensacion-queries';
import { useNovedades } from '../novedades/novedad-queries';
import { useOperarios, useZones } from '../operarios/operario-queries';
import {
  type Period,
  absentToday,
  activeJornadaPolicy,
  averageShiftHours,
  cargoCounts,
  filterByRange,
  groupByDay,
  lateArrivalsCount,
  novedadAggregates,
  openAttendances,
  percentDelta,
  previousRange,
  rangeForPeriod,
  verificationCounts,
  zoneCounts,
} from './dashboard-metrics';

// ── Period selector ───────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: 'Hoy', value: 'today' },
  { label: 'Últimos 7 días', value: '7d' },
  { label: 'Últimos 30 días', value: '30d' },
];

const DAY_SHORT: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom',
};

// ── Delta line ────────────────────────────────────────────────────────────────

function DeltaLine({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <Text size="xs" c="dimmed" mt={4}>— sin datos previos</Text>
    );
  }
  const color = pct > 0 ? 'teal.6' : pct < 0 ? 'red.6' : 'dimmed';
  const Icon = pct > 0 ? IconArrowUpRight : pct < 0 ? IconArrowDownRight : null;
  return (
    <Group gap={4} mt={4} wrap="nowrap">
      {Icon && (
        <Box component="span" c={color} lh={0}><Icon size={14} /></Box>
      )}
      <Text size="xs" c={color} fw={500}>{pct > 0 ? `+${pct}` : pct}% vs período anterior</Text>
    </Group>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number | null;
  secondary?: string;
  icon: React.ReactNode;
  iconColor?: string;
  accentValue?: boolean;
  accentColor?: string;
  delta?: { pct: number | null };
  sparkline?: number[];
  isLoading: boolean;
  isError: boolean;
  onClick?: () => void;
}

function KpiCard({
  label, value, secondary, icon, iconColor = 'brand',
  accentValue, accentColor = 'brand.6', delta, sparkline,
  isLoading, isError, onClick,
}: KpiCardProps) {
  const inner = (
    <Card className="fg-kpi-card" padding="lg" radius="lg" withBorder h="100%">
      <Group align="flex-start" justify="space-between" mb="sm">
        <ThemeIcon variant="light" color={iconColor} size={42} radius="md">
          {icon}
        </ThemeIcon>
      </Group>
      <Text size="sm" c="dimmed" fw={500}>{label}</Text>
      {isLoading ? (
        <Skeleton height={36} width={72} mt={6} />
      ) : isError ? (
        <>
          <Text size="1.9rem" fw={700} c="dimmed" mt={2}>—</Text>
          <Text size="xs" c="dimmed" mt={4}>Sin acceso para su rol</Text>
        </>
      ) : (
        <>
          <Text size="1.9rem" fw={700} lh={1.15} mt={2}
            c={accentValue && Number(value) > 0 ? accentColor : undefined}>
            {value}
          </Text>
          {secondary && <Text size="xs" c="dimmed" mt={4}>{secondary}</Text>}
          {delta && <DeltaLine pct={delta.pct} />}
          {sparkline && sparkline.length > 1 && (
            <Sparkline h={30} data={sparkline} color="brand.5" fillOpacity={0.2}
              curveType="monotone" strokeWidth={1.5} mt="xs" />
          )}
        </>
      )}
    </Card>
  );
  return onClick ? (
    <UnstyledButton onClick={onClick} aria-label={label} style={{ display: 'block', height: '100%' }}>
      {inner}
    </UnstyledButton>
  ) : inner;
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function SectionCard({
  title, action, children, minH,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  minH?: number;
}) {
  return (
    <Card padding="lg" radius="lg" withBorder h="100%">
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Text fw={600}>{title}</Text>
        {action}
      </Group>
      <Box style={{ minHeight: minH }}>{children}</Box>
    </Card>
  );
}

// ── Jornada Vigente Panel ───────────────────────────────────────────────────

function JornadaVigentePanel({
  policy,
  operarios,
  zones,
  isLoading,
}: {
  policy: ReturnType<typeof activeJornadaPolicy>;
  operarios: { id: string; fullName: string }[];
  zones: { id: string; name: string }[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton height={100} radius="lg" />;
  }
  if (!policy) {
    return (
      <Card padding="lg" radius="lg" withBorder>
        <Group gap="sm">
          <ThemeIcon variant="light" color="orange" size={36} radius="md">
            <IconClock size={20} />
          </ThemeIcon>
          <Stack gap={0}>
            <Text fw={600}>Sin jornada vigente</Text>
            <Text size="sm" c="dimmed">Configure una política de jornada en Configuración → Jornada.</Text>
          </Stack>
        </Group>
      </Card>
    );
  }

  const scope = policy.operarioId
    ? `Operario: ${operarios.find((o) => o.id === policy.operarioId)?.fullName ?? policy.operarioId}`
    : policy.zoneId
    ? `Zona: ${zones.find((z) => z.id === policy.zoneId)?.name ?? policy.zoneId}`
    : 'Global';

  const diasLabel = (policy.diasLaborales ?? []).map((d) => DAY_SHORT[d] ?? String(d)).join(', ') || '—';

  return (
    <Card padding="lg" radius="lg" withBorder>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
        <Group gap="md" align="flex-start" wrap="wrap">
          <ThemeIcon variant="light" color="brand" size={44} radius="md">
            <IconClock size={24} />
          </ThemeIcon>
          <Stack gap={4}>
            <Group gap="sm">
              <Text fw={700} size="lg">{policy.horaInicio} – {policy.horaFin}</Text>
              <Badge variant="light" color="brand" size="sm">{scope}</Badge>
            </Group>
          </Stack>
        </Group>
        <Group gap="xl" align="flex-start" wrap="wrap">
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Días laborales</Text>
            <Text size="sm" fw={500}>{diasLabel}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Horas</Text>
            <Text size="sm" fw={500}>{policy.horasDiarias} h/día · {policy.horasSemanales} h/sem</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Vigente desde</Text>
            <Text size="sm" fw={500}>{policy.vigenteDesde?.slice(0, 10)}</Text>
          </Stack>
        </Group>
      </Group>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatHora(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function shortId(id: string): string { return id.slice(-6).toUpperCase(); }

function donutFormatter(total: number) {
  return (value: number) => `${value} (${Math.round((value / total) * 100)}%)`;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  useDocumentTitle('FuturaGest · Tablero');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('7d');
  const now = useMemo(() => new Date(), []);

  const operariosActive = useOperarios(false);
  const operariosAll = useOperarios(true);
  const attendances = useAttendances();
  const novedades = useNovedades();
  const zones = useZones();
  const policies = useJornadaPoliciesQuery();

  const isApiError = (e: unknown) => e instanceof ApiError;

  const metrics = useMemo(() => {
    const allAttendances = attendances.data ?? [];
    const allNovedades = novedades.data ?? [];
    const activeOperarios = operariosActive.data ?? [];

    const range = rangeForPeriod(period, now);
    const todayRange = rangeForPeriod('today', now);
    const prevRange = previousRange(range);

    const periodAttendances = filterByRange(allAttendances, range);
    const prevAttendances = filterByRange(allAttendances, prevRange);
    const todayAttendances = filterByRange(allAttendances, todayRange);

    const activeCount = activeOperarios.length;
    const allCount = operariosAll.data?.length ?? activeCount;
    const vCounts = verificationCounts(periodAttendances);
    const dayBuckets = groupByDay(periodAttendances, range);

    const activePolicyVal = activeJornadaPolicy(policies.data ?? [], now);
    const lateCount = lateArrivalsCount(allAttendances, activePolicyVal, todayRange.hasta);
    const absentCount = absentToday(activeOperarios, allAttendances, todayRange.hasta);

    return {
      activeCount,
      inactiveCount: allCount - activeCount,
      periodAttendanceCount: periodAttendances.length,
      todayAttendanceCount: todayAttendances.length,
      completedCount: periodAttendances.filter((a) => a.completedAt != null).length,
      attendanceDelta: percentDelta(periodAttendances.length, prevAttendances.length),
      openCount: allAttendances.filter((a) => a.completedAt == null).length,
      pendingNovedades: allNovedades.filter((n) => n.status === 'PENDING').length,
      absentCount,
      absentPct: activeCount > 0 ? Math.round((absentCount / activeCount) * 100) : 0,
      averageShift: averageShiftHours(periodAttendances),
      lateCount,
      chartData: dayBuckets.map((b) => ({ day: b.label, Completadas: b.completed, Abiertas: b.open })),
      sparklineData: dayBuckets.map((b) => b.completed + b.open),
      donutVerifData: [
        { name: 'Huella', value: vCounts.BIOMETRIC, color: 'teal.6' },
        { name: 'PIN', value: vCounts.DEVICE_CREDENTIAL, color: 'yellow.6' },
        { name: 'Sin verif.', value: vCounts.NONE, color: 'gray.5' },
        { name: 'Sin dato', value: vCounts.sin_dato, color: 'gray.3' },
      ].filter((d) => d.value > 0),
      zoneChartData: (() => {
        const zoneMap = new Map((zones.data ?? []).map((z) => [z.id, z.name]));
        return zoneCounts(periodAttendances).map((z) => ({
          zone: zoneMap.get(z.zoneId) ?? shortId(z.zoneId),
          Asistencias: z.count,
        }));
      })(),
      novAgg: novedadAggregates(allNovedades, range),
      openList: openAttendances(allAttendances, 8),
      operarioMap: new Map(activeOperarios.map((o) => [o.id, o.fullName])),
      cargoList: cargoCounts(activeOperarios, allAttendances, todayRange.hasta),
    };
  }, [attendances.data, novedades.data, operariosActive.data, operariosAll.data, zones.data, policies.data, period, now]);

  const activePolicy = useMemo(
    () => activeJornadaPolicy(policies.data ?? [], now),
    [policies.data, now],
  );

  const {
    activeCount, inactiveCount, periodAttendanceCount, todayAttendanceCount,
    completedCount, attendanceDelta, openCount, pendingNovedades,
    absentCount, absentPct, averageShift, lateCount,
    chartData, sparklineData, donutVerifData, zoneChartData, novAgg,
    openList, operarioMap, cargoList,
  } = metrics;

  const donutNovedadesData = [
    { name: 'Pendientes', value: novAgg.PENDING, color: 'yellow.6' },
    { name: 'Aprobadas', value: novAgg.APPROVED, color: 'teal.6' },
    { name: 'Rechazadas', value: novAgg.REJECTED, color: 'red.6' },
  ].filter((d) => d.value > 0);

  const donutVerifTotal = donutVerifData.reduce((s, d) => s + d.value, 0);
  const donutNovedadesTotal = donutNovedadesData.reduce((s, d) => s + d.value, 0);
  const completionPct = periodAttendanceCount > 0
    ? Math.round((completedCount / periodAttendanceCount) * 100)
    : 0;

  const overtimePressure =
    averageShift !== null && activePolicy !== null &&
    averageShift > parseFloat(activePolicy.horasDiarias) + 1;

  const attendancesForbidden = attendances.isError && isApiError(attendances.error);
  const operariosForbidden = operariosActive.isError && isApiError(operariosActive.error);
  const novedadesForbidden = novedades.isError && isApiError(novedades.error);

  return (
    <Stack gap="lg">
      {/* ── Header ────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Title order={2}>Tablero</Title>
          <Text c="dimmed" size="sm">{user?.email} · {user?.role}</Text>
        </div>
        <SegmentedControl aria-label="Período del tablero" value={period}
          onChange={(v) => setPeriod(v as Period)}
          data={PERIOD_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          radius="md" />
      </Group>

      {/* ── Jornada Vigente Panel ─────────────────────────── */}
      <JornadaVigentePanel
        policy={activePolicy}
        operarios={operariosActive.data ?? []}
        zones={zones.data ?? []}
        isLoading={policies.isLoading}
      />

      {/* ── KPI row ───────────────────────────────────────── */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 5 }}>
        <KpiCard
          label="Operarios activos" value={operariosForbidden ? null : activeCount}
          secondary={operariosAll.isLoading || (operariosAll.isError && isApiError(operariosAll.error))
            ? undefined : `${inactiveCount} inactivo${inactiveCount !== 1 ? 's' : ''}`}
          icon={<IconUsers size={22} />} iconColor="brand"
          isLoading={operariosActive.isLoading} isError={operariosForbidden}
        />
        <KpiCard
          label="Asistencias en el período" value={attendancesForbidden ? null : periodAttendanceCount}
          secondary={attendancesForbidden ? undefined : `${todayAttendanceCount} hoy · ${completionPct}% completadas`}
          delta={attendancesForbidden ? undefined : { pct: attendanceDelta }}
          sparkline={attendancesForbidden ? undefined : sparklineData}
          icon={<IconCalendarStats size={22} />} iconColor="teal"
          isLoading={attendances.isLoading} isError={attendancesForbidden}
        />
        <KpiCard
          label="Sin fichaje hoy" value={attendancesForbidden || operariosForbidden ? null : absentCount}
          secondary={attendancesForbidden || operariosForbidden || activeCount === 0
            ? undefined : `${absentPct}% del personal activo`}
          icon={<IconUserOff size={22} />} iconColor="red"
          accentValue={absentCount > 0} accentColor="red.6"
          isLoading={attendances.isLoading || operariosActive.isLoading}
          isError={attendancesForbidden || operariosForbidden}
        />
        <KpiCard
          label="Llegadas tarde hoy"
          value={attendancesForbidden || !activePolicy ? null : lateCount}
          secondary={attendancesForbidden || !activePolicy
            ? undefined : `Sobre ${activePolicy.horaInicio}`}
          icon={<IconUserPlus size={22} />} iconColor="grape"
          accentValue={lateCount > 0} accentColor="grape.6"
          isLoading={attendances.isLoading}
          isError={attendancesForbidden}
        />
        <KpiCard
          label="Novedades pendientes" value={novedadesForbidden ? null : pendingNovedades}
          secondary="Pendientes de aprobación"
          icon={<IconAlertTriangle size={22} />} iconColor="violet"
          accentValue={pendingNovedades > 0} accentColor="yellow.7"
          isLoading={novedades.isLoading} isError={novedadesForbidden}
          onClick={() => navigate('/novedades')}
        />
      </SimpleGrid>

      {/* ── Charts row 1 ──────────────────────────────────── */}
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, sm: 12, md: 7 }}>
          <SectionCard title="Asistencias por día" minH={240}>
            {attendances.isLoading ? <Skeleton height={240} radius="md" />
            : attendancesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
            : periodAttendanceCount === 0 ? <EmptyState title="Sin asistencias en el período" />
            : (
              <>
                <AreaChart h={240} data={chartData} dataKey="day"
                  series={[
                    { name: 'Completadas', color: 'brand.6' },
                    { name: 'Abiertas', color: 'yellow.5' },
                  ]}
                  curveType="monotone" withLegend withDots={false} fillOpacity={0.15} />
                <Group gap="md" mt="sm" wrap="wrap">
                  {averageShift !== null && (
                    <Text size="sm" fw={500} c={overtimePressure ? 'yellow.7' : 'dimmed'}>
                      Jornada promedio: {averageShift.toFixed(1)} h
                    </Text>
                  )}
                  {activePolicy && (
                    <Text size="sm" c="dimmed">Política vigente: {activePolicy.horasDiarias} h</Text>
                  )}
                </Group>
              </>
            )}
          </SectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 5 }}>
          <SectionCard title="Verificación de ingresos" minH={240}>
            {attendances.isLoading ? <Skeleton height={240} radius="md" />
            : attendancesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
            : donutVerifData.length === 0 ? <EmptyState title="Sin asistencias en el período" />
            : (
              <Stack align="center" gap="xs">
                <DonutChart h={200} data={donutVerifData} withLabelsLine={false}
                  withLabels={false} withTooltip tooltipDataSource="segment"
                  valueFormatter={donutFormatter(donutVerifTotal)} mx="auto" />
                <Group gap="sm" justify="center" wrap="wrap">
                  {donutVerifData.map((d) => (
                    <Badge key={d.name} variant="light" color={d.color.split('.')[0]} size="sm">
                      {d.name}: {d.value}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            )}
          </SectionCard>
        </Grid.Col>
      </Grid>

      {/* ── Charts row 2 ──────────────────────────────────── */}
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <SectionCard title="Asistencias por zona" minH={220}>
            {attendances.isLoading ? <Skeleton height={220} radius="md" />
            : attendancesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
            : zoneChartData.length === 0 ? <EmptyState title="Sin asistencias en el período" />
            : (
              <BarChart h={220} data={zoneChartData} dataKey="zone"
                series={[{ name: 'Asistencias', color: 'brand.5' }]}
                orientation="horizontal" withLegend={false} withBarValueLabel />
            )}
          </SectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6 }}>
          <SectionCard title="Novedades en el período" minH={220}>
            {novedades.isLoading ? <Skeleton height={220} radius="md" />
            : novedadesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
            : donutNovedadesData.length === 0 ? (
              <>
                <EmptyState title="Sin novedades en el período" />
                <Text size="sm" c="dimmed" ta="center">Horas extra aprobadas: 0 h</Text>
              </>
            ) : (
              <Stack gap="sm">
                <DonutChart h={160} data={donutNovedadesData} withLabelsLine={false}
                  withLabels={false} withTooltip tooltipDataSource="segment"
                  valueFormatter={donutFormatter(donutNovedadesTotal)} mx="auto" />
                <Group gap="sm" justify="center" wrap="wrap">
                  {donutNovedadesData.map((d) => (
                    <Badge key={d.name} variant="light" color={d.color.split('.')[0]} size="sm">
                      {d.name}: {d.value}
                    </Badge>
                  ))}
                </Group>
                <Text size="sm" c="dimmed" ta="center">
                  {`Horas extra aprobadas: ${novAgg.approvedHours.toFixed(1)} h`}
                </Text>
              </Stack>
            )}
          </SectionCard>
        </Grid.Col>
      </Grid>

      {/* ── KPI row 2 (secondary) ────────────────────────── */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <KpiCard
          label="Jornadas abiertas" value={attendancesForbidden ? null : openCount}
          secondary="Con ingreso, sin salida"
          icon={<IconClockHour4 size={22} />} iconColor="orange"
          accentValue={openCount > 0}
          isLoading={attendances.isLoading} isError={attendancesForbidden}
        />
        <KpiCard
          label="Tasa de finalización" value={attendancesForbidden ? null : `${completionPct}%`}
          secondary={attendancesForbidden || periodAttendanceCount === 0 ? undefined : `${completedCount} de ${periodAttendanceCount}`}
          icon={<IconCalendarStats size={22} />} iconColor="lime"
          isLoading={attendances.isLoading} isError={attendancesForbidden}
        />
      </SimpleGrid>

      {/* ── Bottom row ────────────────────────────────────── */}
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <SectionCard title="Jornadas abiertas">
            {attendances.isLoading ? <Skeleton height={200} radius="md" />
            : attendancesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
            : openList.length === 0 ? <EmptyState title="Sin jornadas abiertas" icon="✅" />
            : (
              <Table.ScrollContainer minWidth={420}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Operario</Table.Th>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Ingreso</Table.Th>
                      <Table.Th>Verificación</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {openList.map((a) => (
                      <Table.Tr key={a.id}>
                        <Table.Td>{operarioMap.get(a.operarioId) ?? shortId(a.operarioId)}</Table.Td>
                        <Table.Td>{a.date}</Table.Td>
                        <Table.Td>{formatHora(a.checkInCapturedAt)}</Table.Td>
                        <Table.Td><VerificationBadge method={a.checkInVerification} /></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </SectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <SectionCard title="Operarios por cargo">
            {operariosActive.isLoading ? <Skeleton height={200} radius="md" />
            : operariosForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
            : cargoList.length === 0 ? <EmptyState title="Sin operarios registrados" />
            : (
              <Stack gap="sm">
                <Group gap="md" mb={2}>
                  <Group gap={6} wrap="nowrap">
                    <Box w={10} h={10} bg="teal.6" style={{ borderRadius: 999 }} />
                    <Text size="xs" c="dimmed">Ingresaron</Text>
                  </Group>
                  <Group gap={6} wrap="nowrap">
                    <Box w={10} h={10} bg="red.4" style={{ borderRadius: 999 }} />
                    <Text size="xs" c="dimmed">Faltaron (hoy)</Text>
                  </Group>
                </Group>
                {cargoList.map(({ cargo, total, ingresaron, faltaron }) => (
                  <Box key={cargo}>
                    <Group justify="space-between" mb={4} wrap="nowrap">
                      <Text size="sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cargo}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        <Text size="xs" c="dimmed">{total}</Text>
                        <Badge size="xs" color="teal" variant="light">{ingresaron} ing.</Badge>
                        <Badge size="xs" color="red" variant="light">{faltaron} falt.</Badge>
                      </Group>
                    </Group>
                    <Progress.Root size="sm" radius="xl">
                      {ingresaron > 0 && (
                        <Progress.Section value={(ingresaron / total) * 100} color="teal.6" />
                      )}
                      {faltaron > 0 && (
                        <Progress.Section value={(faltaron / total) * 100} color="red.4" />
                      )}
                    </Progress.Root>
                  </Box>
                ))}
              </Stack>
            )}
          </SectionCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}