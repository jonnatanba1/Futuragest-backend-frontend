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
  Group,
  Progress,
  RingProgress,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import {
  IconAlarm,
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconClockHour4,
  IconUserOff,
} from '@tabler/icons-react';
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { VerificationBadge } from '../../components/VerificationBadge';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { useAttendances } from '../asistencia/attendance-queries';
import { useJornadaPoliciesQuery } from '../compensacion/compensacion-queries';
import { useNovedades } from '../novedades/novedad-queries';
import { useOperarios, useZones } from '../operarios/operario-queries';
import './dashboard.css';
import {
  type CargoBucket,
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
    <Group gap={4} mt={4} wrap="nowrap" justify="flex-end">
      {Icon && (
        <Box component="span" c={color} lh={0}><Icon size={14} /></Box>
      )}
      <Text size="xs" c={color} fw={500}>{pct > 0 ? `+${pct}` : pct}% vs período anterior</Text>
    </Group>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function formatHeaderDate(now: Date): string {
  const label = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function DashboardHeader({
  period,
  onPeriodChange,
  now,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  now: Date;
}) {
  const { user } = useAuth();
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
      <div>
        <Title order={2}>Tablero</Title>
        <Text c="dimmed" size="sm">{formatHeaderDate(now)}</Text>
        <Text c="dimmed" size="sm">{user?.email} · {user?.role}</Text>
      </div>
      <SegmentedControl aria-label="Período del tablero" value={period}
        onChange={(v) => onPeriodChange(v as Period)}
        data={PERIOD_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        radius="md" />
    </Group>
  );
}

// ── Hero: today's attendance ring ─────────────────────────────────────────────

interface HeroProps {
  activeCount: number;
  inactiveCount: number;
  presentToday: number;
  absentToday: number;
  completedToday: number;
  openToday: number;
  policy: ReturnType<typeof activeJornadaPolicy>;
  operarios: { id: string; fullName: string }[];
  zones: { id: string; name: string }[];
  policiesLoading: boolean;
  isLoading: boolean;
  isError: boolean;
}

function HeroTodayCard({
  activeCount, inactiveCount, presentToday, absentToday: absent,
  completedToday, openToday, policy, operarios, zones,
  policiesLoading, isLoading, isError,
}: HeroProps) {
  if (isLoading) {
    return (
      <Card className="fg-bento-hero" padding="lg" radius="lg" withBorder>
        <Skeleton height={260} radius="md" />
      </Card>
    );
  }

  const pct = activeCount > 0 ? Math.round((presentToday / activeCount) * 100) : 0;
  const ringSections = activeCount > 0
    ? [
        { value: (completedToday / activeCount) * 100, color: 'var(--mantine-color-brand-2)' },
        { value: (openToday / activeCount) * 100, color: 'var(--mantine-color-yellow-4)' },
        { value: (absent / activeCount) * 100, color: 'rgb(255 255 255 / 0.25)' },
      ]
    : [];

  return (
    <Card className="fg-bento-hero fg-hero" padding="xl" radius="lg">
      <Stack gap="md" h="100%" justify="space-between">
        {isError ? (
          <Stack align="center" justify="center" h="100%" mih={220}>
            <Text className="fg-hero-dim" size="sm">Sin acceso para su rol</Text>
          </Stack>
        ) : (
          <Group gap="xl" align="center" wrap="wrap">
            <RingProgress
              size={160}
              thickness={14}
              roundCaps
              sections={ringSections}
              rootColor="rgb(255 255 255 / 0.18)"
              label={
                <Stack gap={0} align="center">
                  <Text c="white" fw={700} fz={28} lh={1} ta="center">{pct}%</Text>
                  <Text className="fg-hero-dim" size="xs" ta="center">ingresaron</Text>
                </Stack>
              }
            />
            <Stack gap={6} style={{ flex: 1, minWidth: 180 }}>
              <Text className="fg-hero-dim" size="xs" fw={600} tt="uppercase"
                style={{ letterSpacing: '0.6px' }}>
                Asistencia de hoy
              </Text>
              <Text c="white" fw={700} fz={26} lh={1.15}>
                {presentToday} de {activeCount} operarios ficharon
              </Text>
              <Group gap="lg" mt={4} wrap="wrap">
                <Group gap={6} wrap="nowrap">
                  <Box component="span" c="brand.2" lh={0}><IconCircleCheck size={16} /></Box>
                  <Text size="sm" className="fg-hero-dim">{completedToday} completadas hoy</Text>
                </Group>
                <Group gap={6} wrap="nowrap">
                  <Box component="span" c="yellow.3" lh={0}><IconClockHour4 size={16} /></Box>
                  <Text size="sm" className="fg-hero-dim">{openToday} abiertas hoy</Text>
                </Group>
              </Group>
            </Stack>
          </Group>
        )}

        <div>
          <hr className="fg-hero-divider" />
          <HeroJornada policy={policy} operarios={operarios} zones={zones}
            isLoading={policiesLoading} />
        </div>

        {!isError && (
          <div>
            <hr className="fg-hero-divider" />
            <Group gap="xl" wrap="wrap">
              <Stack gap={2}>
                <Text className="fg-hero-dim" size="xs" fw={600} tt="uppercase"
                  style={{ letterSpacing: '0.6px' }}>
                  Operarios activos
                </Text>
                <Group gap={8} align="baseline" wrap="nowrap">
                  <Text c="white" fw={700} fz={22} lh={1}>{activeCount}</Text>
                  <Text size="xs" className="fg-hero-dim">
                    {inactiveCount} inactivo{inactiveCount !== 1 ? 's' : ''}
                  </Text>
                </Group>
              </Stack>
              <Stack gap={2}>
                <Text className="fg-hero-dim" size="xs" fw={600} tt="uppercase"
                  style={{ letterSpacing: '0.6px' }}>
                  Ingresaron hoy
                </Text>
                <Group gap={8} align="baseline" wrap="nowrap">
                  <Text c="white" fw={700} fz={22} lh={1}>{presentToday}</Text>
                  <Text size="xs" className="fg-hero-dim">{pct}% del personal</Text>
                </Group>
              </Stack>
            </Group>
          </div>
        )}
      </Stack>
    </Card>
  );
}

function HeroJornada({
  policy, operarios, zones, isLoading,
}: {
  policy: ReturnType<typeof activeJornadaPolicy>;
  operarios: { id: string; fullName: string }[];
  zones: { id: string; name: string }[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton height={44} radius="md" />;
  }
  if (!policy) {
    return (
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon variant="white" color="white" size={34} radius="md">
          <IconClock size={18} />
        </ThemeIcon>
        <Stack gap={0}>
          <Text c="white" fw={600} size="sm">Sin jornada vigente</Text>
          <Text size="xs" className="fg-hero-dim">
            Configure una política de jornada en Configuración → Jornada.
          </Text>
        </Stack>
      </Group>
    );
  }

  const scope = policy.operarioId
    ? `Operario: ${operarios.find((o) => o.id === policy.operarioId)?.fullName ?? policy.operarioId}`
    : policy.zoneId
    ? `Zona: ${zones.find((z) => z.id === policy.zoneId)?.name ?? policy.zoneId}`
    : 'Global';

  const diasLabel = (policy.diasLaborales ?? []).map((d) => DAY_SHORT[d] ?? String(d)).join(', ') || '—';

  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="md">
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon variant="white" color="white" size={34} radius="md">
          <IconClock size={18} />
        </ThemeIcon>
        <Stack gap={2}>
          <Text className="fg-hero-dim" size="xs" fw={600} tt="uppercase"
            style={{ letterSpacing: '0.6px' }}>
            Jornada vigente
          </Text>
          <Group gap="sm" wrap="nowrap">
            <Text c="white" fw={700} size="md">{policy.horaInicio} – {policy.horaFin}</Text>
            <Badge variant="white" color="dark" size="sm">{scope}</Badge>
          </Group>
        </Stack>
      </Group>
      <Text size="xs" className="fg-hero-dim">
        {diasLabel} · {policy.horasDiarias} h/día · {policy.horasSemanales} h/sem · desde {policy.vigenteDesde?.slice(0, 10)}
      </Text>
    </Group>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
  className: string;
  label: string;
  value: string | number | null;
  secondary?: string;
  icon: React.ReactNode;
  iconColor: string;
  accentValue?: boolean;
  accentColor?: string;
  isLoading: boolean;
  isError: boolean;
  onClick?: () => void;
}

function KpiTile({
  className, label, value, secondary, icon, iconColor,
  accentValue, accentColor = 'red.6', isLoading, isError, onClick,
}: KpiTileProps) {
  const body = (
    <Group gap="md" align="flex-start" justify="space-between" wrap="nowrap">
      <Group gap="md" align="flex-start" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <ThemeIcon variant="light" color={iconColor} size={40} radius="md">
          {icon}
        </ThemeIcon>
        <Box className="fg-tile" style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase"
            style={{ letterSpacing: '0.4px' }}>
            {label}
          </Text>
          {isLoading ? (
            <Skeleton height={30} width={56} mt={4} />
          ) : isError ? (
            <>
              <Text fz={26} fw={700} c="dimmed" lh={1.2}>—</Text>
              <Text size="xs" c="dimmed">Sin acceso para su rol</Text>
            </>
          ) : (
            <>
              <Text fz={26} fw={700} lh={1.2}
                c={accentValue && Number(value) > 0 ? accentColor : undefined}>
                {value ?? '—'}
              </Text>
              {secondary && <Text size="xs" c="dimmed">{secondary}</Text>}
            </>
          )}
        </Box>
      </Group>
      {onClick && (
        <Box component="span" c="dimmed" lh={0} mt={4}>
          <IconChevronRight size={16} />
        </Box>
      )}
    </Group>
  );

  const card = (clickable: boolean) => (
    <Card className={clickable ? 'fg-tile-clickable' : undefined}
      padding="md" radius="lg" withBorder h="100%">
      {body}
    </Card>
  );

  return onClick ? (
    <UnstyledButton onClick={onClick} aria-label={label}
      className={className} style={{ display: 'block', height: '100%' }}>
      {card(true)}
    </UnstyledButton>
  ) : (
    <Box className={className} component="div" style={{ height: '100%' }}>
      {card(false)}
    </Box>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function SectionCard({
  className, title, action, children, minH,
}: {
  className: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  minH?: number;
}) {
  return (
    <Card className={className} padding="lg" radius="lg" withBorder h="100%">
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
        <Text fw={600}>{title}</Text>
        {action}
      </Group>
      <Box style={{ minHeight: minH }}>{children}</Box>
    </Card>
  );
}

// ── Operarios por cargo (hoy: ingresaron / faltaron) ─────────────────────────

function CargoByRolePanel({ cargoList }: { cargoList: CargoBucket[] }) {
  const totals = cargoList.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      ingresaron: acc.ingresaron + c.ingresaron,
      faltaron: acc.faltaron + c.faltaron,
    }),
    { total: 0, ingresaron: 0, faltaron: 0 },
  );
  const overallPct = totals.total > 0
    ? Math.round((totals.ingresaron / totals.total) * 100)
    : 0;

  return (
    <Stack gap="md">
      <div className="fg-cargo-summary" aria-label="Resumen de asistencia por cargo hoy">
        <div className="fg-cargo-summary-stat fg-cargo-summary-stat--in">
          <Group gap={6} wrap="nowrap">
            <ThemeIcon variant="light" color="teal" size={28} radius="md">
              <IconCircleCheck size={16} />
            </ThemeIcon>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.4px' }}>
              Ingresaron
            </Text>
          </Group>
          <Text
            className="fg-cargo-summary-value"
            c={totals.ingresaron > 0 ? 'teal.7' : 'dimmed'}
            fw={700}
            lh={1}
          >
            {totals.ingresaron}
          </Text>
          <Text size="xs" c="dimmed">{overallPct}% del personal</Text>
        </div>

        <div className="fg-cargo-summary-stat fg-cargo-summary-stat--out">
          <Group gap={6} wrap="nowrap">
            <ThemeIcon
              variant="light"
              color={totals.faltaron > 0 ? 'red' : 'gray'}
              size={28}
              radius="md"
            >
              <IconUserOff size={16} />
            </ThemeIcon>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.4px' }}>
              Faltaron
            </Text>
          </Group>
          <Text
            className="fg-cargo-summary-value"
            c={totals.faltaron > 0 ? 'red.7' : 'dimmed'}
            fw={700}
            lh={1}
          >
            {totals.faltaron}
          </Text>
          <Text size="xs" c="dimmed">sin fichaje hoy</Text>
        </div>

        <div className="fg-cargo-summary-bar" aria-hidden="true">
          <Progress.Root size={10} radius="xl">
            {totals.ingresaron > 0 && (
              <Progress.Section
                value={totals.total > 0 ? (totals.ingresaron / totals.total) * 100 : 0}
                color="teal.6"
              />
            )}
            {totals.faltaron > 0 && (
              <Progress.Section
                value={totals.total > 0 ? (totals.faltaron / totals.total) * 100 : 0}
                color="red.4"
              />
            )}
          </Progress.Root>
          <Group justify="space-between" mt={6}>
            <Text size="xs" c="dimmed">{totals.total} operarios activos</Text>
            <Text size="xs" c="dimmed">Asistencia del día</Text>
          </Group>
        </div>
      </div>

      <div className="fg-cargo-grid" role="list" aria-label="Desglose por cargo">
        {cargoList.map((bucket) => (
          <CargoRoleCard key={bucket.cargo} bucket={bucket} />
        ))}
      </div>
    </Stack>
  );
}

function CargoRoleCard({ bucket }: { bucket: CargoBucket }) {
  const { cargo, total, ingresaron, faltaron } = bucket;
  const ingrPct = total > 0 ? Math.round((ingresaron / total) * 100) : 0;
  const faltPct = total > 0 ? 100 - ingrPct : 0;
  const allPresent = faltaron === 0 && total > 0;
  const allAbsent = ingresaron === 0 && total > 0;

  return (
    <article
      className={`fg-cargo-card${allAbsent ? ' fg-cargo-card--alert' : ''}${allPresent ? ' fg-cargo-card--ok' : ''}`}
      role="listitem"
      aria-label={`${cargo}: ${ingresaron} ingresaron, ${faltaron} faltaron de ${total}`}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs" mb="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={700} size="sm" lineClamp={1} title={cargo}>{cargo}</Text>
          <Text size="xs" c="dimmed">{total} {total === 1 ? 'operario' : 'operarios'}</Text>
        </div>
        <Badge
          variant="light"
          color={allPresent ? 'teal' : allAbsent ? 'red' : 'gray'}
          size="sm"
          radius="xl"
        >
          {ingrPct}%
        </Badge>
      </Group>

      <div className="fg-cargo-stats">
        <div className="fg-cargo-stat fg-cargo-stat--in">
          <Text className="fg-cargo-stat-label">Ingresaron</Text>
          <Text className="fg-cargo-stat-value" c={ingresaron > 0 ? 'teal.7' : 'dimmed'}>
            {ingresaron}
          </Text>
        </div>
        <div className="fg-cargo-stat-divider" aria-hidden="true" />
        <div className="fg-cargo-stat fg-cargo-stat--out">
          <Text className="fg-cargo-stat-label">Faltaron</Text>
          <Text className="fg-cargo-stat-value" c={faltaron > 0 ? 'red.7' : 'dimmed'}>
            {faltaron}
          </Text>
        </div>
      </div>

      <Progress.Root size={8} radius="xl" mt="sm" className="fg-cargo-ratio">
        {ingresaron > 0 && (
          <Progress.Section value={ingrPct} color="teal.6" />
        )}
        {faltaron > 0 && (
          <Progress.Section value={faltPct} color="red.4" />
        )}
      </Progress.Root>
    </article>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatHora(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

/**
 * Human elapsed time since `iso` ("45m", "3h 20m", "2d").
 * Returns null for missing/future timestamps. Used to surface forgotten check-outs.
 */
function elapsedSince(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 > 0 ? `${hours}h ${mins % 60}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortId(id: string): string { return id.slice(-6).toUpperCase(); }

function donutFormatter(total: number) {
  return (value: number) => `${value} (${Math.round((value / total) * 100)}%)`;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  useDocumentTitle('FuturaGest · Tablero');
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
    const dayBuckets = groupByDay(periodAttendances, range);

    const activePolicyVal = activeJornadaPolicy(policies.data ?? [], now);
    const lateCount = lateArrivalsCount(allAttendances, activePolicyVal, todayRange.hasta);
    const absentCount = absentToday(activeOperarios, allAttendances, todayRange.hasta);
    const completedToday = todayAttendances.filter((a) => a.completedAt != null).length;

    return {
      activeCount,
      inactiveCount: allCount - activeCount,
      periodAttendanceCount: periodAttendances.length,
      todayAttendanceCount: todayAttendances.length,
      completedToday,
      openToday: todayAttendances.length - completedToday,
      presentToday: activeCount - absentCount,
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
    activeCount, inactiveCount, periodAttendanceCount,
    completedToday, openToday, presentToday,
    completedCount, attendanceDelta, openCount, pendingNovedades,
    absentCount, absentPct, averageShift, lateCount,
    chartData, sparklineData, zoneChartData, novAgg,
    openList, operarioMap, cargoList,
  } = metrics;

  const donutNovedadesData = [
    { name: 'Pendientes', value: novAgg.PENDING, color: 'yellow.6' },
    { name: 'Aprobadas', value: novAgg.APPROVED, color: 'teal.6' },
    { name: 'Rechazadas', value: novAgg.REJECTED, color: 'red.6' },
  ].filter((d) => d.value > 0);

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
      <DashboardHeader period={period} onPeriodChange={setPeriod} now={now} />

      <div className="fg-bento">
        {/* ── Hero: today's attendance ─────────────────────────────── */}
        <HeroTodayCard
          activeCount={operariosForbidden ? 0 : activeCount}
          inactiveCount={inactiveCount}
          presentToday={presentToday}
          absentToday={absentCount}
          completedToday={completedToday}
          openToday={openToday}
          policy={activePolicy}
          operarios={operariosActive.data ?? []}
          zones={zones.data ?? []}
          policiesLoading={policies.isLoading}
          isLoading={operariosActive.isLoading || attendances.isLoading}
          isError={operariosForbidden || attendancesForbidden}
        />

        {/* ── KPI tiles ────────────────────────────────────────────── */}
        <KpiTile
          className="fg-bento-t1"
          label="Sin fichaje hoy"
          value={attendancesForbidden || operariosForbidden ? null : absentCount}
          secondary={attendancesForbidden || operariosForbidden || activeCount === 0
            ? undefined : `${absentPct}% del personal activo`}
          icon={<IconUserOff size={20} />} iconColor="red"
          accentValue={absentCount > 0} accentColor="red.6"
          isLoading={attendances.isLoading || operariosActive.isLoading}
          isError={attendancesForbidden || operariosForbidden}
          onClick={() => navigate('/asistencia')}
        />
        <KpiTile
          className="fg-bento-t2"
          label="Llegadas tarde hoy"
          value={attendancesForbidden || !activePolicy ? null : lateCount}
          secondary={attendancesForbidden || !activePolicy
            ? undefined : `Sobre ${activePolicy.horaInicio}`}
          icon={<IconAlarm size={20} />} iconColor="grape"
          accentValue={lateCount > 0} accentColor="grape.6"
          isLoading={attendances.isLoading}
          isError={attendancesForbidden}
        />
        <KpiTile
          className="fg-bento-t3"
          label="Jornadas abiertas"
          value={attendancesForbidden ? null : openCount}
          secondary="Con ingreso, sin salida"
          icon={<IconClockHour4 size={20} />} iconColor="orange"
          accentValue={openCount > 0}
          isLoading={attendances.isLoading} isError={attendancesForbidden}
          onClick={() => navigate('/asistencia')}
        />
        <KpiTile
          className="fg-bento-t4"
          label="Novedades pendientes"
          value={novedadesForbidden ? null : pendingNovedades}
          secondary="Pendientes de aprobación"
          icon={<IconAlertTriangle size={20} />} iconColor="violet"
          accentValue={pendingNovedades > 0} accentColor="yellow.7"
          isLoading={novedades.isLoading} isError={novedadesForbidden}
          onClick={() => navigate('/novedades')}
        />

        {/* ── Novedades ────────────────────────────────────────────── */}
        <SectionCard className="fg-bento-nov" title="Novedades en el período"
          action={
            <Text component={Link} to="/novedades" size="xs" c="brand" fw={500}>
              Ver todas
            </Text>
          }>
          {novedades.isLoading ? <Skeleton height={180} radius="md" />
          : novedadesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
          : donutNovedadesData.length === 0 ? (
            <>
              <EmptyState title="Sin novedades en el período" />
              <Text size="sm" c="dimmed" ta="center">Horas extra aprobadas: 0 h</Text>
            </>
          ) : (
            <Group gap="xl" align="center" wrap="wrap" justify="space-evenly">
              <Stack gap="xs" align="center">
                <DonutChart h={185} data={donutNovedadesData} withLabelsLine={false}
                  withLabels={false} withTooltip tooltipDataSource="segment"
                  valueFormatter={donutFormatter(donutNovedadesTotal)} />
                <Badge variant="light" color="teal" size="sm" radius="sm">
                  {donutNovedadesTotal} novedades
                </Badge>
              </Stack>
              <Stack gap="sm" style={{ flex: 1, minWidth: 180 }}>
                {donutNovedadesData.map((d) => (
                  <Group key={d.name} justify="space-between" wrap="nowrap">
                    <Group gap={8} wrap="nowrap">
                      <Box w={12} h={12} bg={d.color} style={{ borderRadius: 4, flexShrink: 0 }} />
                      <Text size="sm" fw={500}>{d.name}</Text>
                    </Group>
                    <Text size="sm" fw={600}>{d.value}</Text>
                  </Group>
                ))}
                <Box className="fg-approved-hours">
                  <Text size="md" fw={700}>
                    {`Horas extra aprobadas: ${novAgg.approvedHours.toFixed(1)} h`}
                  </Text>
                </Box>
              </Stack>
            </Group>
          )}
        </SectionCard>

        {/* ── Attendance by day ────────────────────────────────────── */}
        <SectionCard className="fg-bento-day" title="Asistencias por día"
          action={
            <Group gap="xl" wrap="wrap">
              <Box className="fg-section-stat">
                <Text size="xs" c="dimmed" fw={600} tt="uppercase"
                  style={{ letterSpacing: '0.4px' }}>
                  Asistencias en el período
                </Text>
                {attendances.isLoading ? <Skeleton height={28} width={56} mt={4} ml="auto" />
                : attendancesForbidden ? (
                  <Text fz={22} fw={700} c="dimmed" lh={1.2}>—</Text>
                ) : (
                  <Group gap={8} justify="flex-end" align="center" wrap="nowrap">
                    <Text fz={22} fw={700} lh={1.2}>{periodAttendanceCount}</Text>
                    {sparklineData.length > 1 && (
                      <Sparkline w={90} h={30} data={sparklineData} color="brand.5"
                        fillOpacity={0.2} curveType="monotone" strokeWidth={1.5} />
                    )}
                  </Group>
                )}
                {!attendances.isLoading && !attendancesForbidden && (
                  <DeltaLine pct={attendanceDelta} />
                )}
              </Box>
              <Box className="fg-section-stat">
                <Text size="xs" c="dimmed" fw={600} tt="uppercase"
                  style={{ letterSpacing: '0.4px' }}>
                  Tasa de finalización
                </Text>
                {attendances.isLoading ? <Skeleton height={28} width={56} mt={4} ml="auto" />
                : attendancesForbidden ? (
                  <Text fz={22} fw={700} c="dimmed" lh={1.2}>—</Text>
                ) : (
                  <Text fz={22} fw={700} lh={1.2}>{completionPct}%</Text>
                )}
                {!attendances.isLoading && !attendancesForbidden && periodAttendanceCount > 0 && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {completedCount} de {periodAttendanceCount}
                  </Text>
                )}
              </Box>
            </Group>
          }>
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

        {/* ── Attendance by zone ───────────────────────────────────── */}
        <SectionCard className="fg-bento-zone" title="Asistencias por zona">
          {attendances.isLoading ? <Skeleton height={220} radius="md" />
          : attendancesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
          : zoneChartData.length === 0 ? <EmptyState title="Sin asistencias en el período" />
          : (
            <BarChart h={220} data={zoneChartData} dataKey="zone"
              series={[{ name: 'Asistencias', color: 'brand.5' }]}
              orientation="horizontal" withLegend={false} withBarValueLabel />
          )}
        </SectionCard>

        {/* ── Open attendances list ───────────────────────────────── */}
        <SectionCard className="fg-bento-open" title="Jornadas abiertas"
          action={
            <Text component={Link} to="/asistencia" size="xs" c="brand" fw={500}>
              Ver todas
            </Text>
          }>
          {attendances.isLoading ? <Skeleton height={200} radius="md" />
          : attendancesForbidden ? <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
          : openList.length === 0 ? <EmptyState title="Sin jornadas abiertas" icon="✅" />
          : (
            <Stack gap={0}>
              {openList.map((a) => (
                <Group key={a.id} className="fg-open-item" justify="space-between"
                  wrap="nowrap" gap="sm">
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Box
                      w={36} h={36}
                      bg="brand.1" c="brand.8"
                      style={{ borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 600, fontSize: 14 }}
                    >
                      {(operarioMap.get(a.operarioId) ?? shortId(a.operarioId)).charAt(0).toUpperCase()}
                    </Box>
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {operarioMap.get(a.operarioId) ?? shortId(a.operarioId)}
                      </Text>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="xs" c="dimmed">Ingreso {formatHora(a.checkInCapturedAt)}</Text>
                        <Text size="xs" c="dimmed">·</Text>
                        <Text size="xs" c="dimmed">{a.date}</Text>
                      </Group>
                    </Box>
                  </Group>
                  <VerificationBadge method={a.checkInVerification} />
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>

        {/* ── Operarios by cargo ───────────────────────────────────── */}
        <SectionCard
          className="fg-bento-cargo"
          title="Operarios por cargo"
          action={
            <Badge variant="light" color="brand" size="sm" radius="xl">
              Hoy · {activeCount} activos
            </Badge>
          }
        >
          {operariosActive.isLoading || attendances.isLoading ? (
            <Skeleton height={220} radius="md" />
          ) : operariosForbidden || attendancesForbidden ? (
            <Text size="sm" c="dimmed">Sin acceso para su rol</Text>
          ) : cargoList.length === 0 ? (
            <EmptyState title="Sin operarios registrados" />
          ) : (
            <CargoByRolePanel cargoList={cargoList} />
          )}
        </SectionCard>
      </div>
    </Stack>
  );
}
