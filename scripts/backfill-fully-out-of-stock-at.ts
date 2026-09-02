#!/usr/bin/env ts-node
/**
 * One-time ops helper: mark legacy fully-OOS products with fullyOutOfStockAt.
 * Does NOT run automatically on deploy.
 *
 * Usage:
 *   npx ts-node scripts/backfill-fully-out-of-stock-at.ts --dry-run
 *   npx ts-node scripts/backfill-fully-out-of-stock-at.ts --apply
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const apply = process.argv.includes('--apply')
  const dryRun = process.argv.includes('--dry-run') || !apply

  const candidates = await prisma.product.findMany({
    where: {
      fullyOutOfStockAt: null,
      variants: { every: { stock: { lte: 0 } }, some: {} },
    },
    select: { id: true, slug: true },
  })

  console.log(`Candidates (all variants stock<=0, fullyOutOfStockAt IS NULL): ${candidates.length}`)
  for (const row of candidates.slice(0, 20)) {
    console.log(`  - ${row.slug} (${row.id})`)
  }
  if (candidates.length > 20) {
    console.log(`  ... and ${candidates.length - 20} more`)
  }

  if (dryRun) {
    console.log('Dry run only. Pass --apply to update.')
    return
  }

  const result = await prisma.product.updateMany({
    where: {
      id: { in: candidates.map((row) => row.id) },
    },
    data: { fullyOutOfStockAt: new Date() },
  })
  console.log(`Updated fullyOutOfStockAt for ${result.count} products.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
