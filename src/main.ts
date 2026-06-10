import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  app.use(cookieParser())
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

  const port = Number(config.get('PORT', 3001))
  await app.listen(port)
  console.log(`API: http://localhost:${port}`)
}

bootstrap()
