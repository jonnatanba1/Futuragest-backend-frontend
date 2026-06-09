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
      data: [{ id: 'z-1', name: 'Zona Urabá', createdAt: '', updatedAt: '' }],
      isLoading: false,
      isError: false,
    });
    renderAdmin();
    expect(screen.getByText('Zona Urabá')).toBeInTheDocument();
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
