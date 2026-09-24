import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { LegalModule } from '../legal/legal.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => LegalModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
