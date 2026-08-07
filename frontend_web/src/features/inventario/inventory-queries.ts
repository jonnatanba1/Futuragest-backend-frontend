import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type {
  InventoryBalance,
  InventoryCount,
  InventoryLocation,
  InventoryMovement,
  InventoryProduct,
  Shipment,
} from './inventory.types';

export const INVENTORY_KEYS = {
  all: ['inventario'] as const,
  balances: () => [...INVENTORY_KEYS.all, 'balances'] as const,
  movements: (filters?: Record<string, unknown>) => [...INVENTORY_KEYS.all, 'movements', filters] as const,
  products: () => [...INVENTORY_KEYS.all, 'products'] as const,
  locations: () => [...INVENTORY_KEYS.all, 'locations'] as const,
  shipments: () => [...INVENTORY_KEYS.all, 'shipments'] as const,
  counts: () => [...INVENTORY_KEYS.all, 'counts'] as const,
};

export function useInventoryBalancesQuery() {
  return useQuery<InventoryBalance[]>({
    queryKey: INVENTORY_KEYS.balances(),
    queryFn: async () => {
      try {
        return await api.get<InventoryBalance[]>('/inventario/balances');
      } catch {
        return [];
      }
    },
  });
}

export function useInventoryMovementsQuery(filters?: { type?: string; locationId?: string }) {
  return useQuery<InventoryMovement[]>({
    queryKey: INVENTORY_KEYS.movements(filters),
    queryFn: async () => {
      try {
        const queryParams = new URLSearchParams();
        if (filters?.type) queryParams.set('type', filters.type);
        if (filters?.locationId) queryParams.set('locationId', filters.locationId);
        const url = `/inventario/movements${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
        return await api.get<InventoryMovement[]>(url);
      } catch {
        return [];
      }
    },
  });
}

export function useInventoryProductsQuery() {
  return useQuery<InventoryProduct[]>({
    queryKey: INVENTORY_KEYS.products(),
    queryFn: async () => {
      try {
        return await api.get<InventoryProduct[]>('/inventario/products');
      } catch {
        return [];
      }
    },
  });
}

export function useInventoryLocationsQuery() {
  return useQuery<InventoryLocation[]>({
    queryKey: INVENTORY_KEYS.locations(),
    queryFn: async () => {
      try {
        return await api.get<InventoryLocation[]>('/inventario/locations');
      } catch {
        return [];
      }
    },
  });
}

export function useShipmentsQuery() {
  return useQuery<Shipment[]>({
    queryKey: INVENTORY_KEYS.shipments(),
    queryFn: async () => {
      try {
        return await api.get<Shipment[]>('/inventario/shipments');
      } catch {
        return [];
      }
    },
  });
}

export function useInventoryCountsQuery() {
  return useQuery<InventoryCount[]>({
    queryKey: INVENTORY_KEYS.counts(),
    queryFn: async () => {
      try {
        return await api.get<InventoryCount[]>('/inventario/counts');
      } catch {
        return [];
      }
    },
  });
}

export function useCreateShipmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { originLocationId: string; destinationLocationId: string; items: unknown[] }) =>
      api.post<Shipment>('/inventario/shipments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.shipments() });
    },
  });
}

export function useDispatchShipmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipmentId: string) =>
      api.post<Shipment>(`/inventario/shipments/${shipmentId}/dispatch`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.shipments() });
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.balances() });
    },
  });
}
