/**
 * OTP purpose isolation for login vs review session minting.
 * Uses an in-memory Redis stub — no live Redis required.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'

import { OtpService } from './otp.service'
import type { RedisService } from '../redis/redis.service'
import type { MailService } from '../mail/mail.service'
import type { TurboSmsService } from '../turbosms/turbosms.service'
import { CustomerErrorCode } from '../common/customer-error'

type Entry = { value: string; expiresAt: number | null }

function createMemoryRedis() {
  const store = new Map<string, Entry>()
  const now = () => Date.now()

  const getLive = (key: string): string | null => {
    const e = store.get(key)
    if (!e) return null
    if (e.expiresAt != null && e.expiresAt <= now()) {
      store.delete(key)
      return null
    }
    return e.value
  }

  return {
    store,
    client: {
      async get(key: string) {
        return getLive(key)
      },
      async set(key: string, value: string, mode?: string, ttl?: number) {
        let expiresAt: number | null = null
        if (mode === 'EX' && typeof ttl === 'number') {
          expiresAt = now() + ttl * 1000
        }
        store.set(key, { value, expiresAt })
        return 'OK'
      },
      async del(...keys: string[]) {
        let n = 0
        for (const k of keys) {
          if (store.delete(k)) n += 1
        }
        return n
      },
      async incr(key: string) {
        const cur = Number.parseInt(getLive(key) ?? '0', 10)
        const next = cur + 1
        const prev = store.get(key)
        store.set(key, {
          value: String(next),
          expiresAt: prev?.expiresAt ?? null,
        })
        return next
      },
      async expire(key: string, ttl: number) {
        const e = store.get(key)
        if (!e) return 0
        e.expiresAt = now() + ttl * 1000
        return 1
      },
    },
  }
}

function buildOtpService(redis: ReturnType<typeof createMemoryRedis>) {
  const config = {
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  } as ConfigService

  return new OtpService(
    { client: redis.client } as unknown as RedisService,
    {
      isConfigured: () => false,
      sendSms: async () => undefined,
    } as unknown as TurboSmsService,
    {
      isConfigured: () => false,
      sendOtpEmail: async () => undefined,
    } as unknown as MailService,
    config,
  )
}

describe('OtpService session purpose isolation', () => {
  let redis: ReturnType<typeof createMemoryRedis>
  let otp: OtpService

  beforeEach(() => {
    redis = createMemoryRedis()
    otp = buildOtpService(redis)
  })

  it('login email OTP verify + consume with purpose=login succeeds', async () => {
    const email = 'login-user@example.com'
    await otp.sendEmailOtp(email, undefined, 'login')
    const code = redis.store.get(`otp:code:email:login:${email}`)?.value
    assert.ok(code)
    const { verificationToken } = await otp.verifyEmailOtp(email, code!, undefined, 'login')
    const ok = await otp.consumeVerificationToken(
      verificationToken,
      'email',
      email,
      'login',
    )
    assert.equal(ok, true)
  })

  it('review email OTP verify + consume with purpose=review succeeds', async () => {
    const email = 'review-user@example.com'
    await otp.sendEmailOtp(email, undefined, 'review')
    const code = redis.store.get(`otp:code:email:review:${email}`)?.value
    assert.ok(code)
    const { verificationToken } = await otp.verifyEmailOtp(email, code!, undefined, 'review')
    const ok = await otp.consumeVerificationToken(
      verificationToken,
      'email',
      email,
      'review',
    )
    assert.equal(ok, true)
  })

  it('review phone OTP verify + consume with purpose=review succeeds', async () => {
    const phone = '+380501112233'
    await otp.sendPhoneOtp(phone, 'ua_e164', undefined, 'review', null, 'ua')
    const code = redis.store.get(`otp:code:phone:review:${phone}`)?.value
    assert.ok(code)
    const { verificationToken } = await otp.verifyPhoneOtp(
      phone,
      code!,
      'ua_e164',
      undefined,
      'review',
      'ua',
    )
    const ok = await otp.consumeVerificationToken(
      verificationToken,
      'phone',
      phone,
      'review',
    )
    assert.equal(ok, true)
  })

  it('token minted for review cannot be consumed as login', async () => {
    const email = 'cross-purpose@example.com'
    await otp.sendEmailOtp(email, undefined, 'review')
    const code = redis.store.get(`otp:code:email:review:${email}`)?.value
    assert.ok(code)
    const { verificationToken } = await otp.verifyEmailOtp(email, code!, undefined, 'review')

    const asLogin = await otp.consumeVerificationToken(
      verificationToken,
      'email',
      email,
      'login',
    )
    assert.equal(asLogin, false)

    const asReview = await otp.consumeVerificationToken(
      verificationToken,
      'email',
      email,
      'review',
    )
    assert.equal(asReview, true)
  })

  it('wrong purpose on verify looks up a different Redis key (expired/not sent)', async () => {
    const email = 'wrong-purpose@example.com'
    await otp.sendEmailOtp(email, undefined, 'review')
    const code = redis.store.get(`otp:code:email:review:${email}`)?.value
    assert.ok(code)

    await assert.rejects(
      () => otp.verifyEmailOtp(email, code!, undefined, 'login'),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException)
        const body = (err as UnauthorizedException).getResponse() as {
          code?: string
        }
        assert.equal(body.code, CustomerErrorCode.OTP_EXPIRED)
        return true
      },
    )
  })

  it('rejects invalid OTP code', async () => {
    const email = 'bad-code@example.com'
    await otp.sendEmailOtp(email, undefined, 'login')

    await assert.rejects(
      () => otp.verifyEmailOtp(email, '000000', undefined, 'login'),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException)
        const body = (err as UnauthorizedException).getResponse() as {
          code?: string
        }
        assert.equal(body.code, CustomerErrorCode.OTP_INVALID)
        return true
      },
    )
  })

  it('rejects expired / missing OTP', async () => {
    await assert.rejects(
      () =>
        otp.verifyEmailOtp('none@example.com', '123456', undefined, 'login'),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException)
        const body = (err as UnauthorizedException).getResponse() as {
          code?: string
        }
        assert.equal(body.code, CustomerErrorCode.OTP_EXPIRED)
        return true
      },
    )
  })
})
