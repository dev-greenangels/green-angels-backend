export type MediaDriver = 'local' | 'r2'

export type MediaDriverResolution = {
  driver: MediaDriver
  keepLocal: boolean
}

/**
 * Production always uses R2 and never dual-writes the VPS disk.
 * Local/dev may use MEDIA_DRIVER=local (default) or r2 with optional MEDIA_KEEP_LOCAL.
 */
export function resolveMediaDriver(params: {
  nodeEnv?: string | null
  mediaDriver?: string | null
  keepLocal?: string | null
}): MediaDriverResolution {
  const nodeEnv = (params.nodeEnv ?? '').trim().toLowerCase()
  const requested = (params.mediaDriver ?? '').trim().toLowerCase()
  if (nodeEnv === 'production') {
    return { driver: 'r2', keepLocal: false }
  }
  const driver: MediaDriver = requested === 'r2' ? 'r2' : 'local'
  const keepLocal = driver === 'r2' && (params.keepLocal ?? '').trim() === 'true'
  return { driver, keepLocal }
}
