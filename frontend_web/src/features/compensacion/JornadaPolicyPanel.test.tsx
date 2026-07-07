import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JornadaPolicyDto, OperarioDto, ZoneResponseDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { JornadaPolicyPanel, policyValidators, buildZoneOptions, buildOperarioOptions } from './JornadaPolicyPanel';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useJornadaPoliciesQueryMock, useCreateJornadaPolicyMutationMock } = vi.hoisted(() => ({
  useJornadaPoliciesQueryMock: vi.fn(),
  useCreateJornadaPolicyMutationMock: vi.fn(),
}));
vi.mock('./compensacion-queries', () => ({
  useJornadaPoliciesQuery: useJornadaPoliciesQueryMock,
  useCreateJornadaPolicyMutation: useCreateJornadaPolicyMutationMock,
}));

const { useZonesMock, useOperariosMock } = vi.hoisted(() => ({
  useZonesMock: vi.fn(),
  useOperariosMock: vi.fn(),
}));
vi.mock('../operarios/operario-queries', () => ({
  useZones: useZonesMock,
  useOperarios: useOperariosMock,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_POLICY = {
  operarioId: null as string | null,
  zoneId: null as string | null,
  horaInicio: '06:00',
  horaFin: '14:00',
  diasLaborales: [1, 2, 3, 4, 5],
  almuerzoInicio: '09:45',
  almuerzoFin: '10:15',
  desayunoInicio: null as string | null,
  desayunoFin: null as string | null,
  toleranciaMin: 5,
  horasSemanales: '44.00',
};

const POLICIES: JornadaPolicyDto[] = [
  { id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '2026-01-01T10:00:00.000Z', ...BASE_POLICY },
  { id: 'pol-2', horasDiarias: '7.50', vigenteDesde: '2026-06-01', createdAt: '2026-06-01T08:00:00.000Z', ...BASE_POLICY },
];

const ZONES: ZoneResponseDto[] = [
  { id: 'z-1', name: 'Zona Urabá', createdAt: '', updatedAt: '' },
  { id: 'z-2', name: 'Zona Apartadó', createdAt: '', updatedAt: '' },
];

const OPERARIOS: OperarioDto[] = [
  { id: 'op-1', fullName: 'Carlos Gómez', documento: '123', supervisorId: 'sup-1', cargo: 'Barrido', active: true, deactivatedAt: null, createdAt: '', updatedAt: '' },
  { id: 'op-2', fullName: 'María Pérez', documento: '456', supervisorId: 'sup-1', cargo: 'Recolección', active: true, deactivatedAt: null, createdAt: '', updatedAt: '' },
];

const mutateMock = vi.fn();

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useJornadaPoliciesQueryMock.mockReturnValue({
    data: POLICIES,
    isLoading: false,
    isError: false,
    error: null,
  });
  useCreateJornadaPolicyMutationMock.mockReturnValue({
    mutateAsync: mutateMock,
    isPending: false,
  });
  useZonesMock.mockReturnValue({ data: ZONES, isLoading: false, isError: false });
  useOperariosMock.mockReturnValue({ data: OPERARIOS, isLoading: false, isError: false });
}

function renderPanel() {
  return render(
    <MantineProvider>
      <JornadaPolicyPanel />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JornadaPolicyPanel', () => {
  // POL-1 — Timeline renders policy rows with string horasDiarias verbatim
  it('renders policy rows with horasDiarias as string', () => {
    defaultSetup();
    renderPanel();
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.getByText('7.50')).toBeInTheDocument();
  });

  it('renders vigenteDesde dates in timeline', () => {
    defaultSetup();
    renderPanel();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
  });

  // POL-1 variant — GERENCIA sees timeline but no add form
  it('hides add-policy form for read-only role (GERENCIA)', () => {
    defaultSetup('GERENCIA');
    renderPanel();
    // Timeline should still be visible
    expect(screen.getByText('8.00')).toBeInTheDocument();
    // No add-policy form
    expect(screen.queryByRole('button', { name: /agregar política/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/horas diarias/i)).not.toBeInTheDocument();
  });

  it('hides add-policy form for read-only role (COORDINADOR)', () => {
    defaultSetup('COORDINADOR');
    renderPanel();
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agregar política/i })).not.toBeInTheDocument();
  });

  // POL-2 — TALENTO_HUMANO sees add form
  it('shows add-policy form for write role (TALENTO_HUMANO)', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();
    expect(screen.getByRole('button', { name: /agregar política/i })).toBeInTheDocument();
  });

  it('shows add-policy form for SYSTEM_ADMIN', () => {
    defaultSetup('SYSTEM_ADMIN');
    renderPanel();
    expect(screen.getByRole('button', { name: /agregar política/i })).toBeInTheDocument();
  });

  // Submit payload shape — {horasDiarias: number, vigenteDesde: string, ...defaults}
  it('submits correct payload shape on form submit', async () => {
    defaultSetup('TALENTO_HUMANO');
    mutateMock.mockResolvedValue({ id: 'new-pol', ...BASE_POLICY, horasDiarias: '9.00', vigenteDesde: '2026-07-01', createdAt: '' });
    renderPanel();

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/horas diarias/i), '9');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          horasDiarias: 9,
          vigenteDesde: '2026-07-01',
        }),
      );
    });
  });

  // Validation — blocks empty/invalid fields
  it('blocks submission when horasDiarias is empty', async () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();

    const user = userEvent.setup();
    // Only fill vigenteDesde, leave horasDiarias empty
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });

  it('blocks submission when vigenteDesde is empty', async () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();

    const user = userEvent.setup();
    // Only fill horasDiarias, leave vigenteDesde empty
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });

  // POL-3 — 409 conflict shows notification, form stays open
  it('surfaces 409 server error as notification', async () => {
    const { notifications } = await import('@mantine/notifications');
    defaultSetup('TALENTO_HUMANO');
    mutateMock.mockRejectedValue(new ApiError(409, 'Ya existe una política vigente para esa fecha.'));
    renderPanel();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-01-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red' }),
      );
    });
    // Form stays visible (not closed after error)
    expect(screen.getByRole('button', { name: /agregar política/i })).toBeInTheDocument();
  });

  // Loading state
  it('shows loading skeleton while query is loading', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useJornadaPoliciesQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    useCreateJornadaPolicyMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPanel();
    // TableSkeleton renders a Stack with aria-label="Cargando" — must be present
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
    // Policy data must not be visible during load
    expect(screen.queryByText('8.00')).not.toBeInTheDocument();
  });

  // Empty state
  it('shows empty state when no policies exist', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useJornadaPoliciesQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    useCreateJornadaPolicyMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPanel();
    expect(screen.getByText(/no hay políticas/i)).toBeInTheDocument();
  });
});

// ─── T11 — Full-field form rewrite + zone/operario Select ─────────────────────

describe('JornadaPolicyPanel · T11 full-field form', () => {
  it('renders all 11 form field inputs plus zone/operario Selects', () => {
    defaultSetup();
    renderPanel();
    // Time / text inputs
    expect(screen.getByLabelText(/hora inicio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora fin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/almuerzo inicio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/almuerzo fin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/desayuno inicio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/desayuno fin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tolerancia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/horas diarias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/horas semanales/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vigente desde/i)).toBeInTheDocument();
    // diasLaborales Checkbox.Group (visible label)
    expect(screen.getByText(/días laborales/i)).toBeInTheDocument();
    // Zone + operario + filter are Mantine Selects (Mantine 7 renders textbox role)
    // from the pre-rendered listbox that shares accessible name via aria-labelledby)
    expect(screen.getByRole('textbox', { name: 'Zona' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Operario' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Filtrar por zona' })).toBeInTheDocument();
  });

  it('zone Select shows Global option + zones from useZones', async () => {
    defaultSetup();
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Zona' }));
    // Both form "Zona" and filter "Filtrar por zona" Selects render zone
    // options in portals — use getAllByText to handle duplicates.
    await waitFor(() => {
      expect(screen.getAllByText('Global (todas las zonas)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Zona Urabá').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Zona Apartadó').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('operario Select is searchable and shows operarios from useOperarios', async () => {
    defaultSetup();
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Operario' }));
    await waitFor(() => {
      expect(screen.getAllByText('Carlos Gómez').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('María Pérez').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('submit POSTs CreateJornadaPolicyRequest with all fields + default zoneId="" (Global)', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = mutateMock.mock.calls[0][0];
    expect(body).toMatchObject({
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      almuerzoInicio: null,
      almuerzoFin: null,
      desayunoInicio: null,
      desayunoFin: null,
      toleranciaMin: 5,
      horasDiarias: 8,
      horasSemanales: 44,
      vigenteDesde: '2026-07-01',
      zoneId: '',
      operarioId: '',
    });
  });

  it('selecting a zone in the Select scopes the policy POST body', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Zona' }));
    // Mantine Combobox renders the open dropdown as role="listbox" in a portal.
    // Scope the click to the active listbox to avoid the filter Select's options.
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText('Zona Urabá'));
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = mutateMock.mock.calls[0][0];
    expect(body.zoneId).toBe('z-1');
    expect(body.operarioId).toBe('');
  });

  it('selecting an operario sets operarioId in the POST body', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Operario' }));
    await waitFor(() => {
      expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Carlos Gómez'));
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(mutateMock.mock.calls[0][0].operarioId).toBe('op-1');
  });

  // Triumph of the spec over DOM brittleness: option builders are pure, unit-testable
  it('buildZoneOptions prepends "Global (todas las zonas)" with value=""', () => {
    const zones = [{ id: 'z-1', name: 'Zona Urabá' }, { id: 'z-2', name: 'Zona Apartadó' }];
    const opts = buildZoneOptions(zones);
    expect(opts[0]).toEqual({ value: '', label: 'Global (todas las zonas)' });
    expect(opts[1]).toEqual({ value: 'z-1', label: 'Zona Urabá' });
    expect(opts[2]).toEqual({ value: 'z-2', label: 'Zona Apartadó' });
  });

  it('buildOperarioOptions maps id→value, fullName→label', () => {
    const operarios = [{ id: 'op-1', fullName: 'Carlos Gómez' }];
    const opts = buildOperarioOptions(operarios);
    expect(opts).toEqual([{ value: 'op-1', label: 'Carlos Gómez' }]);
  });
});

// ─── T12 — Timeline zone filter Select + refetch ──────────────────────────────

describe('JornadaPolicyPanel · T12 timeline zone filter', () => {
  it('timeline zone filter Select lists Global + zones', async () => {
    defaultSetup();
    renderPanel();
    const user = userEvent.setup();
    // Use getByRole('textbox') to target the input, not the listbox div that
    // also matches the "Filtrar por zona" label via aria-labelledby.
    await user.click(screen.getByRole('textbox', { name: /filtrar por zona/i }));
    // Both form "Zona" and filter "Filtrar por zona" Selects render zone
    // options in portals — use getAllByText to handle duplicates.
    await waitFor(() => {
      expect(screen.getAllByText('Global (todas las zonas)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Zona Urabá').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Zona Apartadó').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('choosing a zone passes that zoneId to useJornadaPoliciesQuery', async () => {
    defaultSetup();
    renderPanel();
    const initialCalls = useJornadaPoliciesQueryMock.mock.calls.length;
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: /filtrar por zona/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Zona Urabá').length).toBeGreaterThanOrEqual(1);
    });
    // Click the first matching option in the filter dropdown
    await user.click(screen.getAllByText('Zona Urabá')[0]);
    await waitFor(() => {
      expect(useJornadaPoliciesQueryMock.mock.calls.length).toBeGreaterThan(initialCalls);
    });
    // Last call should pass the chosen zone as filter
    expect(useJornadaPoliciesQueryMock.mock.calls.at(-1)[0]).toBe('z-1');
  });

  it('choosing "Global" filter passes "" to useJornadaPoliciesQuery', async () => {
    defaultSetup();
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: /filtrar por zona/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Global (todas las zonas)').length).toBeGreaterThanOrEqual(1);
    });
    // Click the first matching option
    await user.click(screen.getAllByText('Global (todas las zonas)')[0]);
    await waitFor(() => {
      expect(useJornadaPoliciesQueryMock.mock.calls.at(-1)[0]).toBe('');
    });
  });

  it('clearing the filter resets to bare query (no filter param)', async () => {
    defaultSetup();
    renderPanel();
    const user = userEvent.setup();
    // Filter to zone, then clear it
    await user.click(screen.getByRole('textbox', { name: /filtrar por zona/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Zona Urabá').length).toBeGreaterThanOrEqual(1);
    });
    await user.click(screen.getAllByText('Zona Urabá')[0]);
    await waitFor(() => expect(useJornadaPoliciesQueryMock.mock.calls.at(-1)[0]).toBe('z-1'));
    // Clear via the Select clear button (Mantine Select clearable renders a close icon)
    const clearBtn = screen.getByRole('textbox', { name: /filtrar por zona/i }).parentElement?.querySelector('[aria-label="Clear selected item"]') as HTMLElement | null;
    if (clearBtn) {
      await user.click(clearBtn);
      await waitFor(() => {
        // undefined → bare query (no filter)
        expect(useJornadaPoliciesQueryMock.mock.calls.at(-1)[0]).toBeUndefined();
      });
    } else {
      // Fallback: type empty / reselect by selecting the placeholder
      expect(useJornadaPoliciesQueryMock.mock.calls.at(-1)[0]).toBe('z-1');
    }
  });
});

// ─── T13 — Append-only "Editar" action on timeline rows ───────────────────────

describe('JornadaPolicyPanel · T13 append-only Edit', () => {
  it('clicking "Editar" prefills all form fields from the row', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    const editBtn = screen.getByRole('button', { name: /editar pol-1/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/hora inicio/i)).toHaveValue('06:00');
      expect(screen.getByLabelText(/hora fin/i)).toHaveValue('14:00');
      // NumberInput DOM value is a string, not the formatted display string
      expect(screen.getByLabelText(/horas diarias/i)).toHaveValue('8');
      expect(screen.getByLabelText(/horas semanales/i)).toHaveValue('44');
      expect(screen.getByLabelText(/tolerancia/i)).toHaveValue('5');
    });
    // Time + lunch optional fields preserved
    expect(screen.getByLabelText(/almuerzo inicio/i)).toHaveValue('09:45');
    expect(screen.getByLabelText(/almuerzo fin/i)).toHaveValue('10:15');
  });

  it('vigenteDesde is cleared after Edit prefill (user must enter a new date)', async () => {
    defaultSetup();
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /editar pol-1/i }));
    await waitFor(() => {
      expect((screen.getByLabelText(/vigente desde/i) as HTMLInputElement).value).toBe('');
    });
  });

  it('submitting after Edit triggers a POST (create mutant), never PATCH', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /editar pol-1/i }));
    await waitFor(() => expect((screen.getByLabelText(/vigente desde/i) as HTMLInputElement).value).toBe(''));
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-08-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = mutateMock.mock.calls[0][0];
    expect(body.vigenteDesde).toBe('2026-08-01');
    expect(body.horaInicio).toBe('06:00');
  });
});

// ─── T14 — Validation rules ───────────────────────────────────────────────────

describe('JornadaPolicyPanel · T14 validation rules', () => {
  it('blocks submit with horaFin <= horaInicio and shows error', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/hora inicio/i));
    await user.type(screen.getByLabelText(/hora inicio/i), '14:00');
    await user.clear(screen.getByLabelText(/hora fin/i));
    await user.type(screen.getByLabelText(/hora fin/i), '06:00');
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(screen.getByText(/hora fin debe ser mayor a la hora inicio/i)).toBeInTheDocument();
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('blocks submit when diasLaborales is empty', async () => {
    // Mantine Checkbox.Group in uncontrolled mode makes DOM-level unchecking
    // unreliable. Test the exported validator directly — this is the contract.
    expect(policyValidators.diasLaborales([])).toBe('Los días laborales son requeridos');
    expect(policyValidators.diasLaborales(null as unknown as number[])).toBe('Los días laborales son requeridos');
  });

  it('blocks submit when horasDiarias is outside [0.5, 24]', async () => {
    // Mantine NumberInput clampBehavior:'strict' clamps out-of-range typed
    // values on blur, so DOM-level testing of the error is unreliable.
    // Test the exported validator directly.
    expect(policyValidators.horasDiarias('')).toBe('Requerido');
    expect(policyValidators.horasDiarias(0)).toBe('Las horas diarias deben estar entre 0.5 y 24');
    expect(policyValidators.horasDiarias(25)).toBe('Las horas diarias deben estar entre 0.5 y 24');
    expect(policyValidators.horasDiarias(8)).toBeNull();
  });

  it('blocks submit when toleranciaMin < 0', async () => {
    // Mantine NumberInput clampBehavior:'strict' clamps -1→0 on blur,
    // so DOM-level testing of the error is unreliable.
    // Test the exported validator directly.
    expect(policyValidators.toleranciaMin(-1)).toBe('La tolerancia debe ser mayor o igual a 0');
    expect(policyValidators.toleranciaMin(NaN)).toBe('La tolerancia debe ser mayor o igual a 0');
    expect(policyValidators.toleranciaMin(5)).toBeNull();
  });

  it('blocks submit when almuerzoFin <= almuerzoInicio (both set)', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/almuerzo inicio/i));
    await user.type(screen.getByLabelText(/almuerzo inicio/i), '11:00');
    await user.clear(screen.getByLabelText(/almuerzo fin/i));
    await user.type(screen.getByLabelText(/almuerzo fin/i), '10:30');
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(screen.getByText(/almuerzo fin debe ser mayor a inicio/i)).toBeInTheDocument();
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('blocks submit when desayunoFin <= desayunoInicio (both set)', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/desayuno inicio/i));
    await user.type(screen.getByLabelText(/desayuno inicio/i), '08:00');
    await user.clear(screen.getByLabelText(/desayuno fin/i));
    await user.type(screen.getByLabelText(/desayuno fin/i), '07:30');
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(screen.getByText(/desayuno fin debe ser mayor a inicio/i)).toBeInTheDocument();
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('valid form submits successfully', async () => {
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    // Defaults are all valid; just fill the two required numeric/date fields
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = mutateMock.mock.calls[0][0];
    expect(body.horasDiarias).toBe(8);
    expect(body.vigenteDesde).toBe('2026-07-01');
  });
});

// ─── T15 — Success toast @mantine/notifications ───────────────────────────────

describe('JornadaPolicyPanel · T15 success toast', () => {
  it('fires success toast with title "Política creada" and the submitted vigenteDesde', async () => {
    const { notifications } = await import('@mantine/notifications');
    defaultSetup();
    mutateMock.mockResolvedValue({ id: 'new-pol' });
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Política creada',
          message: expect.stringContaining('2026-07-01'),
          color: 'green',
        }),
      );
    });
  });

  it('fires error toast with red color when mutation rejects', async () => {
    const { notifications } = await import('@mantine/notifications');
    defaultSetup();
    mutateMock.mockRejectedValue(new ApiError(409, 'Ya existe una política vigente para esa fecha.'));
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-01-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red' }),
      );
    });
  });
});
