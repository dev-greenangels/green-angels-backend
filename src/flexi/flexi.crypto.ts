import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function resolveFlexiSecretsKey(): string | null {
  const explicit = process.env.FLEXI_SECRETS_KEY?.trim()
  if (explicit && explicit.length >= 16) return explicit
  const jwt = process.env.JWT_SECRET?.trim()
  if (jwt && jwt.length >= 32) return jwt
  return null
}

export function encryptSecret(plain: string, keyMaterial: string): string {
  if (!plain) return ''
  if (plain.startsWith(PREFIX)) return plain
  const key = deriveKey(keyMaterial)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(stored: string, keyMaterial: string): string {
  if (!stored) return ''
  if (!stored.startsWith(PREFIX)) return stored
  const payload = stored.slice(PREFIX.length)
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) return ''
  const key = deriveKey(keyMaterial)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX)
}
