import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { CommerceController } from './commerce.controller'
import { CommerceService } from './commerce.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CommerceController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
