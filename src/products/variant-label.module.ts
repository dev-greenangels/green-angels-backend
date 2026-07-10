import { Module } from '@nestjs/common'

import { SettingsModule } from '../settings/settings.module'
import { VariantLabelService } from './variant-label.service'

@Module({
  imports: [SettingsModule],
  providers: [VariantLabelService],
  exports: [VariantLabelService],
})
export class VariantLabelModule {}
