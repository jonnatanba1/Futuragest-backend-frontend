import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import type { HolidayDto, HolidayType } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { useCreateHolidayMutation, useGenerateHolidaysMutation, useHolidaysQuery } from './config-queries';

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_MANTINE_COLOR: Record<HolidayType, string> = {
  FIXED: 'red',
  EMILIANI: 'blue',
  EASTER_BASED: 'green',
  MANUAL: 'orange',
};

const TYPE_LABEL: Record<HolidayType, string> = {
  FIXED: 'FIJOS',
  EMILIANI: 'EMILIANI',
  EASTER_BASED: 'PASCUA',
  MANUAL: 'MANUAL',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function yearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  return [currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => ({
    value: String(y),
    label: String(y),
  }));
}

/** Build a Monday-start calendar grid for a given year/month. */
function getMonthGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  let startDow = firstDay.getUTCDay(); // 0=Sun … 6=Sat
  startDow = startDow === 0 ? 6 : startDow - 1; // → Mon=0 … Sun=6

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface MonthCardProps {
  year: number;
  month: number;
  holidays: Map<string, HolidayDto>;
}

function MonthCard({ year, month, holidays }: MonthCardProps) {
  const cells = getMonthGrid(year, month);

  return (
    <Card padding="sm" withBorder>
      <Text fw={600} ta="center" mb="xs">
        {MONTH_NAMES[month - 1]}
      </Text>
      {/* Day-of-week headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
        }}
      >
        {DAY_LABELS.map((d) => (
          <Text key={d} size="xs" c="dimmed" ta="center" fw={500}>
            {d}
          </Text>
        ))}
        {/* Calendar cells */}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${month}-${idx}`} />;
          }
          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
          const holiday = holidays.get(dateStr);
          const color = holiday ? TYPE_MANTINE_COLOR[holiday.type] : undefined;

          const dayCell = (
            <Text
              size="xs"
              ta="center"
              style={{
                borderRadius: 4,
                padding: '2px 0',
                fontWeight: holiday ? 700 : 400,
                backgroundColor: color
                  ? `var(--mantine-color-${color}-light)`
                  : undefined,
                color: color
                  ? `var(--mantine-color-${color}-light-color)`
                  : undefined,
                cursor: holiday ? 'default' : undefined,
              }}
            >
              {day}
            </Text>
          );

          if (holiday) {
            return (
              <Tooltip key={dateStr} label={holiday.name} withArrow openDelay={300}>
                {dayCell}
              </Tooltip>
            );
          }
          return <div key={dateStr}>{dayCell}</div>;
        })}
      </div>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function ConfigHolidaysPage() {
  useDocumentTitle('FuturaGest · Festivos');

  const { user } = useAuth();
  const isAdmin = user?.role === 'SYSTEM_ADMIN';

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const holidays = useHolidaysQuery(year);
  const generateMutation = useGenerateHolidaysMutation();
  const createMutation = useCreateHolidayMutation();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');

  const handleGenerate = async () => {
    try {
      await generateMutation.mutateAsync(year);
      notifications.show({ color: 'teal', message: `Festivos ${year} generados correctamente.` });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: err instanceof ApiError ? err.message : 'Error al generar festivos.',
      });
    }
  };

  const handleCreateHoliday = async () => {
    if (!holidayDate || !holidayName) return;
    try {
      await createMutation.mutateAsync({ date: holidayDate, name: holidayName });
      notifications.show({ color: 'teal', message: 'Festivo agregado.' });
      setHolidayDate('');
      setHolidayName('');
      closeCreate();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: err instanceof ApiError ? err.message : 'Error al agregar festivo.',
      });
    }
  };

  // Build date → holiday lookup
  const holidayMap = React.useMemo(() => {
    const map = new Map<string, HolidayDto>();
    if (holidays.data) {
      for (const h of holidays.data) {
        map.set(h.date, h);
      }
    }
    return map;
  }, [holidays.data]);

  const hasHolidays = holidays.data && holidays.data.length > 0;

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Title order={2}>Festivos</Title>
        <Group>
          {isAdmin && <Button variant="outline" onClick={openCreate}>Agregar manual</Button>}
          <Button onClick={handleGenerate} loading={generateMutation.isPending}>
            Generar automáticamente
          </Button>
        </Group>
      </Group>

      {/* Year selector */}
      <Group gap="sm">
        <Select
          aria-label="Año"
          data={yearOptions()}
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          w={120}
          allowDeselect={false}
        />
      </Group>

      {/* Legend */}
      <Group gap="sm">
        {(Object.entries(TYPE_MANTINE_COLOR) as [HolidayType, string][]).map(([type, color]) => (
          <Badge key={type} color={color} variant="light">
            {TYPE_LABEL[type]}
          </Badge>
        ))}
      </Group>

      {/* Loading */}
      {holidays.isLoading && (
        <Text c="dimmed">Cargando festivos...</Text>
      )}

      {/* Error */}
      {holidays.isError && (
        <Alert color="red" title="Error">
          No se pudo cargar los festivos.
        </Alert>
      )}

      {/* Empty */}
      {!holidays.isLoading && !holidays.isError && !hasHolidays && (
        <Text c="dimmed">
          No hay festivos para {year}. Usá «Generar automáticamente» para crearlos.
        </Text>
      )}

      {/* Calendar grid */}
      {hasHolidays && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <MonthCard key={month} year={year} month={month} holidays={holidayMap} />
          ))}
        </SimpleGrid>
      )}

      {/* Create holiday modal */}
      <Modal opened={createOpened} onClose={closeCreate} title="Agregar festivo manual" centered>
        <Stack gap="md">
          <TextInput
            label="Fecha (YYYY-MM-DD)"
            placeholder="2026-12-25"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.currentTarget.value)}
          />
          <TextInput
            label="Nombre"
            placeholder="Navidad"
            value={holidayName}
            onChange={(e) => setHolidayName(e.currentTarget.value)}
          />
          <Button
            onClick={handleCreateHoliday}
            loading={createMutation.isPending}
            disabled={!holidayDate || !holidayName}
          >
            Agregar
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
