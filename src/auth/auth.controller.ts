import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common'
import { Request, Response } from 'express'

import { AuthService } from './auth.service'
import type { SessionJwtPayload } from './auth.constants'
import { BackstageLoginDto } from './dto/backstage-login.dto'
import { LoginDto } from './dto/login.dto'
import { PhoneSessionDto } from './dto/phone-session.dto'
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto'
import { RegisterDto } from './dto/register.dto'
import { JwtAuthGuard } from './jwt-auth.guard'

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

  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.auth.sessionFromPayload(req.user)
  }

  @Get('backstage/session')
  @UseGuards(JwtAuthGuard)
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

  /** Dev fallback, якщо Google OAuth не налаштовано. */
  @Post('oauth/google')
  googleOAuth(@Res({ passthrough: true }) res: Response) {
    return this.auth.mockGoogleOAuth(res)
  }

  @Post('phone-session')
  phoneSession(@Body() dto: PhoneSessionDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.phoneSession(dto, res)
  }
}
