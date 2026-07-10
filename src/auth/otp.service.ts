import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomInt, randomUUID } from 'crypto'

import { MailService } from '../mail/mail.service'
import { RedisService } from '../redis/redis.service'
import { TurboSmsService } from '../turbosms/turbosms.service'
import { normalizePhoneE164, phoneE164ToTurboSms } from './auth.utils'

type OtpChannel = 'phone' | 'email'

const OTP_CODE_PREFIX = 'otp:code:'
const OTP_COOLDOWN_PREFIX = 'otp:cooldown:'
const OTP_ATTEMPTS_PREFIX = 'otp:attempts:'
const OTP_VERIFIED_PREFIX = 'otp:verified:'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly turboSms: TurboSmsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get otpTtlSec(): number {
    return this.config.get<number>('OTP_TTL_SEC', 300)
  }

  private get resendCooldownSec(): number {
    return this.config.get<number>('OTP_RESEND_COOLDOWN_SEC', 60)
  }

  private get maxVerifyAttempts(): number {
    return this.config.get<number>('OTP_VERIFY_MAX_ATTEMPTS', 5)
  }

  private get verificationTokenTtlSec(): number {
    return this.config.get<number>('OTP_VERIFICATION_TOKEN_TTL_SEC', 600)
  }

  private generateCode(): string {
    return String(randomInt(0, 10000)).padStart(4, '0')
  }

  private codeKey(channel: OtpChannel, id: string): string {
    return `${OTP_CODE_PREFIX}${channel}:${id}`
  }

  private cooldownKey(channel: OtpChannel, id: string): string {
    return `${OTP_COOLDOWN_PREFIX}${channel}:${id}`
  }

  private attemptsKey(channel: OtpChannel, id: string): string {
    return `${OTP_ATTEMPTS_PREFIX}${channel}:${id}`
  }

  private verifiedValue(channel: OtpChannel, id: string): string {
    return `${channel}:${id}`
  }

  private requireUkrainianPhone(phone: string): string {
    const normalized = normalizePhoneE164(phone)
    if (!normalized || !normalized.startsWith('+380')) {
      throw new BadRequestException('Невірний формат українського телефону.')
    }
    return normalized
  }

  private requireEmail(email: string): string {
    const normalized = email.trim().toLowerCase()
    if (!normalized || !EMAIL_REGEX.test(normalized)) {
      throw new BadRequestException('Невірний формат email.')
    }
    return normalized
  }

  private async assertNotInCooldown(channel: OtpChannel, id: string): Promise<void> {
    const inCooldown = await this.redis.client.get(this.cooldownKey(channel, id))
    if (inCooldown) {
      throw new HttpException(
        'Зачекайте перед повторним надсиланням коду.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private async storeOtp(channel: OtpChannel, id: string, code: string): Promise<void> {
    const client = this.redis.client
    await client.set(this.codeKey(channel, id), code, 'EX', this.otpTtlSec)
    await client.set(this.cooldownKey(channel, id), '1', 'EX', this.resendCooldownSec)
    await client.del(this.attemptsKey(channel, id))
  }

  async sendPhoneOtp(phone: string): Promise<void> {
    const normalized = this.requireUkrainianPhone(phone)
    await this.assertNotInCooldown('phone', normalized)

    const code = this.generateCode()
    await this.storeOtp('phone', normalized, code)

    const text = `Код для входу в Зелені Янголи: ${code}. Дійсний 5 хв. Нікому не повідомляйте.`

    if (this.turboSms.isConfigured()) {
      await this.turboSms.sendSms(phoneE164ToTurboSms(normalized), text)
    } else {
      this.logger.log(`[OTP dev phone] ${normalized}: ${code}`)
    }
  }

  async sendEmailOtp(email: string): Promise<void> {
    const normalized = this.requireEmail(email)
    await this.assertNotInCooldown('email', normalized)

    const code = this.generateCode()
    await this.storeOtp('email', normalized, code)

    if (this.mail.isConfigured()) {
      await this.mail.sendOtpEmail(normalized, code)
    } else {
      this.logger.log(`[OTP dev email] ${normalized}: ${code}`)
    }
  }

  private async verifyChannelOtp(
    channel: OtpChannel,
    id: string,
    code: string,
  ): Promise<{ verificationToken: string }> {
    const client = this.redis.client
    const attemptsKey = this.attemptsKey(channel, id)
    const codeKey = this.codeKey(channel, id)

    const storedCode = await client.get(codeKey)
    if (!storedCode) {
      throw new UnauthorizedException('Код прострочений або не надісланий.')
    }

    const attempts = Number.parseInt((await client.get(attemptsKey)) ?? '0', 10)
    if (attempts >= this.maxVerifyAttempts) {
      throw new HttpException(
        'Забагато невдалих спроб. Запросіть новий код.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const normalizedInput = code.replace(/\D/g, '')
    if (normalizedInput !== storedCode) {
      const nextAttempts = await client.incr(attemptsKey)
      if (nextAttempts === 1) {
        await client.expire(attemptsKey, this.otpTtlSec)
      }
      throw new UnauthorizedException('Невірний код.')
    }

    await client.del(codeKey)
    await client.del(attemptsKey)

    const verificationToken = randomUUID()
    await client.set(
      `${OTP_VERIFIED_PREFIX}${verificationToken}`,
      this.verifiedValue(channel, id),
      'EX',
      this.verificationTokenTtlSec,
    )

    return { verificationToken }
  }

  async verifyPhoneOtp(phone: string, code: string): Promise<{ verificationToken: string }> {
    const normalized = this.requireUkrainianPhone(phone)
    return this.verifyChannelOtp('phone', normalized, code)
  }

  async verifyEmailOtp(email: string, code: string): Promise<{ verificationToken: string }> {
    const normalized = this.requireEmail(email)
    return this.verifyChannelOtp('email', normalized, code)
  }

  async consumeVerificationToken(
    token: string,
    channel: OtpChannel,
    id: string,
  ): Promise<boolean> {
    if (!(await this.matchVerificationToken(token, channel, id))) return false

    const client = this.redis.client
    await client.del(`${OTP_VERIFIED_PREFIX}${token.trim()}`)
    return true
  }

  async matchVerificationToken(
    token: string,
    channel: OtpChannel,
    id: string,
  ): Promise<boolean> {
    const normalizedId =
      channel === 'phone'
        ? normalizePhoneE164(id)
        : id.trim().toLowerCase()

    if (!normalizedId || !token.trim()) return false
    if (channel === 'phone' && !normalizedId.startsWith('+380')) return false
    if (channel === 'email' && !EMAIL_REGEX.test(normalizedId)) return false

    const client = this.redis.client
    const key = `${OTP_VERIFIED_PREFIX}${token.trim()}`
    const stored = await client.get(key)
    return stored === this.verifiedValue(channel, normalizedId)
  }

  /** @deprecated use sendPhoneOtp */
  async sendOtp(phone: string): Promise<void> {
    return this.sendPhoneOtp(phone)
  }

  /** @deprecated use verifyPhoneOtp */
  async verifyOtp(phone: string, code: string): Promise<{ verificationToken: string }> {
    return this.verifyPhoneOtp(phone, code)
  }

  /** @deprecated use consumeVerificationToken with channel */
  async consumePhoneVerificationToken(token: string, phone: string): Promise<boolean> {
    return this.consumeVerificationToken(token, 'phone', phone)
  }
}
