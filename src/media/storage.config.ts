import { join, resolve } from 'path'

import type { ConfigService } from '@nestjs/config'

/** Monorepo default: green-angels-project/data/uploads */
const DEFAULT_UPLOAD_ROOT = join(process.cwd(), '..', 'data', 'uploads')

/** Sibling of uploads for private Order PDFs (not served publicly). */
const DEFAULT_PRIVATE_ROOT = join(process.cwd(), '..', 'data', 'private')

export function getUploadRoot(config?: ConfigService): string {
  const configured =
    config?.get<string>('UPLOAD_ROOT')?.trim() || process.env.UPLOAD_ROOT?.trim()
  return resolve(configured || DEFAULT_UPLOAD_ROOT)
}

export function getPrivateStorageRoot(config?: ConfigService): string {
  const configured =
    config?.get<string>('PRIVATE_STORAGE_ROOT')?.trim() ||
    process.env.PRIVATE_STORAGE_ROOT?.trim()
  if (configured) return resolve(configured)
  return resolve(DEFAULT_PRIVATE_ROOT)
}

export function getEstimatePhotosRoot(config?: ConfigService): string {
  const configured =
    config?.get<string>('PHOTO_STORAGE_ROOT')?.trim() ||
    process.env.PHOTO_STORAGE_ROOT?.trim()
  if (configured) return resolve(configured)
  return join(getUploadRoot(config), 'estimate-photos')
}
