import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { MailModule } from '../mail/mail.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { TurboSmsModule } from '../turbosms/turbosms.module'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { OtpService } from './otp.service'
import { RolesGuard } from './guards/roles.guard'
import { JwtAuthGuard } from './jwt-auth.guard'
import { BackstageJwtAuthGuard } from './backstage-jwt-auth.guard'
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard'
import { JwtStrategy } from './jwt.strategy'
import { BackstageJwtStrategy } from './backstage-jwt.strategy'

@Module({
  imports: [
    PrismaModule,
    MailModule,
    TurboSmsModule,
    forwardRef(() => SettingsModule),
    forwardRef(() => UsersModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET')
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters')
        }
        return { secret, signOptions: { algorithm: 'HS256' } }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    BackstageJwtStrategy,
    JwtAuthGuard,
    BackstageJwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    OtpService,
    JwtModule,
    JwtAuthGuard,
    BackstageJwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
