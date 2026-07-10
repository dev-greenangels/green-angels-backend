import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { Request, Response } from 'express'

import { AuthService } from './auth.service'
import type { SessionJwtPayload } from './auth.constants'
import { BackstageLoginDto } from './dto/backstage-login.dto'
import { LoginDto } from './dto/login.dto'
import { PhoneSessionDto } from './dto/phone-session.dto'
import { EmailSessionDto } from './dto/email-session.dto'
import { SendOtpDto } from './dto/send-otp.dto'
import { VerifyOtpDto } from './dto/verify-otp.dto'
import { CheckoutIdentityDto } from './dto/checkout-identity.dto'
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto'
import { RegisterDto } from './dto/register.dto'
import { JwtAuthGuard } from './jwt-auth.guard'
import { BackstageJwtAuthGuard } from './backstage-jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, res)
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, res)
  }

  @Post('backstage/login')
  backstageLogin(@Body() dto: BackstageLoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.backstageLogin(dto, res)
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.clearSessionCookie(res)
    return { ok: true }
  }

  @Post('backstage/logout')
  backstageLogout(@Res({ passthrough: true }) res: Response) {
    return this.auth.backstageLogout(res)
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.auth.sessionFromPayload(req.user)
  }

  @Get('backstage/session')
  @UseGuards(BackstageJwtAuthGuard)
  backstageSession(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.auth.backstageSessionFromPayload(req.user)
  }

  @Get('oauth/google/config')
  googleOAuthConfig() {
    const clientId = this.auth.getGoogleClientId()
    return {
      configured: Boolean(clientId),
      clientId: clientId ?? undefined,
    }
  }

  @Post('oauth/google/callback')
  googleOAuthCallback(
    @Body() dto: GoogleOAuthCallbackDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.googleOAuthCallback(dto, res)
  }

  @Post('phone-session')
  phoneSession(@Body() dto: PhoneSessionDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.phoneSession(dto, res)
  }

  @Post('email-session')
  emailSession(@Body() dto: EmailSessionDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.emailSession(dto, res)
  }

  @Post('otp/send')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.auth.sendOtp(dto)
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto)
  }

  @Get('customer-by-phone')
  customerByPhone(@Query('phone') phone: string) {
    return this.auth.customerByPhone(phone ?? '')
  }

  @Get('customer-by-email')
  customerByEmail(@Query('email') email: string) {
    return this.auth.customerByEmail(email ?? '')
  }

  @Post('checkout/identity')
  checkoutIdentity(
    @Body() dto: CheckoutIdentityDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.resolveCheckoutIdentity(dto, res)
  }
}
