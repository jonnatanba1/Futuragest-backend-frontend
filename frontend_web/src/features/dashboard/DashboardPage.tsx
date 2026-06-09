import {
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { useAttendances } from '../asistencia/attendance-queries';
import { useNovedades } from '../novedades/novedad-queries';
import { useOperarios } from '../operarios/operario-queries';

interface MetricProps {
  label: string;
  value: number | null;
  isLoading: boolean;
  isError: boolean;
  hint?: string;
  onClick?: () => void;
}

function MetricCard({ label, value, isLoading, isError, hint, onClick }: MetricProps) {
  const body = (
    <Card withBorder padding="lg" radius="md" h="100%">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      {isLoading ? (
        <Skeleton height={36} width={64} mt="sm" />
      ) : isError ? (
        <Text size="xl" fw={700} c="dimmed" mt={4}>
          —
        </Text>
      ) : (
        <Text size="2rem" fw={700} mt={4}>
          {value}
        </Text>
      )}
      {hint && !isError && (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      )}
      {isError && (
        <Text size="xs" c="dimmed" mt={4}>
          Sin acceso para su rol
        </Text>
      )}
    </Card>
  );

  return onClick ? (
    <UnstyledButton onClick={onClick} aria-label={label} style={{ display: 'block', height: '100%' }}>
      {body}
    </UnstyledButton>
  ) : (
    body
  );
}

/** Local YYYY-MM-DD for "today" (matches the attendance.date convention). */
function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function DashboardPage() {
  useDocumentTitle('FuturaGest · Tablero');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO);

  const operarios = useOperarios(false); // active only (backend excludes inactive by default)
  const attendances = useAttendances();
  const novedades = useNovedades();

  const isApiError = (e: unknown) => e instanceof ApiError;

  const openAttendances = (attendances.data ?? []).filter((a) => a.completedAt == null).length;
  const pendingNovedades = (novedades.data ?? []).filter((n) => n.status === 'PENDING').length;
  const attendanceOnDate = (attendances.data ?? []).filter((a) => a.date === date).length;

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Tablero</Title>
          <Text c="dimmed" size="sm">
            {user?.email} · {user?.role}
          </Text>
        </div>
        <TextInput
          type="date"
          label="Fecha"
          aria-label="Fecha del tablero"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <MetricCard
          label="Operarios activos"
          value={operarios.data?.length ?? null}
          isLoading={operarios.isLoading}
          isError={operarios.isError && isApiError(operarios.error)}
          hint="Trabajadores activos"
        />
        <MetricCard
          label="Asistencia por fecha"
          value={attendanceOnDate}
          isLoading={attendances.isLoading}
          isError={attendances.isError && isApiError(attendances.error)}
          hint={`Ingresos registrados el ${date}`}
        />
        <MetricCard
          label="Asistencia en curso"
          value={openAttendances}
          isLoading={attendances.isLoading}
          isError={attendances.isError && isApiError(attendances.error)}
          hint="Con ingreso, sin salida"
        />
        <MetricCard
          label="Novedades pendientes"
          value={pendingNovedades}
          isLoading={novedades.isLoading}
          isError={novedades.isError && isApiError(novedades.error)}
          hint="Pendientes de aprobación — clic para revisar"
          onClick={() => navigate('/novedades')}
        />
      </SimpleGrid>
    </Stack>
  );
}
