import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { isLocalOnlyWebhookUrl } from './flexi-webhook-url'

const HEALTH_KEY = 'integration.flexi.liveOpenFailures'
const MAX_OPEN = 40

export type FlexiLiveOpenFailure = {
  key: string
  at: string
  message: string
}

/**
 * Per-object live refresh failures.
 * - Fail on cenik:123 → Error (openFailures includes cenik:123)
 * - Success on cenik:456 → does NOT clear cenik:123
 * - Success on cenik:123 → removes that key
 * - Authoritative Full Refresh OK → clear all catalog open failures
 */
@Injectable()
export class FlexiInboundHealthService {
  private readonly logger = new Logger(FlexiInboundHealthService.name)

  constructor(private readonly prisma: PrismaService) {}

  async listOpenFailures(): Promise<FlexiLiveOpenFailure[]> {
    return this.read()
  }

  async recordFailure(key: string, message: string): Promise<void> {
    const trimmedKey = key.slice(0, 120)
    const trimmedMsg = message.slice(0, 500)
    const rows = await this.read()
    const next = rows.filter((r) => r.key !== trimmedKey)
    next.push({ key: trimmedKey, at: new Date().toISOString(), message: trimmedMsg })
    await this.write(next.slice(-MAX_OPEN))
  }

  async clearFailure(key: string): Promise<void> {
    const rows = await this.read()
    const next = rows.filter((r) => r.key !== key)
    if (next.length === rows.length) return
    await this.write(next)
  }

  /** After authoritative Full Refresh success — catalog live errors are repaired. */
  async clearAllCatalogFailures(): Promise<void> {
    await this.write([])
  }

  /**
   * UI health for sync processing (open failures / last sync error).
   * Separate from webhook delivery reachability.
   */
  deriveStatus(opts: {
    webhookAccepting: boolean
    openFailures: FlexiLiveOpenFailure[]
    lastSyncStatus?: string
  }): 'healthy' | 'error' | 'disabled' | 'degraded' {
    if (opts.webhookAccepting === false) return 'disabled'
    if (opts.openFailures.length > 0) return 'error'
    if (opts.lastSyncStatus === 'error') return 'degraded'
    return 'healthy'
  }

  /**
   * Webhook delivery channel status — never equal to Auto Sync ON alone.
   */
  deriveWebhookDeliveryStatus(opts: {
    webhookAccepting: boolean
    webhookUrl: string
    webhookRemoteId?: string
    lastWebhookReceivedAt?: string
    lastWebhookTestAt?: string
    webhookLastError?: string
  }):
    | 'off'
    | 'unreachable_url'
    | 'registered_waiting'
    | 'test_only'
    | 'receiving'
    | 'error' {
    if (opts.webhookAccepting === false) return 'off'
    if (!opts.webhookUrl?.trim() || isLocalOnlyWebhookUrl(opts.webhookUrl)) {
      return 'unreachable_url'
    }
    if (opts.webhookLastError) return 'error'
    if (opts.lastWebhookReceivedAt) return 'receiving'
    if (opts.lastWebhookTestAt && opts.webhookRemoteId) return 'test_only'
    if (opts.webhookRemoteId) return 'registered_waiting'
    return 'error'
  }

  private async read(): Promise<FlexiLiveOpenFailure[]> {
    const row = await this.prisma.settings.findUnique({ where: { key: HEALTH_KEY } })
    if (!row?.value?.trim()) return []
    try {
      const parsed = JSON.parse(row.value) as { failures?: FlexiLiveOpenFailure[] }
      return Array.isArray(parsed.failures) ? parsed.failures : []
    } catch {
      return []
    }
  }

  private async write(failures: FlexiLiveOpenFailure[]): Promise<void> {
    try {
      await this.prisma.settings.upsert({
        where: { key: HEALTH_KEY },
        create: { key: HEALTH_KEY, value: JSON.stringify({ failures }) },
        update: { value: JSON.stringify({ failures }) },
      })
    } catch (error) {
      this.logger.warn(
        `inbound health write: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
