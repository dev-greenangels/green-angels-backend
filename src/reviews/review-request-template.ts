import { REVIEW_REQUEST_TEMPLATE_VARS } from '../settings/reviews.types'

export function escapeReviewTemplateValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Plain-text fill — values are NOT HTML-escaped (used for subject/text). */
export function fillReviewRequestTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? ''
  })
}

export function reviewRequestTemplateToHtml(bodyText: string): string {
  return bodyText
    .split('\n')
    .map((line) => `<p>${escapeReviewTemplateValue(line) || '&nbsp;'}</p>`)
    .join('')
}

export function sampleReviewRequestVars(input?: {
  customerName?: string
  orderNumber?: string
  reviewUrl?: string
}): Record<(typeof REVIEW_REQUEST_TEMPLATE_VARS)[number], string> {
  return {
    customerName: input?.customerName?.trim() || 'Ján Novák',
    orderNumber: input?.orderNumber?.trim() || 'ZY-00000001',
    reviewUrl:
      input?.reviewUrl?.trim() ||
      'https://example.com/sk/reviews/request/preview-only-placeholder',
  }
}
