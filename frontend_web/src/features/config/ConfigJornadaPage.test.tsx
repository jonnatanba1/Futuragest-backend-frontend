import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JornadaPolicyDto, OperarioDto, ZoneResponseDto } from '@futuragest/contracts';
import { ConfigJornadaPage } from './ConfigJornadaPage';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useJornadaPoliciesQueryMock, useCreateJornadaPolicyMutationMock } = vi.hoisted(() => ({
  useJornadaPoliciesQueryMock: vi.fn(),
  useCreateJornadaPolicyMutationMock: vi.fn(),
}));
vi.mock('../compensacion/compensacion-queries', () => ({
  useJornadaPoliciesQuery: useJornadaPoliciesQueryMock,
  useCreateJornadaPolicyMutation: useCreateJornadaPolicyMutationMock,
}));

const { useOperariosMock, useZonesMock } = vi.hoisted(() => ({
  useOperariosMock: vi.fn(),
  useZonesMock: vi.fn(),
}));
vi.mock('../operarios/operario-queries', () => ({
  useOperarios: useOperariosMock,
  useZones: useZonesMock,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

vi.mock('../../lib/api/client', () => ({
  jornadaPolicyApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_POLICY = {
  operarioId: null as string | null,
  zoneId: null as string | null,
  horaInicio: '06:00',
  horaFin: '14:00',
  diasLaborales: [1, 2, 3, 4, 5],
  almuerzoInicio: '09:45',
  almuerzoFin: '10:15',
  toleranciaMin: 5,
  horasSemanales: '44.00',
};

const POLICIES: JornadaPolicyDto[] = [
  { id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '2026-01-01T10:00:00.000Z', ...BASE_POLICY },
  { id: 'pol-2', horasDiarias: '7.50', vigenteDesde: '2026-06-01', createdAt: '2026-06-01T08:00:00.000Z', ...BASE_POLICY, zoneId: 'zone-1' },
  { id: 'pol-3', horasDiarias: '6.00', vigenteDesde: '2026-07-01', createdAt: '2026-07-01T00:00:00.000Z', ...BASE_POLICY, operarioId: 'op-1' },
];

const OPERARIOS: OperarioDto[] = [
  { id: 'op-1', fullName: 'Carlos Gómez', documento: '123', supervisorId: 'sup-1', cargo: 'Barrido', active: true, deactivatedAt: null, createdAt: '', updatedAt: '' },
];

const ZONES: ZoneResponseDto[] = [
  { id: 'zone-1', name: 'Zona Norte', createdAt: '', updatedAt: '' },
];

const mutateMock = vi.fn();

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useJornadaPoliciesQueryMock.mockReturnValue({
    data: POLICIES,
    isLoading: false,
    isError: false,
    error: null,
  });
  useCreateJornadaPolicyMutationMock.mockReturnValue({
    mutateAsync: mutateMock,
    isPending: false,
  });
  useOperariosMock.mockReturnValue({
    data: OPERARIOS,
    isLoading: false,
    isError: false,
  });
  useZonesMock.mockReturnValue({
    data: ZONES,
    isLoading: false,
    isError: false,
  });
}

function renderPage() {
  return render(
    <MantineProvider>
      <ConfigJornadaPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConfigJornadaPage', () => {
  // JP-1 — Renders the page with policy table
  it('renders the page title and policy rows', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('Configuración de Jornada')).toBeInTheDocument();
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.getByText('7.50')).toBeInTheDocument();
    expect(screen.getByText('6.00')).toBeInTheDocument();
  });

  // JP-2 — Shows policy scope in table
  it('shows policy scope — global, zone, or operario', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('Zona Norte')).toBeInTheDocument();
    expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
  });

  // JP-3 — Create button opens modal
  it('opens create modal when clicking "Nueva política"', async () => {
    defaultSetup();
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /nueva política/i }));

    await waitFor(() => {
      // The modal should be visible — assert by checking for form fields in dialog
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(/hora inicio/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/hora fin/i)).toBeInTheDocument();
    });
  });

  // JP-4 — Table shows vigenteDesde as timeline
  it('shows vigenteDesde dates in table', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
  });

  // JP-5 — Filter by operario
  it('filters policies by operario search', async () => {
    defaultSetup();
    renderPage();

    const user = userEvent.setup();
    const searchInput = screen.getByPlaceholderText(/buscar operario/i);
    await user.type(searchInput, 'Carlos');

    // Policy rows should still render (client-side filter)
    expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
  });

  // JP-6 — Hides create button for read-only roles
  it('hides "Nueva política" button for GERENCIA', () => {
    defaultSetup('GERENCIA');
    renderPage();
    expect(screen.queryByRole('button', { name: /nueva política/i })).not.toBeInTheDocument();
  });

  // JP-7 — Loading state
  it('shows loading skeleton while query is loading', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useJornadaPoliciesQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    useCreateJornadaPolicyMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useOperariosMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    useZonesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  // JP-8 — Empty state
  it('shows empty state when no policies exist', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useJornadaPoliciesQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    useCreateJornadaPolicyMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useOperariosMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    useZonesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/no hay políticas/i)).toBeInTheDocument();
  });
});
