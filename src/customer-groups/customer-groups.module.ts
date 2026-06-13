import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { CustomerGroupsController } from './customer-groups.controller'
import { CustomerGroupsService } from './customer-groups.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomerGroupsController],
  providers: [CustomerGroupsService],
  exports: [CustomerGroupsService],
})
export class CustomerGroupsModule {}
