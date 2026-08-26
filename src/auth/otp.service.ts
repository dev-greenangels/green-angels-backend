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
import type { OtpPurpose, PhonePolicy } from '../settings/market.types'
import { TurboSmsService } from '../turbosms/turbosms.service'
import { phoneE164ToTurboSms } from './auth.utils'
import { validatePhoneForPolicy } from './market-phone.util'

type OtpChannel = 'phone' | 'email'

const OTP_CODE_PREFIX = 'otp:code:'
const OTP_COOLDOWN_PREFIX = 'otp:cooldown:'
const OTP_ATTEMPTS_PREFIX = 'otp:attempts:'
const OTP_VERIFIED_PREFIX = 'otp:verified:'
const OTP_IP_SEND_PREFIX = 'otp:ip:send:'
const OTP_IP_VERIFY_PREFIX = 'otp:ip:verify:'
const OTP_IP_HINT_PREFIX = 'otp:ip:hint:'

const OTP_IP_SEND_MAX_DEFAULT = 20
const OTP_IP_VERIFY_MAX_DEFAULT = 60
const OTP_IP_HINT_MAX_DEFAULT = 30
const OTP_IP_WINDOW_SEC_DEFAULT = 900

const OTP_PURPOSES: OtpPurpose[] = ['login', 'checkout', 'review', 'profile']

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** TCP peer only. Never reads X-Forwarded-For. Private/loopback → undefined (BFF hop). */
export function resolveOtpRateLimitPeerIp(remoteAddress: string | undefined): string | undefined {
  const raw = remoteAddress?.trim() ?? ''
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw
  if (!ip) return undefined
  if (ip === '::1' || ip === '127.0.0.1') return undefined
  if (ip.startsWith('10.')) return undefined
  if (ip.startsWith('192.168.')) return undefined
  if (ip.startsWith('169.254.')) return undefined
  const m = /^172\.(\d+)\./.exec(ip)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return undefined
  }
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return undefined
  return ip
}

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

  private get ipSendMax(): number {
    return this.config.get<number>('OTP_IP_SEND_MAX', OTP_IP_SEND_MAX_DEFAULT)
  }

  private get ipVerifyMax(): number {
    return this.config.get<number>('OTP_IP_VERIFY_MAX', OTP_IP_VERIFY_MAX_DEFAULT)
  }

  private get ipSendWindowSec(): number {
    return this.config.get<number>('OTP_IP_SEND_WINDOW_SEC', OTP_IP_WINDOW_SEC_DEFAULT)
  }

  private get ipVerifyWindowSec(): number {
    return this.config.get<number>('OTP_IP_VERIFY_WINDOW_SEC', OTP_IP_WINDOW_SEC_DEFAULT)
  }

  private get ipHintMax(): number {
    return this.config.get<number>('OTP_IP_HINT_MAX', OTP_IP_HINT_MAX_DEFAULT)
  }

  private get ipHintWindowSec(): number {
    return this.config.get<number>('OTP_IP_HINT_WINDOW_SEC', OTP_IP_WINDOW_SEC_DEFAULT)
  }

  private normalizePurpose(purpose: OtpPurpose | undefined): OtpPurpose {
    return purpose && OTP_PURPOSES.includes(purpose) ? purpose : 'login'
  }

  private codeKey(channel: OtpChannel, purpose: OtpPurpose, id: string): string {
    return `${OTP_CODE_PREFIX}${channel}:${purpose}:${id}`
  }

  private cooldownKey(channel: OtpChannel, purpose: OtpPurpose, id: string): string {
    return `${OTP_COOLDOWN_PREFIX}${channel}:${purpose}:${id}`
  }

  private attemptsKey(channel: OtpChannel, purpose: OtpPurpose, id: string): string {
    return `${OTP_ATTEMPTS_PREFIX}${channel}:${purpose}:${id}`
  }

  private verifiedValue(channel: OtpChannel, purpose: OtpPurpose, id: string): string {
    return `${channel}:${purpose}:${id}`
  }

  private requirePhone(phone: string, policy: PhonePolicy): string {
    const normalized = validatePhoneForPolicy(phone, policy)
    if (!normalized) {
      throw new BadRequestException('Невірний формат телефону.')
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

  async consumeIdentityHintIpLimit(ip: string | undefined): Promise<void> {
    const trimmed = ip?.trim()
    if (!trimmed) return

    const max = this.ipHintMax
    const windowSec = this.ipHintWindowSec
    if (max <= 0 || windowSec <= 0) return

    const key = `${OTP_IP_HINT_PREFIX}${trimmed}`
    const client = this.redis.client
    const count = await client.incr(key)
    if (count === 1) {
      await client.expire(key, windowSec)
    }
    if (count > max) {
      throw new HttpException(
        'Забагато запитів. Спробуйте пізніше.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private async consumeIpLimit(
    kind: 'send' | 'verify',
    ip: string | undefined,
  ): Promise<void> {
    const trimmed = ip?.trim()
    if (!trimmed) return

    const max = kind === 'send' ? this.ipSendMax : this.ipVerifyMax
    const windowSec = kind === 'send' ? this.ipSendWindowSec : this.ipVerifyWindowSec
    if (max <= 0 || windowSec <= 0) return

    const key = `${kind === 'send' ? OTP_IP_SEND_PREFIX : OTP_IP_VERIFY_PREFIX}${trimmed}`
    const client = this.redis.client
    const count = await client.incr(key)
    if (count === 1) {
      await client.expire(key, windowSec)
    }
    if (count > max) {
      throw new HttpException(
        'Забагато запитів. Спробуйте пізніше.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private async assertNotInCooldown(
    channel: OtpChannel,
    purpose: OtpPurpose,
    id: string,
  ): Promise<void> {
    const inCooldown = await this.redis.client.get(this.cooldownKey(channel, purpose, id))
    if (inCooldown) {
      throw new HttpException(
        'Зачекайте перед повторним надсиланням коду.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private async storeOtp(
    channel: OtpChannel,
    purpose: OtpPurpose,
    id: string,
    code: string,
  ): Promise<void> {
    const client = this.redis.client
    await client.set(this.codeKey(channel, purpose, id), code, 'EX', this.otpTtlSec)
    await client.set(this.cooldownKey(channel, purpose, id), '1', 'EX', this.resendCooldownSec)
    await client.del(this.attemptsKey(channel, purpose, id))
  }

  async sendPhoneOtp(
    phone: string,
    phonePolicy: PhonePolicy,
    ip?: string,
    purpose: OtpPurpose = 'login',
  ): Promise<void> {
    const normalizedPurpose = this.normalizePurpose(purpose)
    const normalized = this.requirePhone(phone, phonePolicy)
    await this.assertNotInCooldown('phone', normalizedPurpose, normalized)
    await this.consumeIpLimit('send', ip)

    const code = generateOtpCode()
    await this.storeOtp('phone', normalizedPurpose, normalized, code)

    const text = `Код для Зелені Янголи: ${code}. Дійсний 5 хв. Нікому не повідомляйте.`

    if (this.turboSms.isConfigured()) {
      await this.turboSms.sendSms(phoneE164ToTurboSms(normalized), text)
    } else {
      this.logger.log(`[OTP dev phone ${normalizedPurpose}] code stored (sms off)`)
    }
  }

  async sendEmailOtp(
    email: string,
    ip?: string,
    purpose: OtpPurpose = 'login',
    countrySiteCode?: 'sk' | 'hu' | 'at' | null,
  ): Promise<void> {
    const normalizedPurpose = this.normalizePurpose(purpose)
    const normalized = this.requireEmail(email)
    await this.assertNotInCooldown('email', normalizedPurpose, normalized)
    await this.consumeIpLimit('send', ip)

    const code = generateOtpCode()
    await this.storeOtp('email', normalizedPurpose, normalized, code)

    if (this.mail.isConfigured()) {
      await this.mail.sendOtpEmail(normalized, code, countrySiteCode)
    } else {
      this.logger.log(`[OTP dev email ${normalizedPurpose}] code stored (mail off)`)
    }
  }

  private async verifyChannelOtp(
    channel: OtpChannel,
    purpose: OtpPurpose,
    id: string,
    code: string,
    ip?: string,
  ): Promise<{ verificationToken: string }> {
    await this.consumeIpLimit('verify', ip)

    const client = this.redis.client
    const attemptsKey = this.attemptsKey(channel, purpose, id)
    const codeKey = this.codeKey(channel, purpose, id)

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
      this.verifiedValue(channel, purpose, id),
      'EX',
      this.verificationTokenTtlSec,
    )

    return { verificationToken }
  }

  async verifyPhoneOtp(
    phone: string,
    code: string,
    phonePolicy: PhonePolicy,
    ip?: string,
    purpose: OtpPurpose = 'login',
  ): Promise<{ verificationToken: string }> {
    const normalizedPurpose = this.normalizePurpose(purpose)
    const normalized = this.requirePhone(phone, phonePolicy)
    return this.verifyChannelOtp('phone', normalizedPurpose, normalized, code, ip)
  }

  async verifyEmailOtp(
    email: string,
    code: string,
    ip?: string,
    purpose: OtpPurpose = 'login',
  ): Promise<{ verificationToken: string }> {
    const normalizedPurpose = this.normalizePurpose(purpose)
    const normalized = this.requireEmail(email)
    return this.verifyChannelOtp('email', normalizedPurpose, normalized, code, ip)
  }

  async consumeVerificationToken(
    token: string,
    channel: OtpChannel,
    id: string,
    purpose: OtpPurpose = 'login',
  ): Promise<boolean> {
    if (!(await this.matchVerificationToken(token, channel, id, purpose))) return false

    const client = this.redis.client
    await client.del(`${OTP_VERIFIED_PREFIX}${token.trim()}`)
    return true
  }

  async matchVerificationToken(
    token: string,
    channel: OtpChannel,
    id: string,
    purpose: OtpPurpose = 'login',
  ): Promise<boolean> {
    const normalizedPurpose = this.normalizePurpose(purpose)
    const normalizedId =
      channel === 'phone' ? id.trim() : id.trim().toLowerCase()

    if (!normalizedId || !token.trim()) return false
    if (channel === 'email' && !EMAIL_REGEX.test(normalizedId)) return false
    if (channel === 'phone' && !normalizedId.startsWith('+')) return false

    const client = this.redis.client
    const key = `${OTP_VERIFIED_PREFIX}${token.trim()}`
    const stored = await client.get(key)
    return stored === this.verifiedValue(channel, normalizedPurpose, normalizedId)
  }

  /** @deprecated use sendPhoneOtp */
  async sendOtp(phone: string, phonePolicy: PhonePolicy = 'intl'): Promise<void> {
    return this.sendPhoneOtp(phone, phonePolicy, undefined, 'login')
  }

  /** @deprecated use verifyPhoneOtp */
  async verifyOtp(
    phone: string,
    code: string,
    phonePolicy: PhonePolicy = 'intl',
  ): Promise<{ verificationToken: string }> {
    return this.verifyPhoneOtp(phone, code, phonePolicy, undefined, 'login')
  }

  /** @deprecated use consumeVerificationToken with channel */
  async consumePhoneVerificationToken(token: string, phone: string): Promise<boolean> {
    return this.consumeVerificationToken(token, 'phone', phone, 'login')
  }
}
