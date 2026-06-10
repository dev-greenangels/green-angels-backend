import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { AuthProvider } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { Response } from 'express'

import { PrismaService } from '../prisma/prisma.service'
import {
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
import { LoginDto } from './dto/login.dto'
import { PhoneSessionDto } from './dto/phone-session.dto'
import { RegisterDto } from './dto/register.dto'

const MOCK_GOOGLE_SUB = 'mock-google-olena'
const MOCK_GOOGLE_EMAIL = 'olena.kovalenko@gmail.com'
const MOCK_GOOGLE_PROFILE = {
  firstName: 'Олена',
  lastName: 'Коваленко',
  phone: '+380631768178',
  personalDiscountPercent: 5,
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  private toSessionUser(user: {
    id: string
    email: string | null
    phone: string | null
    role: Parameters<typeof prismaRoleToApi>[0]
  }): SessionUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: prismaRoleToApi(user.role),
    }
  }

  /** Для сумісності з shop, який очікує { email, role }. */
  private toLegacySessionResponse(user: SessionUser) {
    return {
      user: {
        id: user.id,
        email: user.email ?? user.phone ?? user.id,
        phone: user.phone,
        role: user.role,
      },
    }
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

    const email = dto.email?.trim().toLowerCase()

    let user = await this.prisma.user.findUnique({ where: { phone } })

    if (!user && email) {
      user = await this.prisma.user.findUnique({ where: { email } })
      if (user && user.phone && user.phone !== phone) {
        throw new ConflictException('Цей email прив’язаний до іншого телефону.')
      }
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          phoneVerified: true,
          email: email ?? null,
          emailVerified: Boolean(email),
          role: apiRoleToPrisma('customer'),
          accounts: {
            create: {
              provider: AuthProvider.PHONE,
              providerId: phone,
            },
          },
        },
      })
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerified: true,
          phone,
          ...(email && !user.email ? { email, emailVerified: true } : {}),
        },
      })

      await this.prisma.account.upsert({
        where: {
          provider_providerId: {
            provider: AuthProvider.PHONE,
            providerId: phone,
          },
        },
        create: {
          provider: AuthProvider.PHONE,
          providerId: phone,
          userId: user.id,
        },
        update: {},
      })
    }

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return { ok: true, ...this.toLegacySessionResponse(sessionUser) }
  }

  async mockGoogleOAuth(res: Response) {
    await new Promise((r) => setTimeout(r, 700))

    const email = MOCK_GOOGLE_EMAIL

    let account = await this.prisma.account.findUnique({
      where: {
        provider_providerId: {
          provider: AuthProvider.GOOGLE,
          providerId: MOCK_GOOGLE_SUB,
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
          role: apiRoleToPrisma('customer'),
          accounts: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerId: MOCK_GOOGLE_SUB,
            },
          },
        },
      })
    } else {
      await this.prisma.account.upsert({
        where: {
          provider_providerId: {
            provider: AuthProvider.GOOGLE,
            providerId: MOCK_GOOGLE_SUB,
          },
        },
        create: {
          provider: AuthProvider.GOOGLE,
          providerId: MOCK_GOOGLE_SUB,
          userId: user.id,
        },
        update: {},
      })

      if (!user.emailVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { email, emailVerified: true },
        })
      }
    }

    const sessionUser = this.toSessionUser(user)
    const token = this.signToken(user.id, sessionUser.role)
    this.setSessionCookie(res, token)

    return {
      ok: true,
      ...this.toLegacySessionResponse(sessionUser),
      profile: MOCK_GOOGLE_PROFILE,
    }
  }

  async sessionFromPayload(payload: SessionJwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    })

    if (!user) {
      throw new UnauthorizedException()
    }

    return this.toLegacySessionResponse(this.toSessionUser(user))
  }
}
