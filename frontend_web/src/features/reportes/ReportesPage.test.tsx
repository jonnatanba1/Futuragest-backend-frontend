import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportesPage } from './ReportesPage';
import { reportesApi } from '../../lib/api/client';

const { usePslReportPreviewMock, useZonesMock } = vi.hoisted(() => ({
  usePslReportPreviewMock: vi.fn(),
  useZonesMock: vi.fn(),
}));

vi.mock('./reportes-queries', () => ({
  usePslReportPreview: usePslReportPreviewMock,
}));

vi.mock('../operarios/operario-queries', () => ({
  useZones: useZonesMock,
}));

const { notificationsShowMock } = vi.hoisted(() => ({
  notificationsShowMock: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({
  notifications: { show: notificationsShowMock },
}));

const mockReportRow = {
  compania: '40',
  cedula: '1040364416',
  concepto: '010',
  anio: 2026,
  periodo: 13,
  horasOrdinaria: '5.30',
  tipoHora: 'D',
  diaLaborado: 46206,
  tipoMvto: 'NORMA',
  horaInicio: '19:00',
  horaFinal: '23:59',
};

describe('ReportesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and shows preview rows', async () => {
    useZonesMock.mockReturnValue({ data: [{ id: 'z-1', name: 'Zona Urabá' }] });
    usePslReportPreviewMock.mockReturnValue({
      data: [mockReportRow],
      isLoading: false,
      isError: false,
    });

    render(
      <MantineProvider>
        <ReportesPage />
      </MantineProvider>
    );

    expect(screen.getByText('Reportes de Nómina')).toBeInTheDocument();
    expect(screen.getByText('Vista Previa del Plano PSL')).toBeInTheDocument();
    expect(screen.getByText('1040364416')).toBeInTheDocument();
    expect(screen.getByText('010 - Recargo Nocturno')).toBeInTheDocument();
    expect(screen.getByText('5.30')).toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
  });

  it('allows exporting the report', async () => {
    useZonesMock.mockReturnValue({ data: [] });
    usePslReportPreviewMock.mockReturnValue({
      data: [mockReportRow],
      isLoading: false,
      isError: false,
    });

    const downloadMock = vi.spyOn(reportesApi, 'downloadPsl').mockResolvedValue(new Blob(['test'], { type: 'text/csv' }));

    render(
      <MantineProvider>
        <ReportesPage />
      </MantineProvider>
    );

    const exportBtn = screen.getByRole('button', { name: /exportar plano psl/i });
    expect(exportBtn).not.toBeDisabled();

    await userEvent.click(exportBtn);

    expect(downloadMock).toHaveBeenCalled();
  });
});
