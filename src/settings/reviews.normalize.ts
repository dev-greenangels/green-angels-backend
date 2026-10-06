import { BadRequestException } from '@nestjs/common'

import type { AppLocale } from './localization.types'
import { SUPPORTED_LOCALES } from './localization.types'
import {
  DEFAULT_REVIEWS_SETTINGS,
  REVIEW_REQUEST_TEMPLATE_VARS,
  type ReviewRequestEmailTemplate,
  type ReviewsSettings,
} from './reviews.types'

const ALLOWED_VARS = new Set<string>(REVIEW_REQUEST_TEMPLATE_VARS)

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function extractTemplateVars(text: string): string[] {
  const found = new Set<string>()
  const re = /\{\{(\w+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) != null) {
    found.add(match[1])
  }
  return [...found]
}

function assertTemplateVars(label: string, text: string) {
  for (const key of extractTemplateVars(text)) {
    if (!ALLOWED_VARS.has(key)) {
      throw new BadRequestException(
        `Шаблон ${label}: невідома змінна {{${key}}}. Дозволено: ${[...ALLOWED_VARS].join(', ')}.`,
      )
    }
  }
}

function normalizeTemplate(
  raw: unknown,
  fallback: ReviewRequestEmailTemplate,
  options: { strict: boolean; locale: AppLocale },
): ReviewRequestEmailTemplate {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const subject = asTrimmedString(row.subject) || (options.strict ? '' : fallback.subject)
  const body = asTrimmedString(row.body) || (options.strict ? '' : fallback.body)

  if (options.strict) {
    if (!subject) {
      throw new BadRequestException(`Тема листа для мови «${options.locale}» не може бути порожньою.`)
    }
    if (!body) {
      throw new BadRequestException(`Текст листа для мови «${options.locale}» не може бути порожнім.`)
    }
    assertTemplateVars(`${options.locale}.subject`, subject)
    assertTemplateVars(`${options.locale}.body`, body)
  }

  return {
    subject: subject.slice(0, 300),
    body: body.slice(0, 8000),
  }
}

function normalizeTemplates(
  raw: unknown,
  options: { strict: boolean },
): ReviewsSettings['requestEmailTemplates'] {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: ReviewsSettings['requestEmailTemplates'] = {}
  for (const locale of [...SUPPORTED_LOCALES]) {
    const fallback =
      DEFAULT_REVIEWS_SETTINGS.requestEmailTemplates[locale] ??
      DEFAULT_REVIEWS_SETTINGS.requestEmailTemplates.en!
    // In strict save mode every locale must be present and valid (defaults fill missing keys first).
    const source = row[locale] ?? fallback
    out[locale] = normalizeTemplate(source, fallback, { strict: options.strict, locale })
  }
  return out
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const floored = Math.floor(n)
  if (floored < min || floored > max) return fallback
  return floored
}

function requireInt(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new BadRequestException(`${label} має бути цілим числом.`)
  }
  if (n < min || n > max) {
    throw new BadRequestException(`${label} має бути в діапазоні ${min}–${max}.`)
  }
  return n
}

/** Soft normalize for reads — fills defaults, clamps ranges, never throws on empty DB. */
export function normalizeReviewsSettings(raw: unknown): ReviewsSettings {
  const base =
    raw && typeof raw === 'object'
      ? ({ ...DEFAULT_REVIEWS_SETTINGS, ...raw } as ReviewsSettings)
      : { ...DEFAULT_REVIEWS_SETTINGS }

  return {
    postPurchaseRequestsEnabled: base.postPurchaseRequestsEnabled !== false,
    automaticSendingEnabled: base.automaticSendingEnabled === true,
    trigger: 'SHIPPED_PLUS_DELAY',
    delayDays: clampInt(base.delayDays, 1, 60, DEFAULT_REVIEWS_SETTINGS.delayDays),
    tokenValidityDays: clampInt(
      base.tokenValidityDays,
      7,
      365,
      DEFAULT_REVIEWS_SETTINGS.tokenValidityDays,
    ),
    requestEmailTemplates: normalizeTemplates(base.requestEmailTemplates, { strict: false }),
  }
}

/** Strict normalize for PATCH — rejects invalid ranges/vars/empty templates. */
export function normalizeReviewsSettingsStrict(raw: unknown): ReviewsSettings {
  const base =
    raw && typeof raw === 'object'
      ? ({ ...DEFAULT_REVIEWS_SETTINGS, ...raw } as ReviewsSettings)
      : { ...DEFAULT_REVIEWS_SETTINGS }

  return {
    postPurchaseRequestsEnabled: base.postPurchaseRequestsEnabled !== false,
    automaticSendingEnabled: base.automaticSendingEnabled === true,
    trigger: 'SHIPPED_PLUS_DELAY',
    delayDays: requireInt(base.delayDays, 1, 60, 'delayDays'),
    tokenValidityDays: requireInt(base.tokenValidityDays, 7, 365, 'tokenValidityDays'),
    requestEmailTemplates: normalizeTemplates(
      {
        ...DEFAULT_REVIEWS_SETTINGS.requestEmailTemplates,
        ...(base.requestEmailTemplates ?? {}),
      },
      { strict: true },
    ),
  }
}
