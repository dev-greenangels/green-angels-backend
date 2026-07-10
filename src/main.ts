import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { json, urlencoded } from 'express'
import { join } from 'path'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  const config = app.get(ConfigService)

  app.use(cookieParser())
  app.use(json({ limit: '15mb' }))
  app.use(urlencoded({ extended: true, limit: '15mb' }))
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3000')
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  })

  const photoStorageRoot =
    config.get<string>('PHOTO_STORAGE_ROOT')?.trim() ||
    join(process.cwd(), 'uploads', 'estimate-photos')
  app.useStaticAssets(photoStorageRoot, {
    prefix: '/uploads/estimate-photos/',
  })

  const port = Number(config.get('PORT', 3001))
  app.enableShutdownHooks()
  await app.listen(port)
  console.log(`API: http://localhost:${port}`)
}

bootstrap()
