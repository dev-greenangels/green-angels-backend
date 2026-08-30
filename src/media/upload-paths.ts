/** Валідація відносних шляхів зображень, які зберігаються в Postgres. */

export const CATEGORY_IMAGE_PATH_REGEX =
  /^\/uploads\/categories\/(?:pending\/[a-f0-9-]+|[a-f0-9-]{36})(?:\/v\d+)?\/cover\.webp$/i

export const LEGACY_CATEGORY_IMAGE_PATH_REGEX =
  /^\/uploads\/categories\/[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)$/i

export const PRODUCT_IMAGE_PATH_REGEX =
  /^\/uploads\/products\/(?:pending\/[a-f0-9-]+|[a-f0-9-]{36})\/[a-f0-9-]{36}\/main\.webp$/i

export function isValidCategoryImagePath(url: string): boolean {
  const trimmed = url.trim()
  return (
    CATEGORY_IMAGE_PATH_REGEX.test(trimmed) || LEGACY_CATEGORY_IMAGE_PATH_REGEX.test(trimmed)
  )
}

export function isValidProductImagePath(url: string): boolean {
  return PRODUCT_IMAGE_PATH_REGEX.test(url.trim())
}

export function isPendingCategoryPath(url: string): boolean {
  return /^\/uploads\/categories\/pending\/[a-f0-9-]+\/cover\.webp$/i.test(url.trim())
}

export function isPendingProductPath(url: string): boolean {
  return /^\/uploads\/products\/pending\/[a-f0-9-]+\/[a-f0-9-]+\/main\.webp$/i.test(
    url.trim(),
  )
}

export const HOME_HERO_IMAGE_PATH_REGEX =
  /^\/uploads\/settings\/home-hero\/v\d+\/cover\.webp$/i

export function isValidHomeHeroImagePath(url: string): boolean {
  return HOME_HERO_IMAGE_PATH_REGEX.test(url.trim())
}
