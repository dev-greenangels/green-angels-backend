import { Module } from '@nestjs/common'

import { ViesController } from './vies.controller'
import { ViesService } from './vies.service'

@Module({
  controllers: [ViesController],
  providers: [ViesService],
  exports: [ViesService],
})
export class ViesModule {}
