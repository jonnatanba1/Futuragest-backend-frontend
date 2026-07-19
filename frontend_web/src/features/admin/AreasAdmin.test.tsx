import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreasAdmin } from './AreasAdmin';

const { createMock, updateMock, deleteMock, areasMock, zonesMock, useAuthMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  areasMock: vi.fn(),
  zonesMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('../operarios/operario-queries', () => ({
  useAreas: areasMock,
  useZones: zonesMock,
}));

vi.mock('./admin-queries', () => ({
  useCreateArea: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateArea: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteArea: () => ({ mutateAsync: deleteMock, isPending: false }),
  useUpdateSupervisor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../lib/auth/auth-context', () => ({
  useAuth: useAuthMock,
}));

function renderAdmin() {
  return render(
    <MantineProvider>
      <AreasAdmin />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

const sampleArea = {
  id: 'a-1',
  name: 'Patio Central',
  horaInicio: '06:00',
  horaFin: '14:00',
  zoneId: 'z-1',
  createdAt: '2024-01-01',
  updatedAt: '',
};

const sampleZones = [
  { id: 'z-1', name: 'Zona Norte', createdAt: '', updatedAt: '' },
  { id: 'z-2', name: 'Zona Sur', createdAt: '', updatedAt: '' },
];

function setupAreaList() {
  areasMock.mockReturnValue({
    data: [sampleArea],
    isLoading: false,
    isError: false,
  });
  zonesMock.mockReturnValue({
    data: sampleZones,
    isLoading: false,
    isError: false,
  });
  useAuthMock.mockReturnValue({
    user: { role: 'SYSTEM_ADMIN', coordinatedZone: null },
  });
}

describe('AreasAdmin', () => {
  it('lists areas with name, zone, and schedule columns', () => {
    setupAreaList();
    renderAdmin();
    expect(screen.getByText('Patio Central')).toBeInTheDocument();
    expect(screen.getByText('Zona Norte')).toBeInTheDocument();
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
  });

  it('shows zone selector for GLOBAL roles (SYSTEM_ADMIN)', async () => {
    setupAreaList();
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /nueva área/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('textbox', { name: /zona/i })).toBeInTheDocument();
  });

  it('hides zone selector for COORDINADOR role', async () => {
    areasMock.mockReturnValue({
      data: [{ ...sampleArea, zoneId: 'z-1' }],
      isLoading: false,
      isError: false,
    });
    zonesMock.mockReturnValue({ data: sampleZones, isLoading: false, isError: false });
    useAuthMock.mockReturnValue({
      user: { role: 'COORDINADOR', coordinatedZone: { id: 'z-1', name: 'Zona Norte' } },
    });

    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /nueva área/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('textbox', { name: /zona/i })).toBeNull();
  });

  it('creates an area through the modal', async () => {
    setupAreaList();
    createMock.mockResolvedValue({ id: 'a-new' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /nueva área/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/nombre/i), 'Depósito');
    await user.type(within(dialog).getByLabelText(/hora inicio/i), '08:00');
    await user.type(within(dialog).getByLabelText(/hora fin/i), '16:00');

    const zoneInput = within(dialog).getByRole('textbox', { name: /zona/i });
    await user.click(zoneInput);
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText('Zona Norte'));

    await user.click(within(dialog).getByRole('button', { name: /crear/i }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        name: 'Depósito',
        horaInicio: '08:00',
        horaFin: '16:00',
        zoneId: 'z-1',
      }),
    );
  });

  it('edits an area through the drawer and modal with pre-filled values', async () => {
    setupAreaList();
    updateMock.mockResolvedValue({ ...sampleArea, name: 'Almacén' });
    const user = userEvent.setup();
    renderAdmin();

    // Click the row to open the detail drawer
    await user.click(screen.getByText('Patio Central'));
    const drawer = await screen.findByRole('dialog');

    // Click Edit button inside the drawer
    await user.click(within(drawer).getByRole('button', { name: /editar/i }));
    const editDialog = await screen.findByRole('dialog', { name: /editar área/i });

    // Pre-filled values
    expect(within(editDialog).getByLabelText(/nombre/i)).toHaveValue('Patio Central');
    expect(within(editDialog).getByLabelText(/hora inicio/i)).toHaveValue('06:00');
    expect(within(editDialog).getByLabelText(/hora fin/i)).toHaveValue('14:00');

    // Clear and type new name
    const nameInput = within(editDialog).getByLabelText(/nombre/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Almacén');

    await user.click(within(editDialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: 'a-1',
        name: 'Almacén',
        horaInicio: '06:00',
        horaFin: '14:00',
      }),
    );
  });

  it('deletes an area with confirmation from drawer', async () => {
    setupAreaList();
    deleteMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAdmin();

    // Click the row to open the detail drawer
    await user.click(screen.getByText('Patio Central'));
    const drawer = await screen.findByRole('dialog');

    // Click Eliminar button inside the drawer
    await user.click(within(drawer).getByRole('button', { name: /eliminar/i }));
    const confirmDialog = await screen.findByRole('dialog', { name: /eliminar área/i });

    expect(within(confirmDialog).getByText(/Patio Central/)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: /eliminar/i }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('a-1'));
  });

  it('shows error in modal on create failure', async () => {
    setupAreaList();
    createMock.mockRejectedValue(new Error('Something went wrong'));
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /nueva área/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/nombre/i), 'Duplicate');
    await user.type(within(dialog).getByLabelText(/hora inicio/i), '06:00');
    await user.type(within(dialog).getByLabelText(/hora fin/i), '14:00');

    const zoneInput = within(dialog).getByRole('textbox', { name: /zona/i });
    await user.click(zoneInput);
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText('Zona Norte'));

    await user.click(within(dialog).getByRole('button', { name: /crear/i }));

    await waitFor(() =>
      expect(screen.getByText('Algo salió mal.')).toBeInTheDocument(),
    );
  });
});
