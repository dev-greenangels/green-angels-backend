import { createHash } from 'crypto'

import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'

import { RedisService } from '../redis/redis.service'
import type { CreateOrderDto } from './dto/create-order.dto'
import {
  ORDER_IDEMPOTENCY_KEY_MAX_LENGTH,
  ORDER_IDEMPOTENCY_LOCK_PREFIX,
  ORDER_IDEMPOTENCY_LOCK_TTL_SEC,
  ORDER_IDEMPOTENCY_RESULT_PREFIX,
  ORDER_IDEMPOTENCY_RESULT_TTL_SEC,
  ORDER_IDEMPOTENCY_WAIT_MS,
} from './order-idempotency.constants'
import type { CreatedOrderResponse } from './orders.service'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type StoredIdempotencyRecord = {
  v: 1
  fingerprint: string
  response: CreatedOrderResponse
}

/**
 * REL-001: Redis-backed order-create idempotency.
 * Lock (SET NX) serializes concurrent creates; result cache returns the same
 * response on retry. Fingerprint binds the key to auth + material request fields
 * so one client cannot read another order by reusing a key.
 */
@Injectable()
export class OrderIdempotencyService {
  private readonly logger = new Logger(OrderIdempotencyService.name)

  constructor(private readonly redis: RedisService) {}

  normalizeKey(raw?: string | null): string | null {
    const key = raw?.trim()
    if (!key) return null
    if (key.length > ORDER_IDEMPOTENCY_KEY_MAX_LENGTH) return null
    return key
  }

  /**
   * Auth session + material order identity. Pricing totals are excluded so a
   * re-quote cannot break legitimate retries of the same submission.
   */
  buildFingerprint(dto: CreateOrderDto, sessionUserId?: string): string {
    const items = [...dto.items]
      .map((item) => `${item.productVariantId}:${item.quantity}`)
      .sort()
      .join(',')
    const payload = [
      sessionUserId?.trim() || '',
      items,
      (dto.customerEmail ?? '').trim().toLowerCase(),
      dto.customerPhone.trim(),
      dto.paymentMethod,
      dto.deliveryMethod,
    ].join('|')
    return createHash('sha256').update(payload).digest('hex')
  }

  assertFingerprintMatch(storedFingerprint: string, requestFingerprint: string): void {
    if (storedFingerprint === requestFingerprint) return
    throw new ConflictException(
      'Цей ключ ідемпотентності вже використано з іншим запитом на створення замовлення.',
    )
  }

  async getRecord(key: string): Promise<StoredIdempotencyRecord | null> {
    try {
      const raw = await this.redis.client.get(`${ORDER_IDEMPOTENCY_RESULT_PREFIX}${key}`)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<StoredIdempotencyRecord> &
        Partial<CreatedOrderResponse>
      if (
        parsed &&
        parsed.v === 1 &&
        typeof parsed.fingerprint === 'string' &&
        parsed.response &&
        typeof parsed.response.id === 'string'
      ) {
        return {
          v: 1,
          fingerprint: parsed.fingerprint,
          response: parsed.response,
        }
      }
      // Legacy cache (response-only) — cannot verify ownership; reject reuse.
      if (parsed && typeof (parsed as CreatedOrderResponse).id === 'string') {
        this.logger.warn(
          `Idempotency key ${key} has legacy result without fingerprint; refusing opaque replay`,
        )
        throw new ConflictException(
          'Цей ключ ідемпотентності вже використано. Надішліть новий ключ.',
        )
      }
      return null
    } catch (err) {
      if (err instanceof ConflictException) throw err
      this.logger.warn(
        `Idempotency result read failed for key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return null
    }
  }

  async getMatchingResult(
    key: string,
    fingerprint: string,
  ): Promise<CreatedOrderResponse | null> {
    const record = await this.getRecord(key)
    if (!record) return null
    this.assertFingerprintMatch(record.fingerprint, fingerprint)
    return record.response
  }

  /**
   * Persist successful create. Throws if Redis write fails so callers can keep
   * the in-flight lock and avoid releasing a key that has no durable result.
   */
  async storeResult(
    key: string,
    fingerprint: string,
    response: CreatedOrderResponse,
  ): Promise<void> {
    const record: StoredIdempotencyRecord = { v: 1, fingerprint, response }
    try {
      await this.redis.client.set(
        `${ORDER_IDEMPOTENCY_RESULT_PREFIX}${key}`,
        JSON.stringify(record),
        'EX',
        ORDER_IDEMPOTENCY_RESULT_TTL_SEC,
      )
    } catch (err) {
      this.logger.error(
        `Idempotency result store failed for key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      throw new ServiceUnavailableException(
        'Замовлення створено, але не вдалося зберегти ключ ідемпотентності. Повторіть запит з тим самим ключем пізніше.',
      )
    }
  }

  async tryAcquireLock(key: string): Promise<boolean> {
    try {
      const result = await this.redis.client.set(
        `${ORDER_IDEMPOTENCY_LOCK_PREFIX}${key}`,
        '1',
        'EX',
        ORDER_IDEMPOTENCY_LOCK_TTL_SEC,
        'NX',
      )
      return result === 'OK'
    } catch (err) {
      this.logger.warn(
        `Idempotency lock acquire failed for key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  async releaseLock(key: string): Promise<void> {
    try {
      await this.redis.client.del(`${ORDER_IDEMPOTENCY_LOCK_PREFIX}${key}`)
    } catch (err) {
      this.logger.warn(
        `Idempotency lock release failed for key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  async waitForMatchingResult(
    key: string,
    fingerprint: string,
  ): Promise<CreatedOrderResponse | null> {
    const deadline = Date.now() + ORDER_IDEMPOTENCY_WAIT_MS
    while (Date.now() < deadline) {
      const matched = await this.getMatchingResult(key, fingerprint)
      if (matched) return matched
      // getMatchingResult throws on fingerprint conflict; null means still pending.
      await sleep(100)
    }
    return null
  }
}
