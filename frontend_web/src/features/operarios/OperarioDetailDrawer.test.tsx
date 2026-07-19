import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperarioDetailDrawer } from './OperarioDetailDrawer';

const { deactivateMock } = vi.hoisted(() => ({ deactivateMock: vi.fn() }));

vi.mock('./operario-queries', () => ({
  useDeactivateOperario: () => ({ mutateAsync: deactivateMock, isPending: false, variables: undefined }),
  useReactivateOperario: () => ({ mutateAsync: vi.fn(), isPending: false, variables: undefined }),
  useReassignOperario: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const ACTIVE_OP = {
  id: 'o-1',
  fullName: 'Wilson Palacios',
  documento: '1030000007',
  supervisorId: 's-1',
  cargo: 'Barrido',
  active: true,
  deactivatedAt: null,
  areaId: null,
  areaName: null,
  createdAt: '2025-01-15T00:00:00Z',
  updatedAt: '',
};

const INACTIVE_OP = {
  ...ACTIVE_OP,
  id: 'o-2',
  fullName: 'Yuliana Cuesta',
  deactivatedAt: '2026-02-01T00:00:00Z',
};

const supervisorMap = new Map([
  ['s-1', { id: 's-1', userId: 'u', municipioId: 'm-1', zoneId: 'z-1', area: 'BARRIDO', email: 's1@futuragest.co', createdAt: '' }],
]);
const zoneMap = new Map([['z-1', 'Zona Urabá']]);
const municipioMap = new Map([['m-1', 'Turbo']]);
const supervisorOptions = [{ value: 's-1', label: 'Zona Urabá – Turbo' }];

function renderDrawer(props: Partial<Parameters<typeof OperarioDetailDrawer>[0]> = {}) {
  return render(
    <MantineProvider>
      <OperarioDetailDrawer
        operario={ACTIVE_OP}
        onClose={vi.fn()}
        supervisorOptions={supervisorOptions}
        supervisorMap={supervisorMap}
        zoneMap={zoneMap}
        municipioMap={municipioMap}
        canWrite={true}
        {...props}
      />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('OperarioDetailDrawer', () => {
  it('renders nothing visible when operario is null', () => {
    renderDrawer({ operario: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows operario info when opened', () => {
    renderDrawer();
    expect(screen.getAllByText('Wilson Palacios').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1030000007')).toBeInTheDocument();
    expect(screen.getByText('Barrido')).toBeInTheDocument();
    expect(screen.getByText('Zona Urabá')).toBeInTheDocument();
    expect(screen.getByText('Turbo')).toBeInTheDocument();
    expect(screen.getByText('s1@futuragest.co')).toBeInTheDocument();
    expect(screen.getByText('2025-01-15')).toBeInTheDocument();
  });

  it('shows Desactivar button for canWrite + active operario', () => {
    renderDrawer({ canWrite: true });
    expect(screen.getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
  });

  it('shows Reactivar button for canWrite + inactive operario', () => {
    renderDrawer({ operario: INACTIVE_OP, canWrite: true });
    expect(screen.getByRole('button', { name: /reactivar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument();
  });

  it('hides action buttons for read-only roles', () => {
    renderDrawer({ canWrite: false });
    expect(screen.queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reasignar/i })).not.toBeInTheDocument();
  });

  it('calls deactivateMock when confirm modal Desactivar is clicked', async () => {
    deactivateMock.mockResolvedValue({});
    const user = userEvent.setup({ delay: null });
    renderDrawer({ canWrite: true });
    // Open the confirm modal via the Drawer's Desactivar button
    await user.click(screen.getByRole('button', { name: /desactivar/i }));
    // Confirm modal should appear; find the confirm-Desactivar button via the modal dialog
    const confirmModal = await screen.findByRole('dialog', { name: /desactivar operario/i });
    await user.click(within(confirmModal).getByRole('button', { name: /^desactivar$/i }));
    await waitFor(() => expect(deactivateMock).toHaveBeenCalledWith('o-1'));
  });
});
