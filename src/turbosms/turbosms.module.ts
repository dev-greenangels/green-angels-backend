import { Module } from '@nestjs/common'

import { TurboSmsService } from './turbosms.service'

@Module({
  providers: [TurboSmsService],
  exports: [TurboSmsService],
})
export class TurboSmsModule {}
