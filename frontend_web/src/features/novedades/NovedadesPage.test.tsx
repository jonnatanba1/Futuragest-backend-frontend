import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovedadesPage } from './NovedadesPage';

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

vi.mock('./novedad-queries', () => ({
  useNovedades: () => ({ data: NOV, isLoading: false, isError: false }),
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
    renderPage();
    expect(screen.getByText('Wilson Palacios')).toBeInTheDocument();
    expect(screen.getByText('2.50 h')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
  });

  it('shows LLEGADA_TARDE badge and minutosTarde in detalle column', () => {
    renderPage();
    expect(screen.getByText('Llegada Tarde')).toBeInTheDocument();
    expect(screen.getByText('15 min tarde')).toBeInTheDocument();
  });
});
