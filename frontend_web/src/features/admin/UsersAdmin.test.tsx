import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersAdmin } from './UsersAdmin';

const {
  usersMock,
  provisionMock,
  createSupMock,
  updateUserMock,
  updateSupMock,
  supsMock,
} = vi.hoisted(() => ({
  usersMock: vi.fn(),
  provisionMock: vi.fn(),
  createSupMock: vi.fn(),
  updateUserMock: vi.fn(),
  updateSupMock: vi.fn(),
  supsMock: vi.fn(),
}));

vi.mock('../operarios/operario-queries', () => ({
  useSupervisors: supsMock,
  useZones: () => ({
    data: [
      { id: 'z1', name: 'Zona A', createdAt: '', updatedAt: '' },
    ],
  }),
  useMunicipios: () => ({
    data: [
      { id: 'm1', name: 'Apartadó', zoneId: 'z1', createdAt: '', updatedAt: '' },
      { id: 'm2', name: 'Otro', zoneId: 'z9', createdAt: '', updatedAt: '' },
    ],
  }),
}));

vi.mock('./admin-queries', () => ({
  useUsers: usersMock,
  useProvisionUser: () => ({ mutateAsync: provisionMock, isPending: false }),
  useAssignCoordinador: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutateAsync: updateUserMock, isPending: false }),
  useCreateSupervisor: () => ({ mutateAsync: createSupMock, isPending: false }),
  useUpdateSupervisor: () => ({ mutateAsync: updateSupMock, isPending: false }),
}));

function renderAdmin() {
  return render(
    <MantineProvider>
      <UsersAdmin />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('UsersAdmin', () => {
  it('lists users with role and never shows passwordHash', () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u1',
          email: 'admin@futuragest.co',
          role: 'SYSTEM_ADMIN',
          mustChangePassword: false,
          coordinatedZoneId: null,
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderAdmin();
    expect(screen.getByText('admin@futuragest.co')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM_ADMIN')).toBeInTheDocument();
  });

  it('shows detail drawer on row click with edit button', async () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u1',
          email: 'admin@futuragest.co',
          role: 'SYSTEM_ADMIN',
          mustChangePassword: false,
          coordinatedZoneId: null,
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByText('admin@futuragest.co'));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByText('SYSTEM_ADMIN')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /asignar zona/i })).toBeNull();
  });

  it('shows "Asignar zona" button in drawer for COORDINADOR', async () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u2',
          email: 'coord@futuragest.co',
          role: 'COORDINADOR',
          mustChangePassword: false,
          coordinatedZoneId: 'z1',
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByText('coord@futuragest.co'));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByRole('button', { name: /asignar zona/i })).toBeInTheDocument();
  });

  it('opens edit modal from drawer and submits update', async () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u1',
          email: 'admin@futuragest.co',
          role: 'GERENCIA',
          mustChangePassword: false,
          coordinatedZoneId: null,
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    updateUserMock.mockResolvedValue({
      id: 'u1',
      email: 'admin@futuragest.co',
      role: 'TALENTO_HUMANO',
      mustChangePassword: false,
      coordinatedZoneId: null,
      createdAt: '',
    });
    const user = userEvent.setup();
    renderAdmin();

    // Click row → drawer opens
    await user.click(screen.getByText('admin@futuragest.co'));
    const drawer = await screen.findByRole('dialog');

    // Click Edit in drawer
    await user.click(within(drawer).getByRole('button', { name: 'Editar' }));
    const editDialog = await screen.findByRole('dialog', { name: /editar usuario/i });

    // Change role
    const roleInput = within(editDialog).getByLabelText(/rol/i);
    await user.click(roleInput);
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText('TALENTO_HUMANO'));

    await user.click(within(editDialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({
        id: 'u1',
        displayName: undefined,
        role: 'TALENTO_HUMANO',
      }),
    );
  });

  it('provisions a user through the modal', async () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    usersMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    provisionMock.mockResolvedValue({ id: 'new' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /crear usuario/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^correo electrónico/i), 'lider@futuragest.co');
    await user.type(within(dialog).getByLabelText(/contraseña temporal/i), 'Temp1234!');
    await user.click(within(dialog).getByLabelText(/^rol/i));
    await user.click(await screen.findByRole('option', { name: 'LIDER_OPERATIVO' }));
    await user.click(within(dialog).getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(provisionMock).toHaveBeenCalledWith({
        email: 'lider@futuragest.co',
        password: 'Temp1234!',
        role: 'LIDER_OPERATIVO',
        displayName: undefined,
      }),
    );
  });

  // --- Supervisor merge tests ---

  it('shows supervisor area, municipio, and zona columns for SUPERVISOR users', () => {
    supsMock.mockReturnValue({
      data: [
        {
          id: 's1',
          userId: 'u1',
          email: 'sup@futuragest.co',
          area: 'BARRIDO',
          zoneId: 'z1',
          municipioId: 'm1',
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u1',
          email: 'sup@futuragest.co',
          role: 'SUPERVISOR',
          mustChangePassword: false,
          coordinatedZoneId: null,
          createdAt: '',
        },
        {
          id: 'u2',
          email: 'admin@futuragest.co',
          role: 'SYSTEM_ADMIN',
          mustChangePassword: false,
          coordinatedZoneId: null,
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderAdmin();

    // Supervisor row shows area badge
    expect(screen.getByText('BARRIDO')).toBeInTheDocument();
    // Supervisor row shows municipio name
    expect(screen.getByText('Apartadó')).toBeInTheDocument();
    // Supervisor row shows zone name
    expect(screen.getByText('Zona A')).toBeInTheDocument();
    // Regular user row shows dashes for supervisor-only columns
    const nonSupDashes = screen.getAllByText('—');
    expect(nonSupDashes.length).toBeGreaterThanOrEqual(3);
  });

  it('shows supervisor fields in detail drawer', async () => {
    supsMock.mockReturnValue({
      data: [
        {
          id: 's1',
          userId: 'u1',
          email: 'sup@futuragest.co',
          area: 'BARRIDO',
          zoneId: 'z1',
          municipioId: 'm1',
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u1',
          email: 'sup@futuragest.co',
          role: 'SUPERVISOR',
          mustChangePassword: false,
          coordinatedZoneId: null,
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByText('sup@futuragest.co'));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByText('SUPERVISOR')).toBeInTheDocument();
    expect(within(drawer).getByText('BARRIDO')).toBeInTheDocument();
    expect(within(drawer).getByText('Zona A')).toBeInTheDocument();
    expect(within(drawer).getByText('Apartadó')).toBeInTheDocument();
  });

  it('opens supervisor edit modal from drawer and submits update', async () => {
    supsMock.mockReturnValue({
      data: [
        {
          id: 's1',
          userId: 'u1',
          email: 'sup@futuragest.co',
          area: 'BARRIDO',
          zoneId: 'z1',
          municipioId: 'm1',
          displayName: 'Juan',
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    usersMock.mockReturnValue({
      data: [
        {
          id: 'u1',
          email: 'sup@futuragest.co',
          role: 'SUPERVISOR',
          mustChangePassword: false,
          coordinatedZoneId: null,
          displayName: 'Juan',
          createdAt: '',
        },
      ],
      isLoading: false,
      isError: false,
    });
    updateSupMock.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      email: 'sup@futuragest.co',
      area: 'RECOLECCION',
      zoneId: 'z1',
      municipioId: 'm1',
      createdAt: '',
    });
    const user = userEvent.setup();
    renderAdmin();

    // Click row → drawer opens
    await user.click(screen.getByText('sup@futuragest.co'));
    const drawer = await screen.findByRole('dialog');

    // Click Edit in drawer
    await user.click(within(drawer).getByRole('button', { name: 'Editar' }));

    // Supervisor edit modal opens
    const editDialog = await screen.findByRole('dialog', { name: /editar supervisor/i });
    expect(within(editDialog).getByRole('button', { name: /guardar/i })).toBeInTheDocument();

    // Submit without changes (pre-filled values are valid)
    await user.click(within(editDialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updateSupMock).toHaveBeenCalledWith({
        id: 's1',
        area: 'BARRIDO',
        municipioId: 'm1',
        displayName: 'Juan',
      }),
    );
  });

  it('creates a supervisor with cascading zone → municipio', async () => {
    supsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    usersMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    createSupMock.mockResolvedValue({ id: 's-new' });
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: /crear usuario/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^correo electrónico/i), 'nuevo@futuragest.co');
    await user.type(within(dialog).getByLabelText(/contraseña temporal/i), 'Temp1234!');

    // Select SUPERVISOR role → extra fields should appear
    await user.click(within(dialog).getByLabelText(/^rol/i));
    await user.click(await screen.findByRole('option', { name: 'SUPERVISOR' }));

    // Supervisor-specific fields should now be visible
    await user.click(within(dialog).getByLabelText(/^área/i));
    await user.click(await screen.findByRole('option', { name: 'BARRIDO' }));
    await user.click(within(dialog).getByLabelText(/^zona/i));
    await user.click(await screen.findByRole('option', { name: 'Zona A' }));
    await user.click(within(dialog).getByLabelText(/^municipio/i));
    await user.click(await screen.findByRole('option', { name: 'Apartadó' }));

    await user.click(within(dialog).getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(createSupMock).toHaveBeenCalledWith({
        email: 'nuevo@futuragest.co',
        password: 'Temp1234!',
        area: 'BARRIDO',
        zoneId: 'z1',
        municipioId: 'm1',
        displayName: undefined,
      }),
    );
  });
});
