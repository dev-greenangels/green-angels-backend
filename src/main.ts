import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { json, urlencoded } from 'express'
import { AppModule } from './app.module'
import { getEstimatePhotosRoot } from './media/storage.config'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  const config = app.get(ConfigService)

  app.use(cookieParser())
  // Preserve raw bytes for MonoPay webhook signature verification (X-Sign).
  app.use(
    json({
      limit: '15mb',
      verify: (req, _res, buf) => {
        ;(req as { rawBody?: Buffer }).rawBody = buf
      },
    }),
  )
  app.use(urlencoded({ extended: true, limit: '15mb' }))
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3000')
  const corsOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.enableCors({
    origin: corsOrigins.length <= 1 ? corsOrigins[0] ?? corsOrigin : corsOrigins,
    credentials: true,
  })

  const mediaDriver = (config.get<string>('MEDIA_DRIVER') || '').trim().toLowerCase()
  const nodeEnv = (config.get<string>('NODE_ENV') || '').trim().toLowerCase()
  if (nodeEnv !== 'production' && mediaDriver !== 'r2') {
    const photoStorageRoot = getEstimatePhotosRoot(config)
    app.useStaticAssets(photoStorageRoot, {
      prefix: '/uploads/estimate-photos/',
    })
  }

  const port = Number(config.get('PORT', 3001))
  app.enableShutdownHooks()
  await app.listen(port)
  console.log(`API: http://localhost:${port}`)
}

bootstrap()
