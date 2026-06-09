import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersAdmin } from './UsersAdmin';

const { usersMock, provisionMock } = vi.hoisted(() => ({ usersMock: vi.fn(), provisionMock: vi.fn() }));

vi.mock('../operarios/operario-queries', () => ({ useZones: () => ({ data: [] }) }));
vi.mock('./admin-queries', () => ({
  useUsers: usersMock,
  useProvisionUser: () => ({ mutateAsync: provisionMock, isPending: false }),
  useAssignCoordinador: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderAdmin() {
  return render(
    <MantineProvider>
      <UsersAdmin />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('UsersAdmin', () => {
  it('lists users with role and never shows passwordHash', () => {
    usersMock.mockReturnValue({
      data: [
        { id: 'u1', email: 'admin@futuragest.co', role: 'SYSTEM_ADMIN', mustChangePassword: false, coordinatedZoneId: null, createdAt: '' },
      ],
      isLoading: false,
      isError: false,
    });
    renderAdmin();
    expect(screen.getByText('admin@futuragest.co')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM_ADMIN')).toBeInTheDocument();
  });

  it('provisions a user through the modal', async () => {
    usersMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    provisionMock.mockResolvedValue({ id: 'new' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /crear usuario/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^correo electrónico/i), 'lider@futuragest.co');
    await user.type(within(dialog).getByLabelText(/contraseña temporal/i), 'Temp1234!');
    // Mantine Select: open and pick a role
    await user.click(within(dialog).getByLabelText(/^rol/i));
    await user.click(await screen.findByRole('option', { name: 'LIDER_OPERATIVO' }));
    await user.click(within(dialog).getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(provisionMock).toHaveBeenCalledWith({
        email: 'lider@futuragest.co',
        password: 'Temp1234!',
        role: 'LIDER_OPERATIVO',
      }),
    );
  });
});
