import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { CONTAINER_ATTRIBUTE_NAMES } from '../i18n/pick-localized-attribute-name'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Ensures CONTAINER (nursery pot size) attribute has names for all storefront locales.
 * Idempotent upsert — safe on every boot.
 */
@Injectable()
export class ContainerAttributeI18nService implements OnModuleInit {
  private readonly logger = new Logger(ContainerAttributeI18nService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureContainerTranslations()
    } catch (error) {
      this.logger.warn(
        `CONTAINER attribute i18n seed skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async ensureContainerTranslations(): Promise<number> {
    const attributes = await this.prisma.variantAttribute.findMany({
      where: { valueType: 'CONTAINER' },
      select: { id: true, translations: { select: { locale: true, name: true } } },
    })
    let upserts = 0
    for (const attr of attributes) {
      for (const [locale, name] of Object.entries(CONTAINER_ATTRIBUTE_NAMES)) {
        const existing = attr.translations.find((row) => row.locale === locale)?.name?.trim()
        if (existing) continue
        await this.prisma.variantAttributeTranslation.upsert({
          where: {
            attributeId_locale: { attributeId: attr.id, locale },
          },
          create: { attributeId: attr.id, locale, name },
          update: { name },
        })
        upserts += 1
      }
    }
    if (upserts > 0) {
      this.logger.log(`CONTAINER attribute translations upserted: ${upserts}`)
    }
    return upserts
  }
}
