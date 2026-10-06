import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PrismaModule } from '../prisma/prisma.module'
import { QueueModule } from '../queue/queue.module'
import { SettingsModule } from '../settings/settings.module'
import { ReviewRequestService } from './review-request.service'
import { ReviewsController } from './reviews.controller'
import { ReviewsService } from './reviews.service'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SettingsModule,
    MailModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewRequestService],
  exports: [ReviewsService, ReviewRequestService],
})
export class ReviewsModule {}
