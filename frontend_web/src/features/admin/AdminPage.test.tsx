import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';

const { areasMock, zonesMock } = vi.hoisted(() => ({
  areasMock: vi.fn(),
  zonesMock: vi.fn(),
}));

vi.mock('../operarios/operario-queries', () => ({
  useAreas: areasMock,
  useZones: zonesMock,
  useMunicipios: () => ({ data: [], isLoading: false, isError: false }),
  useSupervisors: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('./admin-queries', () => ({
  useCreateArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateMunicipio: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMunicipio: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMunicipio: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateZone: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateZone: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteZone: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUsers: () => ({ data: [], isLoading: false, isError: false }),
  useProvisionUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignCoordinador: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSupervisor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSupervisor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../lib/auth/auth-context', () => ({
  useAuth: () => ({ user: { role: 'SYSTEM_ADMIN', coordinatedZone: null } }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <AdminPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('AdminPage', () => {
  it('renders the Áreas tab and shows AreasAdmin content instead of static list', async () => {
    areasMock.mockReturnValue({
      data: [
        {
          id: 'a-1',
          name: 'Patio Central',
          horaInicio: '06:00',
          horaFin: '14:00',
          zoneId: 'z-1',
          createdAt: '',
          updatedAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    zonesMock.mockReturnValue({
      data: [{ id: 'z-1', name: 'Zona Norte', createdAt: '', updatedAt: '' }],
      isLoading: false,
      isError: false,
    });

    const user = userEvent.setup();
    renderPage();

    // The Áreas tab exists
    const areasTab = screen.getByRole('tab', { name: /áreas/i });
    expect(areasTab).toBeInTheDocument();

    // Switch to Áreas tab
    await user.click(areasTab);

    // The AreasAdmin component is rendered (area name visible)
    expect(screen.getByText('Patio Central')).toBeInTheDocument();

    // Static AREAS list text should NOT be present
    expect(screen.queryByText(/catálogo fijo/iu)).toBeNull();
    expect(screen.queryByText('BARRIDO')).toBeNull();
    expect(screen.queryByText('RECOLECCION')).toBeNull();
  });
});
