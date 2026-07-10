import { Injectable, Logger } from '@nestjs/common'

import { NovaPoshtaSettingsService } from './nova-poshta.settings.service'
import type { NpApiResponse } from './nova-poshta.types'

const REQUEST_TIMEOUT_MS = 60_000
const RATE_LIMIT_RETRY_DELAY_MS = 60_000
const RATE_LIMIT_MAX_RETRIES = 5
const ERROR_SNIPPET_MAX = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitMessage(message: string): boolean {
  return /many requests/i.test(message)
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractHtmlErrorSummary(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]
  const parts = [h1, h2]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => stripHtml(part))
    .filter(Boolean)
  return parts.length ? parts.join(' — ') : null
}

function truncate(value: string, max = ERROR_SNIPPET_MAX): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function formatJsonApiErrors(json: NpApiResponse<unknown>): string | null {
  const errors = Array.isArray(json.errors)
    ? json.errors.map((item) => String(item).trim()).filter(Boolean)
    : []
  const warnings = Array.isArray(json.warnings)
    ? json.warnings.map((item) => String(item).trim()).filter(Boolean)
    : []

  if (!errors.length && !warnings.length) return null

  const parts: string[] = []
  if (errors.length) parts.push(errors.join('; '))
  if (warnings.length) parts.push(`пояснення: ${warnings.join('; ')}`)
  return parts.join(' — ')
}

function buildNpFailureMessage(
  status: number,
  json: NpApiResponse<unknown> | null,
  bodyText: string,
): string {
  if (json) {
    const fromJson = formatJsonApiErrors(json)
    if (fromJson) return `HTTP ${status}: ${fromJson}`
  }

  const looksLikeHtml =
    /<!DOCTYPE/i.test(bodyText) || /<html[\s>]/i.test(bodyText) || /<h1[\s>]/i.test(bodyText)
  if (looksLikeHtml) {
    const summary = extractHtmlErrorSummary(bodyText)
    if (summary) return `HTTP ${status}: ${summary}`
  }

  const snippet = truncate(stripHtml(bodyText) || bodyText)
  if (snippet) return `HTTP ${status}: ${snippet}`

  return `Nova Poshta API request failed (HTTP ${status})`
}

/** NP list endpoints return records in `data`; `info` is metadata only (e.g. totalCount). */
export function normalizeNpListData<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

function normalizeNpInfo(info: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(info)) {
    return info.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object' && !Array.isArray(item),
    )
  }
  if (info !== null && typeof info === 'object') {
    return [info as Record<string, unknown>]
  }
  return []
}

@Injectable()
export class NovaPoshtaClient {
  private readonly logger = new Logger(NovaPoshtaClient.name)

  constructor(private readonly settings: NovaPoshtaSettingsService) {}

  async call<T>(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, string | number> = {},
  ): Promise<{ data: T; info: Array<Record<string, unknown>> }> {
    let attempt = 0

    while (true) {
      try {
        return await this.requestOnce<T>(modelName, calledMethod, methodProperties)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!isRateLimitMessage(message) || attempt >= RATE_LIMIT_MAX_RETRIES) {
          throw error
        }

        attempt += 1
        this.logger.warn(
          `NP ${calledMethod} rate limited, retry ${attempt}/${RATE_LIMIT_MAX_RETRIES} in ${RATE_LIMIT_RETRY_DELAY_MS / 1000}s`,
        )
        await sleep(RATE_LIMIT_RETRY_DELAY_MS)
      }
    }
  }

  private async requestOnce<T>(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, string | number>,
  ): Promise<{ data: T; info: Array<Record<string, unknown>> }> {
    const config = await this.settings.getSettings()
    const apiKey = config.apiKey.trim()
    const jsonApiUrl = config.jsonApiUrl.trim()
    if (!apiKey) {
      throw new Error('Nova Poshta API key is not configured')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(jsonApiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          modelName,
          calledMethod,
          methodProperties,
        }),
        signal: controller.signal,
      })

      const bodyText = await response.text()
      let json: NpApiResponse<T> | null = null
      try {
        json = bodyText.trim() ? (JSON.parse(bodyText) as NpApiResponse<T>) : null
      } catch {
        json = null
      }

      if (!response.ok || !json?.success) {
        const message = buildNpFailureMessage(
          response.status,
          json as NpApiResponse<unknown> | null,
          bodyText,
        )
        this.logger.error(
          `NP ${calledMethod} failed: ${message} (model=${modelName}, keyLen=${apiKey.length})`,
        )
        throw new Error(message)
      }

      return { data: json.data, info: normalizeNpInfo(json.info) }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Nova Poshta API timeout (${calledMethod})`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  extractTotalCount(info: unknown): number | null {
    for (const item of normalizeNpInfo(info)) {
      const total = item.totalCount ?? item.TotalCount
      if (typeof total === 'number') return total
      if (typeof total === 'string' && total.trim()) {
        const parsed = Number(total)
        if (Number.isFinite(parsed)) return parsed
      }
    }
    return null
  }
}
