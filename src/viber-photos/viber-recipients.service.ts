import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '../prisma/prisma.service'

const VIBER_RECIPIENTS_KEY = 'feature.viberPhotoRecipients'

export type ViberRecipient = {
  id: string
  name: string
}

type ViberRecipientsSettings = {
  recipients: ViberRecipient[]
}

function normalizeRecipients(raw: unknown): ViberRecipient[] {
  if (!raw || typeof raw !== 'object') return []
  const recipients = (raw as ViberRecipientsSettings).recipients
  if (!Array.isArray(recipients)) return []
  return recipients
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      if (!id) return null
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
      return { id, name }
    })
    .filter((item): item is ViberRecipient => Boolean(item))
}

@Injectable()
export class ViberRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private envFallback(): ViberRecipient[] {
    const raw = this.config.get<string>('VIBER_USER_IDS')
    if (!raw) return []
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ id, name: id }))
  }

  async list(): Promise<{ recipients: ViberRecipient[] }> {
    const row = await this.prisma.settings.findUnique({ where: { key: VIBER_RECIPIENTS_KEY } })
    if (!row?.value) {
      return { recipients: this.envFallback() }
    }
    try {
      const parsed = JSON.parse(row.value) as unknown
      const recipients = normalizeRecipients(parsed)
      return { recipients: recipients.length > 0 ? recipients : this.envFallback() }
    } catch {
      return { recipients: this.envFallback() }
    }
  }

  async replace(recipients: Array<{ id: string; name?: string }>): Promise<{ recipients: ViberRecipient[] }> {
    const next = normalizeRecipients({ recipients })
    await this.prisma.settings.upsert({
      where: { key: VIBER_RECIPIENTS_KEY },
      create: { key: VIBER_RECIPIENTS_KEY, value: JSON.stringify({ recipients: next }) },
      update: { value: JSON.stringify({ recipients: next }) },
    })
    return { recipients: next }
  }

  async getUserIds(): Promise<string[]> {
    const { recipients } = await this.list()
    return recipients.map((r) => r.id)
  }

  async upsertFromWebhook(id: string, name?: string): Promise<void> {
    const trimmedId = id.trim()
    if (!trimmedId) return
    const { recipients } = await this.list()
    const existing = recipients.find((r) => r.id === trimmedId)
    if (existing) {
      if (name?.trim() && existing.name === existing.id) {
        existing.name = name.trim()
        await this.replace(recipients)
      }
      return
    }
    await this.replace([...recipients, { id: trimmedId, name: name?.trim() || trimmedId }])
  }
}
