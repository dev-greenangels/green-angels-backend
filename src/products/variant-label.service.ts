import { VariantAttributeType } from '@prisma/client'

import { Injectable } from '@nestjs/common'

import { SettingsService } from '../settings/settings.service'
import {
  buildVariantLabelFromAttributeLinks,
  type VariantAttributeValueLink,
} from './variant-label.util'

@Injectable()
export class VariantLabelService {
  constructor(private readonly settings: SettingsService) {}

  async getTypeOrder(): Promise<VariantAttributeType[]> {
    const config = await this.settings.getVariantLabelSettings()
    return config.labelTypeOrder
  }

  async buildFromLinks(
    links: VariantAttributeValueLink[],
    separator?: string,
    locale?: string,
  ): Promise<string | null> {
    const typeOrder = await this.getTypeOrder()
    return buildVariantLabelFromAttributeLinks(links, { typeOrder, separator, locale })
  }

  buildFromLinksWithOrder(
    links: VariantAttributeValueLink[],
    typeOrder: VariantAttributeType[],
    separator?: string,
    locale?: string,
  ): string | null {
    return buildVariantLabelFromAttributeLinks(links, { typeOrder, separator, locale })
  }
}
