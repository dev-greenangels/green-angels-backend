import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { AuthProvider, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { Response } from 'express'

import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { OtpService } from './otp.service'
import {
  BACKSTAGE_SESSION_COOKIE_NAME,
  BACKSTAGE_SESSION_MAX_AGE_SEC,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  type ApiUserRole,
  type SessionJwtPayload,
  type SessionUser,
} from './auth.constants'
import {
  apiRoleToPrisma,
  normalizePhoneE164,
  prismaRoleToApi,
  roleFromEmail,
} from './auth.utils'
import { BackstageLoginDto } from './dto/backstage-login.dto'
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto'
import { LoginDto } from './dto/login.dto'
import { PhoneSessionDto } from './dto/phone-session.dto'
import { EmailSessionDto } from './dto/email-session.dto'
import { SendOtpDto } from './dto/send-otp.dto'
import { VerifyOtpDto } from './dto/verify-otp.dto'
import { RegisterDto } from './dto/register.dto'
import { CheckoutIdentityDto } from './dto/checkout-identity.dto'
import type { GoogleIdTokenInfo, GoogleOAuthProfile, GoogleTokenResponse } from './google-oauth.utils'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
  ) {}

  private signToken(userId: string, role: ApiUserRole): string {
    return this.jwt.sign(
      { role, v: 1 },
      {
        subject: userId,
        expiresIn: SESSION_MAX_AGE_SEC,
      },
    )
  }

  private signBackstageToken(userId: string, role: ApiUserRole): string {
    return this.jwt.sign(
      { role, v: 1 },
      {
        subject: userId,
        expiresIn: BACKSTAGE_SESSION_MAX_AGE_SEC,
      },
    )
  }

  private toSessionUser(user: {
    id: string
    email: string | null
    phone: string | null
    firstName?: string | null
    lastName?: string | null
    role: Parameters<typeof prismaRoleToApi>[0]
  }): SessionUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      role: prismaRoleToApi(user.role),
    }
  }

  private toLegacySessionResponse(user: SessionUser) {
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    }
  }

  private isStaffRole(role: Role): boolean {
    return role === Role.ADMIN || role === Role.MANAGER
  }

  setSessionCookie(res: Response, token: string) {
    const secure = this.config.get<string>('NODE_ENV') === 'production'
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC * 1000,
    })
  }

  clearSessionCookie(res: Response) {
    const secure = this.config.get<string>('NODE_ENV') === 'production'
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    })
  }

  setBackstageSessionCookie(res: Response, token: string) {
    const secure = this.config.get<string>('NODE_ENV') === 'production'
    res.cookie(BACKSTAGE_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: BACKSTAGE_SESSION_MAX_AGE_SEC * 1000,
    })
  }

  clearBackstageSessionCookie(res: Response) {
    const secure = this.config.get<string>('NODE_ENV') === 'production'
    res.clearCookie(BACKSTAGE_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    })
  }

  backstageLogout(res: Response) {
    this.clearBackstageSessionCookie(res)
    return { ok: true }
  }

  async backstageLogin(dto: BackstageLoginDto, res: Response) {
    const email = dto.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })

    if (!user || !this.isStaffRole(user.role)) {
      throw new UnauthorizedException('Невірний email або пароль.')
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Невірний email або пароль.')
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('Невірний email або пароль.')
    }

    const sessionUser = this.toSessionUser(user)
    const token = this.signBackstageToken(user.id, sessionUser.role)
    this.setBackstageSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async register(dto: RegisterDto, res: Response) {
    const email = dto.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) {
      throw new ConflictException('Користувач з таким email вже існує.')
    }

    const role = roleFromEmail(email)
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : null
    const phone = dto.phone ? normalizePhoneE164(dto.phone) : null

    if (dto.phone && !phone) {
      throw new BadRequestException('Невірний формат телефону.')
    }

    if (phone) {
      const phoneTaken = await this.prisma.user.findUnique({ where: { phone } })
      if (phoneTaken) {
        throw new ConflictException('Користувач з таким телефоном вже існує.')
      }
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        emailVerified: true,
        phone,
        phoneVerified: Boolean(phone),
        firstName: dto.firstName?.trim() || null,
        lastName: dto.lastName?.trim() || null,
        passwordHash,
        role: apiRoleToPrisma(role),
        accounts: phone
          ? {
              create: {
                provider: AuthProvider.PHONE,
                providerId: phone,
              },
            }
          : undefined,
      },
    })

    await this.users.linkOrphanOrdersToUser(user.id, { phone, email })

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async login(dto: LoginDto, res: Response) {
    const email = dto.email.trim().toLowerCase()
    let user = await this.prisma.user.findUnique({ where: { email } })

    if (!user) {
      const role = roleFromEmail(email)
      user = await this.prisma.user.create({
        data: {
          email,
          emailVerified: true,
          role: apiRoleToPrisma(role),
        },
      })
      await this.users.linkOrphanOrdersToUser(user.id, { email })
    }

    if (user.passwordHash && dto.password) {
      const valid = await bcrypt.compare(dto.password, user.passwordHash)
      if (!valid) {
        throw new UnauthorizedException('Невірний email або пароль.')
      }
    }

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async phoneSession(dto: PhoneSessionDto, res: Response) {
    const phone = normalizePhoneE164(dto.phone)
    if (!phone) {
      throw new BadRequestException('Невірний формат телефону.')
    }

    const isUkrainian = phone.startsWith('+380')
    if (isUkrainian) {
      if (!dto.verificationToken) {
        throw new UnauthorizedException('Потрібна верифікація телефону.')
      }
      const verified = await this.otp.consumeVerificationToken(
        dto.verificationToken,
        'phone',
        phone,
      )
      if (!verified) {
        throw new UnauthorizedException('Невалідний або прострочений токен верифікації.')
      }
    }

    const userId = await this.users.findOrCreateCustomer({ phone })

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerified: true,
        phone,
      },
    })

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async emailSession(dto: EmailSessionDto, res: Response) {
    const email = dto.email.trim().toLowerCase()

    const verified = await this.otp.consumeVerificationToken(
      dto.verificationToken,
      'email',
      email,
    )
    if (!verified) {
      throw new UnauthorizedException('Невалідний або прострочений токен верифікації.')
    }

    const userId = await this.users.findOrCreateCustomer({ email })

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email,
        emailVerified: true,
      },
    })

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async sendOtp(dto: SendOtpDto) {
    if (dto.phone?.trim()) {
      await this.otp.sendPhoneOtp(dto.phone)
      return { ok: true }
    }
    if (dto.email?.trim()) {
      await this.otp.sendEmailOtp(dto.email)
      return { ok: true }
    }
    throw new BadRequestException('Вкажіть телефон або email.')
  }

  async verifyOtp(dto: VerifyOtpDto) {
    if (dto.phone?.trim()) {
      return this.otp.verifyPhoneOtp(dto.phone, dto.code)
    }
    if (dto.email?.trim()) {
      return this.otp.verifyEmailOtp(dto.email, dto.code)
    }
    throw new BadRequestException('Вкажіть телефон або email.')
  }

  async customerByPhone(phoneRaw: string) {
    const phone = normalizePhoneE164(phoneRaw)
    if (!phone) {
      throw new BadRequestException('Невірний формат телефону.')
    }

    const user = await this.prisma.user.findUnique({ where: { phone } })
    if (!user) {
      return { found: false as const }
    }

    return this.buildCustomerLookupWithDiscount(user)
  }

  async customerByEmail(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Невірний формат email.')
    }

    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      return { found: false as const }
    }

    return this.buildCustomerLookupWithDiscount(user)
  }

  async resolveCheckoutIdentity(dto: CheckoutIdentityDto, res: Response) {
    const phone = dto.phone?.trim() ? normalizePhoneE164(dto.phone) : null
    const email = dto.email?.trim().toLowerCase() || null

    if (!phone && !email) {
      throw new BadRequestException('Вкажіть телефон або email.')
    }

    const channel = phone ? ('phone' as const) : ('email' as const)
    const identity = phone ?? email!

    const tokenValid = await this.otp.matchVerificationToken(
      dto.verificationToken,
      channel,
      identity,
    )
    if (!tokenValid) {
      throw new UnauthorizedException('Невалідний або прострочений токен верифікації.')
    }

    let user = phone
      ? await this.prisma.user.findUnique({ where: { phone } })
      : await this.prisma.user.findUnique({ where: { email: email! } })

    if (!user) {
      const firstName = dto.firstName?.trim() || null
      const lastName = dto.lastName?.trim() || null
      if (!firstName || !lastName) {
        return { found: false as const, needsProfile: true as const }
      }

      const userId = await this.users.findOrCreateCustomer({
        phone: phone ?? undefined,
        email: email ?? undefined,
        firstName,
        lastName,
      })
      user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        throw new BadRequestException('Не вдалося створити профіль замовника.')
      }
    }

    await this.otp.consumeVerificationToken(dto.verificationToken, channel, identity)

    user = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(phone ? { phone, phoneVerified: true } : {}),
        ...(email ? { email, emailVerified: true } : {}),
      },
    })

    const sessionUser = this.toSessionUser(user)
    const jwt = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, jwt)

    const profile = await this.buildCustomerLookupWithDiscount(user)
    return {
      ok: true as const,
      needsProfile: false as const,
      ...profile,
      phone: user.phone ?? phone ?? undefined,
      email: user.email ?? email ?? undefined,
      user: this.toLegacySessionResponse(sessionUser).user,
    }
  }

  private buildCustomerLookup(user: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
  }) {
    return {
      found: true as const,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      personalDiscountPercent: 0 as number,
    }
  }

  private async buildCustomerLookupWithDiscount(user: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
  }) {
    const profile = this.buildCustomerLookup(user)
    profile.personalDiscountPercent = await this.resolvePersonalDiscountPercent(user.id)
    return profile
  }

  isGoogleOAuthConfigured(): boolean {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim()
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim()
    return Boolean(clientId && clientSecret)
  }

  getGoogleClientId(): string | null {
    if (!this.isGoogleOAuthConfigured()) return null
    return this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() ?? null
  }

  private async resolvePersonalDiscountPercent(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { contractorProfiles: true },
    })
    if (!user?.contractorProfiles.length) return 0
    return Math.max(0, ...user.contractorProfiles.map((profile) => profile.discountRate))
  }

  private buildCheckoutProfile(user: {
    id: string
    firstName: string | null
    lastName: string | null
    phone: string | null
  }) {
    return {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: user.phone ?? '',
      personalDiscountPercent: 0 as number,
    }
  }

  private async buildCheckoutProfileWithDiscount(user: {
    id: string
    firstName: string | null
    lastName: string | null
    phone: string | null
  }) {
    const profile = this.buildCheckoutProfile(user)
    profile.personalDiscountPercent = await this.resolvePersonalDiscountPercent(user.id)
    return profile
  }

  private async upsertGoogleUser(profile: GoogleOAuthProfile) {
    const email = profile.email.trim().toLowerCase()

    let account = await this.prisma.account.findUnique({
      where: {
        provider_providerId: {
          provider: AuthProvider.GOOGLE,
          providerId: profile.sub,
        },
      },
      include: { user: true },
    })

    let user = account?.user ?? (await this.prisma.user.findUnique({ where: { email } }))

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          emailVerified: true,
          firstName: profile.firstName,
          lastName: profile.lastName,
          role: apiRoleToPrisma('customer'),
          accounts: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerId: profile.sub,
            },
          },
        },
      })
    } else {
      await this.prisma.account.upsert({
        where: {
          provider_providerId: {
            provider: AuthProvider.GOOGLE,
            providerId: profile.sub,
          },
        },
        create: {
          provider: AuthProvider.GOOGLE,
          providerId: profile.sub,
          userId: user.id,
        },
        update: {},
      })

      const updates: {
        email?: string
        emailVerified?: boolean
        firstName?: string | null
        lastName?: string | null
      } = {}

      if (!user.email) {
        updates.email = email
        updates.emailVerified = true
      } else if (!user.emailVerified) {
        updates.emailVerified = true
      }

      if (!user.firstName?.trim() && profile.firstName) {
        updates.firstName = profile.firstName
      }
      if (!user.lastName?.trim() && profile.lastName) {
        updates.lastName = profile.lastName
      }

      if (Object.keys(updates).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updates,
        })
      }
    }

    await this.users.linkOrphanOrdersToUser(user.id, { email })

    return user
  }

  private async completeGoogleOAuth(
    profile: GoogleOAuthProfile,
    res: Response,
  ) {
    const user = await this.upsertGoogleUser(profile)
    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return {
      ok: true,
      ...this.toLegacySessionResponse(sessionUser),
      profile: await this.buildCheckoutProfileWithDiscount(user),
    }
  }

  private async fetchGoogleIdToken(code: string, redirectUri: string): Promise<string> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim()
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim()

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google OAuth не налаштовано на сервері.')
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = (await tokenRes.json().catch(() => ({}))) as GoogleTokenResponse
    if (!tokenRes.ok || !tokens.id_token) {
      throw new UnauthorizedException(
        tokens.error_description || tokens.error || 'Не вдалося отримати токен Google.',
      )
    }

    return tokens.id_token
  }

  private async verifyGoogleIdToken(idToken: string): Promise<GoogleOAuthProfile> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim()
    if (!clientId) {
      throw new BadRequestException('Google OAuth не налаштовано на сервері.')
    }

    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    )
    const info = (await infoRes.json().catch(() => ({}))) as GoogleIdTokenInfo

    if (!infoRes.ok || info.error) {
      throw new UnauthorizedException(
        info.error_description || info.error || 'Невалідний токен Google.',
      )
    }

    if (info.aud !== clientId) {
      throw new UnauthorizedException('Невалідний отримувач токена Google.')
    }

    const emailVerified =
      info.email_verified === true || info.email_verified === 'true'
    if (!info.sub || !info.email || !emailVerified) {
      throw new UnauthorizedException('Google не підтвердив email користувача.')
    }

    return {
      sub: info.sub,
      email: info.email.trim().toLowerCase(),
      firstName: info.given_name?.trim() || info.name?.trim().split(' ')[0] || null,
      lastName: info.family_name?.trim() || null,
    }
  }

  async googleOAuthCallback(dto: GoogleOAuthCallbackDto, res: Response) {
    const idToken = await this.fetchGoogleIdToken(dto.code, dto.redirectUri.trim())
    const profile = await this.verifyGoogleIdToken(idToken)
    return this.completeGoogleOAuth(profile, res)
  }

  async sessionFromPayload(payload: SessionJwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    })

    if (!user) {
      throw new UnauthorizedException()
    }

    return {
      ...this.toLegacySessionResponse(this.toSessionUser(user)),
      profile: await this.buildCheckoutProfileWithDiscount(user),
    }
  }

  async backstageSessionFromPayload(payload: SessionJwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    })

    if (!user || !this.isStaffRole(user.role)) {
      throw new UnauthorizedException()
    }

    const sessionUser = this.toSessionUser(user)
    return {
      ...this.toLegacySessionResponse(sessionUser),
      user: {
        ...this.toLegacySessionResponse(sessionUser).user,
        staffRole: user.role,
      },
    }
  }
}
