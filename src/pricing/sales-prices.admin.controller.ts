import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Role, SalesPriceScope } from '@prisma/client'
import type { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CommerceService } from '../commerce/commerce.service'
import { SalesPricesService } from './sales-prices.service'

@Controller('backstage/sales-prices')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class SalesPricesAdminController {
  constructor(
    private readonly salesPrices: SalesPricesService,
    private readonly commerce: CommerceService,
  ) {}

  @Get('coverage')
  @RequirePermissions('settings.view', 'settings.manage', 'flexi.view', 'flexi.manage')
  async coverage() {
    const currency = await this.commerce.getDefaultCurrencyCode()
    return this.salesPrices.getCoverageSummary(currency)
  }

  @Get('missing')
  @RequirePermissions('settings.view', 'settings.manage', 'flexi.view', 'flexi.manage')
  async missing(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const currency = await this.commerce.getDefaultCurrencyCode()
    return this.salesPrices.listMissingPrices({
      currency,
      search,
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Get('dictionaries')
  @RequirePermissions(
    'customers.view',
    'customers.edit',
    'settings.view',
    'flexi.view',
    'flexi.manage',
  )
  dictionaries() {
    return this.salesPrices.listFlexiDictionaries()
  }

  /**
   * Batch sales prices for Product Editor.
   * ALL/GROUP/COMPANY: catalog.view|edit (or flexi/promotions/customers/settings).
   * COMPANY rows require includeCompany=true or scope=COMPANY (still Backstage-only).
   */
  @Get('for-product/:productId')
  @RequirePermissions(
    'catalog.view',
    'catalog.edit',
    'flexi.view',
    'flexi.manage',
    'promotions.manage',
  )
  async forProduct(
    @Param('productId') productId: string,
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('includeCompany') includeCompany?: string,
    @Query('scope') scope?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.salesPrices.listForProductEditor({
      actorUserId: req.user.userId,
      productId,
      includeCompany: includeCompany === '1' || includeCompany === 'true',
      scope: parseScope(scope),
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Get('for-variants')
  @RequirePermissions(
    'catalog.view',
    'catalog.edit',
    'flexi.view',
    'flexi.manage',
    'promotions.manage',
  )
  async forVariants(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('variantIds') variantIdsRaw?: string,
    @Query('includeCompany') includeCompany?: string,
    @Query('scope') scope?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const variantIds = (variantIdsRaw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (!variantIds.length) {
      throw new BadRequestException('Вкажіть variantIds.')
    }
    return this.salesPrices.listForProductEditor({
      actorUserId: req.user.userId,
      variantIds,
      includeCompany: includeCompany === '1' || includeCompany === 'true',
      scope: parseScope(scope),
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }
}

function parseScope(raw?: string): SalesPriceScope | undefined {
  if (raw === 'ALL' || raw === 'GROUP' || raw === 'COMPANY') return raw
  return undefined
}
