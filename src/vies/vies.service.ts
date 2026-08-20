import { Injectable, Logger } from '@nestjs/common'

import { RedisService } from '../redis/redis.service'
import type { ViesRequester, ViesValidationResult } from './vies.types'
import { parseEuVatId } from './vies.types'

const VIES_REST_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'
const VIES_REQUEST_TIMEOUT_MS = 8000
/** Короткий кеш — 15 хвилин, щоб не спамити зовнішній сервіс і не тримати застарілі дані. */
const VIES_CACHE_TTL_SECONDS = 15 * 60
const CACHE_PREFIX = 'vies:'

function normalizeCountryCode(input: string): string {
  return input.trim().toUpperCase().slice(0, 2)
}

function normalizeVatNumber(countryCode: string, input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/\s|-/g, '')
  return trimmed.startsWith(countryCode) ? trimmed.slice(countryCode.length) : trimmed
}

/**
 * Перевірка IČ DPH (EU VAT number) через VIES для B2B checkout SK/EU.
 * Коротке Redis-кешування + офіційний REST API ЄК. При помилці — soft-degrade
 * (`valid: null`), checkout не блокується.
 */
@Injectable()
export class ViesService {
  private readonly logger = new Logger(ViesService.name)

  constructor(private readonly redis: RedisService) {}

  private cacheKey(countryCode: string, vatNumber: string, audit: boolean): string {
    return `${CACHE_PREFIX}${audit ? 'audit:' : ''}${countryCode}:${vatNumber}`
  }

  /** Lightweight check for checkout UI / quote (no requester). */
  async validateVat(countryCodeInput: string, vatNumberInput: string): Promise<ViesValidationResult> {
    return this.validateVatInternal(countryCodeInput, vatNumberInput, null, false)
  }

  /**
   * Audit check at order placement — includes seller requester VAT when configured
   * to obtain EU consultation number (`requestIdentifier`).
   */
  async validateVatForAudit(
    countryCodeInput: string,
    vatNumberInput: string,
    requesterInput?: string | ViesRequester | null,
  ): Promise<ViesValidationResult> {
    const requester =
      typeof requesterInput === 'string'
        ? parseEuVatId(requesterInput)
        : requesterInput ?? null
    return this.validateVatInternal(countryCodeInput, vatNumberInput, requester, true)
  }

  private async validateVatInternal(
    countryCodeInput: string,
    vatNumberInput: string,
    requester: ViesRequester | null,
    audit: boolean,
  ): Promise<ViesValidationResult> {
    const countryCode = normalizeCountryCode(countryCodeInput)
    const vatNumber = normalizeVatNumber(countryCode, vatNumberInput)

    if (countryCode.length !== 2 || !vatNumber) {
      return {
        valid: false,
        countryCode,
        vatNumber,
        message: 'Невірний формат IČ DPH. Вкажіть код країни (2 букви) та номер.',
        source: 'unavailable',
      }
    }

    const key = this.cacheKey(countryCode, vatNumber, audit)
    const cached = await this.redis.client.get(key).catch(() => null)
    if (cached) {
      try {
        return JSON.parse(cached) as ViesValidationResult
      } catch {
        // ignore corrupt cache entry, fall through to live check
      }
    }

    const result = await this.callViesRestApi(countryCode, vatNumber, requester, audit)

    await this.redis.client
      .set(key, JSON.stringify(result), 'EX', VIES_CACHE_TTL_SECONDS)
      .catch((err) => this.logger.debug(`Не вдалося закешувати результат VIES: ${String(err)}`))

    return result
  }

  private async callViesRestApi(
    countryCode: string,
    vatNumber: string,
    requester: ViesRequester | null,
    audit: boolean,
  ): Promise<ViesValidationResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VIES_REQUEST_TIMEOUT_MS)

    const body: Record<string, string> = { countryCode, vatNumber }
    if (audit && requester?.countryCode && requester.vatNumber) {
      body.requesterMemberStateCode = requester.countryCode
      body.requesterNumber = requester.vatNumber
    }

    try {
      const response = await fetch(VIES_REST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        this.logger.warn(`VIES відповів статусом ${response.status} для ${countryCode}${vatNumber}.`)
        return {
          valid: null,
          countryCode,
          vatNumber,
          message: 'Сервіс VIES тимчасово недоступний. Перевірку не виконано.',
          source: 'unavailable',
          requesterCountryCode: requester?.countryCode ?? null,
          requesterVatNumber: requester?.vatNumber ?? null,
        }
      }

      const data = (await response.json()) as {
        isValid?: boolean
        valid?: boolean
        name?: string
        address?: string
        requestDate?: string
        requestIdentifier?: string
      }

      const valid = data.isValid ?? data.valid ?? null
      const usedAudit = audit && Boolean(requester?.countryCode && requester?.vatNumber)
      return {
        valid: typeof valid === 'boolean' ? valid : null,
        countryCode,
        vatNumber,
        name: data.name?.trim() || null,
        address: data.address?.trim() || null,
        checkedAt: data.requestDate,
        requestIdentifier: data.requestIdentifier?.trim() || null,
        requesterCountryCode: requester?.countryCode ?? null,
        requesterVatNumber: requester?.vatNumber ?? null,
        source: usedAudit ? 'vies_rest_audit' : 'vies_rest',
        rawResponse: data as Record<string, unknown>,
        message:
          valid === true
            ? 'IČ DPH дійсний.'
            : valid === false
              ? 'IČ DPH не знайдено в реєстрі VIES.'
              : 'Не вдалося визначити статус IČ DPH.',
      }
    } catch (err) {
      this.logger.warn(`VIES недоступний (${String(err)}) — soft-degrade для ${countryCode}${vatNumber}.`)
      return {
        valid: null,
        countryCode,
        vatNumber,
        message: 'Сервіс VIES тимчасово недоступний. Перевірку не виконано.',
        source: 'unavailable',
        requesterCountryCode: requester?.countryCode ?? null,
        requesterVatNumber: requester?.vatNumber ?? null,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}
