import sharp from 'sharp'

export type ProcessedImagePair = {
  main: Buffer
  thumb: Buffer
}

async function toWebp(input: Buffer, maxWidth: number, quality = 82): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer()
}

export async function processCategoryImage(buffer: Buffer): Promise<ProcessedImagePair> {
  const [main, thumb] = await Promise.all([toWebp(buffer, 960), toWebp(buffer, 320, 78)])
  return { main, thumb }
}

export async function processProductImage(buffer: Buffer): Promise<ProcessedImagePair> {
  const [main, thumb] = await Promise.all([toWebp(buffer, 1400), toWebp(buffer, 480, 78)])
  return { main, thumb }
}

/** Full-size Fresh Photo for gallery / lightbox. Same caps as product `main.webp`. */
export async function encodeFreshPhotoMain(buffer: Buffer): Promise<Buffer> {
  return toWebp(buffer, 1400)
}

/** Card / strip thumb; pass watermarked main to keep logo consistent. */
export async function encodeFreshPhotoThumb(buffer: Buffer): Promise<Buffer> {
  return toWebp(buffer, 480, 78)
}

export async function processBlogImage(buffer: Buffer): Promise<ProcessedImagePair> {
  const [main, thumb] = await Promise.all([toWebp(buffer, 1200), toWebp(buffer, 480, 78)])
  return { main, thumb }
}
