import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupervisoresAdmin } from './SupervisoresAdmin';

const { supsMock, createMock } = vi.hoisted(() => ({ supsMock: vi.fn(), createMock: vi.fn() }));

vi.mock('../operarios/operario-queries', () => ({
  useSupervisors: supsMock,
  useZones: () => ({ data: [{ id: 'z1', name: 'Zona A', createdAt: '', updatedAt: '' }] }),
  useMunicipios: () => ({
    data: [
      { id: 'm1', name: 'Apartadó', zoneId: 'z1', createdAt: '', updatedAt: '' },
      { id: 'm2', name: 'Otro', zoneId: 'z9', createdAt: '', updatedAt: '' },
    ],
  }),
}));
vi.mock('./admin-queries', () => ({
  useCreateSupervisor: () => ({ mutateAsync: createMock, isPending: false }),
}));

function renderAdmin() {
  return render(
    <MantineProvider>
      <SupervisoresAdmin />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('SupervisoresAdmin', () => {
  it('lists supervisors with email and area', () => {
    supsMock.mockReturnValue({
      data: [
        { id: 's1', userId: 'u1', email: 'sup@futuragest.co', area: 'BARRIDO', zoneId: 'z1', municipioId: 'm1', createdAt: '' },
      ],
      isLoading: false,
      isError: false,
    });
    renderAdmin();
    expect(screen.getByText('sup@futuragest.co')).toBeInTheDocument();
    expect(screen.getByText('BARRIDO')).toBeInTheDocument();
  });

  it('creates a supervisor with cascading zone → municipio', async () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    createMock.mockResolvedValue({ id: 's-new' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /nuevo supervisor/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^correo electrónico/i), 'nuevo@futuragest.co');
    await user.type(within(dialog).getByLabelText(/contraseña temporal/i), 'Temp1234!');

    await user.click(within(dialog).getByLabelText(/^área/i));
    await user.click(await screen.findByRole('option', { name: 'BARRIDO' }));
    await user.click(within(dialog).getByLabelText(/^zona/i));
    await user.click(await screen.findByRole('option', { name: 'Zona A' }));
    await user.click(within(dialog).getByLabelText(/^municipio/i));
    await user.click(await screen.findByRole('option', { name: 'Apartadó' }));

    await user.click(within(dialog).getByRole('button', { name: /crear supervisor/i }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        email: 'nuevo@futuragest.co',
        password: 'Temp1234!',
        area: 'BARRIDO',
        zoneId: 'z1',
        municipioId: 'm1',
      }),
    );
  });
});
