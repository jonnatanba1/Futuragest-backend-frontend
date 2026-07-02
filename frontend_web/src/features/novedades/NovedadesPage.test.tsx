import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovedadesPage } from './NovedadesPage';

const { useAuthMock, approveMock, rejectMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  approveMock: vi.fn(),
  rejectMock: vi.fn(),
}));

const NOV = [
  {
    id: 'n-1',
    attendanceId: 'att-1',
    supervisorId: 's-1',
    zoneId: 'z-1',
    tipoNovedad: 'HORAS_EXTRA' as const,
    horasExtra: '2.50',
    minutosTarde: null,
    motivo: 'Extra shift',
    status: 'PENDING',
    clientRef: null,
    approvedByUserId: null,
    decidedAt: null,
    decisionVerification: null,
    rejectionReason: null,
    createdAt: '2026-06-03T10:00:00Z',
    updatedAt: '',
  },
  {
    id: 'n-2',
    attendanceId: 'att-2',
    supervisorId: 's-1',
    zoneId: 'z-1',
    tipoNovedad: 'LLEGADA_TARDE' as const,
    horasExtra: '0',
    minutosTarde: 15,
    motivo: null,
    status: 'APPROVED',
    clientRef: null,
    approvedByUserId: 'u',
    decidedAt: '2026-06-02T12:00:00Z',
    decisionVerification: 'BIOMETRIC' as const,
    rejectionReason: null,
    createdAt: '2026-06-02T10:00:00Z',
    updatedAt: '',
  },
];

vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));
vi.mock('./novedad-queries', () => ({
  useNovedades: () => ({ data: NOV, isLoading: false, isError: false }),
  useApproveNovedad: () => ({ mutateAsync: approveMock, isPending: false }),
  useRejectNovedad: () => ({ mutateAsync: rejectMock, isPending: false }),
}));
vi.mock('../asistencia/attendance-queries', () => ({
  useAttendances: () => ({
    data: [
      { id: 'att-1', operarioId: 'o-1' },
      { id: 'att-2', operarioId: 'o-2' },
    ],
  }),
}));
vi.mock('../operarios/operario-queries', () => ({
  useOperarios: () => ({
    data: [
      { id: 'o-1', fullName: 'Wilson Palacios' },
      { id: 'o-2', fullName: 'Yuliana Cuesta' },
    ],
  }),
  useSupervisors: () => ({ data: [{ id: 's-1', area: 'BARRIDO', email: 's1@futuragest.co', municipioId: 'm', zoneId: 'z', userId: 'u', createdAt: '' }] }),
  useZones: () => ({ data: [] }),
  useMunicipios: () => ({ data: [] }),
}));

function setRole(role: string) {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
}

function renderPage() {
  return render(
    <MantineProvider>
      <NovedadesPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('NovedadesPage', () => {
  it('renders novedad rows with joined operario names and status', () => {
    setRole('SYSTEM_ADMIN');
    renderPage();
    expect(screen.getByText('Wilson Palacios')).toBeInTheDocument();
    expect(screen.getByText('2.50 h')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
  });

  it('hides approve/reject for roles that cannot approve', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
  });

  it('approves a pending novedad through the confirm modal', async () => {
    setRole('SYSTEM_ADMIN');
    approveMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    // Only the PENDING row has an Aprobar button.
    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    await waitFor(() => expect(approveMock).toHaveBeenCalledWith('n-1'));
  });

  it('rejects a pending novedad through the confirm modal', async () => {
    setRole('LIDER_OPERATIVO');
    rejectMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

    await waitFor(() => expect(rejectMock).toHaveBeenCalledWith({ id: 'n-1', reason: undefined }));
  });

  it('shows BIOMETRIC verification badge for the APPROVED row', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.getByText('Huella')).toBeInTheDocument();
  });

  it('shows a dash in the Verificación column for the PENDING row', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    // PENDING row has no decision verification — should render '—'
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows LLEGADA_TARDE badge and minutosTarde in detalle column', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.getByText('Llegada Tarde')).toBeInTheDocument();
    expect(screen.getByText('15 min tarde')).toBeInTheDocument();
  });
});
