import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AuthModule } from '../auth/auth.module'
import { FlexiModule } from '../flexi/flexi.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { SearchModule } from '../search/search.module'
import { BackstageSupplierInvoicesController } from './backstage-supplier-invoices.controller'
import { GeminiInvoiceParserService } from './gemini-invoice-parser.service'
import { InvoiceProductMatcherService } from './invoice-product-matcher.service'
import { SupplierInvoiceDraftService } from './supplier-invoice-draft.service'
import { SupplierInvoicesService } from './supplier-invoices.service'

@Module({
  imports: [ConfigModule, AuthModule, PrismaModule, RedisModule, SearchModule, FlexiModule],
  controllers: [BackstageSupplierInvoicesController],
  providers: [
    SupplierInvoiceDraftService,
    GeminiInvoiceParserService,
    InvoiceProductMatcherService,
    SupplierInvoicesService,
  ],
})
export class SupplierInvoicesModule {}
