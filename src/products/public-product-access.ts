import type { SessionJwtPayload } from '../auth/auth.constants'

/** True when OptionalBackstageJwtAuthGuard validated a backstage session. */
export function isBackstageStaffRequest(user?: SessionJwtPayload | null): boolean {
  return user?.role === 'admin' && user.v === 1
}

/**
 * Unauthenticated catalog callers may only list published products.
 * Backstage may omit the filter (all) or pass published=true|false.
 */
export function resolveProductListPublishedParam(
  queryPublished: string | undefined,
  isBackstage: boolean,
): string | undefined {
  if (isBackstage) return queryPublished
  return 'true'
}

/** Public GET /products/:id never uses edit/strict-locale mode. */
export function resolveProductDetailEditMode(
  editQuery: string | undefined,
  isBackstage: boolean,
): boolean {
  if (!isBackstage) return false
  return editQuery === '1' || editQuery === 'true'
}
