import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  TextInput,
  Title,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React, { useState, useMemo } from 'react';
import { reportesApi } from '../../lib/api/client';
import { useZones } from '../operarios/operario-queries';
import { usePslReportPreview } from './reportes-queries';
import { IconFileSpreadsheet, IconDownload, IconCalendar } from '@tabler/icons-react';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';

type PeriodMode = 'quincena' | 'custom';

function getRecentFortnights() {
  const options = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-based
  const day = now.getDate();

  let currentHalf = day <= 15 ? 1 : 2;

  for (let i = 0; i < 12; i++) {
    const monthName = new Date(year, month - 1, 1).toLocaleString('es-ES', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const label = `${capitalizedMonth} ${year} — ${currentHalf === 1 ? '1Q (1-15)' : '2Q (16-Fin)'}`;

    let desde = '';
    let hasta = '';
    const pad = (n: number) => String(n).padStart(2, '0');
    if (currentHalf === 1) {
      desde = `${year}-${pad(month)}-01`;
      hasta = `${year}-${pad(month)}-15`;
    } else {
      desde = `${year}-${pad(month)}-16`;
      const lastDay = new Date(year, month, 0).getDate();
      hasta = `${year}-${pad(month)}-${pad(lastDay)}`;
    }

    options.push({ value: `${desde}|${hasta}`, label });

    if (currentHalf === 2) {
      currentHalf = 1;
    } else {
      currentHalf = 2;
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
  }
  return options;
}

export function ReportesPage() {
  const fortnightOptions = useMemo(() => getRecentFortnights(), []);
  
  const [periodMode, setPeriodMode] = useState<PeriodMode>('quincena');
  const [selectedFortnight, setSelectedFortnight] = useState<string>(fortnightOptions[0].value);
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const { desde, hasta } = useMemo(() => {
    if (periodMode === 'quincena') {
      if (!selectedFortnight) return { desde: '', hasta: '' };
      const [d, h] = selectedFortnight.split('|');
      return { desde: d, hasta: h };
    }
    return { desde: customDesde, hasta: customHasta };
  }, [periodMode, selectedFortnight, customDesde, customHasta]);

  const isValid = useMemo(() => {
    if (!desde || !hasta) return false;
    return desde <= hasta;
  }, [desde, hasta]);

  const { data: zones } = useZones();
  const { data: previewRows, isLoading, isError, error } = usePslReportPreview(desde, hasta, zoneId);

  const zoneOptions = useMemo(() => {
    return (zones ?? []).map((z) => ({ value: z.id, label: z.name }));
  }, [zones]);

  const handleExport = async () => {
    if (!desde || !hasta || !isValid) return;
    try {
      setExporting(true);
      const blob = await reportesApi.downloadPsl(desde, hasta, zoneId || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-psl-${desde}-a-${hasta}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notifications.show({
        color: 'teal',
        message: 'Plano PSL exportado correctamente.',
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Error de exportación',
        message: err instanceof Error ? err.message : 'No se pudo descargar el plano PSL.',
      });
    } finally {
      setExporting(false);
    }
  };

  const getConceptBadge = (concepto: string) => {
    const conceptsMap: Record<string, { label: string; color: string }> = {
      '009': { label: 'Recargo Festivo Nocturno', color: 'indigo' },
      '010': { label: 'Recargo Nocturno', color: 'blue' },
      '014': { label: 'Recargo Dominical/Festivo', color: 'orange' },
      '015': { label: 'Hora Extra Diurna', color: 'teal' },
      '016': { label: 'Hora Extra Nocturna', color: 'purple' },
      '011': { label: 'Hora Extra Festiva Diurna', color: 'pink' },
      '012': { label: 'Hora Extra Festiva Nocturna', color: 'violet' },
    };

    const info = conceptsMap[concepto] || { label: concepto, color: 'gray' };
    return (
      <Badge color={info.color} variant="light" size="sm">
        {concepto} - {info.label}
      </Badge>
    );
  };

  const excelSerialToDate = (serial: number): string => {
    const base = Date.UTC(1899, 11, 30);
    const date = new Date(base + serial * 86400000);
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <Stack gap="lg">
      <Title order={2}>Reportes de Nómina</Title>

      <Card withBorder radius="md" p="md" bg="var(--mantine-color-body)">
        <Stack gap="md">
          <SegmentedControl
            value={periodMode}
            onChange={(v) => setPeriodMode(v as PeriodMode)}
            data={[
              { label: 'Quincena', value: 'quincena' },
              { label: 'Rango personalizado', value: 'custom' },
            ]}
          />

          <Grid align="flex-end">
            {periodMode === 'quincena' ? (
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Select
                  label="Período Quincenal"
                  placeholder="Seleccione la quincena"
                  data={fortnightOptions}
                  value={selectedFortnight}
                  onChange={(val) => val && setSelectedFortnight(val)}
                  allowDeselect={false}
                />
              </Grid.Col>
            ) : (
              <>
                <Grid.Col span={{ base: 6, md: 2 }}>
                  <TextInput
                    type="date"
                    label="Desde"
                    value={customDesde}
                    onChange={(e) => setCustomDesde(e.currentTarget.value)}
                    max={customHasta || today}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                  <TextInput
                    type="date"
                    label="Hasta"
                    value={customHasta}
                    onChange={(e) => setCustomHasta(e.currentTarget.value)}
                    min={customDesde || undefined}
                    max={today}
                  />
                </Grid.Col>
              </>
            )}
            <Grid.Col span={{ base: 12, md: periodMode === 'quincena' ? 4 : 5 }}>
              <Select
                label="Zona"
                placeholder="Todas las zonas"
                data={zoneOptions}
                value={zoneId}
                onChange={setZoneId}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Button
                fullWidth
                leftSection={<IconDownload size={18} />}
                onClick={handleExport}
                disabled={isLoading || isError || !previewRows || previewRows.length === 0 || !isValid}
                loading={exporting}
                color="teal"
              >
                Exportar Plano PSL
              </Button>
            </Grid.Col>
          </Grid>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Vista Previa del Plano PSL</Title>
          {previewRows && previewRows.length > 0 && (
            <Badge color="gray" variant="filled">
              {previewRows.length} {previewRows.length === 1 ? 'fila' : 'filas'}
            </Badge>
          )}
        </Group>

        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <Alert color="red" title="Error">
            No se pudo cargar la vista previa.{' '}
            {error instanceof Error ? error.message : 'Error desconocido'}
          </Alert>
        ) : !previewRows || previewRows.length === 0 ? (
          <EmptyState
            icon="📄"
            title="Sin registros para exportar"
            message="No hay asistencias completadas con desglose calculado en este periodo."
          />
        ) : (
          <Table.ScrollContainer minWidth={800}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cédula</Table.Th>
                  <Table.Th>Concepto PSL</Table.Th>
                  <Table.Th>Año</Table.Th>
                  <Table.Th>Periodo (Q)</Table.Th>
                  <Table.Th>Horas (H.MM)</Table.Th>
                  <Table.Th>Día Laborado</Table.Th>
                  <Table.Th>Hora Inicio</Table.Th>
                  <Table.Th>Hora Fin</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {previewRows.map((row, idx) => (
                  <Table.Tr key={`${row.cedula}-${row.diaLaborado}-${row.concepto}-${idx}`}>
                    <Table.Td style={{ fontWeight: 500 }}>{row.cedula}</Table.Td>
                    <Table.Td>{getConceptBadge(row.concepto)}</Table.Td>
                    <Table.Td>{row.anio}</Table.Td>
                    <Table.Td>{row.periodo}</Table.Td>
                    <Table.Td style={{ fontFamily: 'monospace' }}>{row.horasOrdinaria}</Table.Td>
                    <Table.Td>{excelSerialToDate(row.diaLaborado)}</Table.Td>
                    <Table.Td style={{ fontFamily: 'monospace' }}>{row.horaInicio}</Table.Td>
                    <Table.Td style={{ fontFamily: 'monospace' }}>{row.horaFinal}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
