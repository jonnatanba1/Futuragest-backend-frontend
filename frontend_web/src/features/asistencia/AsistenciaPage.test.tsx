import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsistenciaPage } from './AsistenciaPage';

const ATT = [
  {
    id: 'a-1',
    operarioId: 'o-1',
    supervisorId: 's-1',
    zoneId: 'z-1',
    date: '2026-06-03',
    checkInCapturedAt: '2026-06-03T11:00:00Z',
    checkInReceivedAt: '2026-06-03T11:00:01Z',
    checkInLat: 1,
    checkInLng: 2,
    checkInAccuracy: 5,
    checkOutCapturedAt: '2026-06-03T23:00:00Z',
    checkOutReceivedAt: '2026-06-03T23:00:01Z',
    checkOutLat: 1,
    checkOutLng: 2,
    checkOutAccuracy: 5,
    signatureKey: 'k1',
    checkOutSignatureKey: 'k2',
    clientRef: 'c1',
    checkOutClientRef: 'c2',
    completedAt: '2026-06-03T23:00:01Z',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'a-2',
    operarioId: 'o-2',
    supervisorId: 's-1',
    zoneId: 'z-1',
    date: '2026-06-04',
    checkInCapturedAt: '2026-06-04T11:00:00Z',
    checkInReceivedAt: '2026-06-04T11:00:01Z',
    checkInLat: 1,
    checkInLng: 2,
    checkInAccuracy: null,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    signatureKey: null,
    checkOutSignatureKey: null,
    clientRef: 'c3',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: '',
    updatedAt: '',
  },
];

vi.mock('./attendance-queries', () => ({
  useAttendances: () => ({ data: ATT, isLoading: false, isError: false }),
  useSignatureUrl: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('../operarios/operario-queries', () => ({
  useOperarios: () => ({
    data: [
      { id: 'o-1', fullName: 'Wilson Palacios', documento: '1', supervisorId: 's-1', deactivatedAt: null, createdAt: '', updatedAt: '' },
      { id: 'o-2', fullName: 'Yuliana Cuesta', documento: '2', supervisorId: 's-1', deactivatedAt: null, createdAt: '', updatedAt: '' },
    ],
  }),
  useSupervisors: () => ({ data: [{ id: 's-1', userId: 'u', municipioId: 'm', zoneId: 'z', area: 'BARRIDO', email: 's1@futuragest.co', createdAt: '' }] }),
  useZones: () => ({ data: [{ id: 'z-1', name: 'Zona Urabá', createdAt: '', updatedAt: '' }] }),
  useMunicipios: () => ({ data: [] }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <AsistenciaPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('AsistenciaPage', () => {
  it('renders attendance rows with joined operario names', () => {
    renderPage();
    expect(screen.getByText('Wilson Palacios')).toBeInTheDocument();
    expect(screen.getByText('Yuliana Cuesta')).toBeInTheDocument();
  });

  it('filters by date', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Filtrar por fecha'), { target: { value: '2026-06-03' } });
    expect(screen.getByText('Wilson Palacios')).toBeInTheDocument();
    expect(screen.queryByText('Yuliana Cuesta')).not.toBeInTheDocument();
  });

  it('filters by search', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Buscar asistencia'), 'Yuliana');
    expect(screen.getByText('Yuliana Cuesta')).toBeInTheDocument();
    expect(screen.queryByText('Wilson Palacios')).not.toBeInTheDocument();
  });

  it('opens the detail drawer when a row is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Wilson Palacios'));
    await waitFor(() =>
      expect(screen.getByText('Detalle de asistencia')).toBeInTheDocument(),
    );
    expect(screen.getByText('Firma de ingreso')).toBeInTheDocument();
  });
});
