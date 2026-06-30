import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperariosPage } from './OperariosPage';

const { useAuthMock, deactivateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  deactivateMock: vi.fn(),
}));

vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const OPS = [
  {
    id: 'o-1',
    fullName: 'Wilson Palacios',
    documento: '1030000007',
    supervisorId: 's-1',
    cargo: 'Barrido',
    deactivatedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'o-2',
    fullName: 'Yuliana Cuesta',
    documento: '1030000008',
    supervisorId: 's-1',
    cargo: '',
    deactivatedAt: '2026-02-01T00:00:00Z',
    createdAt: '',
    updatedAt: '',
  },
];

vi.mock('./operario-queries', () => ({
  useOperarios: () => ({ data: OPS, isLoading: false, isError: false }),
  useSupervisors: () => ({ data: [{ id: 's-1', userId: 'u', municipioId: 'm-1', zoneId: 'z-1', area: 'BARRIDO', email: 's1@futuragest.co', createdAt: '' }] }),
  useZones: () => ({ data: [{ id: 'z-1', name: 'Zona Urabá', createdAt: '', updatedAt: '' }] }),
  useMunicipios: () => ({ data: [{ id: 'm-1', name: 'Turbo', zoneId: 'z-1', createdAt: '', updatedAt: '' }] }),
  useCreateOperario: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeactivateOperario: () => ({ mutateAsync: deactivateMock, isPending: false, variables: undefined }),
  useReactivateOperario: () => ({ mutateAsync: vi.fn(), isPending: false, variables: undefined }),
  useReassignOperario: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportOperarios: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function setRole(role: string) {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
}

function renderPage() {
  return render(
    <MantineProvider>
      <OperariosPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('OperariosPage', () => {
  it('renders operario rows', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.getByText('Wilson Palacios')).toBeInTheDocument();
    expect(screen.getByText('1030000008')).toBeInTheDocument();
  });

  it('filters rows by the search box', async () => {
    setRole('TALENTO_HUMANO');
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Buscar operarios'), 'Wilson');
    expect(screen.getByText('Wilson Palacios')).toBeInTheDocument();
    expect(screen.queryByText('Yuliana Cuesta')).not.toBeInTheDocument();
  });

  it('shows write controls for write roles', async () => {
    setRole('TALENTO_HUMANO');
    const user = userEvent.setup();
    renderPage();
    // expect(screen.getByRole('button', { name: /nuevo operario/i })).toBeInTheDocument(); // Oculto a pedido del usuario
    expect(screen.getByRole('button', { name: /^importar$/i })).toBeInTheDocument();
    // Action buttons live inside the drawer — open it by clicking the row
    await user.click(screen.getByText('Wilson Palacios'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
  });

  it('hides write controls for read-only roles', () => {
    setRole('COORDINADOR');
    renderPage();
    expect(screen.queryByRole('button', { name: /nuevo operario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^importar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument();
  });

  it('opens the detail drawer and shows deactivation button for an active operario', async () => {
    setRole('TALENTO_HUMANO');
    const user = userEvent.setup();
    renderPage();
    // Click the row to open the drawer
    await user.click(screen.getByText('Wilson Palacios'));
    // The detail drawer should appear with the Desactivar button
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
    // The full deactivation confirm flow is covered by OperarioDetailDrawer.test.tsx
  });
});
