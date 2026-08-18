export type MediaWatermarkSettings = {
  productPhotosEnabled: boolean
  freshPhotosEnabled: boolean
}

export const DEFAULT_MEDIA_WATERMARK_SETTINGS: MediaWatermarkSettings = {
  productPhotosEnabled: false,
  freshPhotosEnabled: false,
}

export function normalizeMediaWatermarkSettings(
  input: Partial<MediaWatermarkSettings> | null | undefined,
): MediaWatermarkSettings {
  return {
    productPhotosEnabled:
      typeof input?.productPhotosEnabled === 'boolean'
        ? input.productPhotosEnabled
        : DEFAULT_MEDIA_WATERMARK_SETTINGS.productPhotosEnabled,
    freshPhotosEnabled:
      typeof input?.freshPhotosEnabled === 'boolean'
        ? input.freshPhotosEnabled
        : DEFAULT_MEDIA_WATERMARK_SETTINGS.freshPhotosEnabled,
  }
}
