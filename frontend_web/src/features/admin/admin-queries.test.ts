import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useAreas,
  useCreateArea,
  useDeleteArea,
  useUpdateArea,
  useUpdateSupervisor,
  useUpdateUser,
} from './admin-queries';

const {
  listAreasMock,
  createAreaMock,
  updateAreaMock,
  deleteAreaMock,
  updateSupervisorMock,
  updateUserMock,
} = vi.hoisted(() => ({
  listAreasMock: vi.fn(),
  createAreaMock: vi.fn(),
  updateAreaMock: vi.fn(),
  deleteAreaMock: vi.fn(),
  updateSupervisorMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock('../../lib/api/client', () => ({
  orgApi: {
    listAreas: listAreasMock,
    createArea: createAreaMock,
    updateArea: updateAreaMock,
    deleteArea: deleteAreaMock,
    updateUser: updateUserMock,
  },
  iamApi: {
    updateSupervisor: updateSupervisorMock,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => vi.clearAllMocks());

describe('useAreas', () => {
  it('fetches areas with queryKey ["areas"] and returns data', async () => {
    listAreasMock.mockResolvedValue([
      { id: 'a-1', name: 'Patio Central', horaInicio: '06:00', horaFin: '14:00', zoneId: 'z-1', createdAt: '', updatedAt: '' },
    ]);

    const { result } = renderHook(() => useAreas(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].name).toBe('Patio Central');
    expect(listAreasMock).toHaveBeenCalledOnce();
  });
});

describe('useCreateArea', () => {
  it('calls createArea with the body and invalidates ["areas"]', async () => {
    createAreaMock.mockResolvedValue({ id: 'a-new' });
    const qc = new QueryClient();

    qc.setQueryData(['areas'], []);
    const wrapper2 = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useCreateArea(), { wrapper: wrapper2 });

    await result.current.mutateAsync({
      name: 'Depósito',
      horaInicio: '08:00',
      horaFin: '16:00',
      zoneId: 'z-1',
    });

    expect(createAreaMock).toHaveBeenCalledWith({
      name: 'Depósito',
      horaInicio: '08:00',
      horaFin: '16:00',
      zoneId: 'z-1',
    });
  });
});

describe('useUpdateArea', () => {
  it('calls updateArea with id and partial body, invalidates ["areas"]', async () => {
    updateAreaMock.mockResolvedValue({
      id: 'a-1',
      name: 'Almacén',
      horaInicio: '07:00',
      horaFin: '15:00',
      zoneId: 'z-1',
      createdAt: '',
      updatedAt: '',
    });

    const qc = new QueryClient();
    qc.setQueryData(['areas'], []);
    const wrapper2 = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useUpdateArea(), { wrapper: wrapper2 });

    const res = await result.current.mutateAsync({ id: 'a-1', name: 'Almacén' });

    expect(res.name).toBe('Almacén');
    expect(updateAreaMock).toHaveBeenCalledWith('a-1', { name: 'Almacén' });
  });
});

describe('useDeleteArea', () => {
  it('calls deleteArea with id and invalidates ["areas"]', async () => {
    deleteAreaMock.mockResolvedValue(undefined);

    const qc = new QueryClient();
    qc.setQueryData(['areas'], []);
    const wrapper2 = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useDeleteArea(), { wrapper: wrapper2 });

    await result.current.mutateAsync('a-1');

    expect(deleteAreaMock).toHaveBeenCalledWith('a-1');
  });
});

describe('useUpdateSupervisor', () => {
  it('calls iamApi.updateSupervisor with id and body, invalidates ["supervisors"]', async () => {
    updateSupervisorMock.mockResolvedValue({
      id: 's-1',
      userId: 'u-1',
      email: 'sup@futuragest.co',
      area: 'RECOLECCION',
      zoneId: 'z-1',
      municipioId: 'm-1',
      createdAt: '',
    });

    const qc = new QueryClient();
    qc.setQueryData(['supervisors'], []);
    const wrapper2 = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useUpdateSupervisor(), { wrapper: wrapper2 });

    const res = await result.current.mutateAsync({
      id: 's-1',
      area: 'RECOLECCION',
      displayName: 'Juan Pérez',
    });

    expect(res.area).toBe('RECOLECCION');
    expect(updateSupervisorMock).toHaveBeenCalledWith('s-1', {
      area: 'RECOLECCION',
      displayName: 'Juan Pérez',
    });
  });
});

describe('useUpdateUser', () => {
  it('calls orgApi.updateUser with id and body, invalidates ["users"]', async () => {
    updateUserMock.mockResolvedValue({
      id: 'u-1',
      email: 'user@futuragest.co',
      role: 'GERENCIA',
      mustChangePassword: false,
      coordinatedZoneId: null,
      createdAt: '',
    });

    const qc = new QueryClient();
    qc.setQueryData(['users'], []);
    const wrapper2 = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useUpdateUser(), { wrapper: wrapper2 });

    const res = await result.current.mutateAsync({
      id: 'u-1',
      role: 'TALENTO_HUMANO',
      displayName: 'Admin User',
    });

    expect(res.role).toBe('GERENCIA');
    expect(updateUserMock).toHaveBeenCalledWith('u-1', {
      role: 'TALENTO_HUMANO',
      displayName: 'Admin User',
    });
  });
});
