import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Roles } from '../../iam/interface/roles.decorator';
import type { InventoryOperationsUseCase } from '../application/inventory-operations.use-case';
import { InventoryOperationError } from '../domain/inventory-operations';
import { INVENTORY_UNIT_CODES } from '../domain/inventory-unit-catalog';

export const INVENTORY_OPERATIONS_USE_CASE = Symbol('InventoryOperationsUseCase');

const READ_ROLES = ['SUPERVISOR', 'COORDINADOR', 'COMPRAS', 'GERENCIA', 'SYSTEM_ADMIN'] as const;
const ADMIN_ROLES = ['COMPRAS', 'SYSTEM_ADMIN'] as const;
const REVIEW_ROLES = ['COORDINADOR', 'COMPRAS', 'SYSTEM_ADMIN'] as const;
const COUNT_ROLES = ['SUPERVISOR', 'COORDINADOR', 'COMPRAS', 'SYSTEM_ADMIN'] as const;

function translateInventoryError(error: unknown): never {
  if (!(error instanceof InventoryOperationError)) throw error;
  const body = { code: error.code, message: error.message };
  if (error.code === 'NOT_FOUND') throw new NotFoundException(body);
  if (error.code === 'FORBIDDEN' || error.code === 'SEPARATION_OF_DUTIES') {
    throw new ForbiddenException(body);
  }
  if (
    [
      'IDEMPOTENCY_KEY_REUSED',
      'INVALID_STATE',
      'INSUFFICIENT_STOCK',
      'ALREADY_REVERSED',
      'COUNT_ALREADY_OPEN',
      'RECEIPT_EXCEEDS_PENDING',
      'OPENING_ALREADY_EXISTS',
      'DISCREPANCY_PENDING',
      'UNACCOUNTED_REMAINDER',
    ].includes(error.code)
  ) {
    throw new ConflictException(body);
  }
  throw new BadRequestException(body);
}

class CreateProductBody {
  @IsString() sku!: string;
  @IsString() name!: string;
  @IsString() @IsIn(INVENTORY_UNIT_CODES) baseUnitCode!: string;
}

class UpdateProductBody {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class AddProductUnitBody {
  @IsString() @IsIn(INVENTORY_UNIT_CODES) unitCode!: string;
  @IsString() factorToBase!: string;
  @IsOptional() @IsString() validFrom?: string;
}

enum LocationTypeDto {
  CENTRAL_WAREHOUSE = 'CENTRAL_WAREHOUSE',
  MUNICIPAL_WAREHOUSE = 'MUNICIPAL_WAREHOUSE',
  SUPERVISOR_CUSTODY = 'SUPERVISOR_CUSTODY',
}

class CreateLocationBody {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsEnum(LocationTypeDto) type!: LocationTypeDto;
  @IsOptional() @IsString() zoneId?: string;
  @IsOptional() @IsString() municipioId?: string;
}

class UpdateLocationBody {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() inventoryEnabled?: boolean;
}

enum AssignmentRoleDto {
  CUSTODIAN = 'CUSTODIAN',
  RECEIVER = 'RECEIVER',
  COUNTER = 'COUNTER',
}

class AssignLocationBody {
  @IsString() userId!: string;
  @IsOptional() @IsString() supervisorId?: string;
  @IsEnum(AssignmentRoleDto) role!: AssignmentRoleDto;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() validFrom?: string;
}

class StockMinimumBody {
  @IsString() locationId!: string;
  @IsString() productId!: string;
  @IsString() quantityBase!: string;
}

enum ResolutionActionDto {
  APPROVE = 'APPROVE',
  DISMISS = 'DISMISS',
}

class ResolveCommandBody {
  @IsString() clientCommandId!: string;
  @IsEnum(ResolutionActionDto) action!: ResolutionActionDto;
  @IsString() reason!: string;
  @IsOptional() @IsString() locationId?: string;
}

class CommandBody {
  @IsString() clientCommandId!: string;
  @IsOptional() @IsString() reason?: string;
}

class StockEntryBody extends CommandBody {
  @IsString() locationId!: string;
  @IsString() productId!: string;
  @IsString() unitVersionId!: string;
  @IsString() quantity!: string;
  @IsOptional() @IsString() note?: string;
}

class RequiredReasonCommandBody extends CommandBody {
  @IsString() declare reason: string;
}

class ShipmentLineBody {
  @IsString() productId!: string;
  @IsString() unitVersionId!: string;
  @IsString() quantity!: string;
}

class CreateShipmentBody {
  @IsString() originLocationId!: string;
  @IsString() destinationLocationId!: string;
  @IsString() receiverUserId!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ShipmentLineBody)
  items!: ShipmentLineBody[];
}

class UpdateShipmentBody {
  @IsOptional() @IsString() destinationLocationId?: string;
  @IsOptional() @IsString() receiverUserId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ShipmentLineBody)
  items?: ShipmentLineBody[];
}

class ShipmentReceiptLineBody {
  @IsString() shipmentItemId!: string;
  @IsString() receivedBase!: string;
  @IsOptional() @IsString() damagedBase?: string;
  @IsOptional() @IsString() missingBase?: string;
}

enum ReceiptVerificationMethodDto {
  BIOMETRIC = 'BIOMETRIC',
}

class ReceiveShipmentBody extends CommandBody {
  @IsEnum(ReceiptVerificationMethodDto) verificationMethod!: ReceiptVerificationMethodDto;
  @IsOptional() @IsString() verificationReason?: string;
  @IsDateString() capturedAtUtc!: string;
  @IsInt() @Min(-840) @Max(840) capturedOffsetMin!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ShipmentReceiptLineBody)
  items!: ShipmentReceiptLineBody[];
}

class OpenCountBody {
  @IsString() locationId!: string;
}

class CountLineBody {
  @IsString() productId!: string;
  @IsString() countedBase!: string;
}

class SaveCountLinesBody {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => CountLineBody)
  lines!: CountLineBody[];
}

class OpeningBalanceRowBody {
  @IsString() locationCode!: string;
  @IsString() productSku!: string;
  @IsString() quantityBase!: string;
}

class ImportOpeningBalancesBody extends CommandBody {
  @IsString() sourceHash!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => OpeningBalanceRowBody)
  rows!: OpeningBalanceRowBody[];
}

@Controller('inventario')
export class InventoryOperationsController {
  constructor(
    @Inject(INVENTORY_OPERATIONS_USE_CASE)
    private readonly operations: InventoryOperationsUseCase,
  ) {}

  private run<T>(action: () => Promise<T>): Promise<T> {
    return action().catch(translateInventoryError);
  }

  @Get('products') @Roles(...READ_ROLES)
  products() { return this.run(() => this.operations.listProducts()); }

  @Post('products') @Roles(...ADMIN_ROLES)
  createProduct(@Body() body: CreateProductBody) { return this.run(() => this.operations.createProduct(body)); }

  @Patch('products/:id') @Roles(...ADMIN_ROLES)
  updateProduct(@Param('id') id: string, @Body() body: UpdateProductBody) {
    return this.run(() => this.operations.updateProduct(id, body));
  }

  @Post('products/:id/units') @Roles(...ADMIN_ROLES)
  addUnit(@Param('id') id: string, @Body() body: AddProductUnitBody) {
    return this.run(() => this.operations.addProductUnit(id, body));
  }

  @Get('locations') @Roles(...READ_ROLES)
  locations() { return this.run(() => this.operations.listLocations()); }

  @Get('assignees') @Roles(...ADMIN_ROLES)
  assignees() { return this.run(() => this.operations.listAssignableUsers()); }

  @Post('locations') @Roles(...ADMIN_ROLES)
  createLocation(@Body() body: CreateLocationBody) { return this.run(() => this.operations.createLocation(body)); }

  @Patch('locations/:id') @Roles(...ADMIN_ROLES)
  updateLocation(@Param('id') id: string, @Body() body: UpdateLocationBody) {
    return this.run(() => this.operations.updateLocation(id, body));
  }

  @Post('locations/:id/assignments') @Roles(...ADMIN_ROLES)
  assignLocation(@Param('id') id: string, @Body() body: AssignLocationBody) {
    return this.run(() => this.operations.assignLocation(id, body));
  }

  @Put('stock/minimum') @Roles(...ADMIN_ROLES)
  stockMinimum(@Body() body: StockMinimumBody) { return this.run(() => this.operations.setStockMinimum(body)); }

  @Get('balances') @Roles(...READ_ROLES)
  balances() { return this.run(() => this.operations.listBalances()); }

  @Get('movements') @Roles(...READ_ROLES)
  movements(@Query('cursor') cursor?: string) { return this.run(() => this.operations.listMovements(cursor)); }

  @Get('stock/alerts') @Roles(...READ_ROLES)
  alerts() { return this.run(() => this.operations.listAlerts()); }

  @Get('commands/review') @Roles(...REVIEW_ROLES)
  reviews() { return this.run(() => this.operations.listReviewCommands()); }

  @Post('commands/:id/resolve') @Roles(...REVIEW_ROLES)
  resolve(@Param('id') id: string, @Body() body: ResolveCommandBody) {
    return this.run(() => this.operations.resolveCommand(id, body));
  }

  @Post('movements/:id/reverse') @Roles(...ADMIN_ROLES)
  reverse(@Param('id') id: string, @Body() body: RequiredReasonCommandBody) {
    return this.run(() => this.operations.reverseMovement(id, body));
  }

  @Get('reconciliation') @Roles(...ADMIN_ROLES)
  reconciliation() { return this.run(() => this.operations.reconcile()); }

  @Get('metrics') @Roles(...ADMIN_ROLES)
  metrics() { return this.run(() => this.operations.operationalMetrics()); }

  @Post('shipments') @Roles(...ADMIN_ROLES)
  createShipment(@Body() body: CreateShipmentBody) { return this.run(() => this.operations.createShipment(body)); }

  @Patch('shipments/:id') @Roles(...ADMIN_ROLES)
  updateShipment(@Param('id') id: string, @Body() body: UpdateShipmentBody) {
    return this.run(() => this.operations.updateShipment(id, body));
  }

  @Post('shipments/:id/dispatch') @Roles(...ADMIN_ROLES)
  dispatchShipment(@Param('id') id: string, @Body() body: CommandBody) {
    return this.run(() => this.operations.dispatchShipment(id, body));
  }

  @Post('shipments/:id/cancel') @Roles(...ADMIN_ROLES)
  cancelShipment(@Param('id') id: string) { return this.run(() => this.operations.cancelShipment(id)); }

  @Get('shipments') @Roles(...READ_ROLES)
  shipments() { return this.run(() => this.operations.listShipments()); }

  @Get('shipments/:id') @Roles(...READ_ROLES)
  shipment(@Param('id') id: string) { return this.run(() => this.operations.getShipment(id)); }

  @Post('shipments/:id/receipts') @Roles(...COUNT_ROLES)
  receiveShipment(@Param('id') id: string, @Body() body: ReceiveShipmentBody) {
    return this.run(() => this.operations.receiveShipment(id, body));
  }

  @Post('shipments/:id/return') @Roles(...REVIEW_ROLES)
  returnShipment(@Param('id') id: string, @Body() body: RequiredReasonCommandBody) {
    return this.run(() => this.operations.returnShipment(id, body));
  }

  @Post('shipments/:id/resolve-discrepancy') @Roles(...ADMIN_ROLES)
  resolveShipmentDiscrepancy(@Param('id') id: string, @Body() body: RequiredReasonCommandBody) {
    return this.run(() => this.operations.resolveShipmentDiscrepancy(id, body));
  }

  @Post('counts') @Roles(...COUNT_ROLES)
  openCount(@Body() body: OpenCountBody) { return this.run(() => this.operations.openCount(body)); }

  @Put('counts/:id/lines') @Roles(...COUNT_ROLES)
  saveCountLines(@Param('id') id: string, @Body() body: SaveCountLinesBody) {
    return this.run(() => this.operations.saveCountLines(id, body.lines));
  }

  @Post('counts/:id/submit') @Roles(...COUNT_ROLES)
  submitCount(@Param('id') id: string) { return this.run(() => this.operations.submitCount(id)); }

  @Post('counts/:id/approve') @Roles(...REVIEW_ROLES)
  approveCount(@Param('id') id: string, @Body() body: RequiredReasonCommandBody) {
    return this.run(() => this.operations.approveCount(id, body));
  }

  @Get('counts') @Roles(...READ_ROLES)
  counts() { return this.run(() => this.operations.listCounts()); }

  @Get('counts/:id') @Roles(...READ_ROLES)
  count(@Param('id') id: string) { return this.run(() => this.operations.getCount(id)); }

  @Post('opening-balances/import') @Roles(...ADMIN_ROLES)
  importOpeningBalances(@Body() body: ImportOpeningBalancesBody) {
    return this.run(() => this.operations.importOpeningBalances(body));
  }
}
