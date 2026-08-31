import { randomBytes } from 'crypto'

export function generateContractWithdrawalReference(now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const suffix = randomBytes(3).toString('hex').toUpperCase()
  return `CW-${y}${m}${d}-${suffix}`
}
