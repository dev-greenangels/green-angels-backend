import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RedirectsController } from './redirects.controller'
import { RedirectsService } from './redirects.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RedirectsController],
  providers: [RedirectsService],
  exports: [RedirectsService],
})
export class RedirectsModule {}
