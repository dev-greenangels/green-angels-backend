import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { AuthProvider, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { Request, Response } from 'express'

import { PrismaService } from '../prisma/prisma.service'
import { isOtpChannelEnabled, type OtpPurpose } from '../settings/market.types'
import { SettingsService } from '../settings/settings.service'
import { UsersService } from '../users/users.service'
import { OtpService } from './otp.service'
import { validatePhoneForPolicy } from './market-phone.util'
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
import { CheckoutIdentityHintDto } from './dto/checkout-identity-hint.dto'
import type { GoogleIdTokenInfo, GoogleOAuthProfile, GoogleTokenResponse } from './google-oauth.utils'
import {
  CHECKOUT_ACCOUNT_LOCKED,
  CHECKOUT_LOCK_COOKIE_NAME,
  CHECKOUT_LOCK_JWT_PURPOSE,
  CHECKOUT_LOCK_MAX_AGE_SEC,
  decideCheckoutAuthLock,
  decideCheckoutHintLock,
  parseCheckoutLockPayload,
  shouldRejectCheckoutAuth,
  type CheckoutLockState,
} from './checkout-account-lock'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
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
      accountType: user.role === Role.WHOLESALER ? 'wholesale' : 'retail',
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
        accountType: user.accountType,
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

  private checkoutLockCookieOptions() {
    const secure = this.config.get<string>('NODE_ENV') === 'production'
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure,
      path: '/',
    }
  }

  private checkoutAccountLockedException() {
    return new ConflictException({
      code: CHECKOUT_ACCOUNT_LOCKED,
      message:
        'Це оформлення вже використовує інший акаунт. Змініть акаунт, щоб продовжити з іншим.',
    })
  }

  private peekCheckoutLock(req: Request): CheckoutLockState | null {
    const raw = req.cookies?.[CHECKOUT_LOCK_COOKIE_NAME]
    if (typeof raw !== 'string' || !raw.trim()) return null
    try {
      const payload = this.jwt.verify(raw)
      return parseCheckoutLockPayload(payload)
    } catch {
      return null
    }
  }

  private writeCheckoutLockCookie(res: Response, state: CheckoutLockState) {
    const token = this.jwt.sign(
      {
        v: 1,
        purpose: CHECKOUT_LOCK_JWT_PURPOSE,
        t: state.t,
        ...(state.t === 'locked' ? { uid: state.uid } : {}),
      },
      {
        subject: state.t === 'locked' ? state.uid : 'pending',
        expiresIn: CHECKOUT_LOCK_MAX_AGE_SEC,
      },
    )
    res.cookie(CHECKOUT_LOCK_COOKIE_NAME, token, {
      ...this.checkoutLockCookieOptions(),
      maxAge: CHECKOUT_LOCK_MAX_AGE_SEC * 1000,
    })
  }

  clearCheckoutLockCookie(res: Response) {
    res.clearCookie(CHECKOUT_LOCK_COOKIE_NAME, this.checkoutLockCookieOptions())
  }

  private enforceCheckoutAuthLock(req: Request, res: Response, userId: string) {
    const decision = decideCheckoutAuthLock(this.peekCheckoutLock(req), userId)
    if (decision.type === 'reject') {
      throw this.checkoutAccountLockedException()
    }
    if (decision.type === 'bind') {
      this.writeCheckoutLockCookie(res, { t: 'locked', uid: userId })
    }
  }

  private assertCheckoutLockAllowsCreate(req: Request) {
    if (this.peekCheckoutLock(req)?.t === 'locked') {
      throw this.checkoutAccountLockedException()
    }
  }

  private applyHintCheckoutLock(
    req: Request,
    res: Response,
    identityResolution: 'none' | 'single' | 'conflict',
  ) {
    const action = decideCheckoutHintLock(this.peekCheckoutLock(req), identityResolution)
    if (action === 'pending') {
      this.writeCheckoutLockCookie(res, { t: 'pending' })
    } else if (action === 'clear') {
      this.clearCheckoutLockCookie(res)
    }
  }

  switchCheckoutAccount(res: Response) {
    this.clearCustomerAuth(res)
    return { ok: true as const }
  }

  backstageLogout(res: Response) {
    this.clearBackstageSessionCookie(res)
    return { ok: true }
  }

  clearCustomerAuth(res: Response) {
    this.clearSessionCookie(res)
    this.clearCheckoutLockCookie(res)
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

  async register(dto: RegisterDto, res: Response, req: Request) {
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

    // Registration is not proof of contact ownership — contacts stay unverified
    // until profile/login/checkout OTP (or Google / staff). No Account(PHONE).
    this.assertCheckoutLockAllowsCreate(req)
    const user = await this.prisma.user.create({
      data: {
        email,
        emailVerified: false,
        phone,
        phoneVerified: false,
        firstName: dto.firstName?.trim() || null,
        lastName: dto.lastName?.trim() || null,
        passwordHash,
        role: apiRoleToPrisma(role),
      },
    })

    // Register does not prove mailbox/SMS ownership — do not bulk-link orphans.

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.enforceCheckoutAuthLock(req, res, user.id)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async login(dto: LoginDto, res: Response, req: Request) {
    const email = dto.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })

    if (!user) {
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
    const token = this.signToken(user.id, sessionUser.role)
    this.enforceCheckoutAuthLock(req, res, user.id)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async phoneSession(dto: PhoneSessionDto, res: Response, req: Request) {
    const market = await this.settings.getMarketSettings()
    const phone = validatePhoneForPolicy(dto.phone, market.authPhonePolicy)
    if (!phone) {
      throw new BadRequestException('Невірний формат телефону.')
    }

    if (!dto.verificationToken) {
      throw new UnauthorizedException('Потрібна верифікація телефону.')
    }

    const existing = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } })
    if (existing) {
      this.enforceCheckoutAuthLock(req, res, existing.id)
    } else {
      this.assertCheckoutLockAllowsCreate(req)
    }

    const verified = await this.otp.consumeVerificationToken(
      dto.verificationToken,
      'phone',
      phone,
      'login',
    )
    if (!verified) {
      throw new UnauthorizedException('Невалідний або прострочений токен верифікації.')
    }

    const userId = await this.users.findOrCreateCustomer({ phone })

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerified: true,
        phone,
      },
    })

    await this.users.ensureVerifiedPhoneAccount(user.id, phone)
    await this.users.linkOrphanOrdersToUser(user.id, { phone })

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.enforceCheckoutAuthLock(req, res, user.id)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async emailSession(dto: EmailSessionDto, res: Response, req: Request) {
    const email = dto.email.trim().toLowerCase()

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      this.enforceCheckoutAuthLock(req, res, existing.id)
    } else {
      this.assertCheckoutLockAllowsCreate(req)
    }

    const verified = await this.otp.consumeVerificationToken(
      dto.verificationToken,
      'email',
      email,
      'login',
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

    await this.users.linkOrphanOrdersToUser(user.id, { email })

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.enforceCheckoutAuthLock(req, res, user.id)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async sendOtp(dto: SendOtpDto, ip?: string) {
    const market = await this.settings.getMarketSettings()
    const purpose: OtpPurpose = dto.purpose ?? 'login'

    if (dto.phone?.trim()) {
      if (!isOtpChannelEnabled(market, 'sms', purpose)) {
        throw new BadRequestException('SMS OTP вимкнено для цієї поверхні.')
      }
      await this.otp.sendPhoneOtp(dto.phone, market.authPhonePolicy, ip, purpose)
      return { ok: true }
    }
    if (dto.email?.trim()) {
      if (!isOtpChannelEnabled(market, 'email', purpose)) {
        throw new BadRequestException('Email OTP вимкнено для цієї поверхні.')
      }
      await this.otp.sendEmailOtp(dto.email, ip, purpose, dto.countrySiteCode)
      return { ok: true }
    }
    throw new BadRequestException('Вкажіть телефон або email.')
  }

  async verifyOtp(dto: VerifyOtpDto, ip?: string) {
    const market = await this.settings.getMarketSettings()
    const purpose: OtpPurpose = dto.purpose ?? 'login'
    if (dto.phone?.trim()) {
      return this.otp.verifyPhoneOtp(dto.phone, dto.code, market.authPhonePolicy, ip, purpose)
    }
    if (dto.email?.trim()) {
      return this.otp.verifyEmailOtp(dto.email, dto.code, ip, purpose)
    }
    throw new BadRequestException('Вкажіть телефон або email.')
  }

  async resolveCheckoutIdentityHint(
    dto: CheckoutIdentityHintDto,
    ip: string | undefined,
    req: Request,
    res: Response,
  ) {
    const market = await this.settings.getMarketSettings()
    if (market.guestCheckoutMode !== 'soft') {
      throw new NotFoundException('Identity hint is unavailable for this checkout mode.')
    }

    await this.otp.consumeIdentityHintIpLimit(ip)

    const emailOtpEnabled = isOtpChannelEnabled(market, 'email', 'checkout')
    const smsOtpEnabled = isOtpChannelEnabled(market, 'sms', 'checkout')

    if (!emailOtpEnabled && !smsOtpEnabled) {
      this.applyHintCheckoutLock(req, res, 'none')
      return { identityResolution: 'none' as const, suggestedAuth: null }
    }

    const emailCandidate = dto.email?.trim().toLowerCase() || null
    const phoneCandidate = dto.phone?.trim()
      ? validatePhoneForPolicy(dto.phone, market.authPhonePolicy)
      : null

    const emailLookupReady = Boolean(emailOtpEnabled && emailCandidate)
    const phoneLookupReady = Boolean(smsOtpEnabled && phoneCandidate)

    if (!emailLookupReady && !phoneLookupReady) {
      throw new BadRequestException('Вкажіть коректний email або телефон для перевірки акаунта.')
    }

    const emailUser = emailLookupReady
      ? await this.prisma.user.findUnique({
          where: { email: emailCandidate! },
          select: { id: true },
        })
      : null
    const phoneUser = phoneLookupReady
      ? await this.prisma.user.findUnique({
          where: { phone: phoneCandidate! },
          select: { id: true },
        })
      : null

    let identityResolution: 'none' | 'single' | 'conflict' = 'none'
    let suggestedAuth: 'email' | 'phone' | 'either' | null = null

    if (emailOtpEnabled && smsOtpEnabled) {
      if (!emailUser && !phoneUser) {
        identityResolution = 'none'
      } else if (emailUser && phoneUser) {
        if (emailUser.id === phoneUser.id) {
          identityResolution = 'single'
          suggestedAuth = 'either'
        } else {
          identityResolution = 'conflict'
        }
      } else if (emailUser) {
        identityResolution = 'single'
        suggestedAuth = 'email'
      } else {
        identityResolution = 'single'
        suggestedAuth = 'phone'
      }
    } else if (emailOtpEnabled) {
      if (emailUser) {
        identityResolution = 'single'
        suggestedAuth = 'email'
      }
    } else if (phoneUser) {
      identityResolution = 'single'
      suggestedAuth = 'phone'
    }

    this.applyHintCheckoutLock(req, res, identityResolution)
    return { identityResolution, suggestedAuth }
  }

  async resolveCheckoutIdentity(dto: CheckoutIdentityDto, res: Response, req: Request) {
    const market = await this.settings.getMarketSettings()
    const phoneCandidate = dto.phone?.trim()
      ? validatePhoneForPolicy(dto.phone, market.authPhonePolicy)
      : null
    const emailCandidate = dto.email?.trim().toLowerCase() || null

    if (dto.phone?.trim() && !phoneCandidate) {
      throw new BadRequestException('Невірний формат телефону.')
    }

    if (!phoneCandidate && !emailCandidate) {
      throw new BadRequestException('Вкажіть телефон або email.')
    }

    // OTP proves exactly one channel. Ignore unproven sibling contacts for identity.
    let channel: 'phone' | 'email' | null = null
    let provenPhone: string | null = null
    let provenEmail: string | null = null

    if (phoneCandidate) {
      const phoneTokenOk = await this.otp.matchVerificationToken(
        dto.verificationToken,
        'phone',
        phoneCandidate,
        'checkout',
      )
      if (phoneTokenOk) {
        channel = 'phone'
        provenPhone = phoneCandidate
      }
    }
    if (!channel && emailCandidate) {
      const emailTokenOk = await this.otp.matchVerificationToken(
        dto.verificationToken,
        'email',
        emailCandidate,
        'checkout',
      )
      if (emailTokenOk) {
        channel = 'email'
        provenEmail = emailCandidate
      }
    }
    if (!channel) {
      throw new UnauthorizedException('Невалідний або прострочений токен верифікації.')
    }

    const identity = provenPhone ?? provenEmail!

    let user =
      channel === 'phone'
        ? await this.prisma.user.findUnique({ where: { phone: provenPhone! } })
        : await this.prisma.user.findUnique({ where: { email: provenEmail! } })

    if (!user) {
      const firstName = dto.firstName?.trim() || null
      const lastName = dto.lastName?.trim() || null
      if (!firstName || !lastName) {
        return { found: false as const, needsProfile: true as const }
      }

      this.assertCheckoutLockAllowsCreate(req)
      const userId = await this.users.findOrCreateCustomer(
        channel === 'phone'
          ? { phone: provenPhone!, firstName, lastName }
          : { email: provenEmail!, firstName, lastName },
      )
      user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        throw new BadRequestException('Не вдалося створити профіль замовника.')
      }
    } else {
      this.enforceCheckoutAuthLock(req, res, user.id)
    }

    await this.otp.consumeVerificationToken(dto.verificationToken, channel, identity, 'checkout')

    user = await this.prisma.user.update({
      where: { id: user.id },
      data:
        channel === 'phone'
          ? { phone: provenPhone!, phoneVerified: true }
          : { email: provenEmail!, emailVerified: true },
    })

    if (channel === 'phone') {
      await this.users.ensureVerifiedPhoneAccount(user.id, provenPhone!)
      await this.users.linkOrphanOrdersToUser(user.id, { phone: provenPhone! })
    } else {
      await this.users.linkOrphanOrdersToUser(user.id, { email: provenEmail! })
    }

    const sessionUser = this.toSessionUser(user)
    const jwt = this.signToken(user.id, sessionUser.role)
    this.enforceCheckoutAuthLock(req, res, user.id)
    this.setSessionCookie(res, jwt)

    const profile = await this.buildCustomerLookupWithDiscount(user)
    return {
      ok: true as const,
      needsProfile: false as const,
      ...profile,
      phone: user.phone ?? provenPhone ?? undefined,
      email: user.email ?? provenEmail ?? undefined,
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

  private async resolveExistingGoogleUserId(profile: GoogleOAuthProfile): Promise<string | null> {
    const email = profile.email.trim().toLowerCase()
    const account = await this.prisma.account.findUnique({
      where: {
        provider_providerId: {
          provider: AuthProvider.GOOGLE,
          providerId: profile.sub,
        },
      },
      select: { userId: true },
    })
    if (account?.userId) return account.userId
    const byEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    return byEmail?.id ?? null
  }

  private async upsertGoogleUser(profile: GoogleOAuthProfile) {
    const email = profile.email.trim().toLowerCase()
    const existingId = await this.resolveExistingGoogleUserId(profile)
    let user = existingId
      ? await this.prisma.user.findUnique({ where: { id: existingId } })
      : null

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
      await this.users.linkOrphanOrdersToUser(user.id, { email })
      return user
    }

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

    const storedEmail = user.email?.trim().toLowerCase() || null

    if (!storedEmail) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
      if (emailOwner && emailOwner.id !== user.id) {
        // Google proved email, but another User already owns it — no merge / no steal.
      } else {
        updates.email = email
        updates.emailVerified = true
      }
    } else if (storedEmail === email) {
      if (!user.emailVerified) {
        updates.emailVerified = true
      }
    }
    // storedEmail !== Google email: never mark stored email verified from Google proof of a different address.

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

    const finalEmail = user.email?.trim().toLowerCase() || null
    if (finalEmail === email && user.emailVerified) {
      await this.users.linkOrphanOrdersToUser(user.id, { email })
    }

    return user
  }

  private async completeGoogleOAuth(
    profile: GoogleOAuthProfile,
    res: Response,
    req: Request,
  ) {
    const existingUserId = await this.resolveExistingGoogleUserId(profile)
    if (shouldRejectCheckoutAuth(this.peekCheckoutLock(req), existingUserId)) {
      throw this.checkoutAccountLockedException()
    }
    if (existingUserId) {
      this.enforceCheckoutAuthLock(req, res, existingUserId)
    }

    const user = await this.upsertGoogleUser(profile)
    this.enforceCheckoutAuthLock(req, res, user.id)
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

  async googleOAuthCallback(dto: GoogleOAuthCallbackDto, res: Response, req: Request) {
    const idToken = await this.fetchGoogleIdToken(dto.code, dto.redirectUri.trim())
    const profile = await this.verifyGoogleIdToken(idToken)
    return this.completeGoogleOAuth(profile, res, req)
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
