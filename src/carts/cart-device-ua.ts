/**
 * Best-effort device class / model from User-Agent.
 * No Client Hints, no extra browser prompts — only the UA already on the request.
 * Never store raw UA on Cart; only normalized class + optional coarse model.
 */

export const CART_DEVICE_CLASSES = ['mobile', 'tablet', 'desktop', 'unknown'] as const
export type CartDeviceClass = (typeof CART_DEVICE_CLASSES)[number]

export type CartDeviceInfo = {
  deviceClass: CartDeviceClass
  /** Coarse model when UA exposes it (often null on modern Safari). */
  deviceModel: string | null
}

export function isCartDeviceClass(value: string): value is CartDeviceClass {
  return (CART_DEVICE_CLASSES as readonly string[]).includes(value)
}

export function normalizeDeviceClass(
  raw: string | null | undefined,
): CartDeviceClass | null {
  const v = raw?.trim().toLowerCase()
  if (!v || !isCartDeviceClass(v)) return null
  return v
}

/** Cap length; strip control chars. Empty → null. */
export function normalizeDeviceModel(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null
  const cleaned = raw
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 80)
  if (!cleaned) return null
  return cleaned
}

function extractAndroidModel(ua: string): string | null {
  // "... Android 13; Pixel 7 Build/..." or "... Android 10; SM-G973F)"
  const m = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|[;)])/i)
  if (!m?.[1]) return null
  let model = m[1].trim()
  if (/^wv$/i.test(model) || /^Linux$/i.test(model)) return null
  // Drop leading "U;" / locale tokens sometimes left in older UAs
  model = model.replace(/^U;\s*/i, '').trim()
  return normalizeDeviceModel(model)
}

function extractDeviceModel(ua: string, deviceClass: CartDeviceClass): string | null {
  // Phone/tablet models only — never invent desktop hardware names.
  if (deviceClass !== 'mobile' && deviceClass !== 'tablet') return null
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return extractAndroidModel(ua)
  return null
}

/**
 * Classify device from UA. Prefer tablet before mobile (iPad / Android tablet).
 */
export function parseUserAgentDevice(
  ua: string | null | undefined,
): CartDeviceInfo {
  const s = ua?.trim()
  if (!s) return { deviceClass: 'unknown', deviceModel: null }

  let deviceClass: CartDeviceClass = 'unknown'

  if (
    /iPad/i.test(s) ||
    /Tablet/i.test(s) ||
    (/Android/i.test(s) && !/Mobile/i.test(s))
  ) {
    deviceClass = 'tablet'
  } else if (
    /iPhone|iPod/i.test(s) ||
    /Android.*Mobile/i.test(s) ||
    /Mobile/i.test(s) ||
    /webOS|BlackBerry|IEMobile|Opera Mini/i.test(s)
  ) {
    deviceClass = 'mobile'
  } else if (/Windows|Macintosh|Mac OS X|Linux|CrOS|X11/i.test(s)) {
    deviceClass = 'desktop'
  }

  return {
    deviceClass,
    deviceModel: extractDeviceModel(s, deviceClass),
  }
}
