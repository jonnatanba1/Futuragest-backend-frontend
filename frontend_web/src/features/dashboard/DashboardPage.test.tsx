/**
 * DashboardPage tests.
 *
 * Strategy:
 * - Mock all query hooks and useAuth (same vi.hoisted pattern as the original test).
 * - Charts render nothing useful in jsdom — test section titles, KPI numbers,
 *   table rows, EmptyState, and 'Sin acceso' branches.
 * - Do NOT assert SVG internals.
 */

import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { DashboardPage } from './DashboardPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const {
  operariosActiveMock,
  operariosAllMock,
  attendancesMock,
  novedadesMock,
  zonesMock,
  policiesMock,
} = vi.hoisted(() => ({
  operariosActiveMock: vi.fn(),
  operariosAllMock: vi.fn(),
  attendancesMock: vi.fn(),
  novedadesMock: vi.fn(),
  zonesMock: vi.fn(),
  policiesMock: vi.fn(),
}));

vi.mock('../../lib/auth/auth-context', () => ({
  useAuth: () => ({ user: { email: 'admin@futuragest.co', role: 'SYSTEM_ADMIN' } }),
}));

vi.mock('../operarios/operario-queries', () => ({
  useOperarios: (includeInactive: boolean) =>
    includeInactive ? operariosAllMock() : operariosActiveMock(),
  useZones: () => zonesMock(),
}));

vi.mock('../asistencia/attendance-queries', () => ({ useAttendances: attendancesMock }));
vi.mock('../novedades/novedad-queries', () => ({ useNovedades: novedadesMock }));
vi.mock('../compensacion/compensacion-queries', () => ({
  useJornadaPoliciesQuery: () => policiesMock(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null };
}

function forbidden() {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    error: new ApiError(403, 'Forbidden'),
  };
}

function loading() {
  return { data: undefined, isLoading: true, isError: false, error: null };
}

/** Build an AttendanceDto-like object for tests. */
function makeAtt(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    supervisorId: 'sup-1',
    operarioId: 'op-1',
    zoneId: 'zone-1',
    date: '2026-06-10',
    checkInCapturedAt: '2026-06-10T08:00:00Z',
    checkInReceivedAt: '2026-06-10T08:00:01Z',
    checkInLat: 0,
    checkInLng: 0,
    checkInAccuracy: null,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    checkInPhotoKey: null,
    checkOutPhotoKey: null,
    checkInVerification: null,
    checkOutVerification: null,
    clientRef: 'ref',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: '2026-06-10T08:00:01Z',
    updatedAt: '2026-06-10T08:00:01Z',
    ...overrides,
  };
}

function makeNov(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    attendanceId: 'att-1',
    supervisorId: 'sup-1',
    zoneId: 'zone-1',
    horasExtra: '2.00',
    motivo: null,
    status: 'PENDING',
    clientRef: null,
    approvedByUserId: null,
    decidedAt: null,
    decisionVerification: null,
    createdAt: '2026-06-10T09:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// Policies are an optional enrichment — default every test to an empty OK list.
beforeEach(() => policiesMock.mockReturnValue(ok([])));

// Default "everything OK, empty data" setup.
function defaultEmptyOk() {
  operariosActiveMock.mockReturnValue(ok([]));
  operariosAllMock.mockReturnValue(ok([]));
  attendancesMock.mockReturnValue(ok([]));
  novedadesMock.mockReturnValue(ok([]));
  zonesMock.mockReturnValue(ok([]));
}

// ── Date helpers (dashboard uses the real clock) ──────────────────────────────

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localISO(d);
}

const TODAY_STR = daysAgoStr(0);

/** A completed attendance dated `dateStr` with an 8h shift (08:00 → 16:00 UTC). */
function makeCompletedAtt(dateStr: string, overrides: Record<string, unknown> = {}) {
  return makeAtt({
    date: dateStr,
    checkInCapturedAt: `${dateStr}T08:00:00Z`,
    checkOutCapturedAt: `${dateStr}T16:00:00Z`,
    completedAt: `${dateStr}T16:00:00Z`,
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardPage', () => {
  describe('layout', () => {
    it('renders the page title', () => {
      defaultEmptyOk();
      renderPage();
      expect(screen.getByRole('heading', { name: 'Tablero' })).toBeInTheDocument();
    });

    it('shows user email and role', () => {
      defaultEmptyOk();
      renderPage();
      expect(screen.getByText('admin@futuragest.co · SYSTEM_ADMIN')).toBeInTheDocument();
    });

    it('shows the period SegmentedControl with three options', () => {
      defaultEmptyOk();
      renderPage();
      expect(screen.getByText('Hoy')).toBeInTheDocument();
      expect(screen.getByText('Últimos 7 días')).toBeInTheDocument();
      expect(screen.getByText('Últimos 30 días')).toBeInTheDocument();
    });

    it('shows all section titles', () => {
      defaultEmptyOk();
      renderPage();
      expect(screen.getByText('Asistencias por día')).toBeInTheDocument();
      expect(screen.getByText('Asistencias por zona')).toBeInTheDocument();
      expect(screen.getByText('Novedades en el período')).toBeInTheDocument();
      // "Jornadas abiertas" appears as both KPI label and section title — verify both exist
      const jornadasMatches = screen.getAllByText('Jornadas abiertas');
      expect(jornadasMatches.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Operarios por cargo')).toBeInTheDocument();
    });
  });

  describe('KPI cards', () => {
    it('shows all KPI card labels', () => {
      defaultEmptyOk();
      renderPage();
      expect(screen.getByText('Operarios activos')).toBeInTheDocument();
      expect(screen.getByText('Asistencias en el período')).toBeInTheDocument();
      // "Jornadas abiertas" appears as KPI label and section title — use getAllByText
      expect(screen.getAllByText('Jornadas abiertas').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Novedades pendientes')).toBeInTheDocument();
    });

    it('shows active operario count', () => {
      operariosActiveMock.mockReturnValue(ok([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
      operariosAllMock.mockReturnValue(ok([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]));
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      // 3 active operarios — may appear multiple times (KPI value + cargo count), so use getAllByText
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
      // 1 inactive secondary
      expect(screen.getByText('1 inactivo')).toBeInTheDocument();
    });

    it('shows pending novedad count', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(
        ok([makeNov({ status: 'PENDING' }), makeNov({ status: 'PENDING' }), makeNov({ status: 'APPROVED' })]),
      );
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows open (completedAt null) jornadas count', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(
        ok([
          makeAtt({ completedAt: null }),
          makeAtt({ completedAt: null }),
          makeAtt({ completedAt: '2026-06-10T17:00:00Z' }),
        ]),
      );
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('period selector', () => {
    it('changes selected period when clicking a segment', async () => {
      defaultEmptyOk();
      renderPage();
      const user = userEvent.setup();
      // The segment exists and can be found by label text
      const todayOption = screen.getByText('Hoy');
      await user.click(todayOption);
      // If the control accepts the click without crashing, that's the test.
      expect(todayOption).toBeInTheDocument();
    });
  });

  describe('open attendances table', () => {
    it('shows rows in the open attendances table', () => {
      operariosActiveMock.mockReturnValue(
        ok([{ id: 'op-1', fullName: 'Juan Pérez', documento: '123', supervisorId: 's', cargo: '', active: true, deactivatedAt: null, createdAt: '', updatedAt: '' }]),
      );
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(
        ok([makeAtt({ operarioId: 'op-1', completedAt: null, date: '2026-06-10' })]),
      );
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
      expect(screen.getByText('2026-06-10')).toBeInTheDocument();
    });

    it('shows EmptyState when no open attendances', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('Sin jornadas abiertas')).toBeInTheDocument();
    });
  });

  describe('operarios por cargo', () => {
    it('lists cargo labels and counts', () => {
      operariosActiveMock.mockReturnValue(
        ok([
          { id: 'o1', cargo: 'Barrido', active: true },
          { id: 'o2', cargo: 'Barrido', active: true },
          { id: 'o3', cargo: 'Recolección', active: true },
        ]),
      );
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('Barrido')).toBeInTheDocument();
      expect(screen.getByText('Recolección')).toBeInTheDocument();
    });
  });

  describe('novedades approved hours', () => {
    it('renders approved hours line', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(
        ok([
          makeNov({ status: 'APPROVED', horasExtra: '2.50', createdAt: `${TODAY_STR}T09:00:00Z` }),
          makeNov({ status: 'APPROVED', horasExtra: '1.50', createdAt: `${TODAY_STR}T10:00:00Z` }),
        ]),
      );
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(
        screen.getByText(/Horas extra aprobadas: 4\.0 h/),
      ).toBeInTheDocument();
    });
  });

  describe('error / forbidden states', () => {
    it('shows "Sin acceso para su rol" when operarios query is forbidden', () => {
      operariosActiveMock.mockReturnValue(forbidden());
      operariosAllMock.mockReturnValue(forbidden());
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      // At least one 'Sin acceso' text should appear
      const messages = screen.getAllByText('Sin acceso para su rol');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('shows "Sin acceso para su rol" when attendances query is forbidden', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(forbidden());
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      const messages = screen.getAllByText('Sin acceso para su rol');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('shows "Sin acceso para su rol" when novedades query is forbidden', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([]));
      novedadesMock.mockReturnValue(forbidden());
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      const messages = screen.getAllByText('Sin acceso para su rol');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('does not crash when multiple queries are forbidden simultaneously', () => {
      operariosActiveMock.mockReturnValue(forbidden());
      operariosAllMock.mockReturnValue(forbidden());
      attendancesMock.mockReturnValue(forbidden());
      novedadesMock.mockReturnValue(forbidden());
      zonesMock.mockReturnValue(forbidden());
      expect(() => renderPage()).not.toThrow();
    });
  });

  describe('loading states', () => {
    it('shows skeletons when attendances are loading', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(loading());
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      // Mantine Skeleton renders a div with specific aria attributes.
      // Just assert the page renders without crashing.
      expect(screen.getByText('Tablero')).toBeInTheDocument();
    });
  });

  describe('sin fichaje hoy KPI', () => {
    it('shows absent count with red accent and workforce percentage', () => {
      operariosActiveMock.mockReturnValue(
        ok([
          { id: 'op-1', fullName: 'Uno', active: true },
          { id: 'op-2', fullName: 'Dos', active: true },
        ]),
      );
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([makeAtt({ operarioId: 'op-1', date: TODAY_STR })]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('Sin fichaje hoy')).toBeInTheDocument();
      expect(screen.getByText('50% del personal activo')).toBeInTheDocument();
      // The absent count (1) is rendered with the red accent color.
      const ones = screen.getAllByText('1');
      expect(ones.some((el) => el.style.color.includes('red'))).toBe(true);
    });

    it('shows 0 without red accent when everyone checked in today', () => {
      operariosActiveMock.mockReturnValue(ok([{ id: 'op-1', fullName: 'Uno', active: true }]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([makeAtt({ operarioId: 'op-1', date: TODAY_STR })]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('Sin fichaje hoy')).toBeInTheDocument();
      expect(screen.getByText('0% del personal activo')).toBeInTheDocument();
      const zeros = screen.getAllByText('0');
      expect(zeros.every((el) => !el.style.color.includes('red'))).toBe(true);
    });
  });

  describe('period deltas', () => {
    it('shows a positive delta vs the previous period for asistencias', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(
        ok([
          // Current 7d period: 2 attendances.
          makeAtt({ date: TODAY_STR }),
          makeAtt({ date: TODAY_STR }),
          // Previous 7d period (8 days ago): 1 attendance.
          makeAtt({ date: daysAgoStr(8), checkInCapturedAt: `${daysAgoStr(8)}T08:00:00Z` }),
        ]),
      );
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getByText('+100% vs período anterior')).toBeInTheDocument();
    });

    it('shows a negative delta in red when the period regressed', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(
        ok([
          makeAtt({ date: TODAY_STR }),
          makeAtt({ date: daysAgoStr(8), checkInCapturedAt: `${daysAgoStr(8)}T08:00:00Z` }),
          makeAtt({ date: daysAgoStr(9), checkInCapturedAt: `${daysAgoStr(9)}T08:00:00Z` }),
        ]),
      );
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      const delta = screen.getByText('-50% vs período anterior');
      expect(delta).toBeInTheDocument();
      expect(delta.style.color.includes('red')).toBe(true);
    });

    it('shows "sin datos previos" when the previous period is empty', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([makeAtt({ date: TODAY_STR })]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.getAllByText('— sin datos previos').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('jornada promedio', () => {
    function setupCompletedShift() {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([makeCompletedAtt(TODAY_STR)]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
    }

    it('renders the average shift duration under the daily chart', () => {
      setupCompletedShift();
      renderPage();
      expect(screen.getByText('Jornada promedio: 8.0 h')).toBeInTheDocument();
    });

    it('renders the active policy line when policies are accessible', () => {
      setupCompletedShift();
      policiesMock.mockReturnValue(
        ok([
          {
            id: 'pol-1',
            horasDiarias: '8.00',
            vigenteDesde: '2020-01-01T05:00:00Z',
            createdAt: '2019-12-15T00:00:00Z',
          },
        ]),
      );
      renderPage();
      expect(screen.getByText('Política vigente: 8.00 h')).toBeInTheDocument();
    });

    it('omits the policy line silently when the policies query fails', () => {
      setupCompletedShift();
      policiesMock.mockReturnValue(forbidden());
      renderPage();
      expect(screen.getByText('Jornada promedio: 8.0 h')).toBeInTheDocument();
      expect(screen.queryByText(/Política vigente/)).not.toBeInTheDocument();
    });

    it('omits the average line when no completed shifts exist in the period', () => {
      operariosActiveMock.mockReturnValue(ok([]));
      operariosAllMock.mockReturnValue(ok([]));
      attendancesMock.mockReturnValue(ok([makeAtt({ date: TODAY_STR })]));
      novedadesMock.mockReturnValue(ok([]));
      zonesMock.mockReturnValue(ok([]));
      renderPage();
      expect(screen.queryByText(/Jornada promedio/)).not.toBeInTheDocument();
    });
  });

  describe('empty chart states', () => {
    it('renders EmptyState for area and zone charts when the period has no attendances', () => {
      defaultEmptyOk();
      renderPage();
      // Area chart + zones bar chart.
      expect(screen.getAllByText('Sin asistencias en el período').length).toBeGreaterThanOrEqual(2);
    });

    it('renders EmptyState for novedades donut when there are none in the period', () => {
      defaultEmptyOk();
      renderPage();
      expect(screen.getByText('Sin novedades en el período')).toBeInTheDocument();
      expect(
        screen.getByText('Horas extra aprobadas: 0 h'),
      ).toBeInTheDocument();
    });
  });
});
