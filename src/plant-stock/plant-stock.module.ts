import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { FlexiModule } from '../flexi/flexi.module'
import { PhotosModule } from '../photos/photos.module'
import { PrismaModule } from '../prisma/prisma.module'
import { BackstagePlantStockController } from './backstage-plant-stock.controller'
import { PlantStockController } from './plant-stock.controller'
import { PlantStockPhotosController } from './plant-stock-photos.controller'
import { PlantStockSchedulerService } from './plant-stock-scheduler.service'
import { PlantStockService } from './plant-stock.service'
import { PlantStockSettingsService } from './plant-stock.settings.service'
import { PlantStockSyncLockService } from './plant-stock-sync.lock'
import { PlantStockSyncService } from './plant-stock-sync.service'

@Module({
  imports: [PrismaModule, AuthModule, FlexiModule, PhotosModule],
  controllers: [
    PlantStockController,
    PlantStockPhotosController,
    BackstagePlantStockController,
  ],
  providers: [
    PlantStockSettingsService,
    PlantStockSyncLockService,
    PlantStockSyncService,
    PlantStockSchedulerService,
    PlantStockService,
  ],
  exports: [PlantStockSettingsService, PlantStockService, PlantStockSyncService],
})
export class PlantStockModule {}
