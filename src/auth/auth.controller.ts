import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common'
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
import { CheckoutIdentityHintDto } from './dto/checkout-identity-hint.dto'
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto'
import { RegisterDto } from './dto/register.dto'
import { JwtAuthGuard } from './jwt-auth.guard'
import { BackstageJwtAuthGuard } from './backstage-jwt-auth.guard'
import { resolveOtpRateLimitPeerIp } from './otp.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, res, req)
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, res, req)
  }

  @Post('backstage/login')
  backstageLogin(@Body() dto: BackstageLoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.backstageLogin(dto, res)
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.clearCustomerAuth(res)
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.googleOAuthCallback(dto, res, req)
  }

  @Post('phone-session')
  phoneSession(
    @Body() dto: PhoneSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.phoneSession(dto, res, req)
  }

  @Post('email-session')
  emailSession(
    @Body() dto: EmailSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.emailSession(dto, res, req)
  }

  @Post('otp/send')
  sendOtp(@Body() dto: SendOtpDto, @Req() req: Request) {
    return this.auth.sendOtp(dto, resolveOtpRateLimitPeerIp(req.socket?.remoteAddress))
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto, resolveOtpRateLimitPeerIp(req.socket?.remoteAddress))
  }

  @Post('checkout/identity-hint')
  @HttpCode(200)
  checkoutIdentityHint(
    @Body() dto: CheckoutIdentityHintDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.resolveCheckoutIdentityHint(
      dto,
      resolveOtpRateLimitPeerIp(req.socket?.remoteAddress),
      req,
      res,
    )
  }

  @Post('checkout/identity')
  checkoutIdentity(
    @Body() dto: CheckoutIdentityDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.resolveCheckoutIdentity(dto, res, req)
  }

  @Post('checkout/switch-account')
  switchCheckoutAccount(@Res({ passthrough: true }) res: Response) {
    return this.auth.switchCheckoutAccount(res)
  }
}
