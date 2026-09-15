/**
 * READ-ONLY ProductTranslation coverage report for EU feed locales.
 *
 * Usage (from green-angels-backend, with DATABASE_URL set):
 *   npx tsx scripts/report-eu-translation-coverage.ts
 *
 * Does NOT modify the database.
 */
import { PrismaClient } from '@prisma/client'

const EU_LOCALES = ['sk', 'cs', 'hu', 'de', 'en'] as const

async function main() {
  const prisma = new PrismaClient()
  try {
    const published = await prisma.product.count({ where: { isPublished: true } })
    console.log(`Published products: ${published}`)

    for (const locale of EU_LOCALES) {
      const withName = await prisma.product.count({
        where: {
          isPublished: true,
          translations: { some: { locale, name: { not: '' } } },
        },
      })
      const missing = published - withName
      console.log(
        `  ${locale}: with name=${withName}, missing=${missing} (${published ? ((missing / published) * 100).toFixed(1) : 0}%)`,
      )
    }

    console.log('\nSample products missing SK name (up to 20):')
    const missingSk = await prisma.product.findMany({
      where: {
        isPublished: true,
        NOT: { translations: { some: { locale: 'sk', name: { not: '' } } } },
      },
      take: 20,
      select: {
        slug: true,
        latinName: true,
        translations: { select: { locale: true, name: true } },
      },
      orderBy: { slug: 'asc' },
    })
    for (const row of missingSk) {
      const locales = row.translations.map((t) => `${t.locale}:${t.name?.slice(0, 40) ?? ''}`).join(' | ')
      console.log(`  ${row.slug} latin=${row.latinName ?? '—'} :: ${locales}`)
    }

    console.log(
      '\nNote: Merchant feeds exclude products with empty strict-locale names (merchant=1).',
    )
    console.log(
      'Storefront (non-merchant) uses pickLocalizedName: locale → en → latin → slug (never first-filled uk).',
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
