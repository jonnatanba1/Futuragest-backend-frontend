import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZonesAdmin } from './ZonesAdmin';

const { createMock, updateMock, deleteMock, zonesMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  zonesMock: vi.fn(),
}));

vi.mock('../operarios/operario-queries', () => ({ useZones: zonesMock }));
vi.mock('./admin-queries', () => ({
  useCreateZone: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateZone: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteZone: () => ({ mutateAsync: deleteMock, isPending: false }),
  useUpdateSupervisor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderAdmin() {
  return render(
    <MantineProvider>
      <ZonesAdmin />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('ZonesAdmin', () => {
  it('lists zones', () => {
    zonesMock.mockReturnValue({
      data: [{ id: 'z-1', name: 'Zona Urabá', createdAt: '2024-01-01', updatedAt: '' }],
      isLoading: false,
      isError: false,
    });
    renderAdmin();
    expect(screen.getByText('Zona Urabá')).toBeInTheDocument();
  });

  it('shows detail drawer on row click with edit and delete buttons', async () => {
    zonesMock.mockReturnValue({
      data: [{ id: 'z-1', name: 'Zona Urabá', createdAt: '2024-01-01', updatedAt: '' }],
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByText('Zona Urabá'));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByText('ID')).toBeInTheDocument();
    expect(within(drawer).getByText('z-1')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /eliminar/i })).toBeInTheDocument();
  });

  it('opens edit modal from drawer', async () => {
    zonesMock.mockReturnValue({
      data: [{ id: 'z-1', name: 'Zona Urabá', createdAt: '2024-01-01', updatedAt: '' }],
      isLoading: false,
      isError: false,
    });
    updateMock.mockResolvedValue({ id: 'z-1', name: 'Zona Urabá Editada', createdAt: '', updatedAt: '' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByText('Zona Urabá'));
    const drawer = await screen.findByRole('dialog');

    await user.click(within(drawer).getByRole('button', { name: /editar/i }));

    const dialog = await screen.findByRole('dialog', { name: /editar zona/i });
    const nameInput = within(dialog).getByLabelText(/nombre/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Zona Urabá Editada');
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({ id: 'z-1', name: 'Zona Urabá Editada' }),
    );
  });

  it('creates a zone through the modal', async () => {
    zonesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    createMock.mockResolvedValue({ id: 'z-new' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /nueva zona/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/nombre/i), 'Zona Nueva');
    await user.click(within(dialog).getByRole('button', { name: /crear/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith('Zona Nueva'));
  });
});
