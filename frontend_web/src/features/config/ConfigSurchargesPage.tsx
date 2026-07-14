import {
  Alert,
  Badge,
  Button,
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
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import type { SurchargeCategory } from '@futuragest/contracts';
import { useAuth } from '../../lib/auth/auth-context';
import { ApiError } from '../../lib/api/client';
import { TableSkeleton } from '../../components/TableSkeleton';
import { useCreateSurchargeRateMutation, useSurchargeRatesQuery } from './config-queries';

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<SurchargeCategory, string> = {
  RECARGO_NOCTURNO: 'Recargo nocturno',
  HORA_EXTRA_DIURNA: 'Hora extra diurna',
  HORA_EXTRA_NOCTURNA: 'Hora extra nocturna',
  RECARGO_DOMINICAL_FESTIVO: 'Dominical / festivo',
};

// ─── Dominical progression calculator ─────────────────────────────────────────

interface ProgressionStep {
  percentage: string;
  vigenteDesde: string;
  isNext: boolean;
}

function computeDominicalProgression(rates: { category: string; percentage: string; vigenteDesde: string }[]): ProgressionStep[] {
  const dominical = rates
    .filter((r) => r.category === 'RECARGO_DOMINICAL_FESTIVO')
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));

  if (dominical.length === 0) return [];

  const now = new Date();
  return dominical.map((r, i) => {
    const vigDate = new Date(r.vigenteDesde);
    const isNext = vigDate > now && (i === 0 || new Date(dominical[i - 1].vigenteDesde) <= now);
    return { percentage: r.percentage, vigenteDesde: r.vigenteDesde, isNext };
  });
}

// ─── ConfigSurchargesPage ─────────────────────────────────────────────────────

export function ConfigSurchargesPage() {
  useDocumentTitle('FuturaGest · Recargos');

  const { user } = useAuth();
  const isAdmin = user?.role === 'SYSTEM_ADMIN';

  const rates = useSurchargeRatesQuery();
  const createMutation = useCreateSurchargeRateMutation();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [srCategory, setSrCategory] = useState<string>('');
  const [srPercentage, setSrPercentage] = useState<string | number>('');
  const [srDate, setSrDate] = useState('');

  const dominicalProgression = React.useMemo(
    () => (rates.data ? computeDominicalProgression(rates.data) : []),
    [rates.data],
  );

  const nextChange = dominicalProgression.find((s) => s.isNext);

  const handleCreateRate = async () => {
    if (!srCategory || !srPercentage || !srDate) return;
    try {
      await createMutation.mutateAsync({
        category: srCategory as SurchargeCategory,
        percentage: Number(srPercentage),
        vigenteDesde: srDate,
      });
      notifications.show({ color: 'teal', message: 'Tasa de recargo agregada.' });
      setSrCategory('');
      setSrPercentage('');
      setSrDate('');
      closeCreate();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: err instanceof ApiError ? err.message : 'Error al agregar tasa.',
      });
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Tasas de Recargo</Title>
        {isAdmin && (
          <Button variant="outline" onClick={openCreate}>Agregar tasa</Button>
        )}
      </Group>

      {/* Dominical progression alert */}
      {nextChange && (
        <Alert color="yellow" title="Próximo cambio" variant="light">
          Próximo cambio:{' '}
          {new Date(nextChange.vigenteDesde).toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}{' '}
          — dominical/festivo sube a {nextChange.percentage}%
        </Alert>
      )}

      {!nextChange && dominicalProgression.length > 0 && (
        <Alert color="teal" variant="light">
          Progresión dominical completa: {dominicalProgression[dominicalProgression.length - 1].percentage}%
        </Alert>
      )}

      {/* Rates table */}
      {rates.isLoading && <TableSkeleton rows={4} />}

      {rates.isError && (
        <Alert color="red" title="Error">
          No se pudo cargar las tasas de recargo.
        </Alert>
      )}

      {!rates.isLoading && !rates.isError && rates.data && (
        <>
          {/* Dominical progression visual */}
          {dominicalProgression.length > 1 && (
            <Stack gap="xs" mb="md">
              <Text size="sm" fw={600}>Progresión dominical / festivo:</Text>
              <Group gap="xs">
                {dominicalProgression.map((step, i) => (
                  <React.Fragment key={step.vigenteDesde}>
                    <Badge
                      color={step.isNext ? 'yellow' : step.vigenteDesde <= new Date().toISOString() ? 'green' : 'gray'}
                      variant="light"
                    >
                      {step.percentage}%
                    </Badge>
                    {i < dominicalProgression.length - 1 && <Text size="xs">→</Text>}
                  </React.Fragment>
                ))}
              </Group>
            </Stack>
          )}

          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Categoría</Table.Th>
                <Table.Th>Porcentaje</Table.Th>
                <Table.Th>Vigente desde</Table.Th>
                <Table.Th>Referencia legal</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rates.data.map((rate) => (
                <Table.Tr key={rate.id}>
                  <Table.Td>{CATEGORY_LABELS[rate.category] ?? rate.category}</Table.Td>
                  <Table.Td>{rate.percentage}%</Table.Td>
                  <Table.Td>{rate.vigenteDesde?.slice(0, 10)}</Table.Td>
                  <Table.Td>{rate.legalRef ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      {/* Create surcharge rate modal */}
      <Modal opened={createOpened} onClose={closeCreate} title="Agregar tasa de recargo" centered>
        <Stack gap="md">
          <Select
            label="Categoría"
            data={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
            value={srCategory}
            onChange={(v) => setSrCategory(v ?? '')}
          />
          <NumberInput
            label="Porcentaje (%)"
            min={0}
            max={200}
            value={srPercentage}
            onChange={(v) => setSrPercentage(v)}
          />
          <TextInput
            label="Vigente desde (YYYY-MM-DD)"
            placeholder="2026-01-01"
            value={srDate}
            onChange={(e) => setSrDate(e.currentTarget.value)}
          />
          <Button
            onClick={handleCreateRate}
            loading={createMutation.isPending}
            disabled={!srCategory || srPercentage === '' || srPercentage === undefined || !srDate}
          >
            Agregar
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
