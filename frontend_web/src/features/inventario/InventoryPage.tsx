import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  FileInput,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure, useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconClipboardCheck,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconScale,
  IconTruckDelivery,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { inventoryApi } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';
import {
  useAddProductUnit,
  useApproveCount,
  useCancelShipment,
  useCreateProduct,
  useCreateShipment,
  useDispatchShipment,
  useImportOpeningBalances,
  useInventoryAlerts,
  useInventoryAssignees,
  useInventoryBalances,
  useInventoryCounts,
  useInventoryLocations,
  useInventoryMovements,
  useInventoryProducts,
  useInventoryReconciliation,
  useInventoryReviews,
  useInventoryShipments,
  useOpenCount,
  useResolveCommand,
  useResolveShipmentDiscrepancy,
  useReturnShipment,
  useReverseMovement,
  useRecordStockEntry,
  useSaveCountLines,
  useSetMinimum,
  useSubmitCount,
  useUpdateProduct,
} from './inventory-queries';
import { clearInventoryCommandId, stableInventoryCommandId } from './inventory-command-id';
import { automaticFactorToBase, INVENTORY_UNIT_OPTIONS } from './inventory-unit-options';
import { availableProductIdsAtLocation, stockByProduct } from './inventory-stock';
import {
  eligibleShipmentReceivers,
  isOperationalInventoryLocation,
} from './inventory-location-policy';
import type { InventoryCount, InventoryLocation, InventoryReviewCommand, InventoryShipment } from './inventory.types';

const tableContainment: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 800px',
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}

function success(message: string) {
  notifications.show({ color: 'green', title: 'Inventario actualizado', message });
}

function failure(error: unknown) {
  notifications.show({ color: 'red', title: 'Operación rechazada', message: errorMessage(error) });
}

function quantity(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 }).format(parsed);
}

function stockLocationLabel(location: InventoryLocation) {
  if (location.type === 'MUNICIPAL_WAREHOUSE') {
    return location.municipio?.name ?? location.name;
  }
  if (location.type === 'CENTRAL_WAREHOUSE') {
    return 'Bodega central: ' + location.name;
  }
  return location.name;
}

function movementTraceLabel(type: string) {
  const labels: Record<string, string> = {
    STOCK_ENTRY: 'Ingreso de compra',
    OPENING_BALANCE: 'Saldo inicial',
    TRANSFER_IN: 'Ingreso por traslado',
    TRANSFER_OUT: 'Salida por envío',
    FIELD_ISSUE: 'Salida de campo',
    FIELD_RETURN: 'Retorno de campo',
    DAMAGE_OR_LOSS: 'Daño o pérdida',
    COUNT_ADJUSTMENT_IN: 'Ajuste positivo',
    COUNT_ADJUSTMENT_OUT: 'Ajuste negativo',
    REVERSAL: 'Reverso',
  };
  return labels[type] ?? type;
}

interface QueryState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

function QueryBoundary({ queries, children }: { queries: QueryState[]; children: React.ReactNode }) {
  if (queries.some((query) => query.isLoading)) {
    return <Group justify="center" py="xl"><Loader /><Text>Cargando datos de inventario…</Text></Group>;
  }

  const failed = queries.find((query) => query.isError);
  if (failed) {
    return (
      <Alert color="red" title="No fue posible cargar el inventario" icon={<IconAlertTriangle size={18} />}>
        <Stack gap="sm">
          <Text size="sm">{errorMessage(failed.error)} Los valores no se reemplazaron por ceros para evitar decisiones con información incompleta.</Text>
          <Button variant="light" color="red" w="fit-content" onClick={() => void Promise.all(queries.map((query) => query.refetch()))}>
            Reintentar
          </Button>
        </Stack>
      </Alert>
    );
  }

  return children;
}

function EmptyTableRow({ columns, message }: { columns: number; message: string }) {
  return <Table.Tr><Table.Td colSpan={columns}><Text ta="center" c="dimmed" py="md">{message}</Text></Table.Td></Table.Tr>;
}

function InventoryOverview({ canReconcile, canReview }: { canReconcile: boolean; canReview: boolean }) {
  const balances = useInventoryBalances();
  const alerts = useInventoryAlerts();
  const shipments = useInventoryShipments();
  const reviews = useInventoryReviews(canReview);
  const reconciliation = useInventoryReconciliation(canReconcile);

  const activeShipments = shipments.data?.filter((shipment) =>
    ['DISPATCHED', 'PARTIALLY_RECEIVED', 'DISCREPANCY_REVIEW'].includes(shipment.status),
  ).length ?? 0;

  const overviewQueries = [balances, alerts, shipments, ...(canReview ? [reviews] : []), ...(canReconcile ? [reconciliation] : [])];

  return (
    <QueryBoundary queries={overviewQueries}>
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: canReview ? 4 : 3 }}>
        <Card withBorder>
          <Text c="dimmed" size="sm">Combinaciones con saldo</Text>
          <Text fw={700} size="xl">{balances.data?.length ?? 0}</Text>
        </Card>
        <Card withBorder>
          <Text c="dimmed" size="sm">Alertas de mínimo</Text>
          <Text fw={700} size="xl" c={alerts.data?.length ? 'red' : 'green'}>{alerts.data?.length ?? 0}</Text>
        </Card>
        <Card withBorder>
          <Text c="dimmed" size="sm">Envíos activos</Text>
          <Text fw={700} size="xl">{activeShipments}</Text>
        </Card>
        {canReview && <Card withBorder>
          <Text c="dimmed" size="sm">Eventos por revisar</Text>
          <Text fw={700} size="xl" c={reviews.data?.length ? 'orange' : undefined}>{reviews.data?.length ?? 0}</Text>
        </Card>}
      </SimpleGrid>

      {canReconcile && reconciliation.data && (
        <Alert
          color={reconciliation.data.mismatches.length ? 'red' : 'green'}
          icon={<IconScale size={18} />}
          title="Reconciliación ledger/balance"
        >
          {reconciliation.data.mismatches.length === 0
            ? `${reconciliation.data.movementCount} movimientos reconciliados sin diferencias.`
            : `${reconciliation.data.mismatches.length} diferencias requieren intervención.`}
        </Alert>
      )}

      <Card withBorder style={tableContainment}>
        <Title order={3} size="h4" mb="md">Stock actual</Title>
        <ScrollArea>
          <Table striped highlightOnHover miw={720}>
            <Table.Thead>
              <Table.Tr><Table.Th>Municipio / origen</Table.Th><Table.Th>SKU</Table.Th><Table.Th>Producto</Table.Th><Table.Th ta="right">Saldo base</Table.Th><Table.Th>Actualizado</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {balances.data?.length === 0 && <EmptyTableRow columns={5} message="Todavía no hay saldos registrados." />}
              {balances.data?.map((balance) => (
                <Table.Tr key={balance.id}>
                  <Table.Td>{stockLocationLabel(balance.location)}</Table.Td>
                  <Table.Td>{balance.product.sku}</Table.Td>
                  <Table.Td>{balance.product.name}</Table.Td>
                  <Table.Td ta="right">{quantity(balance.quantityBase)}</Table.Td>
                  <Table.Td>{new Date(balance.updatedAt).toLocaleString('es-CO')}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>

      <Card withBorder style={tableContainment}>
        <Title order={3} size="h4" mb="md">Alertas de reposición</Title>
        <ScrollArea>
          <Table striped highlightOnHover miw={720}>
            <Table.Thead>
              <Table.Tr><Table.Th>Municipio / bodega</Table.Th><Table.Th>Producto</Table.Th><Table.Th ta="right">Disponible</Table.Th><Table.Th ta="right">Mínimo</Table.Th><Table.Th ta="right">Faltante</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {alerts.data?.length === 0 && <EmptyTableRow columns={5} message="No hay productos por debajo del mínimo." />}
              {alerts.data?.map((alert) => (
                <Table.Tr key={`${alert.location.id}:${alert.product.id}`}>
                  <Table.Td>{alert.location.municipio?.name ?? alert.location.name}</Table.Td>
                  <Table.Td>{alert.product.sku} · {alert.product.name}</Table.Td>
                  <Table.Td ta="right">{quantity(alert.quantityBase)}</Table.Td>
                  <Table.Td ta="right">{quantity(alert.minimumBase)}</Table.Td>
                  <Table.Td ta="right" c="red" fw={600}>{quantity(alert.shortageBase)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>
    </Stack>
    </QueryBoundary>
  );
}

function StockEntryModal({
  opened,
  onClose,
  locations,
  products,
  initialProductId,
}: {
  opened: boolean;
  onClose: () => void;
  locations: InventoryLocation[];
  products: Array<{ id: string; sku: string; name: string; active: boolean; unitVersions: Array<{ id: string; unitCode: string; validUntil: string | null }> }>;
  initialProductId?: string;
}) {
  const entry = useRecordStockEntry();
  const centralLocation = locations.find((item) => isOperationalInventoryLocation(item) && item.type === 'CENTRAL_WAREHOUSE');
  const form = useForm({ initialValues: { locationId: centralLocation?.id ?? '', productId: initialProductId ?? '', unitVersionId: '', quantity: '', note: '' } });
  const product = products.find((item) => item.id === form.values.productId);

  return <Modal opened={opened} onClose={onClose} title="Registrar entrada de compras" zIndex={300}>
    <form onSubmit={form.onSubmit((values) => {
      const operationKey = 'stock-entry:' + values.locationId + ':' + values.productId + ':' + values.unitVersionId + ':' + values.quantity + ':' + values.note.trim();
      entry.mutate({ ...values, note: values.note.trim() || undefined, clientCommandId: stableInventoryCommandId(operationKey, values) }, {
        onSuccess: () => { clearInventoryCommandId(operationKey); success('Entrada de stock registrada.'); onClose(); },
        onError: failure,
      });
    })}>
      <Stack>
        <Text size="sm" c="dimmed">Registra una compra o reposicion sin costo para una bodega central.</Text>
        <TextInput readOnly label="Bodega central" value={centralLocation ? `${centralLocation.code} - ${centralLocation.name}` : ''} description="Destino fijo de las compras y reposiciones." />
        <Select searchable required label="Producto" data={products.filter((item) => item.active).map((item) => ({ value: item.id, label: `${item.sku} - ${item.name}` }))} {...form.getInputProps('productId')} onChange={(value) => { form.setFieldValue('productId', value ?? ''); form.setFieldValue('unitVersionId', ''); }} />
        <Select required disabled={!product} label="Unidad" data={(product?.unitVersions ?? []).filter((unit) => !unit.validUntil).map((unit) => ({ value: unit.id, label: unit.unitCode }))} {...form.getInputProps('unitVersionId')} />
        <NumberInput
          required
          label="Cantidad"
          description="Admite hasta 6 decimales. Ejemplo: 1,5."
          min={0.000001}
          step={0.01}
          decimalScale={6}
          decimalSeparator=","
          value={form.values.quantity}
          onChange={(value) => form.setFieldValue('quantity', String(value).replace(',', '.'))}
        />
        <Textarea label="Nota" description="Opcional: proveedor, remision u observacion." autosize minRows={3} maxRows={8} {...form.getInputProps('note')} />
        <Button type="submit" loading={entry.isPending}>Registrar ingreso</Button>
      </Stack>
    </form>
  </Modal>;
}

function MasterDataPanel({ canAdmin }: { canAdmin: boolean }) {
  const products = useInventoryProducts();
  const locations = useInventoryLocations();
  const balances = useInventoryBalances();
  const shipments = useInventoryShipments();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const addUnit = useAddProductUnit();
  const setMinimum = useSetMinimum();
  const [productOpened, productModal] = useDisclosure(false);
  const [unitProductId, setUnitProductId] = useState<string | null>(null);
  const [entryProductId, setEntryProductId] = useState<string | null>(null);
  const [entryOpened, setEntryOpened] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [minimumOpened, setMinimumOpened] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const productForm = useForm({ initialValues: { sku: '', name: '', baseUnitCode: 'UND' } });
  const unitForm = useForm({ initialValues: { unitCode: '', factorToBase: '' } });
  const minimumForm = useForm({ initialValues: { locationId: '', productId: '', quantityBase: '0' } });
  const productMovements = useInventoryMovements(detailProductId ?? undefined);

  const centralStock = stockByProduct(balances.data ?? [], 'CENTRAL_WAREHOUSE');
  const municipalStock = stockByProduct(balances.data ?? [], 'MUNICIPAL_WAREHOUSE');
  const visibleProducts = (products.data ?? []).filter((product) => {
    const query = productSearch.trim().toLocaleLowerCase('es-CO');
    return !query || product.sku.toLocaleLowerCase('es-CO').includes(query) || product.name.toLocaleLowerCase('es-CO').includes(query);
  });
  const detailProduct = products.data?.find((product) => product.id === detailProductId) ?? null;
  const unitProduct = products.data?.find((product) => product.id === unitProductId) ?? null;
  const traceRows = productMovements.data?.pages.flatMap((page) => page.items) ?? [];
  const productShipments = (shipments.data ?? []).filter((shipment) => shipment.items.some((item) => item.productId === detailProductId));
  const automaticUnitFactor = unitProduct ? automaticFactorToBase(unitProduct.baseUnitCode, unitForm.values.unitCode) : null;

  return (
    <QueryBoundary queries={canAdmin ? [products, locations, balances] : [products, balances]}>
      <Stack gap="lg">
        {canAdmin && (
          <Group justify="flex-end">
            <Group>
              <Button variant="default" onClick={() => { setEntryProductId(null); setEntryOpened(true); }}>Nuevo ingreso</Button>
              <Button variant="default" onClick={() => setMinimumOpened(true)}>Mínimos por municipio</Button>
              <Button leftSection={<IconPlus size={16} />} onClick={productModal.open}>Nuevo producto</Button>
            </Group>
          </Group>
        )}

        <Card withBorder style={tableContainment}>
          <Group justify="space-between" mb="md"><Title order={3} size="h4">Inventario</Title><Text size="sm" c="dimmed">Selecciona un producto para ver su detalle.</Text></Group>
          <TextInput label="Buscar producto" placeholder="SKU o nombre" value={productSearch} onChange={(event) => setProductSearch(event.currentTarget.value)} mb="md" />
          <ScrollArea>
            <Table striped miw={680}>
              <Table.Thead>
                <Table.Tr><Table.Th>SKU</Table.Th><Table.Th>Producto</Table.Th><Table.Th>Unidades vigentes</Table.Th><Table.Th ta="right">Central</Table.Th><Table.Th ta="right">Municipios</Table.Th><Table.Th>Estado</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {products.data?.length === 0 && <EmptyTableRow columns={6} message="No hay productos registrados." />}
                {products.data && products.data.length > 0 && visibleProducts.length === 0 && <EmptyTableRow columns={6} message="No hay productos que coincidan con la busqueda." />}
                {visibleProducts.map((product) => (
                  <Table.Tr key={product.id}>
                    <Table.Td>{product.sku}</Table.Td>
                    <Table.Td><Button variant="transparent" p={0} onClick={() => setDetailProductId(product.id)}>{product.name}</Button></Table.Td>
                    <Table.Td>{product.unitVersions.filter((unit) => !unit.validUntil).map((unit) => unit.unitCode + ' × ' + unit.factorToBase).join(', ')}</Table.Td>
                    <Table.Td ta="right">{quantity(centralStock[product.id] ?? 0)}</Table.Td>
                    <Table.Td ta="right">{quantity(municipalStock[product.id] ?? 0)}</Table.Td>
                    <Table.Td><Badge color={product.active ? 'green' : 'gray'}>{product.active ? 'Activo' : 'Inactivo'}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>

        {canAdmin && (
          <Modal opened={minimumOpened} onClose={() => setMinimumOpened(false)} title="Mínimos por municipio" zIndex={300}>
            <form onSubmit={minimumForm.onSubmit((values) => setMinimum.mutate(values, {
              onSuccess: () => { success('Mínimo guardado.'); minimumForm.reset(); setMinimumOpened(false); }, onError: failure,
            }))}>
              <Stack>
                <Select
                  label="Municipio"
                  searchable
                  required
                  data={(locations.data ?? [])
                    .filter((item) => isOperationalInventoryLocation(item) && item.type === 'MUNICIPAL_WAREHOUSE')
                    .map((item) => ({ value: item.id, label: item.municipio?.name ?? item.name }))}
                  {...minimumForm.getInputProps('locationId')}
                />
                <Select
                  label="Producto"
                  searchable
                  required
                  data={(products.data ?? []).map((item) => ({ value: item.id, label: item.sku + ' - ' + item.name }))}
                  {...minimumForm.getInputProps('productId')}
                />
                <TextInput label="Stock mínimo" inputMode="decimal" required {...minimumForm.getInputProps('quantityBase')} />
                <Button type="submit" loading={setMinimum.isPending}>Guardar mínimo</Button>
              </Stack>
            </form>
          </Modal>
        )}

        <Modal opened={detailProduct !== null} onClose={() => setDetailProductId(null)} title={detailProduct ? `${detailProduct.sku} - ${detailProduct.name}` : 'Detalle del producto'} size="xl" zIndex={200}>
          <Stack>
            <Text size="sm">Unidad base: {detailProduct?.baseUnitCode}</Text>
            <Text size="sm">Unidades vigentes: {detailProduct?.unitVersions.filter((unit) => !unit.validUntil).map((unit) => unit.unitCode).join(', ')}</Text>
            <SimpleGrid cols={2}>
              <Card withBorder><Text size="xs" c="dimmed">Stock central</Text><Text fw={700}>{quantity(detailProduct ? centralStock[detailProduct.id] ?? 0 : 0)}</Text></Card>
              <Card withBorder><Text size="xs" c="dimmed">Stock municipios</Text><Text fw={700}>{quantity(detailProduct ? municipalStock[detailProduct.id] ?? 0 : 0)}</Text></Card>
            </SimpleGrid>
            <Divider label="Trazabilidad" />
            <Card withBorder>
              <Group justify="space-between" mb="xs"><Text fw={600}>Entradas y salidas</Text>{productMovements.isLoading && <Loader size="xs" />}</Group>
              <ScrollArea mah={220}>
                <Table striped miw={620}>
                  <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Movimiento</Table.Th><Table.Th>Ubicación</Table.Th><Table.Th ta="right">Cantidad</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {!productMovements.isLoading && traceRows.length === 0 && <EmptyTableRow columns={4} message="Aún no hay movimientos para este producto." />}
                    {traceRows.map((movement) => <Table.Tr key={movement.id}><Table.Td>{new Date(movement.createdAt).toLocaleString('es-CO')}</Table.Td><Table.Td><Badge variant="light" color={movement.type.includes('OUT') || movement.type === 'FIELD_ISSUE' || movement.type === 'DAMAGE_OR_LOSS' ? 'red' : 'green'}>{movementTraceLabel(movement.type)}</Badge></Table.Td><Table.Td>{stockLocationLabel(movement.location)}</Table.Td><Table.Td ta="right">{quantity(movement.quantityBase)}</Table.Td></Table.Tr>)}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              {productMovements.hasNextPage && <Button mt="sm" size="xs" variant="default" loading={productMovements.isFetchingNextPage} onClick={() => void productMovements.fetchNextPage()}>Cargar más movimientos</Button>}
            </Card>
            <Card withBorder>
              <Group justify="space-between" mb="xs"><Text fw={600}>Envíos a municipios</Text>{shipments.isLoading && <Loader size="xs" />}</Group>
              <ScrollArea mah={200}>
                <Table striped miw={560}>
                  <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Municipio destino</Table.Th><Table.Th ta="right">Enviado</Table.Th><Table.Th ta="right">Recibido</Table.Th><Table.Th>Estado</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {!shipments.isLoading && productShipments.length === 0 && <EmptyTableRow columns={5} message="Este producto aún no tiene envíos municipales." />}
                    {productShipments.flatMap((shipment) => shipment.items.filter((item) => item.productId === detailProduct?.id).map((item) => <Table.Tr key={item.id}><Table.Td>{new Date(shipment.createdAt).toLocaleString('es-CO')}</Table.Td><Table.Td>{shipment.destinationLocation.municipio?.name ?? shipment.destinationLocation.name}</Table.Td><Table.Td ta="right">{quantity(item.quantityBase)}</Table.Td><Table.Td ta="right">{quantity(item.receivedBase)}</Table.Td><Table.Td><Badge variant="light">{shipment.status.replace(/_/g, ' ')}</Badge></Table.Td></Table.Tr>))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>
            {canAdmin && detailProduct && <Group grow>
              <Button onClick={() => { setEntryProductId(detailProduct.id); setEntryOpened(true); }}>Registrar ingreso</Button>
              <Button variant="default" onClick={() => setUnitProductId(detailProduct.id)}>Agregar unidad</Button>
              <Button
                color={detailProduct.active ? 'red' : 'green'}
                variant="light"
                loading={updateProduct.isPending}
                onClick={() => updateProduct.mutate({ id: detailProduct.id, active: !detailProduct.active }, { onError: failure })}
              >
                {detailProduct.active ? 'Desactivar' : 'Activar'}
              </Button>
            </Group>}
          </Stack>
        </Modal>
        {canAdmin && entryOpened && <StockEntryModal key={entryProductId ?? 'new-entry'} opened={entryOpened} onClose={() => { setEntryOpened(false); setEntryProductId(null); }} locations={locations.data ?? []} products={products.data ?? []} initialProductId={entryProductId ?? undefined} />}
        <Modal opened={productOpened} onClose={productModal.close} title="Nuevo producto" zIndex={300}>
          <form onSubmit={productForm.onSubmit((values) => createProduct.mutate(values, {
            onSuccess: () => { success('Producto creado.'); productForm.reset(); productModal.close(); }, onError: failure,
          }))}>
            <Stack>
              <TextInput label="SKU" required {...productForm.getInputProps('sku')} />
              <TextInput label="Nombre" required {...productForm.getInputProps('name')} />
              <Select label="Unidad base" required data={INVENTORY_UNIT_OPTIONS} {...productForm.getInputProps('baseUnitCode')} />
              <Button type="submit" loading={createProduct.isPending}>Crear</Button>
            </Stack>
          </form>
        </Modal>

        <Modal opened={unitProductId !== null} onClose={() => setUnitProductId(null)} title="Agregar unidad" zIndex={300}>
          <form onSubmit={unitForm.onSubmit((values) => {
            if (!unitProductId) return;
            addUnit.mutate({ id: unitProductId, ...values }, {
              onSuccess: () => { success('Unidad agregada.'); unitForm.reset(); setUnitProductId(null); }, onError: failure,
            });
          })}>
            <Stack>
              <Select
                label="Codigo de unidad"
                required
                data={INVENTORY_UNIT_OPTIONS.filter((unit) => unit.value !== unitProduct?.baseUnitCode)}
                {...unitForm.getInputProps('unitCode')}
                onChange={(value) => {
                  const unitCode = value ?? '';
                  unitForm.setFieldValue('unitCode', unitCode);
                  unitForm.setFieldValue('factorToBase', unitProduct ? automaticFactorToBase(unitProduct.baseUnitCode, unitCode) ?? '' : '');
                }}
              />
              {automaticUnitFactor !== null && <Text size="sm" c="dimmed">Conversión automática: 1 {unitForm.values.unitCode} equivale a {automaticUnitFactor} {unitProduct?.baseUnitCode}.</Text>}
              {unitForm.values.unitCode && automaticUnitFactor === null && <>
                <Text size="sm" c="dimmed">Unidad base: {unitProduct?.baseUnitCode ?? 'sin definir'}.</Text>
                <TextInput label="Equivale a cuantas unidades base" description="Ejemplo: si la unidad base es UND y una CAJA trae 12 UND, escribi 12. Si equivale a una unidad, escribi 1." inputMode="decimal" required {...unitForm.getInputProps('factorToBase')} />
              </>}
              <Button type="submit" loading={addUnit.isPending}>Agregar unidad</Button>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </QueryBoundary>
  );
}

function ShipmentsPanel({ canAdmin }: { canAdmin: boolean }) {
  const shipments = useInventoryShipments();
  const products = useInventoryProducts();
  const locations = useInventoryLocations();
  const balances = useInventoryBalances();
  const assignees = useInventoryAssignees(canAdmin);
  const createShipment = useCreateShipment();
  const dispatchShipment = useDispatchShipment();
  const cancelShipment = useCancelShipment();
  const returnShipment = useReturnShipment();
  const resolveDiscrepancy = useResolveShipmentDiscrepancy();
  const [createOpened, createModal] = useDisclosure(false);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'dispatch' | 'cancel'; shipment: InventoryShipment } | null>(null);
  const [reasonAction, setReasonAction] = useState<{ kind: 'return' | 'discrepancy'; shipment: InventoryShipment } | null>(null);
  const [actionReason, setActionReason] = useState('');

  const form = useForm({
    initialValues: {
      originLocationId: '',
      destinationLocationId: '',
      receiverUserId: '',
      notes: '',
      items: [{ productId: '', unitVersionId: '', quantity: '' }],
    },
  });
  const centralLocation = locations.data?.find((location) => isOperationalInventoryLocation(location) && location.type === 'CENTRAL_WAREHOUSE');
  const destination = locations.data?.find((location) => location.id === form.values.destinationLocationId);
  const receivers = eligibleShipmentReceivers(destination, assignees.data ?? []);
  const availableProducts = availableProductIdsAtLocation(balances.data ?? [], form.values.originLocationId);

  const runConfirmedAction = () => {
    if (!confirmAction) return;
    if (confirmAction.kind === 'cancel') {
      cancelShipment.mutate(confirmAction.shipment.id, {
        onSuccess: () => { success('Envío cancelado.'); setConfirmAction(null); },
        onError: failure,
      });
      return;
    }

    const operationKey = `dispatch:${confirmAction.shipment.id}`;
    dispatchShipment.mutate({
      id: confirmAction.shipment.id,
      clientCommandId: stableInventoryCommandId(operationKey, { shipmentId: confirmAction.shipment.id }),
    }, {
      onSuccess: () => { clearInventoryCommandId(operationKey); success('Envío despachado.'); setConfirmAction(null); },
      onError: failure,
    });
  };

  const runReasonAction = () => {
    if (!reasonAction || !actionReason.trim()) return;
    const operationKey = `${reasonAction.kind}:${reasonAction.shipment.id}`;
    const input = {
      id: reasonAction.shipment.id,
      clientCommandId: stableInventoryCommandId(operationKey, {
        shipmentId: reasonAction.shipment.id,
        reason: actionReason.trim(),
      }),
      reason: actionReason.trim(),
    };
    const options = {
      onSuccess: () => {
        clearInventoryCommandId(operationKey);
        success(reasonAction.kind === 'return' ? 'Remanente retornado.' : 'Discrepancia cerrada.');
        setReasonAction(null);
        setActionReason('');
      },
      onError: failure,
    };
    if (reasonAction.kind === 'return') returnShipment.mutate(input, options);
    else resolveDiscrepancy.mutate(input, options);
  };

  return (
    <QueryBoundary queries={[shipments, products, locations, balances, ...(canAdmin ? [assignees] : [])]}>
    <Stack>
      {canAdmin && <Button leftSection={<IconPlus size={16} />} onClick={() => { form.setFieldValue('originLocationId', centralLocation?.id ?? ''); createModal.open(); }} w="fit-content">Asignar productos a un municipio</Button>}
      <Card withBorder style={tableContainment}>
        <ScrollArea>
          <Table striped highlightOnHover miw={1080}>
            <Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Origen</Table.Th><Table.Th>Municipio destino</Table.Th><Table.Th>Responsable</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Productos</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {shipments.data?.length === 0 && <EmptyTableRow columns={8} message="No hay asignaciones registradas." />}
              {shipments.data?.map((shipment) => (
                <Table.Tr key={shipment.id}>
                  <Table.Td fw={600}>{shipment.code}</Table.Td>
                  <Table.Td>{stockLocationLabel(shipment.originLocation)}</Table.Td>
                  <Table.Td>{shipment.destinationLocation.municipio?.name ?? shipment.destinationLocation.name}</Table.Td>
                  <Table.Td>{shipment.receiver?.displayName ?? shipment.receiver?.email ?? 'Sin asignar'}</Table.Td>
                  <Table.Td><Badge color={shipment.status.includes('DISCREPANCY') ? 'red' : shipment.status === 'RECEIVED' ? 'green' : shipment.status === 'DRAFT' ? 'gray' : 'blue'}>{shipment.status.replace(/_/g, ' ')}</Badge></Table.Td>
                  <Table.Td>{shipment.items.length}</Table.Td>
                  <Table.Td>{new Date(shipment.createdAt).toLocaleString('es-CO')}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      {canAdmin && shipment.status === 'DRAFT' && <>
                        <Button size="xs" onClick={() => setConfirmAction({ kind: 'dispatch', shipment })}>Despachar</Button>
                        <Button size="xs" variant="subtle" color="red" onClick={() => setConfirmAction({ kind: 'cancel', shipment })}>Cancelar</Button>
                      </>}
                      {canAdmin && ['DISPATCHED', 'PARTIALLY_RECEIVED'].includes(shipment.status) && <Button size="xs" variant="subtle" onClick={() => { setActionReason(''); setReasonAction({ kind: 'return', shipment }); }}>Retornar</Button>}
                      {canAdmin && shipment.status === 'DISCREPANCY_REVIEW' && <Button size="xs" color="orange" onClick={() => { setActionReason(''); setReasonAction({ kind: 'discrepancy', shipment }); }}>Resolver</Button>}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>

      <Modal opened={createOpened} onClose={createModal.close} title="Asignar productos a un municipio" size="lg">
        <form onSubmit={form.onSubmit((values) => createShipment.mutate(values, {
          onSuccess: () => { success('Asignación creada. Confirma el envío cuando salga de compras.'); form.reset(); createModal.close(); }, onError: failure,
        }))}>
          <Stack>
            <TextInput readOnly label="Bodega central de origen" value={centralLocation ? `${centralLocation.code} · ${centralLocation.name}` : ''} description="Origen fijo de todas las asignaciones municipales." />
            <Select
              searchable
              required
              label="Municipio destino"
              data={(locations.data ?? []).filter((item) => isOperationalInventoryLocation(item) && item.type === 'MUNICIPAL_WAREHOUSE').map((item) => ({ value: item.id, label: item.municipio?.name ?? item.name }))}
              {...form.getInputProps('destinationLocationId')}
              onChange={(value) => {
                form.setFieldValue('destinationLocationId', value ?? '');
                form.setFieldValue('receiverUserId', '');
              }}
            />
            <Select
              searchable
              required
              disabled={!destination}
              label="Responsable de recibir"
              description="Supervisor del municipio o coordinador de su zona. La recepción se confirma desde el teléfono con biometría."
              data={receivers.map((item) => ({ value: item.id, label: `${item.displayName ?? item.email} · ${item.role === 'SUPERVISOR' ? 'Supervisor' : 'Coordinador de zona'}` }))}
              {...form.getInputProps('receiverUserId')}
            />
            <TextInput label="Notas" {...form.getInputProps('notes')} />
            <Divider label="Productos" />
            {form.values.items.map((line, index) => {
              const product = products.data?.find((item) => item.id === line.productId);
              return <Grid key={index} align="end">
                <Grid.Col span={{ base: 12, sm: 5 }}><Select searchable label="Producto" disabled={!form.values.originLocationId} nothingFoundMessage={form.values.originLocationId ? 'No hay productos con saldo disponible en esta bodega.' : 'Selecciona primero la bodega central.'} data={(products.data ?? []).filter((item) => item.active && availableProducts.has(item.id)).map((item) => ({ value: item.id, label: `${item.sku} ? ${item.name}` }))} {...form.getInputProps(`items.${index}.productId`)} onChange={(value) => { form.setFieldValue(`items.${index}.productId`, value ?? ''); form.setFieldValue(`items.${index}.unitVersionId`, ''); }} /></Grid.Col>
                <Grid.Col span={{ base: 12, sm: 3 }}><Select label="Unidad" data={(product?.unitVersions ?? []).filter((unit) => !unit.validUntil).map((unit) => ({ value: unit.id, label: unit.unitCode }))} {...form.getInputProps(`items.${index}.unitVersionId`)} /></Grid.Col>
                <Grid.Col span={{ base: 9, sm: 3 }}><TextInput label="Cantidad" inputMode="decimal" {...form.getInputProps(`items.${index}.quantity`)} /></Grid.Col>
                <Grid.Col span={{ base: 3, sm: 1 }}><Button color="red" variant="subtle" disabled={form.values.items.length === 1} onClick={() => form.removeListItem('items', index)}>×</Button></Grid.Col>
              </Grid>;
            })}
            <Button variant="default" onClick={() => form.insertListItem('items', { productId: '', unitVersionId: '', quantity: '' })}>Agregar línea</Button>
            <Button type="submit" loading={createShipment.isPending}>Guardar asignación</Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={confirmAction !== null} onClose={() => setConfirmAction(null)} title={confirmAction?.kind === 'dispatch' ? 'Confirmar despacho' : 'Confirmar cancelación'}>
        <Stack>
          <Text>
            {confirmAction?.kind === 'dispatch'
              ? `El envío ${confirmAction.shipment.code} descontará existencias del origen y quedará en tránsito.`
              : `El borrador ${confirmAction?.shipment.code ?? ''} quedará cancelado.`}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAction(null)}>Volver</Button>
            <Button color={confirmAction?.kind === 'cancel' ? 'red' : 'blue'} loading={dispatchShipment.isPending || cancelShipment.isPending} onClick={runConfirmedAction}>Confirmar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={reasonAction !== null} onClose={() => setReasonAction(null)} title={reasonAction?.kind === 'return' ? 'Retornar remanente' : 'Resolver discrepancia'}>
        <Stack>
          <TextInput label="Motivo de auditoría" required value={actionReason} onChange={(event) => setActionReason(event.currentTarget.value)} />
          <Button disabled={!actionReason.trim()} loading={returnShipment.isPending || resolveDiscrepancy.isPending} onClick={runReasonAction}>
            Confirmar
          </Button>
        </Stack>
      </Modal>
    </Stack>
    </QueryBoundary>
  );
}

function CountsPanel({ canApprove }: { canApprove: boolean }) {
  const counts = useInventoryCounts();
  const locations = useInventoryLocations();
  const openCount = useOpenCount();
  const saveLines = useSaveCountLines();
  const submitCount = useSubmitCount();
  const approveCount = useApproveCount();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryCount | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [approveTarget, setApproveTarget] = useState<InventoryCount | null>(null);
  const [approvalReason, setApprovalReason] = useState('');

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const detail = await inventoryApi.getCount(id);
      setSelected(detail);
      setCounted(Object.fromEntries((detail.lines ?? []).map((line) => [line.productId, line.countedBase ?? ''])));
    } catch (error) {
      failure(error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const approveSelectedCount = () => {
    if (!approveTarget || !approvalReason.trim()) return;
    const operationKey = `approve-count:${approveTarget.id}`;
    approveCount.mutate({
      id: approveTarget.id,
      clientCommandId: stableInventoryCommandId(operationKey, {
        countId: approveTarget.id,
        reason: approvalReason.trim(),
      }),
      reason: approvalReason.trim(),
    }, {
      onSuccess: () => {
        clearInventoryCommandId(operationKey);
        success('Conteo ajustado y cerrado.');
        setApproveTarget(null);
        setApprovalReason('');
      },
      onError: failure,
    });
  };

  return (
    <QueryBoundary queries={[counts, locations]}>
    <Stack>
      <Card withBorder>
        <Group align="end">
          <Select searchable label="Ubicación para conteo ciego" value={locationId} onChange={setLocationId} data={(locations.data ?? []).filter(isOperationalInventoryLocation).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} style={{ flex: 1 }} />
          <Button disabled={!locationId} loading={openCount.isPending} onClick={() => locationId && openCount.mutate(locationId, { onSuccess: () => { success('Conteo abierto con snapshot de saldos.'); setLocationId(null); }, onError: failure })}>Abrir conteo</Button>
        </Group>
      </Card>
      <Card withBorder style={tableContainment}>
        {loadingDetail && <Loader size="sm" />}
        <ScrollArea>
          <Table striped miw={760}>
            <Table.Thead><Table.Tr><Table.Th>Ubicación</Table.Th><Table.Th>Contador</Table.Th><Table.Th>Corte</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Líneas</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {counts.data?.length === 0 && <EmptyTableRow columns={6} message="No hay conteos registrados." />}
              {counts.data?.map((count) => <Table.Tr key={count.id}>
              <Table.Td>{count.location.code}</Table.Td><Table.Td>{count.counter.displayName ?? count.counter.email}</Table.Td><Table.Td>{new Date(count.cutoffAt).toLocaleString('es-CO')}</Table.Td><Table.Td><Badge>{count.status}</Badge></Table.Td><Table.Td>{count._count?.lines ?? count.lines?.length ?? 0}</Table.Td>
              <Table.Td><Group gap="xs"><Button size="xs" variant="light" onClick={() => openDetail(count.id)}>Detalle</Button>{canApprove && count.status === 'SUBMITTED' && <Button size="xs" color="green" onClick={() => { setApprovalReason(''); setApproveTarget(count); }}>Aprobar</Button>}</Group></Table.Td>
            </Table.Tr>)}</Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>

      <Modal opened={selected !== null} onClose={() => setSelected(null)} title={`Conteo ${selected?.location.code ?? ''}`} size="xl">
        <Stack>
          {selected?.status === 'OPEN' && <Alert color="blue">Conteo ciego: el saldo esperado permanece oculto hasta enviar.</Alert>}
          <ScrollArea mah={500}>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th>{selected?.status !== 'OPEN' && <Table.Th ta="right">Esperado</Table.Th>}<Table.Th ta="right">Contado</Table.Th>{selected?.status !== 'OPEN' && <Table.Th ta="right">Diferencia</Table.Th>}</Table.Tr></Table.Thead>
              <Table.Tbody>{selected?.lines?.map((line) => <Table.Tr key={line.id}>
                <Table.Td>{line.product.sku} · {line.product.name}</Table.Td>
                {selected.status !== 'OPEN' && <Table.Td ta="right">{quantity(line.expectedBase)}</Table.Td>}
                <Table.Td ta="right">{selected.status === 'OPEN' ? <TextInput aria-label={`Cantidad contada de ${line.product.name}`} inputMode="decimal" value={counted[line.productId] ?? ''} onChange={(event) => setCounted((current) => ({ ...current, [line.productId]: event.currentTarget.value }))} /> : quantity(line.countedBase)}</Table.Td>
                {selected.status !== 'OPEN' && <Table.Td ta="right">{quantity(line.differenceBase)}</Table.Td>}
              </Table.Tr>)}</Table.Tbody>
            </Table>
          </ScrollArea>
          {selected?.status === 'OPEN' && <Group justify="flex-end">
            <Button variant="default" loading={saveLines.isPending} onClick={() => saveLines.mutate({ id: selected.id, lines: (selected.lines ?? []).map((line) => ({ productId: line.productId, countedBase: counted[line.productId] ?? '' })) }, { onSuccess: async () => { success('Conteo guardado.'); await openDetail(selected.id); }, onError: failure })}>Guardar</Button>
            <Button loading={submitCount.isPending} onClick={() => submitCount.mutate(selected.id, { onSuccess: () => { success('Conteo enviado para aprobación.'); setSelected(null); }, onError: failure })}>Enviar conteo</Button>
          </Group>}
        </Stack>
      </Modal>

      <Modal opened={approveTarget !== null} onClose={() => setApproveTarget(null)} title={`Aprobar conteo ${approveTarget?.location.code ?? ''}`}>
        <Stack>
          <Alert color="orange">La aprobación genera movimientos de ajuste inmutables. Verificá las diferencias antes de continuar.</Alert>
          <TextInput label="Motivo de aprobación" required value={approvalReason} onChange={(event) => setApprovalReason(event.currentTarget.value)} />
          <Button color="green" disabled={!approvalReason.trim()} loading={approveCount.isPending} onClick={approveSelectedCount}>Aprobar y ajustar</Button>
        </Stack>
      </Modal>
    </Stack>
    </QueryBoundary>
  );
}

function ReviewsPanel({ canReview }: { canReview: boolean }) {
  const reviews = useInventoryReviews(canReview);
  const locations = useInventoryLocations();
  const resolve = useResolveCommand();
  const [selected, setSelected] = useState<InventoryReviewCommand | null>(null);
  const form = useForm({ initialValues: { action: 'APPROVE' as 'APPROVE' | 'DISMISS', reason: '', locationId: '' } });

  if (!canReview) return <Alert color="blue">Tu rol puede consultar inventario, pero no resolver eventos retenidos.</Alert>;

  return <Stack>
    <QueryBoundary queries={[reviews, locations]}>
    <Card withBorder style={tableContainment}>
      <ScrollArea><Table striped miw={850}><Table.Thead><Table.Tr><Table.Th>Recibido</Table.Th><Table.Th>Actor</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Ubicación</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>
        {reviews.data?.length === 0 && <EmptyTableRow columns={6} message="No hay eventos pendientes de revisión." />}
        {reviews.data?.map((review) => <Table.Tr key={review.id}><Table.Td>{new Date(review.receivedAt).toLocaleString('es-CO')}</Table.Td><Table.Td>{review.actor.displayName ?? review.actor.email}</Table.Td><Table.Td>{review.type}</Table.Td><Table.Td><Badge color="orange">{review.reviewCode}</Badge></Table.Td><Table.Td>{review.location?.code ?? 'Sin resolver'}</Table.Td><Table.Td>{canReview && <Button size="xs" onClick={() => { setSelected(review); form.setValues({ action: 'APPROVE', reason: '', locationId: review.location?.id ?? '' }); }}>Resolver</Button>}</Table.Td></Table.Tr>)}
      </Table.Tbody></Table></ScrollArea>
    </Card>
    </QueryBoundary>
    <Modal opened={selected !== null} onClose={() => setSelected(null)} title="Resolver evento retenido">
      <form onSubmit={form.onSubmit((values) => {
        if (!selected) return;
        const operationKey = `resolve-command:${selected.id}`;
        const payload = { commandId: selected.id, ...values, locationId: values.locationId || undefined };
        resolve.mutate({ id: selected.id, clientCommandId: stableInventoryCommandId(operationKey, payload), ...values, locationId: values.locationId || undefined }, { onSuccess: () => { clearInventoryCommandId(operationKey); success('Evento resuelto con trazabilidad.'); setSelected(null); form.reset(); }, onError: failure });
      })}>
        <Stack><Select label="Decisión" data={[{ value: 'APPROVE', label: 'Aprobar y aplicar' }, { value: 'DISMISS', label: 'Descartar sin efecto' }]} {...form.getInputProps('action')} /><TextInput label="Motivo obligatorio" required {...form.getInputProps('reason')} />{form.values.action === 'APPROVE' && <Select searchable clearable label="Ubicación autorizada" data={(locations.data ?? []).filter(isOperationalInventoryLocation).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} {...form.getInputProps('locationId')} />}<Button type="submit" loading={resolve.isPending}>Confirmar resolución</Button></Stack>
      </form>
    </Modal>
  </Stack>;
}

function MovementsPanel({ canAdmin }: { canAdmin: boolean }) {
  const movements = useInventoryMovements();
  const reverse = useReverseMovement();
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const rows = movements.data?.pages.flatMap((page) => page.items) ?? [];

  const submitReverse = () => {
    if (!reverseTarget || !reason.trim()) return;
    const operationKey = `reverse:${reverseTarget.id}`;
    reverse.mutate({
      id: reverseTarget.id,
      clientCommandId: stableInventoryCommandId(operationKey, { movementId: reverseTarget.id, reason: reason.trim() }),
      reason: reason.trim(),
    }, {
      onSuccess: () => {
        clearInventoryCommandId(operationKey);
        success('Reverso registrado sin editar el movimiento original.');
        setReverseTarget(null);
        setReason('');
      },
      onError: failure,
    });
  };

  return <QueryBoundary queries={[movements]}><Stack>
    <Card withBorder style={tableContainment}><ScrollArea><Table striped miw={980}><Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Ubicación</Table.Th><Table.Th>Producto</Table.Th><Table.Th>Tipo</Table.Th><Table.Th ta="right">Cantidad</Table.Th><Table.Th>Comando</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>
      {rows.length === 0 && <EmptyTableRow columns={7} message="No hay movimientos registrados." />}
      {rows.map((movement) => <Table.Tr key={movement.id}><Table.Td>{new Date(movement.createdAt).toLocaleString('es-CO')}</Table.Td><Table.Td>{movement.location.code}</Table.Td><Table.Td>{movement.product.sku} · {movement.product.name}</Table.Td><Table.Td><Badge variant="light">{movement.type}</Badge></Table.Td><Table.Td ta="right">{quantity(movement.quantityBase)}</Table.Td><Table.Td>{movement.command.clientCommandId.slice(0, 8)}…</Table.Td><Table.Td>{canAdmin && movement.type !== 'REVERSAL' && !movement.sourceMovementId && <Button size="xs" variant="subtle" color="red" onClick={() => { setReason(''); setReverseTarget({ id: movement.id, label: `${movement.product.sku} en ${movement.location.code}` }); }}>Reversar</Button>}</Table.Td></Table.Tr>)}
    </Table.Tbody></Table></ScrollArea></Card>
    {movements.hasNextPage && <Button variant="default" loading={movements.isFetchingNextPage} onClick={() => void movements.fetchNextPage()} w="fit-content">Cargar más movimientos</Button>}
    <Modal opened={reverseTarget !== null} onClose={() => setReverseTarget(null)} title="Confirmar reverso">
      <Stack>
        <Alert color="red">Se creará un movimiento compensatorio para {reverseTarget?.label}. El original permanecerá intacto.</Alert>
        <TextInput label="Motivo de auditoría" required value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
        <Button color="red" disabled={!reason.trim()} loading={reverse.isPending} onClick={submitReverse}>Registrar reverso</Button>
      </Stack>
    </Modal>
  </Stack></QueryBoundary>;
}

function OpeningImportPanel({ canAdmin }: { canAdmin: boolean }) {
  const importer = useImportOpeningBalances();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Array<{ locationCode: string; productSku: string; quantityBase: string }>>([]);
  const [sourceHash, setSourceHash] = useState('');

  const readFile = async (next: File | null) => {
    setFile(next);
    setRows([]);
    setSourceHash('');
    if (!next) return;
    try {
      const bytes = await next.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      setSourceHash(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
      const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      const delimiter = lines[0]?.includes(';') ? ';' : ',';
      const header = lines[0]?.split(delimiter).map((value) => value.trim().toLowerCase()) ?? [];
      const locationIndex = header.findIndex((value) => ['locationcode', 'ubicacion', 'codigo_ubicacion'].includes(value));
      const skuIndex = header.findIndex((value) => ['productsku', 'sku', 'producto'].includes(value));
      const quantityIndex = header.findIndex((value) => ['quantitybase', 'cantidad', 'saldo'].includes(value));
      if ([locationIndex, skuIndex, quantityIndex].some((index) => index < 0)) {
        throw new Error('El CSV requiere columnas locationCode, productSku y quantityBase.');
      }
      setRows(lines.slice(1).map((line) => {
        const cells = line.split(delimiter).map((value) => value.trim());
        return { locationCode: cells[locationIndex], productSku: cells[skuIndex], quantityBase: cells[quantityIndex].replace(',', '.') };
      }));
    } catch (error) {
      failure(error);
      setFile(null);
    }
  };

  if (!canAdmin) return <Alert color="blue">La importación inicial está restringida a COMPRAS y SYSTEM_ADMIN.</Alert>;
  return <Stack>
    <Alert color="orange" icon={<IconAlertTriangle size={18} />}>Solo se permiten saldos de apertura sobre combinaciones sin movimientos previos. Repetir el mismo archivo y comando no duplica registros.</Alert>
    <Card withBorder>
      <Stack>
        <FileInput label="Archivo CSV reconciliado" description="Columnas: locationCode, productSku, quantityBase" value={file} onChange={readFile} accept="text/csv,.csv" clearable />
        {rows.length > 0 && <Text size="sm">{rows.length} filas listas · SHA-256 {sourceHash.slice(0, 12)}…</Text>}
        <Button disabled={!rows.length || !sourceHash} loading={importer.isPending} onClick={() => {
          const operationKey = `opening-import:${sourceHash}`;
          importer.mutate({ clientCommandId: stableInventoryCommandId(operationKey, { sourceHash, rows }), sourceHash, rows }, { onSuccess: () => { clearInventoryCommandId(operationKey); success(`${rows.length} saldos iniciales procesados.`); setFile(null); setRows([]); setSourceHash(''); }, onError: failure });
        }}>Importar saldos iniciales</Button>
      </Stack>
    </Card>
  </Stack>;
}

export function InventoryPage() {
  useDocumentTitle('FuturaGest · Inventario');
  const { user } = useAuth();
  const canAdmin = user?.role === 'COMPRAS' || user?.role === 'SYSTEM_ADMIN';
  const canReview = canAdmin || user?.role === 'COORDINADOR';
  const isPurchasing = user?.role === 'COMPRAS';

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Inventario</Title>
          <Text c="dimmed">Asigna productos a municipios, consulta existencias y atiende alertas.</Text>
        </div>
        <Badge size="lg" variant="light">{user?.role}</Badge>
      </Group>
      <Tabs defaultValue="overview" keepMounted={false}>
        <ScrollArea type="auto">
          <Tabs.List style={{ flexWrap: 'nowrap', minWidth: 'max-content' }}>
            <Tabs.Tab value="overview" leftSection={<IconPackage size={16} />}>{isPurchasing ? 'Stock y alertas' : 'Resumen'}</Tabs.Tab>
            <Tabs.Tab value="catalog">Inventario</Tabs.Tab>
            <Tabs.Tab value="shipments" leftSection={<IconTruckDelivery size={16} />}>{isPurchasing ? 'Asignar a municipios' : 'Envíos'}</Tabs.Tab>
            {!isPurchasing && <>
              <Tabs.Tab value="counts" leftSection={<IconClipboardCheck size={16} />}>Conteos</Tabs.Tab>
              <Tabs.Tab value="reviews" leftSection={<IconAlertTriangle size={16} />}>Revisión</Tabs.Tab>
              <Tabs.Tab value="movements" leftSection={<IconArrowsExchange size={16} />}>Movimientos</Tabs.Tab>
              <Tabs.Tab value="import" leftSection={<IconRefresh size={16} />}>Apertura</Tabs.Tab>
            </>}
          </Tabs.List>
        </ScrollArea>
        <Tabs.Panel value="overview" pt="lg"><InventoryOverview canReconcile={!isPurchasing && canAdmin} canReview={!isPurchasing && canReview} /></Tabs.Panel>
        <Tabs.Panel value="catalog" pt="lg"><MasterDataPanel canAdmin={canAdmin} /></Tabs.Panel>
        <Tabs.Panel value="shipments" pt="lg"><ShipmentsPanel canAdmin={canAdmin} /></Tabs.Panel>
        {!isPurchasing && <>
          <Tabs.Panel value="counts" pt="lg"><CountsPanel canApprove={canReview} /></Tabs.Panel>
          <Tabs.Panel value="reviews" pt="lg"><ReviewsPanel canReview={canReview} /></Tabs.Panel>
          <Tabs.Panel value="movements" pt="lg"><MovementsPanel canAdmin={canAdmin} /></Tabs.Panel>
          <Tabs.Panel value="import" pt="lg"><OpeningImportPanel canAdmin={canAdmin} /></Tabs.Panel>
        </>}
      </Tabs>
    </Stack>
  );
}
