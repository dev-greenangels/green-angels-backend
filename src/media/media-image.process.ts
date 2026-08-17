import sharp from 'sharp'

export type ProcessedImagePair = {
  main: Buffer
  thumb: Buffer
}

/** Product / Fresh Photo gallery. ~580px PDP column at 2×. */
export const PRODUCT_MAIN_MAX_WIDTH = 1200
export const PRODUCT_MAIN_QUALITY = 70
export const PRODUCT_MAIN_MAX_BYTES = 180 * 1024

/** Catalog cards / gallery strip. */
export const PRODUCT_THUMB_MAX_WIDTH = 480
export const PRODUCT_THUMB_QUALITY = 70
export const PRODUCT_THUMB_MAX_BYTES = 40 * 1024

const WEBP_EFFORT = 6
const MIN_WEBP_QUALITY = 50
const QUALITY_STEP = 8
const WIDTH_STEP = 100

async function encodeWebp(input: Buffer, maxWidth: number, quality: number): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: WEBP_EFFORT })
    .toBuffer()
}

async function toWebp(
  input: Buffer,
  maxWidth: number,
  quality = 82,
  maxBytes?: number,
): Promise<Buffer> {
  let width = maxWidth
  let q = quality
  let encoded = await encodeWebp(input, width, q)
  if (!maxBytes) return encoded

  const floorWidth = Math.max(240, Math.round(maxWidth * 0.5))
  while (encoded.byteLength > maxBytes) {
    if (q - QUALITY_STEP >= MIN_WEBP_QUALITY) {
      q -= QUALITY_STEP
    } else if (width - WIDTH_STEP >= floorWidth) {
      width -= WIDTH_STEP
      q = quality
    } else {
      break
    }
    encoded = await encodeWebp(input, width, q)
  }
  return encoded
}

export async function processCategoryImage(buffer: Buffer): Promise<ProcessedImagePair> {
  const [main, thumb] = await Promise.all([toWebp(buffer, 960), toWebp(buffer, 320, 78)])
  return { main, thumb }
}

export async function processProductImage(buffer: Buffer): Promise<ProcessedImagePair> {
  const [main, thumb] = await Promise.all([
    toWebp(buffer, PRODUCT_MAIN_MAX_WIDTH, PRODUCT_MAIN_QUALITY, PRODUCT_MAIN_MAX_BYTES),
    toWebp(buffer, PRODUCT_THUMB_MAX_WIDTH, PRODUCT_THUMB_QUALITY, PRODUCT_THUMB_MAX_BYTES),
  ])
  return { main, thumb }
}

/** Full-size Fresh Photo for gallery / lightbox. Same caps as product `main.webp`. */
export async function encodeFreshPhotoMain(buffer: Buffer): Promise<Buffer> {
  return toWebp(buffer, PRODUCT_MAIN_MAX_WIDTH, PRODUCT_MAIN_QUALITY, PRODUCT_MAIN_MAX_BYTES)
}

/** Card / strip thumb; pass watermarked main to keep logo consistent. */
export async function encodeFreshPhotoThumb(buffer: Buffer): Promise<Buffer> {
  return toWebp(buffer, PRODUCT_THUMB_MAX_WIDTH, PRODUCT_THUMB_QUALITY, PRODUCT_THUMB_MAX_BYTES)
}

export async function processBlogImage(buffer: Buffer): Promise<ProcessedImagePair> {
  const [main, thumb] = await Promise.all([toWebp(buffer, 1200), toWebp(buffer, 480, 78)])
  return { main, thumb }
}
