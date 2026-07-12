import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Loader,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import React, { useMemo, useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import { hasAnyRole, COMPENSACION_WRITE_ROLES } from '../../lib/auth/roles';
import { TableSkeleton } from '../../components/TableSkeleton';
import { useOperarios } from '../operarios/operario-queries';
import { CloseFortnightModal } from './CloseFortnightModal';
import { useBalanceQuery, useEnhancedBalanceQuery, usePayoutQuery } from './compensacion-queries';
import { DayBreakdown } from './DayBreakdown';
import { PayoutPanel } from './PayoutPanel';
import { quincenaToRange } from './quincena';
import type { Quincena } from './quincena';

// ─── Month picker helpers ─────────────────────────────────────────────────────

const MONTH_OPTIONS = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const YEAR_OPTIONS = (() => {
  const currentYear = new Date().getFullYear();
  return [currentYear - 1, currentYear, currentYear + 1].map((y) => ({
    value: String(y),
    label: String(y),
  }));
})();

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Text fw={700} size="lg">
        {value}
      </Text>
    </Paper>
  );
}

interface BalanceRowProps {
  operario: { id: string; fullName: string; documento: string };
  desde: string;
  hasta: string;
  periodKey: string;
  canWrite: boolean;
  canReadPayout: boolean;
  onSelect: () => void;
  onOpenCloseModal: (operarioId: string, saldoHoras: string) => void;
}

function BalanceRow({
  operario,
  desde,
  hasta,
  periodKey,
  canWrite,
  canReadPayout,
  onSelect,
  onOpenCloseModal,
}: BalanceRowProps) {
  const balance = useBalanceQuery(operario.id, desde, hasta);
  const payout = usePayoutQuery(operario.id, periodKey, canReadPayout);

  const getStatusBadge = () => {
    if (payout.isLoading) {
      return <Loader size="xs" type="dots" />;
    }
    if (payout.isError) {
      const err = payout.error;
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 404) {
        return <Badge color="blue" variant="light">Abierto</Badge>;
      }
      return <Badge color="gray" variant="light">—</Badge>;
    }
    if (payout.data) {
      if (payout.data.paidAt) {
        return <Badge color="teal" variant="light">Liquidado</Badge>;
      }
      return <Badge color="orange" variant="light">Cerrado</Badge>;
    }
    return <Badge color="gray" variant="light">—</Badge>;
  };

  const isClosed = !payout.isLoading && !payout.isError && !!payout.data;

  const renderCells = () => {
    if (balance.isLoading) {
      return (
        <>
          <Table.Td><Loader size="xs" type="dots" /></Table.Td>
          <Table.Td><Loader size="xs" type="dots" /></Table.Td>
          <Table.Td><Loader size="xs" type="dots" /></Table.Td>
          <Table.Td><Loader size="xs" type="dots" /></Table.Td>
        </>
      );
    }
    if (balance.isError) {
      const err = balance.error;
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 422) {
        return (
          <Table.Td colSpan={4}>
            <Text size="xs" c="yellow" fw={500}>Sin política de jornada</Text>
          </Table.Td>
        );
      }
      if (status === 404) {
        return (
          <>
            <Table.Td>0.00</Table.Td>
            <Table.Td>0.00</Table.Td>
            <Table.Td>0.00</Table.Td>
            <Table.Td fw={700}>0.00</Table.Td>
          </>
        );
      }
      return (
        <Table.Td colSpan={4}>
          <Text size="xs" c="red">Error</Text>
        </Table.Td>
      );
    }
    if (balance.data) {
      const { carryIn, creditosHoras, debitosHoras, saldoHoras } = balance.data;
      const isNegative = parseFloat(saldoHoras) < 0;
      const isPositive = parseFloat(saldoHoras) > 0;

      return (
        <>
          <Table.Td>{carryIn}</Table.Td>
          <Table.Td>{creditosHoras}</Table.Td>
          <Table.Td>{debitosHoras}</Table.Td>
          <Table.Td
            fw={700}
            c={isNegative ? 'red.6' : isPositive ? 'teal.6' : undefined}
          >
            {saldoHoras}
          </Table.Td>
        </>
      );
    }
    return (
      <>
        <Table.Td>—</Table.Td>
        <Table.Td>—</Table.Td>
        <Table.Td>—</Table.Td>
        <Table.Td>—</Table.Td>
      </>
    );
  };

  const hasData = !balance.isLoading && !balance.isError && !!balance.data;
  const saldoHoras = balance.data?.saldoHoras ?? '0.00';

  return (
    <Table.Tr>
      <Table.Td>
        <Stack gap={0}>
          <Text fw={500} size="sm">{operario.fullName}</Text>
          <Text size="xs" c="dimmed">C.C. {operario.documento}</Text>
        </Stack>
      </Table.Td>
      {renderCells()}
      <Table.Td>{getStatusBadge()}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="subtle" onClick={onSelect}>
            Ver detalle
          </Button>
          {canWrite && !isClosed && hasData && (
            <Button
              size="xs"
              color="red"
              variant="light"
              onClick={() => onOpenCloseModal(operario.id, saldoHoras)}
            >
              Cerrar
            </Button>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

// ─── BalancePanel ──────────────────────────────────────────────────────────────

/**
 * Balance filter bar + balance card + collapsible day breakdown.
 * State: operarioId / year / month / quincena — all local to this component.
 * Query: useBalanceQuery — disabled until all three selections are made.
 */
export function BalancePanel() {
  const { user } = useAuth();
  const canWrite = hasAnyRole(user?.role, COMPENSACION_WRITE_ROLES);

  const currentDate = new Date();
  const [operarioId, setOperarioId] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(currentDate.getFullYear()));
  const [month, setMonth] = useState<string>(String(currentDate.getMonth() + 1));
  const [quincena, setQuincena] = useState<Quincena>('Q1');

  // Search filter state for the master table
  const [search, setSearch] = useState('');

  // Close modal state for the rows
  const [modalOperarioId, setModalOperarioId] = useState<string | null>(null);
  const [modalSaldoHoras, setModalSaldoHoras] = useState<string>('0.00');
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  // Track whether the current period has been closed in this session
  const [periodClosed, setPeriodClosed] = useState(false);

  const operarios = useOperarios(true);

  const operarioOptions = useMemo(
    () => (operarios.data ?? []).map((o) => ({ value: o.id, label: o.fullName })),
    [operarios.data],
  );

  // Filter operarios based on search locally
  const filteredOperarios = useMemo(() => {
    const list = operarios.data ?? [];
    if (!search.trim()) return list;
    const query = search.toLowerCase();
    return list.filter(
      (o) =>
        o.fullName.toLowerCase().includes(query) ||
        o.documento.includes(query),
    );
  }, [operarios.data, search]);

  const handleOpenCloseModal = (id: string, saldo: string) => {
    setModalOperarioId(id);
    setModalSaldoHoras(saldo);
    openModal();
  };

  // Derive desde/hasta from selections (always computable even without an operario)
  const range = quincenaToRange(Number(year), Number(month), quincena);

  const balance = useBalanceQuery(operarioId, range.desde, range.hasta);
  const enhancedBalance = useEnhancedBalanceQuery(operarioId, range.desde, range.hasta);

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderContent() {
    if (operarioId || balance.data || balance.isLoading || balance.isError) {
      // CLASSIC DETAILED VIEW
      if (balance.isLoading) {
        return <TableSkeleton rows={4} />;
      }

      if (balance.isError) {
        const err = balance.error;
        const status = err instanceof ApiError ? err.status : 0;

        if (status === 422) {
          return (
            <Alert color="yellow" title="Sin política de jornada">
              No existe una política de jornada para este período. Configúrela en la
              pestaña{' '}
              <Text component="span" fw={600}>
                Política de jornada
              </Text>
              .
            </Alert>
          );
        }

        if (status === 404) {
          return (
            <Alert color="gray" title="Sin registros">
              No hay registros de compensación para el operario en este período.
            </Alert>
          );
        }

        return (
          <Alert color="red" title="Error">
            {err instanceof ApiError ? err.message : 'Error al cargar el balance.'}
          </Alert>
        );
      }

      if (!balance.data) {
        return null;
      }

      const { carryIn, creditosHoras, debitosHoras, saldoHoras, breakdown } = balance.data;

      return (
        <Stack gap="md">
          <Button size="xs" variant="default" onClick={() => setOperarioId(null)} w={120}>
            ← Volver a la lista
          </Button>

          <Card withBorder>
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Title order={4}>Balance de horas</Title>
                {canWrite && operarioId && (
                  <Button
                    size="sm"
                    color="red"
                    variant="light"
                    onClick={() => handleOpenCloseModal(operarioId, saldoHoras)}
                    data-testid="close-period-btn"
                  >
                    Cerrar período
                  </Button>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                Saldo de horas = Arrastre + Créditos − Débitos
              </Text>
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                <StatCard label="Arrastre" value={carryIn} />
                <StatCard label="Créditos" value={creditosHoras} />
                <StatCard label="Débitos" value={debitosHoras} />
                <StatCard label="Saldo de horas" value={saldoHoras} />
              </SimpleGrid>
            </Stack>
          </Card>

          {/* Enhanced category breakdown (PR 5) — shown when enhanced data is available */}
          {enhancedBalance.data?.categoryBreakdown && (
            <Card withBorder>
              <Stack gap="sm">
                <Title order={5}>Desglose por categoría</Title>
                {enhancedBalance.data.tasaDominicalAplicada && (
                  <Badge color="orange" variant="light">
                    Tasa dominical: {enhancedBalance.data.tasaDominicalAplicada}%
                  </Badge>
                )}
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Categoría</Table.Th>
                      <Table.Th>Horas</Table.Th>
                      <Table.Th>Valor recargo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {[
                      { label: 'Ordinarias diurnas', key: 'horasOrdinariasDiurnas' as const },
                      { label: 'Ordinarias nocturnas', key: 'horasOrdinariasNocturnas' as const },
                      { label: 'Extra diurnas', key: 'horasExtraDiurnas' as const },
                      { label: 'Extra nocturnas', key: 'horasExtraNocturnas' as const },
                      { label: 'Dominicales / festivas', key: 'horasDominicalesFestivas' as const },
                    ].map(({ label, key }) => (
                      <Table.Tr key={key}>
                        <Table.Td>{label}</Table.Td>
                        <Table.Td>{enhancedBalance.data!.categoryBreakdown![key]}</Table.Td>
                        <Table.Td>
                          {enhancedBalance.data?.valorRecargos?.items
                            .filter((item) => item.label === label)
                            .map((item) => `$${item.valor}`)
                            .join(', ') || '—'}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {enhancedBalance.data?.valorRecargos && (
                  <Text size="sm" fw={600} ta="right">
                    Total recargos: ${enhancedBalance.data.valorRecargos.total}
                  </Text>
                )}
              </Stack>
            </Card>
          )}

          {breakdown.length > 0 && <DayBreakdown breakdown={breakdown} />}

          {/* Inline payout panel — auto-shown when period is closed and user has write access */}
          <PayoutPanel
            operarioId={operarioId}
            periodKey={range.periodKey}
            closed={periodClosed}
            canWrite={canWrite}
          />
        </Stack>
      );
    }

    // MASTER TABLE VIEW FOR ALL EMPLOYEES
    if (operarios.isLoading) {
      return <TableSkeleton rows={5} />;
    }

    if (filteredOperarios.length === 0) {
      return (
        <Alert color="gray" title="Sin operarios">
          No se encontraron operarios en esta zona o que coincidan con la búsqueda.
        </Alert>
      );
    }

    const canReadPayout = hasAnyRole(user?.role, ['TALENTO_HUMANO', 'SYSTEM_ADMIN']);

    return (
      <Stack gap="md" data-testid="balance-tab-panel">
        <TextInput
          placeholder="Buscar por nombre o documento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          w={{ base: '100%', sm: 300 }}
        />

        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Operario</Table.Th>
              <Table.Th>Arrastre</Table.Th>
              <Table.Th>Créditos</Table.Th>
              <Table.Th>Débitos</Table.Th>
              <Table.Th>Saldo de horas</Table.Th>
              <Table.Th>Estado</Table.Th>
              <Table.Th>Acciones</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredOperarios.map((op) => (
              <BalanceRow
                key={op.id}
                operario={op}
                desde={range.desde}
                hasta={range.hasta}
                periodKey={range.periodKey}
                canWrite={canWrite}
                canReadPayout={canReadPayout}
                onSelect={() => setOperarioId(op.id)}
                onOpenCloseModal={handleOpenCloseModal}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    );
  }

  // ─── Filter bar + content ─────────────────────────────────────────────────

  return (
    <Stack gap="md">
      {/* Filter bar */}
      <Group gap="sm" wrap="wrap">
        <Select
          placeholder="Buscar operario"
          aria-label="Seleccionar operario"
          data={operarioOptions}
          value={operarioId}
          onChange={(v) => {
            setOperarioId(v);
            setPeriodClosed(false);
          }}
          searchable
          clearable
          w={240}
        />

        <Select
          aria-label="Seleccionar año"
          data={YEAR_OPTIONS}
          value={year}
          onChange={(v) => {
            setYear(v ?? year);
            setPeriodClosed(false);
          }}
          w={100}
          allowDeselect={false}
        />

        <Select
          aria-label="Seleccionar mes"
          data={MONTH_OPTIONS}
          value={month}
          onChange={(v) => {
            setMonth(v ?? month);
            setPeriodClosed(false);
          }}
          w={140}
          allowDeselect={false}
        />

        <SegmentedControl
          data={[
            { value: 'Q1', label: '1.ª quincena' },
            { value: 'Q2', label: '2.ª quincena' },
          ]}
          value={quincena}
          onChange={(v) => {
            setQuincena(v as Quincena);
            setPeriodClosed(false);
          }}
        />
      </Group>

      {/* Content area */}
      {renderContent()}

      {/* Close modal — only mounted when activeModalOperarioId is set */}
      {canWrite && modalOperarioId && (
        <CloseFortnightModal
          opened={modalOpened}
          onClose={() => {
            closeModal();
            setModalOperarioId(null);
          }}
          operarioId={modalOperarioId}
          desde={range.desde}
          hasta={range.hasta}
          periodKey={range.periodKey}
          saldoHoras={modalSaldoHoras}
          onSuccess={() => {
            setPeriodClosed(true);
          }}
        />
      )}
    </Stack>
  );
}
