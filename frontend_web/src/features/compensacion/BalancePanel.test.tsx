import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayBreakdownDto, PeriodBalanceDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { BalancePanel } from './BalancePanel';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useBalanceQueryMock } = vi.hoisted(() => ({ useBalanceQueryMock: vi.fn() }));
vi.mock('./compensacion-queries', () => ({
  useBalanceQuery: useBalanceQueryMock,
  useClosePeriodMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePayoutQuery: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

const { useOperariosMock } = vi.hoisted(() => ({ useOperariosMock: vi.fn() }));
vi.mock('../operarios/operario-queries', () => ({
  useOperarios: useOperariosMock,
}));

// Stub out notifications (used inside CloseFortnightModal)
vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OPERARIOS = [
  { id: 'op-1', fullName: 'Ana García', documento: '1', supervisorId: 's-1', deactivatedAt: null, createdAt: '', updatedAt: '' },
  { id: 'op-2', fullName: 'Carlos Ruiz', documento: '2', supervisorId: 's-1', deactivatedAt: null, createdAt: '', updatedAt: '' },
];

const BREAKDOWN: DayBreakdownDto[] = [
  { date: '2026-05-01', horasReales: '8.00', jornadaHoras: '8.00', delta: '0.00' },
  { date: '2026-05-02', horasReales: '9.50', jornadaHoras: '8.00', delta: '1.50' },
  { date: '2026-05-03', horasReales: '7.00', jornadaHoras: '8.00', delta: '-1.00' },
];

const BALANCE: PeriodBalanceDto = {
  operarioId: 'op-1',
  desde: '2026-05-01',
  hasta: '2026-05-15',
  carryIn: '0.00',
  creditosHoras: '1.50',
  debitosHoras: '1.00',
  saldoHoras: '0.50',
  breakdown: BREAKDOWN,
};

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useOperariosMock.mockReturnValue({ data: OPERARIOS, isLoading: false });
  useBalanceQueryMock.mockReturnValue({ data: BALANCE, isLoading: false, isError: false, error: null });
}

function renderPanel() {
  return render(
    <MantineProvider>
      <BalancePanel />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BalancePanel', () => {
  // BAL-1: Balance renders decimal strings unchanged
  it('renders carryIn, créditos, débitos, saldo as verbatim strings', () => {
    defaultSetup();
    renderPanel();
    // getAllByText handles multiple elements with same value (e.g. in card + breakdown table)
    expect(screen.getAllByText('1.50').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0.50').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(1); // carryIn
  });

  // carryIn explicitly shown (decision #5)
  it('shows carryIn in the balance card', () => {
    defaultSetup();
    renderPanel();
    // Multiple "Arrastre" labels exist (one per StatCard heading + possible duplication)
    expect(screen.getAllByText(/arrastre/i).length).toBeGreaterThanOrEqual(1);
    // carryIn value present
    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(1);
  });

  // BAL-2: Breakdown hidden by default, visible after toggle
  it('hides breakdown rows by default', () => {
    defaultSetup();
    renderPanel();
    // Mantine Collapse keeps nodes in DOM but hides them visually;
    // assert not visible (not toBeInTheDocument is wrong for Collapse).
    const dateCell = screen.queryByText('2026-05-01');
    if (dateCell) {
      expect(dateCell).not.toBeVisible();
    }
    // Also confirm the expand toggle exists
    expect(screen.getByRole('button', { name: /desglose/i })).toBeInTheDocument();
  });

  it('shows breakdown rows after clicking the expand toggle', async () => {
    const user = userEvent.setup();
    defaultSetup();
    renderPanel();
    const toggle = screen.getByRole('button', { name: /desglose/i });
    await user.click(toggle);
    await waitFor(() => expect(screen.getByText('2026-05-01')).toBeInTheDocument());
    expect(screen.getByText('2026-05-02')).toBeInTheDocument();
    expect(screen.getByText('2026-05-03')).toBeInTheDocument();
  });

  // BAL-5: Loading shows skeleton
  it('shows a loading skeleton while the balance query is loading', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useOperariosMock.mockReturnValue({ data: OPERARIOS, isLoading: false });
    useBalanceQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    renderPanel();
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  // BAL-4: 404 shows non-crashing informational state
  it('shows a 404 informational message without crashing', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useOperariosMock.mockReturnValue({ data: OPERARIOS, isLoading: false });
    const err = new ApiError(404, 'Not found');
    useBalanceQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: err });
    renderPanel();
    expect(screen.getByText(/registros de compensación/i)).toBeInTheDocument();
  });

  // BAL-3: 422 shows policy tab link message
  it('shows a 422 message directing to the Política de jornada tab', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useOperariosMock.mockReturnValue({ data: OPERARIOS, isLoading: false });
    const err = new ApiError(422, 'Unprocessable');
    useBalanceQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: err });
    renderPanel();
    // Multiple elements may match (Alert title + message body both contain the phrase)
    expect(screen.getAllByText(/política de jornada/i).length).toBeGreaterThanOrEqual(1);
  });

  // BAL-6: No query fired when operario not selected
  it('calls useBalanceQuery with enabled=false when no operario is selected', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useOperariosMock.mockReturnValue({ data: OPERARIOS, isLoading: false });
    useBalanceQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null });
    renderPanel();
    // useBalanceQuery is called with null operarioId so the hook itself disables
    const calls = useBalanceQueryMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // First arg (operarioId) must be null on initial render (no operario selected)
    expect(calls[0][0]).toBeNull();
  });

  // Operario select populates options from useOperarios
  it('renders operario options from useOperarios hook', () => {
    defaultSetup();
    renderPanel();
    // The select should exist (searchable Select renders an input)
    expect(screen.getByPlaceholderText(/operario/i)).toBeInTheDocument();
  });

  // CLO-1: Close button hidden for read-only roles
  it('does not show the close period button for COORDINADOR', () => {
    defaultSetup('COORDINADOR');
    renderPanel();
    expect(screen.queryByTestId('close-period-btn')).not.toBeInTheDocument();
  });

  it('does not show the close period button for GERENCIA', () => {
    defaultSetup('GERENCIA');
    renderPanel();
    expect(screen.queryByTestId('close-period-btn')).not.toBeInTheDocument();
  });

  // CLO-2 (negative): button absent until an operario is selected
  it('hides the close period button when no operario is selected', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();
    // operarioId starts as null → button must not appear yet
    expect(screen.queryByTestId('close-period-btn')).not.toBeInTheDocument();
  });

  // CLO-2 (positive): close button appears for write role once operario + data are present
  it('shows the close period button for TALENTO_HUMANO once an operario is selected', async () => {
    const user = userEvent.setup();
    defaultSetup('TALENTO_HUMANO');
    renderPanel();

    // Select an operario: click the combobox input, then pick the first option
    const combobox = screen.getByPlaceholderText(/operario/i);
    await user.click(combobox);
    // Mantine renders options with the operario name — click "Ana García"
    const option = await screen.findByText('Ana García');
    await user.click(option);

    // Now operarioId is set and balance.data is mocked → button must be present
    await waitFor(() =>
      expect(screen.getByTestId('close-period-btn')).toBeInTheDocument(),
    );
  });
});
