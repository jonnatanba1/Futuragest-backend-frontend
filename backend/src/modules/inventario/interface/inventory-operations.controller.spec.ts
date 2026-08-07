import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROLES_KEY } from '../../iam/interface/roles.decorator';
import type { InventoryOperationsUseCase } from '../application/inventory-operations.use-case';
import { InventoryOperationError } from '../domain/inventory-operations';
import { InventoryOperationsController } from './inventory-operations.controller';

const HANDLERS = [
  'products',
  'createProduct',
  'updateProduct',
  'addUnit',
  'locations',
  'createLocation',
  'assignLocation',
  'stockMinimum',
  'recordStockEntry',
  'balances',
  'movements',
  'alerts',
  'reviews',
  'resolve',
  'reverse',
  'reconciliation',
  'createShipment',
  'updateShipment',
  'dispatchShipment',
  'cancelShipment',
  'shipments',
  'shipment',
  'receiveShipment',
  'returnShipment',
  'resolveShipmentDiscrepancy',
  'openCount',
  'saveCountLines',
  'submitCount',
  'approveCount',
  'counts',
  'count',
  'importOpeningBalances',
] as const;

function operations(): jest.Mocked<InventoryOperationsUseCase> {
  const methods = new Map<PropertyKey, jest.Mock>();
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (!methods.has(property)) methods.set(property, jest.fn().mockResolvedValue([]));
        return methods.get(property);
      },
    },
  ) as jest.Mocked<InventoryOperationsUseCase>;
}

describe('InventoryOperationsController', () => {
  it.each(HANDLERS)('%s declares explicit inventory roles', (handler) => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      InventoryOperationsController.prototype[handler],
    );
    expect(roles).toEqual(expect.any(Array));
    expect(roles.length).toBeGreaterThan(0);
    expect(roles).not.toContain('TALENTO_HUMANO');
    expect(roles).not.toContain('LIDER_OPERATIVO');
  });

  it('keeps catalog administration restricted to COMPRAS and SYSTEM_ADMIN', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, InventoryOperationsController.prototype.createProduct),
    ).toEqual(['COMPRAS', 'SYSTEM_ADMIN']);
  });

  it('records central stock entries through the use case', async () => {
    const service = operations();
    const body = { clientCommandId: 'stock-entry-1', locationId: 'central-1', productId: 'product-1', unitVersionId: 'unit-1', quantity: '1.5', note: 'Supplier delivery' };

    await new InventoryOperationsController(service).recordStockEntry(body);

    expect(service.recordStockEntry).toHaveBeenCalledWith(body);
  });

  it('passes a product filter when listing movements', async () => {
    const service = operations();

    await new InventoryOperationsController(service).movements('cursor-1', 'product-1');

    expect(service.listMovements).toHaveBeenCalledWith('cursor-1', 'product-1');
  });

  it.each([
    ['NOT_FOUND', NotFoundException],
    ['SEPARATION_OF_DUTIES', ForbiddenException],
    ['IDEMPOTENCY_KEY_REUSED', ConflictException],
  ] as const)('maps %s to the expected HTTP exception', async (code, expected) => {
    const service = operations();
    service.listProducts.mockRejectedValue(new InventoryOperationError(code, 'failed'));
    await expect(new InventoryOperationsController(service).products()).rejects.toBeInstanceOf(
      expected,
    );
  });
});
