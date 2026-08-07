import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { Roles } from '../../iam/interface/roles.decorator';
import type { SyncInventoryUseCase } from '../application/sync-inventory.use-case';
import type { GetInventoryContextUseCase } from '../application/get-inventory-context.use-case';
import {
  InventoryIdempotencyConflictError,
  InventoryInputError,
} from '../domain/inventory-command';

export const SYNC_INVENTORY_USE_CASE = Symbol('SyncInventoryUseCase');
export const GET_INVENTORY_CONTEXT_USE_CASE = Symbol('GetInventoryContextUseCase');

class SyncInventoryBody {
  @ApiProperty({ type: 'array', items: { type: 'object' }, maxItems: 25 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  events!: unknown[];
}

class InventoryStatusQuery {
  @ApiProperty({ description: 'Comma-separated client event UUIDs' })
  @IsString()
  ids!: string;
}

@ApiTags('inventario')
@Controller('inventario')
export class InventoryController {
  constructor(
    @Inject(SYNC_INVENTORY_USE_CASE)
    private readonly syncInventory: SyncInventoryUseCase,
    @Inject(GET_INVENTORY_CONTEXT_USE_CASE)
    private readonly getInventoryContext: GetInventoryContextUseCase,
  ) {}

  @Get('context')
  @Roles('SUPERVISOR', 'COORDINADOR')
  @ApiOkResponse({ description: 'Actor-scoped mobile inventory bootstrap snapshot.' })
  context() {
    return this.getInventoryContext.execute();
  }

  @Post('sync')
  @Roles('SUPERVISOR')
  @ApiOkResponse({ description: 'Per-event durable sync results.' })
  async sync(@Body() body: SyncInventoryBody) {
    try {
      return { results: await this.syncInventory.execute(body.events) };
    } catch (error) {
      if (error instanceof InventoryIdempotencyConflictError) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          clientEventId: error.clientEventId,
        });
      }
      if (error instanceof InventoryInputError) {
        throw new BadRequestException({ code: 'INVALID_BATCH', message: error.message });
      }
      throw error;
    }
  }

  @Get('events/status')
  @Roles('SUPERVISOR')
  @ApiOkResponse({ description: 'Previously committed results for the supplied event IDs.' })
  async statuses(@Query() query: InventoryStatusQuery) {
    try {
      const ids = query.ids.split(',').map((id) => id.trim());
      return { results: await this.syncInventory.findStatuses(ids) };
    } catch (error) {
      if (error instanceof InventoryInputError) {
        throw new BadRequestException({ code: 'INVALID_STATUS_QUERY', message: error.message });
      }
      throw error;
    }
  }
}
