/**
 * Проставляє packagingKind для значень атрибута типу CONTAINER.
 *
 * Запуск з green-angels-backend:
 *   npx tsx prisma/backfill-packaging-kind.ts
 */
import { PrismaClient } from '@prisma/client'

import { resolvePackagingKind } from '../src/variant-attributes/packaging-kind.util'

const prisma = new PrismaClient()

async function main() {
  const values = await prisma.variantAttributeValue.findMany({
    where: { attribute: { valueType: 'CONTAINER' } },
    include: {
      translations: { where: { locale: 'uk' }, take: 1 },
    },
  })

  let updated = 0
  for (const value of values) {
    const label = value.translations[0]?.label ?? value.slug
    const nextKind = resolvePackagingKind(label, value.slug, value.packagingKind)
    if (!nextKind || nextKind === value.packagingKind) continue

    await prisma.variantAttributeValue.update({
      where: { id: value.id },
      data: { packagingKind: nextKind },
    })
    updated += 1
  }

  console.log(`Оновлено packagingKind для ${updated} з ${values.length} значень контейнера.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
