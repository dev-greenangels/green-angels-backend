import { Injectable, Logger } from '@nestjs/common'

import { FlexiClient } from './flexi.client'
import { FlexiFullRefreshService } from './flexi-full-refresh.service'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiService } from './flexi.service'
import { FlexiSettingsService } from './flexi.settings.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'

export type FlexiAutoSyncResult = {
  ok: boolean
  message: string
  webhookAccepting?: boolean
  baseline?: number
}

/**
 * Auto Sync ON/OFF for ABRA → SITE only (not SITE → ABRA exports).
 *
 * Enable WITHOUT update (strict):
 * 1. webhookAccepting=false
 * 2. tip = O(1) current globalVersion (no history walk / no OFF catch-up)
 * 3. persist globalVersion=tip BEFORE any poll can run
 * 4. register webhook with lastVersion=tip (delete+recreate), setAccepting=false
 * 5. short race bridge FROM tip only (registration gap) — never OFF-period
 * 6. webhookAccepting=true
 */
@Injectable()
export class FlexiAutoSyncService {
  private readonly logger = new Logger(FlexiAutoSyncService.name)

  constructor(
    private readonly flexi: FlexiService,
    private readonly client: FlexiClient,
    private readonly settings: FlexiSettingsService,
    private readonly queue: FlexiQueueService,
    private readonly fullRefresh: FlexiFullRefreshService,
    private readonly lock: FlexiSyncLockService,
    private readonly ops: FlexiOperationLogService,
  ) {}

  async disableAutoSync(opts?: { initiatedBy?: string }): Promise<FlexiAutoSyncResult> {
    const started = Date.now()
    const log = await this.ops.start('AUTO_SYNC_DISABLE', { initiatedBy: opts?.initiatedBy })
    try {
      const disabled = await this.flexi.disableWebhook()
      await this.settings.updateSettings({
        webhookAccepting: false,
      })
      await this.queue.rebuildRepeatableJobs()
      const message = disabled.message
      await this.ops.finish(log.id, {
        status: disabled.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
        detail: message,
        webhookAccepting: false,
        error: disabled.ok ? undefined : message,
      })
      return { ok: disabled.ok, message, webhookAccepting: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.ops.finish(log.id, {
        status: 'error',
        durationMs: Date.now() - started,
        error: message,
        webhookAccepting: false,
      })
      return { ok: false, message }
    }
  }

  async enableWithoutUpdate(opts?: { initiatedBy?: string }): Promise<FlexiAutoSyncResult> {
    const owner = `enable-no-update:${opts?.initiatedBy ?? 'admin'}:${Date.now()}`
    const locked = await this.lock.withLock(owner, async () => {
      const started = Date.now()
      const log = await this.ops.start('ENABLE_WITHOUT_UPDATE', {
        initiatedBy: opts?.initiatedBy,
        detail: 'source=ENABLE_WITHOUT_UPDATE; no OFF-period catch-up',
      })
      try {
        // Stop inbound poll before baseline move.
        await this.settings.updateSettings({ webhookAccepting: false })
        await this.queue.rebuildRepeatableJobs()

        // O(1) tip — MUST NOT walk Changes history (that previously hung + mid-exited).
        const tip = await this.client.fetchCurrentGlobalVersion()
        let baseline = tip
        await this.settings.updateSettings({ globalVersion: baseline })

        // Register at tip without flipping accepting (caller controls accept).
        const registered = await this.flexi.registerWebhook({
          lastVersion: baseline,
          setAccepting: false,
        })
        if (!registered.ok) {
          await this.settings.updateSettings({ webhookAccepting: false })
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: registered.message,
            webhookAccepting: false,
          })
          return { ok: false, message: registered.message, webhookAccepting: false, baseline }
        }

        // Registration-gap only (max a few pages). Must not refresh OFF-period entities.
        const postGap = await this.fullRefresh.runRaceBridge(baseline, { maxPages: 20 })
        if (!postGap.ok) {
          await this.settings.updateSettings({ webhookAccepting: false })
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: postGap.message,
            webhookAccepting: false,
            detail: `source=RACE_BRIDGE; ${postGap.message}`,
          })
          return { ok: false, message: postGap.message, webhookAccepting: false }
        }
        baseline = postGap.baselineAfter

        await this.settings.updateSettings({
          globalVersion: baseline,
          webhookAccepting: true,
        })
        await this.queue.rebuildRepeatableJobs()

        const message = `Увімкнено без оновлення. Baseline=${baseline}. OFF-period не наздоганявся. ${registered.message}`
        await this.ops.finish(log.id, {
          status: 'ok',
          durationMs: Date.now() - started,
          detail: `source=ENABLE_WITHOUT_UPDATE; baseline=${baseline}; bridge=${postGap.bridgeRefreshed}`,
          webhookAccepting: true,
        })
        return { ok: true, message, webhookAccepting: true, baseline }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.settings.updateSettings({ webhookAccepting: false })
        await this.ops.finish(log.id, {
          status: 'error',
          durationMs: Date.now() - started,
          error: message,
          webhookAccepting: false,
        })
        return { ok: false, message, webhookAccepting: false }
      }
    })
    if (!locked.ok) return { ok: false, message: locked.message }
    return locked.result
  }

  async updateAndEnable(opts?: { initiatedBy?: string }): Promise<FlexiAutoSyncResult> {
    const started = Date.now()
    const log = await this.ops.start('UPDATE_AND_ENABLE', { initiatedBy: opts?.initiatedBy })

    await this.settings.updateSettings({ webhookAccepting: false })
    await this.queue.rebuildRepeatableJobs()

    const refresh = await this.fullRefresh.runAuthoritative({
      initiatedBy: opts?.initiatedBy,
      includeOrders: true,
      advanceBaseline: true,
    })

    if (!refresh.ok) {
      await this.ops.finish(log.id, {
        status: 'error',
        durationMs: Date.now() - started,
        error: refresh.message,
        webhookAccepting: false,
        detail: 'source=FULL_REFRESH; failed — Auto Sync remains OFF.',
      })
      return {
        ok: false,
        message: `Оновлення не вдалося — автоматичну синхронізацію НЕ увімкнено. ${refresh.message}`,
        webhookAccepting: false,
      }
    }

    let baseline = refresh.baselineAfter ?? (await this.settings.getSettings()).globalVersion

    const registered = await this.flexi.registerWebhook({
      lastVersion: baseline,
      setAccepting: false,
    })
    const postGap = await this.fullRefresh.runRaceBridge(baseline, { maxPages: 50 })
    if (postGap.ok) {
      baseline = postGap.baselineAfter
    }

    if (!registered.ok || !postGap.ok) {
      await this.settings.updateSettings({ webhookAccepting: false, globalVersion: baseline })
      await this.queue.rebuildRepeatableJobs()
      const message = !postGap.ok
        ? `Дані оновлено, але post-register bridge: ${postGap.message}`
        : `Дані оновлено, але webhook: ${registered.message}`
      await this.ops.finish(log.id, {
        status: 'error',
        durationMs: Date.now() - started,
        refreshed: (refresh.bridgeRefreshed ?? 0) + (postGap.bridgeRefreshed ?? 0),
        detail: message,
        webhookAccepting: false,
        error: message,
      })
      return { ok: false, message, webhookAccepting: false, baseline }
    }

    await this.settings.updateSettings({
      webhookAccepting: true,
      globalVersion: baseline,
    })
    await this.queue.rebuildRepeatableJobs()

    const message = `Оновлено й увімкнено. Baseline=${baseline}. ${refresh.message}`
    await this.ops.finish(log.id, {
      status: 'ok',
      durationMs: Date.now() - started,
      refreshed: (refresh.bridgeRefreshed ?? 0) + (postGap.bridgeRefreshed ?? 0),
      detail: `source=UPDATE_AND_ENABLE; ${message}`,
      webhookAccepting: true,
    })

    return { ok: true, message, webhookAccepting: true, baseline }
  }
}
