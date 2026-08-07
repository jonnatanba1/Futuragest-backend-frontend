import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api/client';

export const inventoryKeys = {
  all: ['inventory'] as const,
  products: ['inventory', 'products'] as const,
  locations: ['inventory', 'locations'] as const,
  assignees: ['inventory', 'assignees'] as const,
  balances: ['inventory', 'balances'] as const,
  alerts: ['inventory', 'alerts'] as const,
  movements: ['inventory', 'movements'] as const,
  reviews: ['inventory', 'reviews'] as const,
  shipments: ['inventory', 'shipments'] as const,
  counts: ['inventory', 'counts'] as const,
  reconciliation: ['inventory', 'reconciliation'] as const,
};

function useInventoryMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useInventoryProducts() {
  return useQuery({ queryKey: inventoryKeys.products, queryFn: inventoryApi.listProducts, staleTime: 30_000 });
}

export function useInventoryLocations() {
  return useQuery({ queryKey: inventoryKeys.locations, queryFn: inventoryApi.listLocations, staleTime: 30_000 });
}

export function useInventoryAssignees(enabled = true) {
  return useQuery({ queryKey: inventoryKeys.assignees, queryFn: inventoryApi.listAssignees, enabled });
}

export function useInventoryBalances() {
  return useQuery({ queryKey: inventoryKeys.balances, queryFn: inventoryApi.listBalances });
}

export function useInventoryAlerts() {
  return useQuery({ queryKey: inventoryKeys.alerts, queryFn: inventoryApi.listAlerts });
}

export function useInventoryMovements() {
  return useInfiniteQuery({
    queryKey: inventoryKeys.movements,
    queryFn: ({ pageParam }) => inventoryApi.listMovements(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useInventoryReviews(enabled = true) {
  return useQuery({ queryKey: inventoryKeys.reviews, queryFn: inventoryApi.listReviews, enabled, retry: false });
}

export function useInventoryShipments() {
  return useQuery({ queryKey: inventoryKeys.shipments, queryFn: inventoryApi.listShipments });
}

export function useInventoryCounts() {
  return useQuery({ queryKey: inventoryKeys.counts, queryFn: inventoryApi.listCounts });
}

export function useInventoryReconciliation(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.reconciliation,
    queryFn: inventoryApi.reconciliation,
    enabled,
    retry: false,
  });
}

export function useCreateProduct() { return useInventoryMutation(inventoryApi.createProduct); }
export function useUpdateProduct() {
  return useInventoryMutation((input: { id: string; name?: string; active?: boolean }) => {
    const { id, ...body } = input;
    return inventoryApi.updateProduct(id, body);
  });
}
export function useAddProductUnit() {
  return useInventoryMutation((input: { id: string; unitCode: string; factorToBase: string }) => {
    const { id, ...body } = input;
    return inventoryApi.addProductUnit(id, body);
  });
}
export function useCreateLocation() { return useInventoryMutation(inventoryApi.createLocation); }
export function useUpdateLocation() {
  return useInventoryMutation((input: { id: string; name?: string; active?: boolean; inventoryEnabled?: boolean }) => {
    const { id, ...body } = input;
    return inventoryApi.updateLocation(id, body);
  });
}
export function useAssignLocation() {
  return useInventoryMutation((input: {
    id: string;
    userId: string;
    supervisorId?: string;
    role: 'CUSTODIAN' | 'RECEIVER' | 'COUNTER';
  }) => {
    const { id, ...body } = input;
    return inventoryApi.assignLocation(id, body);
  });
}
export function useSetMinimum() { return useInventoryMutation(inventoryApi.setMinimum); }
export function useResolveCommand() {
  return useInventoryMutation((input: {
    id: string;
    clientCommandId: string;
    action: 'APPROVE' | 'DISMISS';
    reason: string;
    locationId?: string;
  }) => {
    const { id, ...body } = input;
    return inventoryApi.resolveCommand(id, body);
  });
}
export function useReverseMovement() {
  return useInventoryMutation((input: { id: string; clientCommandId: string; reason: string }) => {
    const { id, ...body } = input;
    return inventoryApi.reverseMovement(id, body);
  });
}
export function useCreateShipment() { return useInventoryMutation(inventoryApi.createShipment); }
export function useDispatchShipment() {
  return useInventoryMutation((input: { id: string; clientCommandId: string }) =>
    inventoryApi.dispatchShipment(input.id, input.clientCommandId),
  );
}
export function useCancelShipment() { return useInventoryMutation(inventoryApi.cancelShipment); }
export function useReceiveShipment() {
  return useInventoryMutation((input: Parameters<typeof inventoryApi.receiveShipment>) =>
    inventoryApi.receiveShipment(...input),
  );
}
export function useResolveShipmentDiscrepancy() {
  return useInventoryMutation((input: { id: string; clientCommandId: string; reason: string }) => {
    const { id, ...body } = input;
    return inventoryApi.resolveShipmentDiscrepancy(id, body);
  });
}
export function useReturnShipment() {
  return useInventoryMutation((input: { id: string; clientCommandId: string; reason: string }) => {
    const { id, ...body } = input;
    return inventoryApi.returnShipment(id, body);
  });
}
export function useOpenCount() { return useInventoryMutation(inventoryApi.openCount); }
export function useSaveCountLines() {
  return useInventoryMutation((input: { id: string; lines: Array<{ productId: string; countedBase: string }> }) =>
    inventoryApi.saveCountLines(input.id, input.lines),
  );
}
export function useSubmitCount() { return useInventoryMutation(inventoryApi.submitCount); }
export function useApproveCount() {
  return useInventoryMutation((input: { id: string; clientCommandId: string; reason: string }) => {
    const { id, ...body } = input;
    return inventoryApi.approveCount(id, body);
  });
}
export function useImportOpeningBalances() { return useInventoryMutation(inventoryApi.importOpeningBalances); }
