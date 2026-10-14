/**
 * Local: run PlantStock catalog+tree sync (ABRA GET + PG write). No ABRA writes.
 */
import { NestFactory } from '@nestjs/core'

import { AppModule } from '../src/app.module'
import { PlantStockSyncService } from '../src/plant-stock/plant-stock-sync.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })
  try {
    const sync = app.get(PlantStockSyncService)
    const result = await sync.syncCatalogAndTree({ source: 'manual' })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
