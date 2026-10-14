import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'

import { PlantStockJwtAuthGuard } from '../auth/plant-stock-jwt-auth.guard'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import {
  PlantStockCatalogQueryDto,
  PlantStockReservationsQueryDto,
  PlantStockStockBatchQueryDto,
  PlantStockStockQueryDto,
  ReservationPreviewBodyDto,
} from './dto/plant-stock.dto'
import { PlantStockService } from './plant-stock.service'

/**
 * PlantStock PWA operational API.
 * Auth: PlantStock-scoped JWT only (aud=plant-stock).
 * Backoffice settings/sync live on /backstage/plant-stock/*.
 */
@Controller('plant-stock')
@UseGuards(PlantStockJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class PlantStockController {
  constructor(private readonly plantStock: PlantStockService) {}

  @Get('catalog')
  @RequirePermissions('plantstock.access')
  listCatalog(@Query() query: PlantStockCatalogQueryDto) {
    return this.plantStock.listCatalog(query)
  }

  @Get('sync-status')
  @RequirePermissions('plantstock.access')
  syncStatus() {
    return this.plantStock.getSyncStatus()
  }

  @Get('warehouses')
  @RequirePermissions('plantstock.access')
  listWarehouses() {
    return this.plantStock.listWarehouses()
  }

  @Get('stock/batch')
  @RequirePermissions('plantstock.access')
  getStockBatch(@Query() query: PlantStockStockBatchQueryDto) {
    return this.plantStock.getStockBatch(query.skladKod, query.skus)
  }

  @Get('stock')
  @RequirePermissions('plantstock.access')
  getStock(@Query() query: PlantStockStockQueryDto) {
    return this.plantStock.getStock(query.sku, query.skladKod)
  }

  @Get('reservations')
  @RequirePermissions('reservations.view')
  listReservations(@Query() query: PlantStockReservationsQueryDto) {
    return this.plantStock.listServiceReservations(query.sku, query.skladKod)
  }

  @Post('reservations/preview')
  @HttpCode(200)
  @RequirePermissions('reservations.view')
  previewReservations(@Body() body: ReservationPreviewBodyDto) {
    return this.plantStock.previewReservationSync(body.skladKod, body.lines)
  }
}
